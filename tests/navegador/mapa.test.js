// Mapa Regional: importar GeoJSON/TopoJSON/SVG, desenhar atrás do diagrama, salvar e exportar.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// Três "municípios" fictícios (quadrados em lon/lat), só para o teste.
const quadrado = (x, y, nome, codigo) => ({ type: "Feature", properties: { NM_MUN: nome, CD_MUN: codigo },
  geometry: { type: "Polygon", coordinates: [[[x, y], [x + 0.2, y], [x + 0.2, y + 0.2], [x, y + 0.2], [x, y]]] } });
const GEOJSON = JSON.stringify({ type: "FeatureCollection", features: [
  quadrado(-53.2, -28.6, "Cidade A", "4300001"), quadrado(-53.0, -28.6, "Cidade B", "4300002"), quadrado(-53.0, -28.8, "Cidade C", "4300003")
] });

async function importar(pagina, nome, conteudo, tipo) {
  if (!(await pagina.isVisible("#mapaArquivo"))) await pagina.click('[data-nav-panel="navMapa"]');
  await pagina.setInputFiles("#mapaArquivo", { name: nome, mimeType: tipo, buffer: Buffer.from(conteudo) });
  await pagina.waitForSelector("#canvas g.camada-mapa path", { state: "attached", timeout: 20000 });
}
const salvo = pagina => pagina.evaluate(() => {
  const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
  const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
  return JSON.parse(localStorage.getItem(chave))[atual];
});

