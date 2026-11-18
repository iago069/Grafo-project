// Bayface de Racks: regras físicas de ocupação e validação dos dados.
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

const rack42 = itens => ({ id: "r1", nome: "RACK-01", alturaU: 42, itens: itens || [] });
const item = (id, u, alturaU, extra) => Object.assign({ id, nome: id.toUpperCase(), categoria: "switch", u, alturaU }, extra);

test("posição: dentro do rack e sem sobrepor", () => {
  const rack = rack42([item("sw", 10, 1), item("srv", 12, 2)]);
  assert.equal(E.verificarPosicaoRack(rack, { u: 11, alturaU: 1 }).ok, true, "U11 está livre");
  const sobre = E.verificarPosicaoRack(rack, { u: 13, alturaU: 4 });
  assert.equal(sobre.ok, false);
  assert.match(sobre.motivo, /U13 já está ocupada por "SRV"/);
  assert.equal(sobre.conflito.id, "srv");
  const topo = E.verificarPosicaoRack(rack, { u: 40, alturaU: 4 });
  assert.equal(topo.ok, false);
  assert.match(topo.motivo, /passa do topo do rack \(U43 num rack de 42U\)/);
  assert.equal(E.verificarPosicaoRack(rack, { u: 0, alturaU: 1 }).ok, false, "não existe U0");
  assert.equal(E.verificarPosicaoRack(rack, { u: 42, alturaU: 1 }).ok, true, "U42 é a última");
  assert.equal(E.verificarPosicaoRack(rack, { u: 12, alturaU: 2 }, "srv").ok, true, "mover o próprio item para onde já está");
});

test("montagem compartilhada só entre frente e traseira", () => {
  const rack = rack42([item("pdu", 5, 1, { face: "tras" })]);
  assert.equal(E.verificarPosicaoRack(rack, { u: 5, alturaU: 1, face: "frente" }).ok, true);
  assert.equal(E.verificarPosicaoRack(rack, { u: 5, alturaU: 1, face: "tras" }).ok, false);
  assert.equal(E.verificarPosicaoRack(rack, { u: 5, alturaU: 1 }).ok, false, "profundidade total ocupa as duas faces");
});

test("ocupação conta U livres e ocupadas (equipamento de várias U ocupa todas)", () => {
  const o = E.ocupacaoRack(rack42([item("a", 1, 1), item("b", 2, 4), item("c", 10, 2, { face: "frente" }), item("d", 10, 1, { face: "tras" })]));
  assert.equal(o.ocupadas, 7);
  assert.equal(o.livres, 35);
  assert.deepEqual(simples(o.porU[3].map(i => i.id)), ["b"]);
  assert.deepEqual(simples(o.porU[10].map(i => i.id)), ["c", "d"]);
  assert.equal(o.porU[6].length, 0);
});

test("projeto com racks: estrito recusa sobreposição; reparar tira o item e avisa", () => {
  const dados = { equipamentos: [], conexoes: [], modo: "racks", racks: [rack42([item("a", 1, 2), item("b", 2, 1)])] };
  const estrito = E.validarProjeto(dados, "estrito");
  assert.equal(estrito.ok, false);
  assert.match(estrito.erros[0].mensagem, /U2 já está ocupada por "A"/);
  const reparado = E.validarProjeto(dados, "reparar");
  assert.equal(reparado.ok, true);
  assert.deepEqual(simples(reparado.dados.racks[0].itens.map(i => i.id)), ["a"]);
  assert.match(reparado.ajustes[0].mensagem, /retirado do rack/);
});

test("rack: altura, status e categoria com valores padrão; projetos sem racks continuam sem", () => {
  const r = simples(E.validarProjeto({ equipamentos: [], conexoes: [], racks: [{ id: "r", nome: "R", alturaU: "24", itens: [{ id: "x", nome: "X", u: 3, alturaU: 1, categoria: "Patch panel" }] }] }, "estrito"));
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.dados.racks[0].alturaU, 24);
  assert.equal(r.dados.racks[0].status, "planejado");
  assert.equal(r.dados.racks[0].itens[0].categoria, "patch");
  assert.equal(r.dados.racks[0].itens[0].face, "ambas");
  assert.equal(r.dados.racks[0].itens[0].estado, "instalado");
  const semRacks = simples(E.validarProjeto({ equipamentos: [], conexoes: [] }, "estrito"));
  assert.equal("racks" in semRacks.dados, false);
  assert.equal(E.validarProjeto({ equipamentos: [], conexoes: [], racks: [{ id: "r", nome: "R", alturaU: 61 }] }, "estrito").ok, false, "máximo 60U");
});

