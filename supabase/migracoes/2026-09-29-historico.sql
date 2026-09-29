-- Histórico de versões dos projetos (pessoais e de equipe).
-- Execute uma vez no SQL Editor do Supabase (também está em supabase/schema.sql).
-- Precisa das tabelas de equipe (2026-09-29-equipes.sql) já criadas.
--
-- Como funciona: a cada alteração de um projeto, o banco guarda como ele estava
-- ANTES da mudança — no máximo uma versão automática a cada 10 minutos por
-- projeto. Assim a primeira alteração do dia guarda o projeto como ficou no dia
-- anterior ("restaurar a versão de ontem"). Ficam as 60 versões mais recentes de
-- cada projeto, por até 90 dias. Projeto pessoal excluído deixa a última versão
-- guardada (dá para recuperar pelo histórico).

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
