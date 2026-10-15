-- Administração: quem está em grafo_admins é administrador; todos os outros são
-- usuários comuns. O painel "Administração" do app só aparece para admins e lê
-- tudo pela função grafo_admin_painel(), que recusa quem não é admin.
-- O admin NÃO ganha acesso direto às tabelas dos outros: só ao resumo abaixo.
-- Para tornar alguém admin, use o insert do fim (troque o e-mail).

create table if not exists public.grafo_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.grafo_admins enable row level security;
revoke all on public.grafo_admins from anon, authenticated;

-- Sou admin? (usado pelo app para mostrar ou não o painel)
create or replace function public.grafo_eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grafo_admins where user_id = auth.uid());
$$;
revoke all on function public.grafo_eh_admin() from public, anon;
grant execute on function public.grafo_eh_admin() to authenticated;

-- Resumo para o painel: contas, uso, erros recentes e arquivos.
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
revoke all on function public.grafo_admin_painel() from public, anon;
grant execute on function public.grafo_admin_painel() to authenticated;

-- Torne a SUA conta admin (troque pelo e-mail com que você entra no Grafo):
insert into public.grafo_admins (user_id)
select id from auth.users where lower(email) = lower('SEU_EMAIL_AQUI')
on conflict do nothing;
