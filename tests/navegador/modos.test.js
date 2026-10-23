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
  await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {}); // ficha do equipamento
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

test("Novo projeto com modelo FTTH: sinal óptico calculado em cada CTO e cliente", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click("#btnNovoProjeto");
  await pagina.fill("#novoProjetoNome", "Bairro Norte");
  await pagina.locator('.modelo-opcao:has(input[value="ftth"])').click();
  await pagina.click('#novoProjetoForm button[type="submit"]');
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "Bairro Norte");
  await pagina.waitForFunction(() => /dBm/.test(document.getElementById("canvas").textContent), null, { timeout: 20000 });
  const texto = await pagina.textContent("#canvas");
  // OLT +5 → 2 km (0,7) + conector 0,5 = 3,8 no splitter; saída 1:8 (-10,5) → CTO-A a 1 km: 3,8-10,5-0,35-0,5 = -7,6
  assert.match(texto, /entrada 3,8 dBm/);
  assert.match(texto, /-7,6 dBm/);
  assert.equal(await pagina.getAttribute("body", "data-modo-diagrama"), "ftth");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("tema Fernando troca a logo pelo símbolo do tema; outro tema volta a logo do Grafo", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const trocar = valor => pagina.evaluate(v => { const sel = document.getElementById("temaSelect"); sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); return document.querySelector("img.brand-mark").getAttribute("src"); }, valor);
  assert.match(await trocar("theme-fernando"), /simbolo-fernando\.png$/);
  assert.match(await trocar("theme-bolsonaro"), /bandeira-brasil\.svg$/);
  assert.match(await trocar("theme-nord"), /grafo-160\.png$/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("renomear projeto depois de salvar: troca o nome na lista e mantém o conteúdo", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const antes = await pagina.evaluate(() => window.GrafoApp.projetoAtual());
  const qtd = (await projetoSalvo(pagina)).equipamentos.length;
  await pagina.click("#btnRenomearProjeto");
  await pagina.fill("#modalInput", "POP Renomeado");
  await pagina.click("[data-modal-confirm]");
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "POP Renomeado");
  const opcoes = await pagina.$$eval("#projetoSelect option", os => os.map(o => o.value));
  assert.ok(opcoes.includes("POP Renomeado"));
  assert.ok(!opcoes.includes(antes));
  assert.equal((await projetoSalvo(pagina)).equipamentos.length, qtd);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("ao adicionar equipamento mostra a ficha nome / Host / gateway / mask; lista de cabos no modelo enxuto", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.fill("#navEquipNome", "OLT-99");
  await pagina.fill("#navEquipIp", "10.20.30.40/24");
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.waitForSelector("#fichaModal:not(.hidden)");
  assert.equal(await pagina.inputValue("#fichaTexto"), "nome: OLT-99\nHost: 10.20.30.40\ngateway: 10.20.30.1\nmask: 255.255.255.0");
  await pagina.screenshot({ path: process.env.FOTO_FICHA || require("os").tmpdir() + "/ficha.png" });
  await pagina.click(".modal-actions [data-ficha-fechar]");
  // Todas as fichas de uma vez (Documentação → Fichas dos equipamentos).
  if (!(await pagina.isVisible("#btnFichas"))) await pagina.click(".nav-section:has(#btnFichas) > .nav-label");
  await pagina.click("#btnFichas");
  await pagina.waitForSelector("#fichaModal:not(.hidden)");
  const todas = await pagina.inputValue("#fichaTexto");
  assert.match(todas, /nome: OLT-99\nHost: 10\.20\.30\.40\ngateway: 10\.20\.30\.1\nmask: 255\.255\.255\.0/);
  assert.ok(todas.split("\n\n").length > 1);
  await pagina.click(".modal-actions [data-ficha-fechar]");
  await pagina.waitForSelector("#fichaModal.hidden", { state: "attached" });
  // Cabos: linha com origem → destino; campos em "Detalhes".
  await pagina.click("#btnModoAvancado");
  const card = pagina.locator("#listaConex .conex-card").first();
  await card.waitFor();
  assert.match(await card.locator(".conex-titulo").textContent(), /→/);
  assert.equal(await card.locator('[data-field="saida"]').isVisible(), false);
  await card.locator('[data-action="toggle-avancado"]').click();
  assert.equal(await card.locator('[data-field="saida"]').isVisible(), true);
  await pagina.screenshot({ path: process.env.FOTO_CABOS || require("os").tmpdir() + "/cabos.png" });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("cadastro automático: tipo pelo nome, próximo IP livre, próxima porta e capacidade pela porta", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.waitForSelector("#navEquipNome", { state: "visible" });
  assert.match(await pagina.inputValue("#navEquipIp"), /^10\.0\.0\.\d+$/, "IP sugerido");
  await pagina.fill("#navEquipNome", "POP-TPA01_OLT-50");
  assert.equal(await pagina.inputValue("#navEquipTipo"), "OLT");
  await pagina.fill("#navEquipNome", "POP-SXH03_DISTR-51");
  assert.equal(await pagina.inputValue("#navEquipTipo"), "Switch");
  // Funções puras.
  const r = await pagina.evaluate(() => {
    const A = window.GrafoAutomatico;
    return [A.portaCurta("ten-gigabit-ethernet-1/1/7"), A.capacidadePelaPorta("XE1/1/7"), A.capacidadePelaPorta("ge0/3"),
    ];
  });
  assert.deepEqual(r.slice(0, 3), ["XE1/1/7", "10G", "1G"]);
  // Cabo: escolher a origem sugere a próxima porta livre dela.
  await pagina.click('[data-nav-panel="navAddCable"]');
  await pagina.waitForSelector("#navCableDe", { state: "visible" });
  {
    const ids = await pagina.$$eval("#navCableDe option", os => os.map(o => [o.value, o.textContent]));
    const centro = ids.find(i => /OLT-Centro/.test(i[1]));
    await pagina.selectOption("#navCableDe", centro[0]);
    assert.equal(await pagina.inputValue("#navCableSaida"), "ge0/3");
    assert.equal(await pagina.inputValue("#navCablePotencia"), "1G");
    await pagina.fill("#navCableChegada", "ten-gigabit-ethernet-1/1/9");
    await pagina.locator("#navCableChegada").blur();
    assert.equal(await pagina.inputValue("#navCableChegada"), "XE1/1/9");
  }
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("modelo pelo nome e Ligar a: cadastra o equipamento já com modelo, tipo e o cabo nas portas livres", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => window.GrafoAutomatico && window.GrafoAutomatico.modeloPeloNome("POP-X_DM4270-48XS") !== "");
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.waitForSelector("#navEquipNome", { state: "visible" });
  await pagina.fill("#navEquipNome", "POP-TPR_DM4270-48XS");
  assert.equal(await pagina.inputValue("#navEquipModelo"), "DM4270-48XS+6CX");
  assert.equal(await pagina.inputValue("#navEquipTipo"), "Switch");
  const centro = (await pagina.$$eval("#navEquipLigarA option", os => os.map(o => [o.value, o.textContent]))).find(o => /OLT-Centro/.test(o[1]));
  await pagina.selectOption("#navEquipLigarA", centro[0]);
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {});
  const cabo = await pagina.evaluate(() => {
    const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
    const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
    const proj = JSON.parse(localStorage.getItem(chave))[atual];
    const novo = proj.equipamentos.find(e => e.nome === "POP-TPR_DM4270-48XS");
    return proj.conexoes.find(c => c.para === novo.id);
  });
  assert.ok(cabo, "cabo criado");
  assert.equal(cabo.saida, "ge0/3");
  assert.equal(cabo.chegada, "XE1/1/1");
  assert.equal(cabo.potencia, "1G");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("seletor de modelos: agrupado por fabricante, filtra ao digitar e escolhe com Enter", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.click("#navEquipModelo");
  await pagina.waitForSelector(".seletor-modelos:not([hidden]) .sm-item");
  const fabricantes = await pagina.$$eval(".sm-fabricante", l => l.map(e => e.childNodes[1].textContent));
  for (const f of ["MikroTik", "Datacom", "Parks", "Huawei"]) assert.ok(fabricantes.includes(f), f);
  await pagina.keyboard.type("4270");
  if (process.env.FOTO_SELETOR) await pagina.screenshot({ path: process.env.FOTO_SELETOR });
  assert.ok((await pagina.$$eval(".sm-item strong", l => l.map(e => e.textContent))).every(n => /4270/.test(n)));
  await pagina.keyboard.press("ArrowDown");
  await pagina.keyboard.press("Enter");
  assert.match(await pagina.inputValue("#navEquipModelo"), /^DM4270/);
  assert.equal(await pagina.inputValue("#navEquipTipo"), "Switch");
  assert.equal(await pagina.isVisible(".seletor-modelos"), false);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
