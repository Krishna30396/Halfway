-- Halfway — Supabase database schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Profiles: extends Supabase auth.users with app-specific preferences
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_radius integer default 5 check (default_radius between 1 and 25),
  preferred_categories text[] default '{restaurant,cafe}',
  theme text default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Saved searches
create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name_a text,
  name_b text,
  hub_name text,
  url text,
  created_at timestamptz default now()
);

alter table saved_searches enable row level security;

create policy "Users can read own searches"
  on saved_searches for select using (auth.uid() = user_id);

create policy "Users can insert own searches"
  on saved_searches for insert with check (auth.uid() = user_id);

create policy "Users can delete own searches"
  on saved_searches for delete using (auth.uid() = user_id);

-- Favorite places
create table if not exists favorite_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  place_osm_id text not null,
  place_name text,
  place_category text,
  lat double precision,
  lng double precision,
  created_at timestamptz default now(),
  unique (user_id, place_osm_id)
);

alter table favorite_places enable row level security;

create policy "Users can read own favorites"
  on favorite_places for select using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on favorite_places for insert with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on favorite_places for delete using (auth.uid() = user_id);
