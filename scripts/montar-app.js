// Monta assets/js/editor/app.js juntando as partes de src/app/ em ordem alfabética.
// O editor é um único bloco (function () { ... })() com estado compartilhado;
// as partes são só fatias desse bloco, para editar arquivos menores.
// Uso: npm run montar (depois de editar qualquer arquivo em src/app/ ou o CSS).
// O teste tests/unidade/montagem.test.js falha se algo estiver desatualizado.
//
// Também gera as versões compactadas que o site carrega (esbuild):
//   assets/js/editor/app.min.js (+ .map, para ver o código original no DevTools)
//   assets/css/styles.min.css
// Cada uma termina com o hash da fonte (grafo-fonte=...): o teste compara com
// a fonte atual sem precisar do esbuild.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
const PASTA = path.join(RAIZ, "src", "app");
const SAIDA = path.join(RAIZ, "assets", "js", "editor", "app.js");
const SAIDA_MIN = path.join(RAIZ, "assets", "js", "editor", "app.min.js");
const CSS = path.join(RAIZ, "assets", "css", "styles.css");
const CSS_MIN = path.join(RAIZ, "assets", "css", "styles.min.css");

function partes() {
  return fs.readdirSync(PASTA).filter(nome => /^\d\d-.+\.js$/.test(nome)).sort();
}

function montar() {
  return partes().map(nome => fs.readFileSync(path.join(PASTA, nome), "utf8")).join("");
}

// Hash da fonte (sem diferença entre CRLF e LF, que o Git troca no Windows).
function hashDaFonte(texto) {
  return crypto.createHash("sha256").update(String(texto).replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}
// Hash gravado no fim de um arquivo compactado ("" se não houver).
function hashGravado(arquivo) {
  if (!fs.existsSync(arquivo)) return "";
  const m = /grafo-fonte=([0-9a-f]{16})/.exec(fs.readFileSync(arquivo, "utf8").slice(-200));
  return m ? m[1] : "";
}

function gravarSeMudou(arquivo, conteudo) {
  const antes = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
  if (antes === conteudo) return false;
  fs.writeFileSync(arquivo, conteudo);
  return true;
}

function compactar(conteudoApp) {
  const esbuild = require("esbuild");
  const hashApp = hashDaFonte(conteudoApp);
  if (hashGravado(SAIDA_MIN) !== hashApp) {
    const js = esbuild.transformSync(conteudoApp, {
      loader: "js", minify: true, legalComments: "inline",
      sourcemap: "external", sourcefile: "app.js", sourcesContent: false
    });
    fs.writeFileSync(SAIDA_MIN, js.code + "//# sourceMappingURL=app.min.js.map\n// grafo-fonte=" + hashApp + "\n");
    fs.writeFileSync(SAIDA_MIN + ".map", js.map);
    console.log("assets/js/editor/app.min.js compactado (" + Math.round(js.code.length / 1024) + " KB).");
  }
  const css = fs.readFileSync(CSS, "utf8"), hashCss = hashDaFonte(css);
  if (hashGravado(CSS_MIN) !== hashCss) {
    const min = esbuild.transformSync(css, { loader: "css", minify: true, legalComments: "inline" });
    fs.writeFileSync(CSS_MIN, min.code + "/* grafo-fonte=" + hashCss + " */\n");
    console.log("assets/css/styles.min.css compactado (" + Math.round(min.code.length / 1024) + " KB).");
  }
}

module.exports = { montar, partes, hashDaFonte, hashGravado, SAIDA, SAIDA_MIN, CSS, CSS_MIN };

if (require.main === module) {
  const conteudo = montar();
  if (gravarSeMudou(SAIDA, conteudo)) console.log("assets/js/editor/app.js montado a partir de " + partes().length + " partes.");
  else console.log("assets/js/editor/app.js já está atualizado (" + partes().length + " partes).");
  compactar(conteudo);
}
