// Cor do ícone na exportação (PNG/PDF): o filtro da tela vira tom na imagem.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.join(__dirname, "..", "..", "assets", "js", "editor", "app.js"), "utf8");

test("a exportação reconhece o filtro de cor que a tela aplica no ícone", () => {
  const linha = /var tom = (\/.+\/i)\.exec\(imagem\.getAttribute\("filter"\)/.exec(app);
  assert.ok(linha, "não achei a leitura do filtro em aplicarTomNaImagem");
  const regex = eval(linha[1]);
  const m = regex.exec('url(#tom-2e9e5b)');
  assert.ok(m, "o filtro url(#tom-…) precisa ser reconhecido");
  assert.equal(m[1], "2e9e5b");
  assert.match(app, /"tom-" \+ cor\.slice\(1\)\.toLowerCase\(\)/, "o id do filtro da tela segue o formato tom-rrggbb");
});
