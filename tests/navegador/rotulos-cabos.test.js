// Nome dos cabos (selo "1G") com vários cabos paralelos e próximos: nenhum selo
// em cima de outro selo nem em cima de outro cabo.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

function projetoParalelo(n) {
  return {
    "POP Centro": {
      equipamentos: [
        { id: "sw", nome: "SW-CORE", tipo: "Switch", grupo: "POP Centro", status: "ativo" },
        { id: "rb", nome: "RB-BORDA", tipo: "Roteador", grupo: "POP Centro", status: "ativo" }
      ],
      conexoes: Array.from({ length: n }, () => ({ de: "sw", para: "rb", tipo: "Cobre", potencia: "1G", saida: "P2", chegada: "P1" }))
    }
  };
}

for (const n of [6, 10]) {
  test(n + " cabos paralelos: os nomes não ficam um em cima do outro nem sobre outro cabo", async () => {
    const pagina = await abrirPagina(navegador, site, { projetos: projetoParalelo(n) });
    await esperarDiagrama(pagina);
    await pagina.waitForTimeout(600);
    const r = await pagina.evaluate(() => {
      const caixa = el => { const b = el.getBoundingClientRect(); return { x1: b.left, y1: b.top, x2: b.right, y2: b.bottom }; };
      const arestas = [...document.querySelectorAll("#canvas g.edge")];
      const selos = arestas.map(a => { const s = a.querySelector("g.selo-cabo rect"); return s ? caixa(s) : null; });
      const problemas = [];
      selos.forEach((s, i) => {
        if (!s) return;
        selos.forEach((t, j) => {
          if (t && j > i && Math.min(s.x2, t.x2) > Math.max(s.x1, t.x1) && Math.min(s.y2, t.y2) > Math.max(s.y1, t.y1)) problemas.push("selo " + i + " sobre o selo " + j);
        });
        arestas.forEach((a, j) => {
          const p = j !== i && a.querySelector("path");
          if (!p) return;
          const len = p.getTotalLength(), m = p.getScreenCTM();
          for (let d = 0; d < len; d += 3) {
            const q = p.getPointAtLength(d), x = m.a * q.x + m.c * q.y + m.e, y = m.b * q.x + m.d * q.y + m.f;
            if (x > s.x1 && x < s.x2 && y > s.y1 + 1 && y < s.y2 - 1) { problemas.push("selo " + i + " sobre o cabo " + j); break; }
          }
        });
      });
      return { selos: selos.filter(Boolean).length, problemas };
    });
    assert.equal(r.selos, n, "todo cabo mostra o nome");
    assert.deepEqual(r.problemas, []);
    assert.deepEqual(pagina.erros, []);
    await pagina.context().close();
  });
}
