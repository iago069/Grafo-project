// Página inicial (quem não está logado) num navegador de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("sem login: mostra a página inicial, sem o editor e sem baixar o Graphviz", async () => {
  const baixados = [];
  // Abre uma página em branco antes, para contar os downloads desde o começo.
  const pagina = await abrirPagina(navegador, site, { sessao: false, caminho: "/__vazio" });
  pagina.on("request", r => baixados.push(r.url()));
  await pagina.goto(site.url + "/");
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  assert.equal(await pagina.isVisible(".app-shell"), false);
  await pagina.waitForTimeout(800);
  assert.deepEqual(baixados.filter(u => /viz-global|\/app\.js/.test(u)), []);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("botões da página inicial levam ao cadastro e ao login", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false });
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  await pagina.click(".landing-ctas [data-ir-para=signup]");
  await pagina.waitForFunction(() => /Crie sua conta/.test(document.getElementById("authTitle").textContent));
  // Cadastro: Nome (com o cursor), E-mail, Senha e Repetir senha.
  await pagina.waitForFunction(() => document.activeElement.id === "authNome", null, { timeout: 3000 });
  assert.deepEqual(await pagina.$$eval("#authForm input", l => l.filter(i => i.offsetParent).map(i => i.id)), ["authNome", "authEmail", "authPassword", "authRepetir"]);
  await pagina.click(".landing-topo [data-ir-para=login]");
  await pagina.waitForFunction(() => /Entre/.test(document.getElementById("authTitle").textContent));
  // Login: só E-mail e Senha.
  assert.deepEqual(await pagina.$$eval("#authForm input", l => l.filter(i => i.offsetParent).map(i => i.id)), ["authEmail", "authPassword"]);
  await pagina.context().close();
});

test("link de recuperação de senha abre o formulário de nova senha", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false, caminho: "/?recuperar=1" });
  await pagina.waitForFunction(() => /nova senha/i.test(document.getElementById("authTitle").textContent));
  await pagina.context().close();
});

test("sem servidor de login: avisa em vez de travar", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false, caminho: "/__vazio" });
  await pagina.route("**/api/auth-config", r => r.abort());
  await pagina.goto(site.url + "/");
  await pagina.waitForFunction(() => /Sem conexão/.test(document.getElementById("authMessage").textContent), null, { timeout: 15000 });
  await pagina.context().close();
});

test("celular: página inicial sem rolagem para os lados", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false, celular: true });
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pagina.context().close();
});

test("com sessão salva: vai direto ao editor, sem a página inicial piscar", async () => {
  const pagina = await abrirPagina(navegador, site, {
    caminho: "/__vazio",
    antes: () => {
      localStorage.setItem("sb-teste-auth-token", "{}");
      window.__landingApareceu = false;
      document.addEventListener("DOMContentLoaded", () => {
        const el = document.querySelector(".landing");
        const checar = () => { if (el && getComputedStyle(el).display !== "none" && document.body.classList.contains("auth-locked")) window.__landingApareceu = true; };
        checar();
        const t = setInterval(checar, 10);
        setTimeout(() => clearInterval(t), 4000);
      });
    }
  });
  await pagina.goto(site.url + "/");
  await esperarDiagrama(pagina);
  assert.equal(await pagina.evaluate(() => window.__landingApareceu), false);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
