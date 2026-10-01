// Botão "Instalar app" (assets/js/recursos/instalar.js) num navegador de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const visiveis = pagina => pagina.evaluate(() => [...document.querySelectorAll("[data-instalar]")].filter(b => b.offsetParent !== null).length);

// O navegador avisa que dá para instalar (simulado: o headless não avisa sozinho).
function avisarQuePodeInstalar(pagina) {
  return pagina.evaluate(() => {
    const evento = new Event("beforeinstallprompt", { cancelable: true });
    evento.prompt = () => { window.__pediuInstalacao = true; };
    evento.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(evento);
  });
}

test("sem aviso do navegador (e fora do iPhone), o botão não aparece", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false });
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  assert.equal(await visiveis(pagina), 0);
  await pagina.context().close();
});

test("com o aviso do navegador: botão na página inicial abre a instalação", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false });
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  await avisarQuePodeInstalar(pagina);
  assert.equal(await visiveis(pagina), 1);
  await pagina.click(".landing-topo [data-instalar]");
  assert.equal(await pagina.evaluate(() => window.__pediuInstalacao), true);
  await pagina.waitForFunction(() => [...document.querySelectorAll("[data-instalar]")].every(b => b.hidden));
  await pagina.context().close();
});

test("com o aviso do navegador: botão também no editor", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await avisarQuePodeInstalar(pagina);
  // No editor, fica dentro do menu da conta.
  await pagina.click("#contaMenuBotao");
  assert.equal(await visiveis(pagina), 1);
  await pagina.click("#accountTools [data-instalar]");
  assert.equal(await pagina.evaluate(() => window.__pediuInstalacao), true);
  await pagina.context().close();
});

test("iPhone: botão mostra como instalar pelo Safari, sem rolagem para os lados", async () => {
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
  });
  await contexto.route("**/api/auth-config", r => r.fulfill({ contentType: "application/json", body: '{"url":"https://teste.supabase.co","key":"x"}' }));
  await contexto.route("**/@supabase/supabase-js@*/**", r => r.fulfill({ contentType: "text/javascript",
    body: "window.supabase={createClient:function(){return{auth:{onAuthStateChange:function(){},getSession:function(){return Promise.resolve({data:{session:null},error:null})}}}}};" }));
  const pagina = await contexto.newPage();
  await pagina.goto(site.url + "/");
  await pagina.waitForSelector(".landing-heroi", { state: "visible" });
  assert.equal(await visiveis(pagina), 1);
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "a página passou da largura da tela");
  await pagina.click(".landing-topo [data-instalar]");
  await pagina.waitForSelector("#instalarModal:not(.hidden)");
  assert.match(await pagina.textContent("#instalarModal"), /Adicionar à Tela de Início/);
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("#instalarModal", { state: "hidden" });
  await contexto.close();
});
