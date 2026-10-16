// Tela de Início e Biblioteca (estantes → livros → páginas), separada dos diagramas.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarEditor } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// Sem o atalho dos testes: o app abre onde a pessoa parou, como para as pessoas.
const comoUsuario = { antes: () => localStorage.removeItem("grafo-vista-inicial") };

test("abre no diagrama; Início pela logo; estante, livro e página; busca; volta ao diagrama", async () => {
  const pagina = await abrirPagina(navegador, site, Object.assign({ viewport: { width: 1400, height: 900 } }, comoUsuario));
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => window.GrafoBiblioteca);
  assert.equal(await pagina.getAttribute("body", "data-vista"), "editor", "primeira vez: abre no diagrama");
  assert.equal(await pagina.$('[data-vista-ir="inicio"]'), null, "sem aba Início no topo");
  // A logo leva ao Início animado.
  await pagina.click(".sidebar .brand");
  await pagina.waitForSelector(".cena h1");
  assert.match(await pagina.textContent(".cena-rodape"), /Projeto Ação/);
  // Estante → livro → página.
  await pagina.click('[data-vista-ir="biblioteca"]');
  await pagina.click('.bib-vazia [data-acao="nova-estante"]');
  await pagina.fill("#modalInput", "Procedimentos");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForSelector(".bib-cabecalho h1");
  await pagina.click('[data-acao="novo-livro"]');
  await pagina.fill("#modalInput", "Configurar OLT");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForSelector(".bib-indice");
  await pagina.click('.bib-boas-vindas [data-acao="nova-pagina"]');
  await pagina.waitForSelector("[data-bib-form]");
  await pagina.fill("[data-bib-form] [name=titulo]", "Primeiro acesso");
  await pagina.fill("[data-bib-form] [name=capitulo]", "Acesso");
  await pagina.fill("[data-bib-form] [name=texto]", "# Console\n1. Conectar a 9600\n2. Rodar `display version`");
  await pagina.click("[data-bib-form] button[type=submit]");
  await pagina.waitForSelector(".bib-texto ol li");
  assert.match(await pagina.textContent(".bib-indice"), /Acesso/);
  assert.match(await pagina.textContent(".bib-trilha"), /Procedimentos/);
  // Busca da Biblioteca acha a página pelo conteúdo.
  await pagina.click('[data-vista-ir="biblioteca"]');
  await pagina.fill("[data-bib-busca]", "display version");
  await pagina.waitForSelector(".bib-resultado");
  assert.match(await pagina.textContent(".bib-resultados"), /Primeiro acesso/);
  // Fica salvo no navegador.
  const salvo = await pagina.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-biblioteca:") === 0))));
  assert.equal(salvo.paginas[0].titulo, "Primeiro acesso");
  // Volta ao diagrama.
  await pagina.click('[data-vista-ir="editor"]');
  await pagina.waitForSelector("#canvas svg g.node");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Documentação do diagrama abre o livro do projeto na estante POPs; documentos antigos são migrados", async () => {
  const projetos = { "POP Centro": { equipamentos: [{ id: "a", nome: "OLT", tipo: "OLT" }], conexoes: [],
    documentos: [{ id: "d1", titulo: "Acesso ao POP", tipo: "procedimento", pasta: "Acesso", texto: "Chave na portaria" }] } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => window.GrafoBiblioteca);
  await pagina.click("#btnDocumentos");
  await pagina.waitForSelector(".bib-indice");
  assert.equal(await pagina.getAttribute("body", "data-vista"), "inicio");
  assert.match(await pagina.textContent(".bib-trilha"), /POPs/);
  assert.match(await pagina.textContent(".bib-trilha"), /POP Centro/);
  assert.match(await pagina.textContent(".bib-texto"), /Chave na portaria/, "documento antigo migrado");
  // "Abrir o diagrama" volta para o editor.
  await pagina.click(".bib-abrir-diagrama");
  await pagina.waitForSelector("#canvas svg g.node");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("abre onde parou: depois de usar a Biblioteca, recarregar volta para ela", async () => {
  const pagina = await abrirPagina(navegador, site, comoUsuario);
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => window.GrafoBiblioteca);
  await pagina.click('[data-vista-ir="biblioteca"]');
  await pagina.waitForSelector(".bib-cabecalho h1");
  await pagina.reload();
  await esperarEditor(pagina);
  await pagina.waitForSelector(".bib-cabecalho h1");
  assert.equal(await pagina.getAttribute("body", "data-vista"), "inicio");
  // E depois de voltar ao diagrama, recarregar abre no diagrama.
  await pagina.click('[data-vista-ir="editor"]');
  await pagina.reload();
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => window.GrafoBiblioteca);
  assert.equal(await pagina.getAttribute("body", "data-vista"), "editor");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
