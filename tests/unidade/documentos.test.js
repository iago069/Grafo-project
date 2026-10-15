// Documentos do projeto (procedimentos e arquivos): validação no esquema.
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
const base = { equipamentos: [{ id: "a", nome: "SW" }], conexoes: [] };

test("projeto sem documentos não ganha o campo", () => {
  const r = E.validarProjeto(base, "estrito");
  assert.ok(r.ok);
  assert.equal(r.dados.documentos, undefined);
});

test("procedimento e arquivo válidos são guardados com os padrões", () => {
  const r = E.validarProjeto(Object.assign({}, base, { documentos: [
    { id: "d1", titulo: "Configurar OLT", texto: "# Passos\n1. Conectar" },
    { id: "d2", titulo: "Manual MX204", tipo: "arquivo", caminho: "u/p/d2-mx204.pdf", nomeArquivo: "mx204.pdf", tamanho: 1234, mime: "application/pdf", vinculo: "modelo:MX204" }
  ] }), "estrito");
  assert.ok(r.ok, JSON.stringify(r.erros));
  assert.equal(r.dados.documentos.length, 2);
  assert.equal(r.dados.documentos[0].tipo, "procedimento");
  assert.equal(r.dados.documentos[1].vinculo, "modelo:MX204");
});

test("documento sem título é recusado no modo estrito e ids repetidos ficam de fora", () => {
  assert.equal(E.validarProjeto(Object.assign({}, base, { documentos: [{ id: "d1" }] }), "estrito").ok, false);
  const r = E.validarProjeto(Object.assign({}, base, { documentos: [{ id: "d1", titulo: "A" }, { id: "d1", titulo: "B" }] }), "estrito");
  assert.equal(r.dados.documentos.length, 1);
});
