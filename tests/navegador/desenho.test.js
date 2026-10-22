// Ferramentas no estilo draw.io: formas, texto, caneta, borracha, etiqueta de VLAN e rota à mão.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const dados = pagina => pagina.evaluate(() => window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()));

async function arrastarNoCanvas(pagina, de, para) {
  const caixa = await pagina.locator("#canvas").boundingBox();
  await pagina.mouse.move(caixa.x + de[0], caixa.y + de[1]);
  await pagina.mouse.down();
  await pagina.mouse.move(caixa.x + (de[0] + para[0]) / 2, caixa.y + (de[1] + para[1]) / 2, { steps: 4 });
  await pagina.mouse.move(caixa.x + para[0], caixa.y + para[1], { steps: 4 });
  await pagina.mouse.up();
}

test("desenha retângulo, seta e caneta; muda a cor; apaga com a borracha e com Delete", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click('[data-ferramenta="retangulo"]');
  assert.equal(await pagina.isVisible(".barra-estilo-desenho"), true, "a barra de estilo aparece com a ferramenta");
  await arrastarNoCanvas(pagina, [300, 200], [420, 280]);
  await pagina.waitForSelector("#canvas g.desenho-retangulo");
  let d = await dados(pagina);
  assert.equal(d.desenhos.length, 1);
  assert.ok(d.desenhos[0].x2 - d.desenhos[0].x > 40, "o retângulo tem a largura arrastada");
  // Depois de desenhar, volta para "selecionar" com a forma selecionada: muda a cor.
  assert.equal(await pagina.getAttribute('[data-ferramenta="selecionar"]', "aria-pressed"), "true");
  await pagina.click('.be-cor[data-cor="#3B82F6"]');
  d = await dados(pagina);
  assert.equal(d.desenhos[0].cor, "#3B82F6");

  await pagina.keyboard.press("a");
  await arrastarNoCanvas(pagina, [500, 300], [600, 300]);
  await pagina.waitForSelector("#canvas g.desenho-seta polygon");

  await pagina.click('[data-ferramenta="caneta"]');
  await arrastarNoCanvas(pagina, [250, 350], [350, 420]);
  await pagina.waitForSelector("#canvas g.desenho-caneta path");
  d = await dados(pagina);
  assert.equal(d.desenhos.length, 3);
  assert.ok(d.desenhos[2].pontos.length >= 3, "o traço guarda os pontos");

  await pagina.click('[data-ferramenta="borracha"]');
  await pagina.locator("#canvas g.desenho-caneta .desenho-toque").click({ force: true });
  await pagina.waitForFunction(() => !document.querySelector("#canvas g.desenho-caneta"));
  // Selecionar a seta e apagar com Delete.
  await pagina.keyboard.press("v");
  await pagina.locator("#canvas g.desenho-seta .desenho-toque").click({ force: true });
  await pagina.keyboard.press("Delete");
  await pagina.waitForFunction(() => !document.querySelector("#canvas g.desenho-seta"));
  d = await dados(pagina);
  assert.deepEqual(d.desenhos.map(x => x.tipo), ["retangulo"]);
  // Ctrl+Z traz a seta de volta.
  await pagina.keyboard.press("Control+z");
  await pagina.waitForSelector("#canvas g.desenho-seta");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("texto livre: clica, digita e aparece no diagrama", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click('[data-ferramenta="texto"]');
  const caixa = await pagina.locator("#canvas").boundingBox();
  await pagina.mouse.click(caixa.x + 320, caixa.y + 240);
  await pagina.waitForSelector("#appModal:not(.hidden)");
  await pagina.fill("#modalInput", "TRANSPORTE UNIFIQUE");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForFunction(() => /TRANSPORTE UNIFIQUE/.test((document.querySelector("#canvas g.desenho-texto") || {}).textContent || ""));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("etiqueta de VLAN e números nas pontas pelo editor do cabo; rota do cabo à mão", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.locator("#canvas g.edge").first().focus();
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("#editorCaboForm:not(.hidden)");
  await pagina.fill("#editCaboVlan", "2047");
  await pagina.fill("#editCaboRedeVlan", "172.20.8.168/30");
  await pagina.fill("#editCaboNumSaida", "169");
  await pagina.fill("#editCaboNumChegada", "170");
  await pagina.click('#editorCaboForm button[type="submit"]');
  await pagina.waitForSelector("#canvas g.cabo-etiqueta");
  assert.match(await pagina.textContent("#canvas g.cabo-etiqueta"), /VLAN 2047.*172\.20\.8\.168\/30/);
  assert.equal(await pagina.locator("#canvas text.cabo-num").count(), 2);

  // Clique no cabo: aparecem as alças; arrastar uma muda a rota e salva.
  await pagina.locator("#canvas g.edge").first().dispatchEvent("click");
  await pagina.waitForSelector("#canvas .rota-alca");
  assert.match(await pagina.textContent(".barra-estilo-desenho"), /Rota automática/);
  const alca = await pagina.locator("#canvas .rota-alca").first().boundingBox();
  await pagina.mouse.move(alca.x + alca.width / 2, alca.y + alca.height / 2);
  await pagina.mouse.down();
  await pagina.mouse.move(alca.x + 40, alca.y + 40, { steps: 5 });
  await pagina.mouse.up();
  await pagina.waitForFunction(() => {
    const d = window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual());
    return d.conexoes.some(c => Array.isArray(c.rota) && c.rota.length);
  });
  // "Rota automática" desfaz.
  await pagina.locator("#canvas g.edge").first().dispatchEvent("click");
  await pagina.click('[data-be-acao="rota-auto"]');
  await pagina.waitForFunction(() => !window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()).conexoes.some(c => c.rota));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Organizar: nota longe vem para perto do diagrama e rota à mão volta a ser automática", async () => {
  const projetos = { "Longe": {
    equipamentos: [{ id: "a", nome: "SW-A", tipo: "Switch" }, { id: "b", nome: "SW-B", tipo: "Switch" }],
    conexoes: [{ de: "a", para: "b", saida: "p1", chegada: "p2", rota: [{ x: 0, y: 0 }, { x: -3000, y: 0 }, { x: -3000, y: 3000 }, { x: 0, y: 3000 }] }],
    anotacoes: [{ id: "n1", texto: "nota esquecida", x: -6000, y: 9000, cor: "#FFF3B0" }]
  } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.click("#btnLayoutMenu");
  await pagina.click("#btnOrganizarDiagrama");
  await pagina.waitForFunction(() => {
    const d = window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual());
    return d.anotacoes[0].y < 3000 && !d.conexoes[0].rota;
  });
  const d = await dados(pagina);
  const ys = d.equipamentos.map(e => e.posicao.y);
  assert.ok(d.anotacoes[0].y - Math.max(...ys) < 400, "a nota fica logo abaixo dos equipamentos");
  assert.ok(Math.abs(d.anotacoes[0].x - Math.min(...d.equipamentos.map(e => e.posicao.x))) < 400);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("arrastar uma forma vai até o fim, sem travar no meio", async () => {
  const projetos = { "Formas": { equipamentos: [{ id: "a", nome: "SW-A", tipo: "Switch" }], conexoes: [],
    desenhos: [{ id: "r1", tipo: "retangulo", x: 0, y: 200, x2: 120, y2: 260, cor: "#E5484D", espessura: 2 }] } };
  const pagina = await abrirPagina(navegador, site, { projetos, viewport: { width: 1400, height: 1400 } });
  await esperarDiagrama(pagina);
  const forma = await pagina.locator('#canvas g.desenho[data-desenho="r1"] rect').first().boundingBox();
  const zoom = await pagina.evaluate(() => { const g = document.querySelector("#canvas svg g.graph"); return g.getScreenCTM().a; });
  await pagina.mouse.move(forma.x + 2, forma.y + forma.height / 2);
  await pagina.mouse.down();
  for (let i = 1; i <= 10; i++) await pagina.mouse.move(forma.x + 2 + i * 15, forma.y + forma.height / 2, { steps: 2 });
  await pagina.mouse.up();
  await pagina.waitForFunction(() => window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()).desenhos[0].x > 0);
  const d = await dados(pagina);
  assert.ok(Math.abs(d.desenhos[0].x - 150 / zoom) <= 10, "andou o arraste inteiro (" + d.desenhos[0].x + ")");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("biblioteca de equipamentos: clicar adiciona, arrastar solta onde quiser", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const antes = (await dados(pagina)).equipamentos.length;
  await pagina.click("#btnBibliotecaEquip");
  await pagina.waitForSelector("#bibliotecaEquip:not([hidden]) .be-item");
  await pagina.fill(".be-busca", "olt");
  assert.equal(await pagina.locator(".be-item").first().getAttribute("data-tipo"), "OLT", "o que começa com o termo vem primeiro");
  await pagina.locator(".be-item[data-tipo=\"OLT\"]").click();
  await pagina.waitForFunction(n => window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()).equipamentos.length === n + 1, antes);
  let d = await dados(pagina);
  const nova = d.equipamentos[d.equipamentos.length - 1];
  assert.equal(nova.tipo, "OLT");
  assert.match(nova.nome, /^OLT \d+$/);
  assert.match(nova.icone, /OLT/);
  // Arrastar para o canvas.
  await pagina.fill(".be-busca", "switch");
  await pagina.locator(".be-item[data-tipo=\"Switch\"]").dragTo(pagina.locator("#canvas"), { targetPosition: { x: 650, y: 150 } });
  await pagina.waitForFunction(n => window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()).equipamentos.length === n + 2, antes);
  d = await dados(pagina);
  assert.equal(d.equipamentos[d.equipamentos.length - 1].tipo, "Switch");
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("Switch 1"));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("ligar com o mouse: arrastar a bolinha de um equipamento até outro cria o cabo e abre o editor", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const antes = (await dados(pagina)).conexoes.length;
  const nos = pagina.locator("#canvas g.node");
  const origem = await nos.nth(0).boundingBox();
  await pagina.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
  await pagina.waitForSelector("#canvas .ligar-bolinha");
  const bolinha = await pagina.locator("#canvas .ligar-bolinha").nth(1).boundingBox();
  const destino = await nos.nth(3).boundingBox();
  await pagina.mouse.move(bolinha.x + bolinha.width / 2, bolinha.y + bolinha.height / 2);
  await pagina.mouse.down();
  await pagina.mouse.move(destino.x + destino.width / 2, destino.y + destino.height / 2, { steps: 8 });
  await pagina.mouse.up();
  await pagina.waitForSelector("#editorCaboForm:not(.hidden)");
  const d = await dados(pagina);
  assert.equal(d.conexoes.length, antes + 1);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("link entre diagramas: selo ↗ abre o outro diagrama e 'Voltar' retorna", async () => {
  const projetos = {
    "EVPN": { equipamentos: [{ id: "a", nome: "core-l2-pf", tipo: "Switch", diagrama: "L2" }, { id: "b", nome: "MX204", tipo: "Roteador" }], conexoes: [{ de: "a", para: "b" }] },
    "L2": { equipamentos: [{ id: "x", nome: "Netflix", tipo: "Servidor" }], conexoes: [] }
  };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#canvas .selo-diagrama");
  await pagina.locator("#canvas .selo-diagrama").dispatchEvent("click");
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "L2");
  await pagina.waitForSelector("#voltarDiagrama:not([hidden])");
  assert.match(await pagina.textContent("#voltarDiagrama"), /Voltar para EVPN/);
  await pagina.click("#voltarDiagrama");
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "EVPN");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("camadas escondem VLANs e notas na tela; agrupar e colar em outro diagrama mantém o nome", async () => {
  const projetos = {
    "A": { equipamentos: [{ id: "a", nome: "SW-A", tipo: "Switch" }, { id: "b", nome: "SW-B", tipo: "Switch" }],
      conexoes: [{ de: "a", para: "b", saida: "p1", chegada: "p2", vlan: "2047", redeVlan: "172.20.8.168/30" }],
      anotacoes: [{ id: "n1", texto: "nota", x: 0, y: 200, cor: "#FFF3B0" }] },
    "B": { equipamentos: [{ id: "z", nome: "SW-Z", tipo: "Switch" }], conexoes: [] }
  };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#canvas g.cabo-etiqueta");
  await pagina.click("#btnCamadas");
  await pagina.locator('#menuCamadas [data-camada="vlan"]').uncheck();
  await pagina.locator('#menuCamadas [data-camada="notas"]').uncheck();
  assert.equal(await pagina.locator("#canvas g.cabo-etiqueta").isVisible(), false);
  assert.equal(await pagina.locator("#canvas g.anotacao").isVisible(), false);
  await pagina.keyboard.press("Escape");
  // Selecionar os dois (Ctrl+A) e agrupar.
  await pagina.keyboard.press("Control+a");
  await pagina.waitForSelector("#barraSelecao:not([hidden])");
  await pagina.click('[data-selecao="agrupar"]');
  await pagina.fill("#modalInput", "POP Centro");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForFunction(() => window.GrafoApp.dadosProjeto("A").equipamentos.every(e => e.grupo === "POP Centro"));
  // Copiar e colar no diagrama B: nomes ficam iguais (espera o redesenho depois de agrupar).
  await pagina.waitForTimeout(600);
  await pagina.keyboard.press("Control+a");
  await pagina.keyboard.press("Control+c");
  await pagina.waitForFunction(() => (JSON.parse(localStorage.getItem("grafo-copia") || "{}").equipamentos || []).length === 2);
  await pagina.evaluate(() => window.GrafoApp.trocarProjeto("B"));
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "B");
  await pagina.waitForSelector("#canvas g.node");
  await pagina.keyboard.press("Control+v");
  await pagina.waitForFunction(() => window.GrafoApp.dadosProjeto("B").equipamentos.length === 3);
  const nomes = (await pagina.evaluate(() => window.GrafoApp.dadosProjeto("B"))).equipamentos.map(e => e.nome).sort();
  assert.deepEqual(nomes, ["SW-A", "SW-B", "SW-Z"]);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Como fazer: abre pela caixa de ferramentas e a busca filtra", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => window.GrafoAjuda);
  await pagina.click("#btnComoFazer");
  await pagina.waitForSelector(".folha-ajuda:not([hidden])");
  await pagina.fill(".ajuda-busca", "vlan");
  const visiveis = await pagina.locator(".ajuda-item:not([hidden])").count();
  assert.ok(visiveis >= 1 && visiveis < 6, "filtra pelo termo (" + visiveis + ")");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector(".folha-ajuda", { state: "hidden" });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("LAG desenhada como um cabo só: um rótulo com a contagem e o mesmo caminho no meio", async () => {
  const projetos = { "LAG": { equipamentos: [{ id: "a", nome: "core", tipo: "Switch" }, { id: "b", nome: "NETFLIX", tipo: "Servidor" }],
    conexoes: [
      { de: "a", para: "b", saida: "xe-0/0/34", chegada: "?", tipo: "LAG ae7 (Netflix1-PFU)", potencia: "10G" },
      { de: "a", para: "b", saida: "xe-0/0/33", chegada: "?", tipo: "LAG ae7 (Netflix1-PFU)", potencia: "10G" }
    ] } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.waitForSelector("#canvas g.edge.lag-tronco");
  const rotulos = await pagina.evaluate(() => [...document.querySelectorAll("#canvas g.edge > text")].filter(t => t.style.display !== "none").map(t => t.textContent));
  assert.deepEqual(rotulos, ["ae7 · 20G"]);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("cada ligação com uma cor diferente (LAG com a mesma), tráfego no selo e opção de desligar", async () => {
  const projetos = { "Core": { equipamentos: [{ id: "c", nome: "core-l2-pf", tipo: "Switch" }, { id: "n", nome: "NETFLIX", tipo: "Servidor" }, { id: "e", nome: "core-pfu-evpn-02", tipo: "Switch" }],
    conexoes: [
      { de: "c", para: "n", saida: "xe-0/0/33", chegada: "?", tipo: "LAG ae7 (Netflix1-PFU)", potencia: "10G" },
      { de: "c", para: "n", saida: "xe-0/0/34", chegada: "?", tipo: "LAG ae7 (Netflix1-PFU)", potencia: "10G" },
      { de: "c", para: "e", saida: "et-0/0/48", chegada: "et-0/0/30", tipo: "CORE-EVPN", potencia: "100G", trafegoEntrada: "2.7G", trafegoSaida: "43M" }
    ] } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  const cores = () => pagina.evaluate(() => [...document.querySelectorAll("#canvas g.edge > path")].map(p => p.getAttribute("stroke").toUpperCase()));
  let c = await cores();
  assert.equal(c[0], c[1], "as portas da LAG com a mesma cor");
  assert.notEqual(c[0], c[2], "outra ligação com outra cor");
  const selos = await pagina.evaluate(() => [...document.querySelectorAll("#canvas g.edge > text")].filter(t => t.style.display !== "none").map(t => t.textContent));
  assert.ok(selos.includes("ae7 · 20G") && selos.includes("100G ↓2.7G ↑43M"), JSON.stringify(selos));
  // Desligar a opção volta todos para a cor padrão.
  await pagina.click("#btnCamadas");
  await pagina.locator('#menuCamadas [data-camada="cores"]').uncheck();
  await pagina.waitForFunction(() => [...document.querySelectorAll("#canvas g.edge > path")].every(p => p.getAttribute("stroke").toUpperCase() === "#5A7284"));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
