/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// NetBox falso para testar a integração sem um NetBox de verdade.
// Responde as mesmas rotas que o agente usa (sites, devices, cables), com
// filtro por site, paginação (limit/offset/next) e token.
//   npm run netbox-falso   -> http://localhost:8000  (token: teste123)
// No agente/.env: NETBOX_URL=http://localhost:8000 e NETBOX_TOKEN=teste123
// IPs 127.0.0.x respondem ao ping (online); 10.255.x.x não respondem (offline).
"use strict";

const http = require("http");

const TOKEN = process.env.NETBOX_FALSO_TOKEN || "teste123";
const PORTA = Number(process.env.NETBOX_FALSO_PORTA || 8000);

const sites = [
  { id: 1, slug: "pop-ibr01", name: "POP IBR01 - TI Antiga" },
  { id: 2, slug: "pop-centro", name: "POP Centro" },
  { id: 3, slug: "pop-vazio", name: "POP Vazio (sem equipamentos)" }
];

// [id, site, nome, papel, fabricante, modelo, ip, status, rack]
const listaDevices = [
  [1, 1, "Coprel Energia Internet 2", "Router", "MikroTik", "CCR1036-12G-4S", "127.0.0.11", "active", "Rack 01"],
  [2, 1, "Concentrador Comercializadora", "Router", "MikroTik", "CCR1036-12G-4S", "127.0.0.12", "active", "Rack 01"],
  [3, 1, "POP-IBR01_DISTR-206", "Switch", "Datacom", "DM4170", "127.0.0.13", "active", "Rack 02"],
  [4, 1, "Cpe-concentrador_CFTV-Coprel", "Router", "MikroTik", "CCR1009-7G-1C-1S+", "10.255.10.4", "active", "Rack 01"],
  [5, 1, "Conc-wifi-pref-mun-comunidades", "Router", "MikroTik", "CCR2116-12G-4S+", "127.0.0.15", "active", "Rack 01"],
  [6, 1, "Coprel Usinas", "Router", "MikroTik", "CCR1036-12G-4S", "10.255.10.6", "active", "Rack 01"],
  [7, 1, "Switch Trunk BRdigital", "Switch", "Datacom", "DM4170", "127.0.0.17", "active", "Rack 02"],
  [8, 1, "DM4170 Triway 2", "Switch", "Datacom", "DM4170", "127.0.0.18", "active", "Rack 02"],
  [9, 1, "HP A5500 1", "Switch", "HPE", "A5500-48G", "127.0.0.19", "active", "Rack 03"],
  [10, 1, "HP A5500 2", "Switch", "HPE", "A5500-48G", "10.255.10.10", "active", "Rack 03"],
  [11, 1, "POP-IBR01_DISTR-116", "Switch", "Datacom", "DM4170", "127.0.0.21", "active", "Rack 02"],
  [12, 1, "A10_CGNAT_4440_IBR", "Server", "A10", "Thunder 4440", "127.0.0.22", "active", "Rack 03"],
  [13, 1, "RB Trunk Coprel 116", "Router", "MikroTik", "RB1100AHx4", "127.0.0.23", "planned", "Rack 02"],
  [14, 1, "Aligera", "Server", "Aligera", "Gateway VoIP", "10.255.10.14", "offline", "Rack 03"],
  [15, 1, "POP-IBR01_CONC-BRDIGITAL", "Router", "MikroTik", "CCR2004-16G-2S+", "127.0.0.25", "active", "Rack 01"],
  [16, 1, "Huawei S6350", "Switch", "Huawei", "S6350-24X", "127.0.0.26", "active", "Rack 03"],
  [17, 1, "POP-IBR01_DISTR-14", "Switch", "Datacom", "DM4170", "127.0.0.27", "active", "Rack 02"],

  [21, 2, "RB-BORDA", "Router", "MikroTik", "CCR2004-16G-2S+", "127.0.0.31", "active", "Rack A"],
  [22, 2, "SW-CORE", "Switch", "MikroTik", "CRS326-24G-2S+", "127.0.0.32", "active", "Rack A"],
  [23, 2, "OLT-01", "OLT", "Datacom", "DM4610 8GPON", "127.0.0.33", "active", "Rack A"],
  [24, 2, "OLT-02", "OLT", "Datacom", "DM4610 8GPON", "10.255.20.4", "active", "Rack B"],
  [25, 2, "SRV-DNS", "Server", "Dell", "PowerEdge R440", "127.0.0.35", "active", "Rack B"],
  [26, 2, "NOBREAK-01", "UPS", "SMS", "Sinus 3kVA", "", "active", "Rack B"]
];

