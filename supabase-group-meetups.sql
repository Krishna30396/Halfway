-- ============================================================================
-- GROUP MEETUPS — add friends to a meetup that's already going (up to 6 people)
-- Run once in the Supabase SQL editor, after supabase-schema.sql. Safe to re-run.
--
-- The two who started it stay in meetups.created_by / invitee. Everyone added
-- later is a row here: invited -> joined | declined, and joined -> left.
-- Nobody is the host: every joined person can suggest, accept, add and end.
-- Picking a place: live starts once every joined person has accepted it.
-- ============================================================================
create table if not exists meetup_members (
  meetup_id uuid not null references meetups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'left')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (meetup_id, user_id)
);
create index if not exists meetup_members_user_idx on meetup_members (user_id);
alter table meetup_members enable row level security;

-- Who has accepted the current suggestion (reset whenever it changes).
alter table meetups add column if not exists proposal_accepts uuid[] not null default '{}';

-- In the meetup: the two who started it, plus anyone who joined.
create or replace function is_meetup_participant(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meetups where id = m and auth.uid() in (created_by, invitee))
      or exists (select 1 from meetup_members where meetup_id = m and user_id = auth.uid() and status = 'joined');
$$;

-- Can open it: participants, and anyone with an open invite (to accept or decline).
create or replace function can_see_meetup(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_meetup_participant(m)
      or exists (select 1 from meetup_members where meetup_id = m and user_id = auth.uid() and status = 'invited');
$$;

-- Everyone in it right now (the two who started it + joined members).
create or replace function meetup_people(m uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select created_by from meetups where id = m
  union select invitee from meetups where id = m
  union select user_id from meetup_members where meetup_id = m and status = 'joined';
$$;

-- The two who started it are checked on the row itself first: a meetup being
-- created isn't visible to the functions yet, and insert … returning needs this.
drop policy if exists "Participants can read meetups" on meetups;
create policy "Participants can read meetups" on meetups
  for select using (auth.uid() in (created_by, invitee) or can_see_meetup(id));

drop policy if exists "Participants can update meetups" on meetups;
create policy "Participants can update meetups" on meetups
  for update using (auth.uid() in (created_by, invitee) or is_meetup_participant(id))
  with check (auth.uid() in (created_by, invitee) or is_meetup_participant(id));

drop policy if exists "Meetup people can read members" on meetup_members;
create policy "Meetup people can read members" on meetup_members
  for select using (can_see_meetup(meetup_id));
-- No insert/update/delete policies: members change only through the functions below.

-- People in the same meetup can see each other's name, even if they aren't friends.
create or replace function shares_meetup_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with mine as (
    select id from meetups where auth.uid() in (created_by, invitee)
    union
    select meetup_id from meetup_members where user_id = auth.uid() and status in ('invited', 'joined')
  )
  select exists (select 1 from meetups mt join mine on mine.id = mt.id where other in (mt.created_by, mt.invitee))
      or exists (
        select 1 from meetup_members mm join mine on mine.id = mm.meetup_id
        where mm.user_id = other and mm.status in ('invited', 'joined')
      );
$$;

drop policy if exists "Meetup co-members can read profile" on profiles;
create policy "Meetup co-members can read profile" on profiles
  for select using (shares_meetup_with(profiles.id));

-- The original guard, plus: suggestion accepts reset when the suggestion changes,
-- and a group meetup only goes live through accept_proposal (everyone agreed).
create or replace function meetups_guard() returns trigger
language plpgsql as $$
declare
  via_rpc boolean := coalesce(current_setting('halfway.rpc', true), '') = '1';
begin
  new.created_by := old.created_by;
  new.invitee := old.invitee;
  new.updated_at := now();
  if old.status in ('declined', 'cancelled', 'ended') and new.status <> old.status then
    raise exception 'This meetup is already closed';
  end if;
  if not via_rpc then
    new.proposal_accepts := old.proposal_accepts;
    if old.status = 'planning' and new.status = 'live'
       and exists (select 1 from meetup_members where meetup_id = old.id and status = 'joined') then
      raise exception 'Everyone in the group has to accept the place first';
    end if;
  end if;
  if new.proposal_name is distinct from old.proposal_name
     or new.proposal_lat is distinct from old.proposal_lat
     or new.proposal_lng is distinct from old.proposal_lng then
    new.proposal_accepts := '{}';
  end if;
  return new;
end;
$$;

-- Starts the meetup once everyone (except whoever suggested it) has accepted.
create or replace function meetup_try_start(m uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  mt meetups;
begin
  select * into mt from meetups where id = m;
  if mt.status <> 'planning' or mt.proposal_name is null then
    return false;
  end if;
  if exists (
    select 1 from meetup_people(m) p
    where p is distinct from mt.proposed_by and not (p = any (mt.proposal_accepts))
  ) then
    return false;
  end if;
  perform set_config('halfway.rpc', '1', true);
  update meetups
     set status = 'live',
         dest_name = proposal_name, dest_lat = proposal_lat, dest_lng = proposal_lng,
         proposal_name = null, proposal_lat = null, proposal_lng = null, proposed_by = null
   where id = m;
  perform set_config('halfway.rpc', '', true);
  return true;
end;
$$;

-- Accept the current suggestion. pname guards against accepting a place that
-- changed a moment ago. Returns true when this accept started the meetup.
create or replace function accept_proposal(m uuid, pname text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  mt meetups;
begin
  select * into mt from meetups where id = m for update;
  if mt is null or not is_meetup_participant(m) then
    raise exception 'This meetup isn''t one of yours';
  end if;
  if mt.status <> 'planning' or mt.proposal_name is distinct from pname then
    raise exception 'That suggestion changed a moment ago. Here''s the latest.';
  end if;
  if mt.proposed_by = auth.uid() then
    raise exception 'You suggested this one';
  end if;
  perform set_config('halfway.rpc', '1', true);
  update meetups
     set proposal_accepts = array(select distinct unnest(proposal_accepts || auth.uid()))
   where id = m;
  perform set_config('halfway.rpc', '', true);
  return meetup_try_start(m);
end;
$$;

-- Add one of your friends. Anyone in the meetup can, while it's planning or live.
create or replace function add_meetup_member(m uuid, friend uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  mt meetups;
  n int;
begin
  select * into mt from meetups where id = m for update;
  if mt is null or not is_meetup_participant(m) then
    raise exception 'This meetup isn''t one of yours';
  end if;
  if mt.status not in ('planning', 'live') then
    raise exception 'You can add people once the meetup has started';
  end if;
  if not are_friends(auth.uid(), friend) then
    raise exception 'You can only add your friends';
  end if;
  if friend in (mt.created_by, mt.invitee)
     or exists (select 1 from meetup_members where meetup_id = m and user_id = friend and status in ('invited', 'joined')) then
    raise exception 'They''re already in this meetup';
  end if;
  select count(*) into n from meetup_members where meetup_id = m and status in ('invited', 'joined');
  if n + 2 >= 6 then
    raise exception 'A meetup can have up to 6 people';
  end if;
  insert into meetup_members (meetup_id, user_id, invited_by, status)
  values (m, friend, auth.uid(), 'invited')
  on conflict (meetup_id, user_id)
  do update set status = 'invited', invited_by = auth.uid(), updated_at = now();
end;
$$;

-- Accept or decline an invite. Joining a live meetup drops you straight in.
create or replace function respond_meetup_invite(m uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from meetups where id = m and status in ('planning', 'live')) then
    raise exception 'This meetup has already finished';
  end if;
  update meetup_members
     set status = case when accept then 'joined' else 'declined' end, updated_at = now()
   where meetup_id = m and user_id = auth.uid() and status = 'invited';
  if not found then
    raise exception 'This invite isn''t open any more';
  end if;
end;
$$;

-- Leave a group meetup (people who were added; the two who started it end it instead).
create or replace function leave_meetup(m uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update meetup_members set status = 'left', updated_at = now()
   where meetup_id = m and user_id = auth.uid() and status = 'joined';
  if not found then
    raise exception 'You''re not a member of this meetup';
  end if;
  delete from live_locations where meetup_id = m and user_id = auth.uid();
  -- The last person still to accept may have just left.
  perform meetup_try_start(m);
end;
$$;

revoke execute on function meetup_try_start(uuid) from public, anon, authenticated;
grant execute on function accept_proposal(uuid, text) to authenticated;
grant execute on function add_meetup_member(uuid, uuid) to authenticated;
grant execute on function respond_meetup_invite(uuid, boolean) to authenticated;
grant execute on function leave_meetup(uuid) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table meetup_members; exception when duplicate_object then null; end;
end $$;
