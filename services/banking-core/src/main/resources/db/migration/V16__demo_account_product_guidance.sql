-- Keep catalog guidance aligned with the available demo actions. This is not a live banking offer.
UPDATE public_catalog
SET description = 'Open a 12-month simulated CNY deposit using funds already held in your demo account. No real bank product is offered.',
    body = jsonb_set(body, '{eligibility,requirements}',
  '["Authenticated customers can open a 12-month demo deposit from an eligible CNY account."]'::jsonb)
WHERE id = 'time-deposit';

UPDATE public_catalog
SET description = 'Open separate zero-balance simulated accounts for supported foreign currencies. No exchange or funding is available yet.',
    supported_currencies = ARRAY['CNY','USD','JPY','EUR','GBP','HKD','AUD','SGD']::text[],
    body = jsonb_set(body, '{eligibility,requirements}',
      '["Authenticated customers can open one zero-balance demo account per supported foreign currency."]'::jsonb)
WHERE id = 'global-currency-account';
