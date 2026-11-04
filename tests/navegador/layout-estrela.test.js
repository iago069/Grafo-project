// Layout "Centro (estrela)": num projeto grande, o equipamento mais ligado fica no meio.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const posicoes = pagina => pagina.evaluate(() => {
  const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
  const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
  const r = {};
  JSON.parse(localStorage.getItem(chave))[atual].equipamentos.forEach(eq => { r[eq.id] = eq.posicao; });
  return r;
});

// Núcleo com 12 vizinhos; dois deles ainda têm um equipamento atrás.
function projetoGrande() {
  const equipamentos = [{ id: "core", nome: "CORE", tipo: "Switch" }];
  const conexoes = [];
  for (let i = 1; i <= 12; i++) {
    equipamentos.push({ id: "v" + i, nome: "VIZINHO-" + i, tipo: "Switch" });
    conexoes.push({ de: "core", para: "v" + i, saida: "xe" + i, chegada: "xe1" });
  }
  equipamentos.push({ id: "x1", nome: "ATRAS-1", tipo: "ONU" }, { id: "x2", nome: "ATRAS-2", tipo: "ONU" });
  conexoes.push({ de: "v1", para: "x1", saida: "ge2", chegada: "pon" }, { de: "v2", para: "x2", saida: "ge2", chegada: "pon" });
  return { "POP Grande": { equipamentos, conexoes } };
}

test("Automático: projeto grande fica em estrela; Esquerda → Direita volta ao layout em camadas", async () => {
  const pagina = await abrirPagina(navegador, site, { projetos: projetoGrande() });
  await esperarDiagrama(pagina);
  assert.equal(await pagina.$eval("#direcao", s => s.value), "AUTO");
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas svg g.node").length === 15);
  const p = await posicoes(pagina);
  const c = p.core;
  const vizinhos = Array.from({ length: 12 }, (_, i) => p["v" + (i + 1)]);
  const esquerda = vizinhos.filter(v => v.x < c.x - 50).length;
  const direita = vizinhos.filter(v => v.x > c.x + 50).length;
  const embaixo = vizinhos.filter(v => Math.abs(v.x - c.x) <= 50 || v.y > c.y + 150 && Math.abs(v.x - c.x) < Math.abs(v.y - c.y) / 2).length;
  assert.ok(esquerda >= 3 && direita >= 3, `vizinhos dos dois lados (esq ${esquerda}, dir ${direita})`);
  assert.equal(embaixo, 0, "ninguém embaixo do centro: só as duas colunas");
  // O que vem atrás de um vizinho fica mais longe do centro, do mesmo lado.
  assert.ok(Math.abs(p.x1.x - c.x) > Math.abs(p.v1.x - c.x) || Math.abs(p.x1.y - c.y) > Math.abs(p.v1.y - c.y));
  // Colunas laterais: o vizinho mais alto ainda recebe o cabo pela lateral do núcleo.
  const lateral = await pagina.evaluate(() => {
    const no = [...document.querySelectorAll("#canvas svg g.node")].find(g => g.textContent.includes("CORE"));
    const caixas = [...no.querySelectorAll("polygon")].filter(x => (x.getAttribute("stroke") || "none") !== "none" && x.getAttribute("stroke") !== "transparent");
    const ret = caixas.map(x => x.getBBox());
    const minX = Math.min(...ret.map(b => b.x)), maxX = Math.max(...ret.map(b => b.x + b.width));
    return ret.filter(b => b.x === minX || b.x + b.width === maxX).length;
  });
  assert.ok(lateral >= 6, "portas laterais no núcleo: " + lateral);
  assert.deepEqual(pagina.erros, []);

  // Escolher Esquerda → Direita reorganiza em camadas: todos os vizinhos de um lado só.
  await pagina.evaluate(() => { const s = document.getElementById("direcao"); s.value = "LR"; s.dispatchEvent(new Event("change")); });
  await pagina.waitForTimeout(500);
  const q = await posicoes(pagina);
  assert.ok(Array.from({ length: 12 }, (_, i) => q["v" + (i + 1)]).every(v => v.x > q.core.x), "camadas: vizinhos à direita do núcleo");
});