test("importa GeoJSON: regiões atrás dos equipamentos, salva, reabre e sai na exportação", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await importar(pagina, "cidades.geojson", GEOJSON, "application/json");
  const n = await pagina.$$eval("#canvas g.camada-mapa g.mapa-regioes > path", l => l.length);
  assert.equal(n, 3);
  // O mapa vem antes (atrás) dos equipamentos.
  assert.ok(await pagina.evaluate(() => {
    const g = document.querySelector("#canvas g.graph");
    const mapa = g.querySelector("g.camada-mapa"), no = g.querySelector("g.node");
    return !!(mapa.compareDocumentPosition(no) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  const p = await salvo(pagina);
  assert.equal(p.mapa.regioes.length, 3);
  assert.equal(p.mapa.regioes[0].nome, "Cidade A");
  // Recarrega: o mapa continua.
  await pagina.reload();
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#canvas g.camada-mapa path", { state: "attached" });
  if (process.env.FOTO_MAPA) await pagina.screenshot({ path: process.env.FOTO_MAPA });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("TopoJSON e SVG também entram; arquivo sem polígonos avisa", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  const topo = JSON.stringify({ type: "Topology", transform: { scale: [0.001, 0.001], translate: [-53, -29] },
    objects: { m: { type: "GeometryCollection", geometries: [{ type: "Polygon", arcs: [[0]], properties: { nome: "X" } }] } },
    arcs: [[[0, 0], [100, 0], [0, 100], [-100, 0], [0, -100]]] });
  await importar(pagina, "m.topojson", topo, "application/json");
  assert.equal(await pagina.$$eval("#canvas g.camada-mapa g.mapa-regioes > path", l => l.length), 1);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path id="Norte" d="M0 0L100 0L100 100Z"/><polygon points="100,0 200,0 200,100"/><script>alert(1)</script></svg>';
  await pagina.setInputFiles("#mapaArquivo", { name: "m.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.camada-mapa g.mapa-regioes > path").length === 2);
  assert.equal(await pagina.$$eval("#canvas g.camada-mapa script", l => l.length), 0);
  await pagina.setInputFiles("#mapaArquivo", { name: "vazio.json", mimeType: "application/json", buffer: Buffer.from('{"type":"FeatureCollection","features":[]}') });
  await pagina.waitForFunction(() => /Não deu para ler o mapa/.test(document.body.textContent));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("município no equipamento: vai para dentro dele; ocultar municípios; Organizar não muda de cidade", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await importar(pagina, "cidades.geojson", GEOJSON, "application/json");
  // Edita a OLT-Centro: município Cidade C.
  await pagina.locator("#canvas g.node", { hasText: "OLT-Centro" }).first().dblclick();
  await pagina.waitForSelector("#editEquipMunicipio", { state: "visible" });
  await pagina.fill("#editEquipMunicipio", "Cidade C");
  await pagina.click("#editorEquipForm .primary");
  // Um segundo município com equipamento (com uma cidade só, o mapa é só fundo).
  await pagina.waitForTimeout(800);
  await pagina.locator("#canvas g.node", { hasText: "ONU Ação" }).first().dblclick();
  await pagina.waitForSelector("#editEquipMunicipio", { state: "visible" });
  await pagina.fill("#editEquipMunicipio", "Cidade A");
  await pagina.click("#editorEquipForm .primary");
  const dentro = () => pagina.evaluate(() => {
    const path = document.querySelector('#canvas g.camada-mapa g.mapa-regioes > path[data-regiao="2"]');
    const no = [...document.querySelectorAll("#canvas svg g.node")].find(g => g.textContent.includes("OLT-Centro"));
    const r = no.getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const pr = path.getBoundingClientRect();
    return c.x > pr.left && c.x < pr.right && c.y > pr.top && c.y < pr.bottom;
  });
  await pagina.waitForFunction(() => {
    const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
    const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
    return JSON.parse(localStorage.getItem(chave))[atual].equipamentos.find(e => e.nome === "OLT-Centro").municipio === "Cidade C";
  });
  await pagina.waitForTimeout(1500);
  assert.ok(await dentro(), "OLT-Centro dentro da Cidade C");
  // Organizar com mapa: continua na Cidade C.
  await pagina.evaluate(() => document.getElementById("btnOrganizarDiagrama").click());
  await pagina.waitForTimeout(2500);
  assert.ok(await dentro(), "continua na Cidade C depois de Organizar");
  // Ocultar a Cidade A pela lista.
  if (!(await pagina.isVisible("#mapaBuscaRegiao"))) await pagina.click('[data-nav-panel="navMapa"]');
  await pagina.fill("#mapaBuscaRegiao", "Cidade A");
  await pagina.uncheck('#mapaListaRegioes input[type=checkbox]');
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.camada-mapa g.mapa-regioes > path").length === 2);
  // Estilo Grafo troca as cores.
  await pagina.click("#mapaEstiloGrafo");
  await pagina.waitForFunction(() => document.querySelector("#canvas g.mapa-regioes").getAttribute("fill").toLowerCase() === "#cfe6d6");
  if (process.env.FOTO_MAPA2) await pagina.screenshot({ path: process.env.FOTO_MAPA2 });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("imagem de fundo: entra, ajusta opacidade, bloqueia e fica salva", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navMapa"]');
  // PNG 2x2 verde.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGBgZGBkYGBgYGBgAAAACwABtDM+EwAAAABJRU5ErkJggg==", "base64");
  await pagina.setInputFiles("#mapaArquivoImagem", { name: "fundo.png", mimeType: "image/png", buffer: png });
  await pagina.waitForSelector("#canvas g.camada-mapa g.mapa-imagem image", { state: "attached" });
  await pagina.fill("#mapaOpacidade", "40");
  await pagina.dispatchEvent("#mapaOpacidade", "input");
  await pagina.waitForFunction(() => document.querySelector("#canvas g.mapa-imagem image").getAttribute("opacity") === "0.4");
  await pagina.check("#mapaImagemBloqueada");
  const p = await salvo(pagina);
  assert.ok(p.mapa.imagem.src.startsWith("data:image/png;base64,"));
  assert.equal(p.mapa.imagem.bloqueado, true);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("projeto de exemplo Rota 100G (PDF): 11 equipamentos, 10 enlaces, km e município preenchidos", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.click("#btnNovoProjeto");
  await pagina.fill("#novoProjetoNome", "Rota 100G");
  await pagina.locator('.modelo-opcao:has(input[value="rota100g"])').click();
  await pagina.click('#novoProjetoForm button[type="submit"]');
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "Rota 100G");
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas svg g.node").length === 11, null, { timeout: 30000 });
  const p = await salvo(pagina);
  assert.equal(p.conexoes.length, 10);
  assert.equal(p.equipamentos.filter(e => e.municipio === "Tunas").length, 2);
  assert.match(await pagina.textContent("#canvas"), /20 km/);
  if (process.env.FOTO_ROTA) { await pagina.waitForTimeout(1500); await pagina.screenshot({ path: process.env.FOTO_ROTA }); }
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Gerar mapa (IBGE): baixa a malha do estado, fica só com os municípios do diagrama e acha a cidade no nome", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  // IBGE simulado (o teste não depende da internet).
  const malha = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { codarea: "4300001" }, geometry: { type: "Polygon", coordinates: [[[-53.2, -28.6], [-53.0, -28.6], [-53.0, -28.4], [-53.2, -28.4], [-53.2, -28.6]]] } },
    { type: "Feature", properties: { codarea: "4300002" }, geometry: { type: "Polygon", coordinates: [[[-53.0, -28.6], [-52.8, -28.6], [-52.8, -28.4], [-53.0, -28.4], [-53.0, -28.6]]] } },
    { type: "Feature", properties: { codarea: "4300003" }, geometry: { type: "Polygon", coordinates: [[[-52.8, -28.6], [-52.6, -28.6], [-52.6, -28.4], [-52.8, -28.4], [-52.8, -28.6]]] } }
  ] };
  const nomes = [{ id: 4300001, nome: "Ibirubá" }, { id: 4300002, nome: "Quinze de Novembro" }, { id: 4300003, nome: "Tunas" }];
  await pagina.route("https://servicodados.ibge.gov.br/api/v3/malhas/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(malha) }));
  await pagina.route("https://servicodados.ibge.gov.br/api/v1/localidades/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(nomes) }));
  await esperarDiagrama(pagina);
  // Dois equipamentos com a cidade no nome (sem preencher o Município).
  for (const nome of ["POP-IBR01 | Ibiruba - Coprel", "POP-THS01 | Tunas - Cidade"]) {
    await pagina.click('[data-nav-panel="navAddEquip"]');
    await pagina.waitForSelector("#navEquipNome", { state: "visible" });
    await pagina.fill("#navEquipNome", nome);
    await pagina.click('#navEquipForm button[type="submit"]');
    await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {});
  }
  await pagina.click('[data-nav-panel="navMapa"]');
  await pagina.click("#mapaGerarIbge");
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.camada-mapa g.mapa-regioes > path").length === 2, null, { timeout: 20000 });
  const p = await salvo(pagina);
  assert.deepEqual(p.mapa.regioes.map(r => r.nome).sort(), ["Ibirubá", "Tunas"]);
  assert.equal(p.equipamentos.find(e => e.nome.startsWith("POP-IBR01")).municipio, "Ibirubá");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("sigla CNL da Anatel no nome do POP: preenche o município (POP-TPA01 → Tapera) e entra no mapa do IBGE", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  const quad = (x, cod) => ({ type: "Feature", properties: { codarea: cod }, geometry: { type: "Polygon", coordinates: [[[x, -28.6], [x + 0.2, -28.6], [x + 0.2, -28.4], [x, -28.4], [x, -28.6]]] } });
  await pagina.route("https://servicodados.ibge.gov.br/api/v3/malhas/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ type: "FeatureCollection", features: [quad(-53.2, "4321105"), quad(-53.0, "4320701")] }) }));
  await pagina.route("https://servicodados.ibge.gov.br/api/v1/localidades/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: 4321105, nome: "Tapera" }, { id: 4320701, nome: "Selbach" }]) }));
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.waitForSelector("#navEquipNome", { state: "visible" });
  await pagina.fill("#navEquipNome", "POP-TPA01_DISTR-11");
  await pagina.waitForFunction(() => document.getElementById("navEquipMunicipio").value === "Tapera", null, { timeout: 10000 });
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {});
  // Outro POP só com a sigla no nome (sem Município): acha pelo CNL na hora de gerar o mapa.
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.fill("#navEquipNome", "POP-SXH03_DISTR-51");
  await pagina.fill("#navEquipMunicipio", "");
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {});
  await pagina.click('[data-nav-panel="navMapa"]');
  await pagina.click("#mapaGerarIbge");
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.camada-mapa g.mapa-regioes > path").length === 2, null, { timeout: 20000 });
  const p = await salvo(pagina);
  assert.equal(p.equipamentos.find(e => e.nome === "POP-SXH03_DISTR-51").municipio, "Selbach");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Gerar a partir de texto já monta sobre o mapa: estado e cidades descobertos pelas siglas dos POPs", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  const quad = (x, cod) => ({ type: "Feature", properties: { codarea: cod }, geometry: { type: "Polygon", coordinates: [[[x, -28.6], [x + 0.2, -28.6], [x + 0.2, -28.4], [x, -28.4], [x, -28.6]]] } });
  let ufPedida = "";
  await pagina.route("https://servicodados.ibge.gov.br/api/v3/malhas/**", r => { ufPedida = r.request().url().match(/estados\/(\d+)/)[1]; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ type: "FeatureCollection", features: [quad(-53.2, "1"), quad(-53.0, "2"), quad(-52.8, "3")] }) }); });
  await pagina.route("https://servicodados.ibge.gov.br/api/v1/localidades/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: 1, nome: "Tapera" }, { id: 2, nome: "Selbach" }, { id: 3, nome: "Espumoso" }]) }));
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => window.GrafoLeitor);
  await pagina.click("#btnGerarTexto");
  await pagina.fill("[data-leitor-nome]", "POP-TPA01_DISTR-11");
  await pagina.fill("[data-leitor-texto]", "ten-gigabit-ethernet-1/1/1\nENLACE_POP-SXH03_DISTR-51_XE2\n\nUP\n\nten-gigabit-ethernet-1/1/8\nENLACE_POP-EPO01_DISTR-12_XE1\n\nUP\n");
  await pagina.click("[data-leitor-ler]");
  await pagina.waitForSelector('[data-passo="revisar"]:not([hidden])');
  assert.equal(await pagina.isChecked("[data-leitor-mapa]"), true);
  await pagina.click("[data-leitor-novo]");
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.camada-mapa g.mapa-regioes > path").length === 3, null, { timeout: 30000 });
  assert.equal(ufPedida, "43", "RS descoberto pelas siglas");
  const p = await salvo(pagina);
  assert.deepEqual(p.equipamentos.map(e => e.municipio).sort(), ["Espumoso", "Selbach", "Tapera"]);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Limpar: só o mapa tira municípios e imagem e deixa equipamentos e cabos", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await importar(pagina, "cidades.geojson", GEOJSON, "application/json");
  const antes = await salvo(pagina);
  await pagina.click("#btnLimpar");
  await pagina.check('input[name="limparModo"][value="mapa"]');
  assert.match(await pagina.textContent("#limparResumo"), /o mapa/);
  await pagina.click("#limparConfirmar");
  await pagina.waitForFunction(() => !document.querySelector("#canvas g.camada-mapa"));
  const depois = await salvo(pagina);
  assert.equal(depois.mapa, undefined);
  assert.equal(depois.equipamentos.length, antes.equipamentos.length);
  assert.equal(depois.conexoes.length, antes.conexoes.length);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("sigla do POP manda: corrige cidade errada já gravada e não lê CCR (MikroTik) como Cachoeira do Sul; Apagar mapa no topo", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  const quad = (x, cod) => ({ type: "Feature", properties: { codarea: cod }, geometry: { type: "Polygon", coordinates: [[[x, -28.6], [x + 0.2, -28.6], [x + 0.2, -28.4], [x, -28.4], [x, -28.6]]] } });
  await pagina.route("https://servicodados.ibge.gov.br/api/v3/malhas/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ type: "FeatureCollection", features: [quad(-53.2, "1"), quad(-53.0, "2"), quad(-52.8, "3"), quad(-52.6, "4")] }) }));
  await pagina.route("https://servicodados.ibge.gov.br/api/v1/localidades/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: 1, nome: "Tapera" }, { id: 2, nome: "Selbach" }, { id: 3, nome: "Espumoso" }, { id: 4, nome: "Cachoeira do Sul" }]) }));
  await esperarDiagrama(pagina);
  const adicionar = async (nome, municipio) => {
    await pagina.click('[data-nav-panel="navAddEquip"]');
    await pagina.waitForSelector("#navEquipNome", { state: "visible" });
    await pagina.fill("#navEquipNome", nome);
    await pagina.waitForTimeout(400);
    await pagina.fill("#navEquipMunicipio", municipio);
    await pagina.click('#navEquipForm button[type="submit"]');
    await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {});
  };
  await adicionar("POP-TPA01_DISTR-11", "");
  await adicionar("POP-SXH03_DISTR-51", "Espumoso"); // cidade errada gravada antes
  await adicionar("SW-CCR-01", "");
  assert.equal(await pagina.isVisible("#btnApagarMapa"), false, "sem mapa, sem botão de apagar");
  await pagina.click("#btnMontarMapa");
  await pagina.waitForSelector("#canvas g.camada-mapa g.mapa-regioes > path", { state: "attached", timeout: 20000 });
  const p = await salvo(pagina);
  const cidade = nome => p.equipamentos.find(e => e.nome === nome).municipio;
  assert.equal(cidade("POP-TPA01_DISTR-11"), "Tapera");
  assert.equal(cidade("POP-SXH03_DISTR-51"), "Selbach");
  assert.notEqual(cidade("SW-CCR-01"), "Cachoeira do Sul");
  // Apagar mapa direto no topo.
  await pagina.waitForSelector("#btnApagarMapa", { state: "visible" });
  await pagina.click("#btnApagarMapa");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForFunction(() => !document.querySelector("#canvas g.camada-mapa"));
  const depois = await salvo(pagina);
  assert.equal(depois.mapa, undefined);
  assert.equal(depois.equipamentos.length, p.equipamentos.length);
  assert.equal(await pagina.isVisible("#btnApagarMapa"), false);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
