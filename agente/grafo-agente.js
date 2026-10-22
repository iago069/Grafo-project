/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// Agente do Grafo: roda num computador DENTRO da rede (onde o NetBox e os
// equipamentos são alcançáveis) e o editor conversa com ele pelo navegador.
//   GET  /saude                 -> { ok, netbox }
//   GET  /netbox/sites          -> [{ slug, nome }]
//   GET  /netbox/projeto?site=X -> projeto no formato do Grafo (equipamentos e cabos do site)
//   POST /status { ips: [...] } -> { "10.0.0.1": { online: true, ms: 3 }, ... }
// Sem dependências: node agente/grafo-agente.js (Node 18+). Configuração em
// variáveis de ambiente ou num agente/.env (veja agente/.env.exemplo).
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFile } = require("child_process");

const MAX_EQUIPAMENTOS = 35; // limite do Grafo por diagrama
const MAX_IPS = 200;

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return;
  fs.readFileSync(arquivo, "utf8").split(/\r?\n/).forEach((linha) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m || linha.trim().startsWith("#")) return;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  });
}

// ---- NetBox -> Grafo -------------------------------------------------------

const STATUS_NETBOX = {
  active: "ativo",
  offline: "offline", failed: "offline", decommissioning: "offline",
  planned: "manutencao", staged: "manutencao", inventory: "manutencao"
};

// Tipos de cabo do NetBox que são fibra (o resto vira "Cabo").
function ehFibra(tipo) { return /^(smf|mmf|aoc|sm|mm)/i.test(tipo || "") || /fib|optic/i.test(tipo || ""); }

function semMascara(endereco) { return String(endereco || "").split("/")[0]; }

// Papel do NetBox (router, switch, olt...) -> tipo com ícone no Grafo.
function tipoDoPapel(papel, fabricante) {
  const p = String(papel || "").toLowerCase();
  if (/olt/.test(p)) return "OLT";
  if (/onu|ont|cpe/.test(p)) return "ONU";
  if (/switch|sw\b|distr|core|agg/.test(p)) return "Switch";
  if (/router|roteador|conc|bng|border/.test(p)) return /mikrotik/i.test(fabricante || "") ? "MikroTik" : "Roteador";
  if (/server|servidor|cgnat|dns|vm|host/.test(p)) return "Servidor";
  if (/ups|nobreak/.test(p)) return "UPS";
  if (/camera|cftv/.test(p)) return "Camera IP";
  return papel ? String(papel) : (/mikrotik/i.test(fabricante || "") ? "MikroTik" : "Switch");
}

// Ícone do Grafo para cada tipo (assets/images/equipamentos/).
const ICONES = { OLT: "OLT.png", ONU: "ONU.svg", Switch: "SWITCH.png", MikroTik: "MIKROTIK.png", Roteador: "MIKROTIK.png", Servidor: "SERVIDOR.svg", UPS: "NOBREAK.png", "Camera IP": "CAMERA.png" };

function nomeDe(obj) { return obj ? (obj.display || obj.name || obj.model || obj.slug || "") : ""; }

// devices e cables: listas "results" da API REST do NetBox (3.x/4.x).
function converterNetbox(devices, cables, nomeProjeto) {
  const avisos = [];
  const lista = devices.slice(0, MAX_EQUIPAMENTOS);
  if (devices.length > MAX_EQUIPAMENTOS) {
    avisos.push("O site tem " + devices.length + " equipamentos; o Grafo aceita " + MAX_EQUIPAMENTOS + " por diagrama. Vieram os " + MAX_EQUIPAMENTOS + " primeiros.");
  }
  const ids = {};
  const equipamentos = lista.map((d) => {
    const id = "nb-" + d.id;
    ids[d.id] = id;
    const fabricante = d.device_type && nomeDe(d.device_type.manufacturer);
    const status = d.status && (d.status.value || d.status);
    const ip = d.primary_ip4 || d.primary_ip || d.primary_ip6;
    const tipo = tipoDoPapel(nomeDe(d.role || d.device_role), fabricante);
    return {
      id,
      nome: String(d.name || d.display || ("Equipamento " + d.id)).slice(0, 80),
      tipo,
      icone: "./assets/images/equipamentos/" + (ICONES[tipo] || "SERVIDOR.svg"),
      modelo: d.device_type ? String(d.device_type.model || nomeDe(d.device_type)) : "",
      ip: ip ? semMascara(ip.address) : "",
      grupo: nomeDe(d.rack) || nomeDe(d.location) || "",
      status: STATUS_NETBOX[status] || "ativo"
    };
  });

  const conexoes = [];
  cables.forEach((c) => {
    const a = (c.a_terminations || [])[0];
    const b = (c.b_terminations || [])[0];
    const pontaA = a && (a.object || a);
    const pontaB = b && (b.object || b);
    const devA = pontaA && pontaA.device && ids[pontaA.device.id];
    const devB = pontaB && pontaB.device && ids[pontaB.device.id];
    if (!devA || !devB || devA === devB) return; // ponta fora do site, em patch panel ou circuito
    const tipo = c.type && (c.type.value || c.type);
    const conexao = {
      de: devA,
      para: devB,
      tipo: ehFibra(tipo) ? "Fibra" : "Cabo",
      saida: String(pontaA.name || ""),
      chegada: String(pontaB.name || ""),
      estilo: (c.status && (c.status.value || c.status)) === "planned" ? "dashed" : "solid"
    };
    if (/^#?[0-9a-f]{6}$/i.test(c.color || "")) conexao.cor = "#" + c.color.replace("#", "").toUpperCase();
    conexoes.push(conexao);
  });

  return { projeto: nomeProjeto, modo: "redes", equipamentos, conexoes, avisos };
}

async function netbox(caminho) {
  const base = (process.env.NETBOX_URL || "").replace(/\/+$/, "");
  if (!base || !process.env.NETBOX_TOKEN) throw Object.assign(new Error("NETBOX_URL e NETBOX_TOKEN não configurados no agente."), { status: 503 });
  let url = base + caminho;
  const resultados = [];
  // Segue a paginação ("next") até o fim.
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: "Token " + process.env.NETBOX_TOKEN, Accept: "application/json" } });
    if (!resp.ok) throw Object.assign(new Error("NetBox respondeu " + resp.status + " em " + caminho), { status: 502 });
    const json = await resp.json();
    if (!Array.isArray(json.results)) return json;
    resultados.push(...json.results);
    url = json.next || null;
  }
  return resultados;
}

