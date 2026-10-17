-- Anonymous reference content is owned exclusively by the Public Content module.
CREATE TABLE public_catalog (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
 item_type TEXT NOT NULL, title TEXT NOT NULL, short_description TEXT NOT NULL,
 tags TEXT[] NOT NULL, description TEXT NOT NULL, currency TEXT,
 supported_currencies TEXT[], body JSONB NOT NULL CHECK(jsonb_typeof(body)='object'),
 updated_at TIMESTAMPTZ NOT NULL, environment TEXT NOT NULL CHECK(environment='DEMO'),
 display_order INTEGER NOT NULL UNIQUE CHECK(display_order>=0)
);
CREATE INDEX public_catalog_category_type ON public_catalog(category,item_type);
CREATE TABLE public_catalog_fees (
 catalog_id TEXT NOT NULL REFERENCES public_catalog(id), display_order INTEGER NOT NULL,
 label TEXT NOT NULL, value TEXT NOT NULL, conditions TEXT NOT NULL,
 PRIMARY KEY(catalog_id,display_order)
);
CREATE TABLE public_support (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL,
 category TEXT NOT NULL, tags TEXT[] NOT NULL, heading TEXT NOT NULL,
 sections JSONB NOT NULL CHECK(jsonb_typeof(sections)='array'), related_articles TEXT[] NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL, environment TEXT NOT NULL CHECK(environment='DEMO'),
 display_order INTEGER NOT NULL UNIQUE CHECK(display_order>=0)
);
CREATE INDEX public_support_category ON public_support(category);
CREATE TABLE public_rate_set (
 id TEXT PRIMARY KEY CHECK(id='reference'), as_of TIMESTAMPTZ NOT NULL,
 source TEXT NOT NULL CHECK(source='DEMO_RATE'), disclaimer TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL, environment TEXT NOT NULL CHECK(environment='DEMO')
);
CREATE TABLE public_rates (
 id TEXT PRIMARY KEY, rate_set_id TEXT NOT NULL REFERENCES public_rate_set(id), title TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('FX','SAVINGS','TIME_DEPOSIT')), value NUMERIC NOT NULL CHECK(value>=0),
 unit TEXT NOT NULL, conditions TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 environment TEXT NOT NULL CHECK(environment='DEMO'), display_order INTEGER NOT NULL UNIQUE
);
CREATE TABLE public_offers (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, category TEXT NOT NULL,
 valid_from TIMESTAMPTZ NOT NULL, valid_until TIMESTAMPTZ NOT NULL CHECK(valid_until>=valid_from),
 terms_summary TEXT NOT NULL, route TEXT NOT NULL CHECK(route LIKE '/%'),
 updated_at TIMESTAMPTZ NOT NULL, environment TEXT NOT NULL CHECK(environment='DEMO'),
 display_order INTEGER NOT NULL UNIQUE
);
CREATE TABLE public_navigation_groups (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, route TEXT NOT NULL, description TEXT NOT NULL,
 sections JSONB NOT NULL CHECK(jsonb_typeof(sections)='array'), display_order INTEGER NOT NULL UNIQUE
);
CREATE TABLE public_categories (
 route TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL, environment TEXT NOT NULL CHECK(environment='DEMO'),
 display_order INTEGER NOT NULL UNIQUE
);
CREATE TABLE public_presentation (
 id TEXT PRIMARY KEY CHECK(id='home'), hero JSONB NOT NULL, security_notice JSONB NOT NULL,
 featured_ids TEXT[] NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 environment TEXT NOT NULL CHECK(environment='DEMO')
);
CREATE TABLE public_service_categories (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, route TEXT NOT NULL,
 label TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 environment TEXT NOT NULL CHECK(environment='DEMO'), display_order INTEGER NOT NULL UNIQUE
);