test("cabos físicos: portas existentes, uma por cabo, entre racks", () => {
  const racks = [
    rack42([item("sw", 1, 1, { portas: 24 })]),
    { id: "r2", nome: "RACK-02", alturaU: 12, itens: [item("pp", 1, 1, { categoria: "patch", portas: 24 })] }
  ];
  const cabo = (id, dePorta, paraPorta, extra) => Object.assign({ id, deItem: "sw", dePorta, paraItem: "pp", paraPorta, tipo: "rede" }, extra);
  assert.equal(E.validarRacksDoProjeto(racks, [cabo("c1", 1, 1)]).ok, true, "cabo entre racks");
  const repetida = E.validarRacksDoProjeto(racks, [cabo("c1", 1, 1), cabo("c2", 1, 2)]);
  assert.equal(repetida.ok, false);
  assert.match(repetida.erros[0].mensagem, /porta 1 de "SW" já tem outro cabo/);
  assert.match(E.validarRacksDoProjeto(racks, [cabo("c1", 25, 1)]).erros[0].mensagem, /não tem a porta 25 \(tem 24\)/);
  assert.match(E.validarRacksDoProjeto(racks, [cabo("c1", 1, 1, { paraItem: "fantasma" })]).erros[0].mensagem, /destino não existe/);
  const fibra = simples(E.validarRacksDoProjeto(racks, [cabo("c1", 2, 3, { tipo: "Fibra óptica", comprimento: "3 m" })]).dados.cabos[0]);
  assert.equal(fibra.tipo, "fibra");
  assert.equal(fibra.comprimento, "3 m");
});

test("meia largura (ONU): duas dividem a U, uma de cada lado", () => {
  const rack = rack42([item("onu1", 5, 1, { categoria: "onu", lado: "esquerda" })]);
  assert.equal(E.verificarPosicaoRack(rack, { u: 5, alturaU: 1, lado: "direita" }).ok, true, "a metade direita está livre");
  const mesmoLado = E.verificarPosicaoRack(rack, { u: 5, alturaU: 1, lado: "esquerda" });
  assert.equal(mesmoLado.ok, false);
  assert.match(mesmoLado.motivo, /U5 \(metade esquerda\) já está ocupada por "ONU1"/);
  assert.equal(E.verificarPosicaoRack(rack, { u: 5, alturaU: 1 }).ok, false, "largura inteira não cabe");
  assert.equal(E.verificarPosicaoRack(rack, { u: 5, alturaU: 1, face: "tras" }).ok, false, "a ONU tem profundidade total: ocupa a metade nas duas faces");
  assert.equal(E.ladoLivreRack(rack, { u: 5, alturaU: 1, lado: "esquerda" }), "direita", "troca para o lado livre");
  assert.equal(E.ladoLivreRack(rack, { u: 5, alturaU: 1, lado: "inteira" }), null);
  rack.itens.push(item("onu2", 5, 1, { lado: "direita" }));
  assert.equal(E.ladoLivreRack(rack, { u: 5, alturaU: 1, lado: "esquerda" }), null, "U5 cheia");
  assert.equal(E.ocupacaoRack(rack).ocupadas, 1);
  // Importação: apelidos e padrão.
  const v = E.validarRacksDoProjeto([{ id: "r", nome: "R", alturaU: 42, itens: [
    { id: "a", nome: "A", categoria: "ONT", u: 3, alturaU: 1, lado: "Metade Esquerda" },
    { id: "b", nome: "B", categoria: "onu", u: 3, alturaU: 1, lado: "dir" },
    { id: "c", nome: "C", u: 4, alturaU: 1 }] }], []);
  assert.deepEqual(simples(v.dados.racks[0].itens.map(i => i.categoria + ":" + i.lado)), ["onu:esquerda", "onu:direita", "personalizado:inteira"]);
});

test("nobreak de pé: opcional, valores padrão e limite por rack", () => {
  const nb = extra => Object.assign({ id: "n" + Math.random(), nome: "UPS" }, extra);
  const v = E.validarRacksDoProjeto([{ id: "r", nome: "R", alturaU: 42, itens: [], nobreaks: [nb({ baterias: "16", lado: "Esquerdo" })] }, { id: "s", nome: "S", alturaU: 42, itens: [] }], []);
  assert.equal(v.ok, true);
  assert.deepEqual(simples(v.dados.racks[0].nobreaks[0]).lado, "esquerda");
  assert.equal(v.dados.racks[0].nobreaks[0].baterias, 16);
  assert.equal(v.dados.racks[0].nobreaks[0].estado, "instalado");
  assert.equal("nobreaks" in v.dados.racks[1], false, "rack sem nobreak continua sem");
  const demais = E.validarRacksDoProjeto([{ id: "r", nome: "R", alturaU: 42, itens: [], nobreaks: [nb(), nb(), nb(), nb(), nb()] }], []);
  assert.equal("nobreaks" in demais.dados.racks[0], false, "mais de 4: descartado");
  const muitas = E.validarRacksDoProjeto([{ id: "r", nome: "R", alturaU: 42, itens: [], nobreaks: [nb({ baterias: 99 })] }], []);
  assert.equal("nobreaks" in muitas.dados.racks[0], false, "mais de 32 baterias: inválido");
});
