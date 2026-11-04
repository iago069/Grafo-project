// Aba Mapas (assets/js/recursos/mapas.js): importar KML e CSV, filtrar por status,
// detalhe e edição do ponto, camadas, trazer cidades do diagrama (IBGE simulado),
// exportar e abrir de novo onde parou.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarEditor, projetoExemplo } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// Tile de 1×1 px no lugar do mapa de fundo (sem internet nos testes).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwN6Nf8BpQAAAABJRU5ErkJggg==", "base64");
async function semInternetNoMapa(pagina) {
  await pagina.route(/arcgisonline\.com|tile\.openstreetmap\.org/, r => r.fulfill({ contentType: "image/png", body: PNG, headers: { "Access-Control-Allow-Origin": "*" } }));
  await pagina.route(/servicodados\.ibge\.gov\.br/, r => {
    const url = r.request().url();
    const cidades = { "santa-cruz-do-sul": [4316808, "Santa Cruz do Sul", -29.6462, -52.4072], "ibiruba": [4310009, "Ibirubá", -28.6302, -53.0961] };
    const slug = (url.match(/municipios\/([a-z-]+)\?/) || [])[1];
    if (slug) {
      const c = cidades[slug];
      return c ? r.fulfill({ json: { "municipio-id": c[0], "municipio-nome": c[1], "UF-sigla": "RS" } }) : r.fulfill({ status: 404, json: {} });
    }
    const id = Number((url.match(/municipios\/(\d+)\/metadados/) || [])[1]);
    const c = Object.values(cidades).find(x => x[0] === id);
    return r.fulfill({ json: c ? [{ id: String(id), centroide: { latitude: c[2], longitude: c[3] } }] : [] });
  });
}

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Rede</name>
<Style id="bb"><LineStyle><color>ff9b8e0a</color><width>3</width></LineStyle></Style>
<Folder><name>POPs</name>
  <Placemark><name>POP Centro</name><description><![CDATA[<b>Sala</b> técnica<img src=x onerror="window.__xss=1">]]></description>
    <ExtendedData><Data name="codigo"><value>POP-CTR</value></Data><Data name="status"><value>ok</value></Data></ExtendedData>
    <Point><coordinates>-52.40,-29.65,0</coordinates></Point></Placemark>
  <Placemark><name>POP Norte</name><ExtendedData><Data name="codigo"><value>POP-NRT</value></Data></ExtendedData>
    <Point><coordinates>-52.38,-29.60,0</coordinates></Point></Placemark>
</Folder>
<Folder><name>Backbone</name>
  <Placemark><name>Anel 1</name><styleUrl>#bb</styleUrl><LineString><coordinates>-52.40,-29.65,0 -52.39,-29.62,0 -52.38,-29.60,0</coordinates></LineString></Placemark>
