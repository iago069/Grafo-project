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
  assert.ok(externos.length >= 2);
  externos.forEach(tag => {
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, "sem integrity: " + tag);
    assert.match(tag, /crossorigin="anonymous"/, "sem crossorigin: " + tag);
    assert.match(tag, /@\d+\.\d+\.\d+/, "sem versão exata: " + tag);
  });
  const app = ler("assets/js/app.js");
  for (const lib of ["jspdf@", "svg2pdf.js@"]) {
    const i = app.indexOf(lib);
    assert.ok(i > 0, lib + " não encontrado no app.js");
    assert.match(app.slice(i, i + 400), /integrity = "sha384-/, lib + " sem integrity");
  }
  assert.doesNotMatch(app, /jspdf@2\./, "jsPDF 2.x tem falhas de segurança conhecidas");
});
