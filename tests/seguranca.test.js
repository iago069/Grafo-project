// Cabeçalhos de segurança (vercel.json) e páginas compatíveis com o CSP.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), "utf8");
const vercel = JSON.parse(ler("vercel.json"));
const cabecalhos = {};
(vercel.headers || []).filter(r => r.source === "/(.*)").forEach(r => r.headers.forEach(h => { cabecalhos[h.key] = h.value; }));
const diretiva = nome => (cabecalhos["Content-Security-Policy"] || "").split(";").map(s => s.trim()).find(s => s.startsWith(nome + " ")) || "";

test("o site envia os cabeçalhos de segurança", () => {
  for (const nome of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
    assert.ok(cabecalhos[nome], "falta o cabeçalho " + nome);
  }
  assert.equal(cabecalhos["X-Content-Type-Options"], "nosniff");
  assert.match(diretiva("frame-ancestors"), /'none'/, "o site não pode ser aberto dentro de outro site");
  assert.match(diretiva("object-src"), /'none'/);
});

test("o CSP não libera scripts embutidos nem eval", () => {
  const scripts = diretiva("script-src");
  assert.ok(scripts, "falta script-src");
  assert.doesNotMatch(scripts, /'unsafe-inline'|'unsafe-eval'|\*/);
});

test("as páginas não têm scripts embutidos (o CSP os bloquearia)", () => {
  for (const pagina of ["index.html", "ver.html"]) {
    const html = ler(pagina);
    const embutidos = (html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []);
    assert.deepEqual(embutidos, [], pagina + " tem <script> sem src");
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, pagina + " tem atributo on...= (onclick etc.)");
  }
});

test("scripts de CDN têm versão fixa e integrity (SRI)", () => {
  const html = ler("index.html");
  const externos = html.match(/<script[^>]+src="https:[^"]+"[^>]*>/g) || [];
  assert.ok(externos.length >= 1);
  // Graphviz: carregado depois do login (auth.js) e pré-carregado (sessao.js), com o mesmo integrity.
  const hashViz = arquivo => (ler(arquivo).match(/viz-global\.js",\s*"(sha384-[A-Za-z0-9+/=]+)"/) || [])[1];
  assert.ok(hashViz("assets/js/auth.js"), "auth.js deve carregar o Graphviz com integrity");
  assert.equal(hashViz("assets/js/sessao.js"), hashViz("assets/js/auth.js"), "o integrity do Graphviz precisa ser igual nos dois arquivos");
  assert.doesNotMatch(html, /viz-global\.js/, "o Graphviz não deve pesar na página inicial");
  externos.forEach(tag => {
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, "sem integrity: " + tag);
    assert.match(tag, /crossorigin="anonymous"/, "sem crossorigin: " + tag);
    assert.match(tag, /@\d+\.\d+\.\d+/, "sem versão exata: " + tag);
  });
  const app = ler("assets/js/app.js");
  // Gerador de PDF: a URL fica numa constante (também usada pelo modo sem internet);
  // o <script> que a carrega precisa ter integrity.
  for (const lib of ["jspdf@", "svg2pdf.js@"]) {
    const constante = (app.match(new RegExp("var (\\w+) = \"https://cdn\\.jsdelivr\\.net/npm/" + lib.replace(/\./g, "\\.") + "\\d+\\.\\d+\\.\\d+/")) || [])[1];
    assert.ok(constante, lib + " com versão exata não encontrado no app.js");
    const i = app.indexOf("script.src = " + constante + ";");
    assert.ok(i > 0, constante + " não é carregado no app.js");
    assert.match(app.slice(i, i + 300), /integrity = "sha384-/, lib + " sem integrity");
  }
  assert.doesNotMatch(app, /jspdf@2\./, "jsPDF 2.x tem falhas de segurança conhecidas");
  // Gerador de QR code das etiquetas.
  const etiquetas = ler("assets/js/etiquetas.js");
  assert.match(etiquetas, /var URL_QR = "https:\/\/cdn\.jsdelivr\.net\/npm\/qrcode-generator@\d+\.\d+\.\d+\//);
  assert.match(etiquetas, /var INTEGRITY_QR = "sha384-[A-Za-z0-9+/=]+"/);
  assert.match(etiquetas, /script\.integrity = INTEGRITY_QR/);
});
