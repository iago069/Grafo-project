// Agente do Grafo: NetBox -> projeto, CORS e ping.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const agente = require("../../agente/grafo-agente.js");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const assets = path.join(__dirname, "..", "..", "assets");
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
const zod = fs.readdirSync(path.join(assets, "vendor")).find(f => /^zod-.*.min.js$/.test(f));
vm.runInContext(fs.readFileSync(path.join(assets, "vendor", zod), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(assets, "js", "comum", "esquema.js"), "utf8"), ctx);

const devices = [
  { id: 1, name: "CCR-01", status: { value: "active" }, role: { name: "Router" }, device_type: { model: "CCR1036", manufacturer: { name: "MikroTik" } }, primary_ip4: { address: "127.0.0.1/32" }, rack: { name: "Rack 1" } },
  { id: 2, name: "SW-01", status: { value: "planned" }, role: { name: "Switch" }, device_type: { model: "DM4170", manufacturer: { name: "Datacom" } } },
  { id: 3, name: "OLT-01", status: { value: "offline" }, role: { name: "OLT" }, device_type: { model: "DM4610" } }
];
const cables = [
  { id: 10, type: "smf", status: { value: "connected" }, color: "ff0000",
    a_terminations: [{ object: { name: "sfp1", device: { id: 1 } } }], b_terminations: [{ object: { name: "xe1/1", device: { id: 2 } } }] },
  { id: 11, type: "cat6", status: { value: "planned" },
    a_terminations: [{ object: { name: "ge1", device: { id: 2 } } }], b_terminations: [{ object: { name: "eth1", device: { id: 3 } } }] },
  { id: 12, type: "cat6", a_terminations: [{ object: { name: "ge2", device: { id: 2 } } }], b_terminations: [{ object: { name: "p1", device: { id: 99 } } }] }
];

test("converte devices e cables do NetBox num projeto válido do Grafo", () => {
  const p = agente.converterNetbox(devices, cables, "POP Centro");
  assert.equal(p.equipamentos.length, 3);
  assert.deepEqual(p.equipamentos.map(e => [e.tipo, e.status]), [["MikroTik", "ativo"], ["Switch", "manutencao"], ["OLT", "offline"]]);
  assert.equal(p.equipamentos[0].ip, "127.0.0.1");
  assert.equal(p.conexoes.length, 2, "cabo para equipamento de fora do POP é ignorado");
  assert.deepEqual(p.conexoes[0], { de: "nb-1", para: "nb-2", tipo: "Fibra", saida: "sfp1", chegada: "xe1/1", estilo: "solid", cor: "#FF0000" });
  assert.equal(p.conexoes[1].estilo, "dashed");
  delete p.avisos;
  const r = ctx.GrafoEsquema.validarProjeto(p, "estrito");
  assert.ok(r.ok, JSON.stringify(r.erros));
});

test("mais de 35 equipamentos: corta e avisa", () => {
  const muitos = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: "EQ" + i }));
  const p = agente.converterNetbox(muitos, [], "X");
  assert.equal(p.equipamentos.length, 35);
  assert.equal(p.avisos.length, 1);
});

test("só aceita IP de verdade (nada vira comando)", () => {
  assert.ok(agente.ipValido("10.0.0.1"));
  assert.ok(agente.ipValido("::1"));
  for (const ruim of ["10.0.0.1; rm -rf /", "& calc", "", null, "host.local"]) assert.ok(!agente.ipValido(ruim));
});

function ouvir(servidor) { return new Promise(r => servidor.listen(0, "127.0.0.1", () => r(servidor.address().port))); }

test("servidor: lê o POP do NetBox, bloqueia origem estranha e pinga", async (t) => {
  const netbox = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Token abc") { res.statusCode = 403; return res.end("{}"); }
    if (req.url.startsWith("/api/dcim/sites/")) return res.end(JSON.stringify({ results: [{ slug: "pop-centro", name: "POP Centro" }], next: null }));
    if (req.url.startsWith("/api/dcim/devices/")) return res.end(JSON.stringify({ results: devices, next: null }));
    if (req.url.startsWith("/api/dcim/cables/")) return res.end(JSON.stringify({ results: cables, next: null }));
    res.statusCode = 404; res.end("{}");
  });
  const portaNb = await ouvir(netbox);
  Object.assign(process.env, { NETBOX_URL: "http://127.0.0.1:" + portaNb, NETBOX_TOKEN: "abc", ORIGENS: "https://thegrafo.vercel.app" });
  const servidor = agente.criarServidor();
  const porta = await ouvir(servidor);
  t.after(() => { servidor.close(); netbox.close(); });
  const base = "http://127.0.0.1:" + porta;
  const origem = { Origin: "https://thegrafo.vercel.app" };

  const sites = await (await fetch(base + "/netbox/sites", { headers: origem })).json();
  assert.deepEqual(sites, [{ slug: "pop-centro", nome: "POP Centro" }]);

  const resp = await fetch(base + "/netbox/projeto?site=pop-centro&nome=POP%20Centro", { headers: origem });
  assert.equal(resp.headers.get("access-control-allow-origin"), "https://thegrafo.vercel.app");
  const projeto = await resp.json();
  assert.equal(projeto.projeto, "POP Centro");
  assert.equal(projeto.conexoes.length, 2);

  assert.equal((await fetch(base + "/saude", { headers: { Origin: "https://malicioso.com" } })).status, 403);

  const st = await (await fetch(base + "/status", { method: "POST", headers: origem, body: JSON.stringify({ ips: ["127.0.0.1", "x; ls"] }) })).json();
  assert.deepEqual(Object.keys(st), ["127.0.0.1"]);
  assert.equal(st["127.0.0.1"].online, true);
});