test("Automático: projeto pequeno continua em camadas (Esquerda → Direita)", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const p = await posicoes(pagina);
  // projetoExemplo: árvore e0 → e1, e2 → ...; filhos sempre à direita do pai.
  assert.ok(p.e1.x > p.e0.x && p.e2.x > p.e0.x);
});

// Centro com muitas pontas soltas (ex.: switch de distribuição com 22 equipamentos):
// cada lado em duas colunas em zigue-zague (metade da altura), sem nada encostando.
test("Estrela com muitas pontas: colunas em zigue-zague, metade da altura e sem sobreposição", async () => {
  const equipamentos = [{ id: "distr", nome: "POP-PFU01_DISTR-8", tipo: "Switch" }];
  const conexoes = [];
  for (let i = 1; i <= 22; i++) {
    equipamentos.push({ id: "p" + i, nome: "POP-PFU01_OLT-" + (100 + i), tipo: i % 3 ? "OLT" : "Roteador" });
    conexoes.push({ de: "distr", para: "p" + i, tipo: "Fibra", potencia: "10G", saida: "XE1/1/" + i, chegada: "XE0/0" });
  }
  conexoes.push({ de: "distr", para: "p1", tipo: "Fibra", potencia: "10G", saida: "XE1/1/30", chegada: "XE0/1" });
  const pagina = await abrirPagina(navegador, site, { projetos: { "POP Distribuição": { equipamentos, conexoes } } });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas svg g.node").length === 23);
  // Espera o desenho parar (separar sobreposições e rotear os cabos vêm depois).
  await pagina.waitForFunction(() => new Promise(ok => { const f = () => document.querySelector("#canvas svg").innerHTML.length; const a = f(); setTimeout(() => ok(f() === a), 1200); }), null, { timeout: 30000, polling: 100 });
  const p = await posicoes(pagina);
  const c = p.distr;
  for (const lado of [-1, 1]) {
    const xs = new Set(Object.keys(p).filter(id => id !== "distr" && Math.sign(p[id].x - c.x) === lado).map(id => Math.round(p[id].x / 40)));
    assert.ok(xs.size >= 2, "mais de uma coluna de cada lado: " + xs.size);
  }
  // Uma coluna só de 11 equipamentos teria ~1900 de altura.
  const ys = Object.keys(p).filter(id => id !== "distr").map(id => p[id].y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 1200, "altura das colunas: " + Math.round(Math.max(...ys) - Math.min(...ys)));
  // Em coordenadas da tela (cada equipamento é deslocado por transform).
  const caixas = await pagina.evaluate(() => [...document.querySelectorAll("#canvas svg g.node")].map(g => { const b = g.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }));
  const encostam = caixas.some((a, i) => caixas.some((b, j) => j > i && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]));
  assert.equal(encostam, false, "nenhum equipamento em cima de outro");
  // Nenhum cabo passa por cima de um equipamento que não é dele.
  const atravessam = await pagina.evaluate(() => {
    const nos = [...document.querySelectorAll("#canvas svg g.node")].map(g => { const r = g.getBoundingClientRect(); return { id: g.id, b: { x: r.left, y: r.top, width: r.width, height: r.height } }; });
    let n = 0;
    document.querySelectorAll("#canvas svg g.edge path").forEach(path => {
      const d = (path.getAttribute("d") || "").match(/-?\d+(\.\d+)?/g);
      if (!d) return;
      const len = path.getTotalLength();
      const toques = new Set();
      for (let t = 0.04; t < 0.96; t += 0.01) {
        const pt = path.getPointAtLength(len * t).matrixTransform(path.getScreenCTM());
        nos.forEach(no => { const b = no.b; if (pt.x > b.x + 2 && pt.x < b.x + b.width - 2 && pt.y > b.y + 2 && pt.y < b.y + b.height - 2) toques.add(no.id); });
      }
      if (toques.size > 0) n++;
    });
    return n;
  });
  assert.equal(atravessam, 0, "cabos por cima de equipamentos");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
