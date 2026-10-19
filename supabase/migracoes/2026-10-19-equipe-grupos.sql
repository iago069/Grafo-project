-- Equipe com vários diagramas e acesso por diagrama. Execute uma vez no SQL
-- Editor do Supabase, depois de 2026-09-29-equipes.sql.
--
-- Um grupo junta vários diagramas de equipe com o mesmo dono e um só link de
-- convite. Para cada diagrama, o dono escolhe o acesso padrão de quem entra
-- (ver ou editar) e depois ajusta pessoa por pessoa: sem acesso, ver ou editar.
-- Quem só vê não consegue gravar: a regra de edição passa a exigir papel "editar".
-- Os diagramas de equipe antigos (sem grupo) continuam funcionando como antes.

alter table public.grafo_membros add column if not exists papel text not null default 'editar';
alter table public.grafo_membros drop constraint if exists grafo_membros_papel_check;
alter table public.grafo_membros add constraint grafo_membros_papel_check check (papel in ('ver', 'editar'));

create table if not exists public.grafo_grupos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  criado_em timestamptz not null default now()
);

alter table public.grafo_projetos_equipe add column if not exists grupo uuid references public.grafo_grupos(id) on delete set null;
alter table public.grafo_projetos_equipe add column if not exists papel_padrao text not null default 'editar';
alter table public.grafo_projetos_equipe drop constraint if exists grafo_projetos_equipe_papel_padrao_check;
alter table public.grafo_projetos_equipe add constraint grafo_projetos_equipe_papel_padrao_check check (papel_padrao in ('ver', 'editar'));

create table if not exists public.grafo_convites_grupo (
  grupo uuid primary key references public.grafo_grupos(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now()
);

create or replace function public.grafo_eh_dono_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grafo_grupos g where g.id = p_grupo and g.dono = (select auth.uid()));
$$;

create or replace function public.grafo_pode_editar(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grafo_membros m
    where m.projeto = p_projeto and m.usuario = (select auth.uid()) and m.papel = 'editar');
$$;

alter table public.grafo_grupos enable row level security;
alter table public.grafo_convites_grupo enable row level security;
revoke all on public.grafo_grupos, public.grafo_convites_grupo from anon;
grant select on public.grafo_grupos to authenticated;
grant select, insert, update, delete on public.grafo_convites_grupo to authenticated;
-- Papel e grupo só mudam pelas funções abaixo.
revoke update on public.grafo_membros from authenticated;

drop policy if exists "Membros veem o grupo" on public.grafo_grupos;
create policy "Membros veem o grupo" on public.grafo_grupos for select to authenticated
using (dono = (select auth.uid()) or exists (
  select 1 from public.grafo_projetos_equipe p where p.grupo = grafo_grupos.id and public.grafo_eh_membro(p.id)));

drop policy if exists "Dono gerencia o convite do grupo" on public.grafo_convites_grupo;
create policy "Dono gerencia o convite do grupo" on public.grafo_convites_grupo for all to authenticated
using (public.grafo_eh_dono_grupo(grupo)) with check (public.grafo_eh_dono_grupo(grupo));

-- Quem só vê não grava.
drop policy if exists "Membros editam o projeto" on public.grafo_projetos_equipe;
create policy "Membros editam o projeto" on public.grafo_projetos_equipe for update to authenticated
using (public.grafo_pode_editar(id)) with check (public.grafo_pode_editar(id));

-- Ninguém muda dono, id, grupo nem acesso padrão pela gravação normal.
create or replace function public.grafo_proteger_projeto_equipe()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.dono := old.dono;
  new.grupo := old.grupo;
  new.papel_padrao := old.papel_padrao;
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

