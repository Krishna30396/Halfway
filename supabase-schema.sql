-- Halfway — Supabase database schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Every statement is idempotent, so it is safe to re-run after updates.

-- ============================================================================
-- PROFILES
-- ============================================================================
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

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Usernames so friends can find each other.
alter table profiles add column if not exists username text;
create unique index if not exists profiles_username_key on profiles (lower(username));
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- ============================================================================
-- SAVED SEARCHES & FAVOURITES
-- ============================================================================
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

drop policy if exists "Users can read own searches" on saved_searches;
create policy "Users can read own searches"
  on saved_searches for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own searches" on saved_searches;
create policy "Users can insert own searches"
  on saved_searches for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own searches" on saved_searches;
create policy "Users can delete own searches"
  on saved_searches for delete using (auth.uid() = user_id);

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

drop policy if exists "Users can read own favorites" on favorite_places;
create policy "Users can read own favorites"
  on favorite_places for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own favorites" on favorite_places;
create policy "Users can insert own favorites"
  on favorite_places for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own favorites" on favorite_places;
create policy "Users can delete own favorites"
  on favorite_places for delete using (auth.uid() = user_id);

-- ============================================================================
-- FRIENDS
-- ============================================================================
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_key
  on friendships (least(requester, addressee), greatest(requester, addressee));
alter table friendships enable row level security;

drop policy if exists "Friendship parties can read" on friendships;
create policy "Friendship parties can read" on friendships
  for select using (auth.uid() in (requester, addressee));

drop policy if exists "Users can send requests" on friendships;
create policy "Users can send requests" on friendships
  for insert with check (requester = auth.uid() and status = 'pending');

drop policy if exists "Addressee can accept" on friendships;
create policy "Addressee can accept" on friendships
  for update using (addressee = auth.uid()) with check (addressee = auth.uid());

drop policy if exists "Either party can remove" on friendships;
create policy "Either party can remove" on friendships
  for delete using (auth.uid() in (requester, addressee));

create or replace function are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- Anyone you have a friendship row with (pending or accepted) can see your name.
drop policy if exists "Connected users can read profile" on profiles;
create policy "Connected users can read profile" on profiles
  for select using (
    exists (
      select 1 from friendships f
      where (f.requester = auth.uid() and f.addressee = profiles.id)
         or (f.addressee = auth.uid() and f.requester = profiles.id)
    )
  );

-- Exact-match lookup only, so the user list can't be browsed.
create or replace function find_profile_by_username(u text)
returns table (id uuid, username text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name from profiles p
  where auth.uid() is not null and lower(p.username) = lower(u)
  limit 1;
$$;

-- ============================================================================
-- MEETUPS
-- requested -> planning (invitee accepted; both share location)
--           -> live     (one person's proposed place accepted by the other)
--           -> ended | declined | cancelled
-- ============================================================================
create table if not exists meetups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  invitee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'planning', 'live', 'declined', 'cancelled', 'ended')),
  proposal_name text,
  proposal_lat double precision,
  proposal_lng double precision,
  proposed_by uuid references auth.users(id) on delete set null,
  dest_name text,
  dest_lat double precision,
  dest_lng double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (created_by <> invitee)
);
alter table meetups enable row level security;

drop policy if exists "Participants can read meetups" on meetups;
create policy "Participants can read meetups" on meetups
  for select using (auth.uid() in (created_by, invitee));

drop policy if exists "Friends can create meetups" on meetups;
create policy "Friends can create meetups" on meetups
  for insert with check (
    created_by = auth.uid() and status = 'requested' and are_friends(created_by, invitee)
  );

drop policy if exists "Participants can update meetups" on meetups;
create policy "Participants can update meetups" on meetups
  for update using (auth.uid() in (created_by, invitee))
  with check (auth.uid() in (created_by, invitee));

create or replace function meetups_guard() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.invitee := old.invitee;
  new.updated_at := now();
  if old.status in ('declined', 'cancelled', 'ended') and new.status <> old.status then
    raise exception 'This meetup is already closed';
  end if;
  return new;
end;
$$;
drop trigger if exists meetups_guard on meetups;
create trigger meetups_guard before update on meetups
  for each row execute function meetups_guard();

-- ============================================================================
-- LIVE LOCATIONS — one row per person per meetup, wiped when it closes
-- ============================================================================
create table if not exists live_locations (
  meetup_id uuid not null references meetups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  dist_km real,
  eta_min real,
  updated_at timestamptz default now(),
  primary key (meetup_id, user_id)
);
alter table live_locations enable row level security;

create or replace function is_meetup_participant(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meetups where id = m and auth.uid() in (created_by, invitee));
$$;

create or replace function meetup_is_sharing(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meetups where id = m and status in ('planning', 'live'));
$$;

drop policy if exists "Participants can read locations" on live_locations;
create policy "Participants can read locations" on live_locations
  for select using (is_meetup_participant(meetup_id));

drop policy if exists "Users share own location" on live_locations;
create policy "Users share own location" on live_locations
  for insert with check (
    user_id = auth.uid() and is_meetup_participant(meetup_id) and meetup_is_sharing(meetup_id)
  );

drop policy if exists "Users update own location" on live_locations;
create policy "Users update own location" on live_locations
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and meetup_is_sharing(meetup_id));

create or replace function meetups_cleanup_locations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('declined', 'cancelled', 'ended') then
    delete from live_locations where meetup_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists meetups_cleanup_locations on meetups;
create trigger meetups_cleanup_locations after update on meetups
  for each row execute function meetups_cleanup_locations();

-- ============================================================================
-- PUSH SUBSCRIPTIONS — one per device; read server-side with the service key
-- ============================================================================
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;

drop policy if exists "Users manage own subscriptions" on push_subscriptions;
create policy "Users manage own subscriptions" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- DEVICE TOKENS — native app (FCM) push; read server-side with the service key
-- ============================================================================
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists device_tokens_user_id_idx on device_tokens (user_id);
alter table device_tokens enable row level security;

drop policy if exists "Users manage own tokens" on device_tokens;
create policy "Users manage own tokens" on device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- REALTIME — stream these tables to the app
-- ============================================================================
do $$
begin
  begin alter publication supabase_realtime add table meetups; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table live_locations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table friendships; exception when duplicate_object then null; end;
end $$;
