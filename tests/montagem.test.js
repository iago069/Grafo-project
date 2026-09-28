// assets/js/app.js é montado a partir de src/app/ (npm run montar).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");
const { montar, partes, SAIDA } = require("../scripts/montar-app.js");

test("assets/js/app.js está em dia com src/app/", () => {
  assert.ok(partes().length > 1, "src/app/ deveria ter as partes do editor");
  assert.ok(fs.readFileSync(SAIDA, "utf8") === montar(),
    "assets/js/app.js está diferente das partes em src/app/. Edite em src/app/ e rode: npm run montar");
});

test("o app.js montado é JavaScript válido", () => {
  assert.doesNotThrow(() => new vm.Script(montar(), { filename: "app.js" }));
});
