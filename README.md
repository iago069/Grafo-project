# Grafo

**G**erador **R**ápido **A**utomatizado de **F**luxos **O**rganizados — monta diagramas de topologia de rede (OLTs, switches, roteadores, ONUs, servidores, nobreaks…) direto no navegador, a partir dos equipamentos e cabos que você cadastra.

![Diagrama de exemplo no Grafo](docs/Layout1.png)

## Sumário

- [Recursos](#recursos)
- [Configurar login e projetos por usuário](#configurar-login-e-projetos-por-usuário)
- [Rodando localmente](#rodando-localmente)
- [Deploy na Vercel](#deploy-na-vercel)
- [Como usar](#como-usar)
- [Atalhos](#atalhos)
- [Importar e exportar](#importar-e-exportar)
- [Onde ficam os dados](#onde-ficam-os-dados)
- [Ícones dos equipamentos](#ícones-dos-equipamentos)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Tecnologias](#tecnologias)

## Configurar login e projetos por usuário

O login usa **Supabase Auth** com e-mail e senha. Os projetos ficam na tabela
`grafo_user_data`, protegida por Row Level Security (RLS). O app não abre o
editor antes de confirmar a sessão e carregar os projetos da conta.

1. Crie um projeto no [Supabase](https://supabase.com/dashboard). No SQL Editor,
   execute `supabase/schema.sql` uma vez. A tabela guarda todos os projetos de
   cada pessoa em uma linha e as regras permitem ler/escrever somente a própria
   linha.
2. Em Authentication, habilite **Email**. Configure a URL do site
   `https://thegrafo.vercel.app` e acrescente a mesma URL às URLs de
   redirecionamento de autenticação, para confirmação de e-mail e recuperação
   de senha. Se for usar um domínio próprio, inclua-o também.
3. Na Vercel, em **Settings → Environment Variables**, crie:

   | Variável | Valor |
   | --- | --- |
   | `SUPABASE_URL` | URL do projeto Supabase |
   | `SUPABASE_PUBLISHABLE_KEY` | Chave **publishable** do projeto |

   Configure Production, Preview e Development conforme os ambientes usados e
   faça novo deploy. A rota `/api/auth-config` retorna somente esses valores
   públicos. **Nunca** coloque uma chave `secret` ou `service_role` no front-end
   ou nessa rota.
4. Para rodar localmente, copie `.env.example` para `.env`, preencha as duas
   variáveis e rode `npm start` — o `servidor-local.js` lê o `.env` sozinho
   (funciona igual no Windows, Mac e Linux). Adicione também
   `http://localhost:3000` às URLs de redirecionamento permitidas no Supabase.

   ```bash
   copy .env.example .env    # Windows (no Mac/Linux: cp .env.example .env)
   npm start
   ```

Ao entrar pela primeira vez em um navegador com projetos anteriores, o app
pergunta se deve copiá-los para a conta. A cópia antiga é removida somente
depois que a gravação no Supabase dá certo. Se a pessoa recusar, a cópia local
antiga continua intocada. As alterações novas sincronizam automaticamente;
o indicador no cabeçalho mostra `Salvo na nuvem` ou um erro com opção de
tentar novamente. Mantenha exportações JSON como backup independente.

O salvamento atual usa o último estado gravado quando duas abas editam a mesma
conta ao mesmo tempo. Evite edição simultânea do mesmo projeto até que haja
controle de versões. A autenticação real depende de configurar o projeto
Supabase e as variáveis antes de publicar; sem elas, o app mostra o erro de
configuração e mantém o editor fechado.

## Recursos

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

## Rodando localmente

Requer **Node.js 18+**.

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # reinicia sozinho ao salvar o servidor-local.js
```

A porta pode ser trocada com a variável de ambiente `PORT`.

| Script | O que faz |
|---|---|
| `npm start` | Sobe o servidor local (`servidor-local.js`) |
| `npm run dev` | Igual ao `start`, reiniciando ao salvar |
| `npm run icones` | Gera `assets/js/icones-embutidos.js` (veja [Ícones](#ícones-dos-equipamentos)) |

> Depois de atualizar os arquivos, recarregue a página com **Ctrl+F5** para o navegador não usar a versão antiga em cache.

## Deploy na Vercel

O `index.html` e os `assets/` são arquivos estáticos; `api/equipamentos.js` e `api/auth-config.js` viram funções serverless. Configure o Supabase e as variáveis acima antes do deploy. O `vercel.json` redireciona as demais rotas para o `index.html`.

## Como usar

1. **Adicionar equipamento** (barra lateral): nome, tipo, modelo, IP, grupo, status e ícone.
2. **Adicionar cabeamento**: origem, destino, portas, tipo de enlace, capacidade, cor e estilo.
3. O diagrama é redesenhado sozinho. Arraste os equipamentos para ajustar, ou use **Organizar**.
4. **Exportar diagrama** gera PNG ou SVG; **Exportar projeto (.json)** guarda um backup.

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

Os projetos são salvos na conta, no Supabase. O navegador mantém uma cópia local separada por usuário enquanto a sessão está aberta. Ao sair, essa cópia local é apagada; os projetos continuam na conta. Use **Exportar projeto (.json)** (ou `Ctrl+S`) para guardar também um backup independente.

Um aviso no topo lembra de fazer backup quando o projeto aberto tem mudanças e o último backup tem 7 dias ou mais (ou quando nunca houve backup e a primeira mudança tem mais de 1 dia). "Depois" adia o aviso por um dia.

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

A lista de tipos sugeridos vem de `data/equipamentos.json` — **edite ali** para adicionar tipos. Ao adicionar ou trocar uma imagem em `assets/images/`, rode:

```bash
npm run icones
```

Isso atualiza `assets/js/icones-embutidos.js`, que a exportação usa para colocar os ícones dentro do PNG/SVG. Sem ele, com o app aberto direto do disco (`file://`), o navegador bloqueia a leitura das imagens e o PNG sai sem os ícones.

## Estrutura do projeto

| Caminho | Conteúdo |
|---|---|
| `index.html` | Página única da aplicação |
| `assets/js/app.js` | Lógica do front-end: estado, formulários, geração do DOT, roteamento dos cabos, exportação |
| `assets/js/auth.js` | Login, cadastro, recuperação de senha e sincronização por conta |
| `assets/js/esquema.js` | Validação dos dados (formulários, JSON, CSV e o que está salvo) |
| `assets/js/icones-embutidos.js` | Ícones em base64 para a exportação — **gerado** por `npm run icones` |
| `assets/css/styles.css` | Estilos, temas e animações |
| `assets/images/` | Ícones dos equipamentos e logo |
| `assets/vendor/` | Zod (validação), servido localmente |
| `data/equipamentos.json` | Catálogo de tipos de equipamento |
| `api/equipamentos.js` | Função da Vercel que serve o catálogo |
| `api/auth-config.js` | Expõe URL e chave pública do Supabase para o navegador |
| `supabase/schema.sql` | Tabela de projetos e regras de acesso por usuário |
| `servidor-local.js` | Servidor Express para rodar localmente (não se chama `server.js` para a Vercel não tratar o projeto como app Express) |
| `scripts/gerar-icones-embutidos.js` | Gera o `icones-embutidos.js` |
| `docs/` | Imagens deste README |

> O catálogo fica em `data/`, fora de `api/`, porque na Vercel `api/equipamentos.js` e `api/equipamentos.json` colidiriam na mesma rota.

## Tecnologias

- [Viz.js](https://github.com/mdaines/viz-js) — Graphviz em WebAssembly, carregado via CDN, desenha o diagrama.
- [Zod](https://zod.dev) — validação dos dados.
- [Express](https://expressjs.com) — servidor local.
- HTML, CSS e JavaScript puros, sem etapa de build.
