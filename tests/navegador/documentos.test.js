// Documentos do projeto: escrever um procedimento, ligar a um equipamento, achar pela paleta.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("procedimento: cria, edita, salva no projeto e aparece na paleta e no equipamento", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => window.GrafoDocumentos);
  await pagina.click("#btnDocumentos");
  await pagina.waitForSelector("#documentosApp:not([hidden])");
  await pagina.click('[data-doc="novo"]');
  await pagina.waitForSelector("[data-doc-form]");
  await pagina.fill("[data-doc-form] [name=titulo]", "Configurar OLT nova");
  await pagina.fill("[data-doc-form] [name=pasta]", "Procedimentos");
  const opcao = await pagina.$eval("[data-doc-form] [name=vinculo] optgroup option", o => o.value);
  await pagina.selectOption("[data-doc-form] [name=vinculo]", opcao);
  await pagina.fill("[data-doc-form] [name=texto]", "# Passos\n1. Conectar no console\n2. Rodar `display version`");
  await pagina.click("[data-doc-form] button[type=submit]");
  await pagina.waitForSelector(".docs-texto ol li");
  assert.match(await pagina.textContent(".docs-texto"), /display version/);
  const docs = await pagina.evaluate(() => window.GrafoApp.documentosDoProjeto());
  assert.equal(docs.length, 1);
  assert.equal(docs[0].vinculo, opcao);
  await pagina.keyboard.press("Escape");
  // Paleta acha o documento.
  await pagina.keyboard.press("Control+k");
  await pagina.fill(".paleta-input", "configurar olt");
  await pagina.waitForFunction(() => /Configurar OLT nova/.test((document.querySelector(".paleta-item.ativo") || {}).textContent || ""));
  await pagina.press(".paleta-input", "Enter");
  await pagina.waitForSelector("#documentosApp:not([hidden]) .docs-texto");
  await pagina.keyboard.press("Escape");
  // Envio de arquivo sem conta pede login (não quebra).
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
