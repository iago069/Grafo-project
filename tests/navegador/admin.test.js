// Painel do administrador: só aparece para admin (decidido pelo banco).
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("usuário comum não vê o painel do administrador", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForTimeout(800);
  assert.equal(await pagina.$("#btnAdmin"), null);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("admin vê o painel com contas, papéis e erros", async () => {
  const pagina = await abrirPagina(navegador, site, { antes: () => {
    window.__respostasRpc = {
      grafo_eh_admin: true,
      grafo_admin_painel: {
        usuarios: [
          { id: "1", email: "dono@grafo.com", admin: true, confirmado: true, projetos: 4, tamanho: 52000, ultimo_acesso: new Date().toISOString(), criado_em: "2026-09-01T10:00:00Z" },
          { id: "2", email: "tecnico@grafo.com", admin: false, confirmado: false, projetos: 1, tamanho: 3000, ultimo_acesso: null, criado_em: "2026-10-01T10:00:00Z" }
        ],
        erros: [{ mensagem: "TypeError: x is undefined", origem: "app.js", vezes: 3, pessoas: 1, ultima_vez: new Date().toISOString() }],
        arquivos: { quantidade: 2, bytes: 4200000 }, equipes: 1, gerado_em: new Date().toISOString()
      }
    };
  } });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#btnAdmin");
  await pagina.click("#btnAdmin");
  await pagina.waitForSelector("#adminApp .admin-tabela");
  const texto = await pagina.textContent("#adminApp");
  assert.match(texto, /dono@grafo\.com/);
  assert.match(texto, /tecnico@grafo\.com/);
  assert.match(texto, /Admin/);
  assert.match(texto, /Usuário/);
  assert.match(texto, /TypeError/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
