-- Supabase Dashboard > SQL Editor-e ei puro file ta paste kore Run korun

-- 1) Profiles (user-er naam)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Notun user signup korle auto profile toiri hobe
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text,
  image_url text,
  seen_at timestamptz,
  created_at timestamptz default now(),
  check (content is not null or image_url is not null)
);
create index if not exists messages_pair_idx on public.messages (sender_id, receiver_id, created_at);
create index if not exists messages_receiver_idx on public.messages (receiver_id, seen_at);

-- 3) Row Level Security
alter table public.profiles enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles readable by logged in users" on public.profiles;
create policy "profiles readable by logged in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "read own messages" on public.messages;
create policy "read own messages"
  on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "send as myself" on public.messages;
create policy "send as myself"
  on public.messages for insert to authenticated
  with check (auth.uid() = sender_id);

drop policy if exists "receiver marks seen" on public.messages;
create policy "receiver marks seen"
  on public.messages for update to authenticated
  using (auth.uid() = receiver_id) with check (auth.uid() = receiver_id);

drop policy if exists "sender deletes own" on public.messages;
create policy "sender deletes own"
  on public.messages for delete to authenticated
  using (auth.uid() = sender_id);

-- 4) Realtime chalu
alter publication supabase_realtime add table public.messages;
alter table public.messages replica identity full;

-- 5) Image storage bucket
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists "upload own images" on storage.objects;
create policy "upload own images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "read chat images" on storage.objects;
create policy "read chat images"
  on storage.objects for select using (bucket_id = 'chat-images');
