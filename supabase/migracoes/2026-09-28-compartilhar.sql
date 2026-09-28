-- Para projetos Supabase criados antes de 28/09/2026: execute uma vez no SQL Editor.
-- Links só para visualizar (botão "Compartilhar"). Cada link guarda uma cópia do
-- desenho (SVG) de um projeto; o app do dono atualiza a cópia quando o projeto muda.
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

-- Quem tem o link (inclusive sem login) lê só aquele desenho, e nada mais da tabela.
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
