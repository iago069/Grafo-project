// Anotações livres no diagrama: regras de validação (assets/js/comum/esquema.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const assets = path.join(__dirname, "..", "..", "assets");
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
const zod = fs.readdirSync(path.join(assets, "vendor")).find(f => /^zod-.*\.min\.js$/.test(f));
vm.runInContext(fs.readFileSync(path.join(assets, "vendor", zod), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(assets, "js", "comum", "esquema.js"), "utf8"), ctx);
const E = ctx.GrafoEsquema;
const simples = v => JSON.parse(JSON.stringify(v));
const base = { equipamentos: [{ id: "a", nome: "SW" }], conexoes: [] };

test("projeto sem anotações continua só com equipamentos e cabos", () => {
  const r = E.validarProjeto(base, "estrito");
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(simples(r.dados)), ["equipamentos", "conexoes"]);
});

test("anotação válida é guardada, com a cor padrão quando falta", () => {
  const r = E.validarProjeto({ ...base, anotacoes: [{ id: "n1", texto: "  Aguardando fibra\ncliente X  ", x: "12.5", y: -40 }] }, "estrito");
  assert.ok(r.ok, JSON.stringify(r.erros));
  assert.deepEqual(simples(r.dados.anotacoes), [{ id: "n1", texto: "Aguardando fibra\ncliente X", x: 12.5, y: -40, cor: "#FFF3B0" }]);
});

test("importação recusa anotação sem texto, fora da área ou repetida", () => {
  for (const ruim of [
    [{ id: "n1", texto: "", x: 0, y: 0 }],
    [{ id: "n1", texto: "ok", x: 999999, y: 0 }],
    [{ id: "n1", texto: "ok", x: 0, y: 0, cor: "vermelho" }],
    [{ id: "n1", texto: "a", x: 0, y: 0 }, { id: "n1", texto: "b", x: 0, y: 0 }],
    "não é lista"
  ]) {
    const r = E.validarProjeto({ ...base, anotacoes: ruim }, "estrito");
    assert.ok(!r.ok, JSON.stringify(ruim));
  }
});

test("projeto salvo com anotação estragada: corrige ou descarta sem travar", () => {
  const r = E.validarProjeto({ ...base, anotacoes: [
    { id: "n1", texto: "ok", x: 0, y: 0, cor: "vermelho" },
    { id: "n2", texto: "", x: 0, y: 0 },
    { id: "n3", texto: "x".repeat(600), x: 0, y: 0 }
  ] }, "reparar");
  const a = simples(r.dados.anotacoes);
  assert.deepEqual(a.map(n => n.id), ["n1", "n3"]);
  assert.equal(a[0].cor, "#FFF3B0");
  assert.equal(a[1].texto.length, 500);
});

test("no máximo 50 anotações por diagrama", () => {
  const muitas = Array.from({ length: 51 }, (_, i) => ({ id: "n" + i, texto: "t", x: 0, y: 0 }));
  assert.ok(!E.validarProjeto({ ...base, anotacoes: muitas }, "estrito").ok);
  assert.equal(E.validarProjeto({ ...base, anotacoes: muitas }, "reparar").dados.anotacoes.length, 50);
});
