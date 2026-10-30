// Política de Privacidade (LGPD): completa, com a mesma versão do aceite no
// cadastro, e o site sem pedir nada ao Google.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");
const ler = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

test("a política tem o e-mail de contato do titular (art. 41)", () => {
  const politica = ler("privacidade.html");
  assert.doesNotMatch(politica, /EMAIL_DE_CONTATO/, "troque EMAIL_DE_CONTATO pelo e-mail de contato");
  assert.match(politica, /href="mailto:[^"@\s]+@[^"\s]+\.[a-z]{2,}"/);
});

test("a versão aceita no cadastro é a data que aparece na política", () => {
  const versao = /VERSAO_PRIVACIDADE = "(\d{4})-(\d\d)-(\d\d)"/.exec(ler("assets/js/conta/auth.js"));
  assert.ok(versao, "VERSAO_PRIVACIDADE em auth.js");
  const data = Number(versao[3]) + " de " + MESES[Number(versao[2]) - 1] + " de " + versao[1];
  assert.match(ler("privacidade.html"), new RegExp("Versão de " + data));
});

test("fontes do próprio site: nada do Google no index.html, na CSP e no service worker", () => {
  assert.doesNotMatch(ler("index.html"), /fonts\.(googleapis|gstatic)/);
  assert.doesNotMatch(ler("vercel.json"), /fonts\.(googleapis|gstatic)/);
  assert.doesNotMatch(ler("sw.js"), /fonts\.(googleapis|gstatic)/);
  const css = ler("assets/fonts/fontes.css");
  for (const [, arquivo] of css.matchAll(/url\(\.\/([^)]+)\)/g)) {
    assert.ok(fs.existsSync(path.join(RAIZ, "assets/fonts", arquivo)), arquivo);
  }
});

test("/privacidade tem rota na Vercel e link no login e em Minha conta", () => {
  const rotas = JSON.parse(ler("vercel.json")).rewrites;
  assert.ok(rotas.some(r => r.source === "/privacidade" && r.destination === "/privacidade.html"));
  const index = ler("index.html");
  assert.match(index, /class="login-rodape"[\s\S]*?href="\/privacidade"/);
  assert.match(index, /id="authAceite"/);
  assert.match(index, /id="contaBaixarDados"/);
});
