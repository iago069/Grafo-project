// Leitor de texto colado (assets/js/recursos/leitor.js): Grafana, NetBox e Junos.
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
vm.runInContext(fs.readFileSync(path.join(assets, "js", "recursos", "leitor.js"), "utf8"), ctx);
const L = ctx.GrafoLeitor, E = ctx.GrafoEsquema;
const simples = v => JSON.parse(JSON.stringify(v));

const GRAFANA = [
  "xe-0/0/21XE10G", "ae9", "Online\t", "0bps", "0bps", "0.00%\t—\t—\t0\t0",
  "xe-0/0/18XE10G", "ae9", "Online\t", "0bps", "0bps", "0.00%\t—\t—\t0\t0",
  "xe-0/0/14XE10G", "ae13", "Online\t", "1.03Kbps", "1.03Kbps", "0.00%\t—\t—\t0\t0",
  "xe-0/0/15XE10G", "ae13", "Online\t", "1.13Kbps", "1.03Kbps", "0.00%\t—\t—\t0\t0",
  "ae13LAG20G", "LINK_MARAU_CORE_MRU-AE13", "Online\t", "2.20Kbps", "2.07Kbps", "0.00%\t—\t—\t0\t0",
  "xe-0/0/17XE10G", "ENLACE_SWITCH_CAPTURE_IPTV_PFU", "Online\t", "56.61Mbps", "8.34Mbps", "0.57%\t—\t—\t0\t0",
  "et-0/0/48ET100G", "ae14", "Online\t", "37.95Mbps", "2.21Gbps", "2.21%\tVER LANES", "▶", "0\t0",
  "ae14LAG100G", "CORE-EVPN-L2-100G-L2", "Online\t", "37.95Mbps", "2.21Gbps", "2.21%\t—\t—\t0\t0",
  "et-0/0/22ET100G\tOnline\t", "32bps", "0bps", "0.00%\tVER LANES", "▶", "0\t0"
].join("\n");

const NETBOX = [
  "et-0/0/0\t—\t\tQSFP28 (100GE)\t—\t—\t—\t—\tae17\t\t#1693\trouter-pfu-02 (BV490)  et-0/0/2\t—\t    ",
  "\t et-0/0/2\t—\t\tQSFP28 (100GE)\t—\t—\t—\t—\tae8\t\t—\t—\t—\t    ",
  "\t et-0/0/7\t—\t\tQSFP28 (100GE)\t—\t—\t—\t—\tENLACE_SW_DWMD-PF\t\t#1750\tSWITCH-DWDM-PASSO_FUNDO (5892111)  hundred-gigabit-ethernet 1/1/1\t—\t    ",
  "\t et-0/0/7.1766\t—\t\tVirtual\t—\t—\t—\t—\tENLACE_TAPEJARA-DWDM\t\t—\t—\t—\t ",
  "\t et-0/0/18\t—\t\tQSFP28 (100GE)\t—\t—\t—\t—\t—\t\t—\t—\t—\t    ",
  "\t ae8\t—\t\tLink Aggregation (LAG)\t—\t—\t—\t—\tENLACE_VIRTUALIZADO_COPREL\t\t—\t—\t—\t ",
  "\t ae17\t—\t\tLink Aggregation (LAG)\t—\t—\t—\t—\tMX204-ROUTER-PFU-02-AE6\t\t—\t—\t—\t "
].join("\n");

test("Grafana: LAG pela descrição 'aeN', destino pela descrição da LAG, sem descrição vira nota", () => {
  const r = L.ler(GRAFANA, "core-l2-pf");
  assert.deepEqual(simples(r.formatos), ["grafana"]);
  const porSaida = Object.fromEntries(r.cabos.map(c => [c.saida, c]));
  assert.equal(porSaida["xe-0/0/14"]._vizinho, "LINK_MARAU_CORE_MRU-AE13");
  assert.equal(porSaida["xe-0/0/15"]._vizinho, "LINK_MARAU_CORE_MRU-AE13");
  assert.match(porSaida["xe-0/0/14"].tipo, /^LAG ae13/);
  assert.equal(porSaida["xe-0/0/14"].potencia, "10G");
  assert.equal(porSaida["et-0/0/48"]._vizinho, "CORE-EVPN-L2-100G-L2");
  assert.equal(porSaida["et-0/0/48"].potencia, "100G");
  assert.equal(porSaida["xe-0/0/17"].chegada, "?");
  assert.ok(!porSaida["xe-0/0/21"], "membro de LAG sem destino não vira cabo");
  assert.ok(!porSaida["et-0/0/22"], "porta sem descrição não vira cabo");
  assert.ok(r.notas.some(n => /ae9 = .*xe-0\/0\/21/.test(n)));
  assert.ok(r.notas.some(n => /et-0\/0\/22/.test(n)));
  const p = r.projeto();
  assert.equal(p.equipamentos.length, 4, "central + Marau + IPTV + EVPN");
  assert.ok(E.validarProjeto(p, "estrito").ok, JSON.stringify(E.validarProjeto(p, "estrito").erros));
});

