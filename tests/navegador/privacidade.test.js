// LGPD num navegador de verdade: Política de Privacidade, aceite no cadastro,
// fontes sem Google, "Baixar todos os meus dados" e exclusão da conta com os anexos.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("Política de Privacidade abre em /privacidade, no computador e no celular", async () => {
  for (const celular of [false, true]) {
    const pagina = await abrirPagina(navegador, site, { sessao: false, celular, caminho: "/privacidade" });
    await pagina.waitForSelector("h1");
    assert.match(await pagina.textContent("h1"), /Política de Privacidade/);
    const secoes = await pagina.$$eval("h2", l => l.map(h => h.textContent));
    for (const parte of ["Quem cuida", "Quais dados", "compartilhados", "internacional", "tempo", "direitos", "Cookies", "Segurança"]) {
      assert.ok(secoes.some(s => s.includes(parte)), "seção " + parte);
    }
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sem rolagem para os lados");
    assert.deepEqual(pagina.erros, []);
    await pagina.context().close();
  }
});

test("página inicial: fontes do próprio site, nada pedido ao Google, link da política no rodapé", async () => {
  const pedidos = [];
  const pagina = await abrirPagina(navegador, site, { sessao: false, caminho: "/__vazio" });
  pagina.on("request", r => pedidos.push(r.url()));
  await pagina.goto(site.url + "/");
  await pagina.waitForSelector("#authCard", { state: "visible" });
  await pagina.evaluate(() => document.fonts.ready);
  assert.deepEqual(pedidos.filter(u => /google/.test(u)), []);
  assert.ok(await pagina.evaluate(() => document.fonts.check('16px "IBM Plex Sans"')), "IBM Plex Sans carregada");
  assert.equal(await pagina.getAttribute(".login-rodape a[href='/privacidade']", "href"), "/privacidade");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("cadastro: só com o aceite da política, senha de 8 caracteres e não vazada, e a conta guarda a versão aceita", async () => {
  const pagina = await abrirPagina(navegador, site, { sessao: false });
  // Have I Been Pwned simulado: "senha12345" está na lista de vazadas.
  const pedidosHibp = [];
  const sha1 = t => require("crypto").createHash("sha1").update(t).digest("hex").toUpperCase();
  await pagina.route("https://api.pwnedpasswords.com/range/*", r => {
    pedidosHibp.push(r.request().url());
    const vazada = sha1("senha12345");
    const corpo = r.request().url().endsWith(vazada.slice(0, 5)) ? vazada.slice(5) + ":9545824\r\n0000000000000000000000000000000000A:0" : "0000000000000000000000000000000000A:0";
    r.fulfill({ status: 200, body: corpo, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await pagina.waitForSelector("#authCard", { state: "visible" });
  assert.equal(await pagina.isVisible("#authAceiteLinha"), false, "no login não aparece");
  await pagina.click("#authToggle");
  await pagina.waitForSelector("#authAceiteLinha", { state: "visible" });
  await pagina.fill("#authNome", "Ana Teste");
  await pagina.fill("#authEmail", "ana@teste.com");
  await pagina.fill("#authPassword", "1234567");
  await pagina.fill("#authRepetir", "1234567");
  await pagina.click("#authSubmit");
  assert.equal(await pagina.evaluate(() => document.getElementById("authPassword").validity.tooShort), true, "7 caracteres não vale");
  await pagina.fill("#authPassword", "senha-forte-1");
  await pagina.fill("#authRepetir", "senha-forte-1");
  await pagina.click("#authSubmit");
  assert.equal(await pagina.evaluate(() => document.getElementById("authAceite").validity.valueMissing), true, "sem aceite não envia");
  assert.equal(await pagina.evaluate(() => window.__cadastro), undefined);
  await pagina.check("#authAceite");
  await pagina.fill("#authPassword", "senha12345");
  await pagina.fill("#authRepetir", "senha12345");
  await pagina.click("#authSubmit");
  await pagina.waitForFunction(() => /vazamentos/.test(document.getElementById("authMessage").textContent));
  assert.equal(await pagina.evaluate(() => window.__cadastro), undefined, "senha vazada não cadastra");
  // Só os 5 primeiros caracteres do SHA-1 saem do navegador.
  assert.ok(pedidosHibp.every(u => /\/range\/[0-9A-F]{5}$/.test(u)));
  assert.ok(pedidosHibp.every(u => !u.includes("senha12345")));
  await pagina.fill("#authPassword", "senha-forte-1");
  await pagina.fill("#authRepetir", "senha-forte-1");
  await pagina.click("#authSubmit");
  await pagina.waitForFunction(() => window.__cadastro);
  const dados = await pagina.evaluate(() => window.__cadastro.options.data);
  assert.equal(dados.privacidade, "2026-10-30");
  assert.ok(!isNaN(Date.parse(dados.privacidade_aceita_em)));
  // A versão no código é a mesma data que aparece na política.
  assert.match(fs.readFileSync(require("path").join(__dirname, "..", "..", "privacidade.html"), "utf8"), /Versão de 30 de outubro de 2026/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Minha conta: baixa todos os dados e, ao excluir, apaga os anexos antes da conta", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.evaluate(() => {
    window.__arquivos = ["u1/biblioteca/l1/ax1-manual.pdf", "u1/biblioteca/l2/ax2-foto.jpg", "u1/biblioteca/l2/sub/ax3.txt", "u2/biblioteca/l9/de-outra-pessoa.pdf"];
  });
  await pagina.click("#contaMenuBotao");
  await pagina.click("#accountOpen");
  await pagina.waitForSelector("#contaModal", { state: "visible" });

  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#contaBaixarDados")]);
  assert.match(download.suggestedFilename(), /^grafo-meus-dados-\d{4}-\d\d-\d\d\.json$/);
  const arquivo = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(arquivo.conta.email, "teste@grafo");
  assert.ok(arquivo.projetos_pessoais[0].projects["Projeto Ação"], "projetos no arquivo");
  for (const parte of ["biblioteca", "projetos_de_equipe_criados", "equipes_de_que_participa", "links_de_compartilhamento", "temas_liberados"]) {
    assert.ok(parte in arquivo, parte);
  }
  assert.match(arquivo.politica_de_privacidade, /\/privacidade$/);

  await pagina.fill("#contaConfirmar", "teste@grafo");
  await pagina.click("#contaExcluir");
  await pagina.waitForURL(/conta-excluida=1/, { timeout: 10000 });
  // Os anexos da conta saíram (antes da conta); os de outra pessoa ficaram.
  assert.deepEqual(JSON.parse(await pagina.evaluate(() => localStorage.getItem("__arquivos_restantes"))), ["u2/biblioteca/l9/de-outra-pessoa.pdf"]);
  await pagina.context().close();
});
