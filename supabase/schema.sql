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

-- Projetos de equipe. Mesmo conteúdo de supabase/migracoes/2026-09-29-equipes.sql.

create table if not exists public.grafo_projetos_equipe (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  dados jsonb not null check (octet_length(dados::text) <= 10000000),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

create table if not exists public.grafo_membros (
  projeto uuid not null references public.grafo_projetos_equipe(id) on delete cascade,
  usuario uuid not null references auth.users(id) on delete cascade,
  email text,
  entrou_em timestamptz not null default now(),
  primary key (projeto, usuario)
);

-- Link de convite: tabela separada para só o dono conseguir ler o token.
create table if not exists public.grafo_convites (
  projeto uuid primary key references public.grafo_projetos_equipe(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now()
);

-- Funções auxiliares das regras de acesso (security definer evita que a regra
-- de uma tabela dependa da regra dela mesma).
create or replace function public.grafo_eh_membro(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grafo_membros m where m.projeto = p_projeto and m.usuario = (select auth.uid()));
$$;

create or replace function public.grafo_eh_dono(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grafo_projetos_equipe p where p.id = p_projeto and p.dono = (select auth.uid()));
$$;

alter table public.grafo_projetos_equipe enable row level security;
alter table public.grafo_membros enable row level security;
alter table public.grafo_convites enable row level security;
revoke all on public.grafo_projetos_equipe, public.grafo_membros, public.grafo_convites from anon;
grant select, update, delete on public.grafo_projetos_equipe to authenticated;
grant select, delete on public.grafo_membros to authenticated;
grant select, insert, update, delete on public.grafo_convites to authenticated;

drop policy if exists "Membros leem o projeto" on public.grafo_projetos_equipe;
create policy "Membros leem o projeto" on public.grafo_projetos_equipe for select to authenticated
using (public.grafo_eh_membro(id));

drop policy if exists "Membros editam o projeto" on public.grafo_projetos_equipe;
create policy "Membros editam o projeto" on public.grafo_projetos_equipe for update to authenticated
using (public.grafo_eh_membro(id)) with check (public.grafo_eh_membro(id));

drop policy if exists "Só o dono exclui o projeto" on public.grafo_projetos_equipe;
create policy "Só o dono exclui o projeto" on public.grafo_projetos_equipe for delete to authenticated
using (dono = (select auth.uid()));

drop policy if exists "Membros veem a equipe" on public.grafo_membros;
create policy "Membros veem a equipe" on public.grafo_membros for select to authenticated
using (public.grafo_eh_membro(projeto));

-- Sair do projeto (membro) ou remover alguém (dono). O dono não sai: ele exclui.
drop policy if exists "Sair ou remover da equipe" on public.grafo_membros;
create policy "Sair ou remover da equipe" on public.grafo_membros for delete to authenticated
using (
  (usuario = (select auth.uid()) and not public.grafo_eh_dono(projeto))
  or (public.grafo_eh_dono(projeto) and usuario <> (select auth.uid()))
);

drop policy if exists "Dono gerencia o convite" on public.grafo_convites;
create policy "Dono gerencia o convite" on public.grafo_convites for all to authenticated
using (public.grafo_eh_dono(projeto)) with check (public.grafo_eh_dono(projeto));

-- Ninguém muda o dono nem o id; atualizado_por registra quem salvou.
create or replace function public.grafo_proteger_projeto_equipe()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.dono := old.dono;
  new.atualizado_por := auth.uid();
  return new;
end;
$$;
drop trigger if exists grafo_proteger_projeto_equipe on public.grafo_projetos_equipe;
create trigger grafo_proteger_projeto_equipe before update on public.grafo_projetos_equipe
for each row execute function public.grafo_proteger_projeto_equipe();

-- Transforma um projeto em projeto de equipe: cria o projeto, põe o dono como
-- membro e já gera o link de convite.
create or replace function public.grafo_criar_projeto_equipe(p_nome text, p_dados jsonb)
returns table (id uuid, atualizado_em timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_em timestamptz;
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  if (select count(*) from public.grafo_projetos_equipe p where p.dono = auth.uid()) >= 100 then
    raise exception 'Limite de 100 projetos de equipe por conta.';
  end if;
  insert into public.grafo_projetos_equipe (dono, nome, dados, atualizado_por)
  values (auth.uid(), p_nome, p_dados, auth.uid())
  returning public.grafo_projetos_equipe.id, public.grafo_projetos_equipe.atualizado_em into v_id, v_em;
  insert into public.grafo_membros (projeto, usuario, email) values (v_id, auth.uid(), auth.jwt() ->> 'email');
  insert into public.grafo_convites (projeto) values (v_id);
  return query select v_id, v_em;
end;
$$;

-- Entra no projeto do convite. Sem convite válido, não devolve nada.
create or replace function public.grafo_aceitar_convite(p_token uuid)
returns table (id uuid, nome text, dados jsonb, dono uuid, atualizado_em timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  select c.projeto into v_projeto from public.grafo_convites c where c.token = p_token;
  if v_projeto is null then return; end if;
  insert into public.grafo_membros (projeto, usuario, email)
  values (v_projeto, auth.uid(), auth.jwt() ->> 'email')
  on conflict do nothing;
  return query select p.id, p.nome, p.dados, p.dono, p.atualizado_em
    from public.grafo_projetos_equipe p where p.id = v_projeto;
end;
$$;

revoke all on function public.grafo_eh_membro(uuid), public.grafo_eh_dono(uuid),
  public.grafo_criar_projeto_equipe(text, jsonb), public.grafo_aceitar_convite(uuid) from public, anon;
grant execute on function public.grafo_eh_membro(uuid), public.grafo_eh_dono(uuid),
  public.grafo_criar_projeto_equipe(text, jsonb), public.grafo_aceitar_convite(uuid) to authenticated;

-- Tempo real: os membros recebem as alterações uns dos outros em segundos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'grafo_projetos_equipe') then
    alter publication supabase_realtime add table public.grafo_projetos_equipe;
  end if;
end;
$$;

-- Histórico de versões dos projetos. Mesmo conteúdo de supabase/migracoes/2026-09-29-historico.sql.

create table if not exists public.grafo_versoes (
  id bigint generated always as identity primary key,
  dono uuid references auth.users(id) on delete cascade,                               -- projeto pessoal
  projeto_equipe uuid references public.grafo_projetos_equipe(id) on delete cascade,    -- projeto de equipe
  projeto text not null check (char_length(projeto) between 1 and 60),
  dados jsonb not null check (octet_length(dados::text) <= 10000000),
  motivo text not null default 'automatico' check (motivo in ('automatico', 'antes-de-restaurar', 'manual')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  criado_por_email text,
  check ((dono is null) <> (projeto_equipe is null))
);
create index if not exists grafo_versoes_pessoal on public.grafo_versoes (dono, projeto, criado_em desc);
create index if not exists grafo_versoes_equipe on public.grafo_versoes (projeto_equipe, criado_em desc);

alter table public.grafo_versoes enable row level security;
revoke all on public.grafo_versoes from anon, authenticated;
grant select on public.grafo_versoes to authenticated;

-- Lê o histórico quem é dono do projeto pessoal ou membro do projeto de equipe.
-- Ninguém grava direto: só os gatilhos e as funções abaixo.
drop policy if exists "Ver o histórico dos próprios projetos" on public.grafo_versoes;
create policy "Ver o histórico dos próprios projetos" on public.grafo_versoes for select to authenticated
using (dono = (select auth.uid()) or (projeto_equipe is not null and public.grafo_eh_membro(projeto_equipe)));

-- Guarda uma versão. p_forcar ignora o intervalo de 10 minutos (antes de
-- restaurar / "Guardar versão agora"). Não duplica se for igual à última.
create or replace function public.grafo_guardar_versao(p_dono uuid, p_equipe uuid, p_projeto text, p_dados jsonb, p_motivo text, p_forcar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ultima jsonb;
  v_ultima_em timestamptz;
begin
  if p_dados is null or coalesce(p_projeto, '') = '' or jsonb_typeof(p_dados) <> 'object' then return; end if;
  select v.dados, v.criado_em into v_ultima, v_ultima_em from public.grafo_versoes v
   where (p_equipe is null and v.dono = p_dono and v.projeto = p_projeto) or (p_equipe is not null and v.projeto_equipe = p_equipe)
   order by v.criado_em desc limit 1;
  if v_ultima is not null and v_ultima = p_dados then return; end if;
  if not p_forcar and v_ultima_em is not null and v_ultima_em > now() - interval '10 minutes' then return; end if;

  insert into public.grafo_versoes (dono, projeto_equipe, projeto, dados, motivo, criado_por, criado_por_email)
  values (case when p_equipe is null then p_dono end, p_equipe, left(p_projeto, 60), p_dados, p_motivo, auth.uid(), auth.jwt() ->> 'email');

  delete from public.grafo_versoes v
   where ((p_equipe is null and v.dono = p_dono and v.projeto = p_projeto) or (p_equipe is not null and v.projeto_equipe = p_equipe))
     and (v.criado_em < now() - interval '90 days'
          or v.id not in (select v2.id from public.grafo_versoes v2
                           where (p_equipe is null and v2.dono = p_dono and v2.projeto = p_projeto) or (p_equipe is not null and v2.projeto_equipe = p_equipe)
                           order by v2.criado_em desc limit 60));
end;
$$;

-- Projetos pessoais: todos ficam numa linha (grafo_user_data.projects); guarda
-- cada projeto que mudou ou foi excluído.
create or replace function public.grafo_versionar_pessoais()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chave text;
  v_valor jsonb;
begin
  if old.projects is distinct from new.projects then
    for v_chave, v_valor in select e.key, e.value from jsonb_each(coalesce(old.projects, '{}'::jsonb)) e loop
      if (new.projects -> v_chave) is distinct from v_valor then
        perform public.grafo_guardar_versao(old.user_id, null, v_chave, v_valor, 'automatico', false);
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists grafo_versionar_pessoais on public.grafo_user_data;
create trigger grafo_versionar_pessoais before update on public.grafo_user_data
for each row execute function public.grafo_versionar_pessoais();

create or replace function public.grafo_versionar_equipe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.dados is distinct from new.dados then
    perform public.grafo_guardar_versao(null, old.id, old.nome, old.dados, 'automatico', false);
  end if;
  return new;
end;
$$;
drop trigger if exists grafo_versionar_equipe on public.grafo_projetos_equipe;
create trigger grafo_versionar_equipe before update on public.grafo_projetos_equipe
for each row execute function public.grafo_versionar_equipe();

-- Lista do histórico (sem os dados, só os totais), mais nova primeiro.
create or replace function public.grafo_listar_versoes(p_projeto text, p_equipe uuid)
returns table (id bigint, criado_em timestamptz, motivo text, criado_por_email text, equipamentos integer, conexoes integer, anotacoes integer)
language sql stable security invoker set search_path = '' as $$
  select v.id, v.criado_em, v.motivo, v.criado_por_email,
    case when jsonb_typeof(v.dados -> 'equipamentos') = 'array' then jsonb_array_length(v.dados -> 'equipamentos') else 0 end,
    case when jsonb_typeof(v.dados -> 'conexoes') = 'array' then jsonb_array_length(v.dados -> 'conexoes') else 0 end,
    case when jsonb_typeof(v.dados -> 'anotacoes') = 'array' then jsonb_array_length(v.dados -> 'anotacoes') else 0 end
  from public.grafo_versoes v
  where (p_equipe is null and v.dono = (select auth.uid()) and v.projeto = p_projeto)
     or (p_equipe is not null and v.projeto_equipe = p_equipe)
  order by v.criado_em desc
  limit 60;
$$;

-- Guarda agora o estado atual (antes de restaurar, ou pelo botão "Guardar versão agora").
create or replace function public.grafo_salvar_versao_atual(p_projeto text, p_equipe uuid, p_dados jsonb, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  if p_equipe is not null and not public.grafo_eh_membro(p_equipe) then raise exception 'Sem acesso a este projeto.'; end if;
  if p_motivo not in ('antes-de-restaurar', 'manual') then raise exception 'Motivo inválido.'; end if;
  if octet_length(p_dados::text) > 10000000 then raise exception 'Projeto grande demais.'; end if;
  perform public.grafo_guardar_versao(case when p_equipe is null then auth.uid() end, p_equipe, p_projeto, p_dados, p_motivo, true);
end;
$$;

revoke all on function public.grafo_guardar_versao(uuid, uuid, text, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.grafo_versionar_pessoais(), public.grafo_versionar_equipe() from public, anon, authenticated;
revoke all on function public.grafo_listar_versoes(text, uuid), public.grafo_salvar_versao_atual(text, uuid, jsonb, text) from public, anon;
grant execute on function public.grafo_listar_versoes(text, uuid), public.grafo_salvar_versao_atual(text, uuid, jsonb, text) to authenticated;

-- Registro de erros do navegador (assets/js/erros.js). Só quem mantém o Grafo
-- vê, pelo painel do Supabase (tabela grafo_erros ou visão grafo_erros_resumo).
-- O site só grava pela função, limitada a 30 erros por pessoa por hora; o que
-- tiver mais de 90 dias é apagado. Sai junto com a conta (on delete cascade).
create table if not exists public.grafo_erros (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  usuario uuid references auth.users (id) on delete cascade,
  mensagem text not null,
  origem text,
  pilha text,
  pagina text,
  navegador text
);
create index if not exists grafo_erros_criado_em on public.grafo_erros (criado_em desc);
create index if not exists grafo_erros_usuario on public.grafo_erros (usuario, criado_em desc);

alter table public.grafo_erros enable row level security;
revoke all on public.grafo_erros from anon, authenticated;

create or replace function public.grafo_registrar_erro(p_mensagem text, p_origem text, p_pilha text, p_pagina text, p_navegador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(trim(p_mensagem), '') = '' then
    return;
  end if;
  if (select count(*) from public.grafo_erros e
      where e.usuario = auth.uid() and e.criado_em > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.grafo_erros (usuario, mensagem, origem, pilha, pagina, navegador)
  values (auth.uid(), left(p_mensagem, 500), left(p_origem, 300), left(p_pilha, 3000), left(p_pagina, 200), left(p_navegador, 300));
  delete from public.grafo_erros e where e.criado_em < now() - interval '90 days';
end;
$$;

revoke all on function public.grafo_registrar_erro(text, text, text, text, text) from public, anon;
grant execute on function public.grafo_registrar_erro(text, text, text, text, text) to authenticated;

create or replace view public.grafo_erros_resumo with (security_invoker = true) as
  select mensagem, origem, count(*) as vezes, count(distinct usuario) as pessoas,
         min(criado_em) as primeira_vez, max(criado_em) as ultima_vez
  from public.grafo_erros
  group by mensagem, origem
  order by max(criado_em) desc;
revoke all on public.grafo_erros_resumo from anon, authenticated;
