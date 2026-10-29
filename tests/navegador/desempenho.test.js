// Desempenho num projeto grande (60 equipamentos, 79 cabos): falha se o editor
// voltar a travar. Os limites são folgados (máquina lenta, CI), mas pegam as
// regressões que já aconteceram: arrastar levava ~250 ms por quadro, soltar
// e Organizar passavam de 2 s.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

function projetoGrande(n) {
  const tipos = ["Switch", "OLT", "MikroTik", "Servidor", "VOLT", "RPS"];
  const equipamentos = Array.from({ length: n }, (_, i) => ({
    id: "e" + i, nome: "POP-" + ["PFU", "IBR", "TPA", "SXH"][i % 4] + String(i).padStart(2, "0") + "_DISTR-" + i,
    tipo: tipos[i % tipos.length], modelo: i % 6 === 0 ? "DM4270 48XS+6CX" : "", grupo: "POP " + (i % 6 + 1),
    ip: "10.0." + Math.floor(i / 200) + "." + (i % 200 + 1), status: "ativo"
  }));
  const conexoes = [];
  for (let i = 1; i < n; i++) conexoes.push({ de: "e" + Math.floor((i - 1) / 3), para: "e" + i, tipo: "Fibra", saida: "XE1/1/" + i, chegada: "XE1/1/1", potencia: "10G" });
  for (let i = 0; i < 20; i++) conexoes.push({ de: "e" + (i * 2 % n), para: "e" + ((i * 7 + 11) % n), tipo: "Fibra", saida: "XE1/1/" + (40 + i), chegada: "XE1/1/" + (30 + i), potencia: "10G" });
  return { Grande: { equipamentos, conexoes } };
}

// Medidas: JS dentro de cada quadro (callbacks de requestAnimationFrame) e tarefas longas.
async function instrumentar(pagina) {
  await pagina.evaluate(() => {
    window.__quadros = [];
    window.__longas = [];
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (f) {
      return raf.call(window, function (t) { const a = performance.now(); f(t); window.__quadros.push(performance.now() - a); });
    };
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__longas.push(Math.round(e.duration)))).observe({ type: "longtask" });
  });
}
const quantil = (lista, p) => { const l = lista.slice().sort((a, b) => a - b); return l[Math.min(l.length - 1, Math.floor(l.length * p))] || 0; };

test("projeto grande: arrastar, soltar, Organizar e zoom continuam rápidos", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, projetos: projetoGrande(60) });
  await esperarDiagrama(pagina);
  await pagina.waitForTimeout(800);
  await instrumentar(pagina);

  // Arrastar o equipamento com mais cabos (a raiz da árvore).
  const no = await pagina.$("#canvas g.node");
  const b = await no.boundingBox();
  await pagina.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await pagina.mouse.down();
  for (let i = 0; i < 50; i++) { await pagina.mouse.move(b.x + b.width / 2 + i * 3, b.y + b.height / 2 + i * 2); await pagina.waitForTimeout(8); }
  const quadros = await pagina.evaluate(() => window.__quadros.splice(0));
  const mediana = quantil(quadros, 0.5), p90 = quantil(quadros, 0.9);
  await pagina.evaluate(() => { window.__longas = []; });
  await pagina.mouse.up();
  await pagina.waitForTimeout(1500);
  const soltar = Math.max(0, ...(await pagina.evaluate(() => window.__longas.splice(0))));

  // Organizar: o clique roda o layout inteiro de uma vez.
  const organizar = await pagina.evaluate(() => {
    const a = performance.now();
    document.getElementById("btnOrganizarDiagrama").click();
    return performance.now() - a;
  });
  await pagina.waitForTimeout(500);

  console.log(`  arrastar: mediana ${mediana.toFixed(1)} ms, p90 ${p90.toFixed(1)} ms por quadro (${quadros.length} quadros); soltar: ${soltar} ms; Organizar: ${Math.round(organizar)} ms`);
  assert.ok(quadros.length >= 10, "o arraste quase não desenhou quadros");
  assert.ok(mediana < 16, "arrastar ficou lento: mediana " + mediana.toFixed(1) + " ms por quadro (limite 16)");
  assert.ok(p90 < 40, "arrastar engasga: p90 " + p90.toFixed(1) + " ms por quadro (limite 40)");
  assert.ok(soltar < 1500, "soltar travou a tela por " + soltar + " ms (limite 1500)");
  assert.ok(organizar < 3500, "Organizar levou " + Math.round(organizar) + " ms (limite 3500)");

  // Zoom bem afastado: os textos pequenos somem (e voltam ao aproximar).
  const zoom = () => pagina.evaluate(() => parseInt(document.getElementById("zoomValue").textContent, 10));
  for (let i = 0; i < 20 && (await zoom()) >= 25; i++) { await pagina.click("#btnZoomOut"); await pagina.waitForTimeout(150); }
  await pagina.waitForFunction(() => document.getElementById("canvas").classList.contains("zoom-longe"));
  assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector("#canvas g.edge text, #canvas g.selo-cabo, #canvas text.cabo-num")).visibility), "hidden");
  for (let i = 0; i < 20 && (await zoom()) < 60; i++) { await pagina.click("#btnZoomIn"); await pagina.waitForTimeout(150); }
  await pagina.waitForFunction(() => !document.getElementById("canvas").classList.contains("zoom-longe"));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
