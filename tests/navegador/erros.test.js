// Registro de erros (assets/js/erros.js) num navegador de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const errosEnviados = pagina => pagina.evaluate(() => (window.__chamadasRpc || []).filter(c => c.nome === "grafo_registrar_erro").map(c => c.args));

test("site sem erros não envia nada", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForTimeout(500);
  assert.deepEqual(await errosEnviados(pagina), []);
  await pagina.context().close();
});

test("erro e promessa rejeitada vão para o Supabase, sem repetir e sem os parâmetros da página", async () => {
  const pagina = await abrirPagina(navegador, site, { caminho: "/?convite=00000000-0000-0000-0000-000000000000" });
  await esperarDiagrama(pagina);
  await pagina.evaluate(() => {
    setTimeout(function falhaDeTeste() { throw new Error("erro de teste"); });
    setTimeout(function () { throw new Error("erro de teste"); }, 10);
    Promise.reject(new Error("rejeitada de teste"));
  });
  await pagina.waitForFunction(() => (window.__chamadasRpc || []).filter(c => c.nome === "grafo_registrar_erro").length >= 2, null, { timeout: 10000 });
  await pagina.waitForTimeout(300);
  const enviados = await errosEnviados(pagina);
  const mensagens = enviados.map(e => e.p_mensagem);
  assert.equal(mensagens.filter(m => /erro de teste/.test(m)).length, 1, JSON.stringify(mensagens));
  assert.ok(mensagens.some(m => /^Promessa rejeitada: rejeitada de teste/.test(m)), JSON.stringify(mensagens));
  enviados.forEach(e => {
    assert.equal(e.p_pagina, "/");
    assert.doesNotMatch(JSON.stringify(e), /convite=/);
  });
  await pagina.context().close();
});

test("script que não carregou é registrado", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.evaluate(() => { const s = document.createElement("script"); s.src = "./assets/js/nao-existe.js"; document.head.appendChild(s); });
  await pagina.waitForFunction(() => (window.__chamadasRpc || []).some(c => c.nome === "grafo_registrar_erro" && /Falha ao carregar .*nao-existe\.js/.test(c.args.p_mensagem)), null, { timeout: 10000 });
  await pagina.context().close();
});
