// Editor no celular (390 px): nada passa da largura da tela, a barra do diagrama
// cabe numa linha e os itens do menu que abrem janela ou a lista fecham o menu.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// Elementos visíveis que saem da tela pela direita ou pela esquerda (depois das
// animações: o menu recolhendo passa pela borda).
const foraDaTela = pagina => pagina.evaluate(async () => {
  await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
  const W = document.documentElement.clientWidth;
  return [...document.querySelectorAll("body *")].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1) && !e.closest(".hidden,[hidden],#canvas");
  }).map(e => e.id || String(e.className) || e.tagName).slice(0, 5);
});

test("celular: barra do diagrama numa linha e nada fora da tela", async () => {
  const pagina = await abrirPagina(navegador, site, { celular: true });
  await esperarDiagrama(pagina);
  assert.deepEqual(await foraDaTela(pagina), []);
  const topo = s => pagina.$eval(s, e => Math.round(e.getBoundingClientRect().top));
  assert.equal(await topo("#btnCompartilhar"), await topo("#btnExportarMenu"), "Compartilhar na mesma linha do Exportar");
  assert.ok(await pagina.$eval("#projetoSelect", e => e.getBoundingClientRect().height <= 44), "nome do projeto numa linha só");
  await pagina.click("#btnExportarMenu");
  assert.equal(await pagina.isVisible("#btnPaginaPdf"), true);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("celular: itens do menu que abrem janela ou a lista fecham o menu", async () => {
  const pagina = await abrirPagina(navegador, site, { celular: true });
  await esperarDiagrama(pagina);
  const menuAberto = () => pagina.$eval(".sidebar", e => !e.classList.contains("collapsed"));

  await pagina.click("#btnSidebarCollapse");
  assert.equal(await menuAberto(), true);
  await pagina.click("#btnModoAvancado");
  assert.equal(await menuAberto(), false, "Editar em lista fecha o menu");
  await pagina.waitForFunction(() => { const r = document.getElementById("filtroEquip").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  await pagina.fill("#filtroEquip", "olt");
  assert.equal(await pagina.textContent("#contagemEquip"), "1 de 6");

  await pagina.click("#btnSidebarCollapse");
  await pagina.click("#btnVerificar");
  assert.equal(await menuAberto(), false, "Verificar diagrama fecha o menu");
  assert.deepEqual(await foraDaTela(pagina), []);
  await pagina.keyboard.press("Escape");

  // Formulário que abre dentro do menu deixa o menu aberto.
  await pagina.click("#btnSidebarCollapse");
  await pagina.click('.nav-item[data-nav-panel="navAddEquip"]');
  assert.equal(await menuAberto(), true, "Adicionar equipamento abre o formulário no menu");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
