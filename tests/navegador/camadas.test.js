// Menus e janelas abrem POR CIMA do resto (nada passa por cima deles), inclusive
// depois de trocar o tipo de diagrama (a transição já criou camadas presas).
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// O elemento no centro de "seletor" é ele mesmo ou algo dentro dele?
const visivelPorCima = (pagina, seletor) => pagina.evaluate(sel => {
  const alvo = document.querySelector(sel);
  if (!alvo) return "não existe: " + sel;
  const r = alvo.getBoundingClientRect();
  if (!r.width || !r.height) return "sem tamanho: " + sel;
  const e = document.elementFromPoint(r.x + Math.min(20, r.width / 2), r.y + r.height / 2);
  return alvo.contains(e) ? true : "coberto por " + (e ? e.tagName + "." + (e.className.baseVal != null ? e.className.baseVal : e.className) + "#" + e.id : "nada");
}, seletor);

test("menus, paleta, galeria e documentos ficam por cima, antes e depois de trocar o tipo", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1440, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => window.GrafoComandos && window.GrafoBiblioteca);
  for (const rodada of ["antes", "depois"]) {
    if (rodada === "depois") {
      await pagina.selectOption("#modoDiagrama", "redes"); await pagina.waitForTimeout(200);
      await pagina.selectOption("#modoDiagrama", "topologia"); await pagina.waitForTimeout(200);
    }
    for (const [botao, item] of [["#btnExportarMenu", "#btnPaginaPdf"], ["#btnLayoutMenu", "#btnOrganizarDiagrama"]]) {
      await pagina.click(botao);
      await pagina.waitForSelector(item, { state: "visible" });
      assert.equal(await visivelPorCima(pagina, item), true, rodada + ": " + item);
      await pagina.keyboard.press("Escape");
      await pagina.waitForTimeout(150);
    }
    await pagina.click("#btnPaleta");
    assert.equal(await visivelPorCima(pagina, ".paleta-input"), true, rodada + ": paleta");
    await pagina.keyboard.press("Escape");
    await pagina.click("#btnGaleria");
    assert.equal(await visivelPorCima(pagina, ".galeria-busca"), true, rodada + ": galeria");
    await pagina.keyboard.press("Escape");
    await pagina.click('[data-vista-ir="biblioteca"]');
    await pagina.click('[data-vista-ir="editor"]');
    await pagina.waitForSelector("#canvas svg g.node");
  }
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("menu lateral: grupos Editar diagrama, Documentação e Importar e exportar; só o primeiro aberto por padrão", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => localStorage.removeItem("grafo-menu-fechado-v2") });
  await esperarDiagrama(pagina);
  const grupos = await pagina.evaluate(() => [...document.querySelectorAll(".nav-section > .nav-label")].map(l => [l.textContent.trim(), l.getAttribute("aria-expanded")]));
  assert.deepEqual(grupos, [["Editar diagrama", "true"], ["Documentação", "false"], ["Importar e exportar", "false"]]);
  assert.equal(await pagina.isVisible("#btnModoAvancado"), true);
  assert.equal(await pagina.isVisible("#btnDocumentos"), false);
  await pagina.click(".nav-section:has(#btnDocumentos) > .nav-label");
  assert.equal(await pagina.isVisible("#btnDocumentos"), true);
  assert.equal(await pagina.isVisible("#btnEtiquetas"), true);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("legenda automática dos cabos: uma linha por ligação, com a cor do cabo; a camada esconde", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#canvas g.legenda-cabos");
  const n = await pagina.evaluate(() => document.querySelectorAll("#canvas g.legenda-cabos line").length);
  assert.ok(n >= 1);
  assert.match(await pagina.textContent("#canvas g.legenda-cabos"), /LEGENDA/);
  assert.match(await pagina.textContent("#canvas g.legenda-cabos"), /↔/);
  await pagina.waitForTimeout(2500);
  if (process.env.FOTO_LEGENDA) await pagina.screenshot({ path: process.env.FOTO_LEGENDA });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("remover as legendas pelo ×: some da tela e da exportação; volta em Camadas", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#canvas g.legenda-cabos .legenda-fechar");
  await pagina.dispatchEvent("#canvas g.legenda-cabos .legenda-fechar", "click");
  await pagina.waitForFunction(() => !document.querySelector("#canvas g.legenda-cabos"));
  await pagina.click("#legenda .legenda-fechar-tipos");
  assert.equal(await pagina.isVisible("#legenda"), false);
  // Camadas: as duas aparecem desmarcadas; marcar traz de volta.
  await pagina.click("#btnCamadas");
  assert.equal(await pagina.isChecked('[data-camada="legenda"]'), false);
  assert.equal(await pagina.isChecked('[data-camada="tipos"]'), false);
  await pagina.check('[data-camada="legenda"]');
  await pagina.check('[data-camada="tipos"]');
  await pagina.waitForSelector("#canvas g.legenda-cabos");
  assert.equal(await pagina.isVisible("#legenda"), true);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
