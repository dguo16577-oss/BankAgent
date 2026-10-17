-- Intake only: this does not open an account, issue a policy, or move money.
ALTER TABLE product_applications DROP CONSTRAINT product_applications_product_type_check;
ALTER TABLE product_applications ADD CONSTRAINT product_applications_product_type_check
 CHECK (product_type IN ('DEBIT_CARD','CREDIT_CARD','PERSONAL_LOAN','SAVINGS_ACCOUNT','INSURANCE_PRODUCT'));
ALTER TABLE product_applications DROP CONSTRAINT product_applications_check;
ALTER TABLE product_applications ADD CONSTRAINT product_applications_income_check
 CHECK ((product_type IN ('CREDIT_CARD','PERSONAL_LOAN') AND monthly_income IS NOT NULL AND monthly_income BETWEEN 1 AND 10000000)
    OR (product_type NOT IN ('CREDIT_CARD','PERSONAL_LOAN') AND monthly_income IS NULL));
ALTER TABLE application_intents DROP CONSTRAINT application_intents_action_type_check;
ALTER TABLE application_intents ADD CONSTRAINT application_intents_action_type_check
 CHECK (action_type IN ('CARD_APPLICATION_SUBMIT','LOAN_APPLICATION_SUBMIT','PRODUCT_APPLICATION_SUBMIT'));

-- Keep the public demo catalog in sync with the newly available review-only intake.
UPDATE public_catalog
 SET body = jsonb_set(body, '{eligibility,requirements}',
   '["Apply on this page after signing in. Applications are subject to review."]'::jsonb)
 WHERE item_type IN ('SAVINGS_ACCOUNT','INSURANCE_PRODUCT')
   AND body #> '{eligibility,requirements}' = '["Information only; no application is accepted."]'::jsonb;
