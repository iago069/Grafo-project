// Usar sem login num navegador de verdade: editor só neste navegador, exportar
// funciona, recursos da nuvem pedem login, e o nome da conta na barra lateral.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("usar sem login: editor abre, exporta, guarda no navegador e pede login para compartilhar", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false });
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  await pagina.click(".landing-sem-login");
  await pagina.waitForFunction(() => window.GrafoApp && document.getElementById("sidebarUsuarioNome").textContent === "Sem login", null, { timeout: 45000 });
  assert.equal(await pagina.isVisible("#btnEntrarConvidado"), true, "botão Entrar no topo");

  // Carrega o exemplo e exporta o inventário (exportar vale sem login).
  await pagina.click("[data-carregar-exemplo]");
  await pagina.waitForSelector("#canvas svg g.node", { timeout: 45000 });
  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#btnInventario")]);
  assert.match(download.suggestedFilename(), /inventario\.xlsx$/);

  // Compartilhar pede login, com o cadeado; "Agora não" fecha.
  assert.equal(await pagina.$eval("#btnCompartilhar", b => !b.hidden && b.classList.contains("requer-login")), true);
  await pagina.click("#btnCompartilhar");
  await pagina.waitForSelector("#loginNecessarioModal:not(.hidden)");
  assert.match(await pagina.textContent("#loginNecessarioTexto"), /compartilhar/);
  await pagina.click("#loginNecessarioModal [data-login-fechar].ghost:not(.small)");
  await pagina.waitForSelector("#loginNecessarioModal.hidden", { state: "attached" });
  assert.equal(await pagina.evaluate(() => (window.__chamadasRpc || []).length), 0, "nada foi enviado ao Supabase");

  // Recarregar: volta direto ao editor sem login, com o projeto guardado no navegador.
  await pagina.reload();
  await pagina.waitForSelector("#canvas svg g.node", { timeout: 45000 });
  assert.equal(await pagina.isVisible(".landing-heroi"), false, "não mostra a página inicial");
  assert.equal(await pagina.textContent("#sidebarUsuarioNome"), "Sem login");

  // "Entrar" leva ao formulário de login.
  await pagina.click("#btnEntrarConvidado");
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  await pagina.waitForFunction(() => /Entre/.test(document.getElementById("authTitle").textContent));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("com conta: o pé da barra lateral mostra quem está usando", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const barra = await pagina.$eval("#sidebarUsuario", el => ({ visivel: !el.hidden, texto: el.textContent.trim() }));
  assert.equal(barra.visivel, true);
  // Só o nome (a sessão simulada não tem nome: o começo do e-mail). O e-mail fica no botão da conta.
  assert.equal(barra.texto, "teste");
  assert.match(await pagina.textContent("#accountEmail"), /@/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
