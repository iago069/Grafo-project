# Grafo

**G**erador **R**ápido **A**utomatizado de **F**luxos **O**rganizados — monta diagramas de topologia de rede (OLTs, switches, roteadores, ONUs, servidores, nobreaks…) direto no navegador, a partir dos equipamentos e cabos que você cadastra. Cada pessoa entra com a própria conta e os projetos ficam salvos na nuvem.

**Acesse:** https://thegrafo.vercel.app

![Diagrama de exemplo no Grafo](docs/Layout1.png)

## Sumário

- [Recursos](#recursos)
- [Como usar](#como-usar)
- [Atalhos](#atalhos)
- [Importar e exportar](#importar-e-exportar)
- [Onde ficam os dados](#onde-ficam-os-dados)
- [Ícones dos equipamentos](#ícones-dos-equipamentos)
- [Configuração (para quem mantém o projeto)](#configuração-para-quem-mantém-o-projeto)
  - [1. Supabase (login e banco)](#1-supabase-login-e-banco)
  - [2. Rodar localmente](#2-rodar-localmente)
  - [3. Publicar na Vercel](#3-publicar-na-vercel)
  - [Problemas comuns](#problemas-comuns)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Tecnologias](#tecnologias)
- [Licença e direitos autorais](#licença-e-direitos-autorais)

## Recursos

**Conta e nuvem**
- Login com e-mail e senha, criação de conta e recuperação de senha por e-mail.
- Cada pessoa vê só os próprios projetos, salvos automaticamente na nuvem.
- Indicador no topo: **Salvo na nuvem**, **Alterações pendentes** ou erro com **Tentar novamente**.
- No primeiro login, o app oferece copiar para a conta os projetos que já estavam salvos no navegador.

**Diagrama**
- Layout automático, recalculado a cada mudança, com cabos em ângulo reto e cada porta no lado voltado para o vizinho.
- Cabos desviam uns dos outros, **não passam por cima de equipamentos** e contornam as caixas de outros grupos.
- **Grupos** (rack, sala, POP) viram caixas em volta dos equipamentos; se duas caixas se encostam, o grupo é empurrado para fora automaticamente — o grupo que você acabou de arrastar fica parado.
- **Status** por equipamento: ativo, em manutenção ou offline.
- **Capacidade** livre nos cabos, padronizada sozinha (`10 gbps` → `10G`, `2,5g` → `2.5G`, `100 Mb` → `100M`).
- Estilo do cabo: contínuo, tracejado ou pontilhado, com cor e espessura.

**Edição**
- Duplo clique (ou Enter) num equipamento ou cabo abre o editor, com opção de excluir.
- Arrastar com o mouse ou mover com as setas do teclado.
- **Editar em lista**: todos os equipamentos e cabos numa tabela, com filtro.
- **Limpar…**: remove tudo, só os cabos, ou os equipamentos de um tipo, grupo ou status.
- Desfazer / refazer.

**Navegação**
- **Busca** por nome, IP ou modelo, com destaque no diagrama.
- **Rastrear caminho**: escolha dois equipamentos e o menor caminho de cabos entre eles é destacado.
- **Organizar** refaz o layout respeitando os grupos, na direção escolhida (esquerda → direita ou cima → baixo).
- Zoom animado (botões, roda do mouse) e arrastar para mover a área.

**Projetos e interface**
- Vários projetos por conta, com backup em JSON e importação de CSV.
- Exportação em **PNG** e **SVG** com cabeçalho (projeto, data, totais) e legenda.
- Temas claros, escuros e de alto contraste; barra lateral recolhível.
- Avisos rápidos no canto da tela ao exportar, importar ou copiar.
- Respeita a opção "reduzir movimento" do sistema.
- Botão **Carregar exemplo** na tela vazia para ver a ferramenta funcionando.

## Como usar

1. Abra https://thegrafo.vercel.app, clique em **Criar conta** e confirme pelo link enviado ao seu e-mail (veja também o spam).
2. **Adicionar equipamento** (barra lateral): nome, tipo, modelo, IP, grupo, status e ícone.
3. **Adicionar cabeamento**: origem, destino, portas, tipo de enlace, capacidade, cor e estilo.
4. O diagrama é redesenhado sozinho. Arraste os equipamentos para ajustar, ou use **Organizar**.
5. **Exportar diagrama** gera PNG ou SVG; **Exportar projeto (.json)** guarda um backup.

Esqueceu a senha? Na tela de login, clique em **Esqueci minha senha** e siga o link do e-mail.

## Atalhos

| Onde | Tecla | Ação |
|---|---|---|
| Qualquer lugar | `Ctrl+S` | Exportar o projeto (.json) |
| Equipamento selecionado | `Enter` / `F2` | Abrir o editor |
| Equipamento selecionado | `←` `↑` `→` `↓` | Mover 10 px (`Shift` + seta: 50 px) |
| Cabo selecionado | `Enter` / `F2` | Abrir o editor |
| Busca | `Enter` / `Shift+Enter` | Próximo / anterior resultado |
| Busca | `Esc` | Limpar a busca |
| Janelas | `Esc` | Fechar |

## Importar e exportar

### Projeto em JSON

**Projeto → Exportar projeto (.json)** e **Importar projeto (.json)** na barra lateral. A importação cria um projeto novo. Também dá para colar o JSON em **Editar em lista → Importar / exportar JSON e CSV → Aplicar JSON acima** (isso substitui o projeto aberto; o ↶ desfaz).

Formato:

```json
{
  "projeto": "Meu POP",
  "equipamentos": [
    { "id": "olt1", "nome": "OLT-01", "tipo": "OLT", "modelo": "DM4610", "ip": "10.0.0.10", "grupo": "POP Centro", "status": "ativo" },
    { "id": "sw1",  "nome": "SW-CORE", "tipo": "Switch", "ip": "10.0.0.2", "grupo": "POP Centro", "status": "manutencao" }
  ],
  "conexoes": [
    { "de": "sw1", "para": "olt1", "tipo": "Fibra", "saida": "sfp2", "chegada": "xe1/1/1", "potencia": "10G", "cor": "#5A7284", "grossura": 2, "estilo": "solid" }
  ]
}
```

| Campo | Regras |
|---|---|
| `id`, `nome` | Obrigatórios; `id` não pode repetir |
| `ip` | IPv4 ou IPv6, com máscara opcional (`10.0.0.0/24`) |
| `status` | `ativo`, `manutencao` ou `offline` (aceita "Manutenção", "OFFLINE"…) |
| `estilo` | `solid`, `dashed` ou `dotted` (aceita "contínuo", "tracejado", "pontilhado") |
| `cor` | Formato `#1A2B3C` |
| `grossura` | De 1 a 10 |
| `de` / `para` | Precisam ser `id`s de equipamentos existentes e diferentes entre si |

Se algo estiver errado, **nada é alterado** e o app lista cada problema com o item e o campo.

Limites: 500 equipamentos, 2000 cabos e 100 projetos.

### CSV

Em **Editar em lista → Importar / exportar JSON e CSV → Importar CSV** (o botão **Baixar modelo CSV** gera um exemplo). Uma linha por cabo; os equipamentos são criados pelos nomes. Linha sem `destino` cadastra só o equipamento. A importação substitui o projeto aberto — o ↶ desfaz.

| Coluna | Também aceita | Exemplo |
|---|---|---|
| `origem` (obrigatória) | `de`, `equipamento`, `nome` | `OLT-01` |
| `destino` | `para` | `SW-CORE` |
| `porta_origem` / `porta_destino` | `saida` / `chegada` | `xe1/1/1` |
| `ip_origem` / `ip_destino` | `ip` | `10.0.0.2` |
| `modelo_origem` / `modelo_destino` | `modelo` | `DM4270` |
| `tipo_origem` / `tipo_destino` | `tipo_equipamento` | `OLT` |
| `tipo` | `enlace`, `cabo` | `Fibra` |
| `capacidade` | `potencia`, `velocidade` | `10G` |

Separador `;`, `,` ou tab. O arquivo pode estar em UTF-8 ou no formato padrão do Excel em português (Windows-1252). Nomes de coluna não diferenciam maiúsculas nem acentos.

### Imagem do diagrama

**Baixar PNG** e **Baixar SVG** (acima do diagrama) ou **Exportar diagrama** na barra lateral. O arquivo sai com cabeçalho (projeto, data, totais) e legenda.

## Onde ficam os dados

Os projetos ficam na sua conta, no Supabase, e são salvos automaticamente poucos segundos depois de cada mudança. Enquanto você está logado, o navegador mantém uma cópia local separada por usuário; ao clicar em **Sair**, essa cópia é apagada e os projetos continuam na conta.

- Use **Exportar projeto (.json)** (ou `Ctrl+S`) para guardar também um backup fora da nuvem. Um aviso no topo lembra de fazer isso quando o último backup tem 7 dias ou mais.
- Evite editar a mesma conta em duas abas ou computadores ao mesmo tempo: vale o último salvamento.

## Ícones dos equipamentos

O ícone é escolhido pelo tipo ou nome do equipamento, ou manualmente no editor.

| Tipo | Arquivo | Reconhece |
|---|---|---|
| OLT | `OLT.jpeg` | "olt" |
| Switch | `SWITCH.jpeg` | "switch" |
| Roteador / MikroTik | `MIKROTIK.png` | "mikrotik", "roteador", "rb/" |
| ONU / ONT | `ONU.svg` | "onu", "ont" |
| Servidor | `SERVIDOR.svg` | "servidor", "server" |
| Nobreak / UPS | `NOBREAK.jpeg` | "nobreak" |
| Retificador / RPS | `RETIFICADOR.jpeg` | "retificador", "rps" |
| Ar-condicionado | `AR.jpeg` | "ar", "hvac", "climatiz…" |
| VOLT | `VOLT.jpeg` | "volt" |
| Câmera | `CAMERA.jpeg` | "câmera", "camera" |

Também dá para usar um emoji ou enviar uma imagem própria pelo campo **Imagem** (é reduzida para 256 px).

A lista de tipos sugeridos vem de `data/equipamentos.json` — **edite ali** para adicionar tipos. Ao adicionar ou trocar uma imagem em `assets/images/`, rode `npm run icones` para atualizar `assets/js/icones-embutidos.js`, que a exportação usa para colocar os ícones dentro do PNG/SVG.

## Configuração (para quem mantém o projeto)

O login usa **Supabase Auth** (e-mail e senha). Os projetos ficam na tabela `grafo_user_data`, protegida por Row Level Security: cada pessoa só lê e grava a própria linha. O navegador recebe a URL e a chave pública do Supabase pela rota `/api/auth-config`; sem elas, o app mostra um erro de configuração e mantém o editor fechado.

### 1. Supabase (login e banco)

1. Crie um projeto em https://supabase.com/dashboard (região sugerida: São Paulo).
2. **SQL Editor → New query**: cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Deve aparecer "Success. No rows returned".
3. **Authentication → Sign In / Providers**: deixe **Email** ligado. A opção **Confirm email** exige confirmar o e-mail antes do primeiro login — pode desligar para testes, mas mantenha ligada em produção.
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://thegrafo.vercel.app`
   - **Redirect URLs**: adicione `https://thegrafo.vercel.app` e `http://localhost:3000` (e o seu domínio próprio, se tiver). Sem isso, os links de confirmação e de recuperação de senha não voltam para o app.
5. Anote as duas informações que o app usa:
   - **Project URL** — em **Project Settings → Data API**. Ex.: `https://abcdxyz.supabase.co` (**sem** `/rest/v1/` no final).
   - **Publishable key** — em **Project Settings → API Keys** (começa com `sb_publishable_`; em projetos antigos, a **anon public**).

> **Nunca** use a chave `secret` ou `service_role` no `.env`, na Vercel ou no front-end. A publishable é feita para ficar pública; a proteção dos dados vem das regras da tabela.

### 2. Rodar localmente

Requer **Node.js 18+**.

```bash
npm install
copy .env.example .env    # Windows — no Mac/Linux: cp .env.example .env
```

Abra o `.env` e preencha:

```
SUPABASE_URL=https://abcdxyz.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

Depois:

```bash
npm start        # http://localhost:3000
```

O `servidor-local.js` lê o `.env` sozinho ao iniciar — se mudar o arquivo, pare o servidor (`Ctrl+C`) e rode `npm start` de novo. O `.env` não vai para o Git nem para a Vercel.

| Script | O que faz |
|---|---|
| `npm start` | Sobe o servidor local (`servidor-local.js`) |
| `npm run dev` | Igual ao `start`, reiniciando ao salvar o `servidor-local.js` |
| `npm run icones` | Gera `assets/js/icones-embutidos.js` |

A porta pode ser trocada com a variável `PORT`. Depois de atualizar os arquivos, recarregue a página com **Ctrl+F5**.

### 3. Publicar na Vercel

O projeto `thegrafo` na Vercel está ligado a este repositório: **cada envio para o branch `main` publica o site automaticamente**. O `index.html` e os `assets/` são estáticos; `api/equipamentos.js` e `api/auth-config.js` viram funções serverless; o `vercel.json` redireciona as demais rotas para o `index.html`.

Variáveis de ambiente (configurar uma vez):

1. No projeto da Vercel, abra **Settings → Environments → Production**.
2. Em **Environment Variables**, adicione:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | Project URL do Supabase |
   | `SUPABASE_PUBLISHABLE_KEY` | Publishable key do Supabase |

   Repita em **Preview** se usar deploys de outros branches.
3. As variáveis só valem para deploys novos: em **Deployments**, no deploy mais recente, clique em **⋯ → Redeploy**.

Para conferir, abra `https://thegrafo.vercel.app/api/auth-config`: deve mostrar a URL e a chave. Um erro 503 significa que as variáveis não estão configuradas (ou faltou o redeploy).

Também é possível publicar direto do computador com a Vercel CLI: `npx vercel deploy --prod`.

### Problemas comuns

| Mensagem ou sintoma | Causa e solução |
|---|---|
| "Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no servidor" | Faltam as variáveis: no `.env` (local) ou na Vercel (site). Na Vercel, faça **Redeploy** depois de criá-las |
| "E-mail ou senha incorretos" | Confira a senha, ou crie a conta primeiro |
| "Confirme seu e-mail antes de entrar" | Clique no link do e-mail de confirmação (veja o spam) |
| O link do e-mail abre `localhost` ou dá erro | Ajuste **Site URL** e **Redirect URLs** no Supabase (passo 1.4) |
| "Não foi possível carregar os projetos" | A tabela não existe ou a URL está errada: rode o `schema.sql` e confira se a URL não termina em `/rest/v1/` |
| "Muitas tentativas seguidas" | Limite do Supabase; aguarde um minuto |
| `npm.ps1 não pode ser carregado` (PowerShell) | Use `npm.cmd start` no lugar de `npm start` |
| `EADDRINUSE :::3000` | Já há um servidor rodando na porta 3000; feche o outro terminal |
| `Cannot find module 'express'` | Rode `npm install` |

## Estrutura do projeto

| Caminho | Conteúdo |
|---|---|
| `index.html` | Página única da aplicação (tela de login + editor) |
| `assets/js/auth.js` | Login, cadastro, recuperação de senha e sincronização com o Supabase |
| `assets/js/app.js` | Editor: estado, formulários, geração do DOT, roteamento dos cabos, exportação |
| `assets/js/esquema.js` | Validação dos dados (formulários, JSON, CSV e o que está salvo) |
| `assets/js/icones-embutidos.js` | Ícones em base64 para a exportação — **gerado** por `npm run icones` |
| `assets/css/styles.css` | Estilos, temas e animações |
| `assets/images/` | Ícones dos equipamentos e logo |
| `assets/vendor/` | Zod (validação), servido localmente |
| `data/equipamentos.json` | Catálogo de tipos de equipamento |
| `api/equipamentos.js` | Função da Vercel que serve o catálogo |
| `api/auth-config.js` | Função da Vercel que entrega a URL e a chave pública do Supabase |
| `supabase/schema.sql` | Tabela de projetos e regras de acesso por usuário |
| `servidor-local.js` | Servidor Express para rodar localmente; lê o `.env` |
| `.env.example` | Modelo do `.env` |
| `scripts/gerar-icones-embutidos.js` | Gera o `icones-embutidos.js` |
| `docs/` | Imagens deste README |

> O catálogo fica em `data/`, fora de `api/`, porque na Vercel `api/equipamentos.js` e `api/equipamentos.json` colidiriam na mesma rota. O servidor local se chama `servidor-local.js` (e não `server.js`) para a Vercel não tratar o projeto como app Express.

## Tecnologias

- [Viz.js](https://github.com/mdaines/viz-js) — Graphviz em WebAssembly, carregado via CDN, desenha o diagrama.
- [Supabase](https://supabase.com) — login e banco de dados dos projetos.
- [Zod](https://zod.dev) — validação dos dados.
- [Express](https://expressjs.com) — servidor local.
- HTML, CSS e JavaScript puros, sem etapa de build.

## Licença e direitos autorais

Copyright © 2026 iago069. **Todos os direitos reservados.**

O Grafo é software proprietário, protegido pela Lei nº 9.609/1998 (Lei do Software) e pela Lei nº 9.610/1998 (Direitos Autorais). **Não é código aberto**: é proibido copiar, modificar, distribuir, hospedar ou criar obras derivadas sem autorização prévia e por escrito do autor. Veja os termos completos em [LICENSE](LICENSE).
