-- Purpose: new plan prices, and "Day & night rates" listed on every plan
-- (every plan already had it; only Growth's feature list said so).
--
--   Starter ₱999/mo   (₱9,990/yr)
--   Growth  ₱1,799/mo (₱17,990/yr)
--   Pro     ₱3,999/mo (₱39,990/yr)
-- Yearly stays 10× monthly (two months free).
--
-- Invoices already issued keep their amounts; the next invoice of each
-- subscription uses the new price.

update public.plans set monthly_price_centavos = 99900, annual_price_centavos = 999000
where id = 'starter';
update public.plans set monthly_price_centavos = 179900, annual_price_centavos = 1799000
where id = 'growth';
update public.plans set monthly_price_centavos = 399900, annual_price_centavos = 3999000
where id = 'pro';

-- Starter lists it after the court calendar; Growth inherits it ("Everything in Starter").
update public.plans
set features = array_remove(features, 'Day & night rates')
where id <> 'starter';
update public.plans
set features = case
  when array_position(features, 'Court calendar') is not null
    then features[1:array_position(features, 'Court calendar')]
         || 'Day & night rates'::text
         || features[array_position(features, 'Court calendar') + 1:]
  else features || 'Day & night rates'::text
end
where id = 'starter' and not ('Day & night rates' = any (features));
