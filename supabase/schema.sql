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

-- Exclusão da conta pela própria pessoa (LGPD). Mesmo conteúdo de
-- supabase/migracoes/2026-09-28-excluir-conta.sql.
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'É necessário estar logado.';
  end if;
  -- grafo_user_data sai junto (on delete cascade).
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- Links só para visualizar. Mesmo conteúdo de
-- supabase/migracoes/2026-09-28-compartilhar.sql.
create table if not exists public.grafo_compartilhamentos (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto text not null check (char_length(projeto) between 1 and 60),
  svg text not null check (octet_length(svg) <= 8000000),
  atualizado_em timestamptz not null default now(),
  unique (user_id, projeto)
);

alter table public.grafo_compartilhamentos enable row level security;
revoke all on public.grafo_compartilhamentos from anon;
grant select, insert, update, delete on public.grafo_compartilhamentos to authenticated;

drop policy if exists "Dono gerencia os próprios links" on public.grafo_compartilhamentos;
create policy "Dono gerencia os próprios links"
on public.grafo_compartilhamentos for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.ver_compartilhamento(p_token uuid)
returns table (projeto text, svg text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.projeto, c.svg, c.atualizado_em
  from public.grafo_compartilhamentos c
  where c.token = p_token;
$$;

revoke all on function public.ver_compartilhamento(uuid) from public;
grant execute on function public.ver_compartilhamento(uuid) to anon, authenticated;
