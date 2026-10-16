// Permissões decididas pelo banco: painel do administrador (no menu da conta) e
// temas exclusivos (Fernando) só para quem foi liberado.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const temFernandoNoMenu = pagina => pagina.evaluate(() => {
  const item = document.querySelector('[data-opcoes-de="temaSelect"] [data-valor="theme-fernando"]');
  return !!item && !item.hidden;
});

test("usuário comum: sem painel do administrador e sem o tema Fernando (mesmo se estava salvo)", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => {
    try { localStorage.setItem("diagrama-tema", "theme-fernando"); } catch (e) {}
  } });
  await esperarDiagrama(pagina);
  await pagina.waitForTimeout(800);
  await pagina.click("#contaMenuBotao");
  assert.equal(await pagina.$("#btnAdmin"), null);
  assert.equal(await temFernandoNoMenu(pagina), false);
  assert.notEqual(await pagina.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toUpperCase()), "#B71C1C");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("conta com o tema liberado vê o Fernando no menu de temas", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => { window.__respostasRpc = { grafo_meus_temas: ["fernando"] }; } });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => { const i = document.querySelector('[data-opcoes-de="temaSelect"] [data-valor="theme-fernando"]'); return i && !i.hidden; });
  assert.equal(await temFernandoNoMenu(pagina), true);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("admin: painel no menu da conta, com papéis, liberação de tema e erros", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => {
    window.__respostasRpc = {
      grafo_eh_admin: true,
      grafo_meus_temas: ["fernando"],
      grafo_admin_definir_tema: null,
      grafo_admin_painel: {
        usuarios: [
          { id: "1", email: "dono@grafo.com", admin: true, confirmado: true, temas: ["fernando"], projetos: 4, tamanho: 52000, ultimo_acesso: new Date().toISOString(), criado_em: "2026-09-01T10:00:00Z" },
          { id: "2", email: "tecnico@grafo.com", admin: false, confirmado: false, temas: [], projetos: 1, tamanho: 3000, ultimo_acesso: null, criado_em: "2026-10-01T10:00:00Z" }
        ],
        erros: [{ mensagem: "TypeError: x is undefined", origem: "app.js", vezes: 3, pessoas: 1, ultima_vez: new Date().toISOString() }],
        arquivos: { quantidade: 2, bytes: 4200000 }, equipes: 1, gerado_em: new Date().toISOString()
      }
    };
  } });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#btnAdmin", { state: "attached" });
  assert.equal(await pagina.$(".sidebar #btnAdmin"), null, "não fica na barra lateral");
  await pagina.click("#contaMenuBotao");
  await pagina.click("#btnAdmin");
  await pagina.waitForSelector("#adminApp .admin-tabela");
  const texto = await pagina.textContent("#adminApp");
  assert.match(texto, /dono@grafo\.com/);
  assert.match(texto, /Bloqueada/);
  assert.match(texto, /TypeError/);
  // Libera o Fernando para o técnico.
  await pagina.check('[data-campo="tema:fernando"][data-usuario="2"]');
  await pagina.waitForSelector("[data-admin-salvar]:not([hidden])");
  assert.equal(await pagina.evaluate(() => (window.__chamadasRpc || []).some(c => c.nome === "grafo_admin_definir_tema")), false, "só grava ao salvar");
  await pagina.click('[data-admin="salvar"]');
  await pagina.waitForFunction(() => (window.__chamadasRpc || []).some(c => c.nome === "grafo_admin_definir_tema" && c.args.p_usuario === "2" && c.args.p_liberar === true));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("tema retirado pelo admin some na hora para a pessoa, sem recarregar", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => { window.__respostasRpc = { grafo_meus_temas: ["fernando"] }; } });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => { const i = document.querySelector('[data-opcoes-de="temaSelect"] [data-valor="theme-fernando"]'); return i && !i.hidden; });
  await pagina.evaluate(() => { const s = document.getElementById("temaSelect"); s.value = "theme-fernando"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  // O admin retira o tema: a próxima conferência (ao voltar para a aba) já esconde e troca o tema.
  await pagina.evaluate(() => { window.__respostasRpc.grafo_meus_temas = []; window.dispatchEvent(new Event("focus")); });
  await pagina.waitForFunction(() => document.getElementById("temaSelect").value === "auto");
  assert.equal(await temFernandoNoMenu(pagina), false);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("admin: bloqueia conta, torna admin e publica comunicado (tudo pelo painel)", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => {
    window.__respostasRpc = { grafo_eh_admin: true, grafo_admin_definir_admin: null, grafo_admin_definir_bloqueio: null, grafo_admin_definir_aviso: null,
      grafo_admin_painel: { eu: "1", usuarios: [
        { id: "1", email: "dono@grafo.com", admin: true, bloqueado: false, temas: [], projetos: 1, tamanho: 10, ultimo_acesso: null, criado_em: null },
        { id: "2", email: "tecnico@grafo.com", admin: false, bloqueado: false, temas: [], projetos: 1, tamanho: 10, ultimo_acesso: null, criado_em: null },
        { id: "3", email: "outro@grafo.com", admin: false, bloqueado: false, temas: [], projetos: 1, tamanho: 10, ultimo_acesso: null, criado_em: null }],
        erros: [], arquivos: {}, equipes: 0, gerado_em: new Date().toISOString() } };
  } });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#btnAdmin", { state: "attached" });
  await pagina.click("#contaMenuBotao");
  await pagina.click("#btnAdmin");
  await pagina.waitForSelector("#adminApp .admin-tabela");
  assert.equal(await pagina.isDisabled('[data-campo="admin"][data-usuario="1"]'), true, "não tira o próprio admin");
  pagina.once("dialog", d => d.accept("uso indevido"));
  await pagina.check('[data-campo="bloqueio"][data-usuario="2"]');
  await pagina.check('[data-campo="admin"][data-usuario="3"]');
  await pagina.click('[data-admin="salvar"]');
  await pagina.waitForFunction(() => {
    const c = window.__chamadasRpc || [];
    return c.some(x => x.nome === "grafo_admin_definir_bloqueio" && x.args.p_usuario === "2" && x.args.p_motivo === "uso indevido") &&
      c.some(x => x.nome === "grafo_admin_definir_admin" && x.args.p_usuario === "3" && x.args.p_admin === true);
  });
  await pagina.fill("[data-aviso-texto]", "Manutenção às 22h");
  await pagina.click('[data-admin="publicar-aviso"]');
  await pagina.waitForFunction(() => (window.__chamadasRpc || []).some(x => x.nome === "grafo_admin_definir_aviso" && x.args.p_texto === "Manutenção às 22h"));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("conta bloqueada vê a tela de bloqueio; comunicado aparece no topo; desbloqueio vale sem recarregar", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => {
    window.__respostasRpc = { grafo_minha_situacao: { bloqueado: true, motivo: "uso indevido", aviso: { id: 7, texto: "Manutenção às 22h", tipo: "alerta" } } };
  } });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector(".conta-bloqueada");
  assert.match(await pagina.textContent(".conta-bloqueada"), /uso indevido/);
  assert.match(await pagina.textContent(".faixa-aviso"), /Manutenção às 22h/);
  await pagina.evaluate(() => { window.__respostasRpc.grafo_minha_situacao = { bloqueado: false, aviso: null }; window.dispatchEvent(new Event("focus")); });
  await pagina.waitForSelector(".conta-bloqueada", { state: "detached" });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
