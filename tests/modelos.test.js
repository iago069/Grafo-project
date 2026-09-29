// Modelos de equipamento e portas (assets/js/esquema.js + data/equipamentos.json).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const raiz = path.join(__dirname, "..");
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
const zod = fs.readdirSync(path.join(raiz, "assets", "vendor")).find(f => /^zod-.*\.min\.js$/.test(f));
vm.runInContext(fs.readFileSync(path.join(raiz, "assets", "vendor", zod), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, "assets", "js", "esquema.js"), "utf8"), ctx);
const E = ctx.GrafoEsquema;
const simples = v => JSON.parse(JSON.stringify(v));

test("faixas de portas são expandidas", () => {
  assert.deepEqual(simples(E.expandirPortas(["ether1-3"])), ["ether1", "ether2", "ether3"]);
  assert.deepEqual(simples(E.expandirPortas(["sfp-sfpplus1-2"])), ["sfp-sfpplus1", "sfp-sfpplus2"]);
  assert.deepEqual(simples(E.expandirPortas(["gpon1/1/7-8", "xe1/1/1"])), ["gpon1/1/7", "gpon1/1/8", "xe1/1/1"]);
  assert.deepEqual(simples(E.expandirPortas(["pon", "lan1-2"])), ["pon", "lan1", "lan2"]);
  assert.deepEqual(simples(E.expandirPortas(["ens1f0-1"])), ["ens1f0", "ens1f1"]);
});

test("portas repetidas, vazias e faixas absurdas não passam", () => {
  assert.deepEqual(simples(E.expandirPortas(["eth0", "ETH0", "", null, "eth1"])), ["eth0", "eth1"]);
  assert.deepEqual(simples(E.expandirPortas(["p5-2"])), ["p5-2"]);          // faixa invertida vira nome literal
  assert.ok(E.expandirPortas(["p1-100000"]).length <= 256);                  // não gera milhares de portas
  assert.equal(E.expandirPortas("ether1-3").length, 0);                      // precisa ser lista
});

test("modelos sem nome ou sem portas são descartados", () => {
  const m = simples(E.normalizarModelos([
    { nome: "A", portas: ["p1-2"] }, { nome: "", portas: ["x"] }, { nome: "B", portas: [] }, { nome: "a", portas: ["y"] }, null, "texto"
  ]));
  assert.deepEqual(m.map(x => x.nome), ["A"]);
  assert.deepEqual(m[0].portas, ["p1", "p2"]);
});

test("o modelo é achado pelo nome, com fabricante ou com texto a mais", () => {
  const modelos = E.normalizarModelos([
    { nome: "CRS326-24G-2S+", fabricante: "MikroTik", tipo: "Switch", portas: ["ether1-24"] },
    { nome: "CRS326", fabricante: "MikroTik", portas: ["x"] },
    { nome: "OLT 8 PON", fabricante: "Genérico", portas: ["pon1-8"] }
  ]);
  const nome = t => (E.buscarModelo(modelos, t) || {}).nome;
  assert.equal(nome("CRS326-24G-2S+"), "CRS326-24G-2S+");
  assert.equal(nome("mikrotik crs326-24g-2s+"), "CRS326-24G-2S+");
  assert.equal(nome("CRS326-24G-2S+ rack 2"), "CRS326-24G-2S+"); // o nome mais longo contido vence
  assert.equal(nome("olt 8 pon"), "OLT 8 PON");
  assert.equal(nome("Genérico OLT 8 PON"), "OLT 8 PON");
  assert.equal(nome("CRS3"), undefined);
  assert.equal(nome(""), undefined);
});

const catalogoReal = () => E.normalizarModelos(JSON.parse(fs.readFileSync(path.join(raiz, "data", "equipamentos.json"), "utf8")).modelos);

test("nome curto é reconhecido quando só um modelo começa com ele", () => {
  const modelos = catalogoReal();
  const nome = t => (E.buscarModelo(modelos, t) || {}).nome;
  assert.equal(nome("CRS326"), "CRS326-24G-2S+");     // usado no exemplo do Grafo
  assert.equal(nome("CCR2004"), "CCR2004-16G-2S+");
  assert.equal(nome("MikroTik CCR2004"), "CCR2004-16G-2S+");
  assert.equal(nome("DM4610"), "DM4610 8GPON");
  assert.equal(nome("CRS3"), undefined);               // não é início de nome inteiro
  assert.equal(nome("OLT"), undefined);                // curto demais
});

test("a lista de modelos segue o Tipo do equipamento", () => {
  const modelos = catalogoReal();
  const tipos = t => [...new Set(simples(E.filtrarModelosPorTipo(modelos, t)).map(m => m.tipo))].sort().join(",");
  const nomes = t => simples(E.filtrarModelosPorTipo(modelos, t)).map(m => m.nome);
  assert.equal(tipos("Switch"), "Switch");
  assert.equal(tipos("switch de acesso"), "Switch");
  assert.equal(tipos("OLT"), "OLT");
  assert.equal(tipos("ONU"), "ONU");
  assert.equal(tipos("Roteador"), "Roteador");
  assert.equal(tipos("UPS"), "Nobreak");               // tipos do catálogo com outro nome
  assert.equal(tipos("RPS"), "RPS");
  assert.equal(tipos("Camera IP"), "Camera IP");
  assert.ok(nomes("MikroTik").every(n => /^(CCR|CRS|RB|hEX)/.test(n)) && nomes("MikroTik").includes("CRS326-24G-2S+"),
    "tipo = fabricante: todos os modelos dele, inclusive switches");
  assert.equal(nomes("").length, modelos.length, "sem tipo: todos");
  assert.equal(nomes("Geladeira").length, modelos.length, "tipo desconhecido: todos");
  assert.equal(nomes("HVAC").length, modelos.length, "categoria sem modelos: todos");
});

test("o catálogo data/equipamentos.json é válido", () => {
  const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, "data", "equipamentos.json"), "utf8"));
  assert.ok(Array.isArray(catalogo.modelos) && catalogo.modelos.length > 0, "tem modelos");
  const normalizados = simples(E.normalizarModelos(catalogo.modelos));
  assert.equal(normalizados.length, catalogo.modelos.length, "nenhum modelo descartado (nome repetido ou sem portas)");
  normalizados.forEach(m => {
    assert.ok(m.tipo, m.nome + " tem tipo");
    assert.ok(m.portas.length >= 1, m.nome + " tem portas");
    assert.equal((E.buscarModelo(normalizados, m.nome) || {}).nome, m.nome, m.nome + " é achado pelo próprio nome");
  });
  const ccr = normalizados.find(m => m.nome === "CCR2004-16G-2S+");
  assert.equal(ccr.portas.length, 18);
  assert.equal(ccr.portas[17], "sfp-sfpplus2");
});
