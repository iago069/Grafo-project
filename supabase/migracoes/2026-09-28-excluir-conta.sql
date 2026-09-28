-- Para projetos Supabase criados antes de 28/09/2026: execute uma vez no SQL Editor.
-- Permite que a pessoa logada exclua a própria conta (botão "Conta" > "Excluir conta").
-- Só apaga a conta de quem chama: auth.uid() vem do token de login.
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
