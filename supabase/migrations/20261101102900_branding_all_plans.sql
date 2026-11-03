-- Purpose: custom branding is on every plan. Starter lists it; Growth stops
-- listing it separately (it already has "Everything in Starter"). Edits made
-- in Super Admin -> Plans & limits are kept: only this one item moves.

update public.plans
set features = array_append(features, 'Custom branding')
where id = 'starter' and not ('Custom branding' = any (features));

update public.plans
set features = array_remove(features, 'Custom branding')
where id <> 'starter';
