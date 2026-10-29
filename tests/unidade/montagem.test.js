// assets/js/editor/app.js é montado a partir de src/app/ (npm run montar).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { montar, partes, SAIDA } = require("../../scripts/montar-app.js");

// CRLF (Windows) x LF (Linux) não muda o código: o Git pode converter um e outro.
const semCr = texto => texto.replace(/\r\n/g, "\n");

test("assets/js/editor/app.js está em dia com src/app/", () => {
  assert.ok(partes().length > 1, "src/app/ deveria ter as partes do editor");
  assert.ok(semCr(fs.readFileSync(SAIDA, "utf8")) === semCr(montar()),
    "assets/js/editor/app.js está diferente das partes em src/app/. Edite em src/app/ e rode: npm run montar");
});

test("o app.js montado é JavaScript válido", () => {
  assert.doesNotThrow(() => new vm.Script(montar(), { filename: "app.js" }));
});

// As partes dividem o mesmo bloco: uma função ou variável de topo com o mesmo
// nome em duas partes faz a de baixo valer para o editor inteiro (já quebrou a
// caixa dos grupos e a folga dos cabos). Cada nome de topo só pode existir uma vez.
test("nenhuma função ou variável de topo repetida entre as partes", () => {
  const vistos = {}, repetidos = [];
  const pasta = path.join(__dirname, "..", "..", "src", "app");
  partes().forEach(nome => {
    const texto = semCr(fs.readFileSync(path.join(pasta, nome), "utf8"));
    const re = /^  (?:async )?function ([A-Za-z0-9_$]+)|^  var ([A-Za-z0-9_$]+)/gm;
    let m;
    while ((m = re.exec(texto))) {
      const n = m[1] || m[2];
      if (vistos[n] && vistos[n] !== nome) repetidos.push(n + " (" + vistos[n] + " e " + nome + ")");
      vistos[n] = vistos[n] || nome;
    }
  });
  assert.deepEqual(repetidos, []);
});

// O site carrega as versões compactadas (app.min.js e styles.min.css), feitas
// pelo npm run montar. Cada uma guarda o hash da fonte: se a fonte mudou e
// ninguém rodou o montar, o site estaria servindo código velho.
test("app.min.js e styles.min.css estão em dia com a fonte", () => {
  const { hashDaFonte, hashGravado, SAIDA_MIN, CSS, CSS_MIN } = require("../../scripts/montar-app.js");
  assert.equal(hashGravado(SAIDA_MIN), hashDaFonte(montar()), "app.min.js desatualizado: rode npm run montar");
  assert.equal(hashGravado(CSS_MIN), hashDaFonte(fs.readFileSync(CSS, "utf8")), "styles.min.css desatualizado: rode npm run montar");
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(SAIDA_MIN, "utf8"), { filename: "app.min.js" }));
  assert.ok(fs.existsSync(SAIDA_MIN + ".map"), "falta o app.min.js.map");
  // O editor e a página carregam os compactados.
  const ler = arquivo => fs.readFileSync(path.join(__dirname, "..", "..", arquivo), "utf8");
  assert.match(ler("assets/js/conta/auth.js"), /"\.\/assets\/js\/editor\/app\.min\.js"/);
  assert.match(ler("index.html"), /href="\.\/assets\/css\/styles\.min\.css"/);
});
