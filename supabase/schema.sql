-- Execute no SQL Editor do projeto Supabase antes do deploy.
create table if not exists public.grafo_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  projects jsonb not null default '{}'::jsonb,
  current_project text not null default 'Projeto principal',
  updated_at timestamptz not null default now()
);

alter table public.grafo_user_data enable row level security;
revoke all on public.grafo_user_data from anon;
grant select, insert, update on public.grafo_user_data to authenticated;

create policy "Ler apenas os próprios projetos"
on public.grafo_user_data for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Criar apenas os próprios projetos"
on public.grafo_user_data for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Atualizar apenas os próprios projetos"
on public.grafo_user_data for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
