// Relatório de inventário em .xlsx (assets/js/planilha.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const raiz = path.join(__dirname, "..");
const ctx = { console, TextEncoder };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, "assets", "js", "planilha.js"), "utf8"), ctx);
const P = ctx.GrafoPlanilha;

// Lê um ZIP gravado sem compressão (método 0): { nome: { texto, crcOk } }.
function lerZip(bytes) {
  const buf = Buffer.from(bytes);
  const arquivos = {};
  let pos = 0;
  while (buf.readUInt32LE(pos) === 0x04034B50) {
    const metodo = buf.readUInt16LE(pos + 8);
    const crc = buf.readUInt32LE(pos + 14);
    const tamanho = buf.readUInt32LE(pos + 18);
    const nomeLen = buf.readUInt16LE(pos + 26), extraLen = buf.readUInt16LE(pos + 28);
    const nome = buf.toString("utf8", pos + 30, pos + 30 + nomeLen);
    const dados = buf.subarray(pos + 30 + nomeLen + extraLen, pos + 30 + nomeLen + extraLen + tamanho);
    assert.equal(metodo, 0, nome + " sem compressão");
    arquivos[nome] = { texto: dados.toString("utf8"), crcOk: (zlib.crc32 ? zlib.crc32(dados) : P.crc32(dados)) === crc };
    pos += 30 + nomeLen + extraLen + tamanho;
  }
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054B50, "fim do ZIP (diretório central) no lugar certo");
  return arquivos;
}

const MODELOS = {
  "CRS326": { nome: "CRS326-24G-2S+", fabricante: "MikroTik", portas: ["ether1", "ether2", "ether3", "sfp-sfpplus1"] }
};
const DADOS = {
  equipamentos: [
    { id: "sw", nome: "SW-CORE", tipo: "Switch", modelo: "CRS326", ip: "10.0.0.2", rede: "VLAN 10", grupo: "POP", status: "ativo" },
    { id: "olt", nome: "OLT <1> & cia", tipo: "OLT", ip: "10.0.0.10", grupo: "POP", status: "manutencao" },
    { id: "x", nome: "=SOMA(1;2)", tipo: "", status: "offline" }
  ],
  conexoes: [
    { de: "sw", para: "olt", saida: "sfp-sfpplus1", chegada: "xe1", tipo: "Fibra", potencia: "10G", estilo: "solid" },
    { de: "sw", para: "x", saida: "ether9", chegada: "eth0", tipo: "Cobre", potencia: "1G", estilo: "dashed" }
  ]
};
const inventario = () => P.montarInventario("Meu POP", DADOS, { data: "29/09/2026 10:00", buscarModelo: t => MODELOS[t] || null });

test("o inventário tem as 4 abas com os dados do projeto", () => {
  const abas = JSON.parse(JSON.stringify(inventario()));
  assert.deepEqual(abas.map(a => a.nome), ["Resumo", "Equipamentos", "Cabos", "Portas"]);
  const eq = abas[1].linhas;
  assert.deepEqual(eq[0], ["SW-CORE", "Switch", "CRS326", "MikroTik", "10.0.0.2", "VLAN 10", "POP", "Ativo", 2, 4, 3]); // 4 portas, sfp em uso
  assert.equal(eq[1][5], "", "sem VLAN: célula vazia");
  assert.equal(eq[1][7], "Manutenção");
  assert.deepEqual(abas[2].linhas[1], ["SW-CORE", "ether9", "=SOMA(1;2)", "eth0", "Cobre", "1G", "Tracejado"]);
  const portasSw = abas[3].linhas.filter(l => l[0] === "SW-CORE");
  assert.deepEqual(portasSw.map(l => l[1] + ":" + l[2]), ["ether1:Livre", "ether2:Livre", "ether3:Livre", "sfp-sfpplus1:Em uso", "ether9:Em uso (fora do modelo)"]);
  assert.deepEqual(portasSw[3].slice(3), ["OLT <1> & cia", "xe1", "Fibra · 10G"]);
  const resumo = Object.fromEntries(abas[0].linhas.filter(l => l[0]).map(l => [l[0], l[1]]));
  assert.equal(resumo["Equipamentos"], 3);
  assert.equal(resumo["Cabos"], 2);
  assert.equal(resumo["Portas livres (equipamentos com modelo do catálogo)"], 3);
});

test("o .xlsx é um ZIP válido com as partes que o Excel exige", () => {
  const arquivos = lerZip(P.gerarXlsx(inventario()));
  for (const nome of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml",
    "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml"]) {
    assert.ok(arquivos[nome], "tem " + nome);
    assert.ok(arquivos[nome].crcOk, "CRC correto em " + nome);
    assert.ok(arquivos[nome].texto.startsWith("<?xml"), nome + " é XML");
  }
  assert.match(arquivos["xl/workbook.xml"].texto, /<sheet name="Resumo".*<sheet name="Equipamentos".*<sheet name="Cabos".*<sheet name="Portas"/);
});

test("textos especiais são escapados e nunca viram fórmula; números ficam numéricos", () => {
  const arquivos = lerZip(P.gerarXlsx(inventario()));
  const eq = arquivos["xl/worksheets/sheet2.xml"].texto;
  assert.ok(eq.includes("OLT &lt;1&gt; &amp; cia"), "< > & escapados");
  assert.ok(eq.includes('t="inlineStr"><is><t xml:space="preserve">=SOMA(1;2)</t>'), "=SOMA como texto");
  assert.ok(!/<f>/.test(eq), "sem fórmulas");
  assert.match(eq, /<c r="I2"><v>2<\/v><\/c>/, "Cabos como número");
  assert.match(eq, /<pane ySplit="1"/, "título congelado");
  assert.match(eq, /<autoFilter ref="A1:K4"\/>/, "filtro nas colunas");
});

test("nomes de aba inválidos ou repetidos são corrigidos", () => {
  const arquivos = lerZip(P.gerarXlsx([
    { nome: "Rede: POP/Centro?", colunas: ["a"], linhas: [] },
    { nome: "Rede: POP/Centro?", colunas: ["a"], linhas: [] },
    { nome: "x".repeat(40), colunas: ["a"], linhas: [["\u0007controle"]] }
  ]));
  const wb = arquivos["xl/workbook.xml"].texto;
  assert.match(wb, /name="Rede  POP Centro"/);
  assert.match(wb, /name="Rede  POP Centro \(2\)"/);
  assert.match(wb, new RegExp('name="' + "x".repeat(31) + '"'));
  assert.ok(!arquivos["xl/worksheets/sheet3.xml"].texto.includes("\u0007"), "caractere de controle removido");
});
