-- Para projetos Supabase criados antes de 30/09/2026: execute uma vez no SQL Editor.
-- Registro de erros do navegador (assets/js/erros.js): quando algo quebra no site
-- de alguém logado, a mensagem fica aqui para quem mantém o Grafo ver no painel
-- do Supabase (Table Editor > grafo_erros, ou a visão grafo_erros_resumo).
-- Ninguém lê nem grava a tabela pelo site: só pela função abaixo, que limita a
-- 30 erros por pessoa por hora e apaga o que tiver mais de 90 dias.
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

-- Erros agrupados, os mais recentes primeiro (consultar no SQL Editor ou no Table Editor).
create or replace view public.grafo_erros_resumo with (security_invoker = true) as
  select mensagem, origem, count(*) as vezes, count(distinct usuario) as pessoas,
         min(criado_em) as primeira_vez, max(criado_em) as ultima_vez
  from public.grafo_erros
  group by mensagem, origem
  order by max(criado_em) desc;
revoke all on public.grafo_erros_resumo from anon, authenticated;
