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
  assert.ok(embaixo >= 1, "alguns vizinhos embaixo");
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
