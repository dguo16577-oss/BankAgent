package com.asterbank.banking.publiccontent.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Anonymous informational content, independent of customer financial state. */
public final class Content {
  private Content() {}

  public record Link(String label, String route, String description) {}

  public record Feature(String title, String description) {}

  public record Fee(String label, String value, String conditions) {}

  public record Eligibility(String summary, List<String> requirements) {}

  public record Action(String type, String label, String route) {}

  public record CatalogItem(
      String id,
      String slug,
      String category,
      String type,
      String title,
      String shortDescription,
      List<String> tags,
      OffsetDateTime lastUpdatedAt,
      String environment,
      String description,
      List<String> highlights,
      List<Feature> features,
      Eligibility eligibility,
      List<Fee> fees,
      List<String> disclaimers,
      List<String> relatedItemIds,
      List<Action> cta,
      String currency,
      List<String> supportedCurrencies) {}

  public record Section(String heading, List<String> paragraphs, List<String> callouts) {}

  public record Article(
      String id,
      String slug,
      String title,
      String summary,
      String category,
      List<String> tags,
      OffsetDateTime lastUpdatedAt,
      String environment,
      String heading,
      List<Section> sections,
      List<String> relatedArticles) {}

  public record Rate(
      String id,
      String title,
      String kind,
      BigDecimal value,
      String unit,
      String conditions,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record Rates(
      List<Rate> items,
      OffsetDateTime asOf,
      String source,
      String disclaimer,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record Offer(
      String id,
      String title,
      String summary,
      String category,
      OffsetDateTime validFrom,
      OffsetDateTime validUntil,
      String termsSummary,
      String route,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record Card(
      String id,
      String title,
      String description,
      String route,
      String label,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record NavigationSection(String label, List<Link> links) {}

  public record NavigationGroup(
      String id,
      String label,
      String route,
      String description,
      List<NavigationSection> sections) {}

  public record Category(
      String route,
      String title,
      String description,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record CategoryView(
      String route,
      String title,
      String description,
      List<Card> services,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record Navigation(
      List<NavigationGroup> groups,
      List<CategoryView> categories,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record Hero(String eyebrow, String title, String description, List<Link> actions) {}

  public record Notice(String title, String message, Link link) {}

  public record Presentation(
      Hero hero,
      Notice securityNotice,
      List<Card> serviceCategories,
      List<String> featuredIds,
      OffsetDateTime lastUpdatedAt,
      String environment) {}

  public record Home(
      Hero hero,
      List<Card> serviceCategories,
      List<Card> featuredServices,
      List<Card> offers,
      List<Card> insights,
      Notice securityNotice,
      String environment,
      OffsetDateTime lastUpdatedAt,
      Rates rates) {}

  public record SearchHit(
      String id,
      String type,
      String title,
      String summary,
      String route,
      List<String> matchedTerms,
      OffsetDateTime lastUpdatedAt,
      String environment) {}
}
