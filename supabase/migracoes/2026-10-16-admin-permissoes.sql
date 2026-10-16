-- Mais permissões do administrador (rode DEPOIS de 2026-10-15-admin.sql e
-- 2026-10-15-temas-liberados.sql):
--   1. tornar/tirar admin pelo painel (sem tirar o próprio acesso nem zerar os admins);
--   2. bloquear/desbloquear contas (o banco recusa ler e gravar os projetos e os
--      arquivos de quem está bloqueado; o app mostra a tela de conta bloqueada);
--   3. comunicado para todos (faixa no topo do Grafo).
-- Tudo passa por funções que recusam quem não é admin.

-- ---- 2. contas bloqueadas -------------------------------------------------------
create table if not exists public.grafo_bloqueados (
  user_id uuid primary key references auth.users (id) on delete cascade,
  motivo text not null default '',
  bloqueado_em timestamptz not null default now()
);
alter table public.grafo_bloqueados enable row level security;
revoke all on public.grafo_bloqueados from anon, authenticated;

create or replace function public.grafo_esta_bloqueado(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grafo_bloqueados where user_id = p_usuario);
$$;
revoke all on function public.grafo_esta_bloqueado(uuid) from public, anon;
grant execute on function public.grafo_esta_bloqueado(uuid) to authenticated;

-- Regra "restritiva": soma às que já existem; conta bloqueada não lê nem grava os projetos.
drop policy if exists "Conta bloqueada não acessa os projetos" on public.grafo_user_data;
create policy "Conta bloqueada não acessa os projetos" on public.grafo_user_data
  as restrictive for all to authenticated
  using (not public.grafo_esta_bloqueado(auth.uid()))
  with check (not public.grafo_esta_bloqueado(auth.uid()));

-- E nem os arquivos dos documentos.
drop policy if exists "documentos: conta bloqueada" on storage.objects;
create policy "documentos: conta bloqueada" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'documentos' or not public.grafo_esta_bloqueado(auth.uid()))
  with check (bucket_id <> 'documentos' or not public.grafo_esta_bloqueado(auth.uid()));

-- ---- 3. comunicado para todos ---------------------------------------------------
create table if not exists public.grafo_avisos (
  id bigint generated always as identity primary key,
  texto text not null check (char_length(texto) between 1 and 300),
  tipo text not null default 'info' check (tipo in ('info', 'alerta', 'sucesso')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.grafo_avisos enable row level security;
revoke all on public.grafo_avisos from anon, authenticated;

-- O que o app de cada pessoa consulta: estou bloqueado? há comunicado?
create or replace function public.grafo_minha_situacao()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bloqueado', exists (select 1 from public.grafo_bloqueados where user_id = auth.uid()),
    'motivo', (select motivo from public.grafo_bloqueados where user_id = auth.uid()),
    'aviso', (select jsonb_build_object('id', id, 'texto', texto, 'tipo', tipo, 'criado_em', criado_em)
              from public.grafo_avisos where ativo order by id desc limit 1)
  );
$$;
revoke all on function public.grafo_minha_situacao() from public, anon;
grant execute on function public.grafo_minha_situacao() to authenticated;

-- ---- funções do admin -----------------------------------------------------------
create or replace function public.grafo_exigir_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.grafo_admins where user_id = auth.uid()) then
    raise exception 'acesso negado: só administradores';
  end if;
end;
$$;
revoke all on function public.grafo_exigir_admin() from public, anon, authenticated;

-- 1. Tornar ou tirar admin.
create or replace function public.grafo_admin_definir_admin(p_usuario uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.grafo_exigir_admin();
  if p_admin then
    insert into public.grafo_admins (user_id) values (p_usuario) on conflict do nothing;
    delete from public.grafo_bloqueados where user_id = p_usuario;
  else
    if p_usuario = auth.uid() then raise exception 'você não pode tirar o seu próprio acesso de admin'; end if;
    if (select count(*) from public.grafo_admins where user_id <> p_usuario) = 0 then
      raise exception 'o Grafo precisa ter pelo menos um admin';
    end if;
    delete from public.grafo_admins where user_id = p_usuario;
  end if;
end;
$$;
revoke all on function public.grafo_admin_definir_admin(uuid, boolean) from public, anon;
grant execute on function public.grafo_admin_definir_admin(uuid, boolean) to authenticated;

-- 2. Bloquear ou desbloquear uma conta.
create or replace function public.grafo_admin_definir_bloqueio(p_usuario uuid, p_bloquear boolean, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.grafo_exigir_admin();
  if p_bloquear then
    if p_usuario = auth.uid() then raise exception 'você não pode bloquear a sua própria conta'; end if;
    if exists (select 1 from public.grafo_admins where user_id = p_usuario) then
      raise exception 'tire o acesso de admin antes de bloquear esta conta';
    end if;
    insert into public.grafo_bloqueados (user_id, motivo) values (p_usuario, left(coalesce(p_motivo, ''), 200))
    on conflict (user_id) do update set motivo = excluded.motivo, bloqueado_em = now();
  else
    delete from public.grafo_bloqueados where user_id = p_usuario;
  end if;
end;
$$;
revoke all on function public.grafo_admin_definir_bloqueio(uuid, boolean, text) from public, anon;
grant execute on function public.grafo_admin_definir_bloqueio(uuid, boolean, text) to authenticated;

-- 3. Publicar comunicado (texto vazio = remover o atual).
create or replace function public.grafo_admin_definir_aviso(p_texto text, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.grafo_exigir_admin();
  update public.grafo_avisos set ativo = false where ativo;
  if coalesce(trim(p_texto), '') <> '' then
    insert into public.grafo_avisos (texto, tipo) values (left(trim(p_texto), 300), coalesce(nullif(p_tipo, ''), 'info'));
  end if;
end;
$$;
revoke all on function public.grafo_admin_definir_aviso(text, text) from public, anon;
grant execute on function public.grafo_admin_definir_aviso(text, text) to authenticated;

-- Painel: passa a mostrar bloqueio de cada conta e o comunicado atual.
create or replace function public.grafo_admin_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  resultado jsonb;
begin
  perform public.grafo_exigir_admin();
  select jsonb_build_object(
    'eu', auth.uid(),
    'usuarios', coalesce((
      select jsonb_agg(u order by u->>'ultimo_acesso' desc nulls last) from (
        select jsonb_build_object(
          'id', au.id,
          'email', au.email,
          'criado_em', au.created_at,
          'ultimo_acesso', au.last_sign_in_at,
          'confirmado', au.email_confirmed_at is not null,
          'admin', exists (select 1 from public.grafo_admins a where a.user_id = au.id),
          'bloqueado', exists (select 1 from public.grafo_bloqueados b where b.user_id = au.id),
          'motivo', (select b.motivo from public.grafo_bloqueados b where b.user_id = au.id),
          'temas', coalesce((select jsonb_agg(t.tema) from public.grafo_temas_liberados t where t.user_id = au.id), '[]'::jsonb),
          'projetos', coalesce((select count(*) from jsonb_object_keys(d.projects)), 0),
          'salvo_em', d.updated_at,
          'tamanho', coalesce(octet_length(d.projects::text), 0)
        ) as u
        from auth.users au
        left join public.grafo_user_data d on d.user_id = au.id
      ) s), '[]'::jsonb),
    'aviso', (select jsonb_build_object('texto', texto, 'tipo', tipo, 'criado_em', criado_em) from public.grafo_avisos where ativo order by id desc limit 1),
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

notify pgrst, 'reload schema';
