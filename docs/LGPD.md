# LGPD no Grafo

Registro interno de como o Grafo trata dados pessoais (art. 37 da LGPD) e o que
fazer em caso de incidente. O texto para quem usa o site é a
[Política de Privacidade](../privacidade.html), publicada em `/privacidade`.
Se algo aqui mudar, atualize a política também (e a versão dela, ver abaixo).

## Controlador e contato

- Controlador: Iago Ariel Gularte Barbosa (responsável pelo Grafo).
- Canal do titular (art. 41): o e-mail que aparece na seção 1 da política.
  Como agente de pequeno porte (Resolução CD/ANPD nº 2/2022), o Grafo não é
  obrigado a nomear um encarregado, mas precisa manter esse canal.
- Prazo de resposta a pedidos do titular: 15 dias (art. 19).

## Registro das operações de tratamento

| Dado | Onde fica | Finalidade | Base legal | Prazo |
|---|---|---|---|---|
| Nome, e-mail, senha (hash), aceite da política | Supabase Auth (`auth.users`, `user_metadata`) | Conta e login | Contrato (art. 7º, V); aceite: obrigação legal (II) | Enquanto a conta existir |
| Projetos pessoais | `grafo_user_data` | Guardar os diagramas | Contrato | Enquanto a conta existir |
| Biblioteca e anexos | `grafo_biblioteca`, Storage `documentos/<id>/` | Guardar documentos | Contrato | Enquanto a conta existir |
| Projetos de equipe, membros (e-mail, papel), convites | `grafo_projetos_equipe`, `grafo_membros`, `grafo_convites*`, `grafo_grupos` | Trabalho em equipe | Contrato | Enquanto o projeto existir |
| Histórico de versões (e-mail de quem salvou) | `grafo_versoes` | Restaurar versões | Contrato | 60 versões / 90 dias |
| Links de compartilhamento | `grafo_compartilhamentos` | Mostrar o projeto a quem tem o link | Contrato | Até desativar |
| Registro de erros (sem dados de projeto) | `grafo_erros` | Corrigir falhas | Legítimo interesse (IX) | 90 dias |
| Administração (bloqueios, temas, admins, avisos) | `grafo_bloqueados`, `grafo_temas_liberados`, `grafo_admins`, `grafo_avisos` | Operar o serviço e evitar abuso | Legítimo interesse | Enquanto a conta existir |
| Imagem enviada a "Ler imagem" | Não fica guardada; vai à Anthropic (`api/ler-imagem.js`) | Ler portas com IA | Contrato | Não guardada pelo Grafo |

Operadores (art. 39): Supabase (banco, login, e-mail, arquivos), Vercel
(hospedagem), jsDelivr (bibliotecas), Anthropic (só "Ler imagem"), Have I Been
Pwned (recebe só 5 caracteres do SHA-1 da senha nova; `senhaVazada` em `auth.js`). Todos com
servidores possivelmente fora do Brasil (art. 33, II e IX).

O site não usa cookies de rastreamento, análise de visitantes nem anúncios. As
fontes ficam em `assets/fonts` (nada é pedido ao Google).

## Direitos do titular no próprio site

- Acesso e portabilidade: **Minha conta → Baixar todos os meus dados** (`baixarMeusDados` em `assets/js/conta/auth.js`).
- Correção: nome em **Minha conta**; projetos no editor.
- Eliminação: **Minha conta → Excluir minha conta**. Apaga os anexos do Storage
  (`apagarArquivosDaConta`) e depois chama `excluir_minha_conta`, que tira o
  e-mail do histórico das equipes e apaga a conta (o resto sai em cascata).
- Pedidos que não dá para fazer pelo site (oposição, dúvidas): pelo e-mail de contato.

## Configurações que ficam no painel (não estão no código)

- Supabase → Authentication → Sign In / Providers → Email: senha mínima de
  **8 caracteres**, se o plano permitir. O site já exige 8 no cadastro e na troca
  de senha, e confere senhas vazadas pelo Have I Been Pwned (no Supabase essa
  proteção é só do plano Pro).
- Supabase, GitHub e Vercel: **verificação em duas etapas** em todas as contas de administração.
- Supabase → Advisors (Security e Performance): rodar depois de cada migração.
- Storage → bucket `documentos`: **Public desligado**.

## Mudar a política

1. Edite `privacidade.html` e troque a data da versão no topo.
2. Troque `VERSAO_PRIVACIDADE` em `assets/js/conta/auth.js` para a mesma data.
3. Em mudanças importantes, avise antes no Grafo (painel de admin → comunicado).

## Incidente de segurança (art. 48 e Resolução CD/ANPD nº 15/2024)

1. **Conter:** trocar chaves e senhas expostas (Supabase, Vercel, Anthropic,
   GitHub), bloquear contas envolvidas, tirar do ar o que estiver vazando.
2. **Avaliar:** quais dados, de quantas pessoas, desde quando, e se pode trazer
   risco ou dano relevante (dados de login, arquivos anexados, dados de clientes
   dentro dos projetos).
3. **Comunicar**, se houver risco ou dano relevante, em até **3 dias úteis**
   depois de confirmar o incidente:
   - à ANPD, pelo formulário de comunicação de incidente em gov.br/anpd;
   - às pessoas afetadas, por e-mail e pelo comunicado do painel de admin,
     dizendo o que aconteceu, quais dados, o que foi feito e o que elas devem fazer.
4. **Registrar** o incidente (data, dados, pessoas, medidas) e guardar o
   registro por pelo menos 5 anos, mesmo quando não precisar comunicar.
