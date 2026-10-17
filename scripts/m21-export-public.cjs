// One-time development import. Banking Core never executes TypeScript or reads Web artifacts.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/web/node_modules/typescript");
const cache = new Map();
function read(name) {
  const file = path.resolve("apps/web/src/mocks/public", name + ".ts");
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (ref) => read(ref.replace("./", "")),
  });
  return exports;
}
const { publicHome: home, publicNavigation: navigation } = read("fixtures");
const data = {
  catalog: read("catalog").catalog,
  articles: read("support").articles,
  rates: read("rates").rates,
  offers: read("offers").offers,
  groups: navigation.groups,
  categories: navigation.categories.map(({ services, ...c }) => c),
  presentation: {
    hero: home.hero,
    securityNotice: home.securityNotice,
    serviceCategories: home.serviceCategories,
    featuredIds: home.featuredServices.map((c) => c.id),
    ...read("metadata").provenance,
  },
};
fs.mkdirSync("services/banking-core/src/main/resources/demo", {
  recursive: true,
});
const literal = (v) =>
  v == null ? "NULL" : "'" + String(v).replaceAll("'", "''") + "'";
const array = (v) =>
  v == null ? "NULL" : "ARRAY[" + v.map(literal).join(",") + "]::text[]";
const json = (v) => literal(JSON.stringify(v)) + "::jsonb";
const sql = [
  "-- M10 authored public reference content. Local/test only; preserve persisted edits.",
];
function insert(table, columns, values) {
  sql.push(
    `INSERT INTO ${table} (${columns}) VALUES (${values.join(",")}) ON CONFLICT DO NOTHING;`,
  );
}
for (const [order, c] of data.catalog.entries()) {
  const {
    id,
    slug,
    category,
    type,
    title,
    shortDescription,
    tags,
    description,
    currency,
    supportedCurrencies,
    lastUpdatedAt,
    environment,
    fees,
    ...body
  } = c;
  insert(
    "public_catalog",
    "id,slug,category,item_type,title,short_description,tags,description,currency,supported_currencies,body,updated_at,environment,display_order",
    [id, slug, category, type, title, shortDescription]
      .map(literal)
      .concat([
        array(tags),
        literal(description),
        literal(currency),
        array(supportedCurrencies),
        json(body),
        literal(lastUpdatedAt),
        literal(environment),
        order,
      ]),
  );
  fees.forEach((f, n) =>
    insert(
      "public_catalog_fees",
      "catalog_id,display_order,label,value,conditions",
      [literal(id), n, ...[f.label, f.value, f.conditions].map(literal)],
    ),
  );
}
data.articles.forEach((a, n) =>
  insert(
    "public_support",
    "id,slug,title,summary,category,tags,heading,sections,related_articles,updated_at,environment,display_order",
    [a.id, a.slug, a.title, a.summary, a.category]
      .map(literal)
      .concat([
        array(a.tags),
        literal(a.heading),
        json(a.sections),
        array(a.relatedArticles),
        literal(a.lastUpdatedAt),
        literal(a.environment),
        n,
      ]),
  ),
);
insert(
  "public_rate_set",
  "id,as_of,source,disclaimer,updated_at,environment",
  [
    "reference",
    data.rates.asOf,
    data.rates.source,
    data.rates.disclaimer,
    data.rates.lastUpdatedAt,
    data.rates.environment,
  ].map(literal),
);
data.rates.items.forEach((r, n) =>
  insert(
    "public_rates",
    "id,rate_set_id,title,kind,value,unit,conditions,updated_at,environment,display_order",
    [r.id, "reference", r.title, r.kind]
      .map(literal)
      .concat([
        r.value,
        ...[r.unit, r.conditions, r.lastUpdatedAt, r.environment].map(literal),
        n,
      ]),
  ),
);
data.offers.forEach((o, n) =>
  insert(
    "public_offers",
    "id,title,summary,category,valid_from,valid_until,terms_summary,route,updated_at,environment,display_order",
    [
      o.id,
      o.title,
      o.summary,
      o.category,
      o.validFrom,
      o.validUntil,
      o.termsSummary,
      o.route,
      o.lastUpdatedAt,
      o.environment,
    ]
      .map(literal)
      .concat([n]),
  ),
);
data.groups.forEach((g, n) =>
  insert(
    "public_navigation_groups",
    "id,label,route,description,sections,display_order",
    [g.id, g.label, g.route, g.description]
      .map(literal)
      .concat([json(g.sections), n]),
  ),
);
data.categories.forEach((c, n) =>
  insert(
    "public_categories",
    "route,title,description,updated_at,environment,display_order",
    [c.route, c.title, c.description, c.lastUpdatedAt, c.environment]
      .map(literal)
      .concat([n]),
  ),
);
const p = data.presentation;
insert(
  "public_presentation",
  "id,hero,security_notice,featured_ids,updated_at,environment",
  [
    literal("home"),
    json(p.hero),
    json(p.securityNotice),
    array(p.featuredIds),
    literal(p.lastUpdatedAt),
    literal(p.environment),
  ],
);
p.serviceCategories.forEach((c, n) =>
  insert(
    "public_service_categories",
    "id,title,description,route,label,updated_at,environment,display_order",
    [
      c.id,
      c.title,
      c.description,
      c.route,
      c.label,
      c.lastUpdatedAt,
      c.environment,
    ]
      .map(literal)
      .concat([n]),
  ),
);
fs.writeFileSync(
  "services/banking-core/src/main/resources/demo/public-content.sql",
  sql.join("\n") + "\n",
);
fs.mkdirSync("services/banking-core/src/test/resources/public", {
  recursive: true,
});
fs.writeFileSync(
  "services/banking-core/src/test/resources/public/m10-reference.json",
  JSON.stringify({ home, navigation, ...data }, null, 2) + "\n",
);
console.log({
  catalog: data.catalog.length,
  articles: data.articles.length,
  offers: data.offers.length,
  insights: home.insights.length,
});
