-- Chosen avatar face (components/Avatar.jsx ids like 'f1'); null shows the initial.
-- Already run on Halfway-Database.
alter table public.profiles add column if not exists avatar text;
