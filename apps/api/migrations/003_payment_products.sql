CREATE TABLE payment_products(
  provider text NOT NULL,
  package_id text NOT NULL REFERENCES credit_packages(id),
  product_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider, package_id),
  UNIQUE(provider, product_id)
);
