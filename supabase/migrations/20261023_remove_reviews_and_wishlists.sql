-- Remove the unused member review and wishlist features.
-- Apply this migration to existing databases after deploying the app update.

drop table if exists public.reviews cascade;
drop table if exists public.wishlists cascade;