test("NetBox: vizinho e porta do outro lado; subinterface ignorada; LAG com destino", () => {
  const r = L.ler(NETBOX, "core_pfu_evpn_02");
  const porSaida = Object.fromEntries(r.cabos.map(c => [c.saida, c]));
  assert.equal(porSaida["et-0/0/0"]._vizinho, "router-pfu-02");
  assert.equal(porSaida["et-0/0/0"].chegada, "et-0/0/2");
  assert.equal(porSaida["et-0/0/7"].chegada, "hundred-gigabit-ethernet 1/1/1");
  assert.equal(porSaida["et-0/0/2"]._vizinho, "ENLACE_VIRTUALIZADO_COPREL", "ae8 sem cabo: destino pela descrição da LAG");
  assert.ok(!r.cabos.some(c => /\./.test(c.saida)), "subinterface não é cabo");
  assert.ok(!porSaida["et-0/0/18"]);
  assert.ok(r.cabos.every(c => c.estilo === "solid"), "só NetBox colado: nada tracejado");
  assert.ok(E.validarProjeto(r.projeto(), "estrito").ok);
});

test("Grafana + NetBox: o Grafana manda; porta só do NetBox entra tracejada", () => {
  const grafana = "et-0/0/0ET100G\nae17\nOnline\t\n38.22Gbps\n28.39Gbps\n38.22%\n" +
    "ae17LAG200G\nMX204-ROUTER-PFU-02-AE6\nOnline\t\n1Gbps\n1Gbps\n1%\n";
  const r = L.ler(grafana + "\n" + NETBOX, "evpn");
  const porSaida = Object.fromEntries(r.cabos.map(c => [c.saida, c]));
  assert.equal(porSaida["et-0/0/0"].chegada, "et-0/0/2", "NetBox completa a porta do outro lado");
  assert.equal(porSaida["et-0/0/0"].estilo, "solid");
  assert.equal(porSaida["et-0/0/2"].estilo, "dashed", "ae8 só existe no NetBox");
  assert.match(porSaida["et-0/0/2"].tipo, /só NetBox/);
});

test("Junos: show interfaces descriptions + show lldp neighbors", () => {
  const texto = [
    "Interface       Admin Link Description",
    "et-0/0/30       up    up   ae14",
    "ae14            up    up   CORE-L2-100G",
    "xe-0/0/5        up    down LINK_CLIENTE",
    "",
    "Local Interface    Parent Interface    Chassis Id          Port info          System Name",
    "et-0/0/30          ae14                aa:bb:cc:dd:ee:ff   et-0/0/48          core-l2-pf"
  ].join("\n");
  const r = L.ler(texto, "evpn");
  const porSaida = Object.fromEntries(r.cabos.map(c => [c.saida, c]));
  assert.equal(porSaida["et-0/0/30"]._vizinho, "core-l2-pf");
  assert.equal(porSaida["et-0/0/30"].chegada, "et-0/0/48");
  assert.equal(porSaida["xe-0/0/5"]._vizinho, "LINK_CLIENTE");
});

test("Mesclar mantém posições e ids, não duplica cabo e reaproveita equipamento de mesmo nome", () => {
  const atual = { equipamentos: [{ id: "x", nome: "core-l2-pf", posicao: { x: 10, y: 20 } }, { id: "y", nome: "LINK_MARAU_CORE_MRU-AE13", posicao: { x: 500, y: 0 } }],
    conexoes: [{ de: "x", para: "y", saida: "xe-0/0/14", chegada: "?" }] };
  const novo = L.ler(GRAFANA, "core-l2-pf").projeto();
  const m = simples(L.mesclar(atual, novo));
  assert.deepEqual(m.equipamentos[0].posicao, { x: 10, y: 20 });
  assert.equal(m.equipamentos.filter(e => e.nome === "core-l2-pf").length, 1);
  assert.equal(m.conexoes.filter(c => c.saida === "xe-0/0/14").length, 1, "cabo existente não duplica");
  assert.ok(m.conexoes.some(c => c.saida === "xe-0/0/15" && c.de === "x" && c.para === "y"));
  assert.ok(m.conexoes.some(c => c.saida === "et-0/0/48"));
});

test("Comparar com o diagrama: iguais, diferentes, faltam e só no diagrama", () => {
  const leitura = L.ler(GRAFANA, "core-l2-pf");
  const atual = {
    equipamentos: [{ id: "c", nome: "core-l2-pf" }, { id: "m", nome: "LINK_MARAU_CORE_MRU-AE13" }, { id: "x", nome: "Outro" }],
    conexoes: [
      { de: "c", para: "m", saida: "xe-0/0/14", chegada: "?" },
      { de: "c", para: "x", saida: "xe-0/0/17", chegada: "p1" },
      { de: "c", para: "x", saida: "xe-0/0/99", chegada: "p2" }
    ]
  };
  const r = simples(L.comparar(leitura, atual));
  assert.ok(r.achou);
  assert.deepEqual(r.iguais.map(x => x.porta), ["xe-0/0/14", "xe-0/0/17"], "destino só pela descrição não conta como diferente");
  assert.ok(r.faltam.some(x => x.porta === "xe-0/0/15"));
  assert.deepEqual(r.sobram.map(x => x.porta), ["xe-0/0/99"]);
  assert.equal(L.comparar(leitura, { equipamentos: [{ id: "z", nome: "outro" }], conexoes: [] }).achou, false);
});

