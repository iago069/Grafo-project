// Monta assets/js/app.js juntando as partes de src/app/ em ordem alfabética.
// O editor é um único bloco (function () { ... })() com estado compartilhado;
// as partes são só fatias desse bloco, para editar arquivos menores.
// Uso: npm run montar (depois de editar qualquer arquivo em src/app/).
// O teste tests/montagem.test.js falha se o app.js estiver desatualizado.
const fs = require("fs");
const path = require("path");

const PASTA = path.join(__dirname, "..", "src", "app");
const SAIDA = path.join(__dirname, "..", "assets", "js", "app.js");

function partes() {
  return fs.readdirSync(PASTA).filter(nome => /^\d\d-.+\.js$/.test(nome)).sort();
}

function montar() {
  return partes().map(nome => fs.readFileSync(path.join(PASTA, nome), "utf8")).join("");
}

module.exports = { montar, partes, SAIDA };

if (require.main === module) {
  const conteudo = montar();
  const antes = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, "utf8") : "";
  if (antes === conteudo) {
    console.log("assets/js/app.js já está atualizado (" + partes().length + " partes).");
  } else {
    fs.writeFileSync(SAIDA, conteudo);
    console.log("assets/js/app.js montado a partir de " + partes().length + " partes.");
  }
}
