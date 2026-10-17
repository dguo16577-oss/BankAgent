-- Review-only requests. No credit decision, loan account or funds are created.
ALTER TABLE product_applications DROP CONSTRAINT product_applications_product_type_check;
ALTER TABLE product_applications ADD CONSTRAINT product_applications_product_type_check
  CHECK (product_type IN ('DEBIT_CARD','CREDIT_CARD','PERSONAL_LOAN','MORTGAGE','OVERDRAFT','SAVINGS_ACCOUNT','INSURANCE_PRODUCT'));

ALTER TABLE product_applications DROP CONSTRAINT product_applications_income_check;
ALTER TABLE product_applications ADD CONSTRAINT product_applications_income_check
  CHECK ((product_type IN ('CREDIT_CARD','PERSONAL_LOAN','MORTGAGE','OVERDRAFT')
    AND monthly_income IS NOT NULL AND monthly_income BETWEEN 1 AND 10000000)
    OR (product_type NOT IN ('CREDIT_CARD','PERSONAL_LOAN','MORTGAGE','OVERDRAFT') AND monthly_income IS NULL));

ALTER TABLE product_applications DROP CONSTRAINT product_applications_check1;
ALTER TABLE product_applications ADD CONSTRAINT product_applications_amount_and_term_check CHECK (
  (product_type='PERSONAL_LOAN' AND requested_amount IS NOT NULL AND requested_amount BETWEEN 1000 AND 200000
    AND term_months IS NOT NULL AND term_months IN (6,12,24,36) AND purpose IS NOT NULL AND purpose IN ('EDUCATION','HOME_IMPROVEMENT','PERSONAL'))
  OR (product_type='MORTGAGE' AND requested_amount IS NOT NULL AND requested_amount BETWEEN 100000 AND 5000000
    AND term_months IS NOT NULL AND term_months IN (120,240,360) AND purpose IS NOT NULL AND purpose='HOME_PURCHASE')
  OR (product_type='OVERDRAFT' AND requested_amount IS NOT NULL AND requested_amount BETWEEN 1000 AND 100000
    AND term_months IS NULL AND purpose IS NULL)
  OR (product_type NOT IN ('PERSONAL_LOAN','MORTGAGE','OVERDRAFT')
    AND requested_amount IS NULL AND term_months IS NULL AND purpose IS NULL)
);

UPDATE public_catalog SET body = jsonb_set(body, '{eligibility,requirements}',
  '["Apply on this page after signing in. This request is stored for review and does not approve credit."]'::jsonb)
WHERE item_type IN ('MORTGAGE','OVERDRAFT');

UPDATE public_catalog SET body = jsonb_set(body, '{eligibility,requirements}',
  '["Check suitability and review a simulated investment order on this page before confirming."]'::jsonb)
WHERE item_type='INVESTMENT_PRODUCT';
