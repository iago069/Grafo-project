-- Mapas (aba "Mapas"): pontos, traçados e camadas de cada mapa. Uma linha por
-- pessoa, só ela lê e grava. Ao excluir a conta, a linha sai junto (cascade).
-- Rode depois de 2026-10-16-admin-permissoes.sql (usa grafo_esta_bloqueado).

create table if not exists public.grafo_mapas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.grafo_mapas enable row level security;
revoke all on public.grafo_mapas from anon;
grant select, insert, update on public.grafo_mapas to authenticated;

drop policy if exists "Ler os próprios mapas" on public.grafo_mapas;
create policy "Ler os próprios mapas" on public.grafo_mapas
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Criar os próprios mapas" on public.grafo_mapas;
create policy "Criar os próprios mapas" on public.grafo_mapas
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Atualizar os próprios mapas" on public.grafo_mapas;
create policy "Atualizar os próprios mapas" on public.grafo_mapas
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Conta bloqueada também não acessa os mapas.
drop policy if exists "Conta bloqueada não acessa os mapas" on public.grafo_mapas;
create policy "Conta bloqueada não acessa os mapas" on public.grafo_mapas
  as restrictive for all to authenticated
  using (not public.grafo_esta_bloqueado(auth.uid()))
  with check (not public.grafo_esta_bloqueado(auth.uid()));

-- Limite de tamanho (o app já recusa acima de ~4 MB; aqui é a trava do banco).
alter table public.grafo_mapas drop constraint if exists grafo_mapas_tamanho;
alter table public.grafo_mapas add constraint grafo_mapas_tamanho check (pg_column_size(dados) < 8000000);

notify pgrst, 'reload schema';
