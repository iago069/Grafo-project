-- Biblioteca (documentação no estilo BookStack): estantes, livros, capítulos e
-- páginas, separada dos diagramas. Uma linha por pessoa, só ela lê e grava.
-- Os anexos das páginas vão para o bucket "documentos" (mesmas regras de antes).
-- Rode depois de 2026-10-16-admin-permissoes.sql (usa grafo_esta_bloqueado).

create table if not exists public.grafo_biblioteca (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.grafo_biblioteca enable row level security;
revoke all on public.grafo_biblioteca from anon;
grant select, insert, update on public.grafo_biblioteca to authenticated;

drop policy if exists "Ler a própria biblioteca" on public.grafo_biblioteca;
create policy "Ler a própria biblioteca" on public.grafo_biblioteca
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Criar a própria biblioteca" on public.grafo_biblioteca;
create policy "Criar a própria biblioteca" on public.grafo_biblioteca
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Atualizar a própria biblioteca" on public.grafo_biblioteca;
create policy "Atualizar a própria biblioteca" on public.grafo_biblioteca
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Conta bloqueada também não acessa a biblioteca.
drop policy if exists "Conta bloqueada não acessa a biblioteca" on public.grafo_biblioteca;
create policy "Conta bloqueada não acessa a biblioteca" on public.grafo_biblioteca
  as restrictive for all to authenticated
  using (not public.grafo_esta_bloqueado(auth.uid()))
  with check (not public.grafo_esta_bloqueado(auth.uid()));

notify pgrst, 'reload schema';
