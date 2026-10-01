// Tipo de diagrama (modo do projeto): Topologia, Diagrama de redes e Monitoramento.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const projetoSalvo = pagina => pagina.evaluate(() => {
  const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
  const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
  return JSON.parse(localStorage.getItem(chave))[atual];
});

test("novo projeto pergunta o tipo; Monitoramento mostra status com cor, legenda por status e exporta com o tipo no nome", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click("#btnNovoProjeto");
  await pagina.waitForSelector("#novoProjetoModal:not(.hidden)");
  // Nome repetido: avisa no próprio modal.
  await pagina.fill("#novoProjetoNome", await pagina.$eval("#projetoSelect", s => s.value));
  await pagina.click('#novoProjetoForm button[type="submit"]');
  assert.match(await pagina.textContent("#novoProjetoMensagem"), /Já existe/);
  await pagina.fill("#novoProjetoNome", "CFTV Prédio");
  await pagina.click(".modo-opcao:has(input[value=monitoramento])");
  await pagina.click('#novoProjetoForm button[type="submit"]');
  await pagina.waitForSelector("#novoProjetoModal.hidden", { state: "attached" });
  assert.equal(await pagina.$eval("#modoDiagrama", s => s.value), "monitoramento");
  assert.equal((await projetoSalvo(pagina)).modo, "monitoramento");

  // Exemplo: mantém o tipo do projeto. Legenda por status, com contagem.
  await pagina.click("[data-carregar-exemplo]");
  await pagina.waitForSelector("#canvas svg g.node");
  await pagina.waitForFunction(() => document.getElementById("legenda").classList.contains("legenda-status"));
  assert.match(await pagina.textContent("#legenda"), /4 ativos.*1 em manutenção.*0 offline/);
  assert.equal((await projetoSalvo(pagina)).modo, "monitoramento");

  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.evaluate(() => document.getElementById("btnBaixarPng").click())]);
  assert.match(download.suggestedFilename(), /^cftv-predio-monitoramento-\d{4}-\d\d-\d\d\.png$/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Diagrama de redes: campo VLAN / rede aparece e vai para o desenho; em Topologia some", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  assert.equal(await pagina.$eval("#modoDiagrama", s => s.value), "topologia", "projeto antigo (sem modo) é Topologia");
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.waitForSelector("#navEquipNome", { state: "visible" });
  assert.equal(await pagina.isVisible("#navEquipRede"), false, "VLAN só no Diagrama de redes");

  await pagina.selectOption("#modoDiagrama", "redes");
  assert.equal(await pagina.isVisible("#navEquipRede"), true);
  await pagina.fill("#navEquipNome", "SW-VLAN");
  await pagina.fill("#navEquipIp", "10.20.0.2");
  await pagina.fill("#navEquipRede", "VLAN 20 · 10.20.0.0/24");
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("VLAN 20"), null, { timeout: 20000 });
  const salvo = await projetoSalvo(pagina);
  assert.equal(salvo.modo, "redes");
  assert.equal(salvo.equipamentos.find(e => e.nome === "SW-VLAN").rede, "VLAN 20 · 10.20.0.0/24");

  // Tipos do modo vêm primeiro na lista.
  assert.equal(await pagina.$eval("#tipos-sugeridos option", o => o.value), "RB / CCR");

  await pagina.selectOption("#modoDiagrama", "topologia");
  await pagina.waitForFunction(() => !document.getElementById("canvas").textContent.includes("VLAN 20"), null, { timeout: 20000 });
  assert.equal((await projetoSalvo(pagina)).equipamentos.find(e => e.nome === "SW-VLAN").rede, "VLAN 20 · 10.20.0.0/24", "a VLAN fica guardada");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("VLAN / rede: vem do CSV, aparece em Editar em lista e pode ser alterada ali", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const csv = "origem;ip_origem;vlan_origem;destino;ip_destino;vlan_destino;tipo;capacidade\r\n" +
    "RB-1;10.0.0.1;VLAN 10;SW-1;10.0.0.2;VLAN 20;Fibra;10G\r\n";
  await pagina.setInputFiles("#arquivoCsv", { name: "rede.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  // O projeto aberto tem equipamentos: confirma a substituição.
  await pagina.click("#appModal [data-modal-confirm]");
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("RB-1"), null, { timeout: 20000 });
  let salvo = await projetoSalvo(pagina);
  assert.deepEqual(salvo.equipamentos.map(e => e.rede), ["VLAN 10", "VLAN 20"]);

  await pagina.click("#btnModoAvancado");
  const campo = '.equip-card[data-idx="1"] input[data-field="rede"]';
  await pagina.waitForSelector("#listaEquip " + campo, { state: "attached" });
  assert.equal(await pagina.$eval(campo, i => i.value), "VLAN 20");
  await pagina.$eval(campo, i => { i.value = "VLAN 30"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  salvo = await projetoSalvo(pagina);
  assert.equal(salvo.equipamentos[1].rede, "VLAN 30");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("seletor de tipo do tamanho do texto também sem field-sizing (Firefox/Safari)", async () => {
  const larguras = async semSuporte => {
    const pagina = await abrirPagina(navegador, site, { antes: semSuporte ? () => {
      const original = CSS.supports.bind(CSS);
      CSS.supports = (...a) => String(a.join(":")).includes("field-sizing") ? false : original(...a);
    } : undefined });
    await esperarDiagrama(pagina);
    await pagina.evaluate(() => document.fonts.ready);
    const medir = () => pagina.$eval("#modoDiagrama", s => s.getBoundingClientRect().width);
    const topologia = await medir();
    await pagina.selectOption("#modoDiagrama", "redes");
    await pagina.waitForFunction(() => document.body.getAttribute("data-modo-diagrama") === "redes");
    const redes = await medir();
    assert.deepEqual(pagina.erros, []);
    await pagina.context().close();
    return { topologia, redes };
  };
  const nativo = await larguras(false);
  const medido = await larguras(true);
  assert.ok(medido.redes > medido.topologia + 30, "acompanha o texto escolhido");
  assert.ok(Math.abs(medido.topologia - nativo.topologia) <= 6, "Topologia: " + medido.topologia + " x " + nativo.topologia);
  assert.ok(Math.abs(medido.redes - nativo.redes) <= 6, "Redes: " + medido.redes + " x " + nativo.redes);
});
