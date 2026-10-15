-- Temas exclusivos (ex.: "fernando"): só aparecem para quem o admin liberar.
-- Rode DEPOIS de 2026-10-15-admin.sql. Ninguém grava nesta tabela pelo app,
-- só pela função de admin abaixo (que recusa quem não é admin) ou pelo painel do Supabase.

create table if not exists public.grafo_temas_liberados (
  user_id uuid not null references auth.users (id) on delete cascade,
  tema text not null check (tema ~ '^[a-z0-9-]{1,40}$'),
  liberado_em timestamptz not null default now(),
  primary key (user_id, tema)
);
alter table public.grafo_temas_liberados enable row level security;
revoke all on public.grafo_temas_liberados from anon, authenticated;

-- Quais temas exclusivos EU posso usar.
create or replace function public.grafo_meus_temas()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(tema order by tema), '{}') from public.grafo_temas_liberados where user_id = auth.uid();
$$;
revoke all on function public.grafo_meus_temas() from public, anon;
grant execute on function public.grafo_meus_temas() to authenticated;

-- Admin libera (p_liberar = true) ou tira (false) um tema de alguém.
create or replace function public.grafo_admin_definir_tema(p_usuario uuid, p_tema text, p_liberar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.grafo_admins where user_id = auth.uid()) then
    raise exception 'acesso negado: só administradores';
  end if;
  if p_liberar then
    insert into public.grafo_temas_liberados (user_id, tema) values (p_usuario, p_tema) on conflict do nothing;
  else
    delete from public.grafo_temas_liberados where user_id = p_usuario and tema = p_tema;
  end if;
end;
$$;
revoke all on function public.grafo_admin_definir_tema(uuid, text, boolean) from public, anon;
grant execute on function public.grafo_admin_definir_tema(uuid, text, boolean) to authenticated;

-- O painel passa a mostrar os temas liberados de cada conta.
create or replace function public.grafo_admin_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  resultado jsonb;
begin
  if not exists (select 1 from public.grafo_admins where user_id = auth.uid()) then
    raise exception 'acesso negado: só administradores';
  end if;
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(u order by u->>'ultimo_acesso' desc nulls last) from (
        select jsonb_build_object(
          'id', au.id,
          'email', au.email,
          'criado_em', au.created_at,
          'ultimo_acesso', au.last_sign_in_at,
          'confirmado', au.email_confirmed_at is not null,
          'admin', exists (select 1 from public.grafo_admins a where a.user_id = au.id),
          'temas', coalesce((select jsonb_agg(t.tema) from public.grafo_temas_liberados t where t.user_id = au.id), '[]'::jsonb),
          'projetos', coalesce((select count(*) from jsonb_object_keys(d.projects)), 0),
          'salvo_em', d.updated_at,
          'tamanho', coalesce(octet_length(d.projects::text), 0)
        ) as u
        from auth.users au
        left join public.grafo_user_data d on d.user_id = au.id
      ) s), '[]'::jsonb),
    'erros', coalesce((
      select jsonb_agg(e) from (
        select mensagem, origem, count(*) as vezes, count(distinct usuario) as pessoas, max(criado_em) as ultima_vez
        from public.grafo_erros
        where criado_em > now() - interval '7 days'
        group by mensagem, origem
        order by max(criado_em) desc
        limit 30
      ) e), '[]'::jsonb),
    'arquivos', coalesce((
      select jsonb_build_object('quantidade', count(*), 'bytes', coalesce(sum((metadata->>'size')::bigint), 0))
      from storage.objects where bucket_id = 'documentos'), '{"quantidade":0,"bytes":0}'::jsonb),
    'equipes', (select count(*) from public.grafo_projetos_equipe),
    'gerado_em', now()
  ) into resultado;
  return resultado;
end;
$$;

-- Os admins já começam com o tema Fernando liberado.
insert into public.grafo_temas_liberados (user_id, tema)
select user_id, 'fernando' from public.grafo_admins
on conflict do nothing;
