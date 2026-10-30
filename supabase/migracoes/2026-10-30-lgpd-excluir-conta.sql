-- LGPD: excluir a conta apaga também o e-mail da pessoa no histórico de
-- projetos de equipe de OUTRAS pessoas (grafo_versoes.criado_por_email).
-- O resto já sai junto com a conta (on delete cascade); os arquivos anexados
-- (Storage) o próprio site apaga antes de chamar esta função (auth.js).
-- Execute uma vez no SQL Editor do Supabase (também está em supabase/schema.sql).
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
  -- As versões continuam no histórico da equipe, sem dizer quem salvou.
  update public.grafo_versoes set criado_por = null, criado_por_email = null where criado_por = auth.uid();
  -- grafo_user_data, projetos, equipes, histórico próprio, erros etc. saem junto (on delete cascade).
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
