-- schema.sql run korar PORE ei file ta run korun
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text default '',
  theme text default '#0f766e',
  wallpaper text default 'plain'
);
alter table public.settings enable row level security;
drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
