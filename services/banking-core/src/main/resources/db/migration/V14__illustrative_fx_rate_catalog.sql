-- Demo reference rates only. This migration adds display data, not executable FX quotes.
UPDATE public_rates SET display_order = 7 WHERE id = 'savings';
UPDATE public_rates SET display_order = 8 WHERE id = 'deposit';

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM public_rate_set WHERE id = 'reference') THEN
INSERT INTO public_rates
  (id, rate_set_id, title, kind, value, unit, conditions, updated_at, environment, display_order)
VALUES
  ('jpy-cny', 'reference', 'JPY / CNY', 'FX', 0.0480, 'CNY per JPY', 'Indicative mid-rate example; excludes fees and markup.', '2026-09-27T09:00:00+08:00', 'DEMO', 1),
  ('eur-cny', 'reference', 'EUR / CNY', 'FX', 8.2500, 'CNY per EUR', 'Indicative mid-rate example; excludes fees and markup.', '2026-09-27T09:00:00+08:00', 'DEMO', 2),
  ('gbp-cny', 'reference', 'GBP / CNY', 'FX', 9.5000, 'CNY per GBP', 'Indicative mid-rate example; excludes fees and markup.', '2026-09-27T09:00:00+08:00', 'DEMO', 3),
  ('hkd-cny', 'reference', 'HKD / CNY', 'FX', 0.9100, 'CNY per HKD', 'Indicative mid-rate example; excludes fees and markup.', '2026-09-27T09:00:00+08:00', 'DEMO', 4),
  ('aud-cny', 'reference', 'AUD / CNY', 'FX', 4.6500, 'CNY per AUD', 'Indicative mid-rate example; excludes fees and markup.', '2026-09-27T09:00:00+08:00', 'DEMO', 5),
  ('sgd-cny', 'reference', 'SGD / CNY', 'FX', 5.5400, 'CNY per SGD', 'Indicative mid-rate example; excludes fees and markup.', '2026-09-27T09:00:00+08:00', 'DEMO', 6);
END IF;
END $$;
