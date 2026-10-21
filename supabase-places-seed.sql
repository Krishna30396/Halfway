-- Saved places by location, so Search can read them straight from the database.
-- Run once in the Supabase SQL editor, after supabase-place-info.sql. Safe to re-run.
--
-- place_info rows keep everything in `info`; these columns copy the bits Search
-- filters and sorts on. Seeded Hyderabad places (scripts/seed-hyderabad.mjs) use
-- keys like 'g:<google cid>'; places opened from OSM keep their OSM key.
alter table public.place_info add column if not exists lat double precision;
alter table public.place_info add column if not exists lng double precision;
alter table public.place_info add column if not exists category text;
alter table public.place_info add column if not exists rating real;

-- Fill the columns for places saved before this ran.
update public.place_info
   set lat = (info->>'lat')::double precision,
       lng = (info->>'lng')::double precision,
       category = info->>'category',
       rating = (info->>'rating')::real
 where lat is null and info ? 'lat';

create index if not exists place_info_lat_lng_idx on public.place_info (lat, lng);
create index if not exists place_info_category_idx on public.place_info (category);