</Folder></Document></kml>`;

// Planilha do monitoramento: atualiza o status pelo código e cria um ponto novo.
const CSV = "codigo;nome;status;latitude;longitude;OLTs\nPOP-NRT;POP Norte;down;;;2\nPOP-SUL;POP Sul;Atenção;-29,70;-52,42;1\n";

async function abrirMapas(pagina) {
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => window.GrafoMapas && document.querySelector('[data-vista-ir="mapas"]'));
  await pagina.click('[data-vista-ir="mapas"]');
  await pagina.waitForSelector("#telaMapas .mp-palco", { state: "visible" });
}
async function importar(pagina, nome, texto, tipo) {
  await pagina.setInputFiles("#mpArquivo", { name: nome, mimeType: tipo, buffer: Buffer.from(texto) });
}
const contagem = (pagina, s) => pagina.$eval(`[data-mp-filtro="${s}"] b`, e => Number(e.textContent));

test("Mapas: aba própria, importa KML e CSV, filtra, edita ponto, camadas e volta a abrir no mapa", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, antes: () => localStorage.removeItem("grafo-vista-inicial") });
  await semInternetNoMapa(pagina);
  await abrirMapas(pagina);
  assert.equal(await pagina.getAttribute("body", "data-vista"), "mapas");
  assert.equal(await pagina.isVisible("#workspace"), false, "o diagrama some");
  assert.equal(await pagina.getAttribute('[data-vista-ir="mapas"]', "aria-selected"), "true");
  assert.equal(await pagina.isVisible("#mpVazio"), true, "mapa vazio explica como começar");

  await importar(pagina, "rede.kml", KML, "application/vnd.google-earth.kml+xml");
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 2);
  assert.equal(await pagina.isVisible("#mpVazio"), false);
  assert.equal(await contagem(pagina, "ok"), 1);
  assert.equal(await contagem(pagina, "sem"), 1);
  assert.match(await pagina.textContent("#mpLegenda"), /Backbone/);

  await importar(pagina, "zabbix.csv", CSV, "text/csv");
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 3);
  assert.equal(await contagem(pagina, "falha"), 1, "POP-NRT atualizado para fora do ar pelo código");
  assert.equal(await contagem(pagina, "atencao"), 1);
  assert.match(await pagina.textContent(".mp-lista li:first-child"), /POP-NRT/, "os piores primeiro");

  // Filtro por status e busca.
  await pagina.click('[data-mp-filtro="ok"]');
  assert.equal(await pagina.$$eval(".mp-item", l => l.length), 2);
  await pagina.click('[data-mp-filtro="ok"]');
  await pagina.fill("#mpBusca", "sul");
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 1);
  await pagina.fill("#mpBusca", "");
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 3);

  // Detalhe: a descrição do KML vira texto (sem rodar nada) e o ponto pode ser editado.
  await pagina.click('.mp-item:has-text("POP-CTR")');
  await pagina.waitForSelector("[data-mp-form]");
  assert.equal(await pagina.inputValue("[data-mp-form] [name=obs]"), "Sala técnica");
  assert.equal(await pagina.evaluate(() => window.__xss), undefined);
  await pagina.fill("[data-mp-form] [name=nome]", "POP Centro (Sede)");
  await pagina.selectOption("[data-mp-form] [name=status]", "alerta");
  await pagina.click("[data-mp-form] button[type=submit]");
  assert.equal(await contagem(pagina, "alerta"), 1);
  const salvo = await pagina.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-mapas:") === 0))));
  const centro = salvo.mapas[0].pontos.find(p => p.codigo === "POP-CTR");
  assert.equal(centro.nome, "POP Centro (Sede)");
  assert.equal(salvo.mapas[0].pontos.find(p => p.codigo === "POP-NRT").info.OLTs, "2");
  assert.equal(salvo.mapas[0].linhas.length, 1);

  // Clique no ponto desenhado no mapa abre o detalhe.
  await pagina.click('[data-mp-aba="pontos"]');
  const naTela = await pagina.evaluate(() => {
    const r = document.getElementById("mpCanvas").getBoundingClientRect();
    return r;
  });
  await pagina.click('[data-mp="tudo"]');
  await pagina.waitForTimeout(100);
  // Ponto novo clicando no mapa.
  await pagina.click('[data-mp="ponto"]');
  await pagina.mouse.click(naTela.x + naTela.width / 2, naTela.y + naTela.height / 2);
  await pagina.waitForSelector("[data-mp-form] [name=nome]");
  assert.match(await pagina.inputValue("[data-mp-form] [name=nome]"), /^Ponto 4$/);
  assert.equal(await pagina.$$eval(".mp-item", l => l.length), 0, "lista fica na outra aba");
  await pagina.click('[data-mp-aba="pontos"]');
  assert.equal(await pagina.$$eval(".mp-item", l => l.length), 4);

  // Camadas: esconder e trocar a cor.
  await pagina.click('[data-mp-aba="camadas"]');
  assert.match(await pagina.textContent(".mp-camadas"), /Backbone.*1 traçado/);
  assert.equal(await pagina.$eval(".mp-camadas [data-mp-cor]", e => e.value), "#0a8e9b", "cor do estilo do KML");
  await pagina.uncheck('[data-mp-camada-ver]');
  const camada = await pagina.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-mapas:") === 0))).mapas[0].camadas[0]);
  assert.equal(camada.visivel, false);

  // Exportar GeoJSON.
  await pagina.click("#mpExportarBotao");
  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click('[data-mp="geojson"]')]);
  assert.match(download.suggestedFilename(), /\.geojson$/);

  // Abre de novo na aba Mapas (onde parou).
  await pagina.reload();
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => document.body.getAttribute("data-vista") === "mapas" && document.querySelectorAll(".mp-item").length === 4);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Mapas: cidades dos equipamentos do diagrama (IBGE) e vários mapas", async () => {
  const projetos = projetoExemplo();
  const eqs = projetos["Projeto Ação"].equipamentos;
  eqs[0].municipio = "Santa Cruz do Sul"; eqs[1].municipio = "Santa Cruz do Sul"; eqs[2].municipio = "Ibirubá"; eqs[2].status = "offline";
  const pagina = await abrirPagina(navegador, site, { projetos });
  await semInternetNoMapa(pagina);
  await abrirMapas(pagina);
  await pagina.click('[data-mp="diagrama"]');
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 2);
  assert.equal(await contagem(pagina, "falha"), 1, "Ibirubá tem equipamento offline");
  await pagina.click('.mp-item:has-text("Santa Cruz do Sul")');
  assert.match(await pagina.textContent(".mp-equips"), /OLT-Centro.*ONU Ação/s);
  assert.equal(await pagina.inputValue("[data-mp-form] [name=lat]"), "-29.6462");
  // Trazer de novo não duplica.
  await pagina.click('[data-mp="diagrama"]');
  await pagina.waitForTimeout(300);
  await pagina.click('[data-mp-aba="pontos"]');
  assert.equal(await pagina.$$eval(".mp-item", l => l.length), 2);

  // Segundo mapa, vazio; volta ao primeiro.
  await pagina.click('[data-mp="novo"]');
  await pagina.fill("#modalInput", "Clientes");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForFunction(() => document.querySelector("#mpMapa").selectedOptions[0].textContent === "Clientes");
  assert.equal(await pagina.$$eval(".mp-item", l => l.length), 0);
  await pagina.selectOption("#mpMapa", { index: 0 });
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 2);
  // Paleta de comandos acha o ponto.
  const candidatos = await pagina.evaluate(() => window.GrafoMapas.candidatos().map(c => c.titulo));
  assert.ok(candidatos.includes("Ibirubá") && candidatos.includes("Clientes"));
  // Diagrama volta normal.
  await pagina.click('[data-vista-ir="editor"]');
  assert.equal(await pagina.isVisible("#workspace"), true);
  assert.equal(await pagina.isVisible("#telaMapas"), false);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Mapas no celular: mapa em cima, lista embaixo, nada fora da tela", async () => {
  const pagina = await abrirPagina(navegador, site, { celular: true });
  await semInternetNoMapa(pagina);
  await esperarEditor(pagina);
  await pagina.waitForFunction(() => window.GrafoMapas);
  await pagina.evaluate(() => document.querySelector('[data-vista-ir="mapas"]').click());
  await pagina.waitForSelector("#telaMapas .mp-palco", { state: "visible" });
  await importar(pagina, "zabbix.csv", CSV.replace("POP-NRT;POP Norte;down;;;2", "POP-NRT;POP Norte;down;-29,60;-52,38;2"), "text/csv");
  await pagina.waitForFunction(() => document.querySelectorAll(".mp-item").length === 2);
  const fora = await pagina.evaluate(async () => {
    await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
    const W = document.documentElement.clientWidth;
    return [...document.querySelectorAll("#telaMapas *, .vista-alternador *")].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1) && !e.closest("[hidden]");
    }).map(e => e.id || String(e.className) || e.tagName).slice(0, 5);
  });
  assert.deepEqual(fora, []);
  const palco = await pagina.$eval(".mp-palco", e => e.getBoundingClientRect()), painel = await pagina.$eval(".mp-painel", e => e.getBoundingClientRect());
  assert.ok(painel.top >= palco.bottom, "lista embaixo do mapa");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
