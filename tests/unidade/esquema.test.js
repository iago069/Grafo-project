// Regras de validação (assets/js/comum/esquema.js), carregadas como no navegador.
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

// Os objetos vêm de outro contexto do vm; o JSON os traz para este.
const simples = v => JSON.parse(JSON.stringify(v));

test("IP: aceita IPv4, IPv6 e máscaras; recusa formatos inválidos", () => {
  for (const ip of ["", "10.0.0.1", "10.0.0.0/24", "2001:db8::1", "::1", "fe80::1/64"]) assert.ok(E.ipValido(ip), ip);
  for (const ip of ["10.0.0.300", "1.2.3", "10.0.0.1/33", "1:::2", "abc", "10.0.0.1/24/8"]) assert.ok(!E.ipValido(ip), ip);
});

test("capacidade é padronizada", () => {
  assert.equal(E.normalizarCapacidade("10 gbps"), "10G");
  assert.equal(E.normalizarCapacidade("2,5g"), "2.5G");
  assert.equal(E.normalizarCapacidade("100 Mb"), "100M");
  assert.equal(E.normalizarCapacidade("xgs-pon"), "XGS-PON");
});

test("projeto válido é normalizado no modo estrito", () => {
  const r = simples(E.validarProjeto({
    equipamentos: [{ id: "a", nome: " OLT ", status: "OFFLINE", corFonte: "#abc" }, { id: "c", nome: "SW", status: "Manutenção" }],
    conexoes: [{ de: "a", para: "c", grossura: "4,0", potencia: "2,5g", estilo: "pontilhado" }]
  }, "estrito"));
  assert.ok(r.ok, JSON.stringify(r.erros));
  assert.equal(r.dados.equipamentos[0].nome, "OLT");
  assert.equal(r.dados.equipamentos[0].status, "offline");
  assert.equal(r.dados.equipamentos[0].corFonte, "#aabbcc");
  assert.equal(r.dados.equipamentos[1].status, "manutencao");
  assert.deepEqual(
    { grossura: r.dados.conexoes[0].grossura, potencia: r.dados.conexoes[0].potencia, estilo: r.dados.conexoes[0].estilo },
    { grossura: 4, potencia: "2.5G", estilo: "dotted" });
});

const RUIM = {
  equipamentos: [
    { id: 1, nome: 123, ip: "10.0.0.300", status: "Manutenção", corFonte: "azul", grupo: 7 },
    { id: "b", nome: "SW", tipo: "x".repeat(50) },
    { id: "b", nome: "Duplicado" },
    "lixo",
    { nome: "sem id" }
  ],
  conexoes: [
    { de: 1, para: "b", grossura: "3", estilo: "Tracejado" },
    { de: "b", para: "fantasma" },
    { de: "b", para: "b" },
    { de: 1, para: "b", grossura: 99, cor: "vermelho" }
  ]
};

test("modo estrito recusa dados ruins e aponta onde", () => {
  const r = simples(E.validarProjeto(RUIM, "estrito"));
  assert.equal(r.ok, false);
  const onde = r.erros.map(e => e.onde).join("\n");
  assert.match(onde, /IP/);
  assert.match(onde, /Cor da fonte/);
  assert.match(onde, /Tipo/);
  assert.match(onde, /› id/);
  assert.match(onde, /Espessura/);
});

test("modo reparar corrige ou descarta sem travar", () => {
  const r = simples(E.validarProjeto(RUIM, "reparar"));
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados.equipamentos.map(e => e.id), ["1", "b"]);
  const [eq1, eq2] = r.dados.equipamentos;
  assert.equal(eq1.nome, "123");
  assert.equal(eq1.ip, "");
  assert.equal(eq1.status, "manutencao");
  assert.equal(eq1.corFonte, "#16323D");
  assert.equal(eq2.tipo.length, E.LIMITES.tipo);
  // Cabo fantasma e cabo para si mesmo são ignorados; os outros dois ficam.
  assert.equal(r.dados.conexoes.length, 2);
  assert.equal(r.dados.conexoes[0].estilo, "dashed");
  assert.equal(r.dados.conexoes[1].grossura, 2);
  assert.ok(r.ajustes.length > 0);
});

test("limite de equipamentos: importação recusa, projeto salvo só avisa", () => {
  const n = E.LIMITES.equipamentos + 5;
  const muitos = { equipamentos: Array.from({ length: n }, (_, i) => ({ id: "e" + i, nome: "E" + i })), conexoes: [] };
  const estrito = simples(E.validarProjeto(muitos, "estrito"));
  assert.equal(estrito.ok, false);
  const reparar = simples(E.validarProjeto(muitos, "reparar"));
  assert.equal(reparar.ok, true);
  assert.equal(reparar.dados.equipamentos.length, n, "nada pode ser apagado ao abrir");
});

