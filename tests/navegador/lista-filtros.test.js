// Editar em lista: os filtros de equipamentos e de conexões escondem de verdade
// (na tela) o que não bate, e a contagem mostra "1 de N".
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

const projetos = {
  "POP Filtro": {
    equipamentos: [
      { id: "rb", nome: "RB-BORDA", tipo: "Roteador", ip: "10.0.0.1", grupo: "Sala 1" },
      { id: "sw", nome: "SW-CORE", tipo: "Switch", ip: "10.0.0.2", grupo: "Sala 1" },
      { id: "olt", nome: "OLT-01", tipo: "OLT", ip: "10.9.9.9", grupo: "Sala 2" }
    ],
    conexoes: [
      { de: "rb", para: "sw", tipo: "Cobre", saida: "ether1", chegada: "ge1" },
      { de: "sw", para: "olt", tipo: "Fibra", saida: "sfp1", chegada: "uplink" }
    ]
  }
};

// Itens que aparecem na tela (altura > 0), não só os que têm o atributo hidden.
const naTela = (pagina, seletor) => pagina.$$eval(seletor, l => l.filter(e => e.getBoundingClientRect().height > 0).length);

test("filtros da lista escondem na tela o que não bate", async () => {
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.click("#btnModoAvancado");
  await pagina.waitForSelector("#listaConex .conex-row");

  await pagina.fill("#filtroEquip", "olt");
  assert.equal(await naTela(pagina, "#listaEquip .equip-card"), 1);
  assert.equal(await pagina.textContent("#contagemEquip"), "1 de 3");
  await pagina.fill("#filtroEquip", "10.0.0");
  assert.equal(await naTela(pagina, "#listaEquip .equip-card"), 2, "filtra por IP");
  await pagina.fill("#filtroEquip", "sala 2");
  assert.equal(await naTela(pagina, "#listaEquip .equip-card"), 1, "filtra por grupo");
  await pagina.fill("#filtroEquip", "");
  assert.equal(await naTela(pagina, "#listaEquip .equip-card"), 3);

  await pagina.fill("#filtroConex", "fibra");
  assert.equal(await naTela(pagina, "#listaConex .conex-row"), 1);
  assert.equal(await pagina.textContent("#contagemConex"), "1 de 2");
  await pagina.fill("#filtroConex", "RB-BORDA");
  assert.equal(await naTela(pagina, "#listaConex .conex-row"), 1, "filtra pelo nome do equipamento");
  await pagina.fill("#filtroConex", "nada-assim");
  assert.equal(await naTela(pagina, "#listaConex .conex-row"), 0);
  assert.match(await pagina.textContent("#listaConex .lista-vazia-filtro"), /Nada encontrado/);
  await pagina.fill("#filtroConex", "");
  assert.equal(await naTela(pagina, "#listaConex .conex-row"), 2);

  // Sem texto solto na seção (havia um "E" perdido depois do formulário).
  assert.equal(await pagina.evaluate(() => [...document.getElementById("secaoConex").childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length), 0);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
