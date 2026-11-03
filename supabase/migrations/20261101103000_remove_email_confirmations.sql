-- Purpose: CourtDesk doesn't send booking confirmation emails; businesses
-- contact their players themselves. Drop the promise from every plan's
-- feature list (other edits from Super Admin -> Plans & limits are kept).

update public.plans
set features = array_remove(features, 'Email confirmations')
where 'Email confirmations' = any (features);