-- Cria o grupo com os diagramas escolhidos. p_projetos: [{ "nome", "dados", "papel" }].
create or replace function public.grafo_criar_grupo(p_nome text, p_projetos jsonb)
returns table (grupo uuid, nome text, id uuid, atualizado_em timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid;
  v_item jsonb;
  v_id uuid;
  v_em timestamptz;
  v_papel text;
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  if jsonb_typeof(p_projetos) <> 'array' or jsonb_array_length(p_projetos) = 0 then raise exception 'Escolha ao menos um diagrama.'; end if;
  if (select count(*) from public.grafo_projetos_equipe p where p.dono = auth.uid()) + jsonb_array_length(p_projetos) > 100 then
    raise exception 'Limite de 100 projetos de equipe por conta.';
  end if;
  insert into public.grafo_grupos (dono, nome) values (auth.uid(), left(coalesce(nullif(trim(p_nome), ''), 'Equipe'), 60)) returning public.grafo_grupos.id into v_grupo;
  insert into public.grafo_convites_grupo (grupo) values (v_grupo);
  for v_item in select * from jsonb_array_elements(p_projetos) loop
    v_papel := case when v_item ->> 'papel' = 'ver' then 'ver' else 'editar' end;
    insert into public.grafo_projetos_equipe (dono, nome, dados, atualizado_por, grupo, papel_padrao)
    values (auth.uid(), left(v_item ->> 'nome', 60), v_item -> 'dados', auth.uid(), v_grupo, v_papel)
    returning public.grafo_projetos_equipe.id, public.grafo_projetos_equipe.atualizado_em into v_id, v_em;
    insert into public.grafo_membros (projeto, usuario, email, papel) values (v_id, auth.uid(), auth.jwt() ->> 'email', 'editar');
    grupo := v_grupo; nome := v_item ->> 'nome'; id := v_id; atualizado_em := v_em;
    return next;
  end loop;
end;
$$;

-- Põe mais um diagrama num grupo seu. Quem já está no grupo recebe o acesso padrão.
create or replace function public.grafo_adicionar_ao_grupo(p_grupo uuid, p_nome text, p_dados jsonb, p_papel text)
returns table (id uuid, atualizado_em timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_em timestamptz;
  v_papel text := case when p_papel = 'ver' then 'ver' else 'editar' end;
begin
  if not public.grafo_eh_dono_grupo(p_grupo) then raise exception 'Só o dono mexe no grupo.'; end if;
  insert into public.grafo_projetos_equipe (dono, nome, dados, atualizado_por, grupo, papel_padrao)
  values (auth.uid(), left(p_nome, 60), p_dados, auth.uid(), p_grupo, v_papel)
  returning public.grafo_projetos_equipe.id, public.grafo_projetos_equipe.atualizado_em into v_id, v_em;
  insert into public.grafo_membros (projeto, usuario, email, papel)
  select v_id, m.usuario, max(m.email), case when m.usuario = auth.uid() then 'editar' else v_papel end
    from public.grafo_membros m join public.grafo_projetos_equipe p on p.id = m.projeto
   where p.grupo = p_grupo group by m.usuario
  on conflict do nothing;
  return query select v_id, v_em;
end;
$$;

-- Entra no grupo do convite: cada diagrama com o acesso padrão dele.
create or replace function public.grafo_aceitar_convite_grupo(p_token uuid)
returns table (id uuid, nome text, dono uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid;
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  select c.grupo into v_grupo from public.grafo_convites_grupo c where c.token = p_token;
  if v_grupo is null then return; end if;
  insert into public.grafo_membros (projeto, usuario, email, papel)
  select p.id, auth.uid(), auth.jwt() ->> 'email', p.papel_padrao from public.grafo_projetos_equipe p where p.grupo = v_grupo
  on conflict do nothing;
  return query select p.id, p.nome, p.dono from public.grafo_projetos_equipe p where p.grupo = v_grupo order by p.nome;
end;
$$;

-- Dono escolhe o acesso de uma pessoa a um diagrama do grupo: 'nenhum', 'ver' ou 'editar'.
create or replace function public.grafo_definir_acesso(p_projeto uuid, p_usuario uuid, p_papel text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid;
  v_email text;
begin
  select p.grupo into v_grupo from public.grafo_projetos_equipe p where p.id = p_projeto and p.dono = auth.uid();
  if v_grupo is null then raise exception 'Só o dono do grupo muda os acessos.'; end if;
  if p_usuario = auth.uid() then raise exception 'O dono sempre edita.'; end if;
  if p_papel = 'nenhum' then
    delete from public.grafo_membros m where m.projeto = p_projeto and m.usuario = p_usuario;
    return;
  end if;
  if p_papel not in ('ver', 'editar') then raise exception 'Acesso inválido.'; end if;
  select max(m.email) into v_email from public.grafo_membros m join public.grafo_projetos_equipe p on p.id = m.projeto
   where p.grupo = v_grupo and m.usuario = p_usuario;
  if v_email is null and not exists (select 1 from public.grafo_membros m join public.grafo_projetos_equipe p on p.id = m.projeto
     where p.grupo = v_grupo and m.usuario = p_usuario) then
    raise exception 'Essa pessoa não está no grupo.';
  end if;
  insert into public.grafo_membros (projeto, usuario, email, papel) values (p_projeto, p_usuario, v_email, p_papel)
  on conflict (projeto, usuario) do update set papel = excluded.papel;
end;
$$;

revoke all on function public.grafo_eh_dono_grupo(uuid), public.grafo_pode_editar(uuid),
  public.grafo_criar_grupo(text, jsonb), public.grafo_adicionar_ao_grupo(uuid, text, jsonb, text),
  public.grafo_aceitar_convite_grupo(uuid), public.grafo_definir_acesso(uuid, uuid, text) from public, anon;
grant execute on function public.grafo_eh_dono_grupo(uuid), public.grafo_pode_editar(uuid),
  public.grafo_criar_grupo(text, jsonb), public.grafo_adicionar_ao_grupo(uuid, text, jsonb, text),
  public.grafo_aceitar_convite_grupo(uuid), public.grafo_definir_acesso(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
