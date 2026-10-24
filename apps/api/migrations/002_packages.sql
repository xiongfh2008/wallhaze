INSERT INTO credit_packages(id,credits,price_minor,currency,label,active) VALUES
  ('starter',100,500,'USD','Starter',true),
  ('creator',500,2000,'USD','Creator',true),
  ('studio',2000,6900,'USD','Studio',true)
ON CONFLICT (id) DO NOTHING;
