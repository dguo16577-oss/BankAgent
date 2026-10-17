package com.asterbank.banking.publiccontent.application;

import com.asterbank.banking.publiccontent.domain.Content.*;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

public interface PublicContentRepository {
  <T> T read(Supplier<T> work);

  List<CatalogItem> catalog(String category, String type, List<String> terms);

  Optional<CatalogItem> catalogItem(String slug);

  List<Article> articles(String category, List<String> terms);

  Optional<Article> article(String slug);

  Rates rates();

  List<Offer> offers();

  List<NavigationGroup> groups();

  List<Category> categories();

  Presentation presentation();

  List<SearchHit> search(List<String> terms);
}
