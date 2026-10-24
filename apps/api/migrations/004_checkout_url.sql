ALTER TABLE payment_orders ADD COLUMN provider_checkout_url text;
ALTER TABLE payment_orders ADD COLUMN provider_checkout_expires_at timestamptz;
