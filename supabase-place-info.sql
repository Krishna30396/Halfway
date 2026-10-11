-- Saved Google info (rating, price, photos, menu, reviews) per place, so each
-- place is fetched from SerpApi once and then served to everyone for free.
-- Only the server (service role key) reads and writes this table.
create table if not exists public.place_info (
  place_key  text primary key,
  info       jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.place_info enable row level security;
-- No policies: the anon/public key cannot read or write it; the service role bypasses RLS.
