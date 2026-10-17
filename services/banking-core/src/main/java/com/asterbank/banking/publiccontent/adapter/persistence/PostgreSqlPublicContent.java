package com.asterbank.banking.publiccontent.adapter.persistence;

import com.asterbank.banking.publiccontent.application.PublicContentRepository;
import com.asterbank.banking.publiccontent.domain.Content.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** All matching, filtering and ordering happens in PostgreSQL, only on Public-owned tables. */
public final class PostgreSqlPublicContent implements PublicContentRepository {
  private final JdbcTemplate sql;
  private final ObjectMapper json;
  private final TransactionTemplate reads;

  public PostgreSqlPublicContent(
      JdbcTemplate sql, ObjectMapper json, PlatformTransactionManager manager) {
    this.sql = sql;
    this.json = json;
    reads = new TransactionTemplate(manager);
    reads.setReadOnly(true);
    reads.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
  }

  public <T> T read(Supplier<T> action) {
    return reads.execute(s -> action.get());
  }

  private <T> List<T> query(String select, Class<T> type, Object... parameters) {
    return sql.query(select, (r, n) -> json.readValue(r.getString(1), type), parameters);
  }

  private static final String CATALOG =
      """
    SELECT c.body || jsonb_build_object('id',c.id,'slug',c.slug,'category',c.category,'type',c.item_type,
      'title',c.title,'shortDescription',c.short_description,'tags',c.tags,'description',c.description,
      'currency',c.currency,'supportedCurrencies',c.supported_currencies,
      'lastUpdatedAt',c.updated_at,'environment',c.environment,
      'fees',COALESCE((SELECT jsonb_agg(jsonb_build_object('label',f.label,'value',f.value,'conditions',f.conditions)
        ORDER BY f.display_order) FROM public_catalog_fees f WHERE f.catalog_id=c.id),'[]'::jsonb))
    FROM public_catalog c
    """;
  private static final String ARTICLE =
      """
    SELECT jsonb_build_object('id',id,'slug',slug,'title',title,'summary',summary,'category',category,
      'tags',tags,'heading',heading,'sections',sections,'relatedArticles',related_articles,
      'lastUpdatedAt',updated_at,'environment',environment) FROM public_support
    """;

  // Literal substring matching: SQL wildcards in user input have no special meaning.
  private static void match(
      StringBuilder clause, List<Object> args, String text, List<String> terms) {
    for (String term : terms) {
      clause.append(" AND strpos(lower(").append(text).append("),?)>0");
      args.add(term);
    }
  }

  public List<CatalogItem> catalog(String category, String type, List<String> terms) {
    var q = new StringBuilder(CATALOG).append(" WHERE true");
    var args = new ArrayList<Object>();
    if (category != null) {
      q.append(" AND c.category=?");
      args.add(category);
    }
    if (type != null) {
      q.append(" AND c.item_type=?");
      args.add(type);
    }
    match(
        q,
        args,
        "c.title || ' ' || c.short_description || ' ' || array_to_string(c.tags,' ')",
        terms);
    return query(
        q.append(" ORDER BY c.display_order,c.id COLLATE \"C\"").toString(),
        CatalogItem.class,
        args.toArray());
  }

  public Optional<CatalogItem> catalogItem(String slug) {
    return query(CATALOG + " WHERE c.slug=?", CatalogItem.class, slug).stream().findFirst();
  }

  public List<Article> articles(String category, List<String> terms) {
    var q = new StringBuilder(ARTICLE).append(" WHERE true");
    var args = new ArrayList<Object>();
    if (category != null) {
      q.append(" AND category=?");
      args.add(category);
    }
    match(
        q,
        args,
        "title || ' ' || summary || ' ' || array_to_string(tags,' ') || ' ' || COALESCE((SELECT string_agg(p #>> '{}',' ') FROM jsonb_array_elements(sections) s CROSS JOIN LATERAL jsonb_array_elements(s->'paragraphs') p),'')",
        terms);
    return query(
        q.append(" ORDER BY display_order,id COLLATE \"C\"").toString(),
        Article.class,
        args.toArray());
  }

