package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.publiccontent.adapter.persistence.DemoPublicContentSeed;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.stream.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PublicContentPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final JsonMapper JSON = JsonMapper.builder().build();
  static final JsonNode REFERENCE = loadReference();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static String base;
  static final List<String> ROUTES =
      List.of(
          "/public/home",
          "/public/navigation",
          "/public/catalog",
          "/public/catalog/everyday-account",
          "/public/support/articles",
          "/public/support/articles/lost-card",
          "/public/rates",
          "/public/offers",
          "/public/search?q=card");

  static JsonNode loadReference() {
    try (var in =
        PublicContentPostgreSqlIT.class.getResourceAsStream("/public/m10-reference.json")) {
      return JSON.readTree(in);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    JdbcConnectionDetails connectionDetails() {
      return new JdbcConnectionDetails() {
        public String getJdbcUrl() {
          return POSTGRES.getJdbcUrl();
        }

        public String getUsername() {
          return POSTGRES.getUsername();
        }

        public String getPassword() {
          return POSTGRES.getPassword();
        }

        public String getDriverClassName() {
          return "org.postgresql.Driver";
        }
      };
    }
  }

  static void open(String... profiles) {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles(profiles)
            .run("--server.port=0");
    db = context.getBean(JdbcTemplate.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    open("local", "test");
  }

  @AfterAll
  static void stop() {
    if (context != null) context.close();
    POSTGRES.stop();
  }

  static String encode(String s) {
    return URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
  }

  static List<String> ids(JsonNode items) {
    return items.valueStream().map(i -> i.path("id").asText()).toList();
  }

  static JsonNode normalize(JsonNode node) {
    if (node.isObject()) {
      var out = JSON.createObjectNode();
      for (String key : node.propertyNames())
        if (!node.get(key).isNull()) out.set(key, normalize(node.get(key)));
      return out;
    }
    if (node.isArray()) {
      var out = JSON.createArrayNode();
      node.forEach(n -> out.add(normalize(n)));
      return out;
    }
    if (node.isTextual() && node.asText().matches("\\d{4}-\\d{2}-\\d{2}T.*"))
      return JSON.getNodeFactory()
          .stringNode(OffsetDateTime.parse(node.asText()).toInstant().toString());
    return node;
  }

  static void same(JsonNode actual, JsonNode expected) {
    assertThat(normalize(actual)).isEqualTo(normalize(expected));
  }

  static Stream<String> routes() {
    return ROUTES.stream();
  }

  static Stream<String> catalogSlugs() {
    return REFERENCE.path("catalog").valueStream().map(i -> i.path("slug").asText());
  }

  static Stream<String> articleSlugs() {
    return REFERENCE.path("articles").valueStream().map(i -> i.path("slug").asText());
  }

  static JsonNode item(String kind, String slug) {
    return REFERENCE
        .path(kind)
        .valueStream()
        .filter(i -> i.path("slug").asText().equals(slug))
        .findFirst()
        .orElseThrow();
  }

  static class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(
        String method, String path, Object body, boolean csrf, Map<String, String> headers)
        throws Exception {
      var r =
          HttpRequest.newBuilder(URI.create(base + path))
              .timeout(Duration.ofSeconds(20))
              .header("Content-Type", "application/json");
      headers.forEach(r::header);
      if (csrf)
        cookies.getCookieStore().getCookies().stream()
            .filter(c -> c.getName().equals("XSRF-TOKEN") && !c.hasExpired())
            .findFirst()
            .ifPresent(c -> r.header("X-XSRF-TOKEN", c.getValue()));
      return client.send(
          r.method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
              .build(),
          HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> getResponse(String path) throws Exception {
      return call("GET", path, null, false, Map.of());
    }

    JsonNode get(String path, int status) throws Exception {
      return checked(getResponse(path), status);
    }

    JsonNode checked(HttpResponse<String> r, int code) {
      assertThat(r.statusCode()).as(r.body()).isEqualTo(code);
      return JSON.readTree(r.body());
    }

    String login() throws Exception {
      get("/customer/session", 401);
      checked(
          call(
              "POST",
              "/customer/auth/login",
              Map.of("email", "alex@aster.local", "password", "demo-password"),
              true,
              Map.of()),
          200);
      return get("/customer/session", 200).path("id").asText();
    }

    public void close() {
      client.close();
    }
  }

  @ParameterizedTest
  @MethodSource("routes")
  void everyPublicGetIsAnonymousAndDoesNotCreateSession(String route) throws Exception {
    try (var b = new Browser()) {
      var r = b.getResponse(route);
      b.checked(r, 200);
      assertThat(r.headers().allValues("set-cookie")).isEmpty();
      assertThat(r.headers().firstValue("X-Correlation-Id")).isPresent();
      assertThat(b.cookies.getCookieStore().getCookies()).isEmpty();
    }
  }

  @ParameterizedTest
  @MethodSource("catalogSlugs")
  void eachCatalogDetailMatchesM10(String slug) throws Exception {
    try (var b = new Browser()) {
      var expected = (ObjectNode) item("catalog", slug).deepCopy();
      if (Set.of(
              "flexible-savings",
              "life-insurance",
              "health-insurance",
              "travel-insurance",
              "home-insurance")
          .contains(slug)) {
        ((ArrayNode) expected.path("eligibility").path("requirements"))
            .set(
                0,
                JSON.readTree(
                    "\"Apply on this page after signing in. Applications are subject to review.\""));
      }
      if (slug.equals("time-deposit")) {
        expected.put(
            "description",
            "Open a 12-month simulated CNY deposit using funds already held in your demo account. No real bank product is offered.");
        ((ArrayNode) expected.path("eligibility").path("requirements"))
            .set(
                0,
                JSON.readTree(
                    "\"Authenticated customers can open a 12-month demo deposit from an eligible CNY account.\""));
      }
      if (slug.equals("global-currency-account")) {
        expected.put(
            "description",
            "Open separate zero-balance simulated accounts for supported foreign currencies. No exchange or funding is available yet.");
        expected.set(
            "supportedCurrencies",
            JSON.readTree("[\"CNY\",\"USD\",\"JPY\",\"EUR\",\"GBP\",\"HKD\",\"AUD\",\"SGD\"]"));
        ((ArrayNode) expected.path("eligibility").path("requirements"))
            .set(
                0,
                JSON.readTree(
                    "\"Authenticated customers can open one zero-balance demo account per supported foreign currency.\""));
      }
      if (Set.of("home-mortgage", "overdraft").contains(slug)) {
        ((ArrayNode) expected.path("eligibility").path("requirements"))
            .set(
                0,
                JSON.readTree(
                    "\"Apply on this page after signing in. This request is stored for review and does not approve credit.\""));
      }
      if (Set.of("money-market-investing", "bond-investing", "fund-investing").contains(slug)) {
        ((ArrayNode) expected.path("eligibility").path("requirements"))
            .set(
                0,
                JSON.readTree(
                    "\"Check suitability and review a simulated investment order on this page before confirming.\""));
      }
      same(b.get("/public/catalog/" + slug, 200), expected);
    }
  }

  @ParameterizedTest
  @MethodSource("articleSlugs")
  void eachSupportDetailAndRelatedReferencesMatchM10(String slug) throws Exception {
    try (var b = new Browser()) {
      var detail = b.get("/public/support/articles/" + slug, 200);
      same(detail, item("articles", slug));
      for (var related : detail.path("relatedArticles"))
        assertThat(articleSlugs().toList()).contains(related.asText());
    }
  }

  @Test
  void catalogAndSupportCountsStableOrderAndSummaryProjection() throws Exception {
    try (var b = new Browser()) {
      var c = b.get("/public/catalog", 200).path("items");
      assertThat(ids(c)).hasSize(21).containsExactlyElementsOf(ids(REFERENCE.path("catalog")));
      for (var i : c) {
        assertThat(i.has("description")).isFalse();
        assertThat(i.path("fees").isArray()).isTrue();
      }
      var a = b.get("/public/support/articles", 200).path("items");
      assertThat(ids(a)).hasSize(15).containsExactlyElementsOf(ids(REFERENCE.path("articles")));
      for (var i : a) assertThat(i.has("sections")).isFalse();
      same(b.get("/public/catalog", 200), b.get("/public/catalog", 200));
    }
  }

  @ParameterizedTest
  @CsvSource({"BANKING,CURRENT_ACCOUNT,1", "CARDS,CREDIT_CARD,2", "INSURANCE,CURRENT_ACCOUNT,0"})
  void catalogFiltersAreCombined(String category, String type, int size) throws Exception {
    try (var b = new Browser()) {
      var items =
          b.get("/public/catalog?category=" + category + "&type=" + type, 200).path("items");
      assertThat(items.size()).isEqualTo(size);
      for (var i : items) {
        assertThat(i.path("category").asText()).isEqualTo(category);
        assertThat(i.path("type").asText()).isEqualTo(type);
      }
    }
  }

  @Test
  void catalogSearchIncludesTagsAndIsCaseInsensitiveLiteralSubstring() throws Exception {
    try (var b = new Browser()) {
      var items = b.get("/public/catalog?search=" + encode("CURRENT account"), 200).path("items");
      assertThat(ids(items)).containsExactly("everyday-account", "overdraft");
      assertThat(b.get("/public/catalog?search=%25", 200).path("items").size()).isZero();
      assertThat(b.get("/public/catalog?search=" + encode("' OR 1=1 --"), 200).path("items").size())
          .isZero();
    }
  }

  @Test
  void supportFilterSearchIncludesParagraphsButNotUnindexedHeadings() throws Exception {
    try (var b = new Browser()) {
      var items =
          b.get(
                  "/public/support/articles?category=SECURITY&search=" + encode("known bookmark"),
                  200)
              .path("items");
      assertThat(ids(items)).containsExactly("recognise-phishing");
      assertThat(b.get("/public/support/articles?search=insight", 200).path("items").size())
          .isEqualTo(4);
      assertThat(
              b.get("/public/support/articles?category=CARDS&search=bookmark", 200)
                  .path("items")
                  .size())
          .isZero();
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"/public/catalog/not-real", "/public/support/articles/not-real"})
  void unknownSlugReturnsFrozen404(String route) throws Exception {
    try (var b = new Browser()) {
      assertThat(b.get(route, 404).path("code").asText()).isEqualTo("PUBLIC_CONTENT_NOT_FOUND");
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/public/catalog?category=NOPE",
        "/public/catalog?type=NOPE",
        "/public/support/articles?category=NOPE"
      })
  void invalidEnumIsPublicError(String route) throws Exception {
    try (var b = new Browser()) {
      assertThat(b.get(route, 400).path("code").asText()).isEqualTo("INVALID_PUBLIC_QUERY");
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/public/search?q=",
        "/public/catalog?search=",
        "/public/support/articles?search="
      })
  void maxQueryLengthIsEnforcedWithPublicError(String route) throws Exception {
    try (var b = new Browser()) {
      b.get(route + "a".repeat(200), 200);
      assertThat(b.get(route + "a".repeat(201), 400).path("code").asText())
          .isEqualTo("INVALID_PUBLIC_QUERY");
    }
  }

  @Test
  void ratesPreserveDecimalScaleAndDemoProvenance() throws Exception {
    try (var b = new Browser()) {
      var rates = b.get("/public/rates", 200);
      assertThat(rates.path("items").size()).isEqualTo(9);
      same(rates.path("items").get(0), REFERENCE.path("rates").path("items").get(0));
      same(rates.path("items").get(7), REFERENCE.path("rates").path("items").get(1));
      same(rates.path("items").get(8), REFERENCE.path("rates").path("items").get(2));
      assertThat(rates.path("items").get(1).path("title").asText()).isEqualTo("JPY / CNY");
      assertThat(rates.path("items").get(0).path("value").asText()).isEqualTo("7.1000");
      assertThat(rates.path("source").asText()).isEqualTo("DEMO_RATE");
      assertThat(
              db.queryForObject(
                  "select value from public_rates where id='usd-cny'", java.math.BigDecimal.class))
          .isEqualByComparingTo("7.1000");
    }
  }

  @Test
  void offersHaveAuthoredDatesAndNoInventedExpiryFiltering() throws Exception {
    try (var b = new Browser()) {
      var offers = b.get("/public/offers", 200).path("items");
      same(offers, REFERENCE.path("offers"));
      assertThat(offers.size()).isEqualTo(2);
    }
  }

  @Test
  void homeAndNavigationAreIdenticalToM10AndHaveFourInsights() throws Exception {
    try (var b = new Browser()) {
      var home = b.get("/public/home", 200);
      same(home, REFERENCE.path("home"));
      assertThat(home.path("insights").size()).isEqualTo(4);
      same(b.get("/public/navigation", 200), REFERENCE.path("navigation"));
    }
  }

  @Test
  void derivedHomeAndSearchReadCurrentPersistedContent() throws Exception {
    String title =
        db.queryForObject(
            "select title from public_catalog where id='everyday-account'", String.class);
    try (var b = new Browser()) {
      db.update(
          "update public_catalog set title='Persisted public example' where id='everyday-account'");
      assertThat(b.get("/public/home", 200).path("featuredServices").get(0).path("title").asText())
          .isEqualTo("Persisted public example");
      assertThat(ids(b.get("/public/search?q=Persisted", 200).path("items")))
          .containsExactly("everyday-account");
    } finally {
      db.update("update public_catalog set title=? where id='everyday-account'", title);
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "card",
        "CARD",
        " savings  ",
        "travel card",
        "a",
        "fees",
        "bank",
        "%",
        "' OR 1=1 --",
        "Alex",
        "8821",
        "23842",
        "unknown-m21"
      })
  void searchMatchesM10TokenRulesOrderingAndNoCustomerLeak(String query) throws Exception {
    List<String> terms =
        Arrays.stream(query.toLowerCase(Locale.ROOT).strip().split("\\s+"))
            .filter(s -> !s.isEmpty())
            .toList();
    var expected = new ArrayList<String>();
    for (String kind : List.of("catalog", "articles", "offers"))
      for (var i : REFERENCE.path(kind)) {
        var text =
            (i.path("title").asText()
                    + " "
                    + i.path(kind.equals("catalog") ? "shortDescription" : "summary").asText())
                .toLowerCase(Locale.ROOT);
        if (terms.stream().allMatch(text::contains)) expected.add(i.path("id").asText());
      }
    try (var b = new Browser()) {
      var response = b.get("/public/search?q=" + encode(query), 200);
      assertThat(response.path("query").asText()).isEqualTo(query);
      assertThat(ids(response.path("items"))).containsExactlyElementsOf(expected);
      for (var i : response.path("items")) {
        assertThat(i.path("type").asText()).isIn("CATALOG_ITEM", "SUPPORT_ARTICLE", "OFFER");
        assertThat(i.path("matchedTerms").valueStream().map(JsonNode::asText).toList())
            .containsExactlyElementsOf(terms);
        assertThat(i.path("route").asText()).startsWith("/").doesNotStartWith("/app");
      }
    }
  }

  @Test
  void missingAndBlankSearchAreEmptyAndUnfrozenLimitIsNotInvented() throws Exception {
    try (var b = new Browser()) {
      for (String q : List.of("", "?q=", "?q=%20%20"))
        assertThat(b.get("/public/search" + q, 200).path("items").size()).isZero();
      same(b.get("/public/search?q=a", 200), b.get("/public/search?q=a&limit=1", 200));
      assertThat(b.get("/public/search?q=a", 200).path("items").size()).isGreaterThan(20);
    }
  }

  @Test
  void publicReadsDoNotChangeAnyCustomerOrSessionTable() throws Exception {
    var tables =
        db.queryForList(
            "select tablename from pg_tables where schemaname='public' and tablename not like 'public_%' and tablename<>'flyway_schema_history' order by tablename",
            String.class);
    var before = snapshot(tables);
    try (var b = new Browser()) {
      for (String route : ROUTES) b.get(route, 200);
    }
    assertThat(snapshot(tables)).isEqualTo(before);
  }

  static Map<String, String> snapshot(List<String> tables) {
    var result = new TreeMap<String, String>();
    for (String table : tables)
      result.put(
          table,
          db.queryForObject(
              "select coalesce(jsonb_agg(j order by j::text),'[]'::jsonb)::text from (select "
                  + (table.equals("spring_session")
                      ? "to_jsonb(t) - 'last_access_time' - 'expiry_time'"
                      : "to_jsonb(t)")
                  + " j from "
                  + table
                  + " t) x",
              String.class));
    return result;
  }

  @Test
  void anonymousValidAndExpiredCustomerCookiesGetSamePublicContent() throws Exception {
    try (var anonymous = new Browser();
        var logged = new Browser();
        var invalid = new Browser()) {
      var id = logged.login();
      logged.get("/customer/overview", 200);
      for (String route : ROUTES) same(logged.get(route, 200), anonymous.get(route, 200));
      db.update("update security_sessions set status='EXPIRED' where session_id=?", id);
      var before =
          snapshot(
              List.of(
                  "security_sessions",
                  "security_events",
                  "spring_session",
                  "spring_session_attributes"));
      for (String route : ROUTES) {
        same(logged.get(route, 200), anonymous.get(route, 200));
        var r = invalid.call("GET", route, null, false, Map.of("Cookie", "SESSION=invalid-cookie"));
        same(invalid.checked(r, 200), anonymous.get(route, 200));
      }
      assertThat(
              snapshot(
                  List.of(
                      "security_sessions",
                      "security_events",
                      "spring_session",
                      "spring_session_attributes")))
          .isEqualTo(before);
      logged.get("/customer/accounts", 401);
      anonymous.get("/customer/accounts", 401);
    }
  }

  @Test
  void localCorsAllowsExactOriginWithCredentialsAndRejectsOthers() throws Exception {
    try (var b = new Browser()) {
      var r =
          b.call("GET", "/public/catalog", null, false, Map.of("Origin", "http://localhost:3000"));
      b.checked(r, 200);
      assertThat(r.headers().firstValue("Access-Control-Allow-Origin"))
          .contains("http://localhost:3000");
      assertThat(r.headers().firstValue("Access-Control-Allow-Credentials")).contains("true");
      assertThat(
              b.call(
                      "GET",
                      "/public/catalog",
                      null,
                      false,
                      Map.of("Origin", "https://untrusted.example"))
                  .statusCode())
          .isEqualTo(403);
    }
  }

  @Test
  void migrationAndUniqueSlugConstraints() {
    assertThat(
            db.queryForObject(
                "select count(*) from flyway_schema_history where success", Integer.class))
        .isEqualTo(34);
    assertThat(
            db.queryForObject(
                "select count(*) from pg_tables where schemaname='public' and tablename like 'public_%'",
                Integer.class))
        .isEqualTo(10);
    assertThatThrownBy(
            () ->
                db.update(
                    "update public_catalog set slug='everyday-account' where id='flexible-savings'"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThatThrownBy(
            () ->
                db.update(
                    "update public_support set slug='lost-card' where id='recognise-phishing'"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  }

  @Test
  void unavailableContentUsesPublicErrorAndNoSqlLeak() throws Exception {
    try (var b = new Browser()) {
      db.update("update public_rate_set set disclaimer='secret-sql-marker' where id='reference'");
      db.execute("alter table public_rates rename to unavailable_rates");
      try {
        var r = b.getResponse("/public/rates");
        assertThat(b.checked(r, 500).path("code").asText()).isEqualTo("PUBLIC_CONTENT_UNAVAILABLE");
        assertThat(r.body())
            .doesNotContain(
                "SELECT", "select", "secret-sql-marker", "Exception", "unavailable_rates");
      } finally {
        db.execute("alter table unavailable_rates rename to public_rates");
      }
    } finally {
      db.update(
          "update public_rate_set set disclaimer=? where id='reference'",
          REFERENCE.path("rates").path("disclaimer").asText());
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void actualHandlersMatchAll64ContractOperationsAndMatrix() throws Exception {
    var expected = new HashSet<String>();
    var ids = new HashSet<String>();
    for (String surface : List.of("customer", "public")) {
      Map<String, Object> spec =
          new org.yaml.snakeyaml.Yaml()
              .load(Files.readString(Path.of("../../contracts/openapi/" + surface + ".yaml")));
      for (var path : ((Map<String, Object>) spec.get("paths")).entrySet())
        for (var op : ((Map<String, Object>) path.getValue()).entrySet())
          if (Set.of("get", "post", "put", "patch", "delete").contains(op.getKey())) {
            var id = (String) ((Map<String, Object>) op.getValue()).get("operationId");
            expected.add(op.getKey().toUpperCase(Locale.ROOT) + " " + path.getKey() + " " + id);
            ids.add(id);
          }
    }
    var mappings =
        context.getBean(
            "requestMappingHandlerMapping",
            org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
                .class);
    var actual = new HashSet<String>();
    int customer = 0, publicCount = 0;
    for (var entry : mappings.getHandlerMethods().entrySet())
      for (String path : entry.getKey().getPatternValues())
        if (path.startsWith("/customer/") || path.startsWith("/public/")) {
          if (path.startsWith("/customer/")) customer++;
          else publicCount++;
          for (var verb : entry.getKey().getMethodsCondition().getMethods())
            actual.add(verb.name() + " " + path + " " + entry.getValue().getMethod().getName());
        }
    assertThat(customer).isEqualTo(87);
    assertThat(publicCount).isEqualTo(9);
    assertThat(actual).hasSize(96).containsExactlyInAnyOrderElementsOf(expected);
    var matrix =
        JSON.readTree(Files.readString(Path.of("../../docs/backend/implementation-status.json")));
    assertThat(matrix.propertyNames()).containsExactlyInAnyOrderElementsOf(ids);
    matrix.forEach(v -> assertThat(v.asText()).isEqualTo("IMPLEMENTED_POSTGRESQL"));
  }

  @Test
  @Order(Integer.MAX_VALUE - 1)
  void restartPreservesContentEditsNoDuplicatesAndCustomerFinancialState() throws Exception {
    db.update(
        "update public_catalog set title='Persisted edited title' where id='everyday-account'");
    var all =
        db.queryForList(
            "select tablename from pg_tables where schemaname='public' and (tablename like 'public_%' or tablename in ('accounts','transactions','cards','portfolio_positions','recurring_payments')) order by tablename",
            String.class);
    var before = snapshot(all);
    context.getBean(DemoPublicContentSeed.class).initialize();
    assertThat(snapshot(all)).isEqualTo(before);
    context.close();
    open("local", "test");
    assertThat(snapshot(all)).isEqualTo(before);
    try (var b = new Browser()) {
      assertThat(b.get("/public/catalog/everyday-account", 200).path("title").asText())
          .isEqualTo("Persisted edited title");
    }
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void defaultProfileDoesNotSeedAndRejectsLocalCors() throws Exception {
    context.close();
    open();
    assertThat(context.getBeansOfType(DemoPublicContentSeed.class)).isEmpty();
    try (var b = new Browser()) {
      b.get("/public/catalog", 200);
      assertThat(
              b.call(
                      "GET",
                      "/public/catalog",
                      null,
                      false,
                      Map.of("Origin", "http://localhost:3000"))
                  .statusCode())
          .isEqualTo(403);
    }
    db.execute(
        "TRUNCATE public_catalog,public_support,public_offers,public_rate_set,public_navigation_groups,public_categories,public_presentation,public_service_categories CASCADE");
    context.close();
    open();
    assertThat(db.queryForObject("select count(*) from public_catalog", Integer.class)).isZero();
    assertThat(db.queryForObject("select count(*) from public_support", Integer.class)).isZero();
    try (var b = new Browser()) {
      assertThat(b.get("/public/home", 500).path("code").asText())
          .isEqualTo("PUBLIC_CONTENT_UNAVAILABLE");
    }
  }
}
