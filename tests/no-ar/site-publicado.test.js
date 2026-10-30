// Confere o site publicado (não o servidor local): roda depois de cada deploy
// da Vercel (.github/workflows/site-no-ar.yml) e avisa se algo quebrou no ar.
// Pega o que os testes locais não veem: cabeçalhos e CSP de verdade, as rotas
// do vercel.json, /api/auth-config, o Supabase real, o Graphviz no CDN e a
// versão publicada ser a mesma do commit.
//
// Rodar: npm run test:no-ar   (GRAFO_SITE=https://... troca o endereço)
// Não faz login nem grava nada: usa o modo "Usar sem login".
const test = require("node:test");
const assert = require("node:assert/strict");
const { abrirNavegador } = require("../navegador/ajuda");
const { hashGravado, SAIDA_MIN, CSS_MIN } = require("../../scripts/montar-app");

const SITE = (process.env.GRAFO_SITE || "https://thegrafo.vercel.app").replace(/\/$/, "");

let navegador;
test.before(async () => { navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); });

function esperar(ms) { return new Promise(ok => setTimeout(ok, ms)); }

async function hashNoAr(caminho) {
  const r = await fetch(SITE + caminho, { cache: "no-store" });
  assert.equal(r.status, 200, caminho + " respondeu " + r.status);
  const m = /grafo-fonte=([0-9a-f]{16})/.exec((await r.text()).slice(-200));
  return m ? m[1] : "";
}

// Abre uma página do site guardando erros do console, falhas de CSP e
// arquivos que não carregaram.
async function abrir(caminho = "/") {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" });
  const pagina = await contexto.newPage();
  pagina.erros = [];
  pagina.on("pageerror", e => pagina.erros.push("pageerror: " + e.message));
  pagina.on("console", m => { if (m.type() === "error") pagina.erros.push(m.text()); });
  pagina.on("response", r => { if (r.status() >= 400 && r.url().startsWith(SITE)) pagina.erros.push(r.status() + " " + r.url()); });
  pagina.on("requestfailed", r => { if (r.url().startsWith(SITE)) pagina.erros.push("falhou " + r.url()); });
  await pagina.goto(SITE + caminho);
  return pagina;
}

test("a versão no ar é a deste commit", async () => {
  const esperado = { js: hashGravado(SAIDA_MIN), css: hashGravado(CSS_MIN) };
  // O deploy pode levar alguns segundos para chegar a todos os servidores.
  let noAr;
  for (let i = 0; i < 18; i++) {
    noAr = { js: await hashNoAr("/assets/js/editor/app.min.js"), css: await hashNoAr("/assets/css/styles.min.css") };
    if (noAr.js === esperado.js && noAr.css === esperado.css) break;
    await esperar(10000);
  }
  assert.deepEqual(noAr, esperado, "o site ainda mostra outra versão");
});

test("cabeçalhos de segurança, rotas e configuração do login", async () => {
  const inicio = await fetch(SITE + "/");
  assert.equal(inicio.status, 200);
  assert.match(inicio.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.match(inicio.headers.get("strict-transport-security") || "", /max-age=/);
  assert.equal(inicio.headers.get("x-frame-options"), "DENY");

  // Rotas do vercel.json: /ver e endereços do editor caem na página certa.
  assert.match(await (await fetch(SITE + "/ver")).text(), /<html/i);
  assert.equal((await fetch(SITE + "/projeto/qualquer")).status, 200);
  assert.match(await (await fetch(SITE + "/privacidade")).text(), /Política de Privacidade/);

  const cfg = await (await fetch(SITE + "/api/auth-config")).json();
  assert.match(cfg.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.ok(cfg.key && cfg.key.length > 20, "chave pública do Supabase");
  // O Supabase está de pé (só a verificação de saúde, sem login).
  const saude = await fetch(cfg.url + "/auth/v1/health", { headers: { apikey: cfg.key } });
  assert.equal(saude.status, 200, "Supabase respondeu " + saude.status);

  // Os arquivos que o site carrega existem. (O app.min.js.map a Vercel só
  // mostra para quem é da conta: fora dela responde 403.)
  for (const arquivo of ["/manifest.webmanifest", "/sw.js"]) {
    assert.equal((await fetch(SITE + arquivo)).status, 200, arquivo);
  }
  // Segredos e arquivos internos não são servidos.
  for (const arquivo of ["/.env", "/package.json", "/src/app/00-catalogo.js"]) {
    const r = await fetch(SITE + arquivo);
    assert.ok(r.status === 404 || !/SUPABASE|"devDependencies"|GrafoApp/.test(await r.text()), arquivo + " não deveria estar no ar");
  }
});

test("página inicial e editor sem login funcionando no ar", async () => {
  const pagina = await abrir("/");
  await pagina.waitForSelector("#authCard", { state: "visible", timeout: 30000 });
  await pagina.click(".auth-sem-login-botao");
  await pagina.waitForFunction(() => window.GrafoApp, null, { timeout: 60000 });

  // Carrega o exemplo: o Graphviz (CDN + trabalhador em segundo plano) desenha.
  await pagina.click("[data-carregar-exemplo]");
  await pagina.waitForSelector("#canvas svg g.node", { timeout: 60000 });
  const nos = await pagina.$$eval("#canvas svg g.node", l => l.length);
  assert.ok(nos > 2, "exemplo com equipamentos (" + nos + ")");

  // Organizar redesenha sem erro.
  await pagina.click("#btnLayoutMenu");
  await pagina.click("#btnOrganizarDiagrama");
  await pagina.waitForTimeout(3000);
  assert.ok(await pagina.$$eval("#canvas svg g.node", l => l.length) === nos);

  // Verificar diagrama abre.
  await pagina.evaluate(() => window.GrafoApp.abrirVerificador());
  await pagina.waitForSelector("#vfModal:not(.hidden)", { timeout: 10000 });

  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("versão de leitura (/ver) abre sem erro", async () => {
  const pagina = await abrir("/ver");
  await pagina.waitForLoadState("networkidle");
  // Sem token, a página só avisa; não pode quebrar.
  assert.deepEqual(pagina.erros.filter(e => !/supabase\.co/.test(e)), []);
  await pagina.context().close();
});

