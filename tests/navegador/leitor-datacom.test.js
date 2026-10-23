// "Gerar a partir de texto" com as listas do Datacom (porta / descrição / UP-DOWN)
// e a tabela do NetBox com portas ten-gigabit-ethernet, coladas como vêm.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const BLOCOS = `ten-gigabit-ethernet-1/1/1
ENLACE_POP-SXH03_DISTR-51_XE2

UP

ten-gigabit-ethernet-1/1/2
OLT34_XE0/0

UP

ten-gigabit-ethernet-1/1/10
ROUTER_CORE_TPR_06_XE_0_0_36

UP

ten-gigabit-ethernet-1/1/16
Sem alias

DOWN

ten-gigabit-ethernet-1/1/22
ANTIGO-LINK-CBORGES

DOWN

ten-gigabit-ethernet-1/1/23
ENLACE_POP-LTCS01_DISTR-207_XE1

UP
`;

const NETBOX = [
  "ten-gigabit-ethernet-1/1/1\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\tENLACE_POP-SXH03_DISTR-51_XE2\t\t#605\tPOP-SXH03_DISTR-51 (5428682)  ten-gigabit-ethernet-1/1/2\t—\t    ",
  "\t ten-gigabit-ethernet-1/1/2\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\tOLT34_XE0/0\t\t#606\tPOP-TPA01_OLT-34 (PRKS00B4826F)  10giga-ethernet0/0\t—\t    ",
  "\t ten-gigabit-ethernet-1/1/8.1753\t—\t\tVirtual\t—\t—\t—\t—\t—\t\t—\t—\t—\t ",
  "\t ten-gigabit-ethernet-1/1/12\t—\t\tSFP+ (10GE)\t—\tLAG-1\t—\t—\tUPLINK_CORE_TPR_06_XE_0_0_34\t\t#614\tcore-tpr-06 (WS3718330131)  xe-0/0/34\t—\t    ",
  "\t ten-gigabit-ethernet-1/1/16\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\t—\t\t—\t—\t—\t    ",
  "\t ten-gigabit-ethernet-1/1/20\t—\t\tSFP+ (10GE)\t—\t—\t—\t—\tENLACE_POP-NMT06_DISTR-66_XE1\t\t#102\tPOP-NMT06_DISTR-66 (5845876)  ten-gigabit-ethernet-1/1/1"
].join("\n");

async function ler(pagina, texto, nome) {
  await pagina.waitForFunction(() => window.GrafoLeitor);
  await pagina.click("#btnGerarTexto");
  await pagina.fill("[data-leitor-nome]", nome);
  await pagina.fill("[data-leitor-texto]", texto);
  await pagina.click("[data-leitor-ler]");
  await pagina.waitForSelector('[data-passo="revisar"]:not([hidden])', { timeout: 5000 });
}

for (const [nome, texto, portas] of [["lista em blocos", BLOCOS, 4], ["NetBox", NETBOX, 4]]) {
  test("lê " + nome + " do Datacom e mostra as portas como XE", async () => {
    const pagina = await abrirPagina(navegador, site);
    await esperarDiagrama(pagina);
    await ler(pagina, texto, "DISTR-TPR");
    assert.equal(await pagina.locator("[data-leitor-cabo]").count(), portas);
    const lista = await pagina.textContent("[data-leitor-lista]");
    assert.match(lista, /XE1\/1\/1/);
    assert.doesNotMatch(lista, /ten-gigabit/);
    assert.deepEqual(pagina.erros, []);
    await pagina.context().close();
  });
}

test("lê a lista com seta (XE1/1/1  UP  → vizinho  porta), com LAG e portas DOWN", async () => {
  const texto = [
    "XE1/1/1   UP    → POP-SXH03_DISTR-51   XE1/1/2",
    "XE1/1/2   UP    → POP-TPA01_OLT-34     XE0/0",
    "XE1/1/12  UP    → core-tpr-06          xe-0/0/34   (LAG-1)",
    "XE1/1/13  UP    → core-tpr-06          xe-0/0/35   (LAG-1)",
    "XE1/1/16  DOWN  sem alias",
    "XE1/1/22  DOWN  ANTIGO-LINK-CBORGES"
  ].join("\n");
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await ler(pagina, texto, "DISTR-TPR");
  assert.equal(await pagina.locator("[data-leitor-cabo]").count(), 4);
  assert.match(await pagina.textContent("[data-leitor-lista]"), /core-tpr-06[\s\S]*xe-0\/0\/34/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
