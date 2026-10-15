// Paleta de comandos (Ctrl+K): busca equipamento, ação e projeto.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("Ctrl+K abre a paleta, acha equipamento e ação, e Esc fecha", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => window.GrafoComandos);
  await pagina.keyboard.press("Control+k");
  await pagina.waitForSelector("#paletaComandos:not([hidden]) .paleta-input");
  await pagina.keyboard.type("olt");
  assert.match(await pagina.textContent(".paleta-item.ativo"), /OLT/);
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("#editorEquipForm:not(.hidden)");
  assert.match(await pagina.inputValue("#editEquipNome"), /OLT/i);
  await pagina.keyboard.press("Escape");
  // Ação pelo botão da barra do topo.
  await pagina.click("#btnPaleta");
  await pagina.keyboard.type("bayface");
  await pagina.keyboard.press("Enter");
  await pagina.waitForFunction(() => document.body.getAttribute("data-modo-diagrama") === "racks");
  await pagina.keyboard.press("Control+k");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("#paletaComandos", { state: "hidden" });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
