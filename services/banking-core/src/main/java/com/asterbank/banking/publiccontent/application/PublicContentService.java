package com.asterbank.banking.publiccontent.application;

import com.asterbank.banking.publiccontent.domain.Content.*;
import java.time.OffsetDateTime;
import java.util.*;

public final class PublicContentService {
  private final PublicContentRepository repository;

  public PublicContentService(PublicContentRepository repository) {
    this.repository = repository;
  }

  public record CollectionView<T>(
      List<T> items, OffsetDateTime lastUpdatedAt, String environment) {}

  public record SearchView(
      List<SearchHit> items, String query, OffsetDateTime lastUpdatedAt, String environment) {}

  private static List<String> terms(String query) {
    if (query == null) return List.of();
    if (query.length() > 200)
      throw new PublicContentFailure(
          "INVALID_PUBLIC_QUERY", 400, "Search must be 200 characters or fewer.");
    return Arrays.stream(query.strip().toLowerCase(Locale.ROOT).split("(?U)\\s+"))
        .filter(s -> !s.isEmpty())
        .toList();
  }

  private <T> CollectionView<T> collection(List<T> items) {
    var p = repository.presentation();
    return new CollectionView<>(items, p.lastUpdatedAt(), p.environment());
  }

  public CollectionView<CatalogItem> catalog(String category, String type, String query) {
    var t = terms(query);
    return repository.read(() -> collection(repository.catalog(category, type, t)));
  }

  public CatalogItem catalogItem(String slug) {
    return repository.read(
        () ->
            repository
                .catalogItem(slug)
                .orElseThrow(
                    () ->
                        new PublicContentFailure(
                            "PUBLIC_CONTENT_NOT_FOUND", 404, "Product or service not found.")));
  }

  public CollectionView<Article> articles(String category, String query) {
    var t = terms(query);
    return repository.read(() -> collection(repository.articles(category, t)));
  }

  public Article article(String slug) {
    return repository.read(
        () ->
            repository
                .article(slug)
                .orElseThrow(
                    () ->
                        new PublicContentFailure(
                            "PUBLIC_CONTENT_NOT_FOUND", 404, "Article not found.")));
  }

  public Rates rates() {
    return repository.read(repository::rates);
  }

  public CollectionView<Offer> offers() {
    return repository.read(() -> collection(repository.offers()));
  }

  public SearchView search(String query) {
    var t = terms(query);
    return repository.read(
        () -> {
          var p = repository.presentation();
          return new SearchView(
              t.isEmpty() ? List.of() : repository.search(t),
              query == null ? "" : query,
              p.lastUpdatedAt(),
              p.environment());
        });
  }

  private static Card card(CatalogItem c) {
    return new Card(
        c.id(),
        c.title(),
        c.shortDescription(),
        "/products/" + c.slug(),
        c.category().replace('_', ' '),
        c.lastUpdatedAt(),
        c.environment());
  }

  private static Card card(Article a) {
    return new Card(
        a.id(),
        a.title(),
        a.summary(),
        "/support/" + a.slug(),
        a.category(),
        a.lastUpdatedAt(),
        a.environment());
  }

  private static Card card(Offer o) {
    return new Card(
        o.id(),
        o.title(),
        o.summary(),
        "/offers#" + o.id(),
        "DEMO CAMPAIGN",
        o.lastUpdatedAt(),
        o.environment());
  }

  public Home home() {
    return repository.read(
        () -> {
          var p = repository.presentation();
          var catalog = repository.catalog(null, null, List.of());
          var featured =
              p.featuredIds().stream()
                  .flatMap(id -> catalog.stream().filter(c -> c.id().equals(id)))
                  .map(PublicContentService::card)
                  .toList();
          var insights =
              repository.articles(null, List.of()).stream()
                  .filter(a -> a.tags().contains("insight"))
                  .map(PublicContentService::card)
                  .toList();
          return new Home(
              p.hero(),
              p.serviceCategories(),
              featured,
              repository.offers().stream().map(PublicContentService::card).toList(),
              insights,
              p.securityNotice(),
              p.environment(),
              p.lastUpdatedAt(),
              teaserRates(repository.rates()));
        });
  }

  private static com.asterbank.banking.publiccontent.domain.Content.Rates teaserRates(
      com.asterbank.banking.publiccontent.domain.Content.Rates rates) {
    return new com.asterbank.banking.publiccontent.domain.Content.Rates(
        rates.items().stream()
            .filter(rate -> List.of("usd-cny", "savings", "deposit").contains(rate.id()))
            .toList(),
        rates.asOf(),
        rates.source(),
        rates.disclaimer(),
        rates.lastUpdatedAt(),
        rates.environment());
  }

  public Navigation navigation() {
    return repository.read(
        () -> {
          var p = repository.presentation();
          var catalog = repository.catalog(null, null, List.of());
          var articles = repository.articles(null, List.of());
          var offers = repository.offers();
          var categories =
              repository.categories().stream()
                  .map(
                      c -> {
                        List<Card> cards =
                            switch (c.route()) {
                              case "/support" ->
                                  articles.stream().map(PublicContentService::card).toList();
                              case "/insights" ->
                                  articles.stream()
                                      .filter(a -> a.tags().contains("insight"))
                                      .map(PublicContentService::card)
                                      .toList();
                              case "/offers" ->
                                  offers.stream().map(PublicContentService::card).toList();
                              default ->
                                  catalog.stream()
                                      .filter(
                                          i ->
                                              i.category()
                                                  .equals(
                                                      c.route()
                                                          .substring(1)
                                                          .toUpperCase(Locale.ROOT)))
                                      .map(PublicContentService::card)
                                      .toList();
                            };
                        return new CategoryView(
                            c.route(),
                            c.title(),
                            c.description(),
                            cards,
                            c.lastUpdatedAt(),
                            c.environment());
                      })
                  .toList();
          return new Navigation(
              repository.groups(), categories, p.lastUpdatedAt(), p.environment());
        });
  }
}
