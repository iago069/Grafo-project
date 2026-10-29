// Verificar diagrama, Endereços IP e busca rápida (Ctrl+K) num navegador de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// Um pouco de tudo errado: IP repetido, /29 sobreposta a uma /30, porta usada
// duas vezes, porta que o CCR2004-16G-2S+ não tem (ether30), VLAN 5000, broadcast.
const projetos = {
  "POP PFU": {
    equipamentos: [
      { id: "rb", nome: "RB PFU", tipo: "MikroTik", modelo: "CCR2004-16G-2S+", ip: "10.20.0.1/29", status: "ativo" },
      { id: "sw", nome: "SW PFU", tipo: "Switch", ip: "10.20.0.1/29", status: "ativo" },
      { id: "olt", nome: "OLT PFU", tipo: "OLT", ip: "10.20.0.6/30", status: "ativo" },
      { id: "volt", nome: "VOLT PFU", tipo: "VOLT", ip: "10.20.0.7", mascara: "/29", status: "ativo" },
      { id: "solto", nome: "Sobra", tipo: "Servidor", status: "ativo" }
    ],
    conexoes: [
      { de: "rb", para: "sw", tipo: "Cobre", saida: "ether2", chegada: "1", vlan: "5000" },
      { de: "rb", para: "olt", tipo: "Cobre", saida: "ether2", chegada: "1" },
      { de: "rb", para: "volt", tipo: "Cobre", saida: "ether30", chegada: "eth0" }
    ]
  },
  "POP IBR": {
    equipamentos: [{ id: "x1", nome: "Switch Ijui", tipo: "Switch", ip: "10.20.0.12/30", status: "ativo" }],
    conexoes: []
  }
};

test("Verificar diagrama: acha os problemas, mostra o selo e leva até o equipamento", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, projetos });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => document.getElementById("btnVerificar").getAttribute("data-selo"));
  const titulos = await pagina.evaluate(() => window.GrafoApp.verificar().map(p => p.nivel + ": " + p.titulo));
  const tem = re => assert.ok(titulos.some(t => re.test(t)), "esperava " + re + " em:\n" + titulos.join("\n"));
  tem(/^erro: IP 10\.20\.0\.1 repetido/);
  tem(/^erro: Porta ether2 de RB PFU usada 2 vezes/);
  tem(/^aviso: Porta ether30 não existe no CCR2004-16G-2S\+/);
  tem(/^erro: VLAN 5000 inválida/);
  tem(/^erro: IP de VOLT PFU é o broadcast/);
  tem(/^aviso: Redes 10\.20\.0\.0\/29 e 10\.20\.0\.4\/30 se sobrepõem/);
  tem(/^dica: Sobra sem cabo/);
  assert.ok(!titulos.some(t => /ether2 não existe/.test(t)), "ether2 existe no modelo");

  await pagina.click("#btnVerificar");
  await pagina.waitForSelector("#vfModal:not(.hidden) .vf-item");
  assert.match(await pagina.textContent("#vfModal .vf-resumo"), /erros/);
  // "Mostrar" do IP repetido: fecha a janela, seleciona e centraliza o equipamento.
  const i = titulos.findIndex(t => /IP 10\.20\.0\.1 repetido/.test(t));
  await pagina.click(`#vfModal [data-vf-ir="${i}"]`);
  await pagina.waitForSelector("#vfModal.hidden", { state: "attached" });
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.node.selecionado").length === 2);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Endereços IP: redes do diagrama e próxima /30 livre (conferindo os outros projetos)", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, projetos });
  await esperarDiagrama(pagina);
  await pagina.click("#btnEnderecosIp");
  await pagina.waitForSelector("#ipModal:not(.hidden)");
  assert.equal(await pagina.inputValue("#ipBloco"), "10.20.0.0/24", "bloco sugerido pelo /24 mais usado");
  const tabela = await pagina.textContent("#ipLinhas");
  assert.match(tabela, /10\.20\.0\.0\/29/);
  assert.match(tabela, /10\.20\.0\.4\/30/);
  // Ocupados: .0/29 (0–7), .4/30 e, no outro projeto, .12/30 → a próxima /30 livre é .8/30.
  assert.match(await pagina.textContent("#ipResultado"), /10\.20\.0\.8\/30/);
  assert.match(await pagina.textContent("#ipResultado"), /10\.20\.0\.16\/30/, "a .12/30 do outro projeto fica de fora");
  await pagina.uncheck("#ipTodos");
  assert.match(await pagina.textContent("#ipResultado .ip-depois"), /10\.20\.0\.12\/30/, "sem conferir os outros projetos, a .12/30 aparece");
  await pagina.selectOption("#ipTamanho", "29");
  assert.match(await pagina.textContent("#ipResultado strong"), /10\.20\.0\.8\/29/);
  // Filtro por IP: mostra a rede onde ele cai.
  await pagina.fill("#ipFiltro", "10.20.0.5");
  assert.match(await pagina.textContent("#ipLinhas"), /10\.20\.0\.4\/30/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Busca rápida: Enter vai até o equipamento, acha cabo pela VLAN e equipamento de outro projeto", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, projetos });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => document.getElementById("paletaComandos"));
  await pagina.keyboard.press("Control+k");
  await pagina.fill("#paletaComandos .paleta-input", "olt pfu");
  await pagina.keyboard.press("Enter");
  await pagina.waitForFunction(() => {
    const sel = document.querySelectorAll("#canvas g.node.selecionado");
    return sel.length === 1 && /OLT PFU/.test(sel[0].textContent);
  });
  assert.equal(await pagina.locator("#editorModal.hidden").count(), 1, "Enter não abre o editor");

  await pagina.keyboard.press("Control+k");
  await pagina.fill("#paletaComandos .paleta-input", "vlan 5000");
  assert.match(await pagina.textContent("#paletaComandos .paleta-item.ativo"), /RB PFU ⇄ SW PFU/);

  await pagina.fill("#paletaComandos .paleta-input", "switch ijui");
  assert.match(await pagina.textContent("#paletaComandos .paleta-item.ativo"), /Em outros projetos/);
  await pagina.keyboard.press("Enter");
  await pagina.waitForFunction(() => window.GrafoApp.projetoAtual() === "POP IBR");
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas g.node.selecionado").length === 1);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