// [id, siteA, deviceA, portaA, deviceB, portaB, tipo, cor, status]
// Cabo para device de outro site ou para patch panel: o agente deve ignorar.
const listaCabos = [
  [101, 1, "Eth1", 8, "GE1/23", "cat6", "", "connected"],
  [102, 1, "Eth3", 10, "Port2/32", "cat6", "", "connected"],
  [103, 1, "Eth4", 9, "Port1/29", "cat6", "", "connected"],
  [104, 1, "Eth6", 10, "Port2/28", "cat6", "", "connected"],
  [105, 1, "Eth8", 9, "Port1/28", "cat6", "", "connected"],
  [106, 1, "SFP+1", 11, "XE1/11", "smf", "f2c94c", "connected"],
  [107, 2, "Eth1", 8, "XE1/3", "cat6", "", "connected"],
  [108, 2, "Eth8", 9, "Port1/22", "cat6", "", "connected"],
  [109, 3, "GE1/3", 12, "mgmt", "cat6", "", "connected"],
  [110, 3, "GE1/4", 13, "Eth1", "cat6", "", "planned"],
  [111, 3, "GE1/5", 14, "Eth1", "cat6", "", "connected"],
  [112, 4, "SFP+1", 8, "XE1/5", "smf", "f2c94c", "connected"],
  [113, 5, "SFP1/1", 8, "XE1/8", "smf", "f2c94c", "connected"],
  [114, 6, "SFP+1", 8, "GE1/7", "mmf", "e67e22", "connected"],
  [115, 7, "XE1/1", 15, "sfp-sfpplus2", "smf", "f2c94c", "connected"],
  [116, 7, "XE1/2", 16, "SFP-1/40", "smf", "f2c94c", "connected"],
  [117, 7, "XE1/4", 17, "xe1/37", "smf", "f2c94c", "connected"],
  [118, 7, "XE1/3", null, "Entrega IFRS", "smf", "", "connected"], // vai para um circuito: ignorado

  [201, 21, "sfp-sfpplus1", 22, "sfp-sfpplus1", "smf", "f2c94c", "connected"],
  [202, 22, "ether2", 23, "xe1/1/1", "cat6", "", "connected"],
  [203, 22, "ether3", 24, "xe1/1/1", "cat6", "", "connected"],
  [204, 22, "ether10", 25, "eno1", "cat6", "3498db", "connected"],
  [205, 21, "ether1", 3, "GE1/10", "smf", "", "connected"] // liga em outro POP: ignorado no POP Centro
];

const porId = {};
const devices = listaDevices.map(([id, site, nome, papel, fabricante, modelo, ip, status, rack]) => {
  const s = sites.find((x) => x.id === site);
  const d = {
    id, name: nome, display: nome,
    site: { id: s.id, slug: s.slug, name: s.name },
    role: { name: papel, slug: papel.toLowerCase() },
    device_type: { model: modelo, manufacturer: { name: fabricante } },
    status: { value: status, label: status },
    rack: { name: rack },
    primary_ip4: ip ? { address: ip + "/32" } : null,
    primary_ip: ip ? { address: ip + "/32" } : null
  };
  porId[id] = d;
  return d;
});

function ponta(deviceId, porta) {
  const d = porId[deviceId];
  if (!d) return [{ object_type: "circuits.circuittermination", object: { name: porta } }];
  return [{ object_type: "dcim.interface", object: { name: porta, device: { id: d.id, name: d.name } } }];
}

const cabos = listaCabos.map(([id, a, portaA, b, portaB, tipo, cor, status]) => ({
  id, display: "#" + id, type: tipo, color: cor,
  status: { value: status, label: status },
  a_terminations: ponta(a, portaA),
  b_terminations: ponta(b, portaB)
}));

// Um cabo pertence ao site se alguma ponta está num device do site (como no NetBox).
function siteDoCabo(c, slug) {
  return [...c.a_terminations, ...c.b_terminations].some((t) => t.object.device && porId[t.object.device.id].site.slug === slug);
}

function paginar(req, url, lista) {
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const pagina = lista.slice(offset, offset + limit);
  let next = null;
  if (offset + limit < lista.length) {
    const n = new URL(url);
    n.searchParams.set("offset", String(offset + limit));
    next = "http://" + req.headers.host + n.pathname + n.search;
  }
  return { count: lista.length, next, previous: null, results: pagina };
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  const json = (status, corpo) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(corpo)); };
  console.log(new Date().toLocaleTimeString(), req.method, url.pathname + url.search);

  if (req.headers.authorization !== "Token " + TOKEN) return json(403, { detail: "Invalid token" });

  const site = url.searchParams.get("site");
  if (url.pathname === "/api/status/") return json(200, { "netbox-version": "4.1.0 (falso)" });
  if (url.pathname === "/api/dcim/sites/") return json(200, paginar(req, url, sites));
  if (url.pathname === "/api/dcim/devices/") return json(200, paginar(req, url, site ? devices.filter((d) => d.site.slug === site) : devices));
  if (url.pathname === "/api/dcim/cables/") return json(200, paginar(req, url, site ? cabos.filter((c) => siteDoCabo(c, site)) : cabos));
  json(404, { detail: "Not found." });
});

servidor.listen(PORTA, () => {
  console.log("NetBox falso em http://localhost:" + PORTA + "  (token: " + TOKEN + ")");
  console.log("POPs: " + sites.map((s) => s.name).join(", "));
});
