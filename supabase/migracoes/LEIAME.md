# Migrações do banco (Supabase)

Banco novo: rode só o [`../schema.sql`](../schema.sql) e depois estas migrações.
Cada arquivo roda **uma vez**, no SQL Editor do Supabase, **nesta ordem**:

| # | Arquivo | O que liga |
|---|---|---|
| 1 | `2026-09-28-excluir-conta.sql` | Excluir conta |
| 2 | `2026-09-28-compartilhar.sql` | Links só para visualizar (Compartilhar) |
| 3 | `2026-09-29-equipes.sql` | Projetos de equipe |
| 4 | `2026-09-29-historico.sql` | Histórico de versões (depois de equipes) |
| 5 | `2026-09-30-erros.sql` | Registro de erros dos usuários |
| 6 | `2026-10-15-admin.sql` | Painel de administração (`grafo_admins`) |
| 7 | `2026-10-15-documentos.sql` | Arquivos anexados (crie antes o bucket `documentos`) |
| 8 | `2026-10-15-temas-liberados.sql` | Temas exclusivos (depois do admin) |
| 9 | `2026-10-16-admin-permissoes.sql` | Bloquear contas, comunicado, tornar admin pelo painel |
| 10 | `2026-10-16-biblioteca.sql` | Biblioteca (estantes, livros e páginas) |
| 11 | `2026-10-19-equipe-grupos.sql` | Equipes com vários diagramas |
| 12 | `2026-10-19-equipe-agrupar.sql` | Agrupar diagramas da equipe (depois do 11) |
| 13 | `2026-10-30-lgpd-excluir-conta.sql` | LGPD: excluir conta tira o e-mail do histórico das equipes |

Os nomes começam pela data em que a migração foi criada; quando duas têm a
mesma data, vale a ordem da tabela acima.