test("lista em blocos (Datacom): porta / descrição / UP-DOWN vira cabos com vizinho e porta do outro lado", () => {
  const texto = [
    "ten-gigabit-ethernet-1/1/1", "ENLACE_POP-SXH03_DISTR-51_XE2", "", "UP", "",
    "ten-gigabit-ethernet-1/1/2", "OLT34_XE0/0", "", "UP", "",
    "ten-gigabit-ethernet-1/1/10", "ROUTER_CORE_TPR_06_XE_0_0_36", "", "UP", "",
    "ten-gigabit-ethernet-1/1/11", "OLT142-XE0/0", "", "UP", "",
    "ten-gigabit-ethernet-1/1/12", "UPLINK_CORE_TPR_06_XE_0_0_34", "", "UP", "",
    "ten-gigabit-ethernet-1/1/16", "Sem alias", "", "DOWN", "",
    "ten-gigabit-ethernet-1/1/22", "ANTIGO-LINK-CBORGES", "", "DOWN"
  ].join("\n");
  const r = L.ler(texto, "DISTR-TPR");
  assert.ok(r.formatos.includes("blocos"));
  const cabos = simples(r.cabos).map(c => [c.saida, c._vizinho, c.chegada, c.potencia]);
  assert.deepEqual(cabos, [
    ["ten-gigabit-ethernet-1/1/1", "POP-SXH03_DISTR-51", "XE2", "10G"],
    ["ten-gigabit-ethernet-1/1/2", "OLT34", "XE0/0", "10G"],
    ["ten-gigabit-ethernet-1/1/10", "CORE_TPR_06", "xe-0/0/36", "10G"],
    ["ten-gigabit-ethernet-1/1/11", "OLT142", "XE0/0", "10G"],
    ["ten-gigabit-ethernet-1/1/12", "CORE_TPR_06", "xe-0/0/34", "10G"]
  ]);
  assert.equal(r.notas.length, 2);
  assert.ok(r.notas.some(n => /ANTIGO-LINK-CBORGES \(DOWN\)/.test(n)));
  assert.ok(E.validarProjeto(simples(r.projeto()), "estrito").ok);
});

test("NetBox com portas do Datacom: vizinho e porta do cabo, LAG-1 vira LAG; junto com a lista em blocos o NetBox manda", () => {
  const netbox = [
    "ten-gigabit-ethernet-1/1/1\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\tENLACE_POP-SXH03_DISTR-51_XE2\t\t#605\tPOP-SXH03_DISTR-51 (5428682)  ten-gigabit-ethernet-1/1/2\t—\t    ",
    "\t ten-gigabit-ethernet-1/1/2\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\tOLT34_XE0/0\t\t#606\tPOP-TPA01_OLT-34 (PRKS00B4826F)  10giga-ethernet0/0\t—\t    ",
    "\t ten-gigabit-ethernet-1/1/8.1753\t—\t\tVirtual\t—\t—\t—\t—\t—\t\t—\t—\t—\t ",
    "\t ten-gigabit-ethernet-1/1/12\t—\t\tSFP+ (10GE)\t—\tLAG-1\t—\t—\tUPLINK_CORE_TPR_06_XE_0_0_34\t\t#614\tcore-tpr-06 (WS3718330131)  xe-0/0/34\t—\t    ",
    "\t ten-gigabit-ethernet-1/1/13\t—\t\tSFP+ (10GE)\t—\tLAG-1\t—\t—\tUPLINK_CORE_TPR_06_XE_0_0_35\t\t#615\tcore-tpr-06 (WS3718330131)  xe-0/0/35\t—\t    ",
    "\t ten-gigabit-ethernet-1/1/16\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\t—\t\t—\t—\t—\t    "
  ].join("\n");
  const blocos = ["ten-gigabit-ethernet-1/1/2", "OLT34_XE0/0", "", "UP"].join("\n");
  const r = L.ler(netbox + "\n" + blocos, "DISTR-TPR");
  const cabos = simples(r.cabos).map(c => [c.saida, c._vizinho, c.chegada, c.potencia, c.tipo]);
  assert.deepEqual(cabos.map(c => c.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0], "pt", { numeric: true })), [
    ["ten-gigabit-ethernet-1/1/1", "POP-SXH03_DISTR-51", "ten-gigabit-ethernet-1/1/2", "10G"],
    ["ten-gigabit-ethernet-1/1/2", "POP-TPA01_OLT-34", "10giga-ethernet0/0", "10G"],
    ["ten-gigabit-ethernet-1/1/12", "core-tpr-06", "xe-0/0/34", "10G"],
    ["ten-gigabit-ethernet-1/1/13", "core-tpr-06", "xe-0/0/35", "10G"]
  ]);
  assert.match(cabos.find(c => c[0].endsWith("/12"))[4], /^LAG lag-1/);
  assert.ok(E.validarProjeto(simples(r.projeto()), "estrito").ok);
});