  public Optional<Article> article(String slug) {
    return query(ARTICLE + " WHERE slug=?", Article.class, slug).stream().findFirst();
  }

  public Rates rates() {
    return query(
            """
      SELECT jsonb_build_object('asOf',as_of,'source',source,'disclaimer',disclaimer,
        'lastUpdatedAt',updated_at,'environment',environment,
        'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'kind',r.kind,
          'value',r.value::text,'unit',r.unit,'conditions',r.conditions,'lastUpdatedAt',r.updated_at,
          'environment',r.environment) ORDER BY r.display_order,r.id COLLATE "C") FROM public_rates r WHERE r.rate_set_id=public_rate_set.id),'[]'::jsonb))
      FROM public_rate_set WHERE id='reference'
      """,
            Rates.class)
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("Public rates unavailable"));
  }

  public List<Offer> offers() {
    return query(
        """
      SELECT jsonb_build_object('id',id,'title',title,'summary',summary,'category',category,
        'validFrom',valid_from,'validUntil',valid_until,'termsSummary',terms_summary,'route',route,
        'lastUpdatedAt',updated_at,'environment',environment) FROM public_offers ORDER BY display_order,id COLLATE "C"
      """,
        Offer.class);
  }

  public List<NavigationGroup> groups() {
    return query(
        """
      SELECT jsonb_build_object('id',id,'label',label,'route',route,'description',description,'sections',sections)
      FROM public_navigation_groups ORDER BY display_order,id COLLATE "C"
      """,
        NavigationGroup.class);
  }

  public List<Category> categories() {
    return query(
        """
      SELECT jsonb_build_object('route',route,'title',title,'description',description,'lastUpdatedAt',updated_at,
        'environment',environment) FROM public_categories ORDER BY display_order,route COLLATE "C"
      """,
        Category.class);
  }

  public Presentation presentation() {
    return query(
            """
      SELECT jsonb_build_object('hero',hero,'securityNotice',security_notice,'featuredIds',featured_ids,
        'lastUpdatedAt',updated_at,'environment',environment,'serviceCategories',
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'route',c.route,
          'label',c.label,'lastUpdatedAt',c.updated_at,'environment',c.environment) ORDER BY c.display_order,c.id COLLATE "C")
          FROM public_service_categories c),'[]'::jsonb))
      FROM public_presentation WHERE id='home'
      """,
            Presentation.class)
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("Public presentation unavailable"));
  }

  public List<SearchHit> search(List<String> terms) {
    if (terms.isEmpty()) return List.of();
    var q =
        new StringBuilder(
            """
      SELECT jsonb_build_object('id',id,'type',kind,'title',title,'summary',summary,'route',route,
        'matchedTerms','[]'::jsonb,'lastUpdatedAt',updated_at,'environment',environment) FROM (
        SELECT id,'CATALOG_ITEM' kind,title,short_description summary,'/products/'||slug route,updated_at,environment,0 section_order,display_order FROM public_catalog
        UNION ALL SELECT id,'SUPPORT_ARTICLE',title,summary,'/support/'||slug,updated_at,environment,1,display_order FROM public_support
        UNION ALL SELECT id,'OFFER',title,summary,'/offers#'||id,updated_at,environment,2,display_order FROM public_offers
      ) content WHERE true
      """);
    var args = new ArrayList<Object>();
    match(q, args, "title || ' ' || summary", terms);
    return query(
            q.append(" ORDER BY section_order,display_order,id COLLATE \"C\"").toString(),
            SearchHit.class,
            args.toArray())
        .stream()
        .map(
            h ->
                new SearchHit(
                    h.id(),
                    h.type(),
                    h.title(),
                    h.summary(),
                    h.route(),
                    terms,
                    h.lastUpdatedAt(),
                    h.environment()))
        .toList();
  }
}
