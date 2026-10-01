// Cartão "Primeiros passos" num navegador de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarEditor, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const VAZIO = { "Projeto Ação": { equipamentos: [], conexoes: [] } };
const visivel = pagina => pagina.evaluate(() => !document.getElementById("primeirosPassos").hidden);
const progresso = pagina => pagina.textContent("#ppProgresso");

test("quem já tem equipamentos não vê o cartão", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForTimeout(500);
  assert.equal(await visivel(pagina), false);
  await pagina.context().close();
});

test("pessoa nova: as tarefas se marcam sozinhas e o cartão some ao terminar", async () => {
  const pagina = await abrirPagina(navegador, site, { projetos: VAZIO });
  await esperarEditor(pagina);
  await pagina.waitForSelector("#primeirosPassos:not([hidden])");
  assert.equal(await progresso(pagina), "0 de 3");

  await pagina.click('[data-pp-acao="equipamento"]');
  await pagina.waitForFunction(() => document.getElementById("navAddEquip").classList.contains("open"));

  await pagina.click('[data-pp-acao="exemplo"]');
  await pagina.waitForFunction(() => document.getElementById("ppProgresso").textContent === "2 de 3", null, { timeout: 20000 });
  assert.equal(await pagina.evaluate(() => document.querySelector(".pp-rodape").offsetParent), null);

  await pagina.click('[data-pp-acao="exportar"]');
  await pagina.waitForSelector("#btnExportarPdf:not([disabled])", { timeout: 30000 });
  const download = pagina.waitForEvent("download", { timeout: 60000 });
  await pagina.evaluate(() => document.getElementById("btnExportarPdf").click());
  await download;
  await pagina.waitForFunction(() => document.getElementById("ppProgresso").textContent === "3 de 3");
  assert.match(await pagina.textContent("#ppTitulo"), /Pronto/);
  await pagina.waitForSelector("#primeirosPassos", { state: "hidden", timeout: 8000 });

  await pagina.reload();
  await esperarEditor(pagina);
  await pagina.waitForTimeout(500);
  assert.equal(await visivel(pagina), false, "voltou depois de concluído");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("celular: fechar no × não volta mais", async () => {
  const pagina = await abrirPagina(navegador, site, { projetos: VAZIO, celular: true });
  await esperarEditor(pagina);
  await pagina.waitForSelector("#primeirosPassos:not([hidden])");
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pagina.click("#ppFechar");
  assert.equal(await visivel(pagina), false);
  await pagina.reload();
  await esperarEditor(pagina);
  await pagina.waitForTimeout(500);
  assert.equal(await visivel(pagina), false);
  await pagina.context().close();
});
