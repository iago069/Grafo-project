// Editor num navegador de verdade: diagrama, formulários, PDF e celular.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("desenha o diagrama do projeto salvo, sem erros", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  assert.equal(await pagina.locator("#canvas svg g.node").count(), 6);
  assert.ok(await pagina.locator("#canvas svg g.edge").count() >= 5);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("adicionar equipamento pela barra lateral aparece no diagrama", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.fill("#navEquipNome", "Switch Teste");
  await pagina.fill("#navEquipIp", "10.9.9.9");
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas svg g.node").length === 7, null, { timeout: 20000 });
  assert.match(await pagina.textContent("#canvas svg"), /Switch Teste/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("exporta um PDF válido", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click("#btnPaginaPdf");
  await pagina.waitForSelector("#btnExportarPdf:not([disabled])", { timeout: 30000 });
  const download = pagina.waitForEvent("download", { timeout: 60000 });
  await pagina.evaluate(() => document.getElementById("btnExportarPdf").click());
  const arquivo = await (await download).createReadStream();
  const partes = [];
  for await (const p of arquivo) partes.push(p);
  const pdf = Buffer.concat(partes);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 10000, "PDF pequeno demais: " + pdf.length + " bytes");
  assert.match(pdf.subarray(-1024).toString("latin1"), /%%EOF/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("celular: editor sem rolagem para os lados e menu abre", async () => {
  const pagina = await abrirPagina(navegador, site, { celular: true });
  await esperarDiagrama(pagina);
  const fora = await pagina.evaluate(() => [...document.querySelectorAll("body *")].filter(el => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width && st.display !== "none" && st.visibility !== "hidden" && r.right > innerWidth + 1 && !el.closest("#canvas");
  }).map(el => el.id || el.className).slice(0, 10));
  assert.deepEqual(fora, []);
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("modal Conta abre e fecha com Esc", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click("#accountOpen");
  await pagina.waitForSelector("#contaModal", { state: "visible" });
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("#contaModal", { state: "hidden" });
  await pagina.context().close();
});
