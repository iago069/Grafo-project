-- Juntar projetos de equipe antigos (sem grupo) numa equipe com vários
-- diagramas. Execute uma vez no SQL Editor, depois de 2026-10-19-equipe-grupos.sql.
-- Quem já estava num projeto antigo continua nele, com acesso de edição; o dono
-- ajusta depois pessoa por pessoa.

-- A gravação normal não muda grupo nem acesso padrão; só grafo_agrupar muda.
create or replace function public.grafo_proteger_projeto_equipe()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.dono := old.dono;
  if coalesce(current_setting('grafo.agrupando', true), '') <> 'sim' then
    new.grupo := old.grupo;
    new.papel_padrao := old.papel_padrao;
  end if;
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

-- p_existentes: [{ "id", "papel" }] projetos de equipe seus, sem grupo.
-- p_novos: [{ "nome", "dados", "papel" }] diagramas pessoais.
create or replace function public.grafo_agrupar(p_nome text, p_existentes jsonb, p_novos jsonb)
returns table (grupo uuid, nome text, id uuid, atualizado_em timestamptz, novo boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid;
  v_item jsonb;
  v_id uuid;
  v_em timestamptz;
  v_papel text;
  v_nome text;
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  p_existentes := coalesce(p_existentes, '[]'::jsonb);
  p_novos := coalesce(p_novos, '[]'::jsonb);
  if jsonb_array_length(p_existentes) + jsonb_array_length(p_novos) = 0 then raise exception 'Escolha ao menos um diagrama.'; end if;
  insert into public.grafo_grupos (dono, nome) values (auth.uid(), left(coalesce(nullif(trim(p_nome), ''), 'Equipe'), 60)) returning public.grafo_grupos.id into v_grupo;
  insert into public.grafo_convites_grupo (grupo) values (v_grupo);
  perform set_config('grafo.agrupando', 'sim', true);
  for v_item in select * from jsonb_array_elements(p_existentes) loop
    v_papel := case when v_item ->> 'papel' = 'ver' then 'ver' else 'editar' end;
    update public.grafo_projetos_equipe p set grupo = v_grupo, papel_padrao = v_papel
     where p.id = (v_item ->> 'id')::uuid and p.dono = auth.uid() and p.grupo is null
    returning p.id, p.nome, p.atualizado_em into v_id, v_nome, v_em;
    if v_id is null then raise exception 'Projeto de equipe inválido.'; end if;
    grupo := v_grupo; nome := v_nome; id := v_id; atualizado_em := v_em; novo := false;
    return next;
    v_id := null;
  end loop;
  perform set_config('grafo.agrupando', '', true);
  -- Quem já estava nos projetos antigos passa a ter acesso padrão nos novos.
  for v_item in select * from jsonb_array_elements(p_novos) loop
    v_papel := case when v_item ->> 'papel' = 'ver' then 'ver' else 'editar' end;
    insert into public.grafo_projetos_equipe (dono, nome, dados, atualizado_por, grupo, papel_padrao)
    values (auth.uid(), left(v_item ->> 'nome', 60), v_item -> 'dados', auth.uid(), v_grupo, v_papel)
    returning public.grafo_projetos_equipe.id, public.grafo_projetos_equipe.atualizado_em into v_id, v_em;
    insert into public.grafo_membros (projeto, usuario, email, papel)
    select v_id, m.usuario, max(m.email), case when m.usuario = auth.uid() then 'editar' else v_papel end
      from public.grafo_membros m join public.grafo_projetos_equipe p on p.id = m.projeto
     where p.grupo = v_grupo and p.id <> v_id group by m.usuario
    on conflict do nothing;
    insert into public.grafo_membros (projeto, usuario, email, papel) values (v_id, auth.uid(), auth.jwt() ->> 'email', 'editar')
    on conflict do nothing;
    grupo := v_grupo; nome := v_item ->> 'nome'; id := v_id; atualizado_em := v_em; novo := true;
    return next;
  end loop;
end;
$$;

revoke all on function public.grafo_agrupar(text, jsonb, jsonb) from public, anon;
grant execute on function public.grafo_agrupar(text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