test("estrutura errada é recusada", () => {
  assert.equal(E.validarProjeto([1, 2], "estrito").ok, false);
  assert.equal(E.validarProjeto({ equipamentos: "x" }, "estrito").ok, false);
  assert.equal(E.validarProjeto({ equipamentos: [] }, "estrito").ok, true, "conexoes ausente vale como lista vazia");
});

test("bloqueia javascript: em ícone e imagem", () => {
  const r = simples(E.validarProjeto({ equipamentos: [{ id: "x", nome: "a", imagem: "javascript:alert(1)", icone: "javascript:alert(1)" }] }, "estrito"));
  assert.equal(r.ok, false);
  assert.equal(r.erros.length, 2);
  const ok = simples(E.validarProjeto({ equipamentos: [{ id: "x", nome: "a", imagem: "./assets/images/OLT.jpeg", icone: "📡" }] }, "estrito"));
  assert.ok(ok.ok, JSON.stringify(ok.erros));
});

test("formulários de equipamento, cabo e nome de projeto", () => {
  assert.ok(E.validarEquipamento({ id: "z", nome: "A", ip: "10.0.0.1" }).ok);
  assert.equal(E.validarEquipamento({ id: "z", nome: "A", ip: "1.2.3" }).ok, false);
  assert.equal(E.validarEquipamento({ id: "z", nome: "" }).ok, false);
  assert.ok(E.validarConexao({ de: "a", para: "b" }, ["a", "b"]).ok);
  assert.equal(E.validarConexao({ de: "a", para: "a" }, ["a"]).ok, false);
  assert.equal(E.validarConexao({ de: "a", para: "z" }, ["a"]).ok, false);
  assert.deepEqual(simples(E.validarNomeProjeto("  Rede  ")), { ok: true, dados: "Rede" });
  assert.equal(E.validarNomeProjeto("x".repeat(E.LIMITES.nomeProjeto + 1)).ok, false);
});

test("modo do projeto: aceita os quatro (e nomes comuns); desconhecido vira topologia com aviso; sem modo continua sem", () => {
  const proj = modo => simples(E.validarProjeto({ equipamentos: [], conexoes: [], modo }, "estrito"));
  assert.equal(proj("redes").dados.modo, "redes");
  assert.equal(proj("Monitoramento").dados.modo, "monitoramento");
  assert.equal(proj("Diagrama de redes").dados.modo, "redes");
  const estranho = proj("planta-baixa");
  assert.equal(estranho.ok, true, "não recusa o arquivo");
  assert.equal(estranho.dados.modo, "topologia");
  assert.match(estranho.ajustes[0].mensagem, /usado Topologia/);
  assert.equal("modo" in simples(E.validarProjeto({ equipamentos: [], conexoes: [] }, "estrito")).dados, false);
  assert.equal(proj("Bayface de Racks").dados.modo, "racks");
  assert.deepEqual(simples(E.MODOS), ["topologia", "redes", "monitoramento", "racks"]);
});

test("equipamento: VLAN / rede é opcional, com limite de tamanho", () => {
  const eq = extra => simples(E.validarEquipamento(Object.assign({ id: "a", nome: "SW" }, extra)));
  assert.equal(eq({ rede: "  VLAN 10 · 10.0.0.0/24 " }).dados.rede, "VLAN 10 · 10.0.0.0/24");
  assert.equal("rede" in eq({}).dados, false, "sem rede, o campo não aparece");
  assert.equal(eq({ rede: "x".repeat(41) }).dados.rede, undefined, "grande demais: descartado");
});

test("corIcone: opcional, aceita #RRGGBB ou vazio (cor original)", () => {
  const base = { id: "a", nome: "A" };
  assert.equal(simples(E.validarEquipamento(Object.assign({ corIcone: "#2E9E5B" }, base)).dados).corIcone, "#2E9E5B");
  assert.equal(simples(E.validarEquipamento(Object.assign({ corIcone: "" }, base)).dados).corIcone, "");
  assert.equal("corIcone" in simples(E.validarEquipamento(base).dados), false);
  const r = E.validarProjeto({ equipamentos: [Object.assign({ corIcone: "verde" }, base)], conexoes: [] }, "estrito");
  assert.ok(r.ok, "cor inválida só é descartada");
  assert.equal("corIcone" in simples(r.dados.equipamentos[0]), false);
});
