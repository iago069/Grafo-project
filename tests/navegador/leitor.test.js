// "Gerar a partir de texto": colar tabela do Grafana, revisar, criar ou mesclar.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const GRAFANA = [
  "xe-0/0/33XE10G", "ae7", "Online\t", "1.01Gbps", "12.57Mbps", "10.11%\t—\t—\t0\t0",
  "xe-0/0/34XE10G", "ae7", "Online\t", "1.12Gbps", "12.63Mbps", "11.18%\t—\t—\t0\t0",
  "ae7LAG20G", "Netflix1-PFU", "Online\t", "2.13Gbps", "25.20Mbps", "10.66%\t—\t—\t0\t0",
  "xe-0/0/16XE10G", "LINK_TELEFONIA_SWITCH_DATACOM", "Online\t", "3.53Mbps", "2.87Mbps", "0.04%\t—\t—\t0\t0",
  "xe-0/0/39XE10G", "PORTA_TESTE", "Online\t", "0bps", "0bps", "0.00%\t—\t—\t0\t0"
].join("\n");

async function lerTexto(pagina, nome) {
  await pagina.waitForFunction(() => window.GrafoLeitor);
  await pagina.click("#btnGerarTexto");
  await pagina.fill("[data-leitor-nome]", nome);
  await pagina.fill("[data-leitor-texto]", GRAFANA);
  await pagina.click("[data-leitor-ler]");
  await pagina.waitForSelector('[data-passo="revisar"]:not([hidden])');
}

test("cola o Grafana, revisa e cria um diagrama novo", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await lerTexto(pagina, "core-l2-pf");
  assert.match(await pagina.textContent("[data-leitor-resumo]"), /Grafana/);
  assert.equal(await pagina.locator("[data-leitor-cabo]").count(), 4);
  // Desmarcar um cabo tira ele (e o equipamento que fica sozinho).
  await pagina.locator('.leitor-cabo:has-text("PORTA_TESTE") input').uncheck();
  await pagina.click("[data-leitor-novo]");
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "core-l2-pf", null, { timeout: 20000 });
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("Netflix1-PFU"), null, { timeout: 20000 });
  const dados = await pagina.evaluate(() => window.GrafoApp.dadosProjeto("core-l2-pf"));
  assert.equal(dados.conexoes.length, 3);
  assert.ok(!dados.equipamentos.some(e => e.nome === "PORTA_TESTE"));
  assert.deepEqual(dados.conexoes.filter(c => /ae7/.test(c.tipo)).map(c => c.saida).sort(), ["xe-0/0/33", "xe-0/0/34"]);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("mesclar no diagrama aberto mantém o que já existe", async () => {
  const projetos = { "Meu L2": { equipamentos: [{ id: "c", nome: "core-l2-pf", tipo: "Switch" }, { id: "n", nome: "Netflix1-PFU", tipo: "Servidor" }],
    conexoes: [{ de: "c", para: "n", saida: "xe-0/0/33", chegada: "eth0" }] } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await lerTexto(pagina, "core-l2-pf");
  await pagina.click("[data-leitor-mesclar]");
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("LINK_TELEFONIA_SWITCH_DATACOM"), null, { timeout: 20000 });
  const dados = await pagina.evaluate(() => window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()));
  assert.equal(dados.equipamentos.filter(e => e.nome === "Netflix1-PFU").length, 1);
  const c33 = dados.conexoes.filter(c => c.saida === "xe-0/0/33");
  assert.equal(c33.length, 1);
  assert.equal(c33[0].chegada, "eth0", "o cabo que já existia fica como estava");
  assert.ok(dados.conexoes.some(c => c.saida === "xe-0/0/34" && c.para === "n"));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
