// Apoio dos testes de navegador: servidor do site (com os mesmos cabeçalhos do
// vercel.json), Supabase simulado e abertura do navegador.
//
// Rodar: npm run test:navegador
// Precisa do Chromium do Playwright (npx playwright install chromium); sem ele,
// tenta o Edge ou o Chrome instalados. GRAFO_NAVEGADOR=msedge|chrome força um deles.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..", "..");
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json"
};
const CABECALHOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8")).headers
  .flatMap(regra => regra.headers)
  .filter(h => h.key !== "Strict-Transport-Security");

// Sobe o site numa porta livre. Devolve { url, fechar }.
function iniciarServidor() {
  const servidor = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/api/auth-config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"url":"https://teste.supabase.co","key":"chave-de-teste"}');
    }
    // Página em branco na mesma origem: serve para preparar o teste antes de abrir o site.
    if (url === "/__vazio") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><title>vazio</title>"); }
    if (url === "/api/equipamentos") url = "/data/equipamentos.json";
    if (url === "/") url = "/index.html";
    if (url === "/ver") url = "/ver.html";
    const arquivo = path.join(RAIZ, url);
    if (!arquivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
    fs.readFile(arquivo, (err, dados) => {
      if (err) { res.writeHead(404); return res.end(); }
      const cab = { "Content-Type": TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream" };
      CABECALHOS.forEach(h => { cab[h.key] = h.value; });
      // O Supabase é trocado pelo simulado, que não bate com o integrity do arquivo real.
      if (arquivo.endsWith("index.html")) dados = String(dados).replace(/(supabase\.js")\s+integrity="[^"]+"/, "$1");
      res.writeHead(200, cab);
      res.end(dados);
    });
  });
  return new Promise(resolve => servidor.listen(0, "127.0.0.1", () => resolve({
    url: "http://127.0.0.1:" + servidor.address().port,
    fechar: () => new Promise(ok => servidor.close(ok))
  })));
}

async function abrirNavegador() {
  const pedido = process.env.GRAFO_NAVEGADOR;
  const opcoes = pedido ? [pedido] : [undefined, "msedge", "chrome"];
  let ultimoErro;
  for (const channel of opcoes) {
    try { return await chromium.launch(channel ? { channel } : {}); } catch (e) { ultimoErro = e; }
  }
  throw new Error("Nenhum navegador disponível. Rode: npx playwright install chromium\n" + ultimoErro.message);
}

// Projeto de exemplo com n equipamentos ligados em árvore.
function projetoExemplo(n = 6) {
  const equipamentos = Array.from({ length: n }, (_, i) => ({
    id: "e" + i, nome: ["OLT-Centro", "ONU Ação", "Rádio", "Switch Núcleo", "RB-Borda", "Servidor"][i % 6] + (i >= 6 ? "-" + i : ""),
    tipo: ["OLT", "ONU", "Rádio", "Switch", "Roteador", "Servidor"][i % 6], grupo: "Grupo " + (i % 3 + 1),
    ip: "10.0.0." + (i + 1), status: "ativo"
  }));
  const conexoes = equipamentos.slice(1).map((e, i) => ({ de: "e" + Math.floor(i / 2), para: e.id, tipo: "Fibra", saida: "ge0/" + (i + 1), chegada: "eth" + i }));
  return { "Projeto Ação": { equipamentos, conexoes } };
}

// Script que substitui o supabase-js: sessão opcional, a linha de grafo_user_data
// (guardada no localStorage em "__simulado_linha", para valer entre recarregamentos,
// como num servidor) e respostas vazias para as demais tabelas, RPCs e realtime.
// Sem internet (navigator.onLine false), responde como o real: "Failed to fetch".
// vencida: o login venceu, então sem internet getSession não consegue renová-lo.
function supabaseSimulado({ sessao = true, projetos = projetoExemplo(), vencida = false } = {}) {
  const linha = { user_id: "u1", projects: projetos, current_project: Object.keys(projetos)[0], updated_at: "2026-09-28T10:00:00.000+00:00" };
  return `(function(){
  var GUARDADA = "__simulado_linha";
  var linha = JSON.parse(localStorage.getItem(GUARDADA) || "null") || ${JSON.stringify(linha)};
  function guardar(){ localStorage.setItem(GUARDADA, JSON.stringify(linha)); }
  function semRede(){ return navigator.onLine === false; }
  var FALHA_REDE = { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" };
  var METODOS = ["select","eq","neq","is","in","order","limit","range","insert","update","upsert","delete","match","filter"];
  function consulta(tabela){
    var q = { op: "select", f: [], um: false };
    var b = {};
    METODOS.forEach(function(m){ b[m] = function(a, v){
      if (m === "eq") q.f.push([a, v]);
      if (m === "update" || m === "insert" || m === "upsert" || m === "delete") { q.op = m; q.x = a; }
      return b; }; });
    b.maybeSingle = b.single = function(){ q.um = true; return b; };
    b.then = function(ok, err){
      var r;
      if (semRede()) r = { data: null, error: FALHA_REDE };
      else if (tabela !== "grafo_user_data") r = { data: q.um ? null : [], error: null };
      else if (q.op === "update") {
        var confere = q.f.every(function(p){ return linha[p[0]] === p[1]; });
        if (confere) { Object.assign(linha, q.x); guardar(); }
        r = { data: confere ? [{ updated_at: linha.updated_at }] : [], error: null };
      } else r = { data: q.um ? JSON.parse(JSON.stringify(linha)) : [linha], error: null };
      return Promise.resolve(r).then(ok, err);
    };
    return b;
  }
  var sessao = ${sessao ? '{ user: { id: "u1", email: "teste@grafo" } }' : "null"};
  var vencida = ${vencida ? "true" : "false"};
  // Como o real: a sessão fica guardada em sb-<projeto>-auth-token.
  if (sessao) localStorage.setItem("sb-teste-auth-token", JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: 1, user: sessao.user }));
  var canal = { on: function(){ return canal; }, subscribe: function(){ return canal; }, unsubscribe: function(){ return Promise.resolve(); } };
  window.supabase = { createClient: function(){ return {
    from: consulta,
    rpc: function(nome, args){
      (window.__chamadasRpc = window.__chamadasRpc || []).push({ nome: nome, args: args });
      return Promise.resolve(semRede() ? { data: null, error: FALHA_REDE } : { data: [], error: null });
    },
    channel: function(){ return canal; },
    removeChannel: function(){ return Promise.resolve(); },
    auth: {
      onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; },
      getSession: function(){
        if (sessao && vencida && semRede()) return Promise.resolve({ data: { session: null }, error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } });
        return Promise.resolve({ data: { session: sessao }, error: null });
      },
      signOut: function(){ return Promise.resolve({ error: null }); }
    }
  }; } };
})();`;
}

// Abre uma página nova com o Supabase simulado. Junta os erros do console em pagina.erros.
async function abrirPagina(navegador, site, { viewport = { width: 1400, height: 900 }, celular = false, sessao = true, projetos, vencida, antes, caminho = "/" } = {}) {
  const contexto = await navegador.newContext(Object.assign(
    { viewport, acceptDownloads: true },
    celular ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}
  ));
  const script = supabaseSimulado({ sessao, projetos, vencida });
  await contexto.route("**/@supabase/supabase-js@*/**", r => r.fulfill({ contentType: "text/javascript", body: script }));
  // Nos testes, todas as seções do menu começam abertas (o padrão do app recolhe
  // os grupos depois do primeiro); só vale se a página ainda não guardou escolha.
  await contexto.addInitScript(() => { try { if (localStorage.getItem("grafo-menu-fechado-v2") === null) localStorage.setItem("grafo-menu-fechado-v2", "[]"); } catch (e) {} });
  if (antes) await contexto.addInitScript(antes);
  const pagina = await contexto.newPage();
  pagina.erros = [];
  pagina.on("pageerror", e => pagina.erros.push("pageerror: " + e.message));
  pagina.on("console", m => { if (m.type() === "error") pagina.erros.push(m.text()); });
  await pagina.goto(site.url + caminho);
  return pagina;
}

// Espera o editor abrir (login aceito e app carregado).
async function esperarEditor(pagina) {
  await pagina.waitForFunction(() => window.GrafoApp && document.getElementById("accountEmail").textContent, null, { timeout: 45000 });
}

async function esperarDiagrama(pagina) {
  await esperarEditor(pagina);
  await pagina.waitForSelector("#canvas svg g.node", { timeout: 45000 });
}

module.exports = { iniciarServidor, abrirNavegador, abrirPagina, esperarEditor, esperarDiagrama, projetoExemplo };