// ---- Ping ------------------------------------------------------------------

function ipValido(ip) { return typeof ip === "string" && net.isIP(ip) !== 0; }

function pingar(ip) {
  return new Promise((resolver) => {
    if (!ipValido(ip)) return resolver({ online: false, erro: "IP inválido" });
    const windows = process.platform === "win32";
    const args = windows ? ["-n", "1", "-w", "1500", ip] : ["-c", "1", "-W", "2", ip];
    const inicio = Date.now();
    // execFile (sem shell) e IP já validado: nada do texto vira comando.
    execFile("ping", args, { timeout: 5000, windowsHide: true }, (erro, saida) => {
      // No Windows o ping pode sair com 0 em "Host de destino inacessível"; confere o TTL.
      const online = !erro && (!windows || /ttl[=<]/i.test(String(saida || "")));
      const ms = /[=<](\d+(?:[.,]\d+)?)\s*ms/i.exec(String(saida || ""));
      resolver({ online: !!online, ms: online ? (ms ? Math.round(parseFloat(ms[1].replace(",", "."))) : Date.now() - inicio) : null });
    });
  });
}

async function verificarIps(ips) {
  const unicos = [...new Set(ips.filter(ipValido))].slice(0, MAX_IPS);
  const resultado = {};
  const fila = unicos.slice();
  const trabalhadores = Array.from({ length: Math.min(20, fila.length) }, async () => {
    while (fila.length) { const ip = fila.shift(); resultado[ip] = await pingar(ip); }
  });
  await Promise.all(trabalhadores);
  return resultado;
}

// ---- Servidor HTTP ---------------------------------------------------------

function origensPermitidas() {
  return (process.env.ORIGENS || "https://thegrafo.vercel.app,http://localhost:3000")
    .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

function responder(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolver, rejeitar) => {
    let dados = "";
    req.on("data", (p) => { dados += p; if (dados.length > 100000) { rejeitar(Object.assign(new Error("Corpo grande demais."), { status: 413 })); req.destroy(); } });
    req.on("end", () => { try { resolver(dados ? JSON.parse(dados) : {}); } catch (e) { rejeitar(Object.assign(new Error("JSON inválido."), { status: 400 })); } });
  });
}

function criarServidor() {
  return http.createServer(async (req, res) => {
    const origem = req.headers.origin;
    if (origem && origensPermitidas().includes(origem)) {
      res.setHeader("Access-Control-Allow-Origin", origem);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Agente-Chave");
      // Chrome: site público (https) acessando a rede local.
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    } else if (origem) {
      return responder(res, 403, { erro: "Origem não permitida: " + origem + ". Inclua em ORIGENS no agente." });
    }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const chave = process.env.AGENTE_CHAVE;
    if (chave && req.headers["x-agente-chave"] !== chave) return responder(res, 401, { erro: "Chave do agente incorreta." });

    const url = new URL(req.url, "http://agente");
    try {
      if (req.method === "GET" && url.pathname === "/saude") {
        return responder(res, 200, { ok: true, netbox: !!(process.env.NETBOX_URL && process.env.NETBOX_TOKEN) });
      }
      if (req.method === "GET" && url.pathname === "/netbox/sites") {
        const sites = await netbox("/api/dcim/sites/?limit=1000&brief=1");
        return responder(res, 200, sites.map((s) => ({ slug: s.slug, nome: s.name || s.display })));
      }
      if (req.method === "GET" && url.pathname === "/netbox/projeto") {
        const site = url.searchParams.get("site") || "";
        if (!/^[-a-z0-9_]+$/i.test(site)) return responder(res, 400, { erro: "Informe o site (slug do NetBox)." });
        const [devices, cables] = await Promise.all([
          netbox("/api/dcim/devices/?limit=1000&site=" + encodeURIComponent(site)),
          netbox("/api/dcim/cables/?limit=1000&site=" + encodeURIComponent(site))
        ]);
        return responder(res, 200, converterNetbox(devices, cables, url.searchParams.get("nome") || site));
      }
      if (req.method === "POST" && url.pathname === "/status") {
        const corpo = await lerCorpo(req);
        if (!Array.isArray(corpo.ips)) return responder(res, 400, { erro: "Envie { \"ips\": [...] }." });
        return responder(res, 200, await verificarIps(corpo.ips));
      }
      responder(res, 404, { erro: "Rota não encontrada." });
    } catch (e) {
      responder(res, e.status || 500, { erro: e.message });
    }
  });
}

module.exports = { converterNetbox, tipoDoPapel, ipValido, verificarIps, criarServidor };

if (require.main === module) {
  lerEnv(path.join(__dirname, ".env"));
  const porta = Number(process.env.PORTA || 8787);
  criarServidor().listen(porta, () => {
    console.log("Agente do Grafo em http://localhost:" + porta);
    console.log("NetBox: " + (process.env.NETBOX_URL || "(não configurado)") + " · origens: " + origensPermitidas().join(", "));
  });
}
