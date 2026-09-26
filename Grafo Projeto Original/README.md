# Grafo

**G**erador **R**ápido **A**utomatizado de **F**luxos **O**rganizados: monta diagramas de topologia de rede (OLTs, switches, roteadores, nobreaks…) a partir de equipamentos e cabeamentos cadastrados no navegador.

## Rodando localmente

Requer Node.js 18+.

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # reinicia sozinho ao salvar o server.js
```

A porta pode ser trocada com a variável `PORT`.

## Deploy (Vercel)

O projeto já está pronto para a Vercel: o `index.html` e os `assets/` são servidos como estáticos, e `api/equipamentos.js` vira uma função serverless. O `vercel.json` redireciona as demais rotas para o `index.html`.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html` | Página única da aplicação |
| `assets/js/app.js` | Toda a lógica do front-end (estado, formulários, geração do DOT, exportação SVG/PNG) |
| `assets/css/styles.css` | Estilos e temas |
| `assets/images/` | Ícones dos equipamentos |
| `assets/js/icones-embutidos.js` | Cópia dos ícones em base64 para a exportação PNG/SVG — **gerado**, veja abaixo |
| `scripts/gerar-icones-embutidos.js` | Gera o arquivo acima (`npm run icones`) |
| `api/equipamentos.json` | Catálogo de tipos de equipamento — **edite aqui** |
| `api/equipamentos.js` | Função da Vercel que serve o catálogo |
| `server.js` | Servidor Express para rodar localmente |

## Onde ficam os dados

Os projetos são salvos no `localStorage` do navegador. Limpar os dados do site ou trocar de navegador apaga tudo, então use **Projeto → Exportar projeto (.json)** na barra lateral para guardar uma cópia e **Importar projeto (.json)** para restaurar.

## Ícones dos equipamentos

Ao adicionar ou trocar uma imagem em `assets/images/`, rode:

```bash
npm run icones
```

Isso atualiza `assets/js/icones-embutidos.js`, que a exportação usa para colocar os ícones dentro do PNG/SVG. Sem ele, com o app aberto direto do disco (`file://`), o navegador bloqueia a leitura das imagens e o PNG sai sem os ícones.

## Importar CSV

Em **Modo avançado → Avançado: importar/exportar como JSON → Importar CSV** (o botão **Baixar modelo CSV** ao lado gera um exemplo). Uma linha por cabo; os equipamentos são criados pelos nomes. Linha sem `destino` cadastra só o equipamento. A importação substitui o projeto aberto — o botão ↶ desfaz.

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

Separador `;`, `,` ou tab; o arquivo pode estar em UTF-8 ou no formato padrão do Excel em português (Windows-1252). Nomes de coluna não diferenciam maiúsculas nem acentos.

O diagrama é desenhado com [Viz.js](https://github.com/mdaines/viz-js) (Graphviz em WebAssembly), carregado via CDN.
