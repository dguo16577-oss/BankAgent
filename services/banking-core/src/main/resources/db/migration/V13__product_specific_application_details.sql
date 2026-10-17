-- Review-only intake. Historical applications keep an empty details object.
ALTER TABLE product_applications
  ADD COLUMN application_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE product_applications
  ADD CONSTRAINT product_applications_details_object
  CHECK (jsonb_typeof(application_details) = 'object');
