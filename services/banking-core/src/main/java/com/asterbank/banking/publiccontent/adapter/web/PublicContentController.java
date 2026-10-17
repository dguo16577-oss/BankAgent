package com.asterbank.banking.publiccontent.adapter.web;

import com.asterbank.banking.publiccontent.application.PublicContentService;
import com.asterbank.contract.publicapi.api.PublicApi;
import com.asterbank.contract.publicapi.model.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.*;

@RestController
@Profile("!unit")
public class PublicContentController implements PublicApi {
  private final PublicContentService service;
  private final ObjectMapper mapper;

  public PublicContentController(PublicContentService service, ObjectMapper mapper) {
    this.service = service;
    // Summary projections intentionally omit the domain's detail-only fields.
    this.mapper =
        mapper.rebuild().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
  }

  private <T> ResponseEntity<T> response(Object view, Class<T> type) {
    return ResponseEntity.ok(mapper.convertValue(view, type));
  }

  public ResponseEntity<PublicHome> getPublicHome() {
    return response(service.home(), PublicHome.class);
  }

  public ResponseEntity<PublicNavigation> getPublicNavigation() {
    return response(service.navigation(), PublicNavigation.class);
  }

  public ResponseEntity<PublicRates> getPublicRates() {
    return response(service.rates(), PublicRates.class);
  }

  public ResponseEntity<PublicOffers> listPublicOffers() {
    return response(service.offers(), PublicOffers.class);
  }

  public ResponseEntity<PublicCatalogItemDetail> getPublicCatalogItem(String slug) {
    var item = service.catalogItem(slug);
    var result = mapper.convertValue(item, PublicCatalogItemDetail.class);
    // Generator initializes optional lists; preserve an absent field from the authored model.
    result.setSupportedCurrencies(item.supportedCurrencies());
    return ResponseEntity.ok(result);
  }

  public ResponseEntity<SupportArticleDetail> getSupportArticle(String slug) {
    return response(service.article(slug), SupportArticleDetail.class);
  }

  public ResponseEntity<PublicCatalog> listPublicCatalog(
      PublicCatalogCategory category, PublicCatalogItemType type, String search) {
    return response(
        service.catalog(
            category == null ? null : category.getValue(),
            type == null ? null : type.getValue(),
            search),
        PublicCatalog.class);
  }

  public ResponseEntity<SupportArticles> listSupportArticles(
      SupportCategory category, String search) {
    return response(
        service.articles(category == null ? null : category.getValue(), search),
        SupportArticles.class);
  }

  public ResponseEntity<PublicSearch> searchPublicContent(String q) {
    return response(service.search(q), PublicSearch.class);
  }
}
