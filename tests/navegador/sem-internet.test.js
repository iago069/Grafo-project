// Modo sem internet (sw.js + auth.js) num navegador de verdade: abrir, editar,
// exportar sem conexão e enviar as alterações quando ela volta.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// Espera o service worker assumir a página e guardar o editor e o gerador de PDF.
async function esperarGuardado(pagina) {
  await pagina.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
  const limite = Date.now() + 45000;
  for (;;) {
    const guardado = await pagina.evaluate(async () => {
      const cache = await caches.open("grafo-offline-v1");
      const chaves = (await cache.keys()).map(r => r.url);
      return ["/assets/js/app.js", "viz-global.js", "jspdf.umd.min.js", "svg2pdf.umd.min.js", "/api/auth-config", "supabase.js"]
        .every(parte => chaves.some(url => url.includes(parte)));
    });
    if (guardado) return;
    if (Date.now() > limite) throw new Error("O service worker não guardou o editor a tempo.");
    await pagina.waitForTimeout(300);
  }
}

const linhaNoServidor = pagina => pagina.evaluate(() => JSON.parse(localStorage.getItem("__simulado_linha") || "null"));
const sincronia = pagina => pagina.evaluate(() => JSON.parse(localStorage.getItem("grafo-sincronia:u1") || "null"));

async function adicionarEquipamento(pagina, nome) {
  const antes = await pagina.locator("#canvas svg g.node").count();
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.fill("#navEquipNome", nome);
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.waitForFunction(n => document.querySelectorAll("#canvas svg g.node").length === n, antes + 1, { timeout: 20000 });
}

test("abre e edita sem internet; ao voltar, envia as alterações", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await esperarGuardado(pagina);
  const contexto = pagina.context();

  await contexto.setOffline(true);
  await pagina.reload();
  await esperarDiagrama(pagina);
  assert.equal(await pagina.locator("#canvas svg g.node").count(), 6);
  assert.match(await pagina.textContent("#cloudStatus"), /Sem internet/);

  await adicionarEquipamento(pagina, "Feito sem internet");
  assert.equal((await sincronia(pagina)).pendente, true);
  assert.doesNotMatch(JSON.stringify(await linhaNoServidor(pagina)), /Feito sem internet/, "não devia ter gravado no servidor sem internet");

  // Fecha e abre de novo, ainda sem internet: a alteração continua lá.
  await pagina.reload();
  await esperarDiagrama(pagina);
  assert.match(await pagina.textContent("#canvas svg"), /Feito sem internet/);

  // A conexão volta: a página recarrega sozinha e envia.
  const recarregou = pagina.waitForEvent("load", { timeout: 20000 });
  await contexto.setOffline(false);
  await recarregou;
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => /Salvo na nuvem/.test(document.getElementById("cloudStatus").textContent), null, { timeout: 20000 });
  const servidor = await linhaNoServidor(pagina);
  assert.ok(servidor.projects["Projeto Ação"].equipamentos.some(e => e.nome === "Feito sem internet"));
  assert.equal((await sincronia(pagina)).pendente, false);
  assert.match(await pagina.textContent("#canvas svg"), /Feito sem internet/);
  assert.deepEqual(pagina.erros.filter(e => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e)), []);
  await contexto.close();
});

test("login vencido sem internet: abre com a sessão guardada", async () => {
  const pagina = await abrirPagina(navegador, site, { vencida: true });
  await esperarDiagrama(pagina);
  await esperarGuardado(pagina);
  await pagina.context().setOffline(true);
  await pagina.reload();
  await esperarDiagrama(pagina);
  assert.match(await pagina.textContent("#cloudStatus"), /Sem internet/);
  assert.equal(await pagina.isVisible(".landing-heroi"), false);
  await pagina.context().close();
});

test("exporta PDF sem internet", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await esperarGuardado(pagina);
  await pagina.context().setOffline(true);
  await pagina.reload();
  await esperarDiagrama(pagina);
  await pagina.click("#btnExportarMenu");
  await pagina.click("#btnPaginaPdf");
  await pagina.waitForSelector("#btnExportarPdf:not([disabled])", { timeout: 30000 });
  const download = pagina.waitForEvent("download", { timeout: 60000 });
  await pagina.evaluate(() => document.getElementById("btnExportarPdf").click());
  assert.ok(await download);
  await pagina.context().close();
});

test("alguém salvou enquanto estava sem internet: pergunta qual versão fica", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await esperarGuardado(pagina);
  const contexto = pagina.context();
  await contexto.setOffline(true);
  await pagina.reload();
  await esperarDiagrama(pagina);
  await adicionarEquipamento(pagina, "Meu equipamento");

  // Outro computador salva no servidor nesse meio-tempo.
  await pagina.evaluate(() => {
    const linha = JSON.parse(localStorage.getItem("__simulado_linha") || "null") || {
      user_id: "u1", current_project: "Projeto Ação", projects: { "Projeto Ação": { equipamentos: [], conexoes: [] } } };
    linha.projects = { "Projeto Ação": { equipamentos: [{ id: "x", nome: "Do outro computador" }], conexoes: [] } };
    linha.updated_at = "2026-09-30T12:00:00.000+00:00";
    localStorage.setItem("__simulado_linha", JSON.stringify(linha));
  });

  const recarregou = pagina.waitForEvent("load", { timeout: 20000 });
  await contexto.setOffline(false);
  await recarregou;
  await pagina.waitForSelector("#conflitoModal:not(.hidden)", { timeout: 30000 });
  // Nada foi sobrescrito: o servidor continua com a versão do outro computador.
  const servidor = await linhaNoServidor(pagina);
  assert.equal(servidor.projects["Projeto Ação"].equipamentos[0].nome, "Do outro computador");
  // "Manter a desta aba" envia a deste aparelho.
  await pagina.click("#conflitoManter");
  await pagina.waitForFunction(() => /Salvo na nuvem/.test(document.getElementById("cloudStatus").textContent), null, { timeout: 20000 });
  assert.ok((await linhaNoServidor(pagina)).projects["Projeto Ação"].equipamentos.some(e => e.nome === "Meu equipamento"));
  await contexto.close();
});
