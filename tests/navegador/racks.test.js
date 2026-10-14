// Bayface de Racks num navegador de verdade: os critérios de aceitação da funcionalidade.
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
const itens = async pagina => (await projetoSalvo(pagina)).racks[0].itens.map(i => i.nome + "@" + i.u + "+" + i.alturaU).sort();
const mensagem = pagina => pagina.textContent(".rk-msg");

async function adicionarNaU(pagina, u, categoria, nome, alturaU) {
  await pagina.click('.rk-u-livre[data-u="' + u + '"]');
  await pagina.waitForSelector('[data-rk-form="novo"]');
  await pagina.selectOption('[data-rk-form="novo"] select[name=categoria]', categoria);
  await pagina.fill('[data-rk-form="novo"] input[name=nome]', nome);
  await pagina.fill('[data-rk-form="novo"] input[name=alturaU]', String(alturaU));
  await pagina.click('[data-rk-form="novo"] button[type=submit]');
}

test("bayface: cria rack 42U, instala, move, impede sobreposição e limite, remove, persiste, exporta", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);

  // 1. Projeto novo do tipo Bayface de Racks.
  await pagina.click("#btnNovoProjeto");
  await pagina.waitForSelector("#novoProjetoModal:not(.hidden)");
  await pagina.fill("#novoProjetoNome", "POP Centro - Racks");
  await pagina.click(".modo-opcao:has(input[value=racks])");
  await pagina.click('#novoProjetoForm button[type="submit"]');
  await pagina.waitForSelector("#racksApp:not([hidden])");
  assert.equal(await pagina.isVisible("#canvas"), false, "o diagrama lógico fica escondido");
  assert.equal((await projetoSalvo(pagina)).modo, "racks");

  // 2. Rack de 42U.
  await pagina.click('.rk-palco-vazio [data-rk="novo-rack"]');
  await pagina.waitForSelector(".rk-svg");
  assert.equal(await pagina.locator(".rk-u-livre").count(), 42);
  assert.match(await pagina.textContent("[data-rk-titulo]"), /RACK-01 0\/42U ocupadas/);

  // 3-5. Switch 1U, servidor 2U e um equipamento de 4U.
  await adicionarNaU(pagina, 40, "switch", "SW-CORE", 1);
  await adicionarNaU(pagina, 30, "servidor", "SRV-01", 2);
  await adicionarNaU(pagina, 10, "nobreak", "UPS-01", 4);
  assert.deepEqual(await itens(pagina), ["SRV-01@30+2", "SW-CORE@40+1", "UPS-01@10+4"]);
  assert.match(await pagina.textContent("[data-rk-titulo]"), /7\/42U ocupadas · 35 livres/);
  assert.equal(await pagina.locator(".rk-u-livre").count(), 35, "as U do equipamento de 4U saem das livres");

  // 6. Mover pelo formulário e arrastando (o servidor desce de U30 para U20).
  await pagina.click('.rk-item[data-item] text:text("SW-CORE")');
  await pagina.fill('[data-rk-form="item"] input[name=u]', "41");
  await pagina.click('[data-rk-form="item"] button[type=submit]');
  await pagina.waitForFunction(() => /movido|salvo/.test(document.querySelector(".rk-msg").textContent));
  // Com a proporção real (1U ≈ 35 px), o rack inteiro só cabe na tela do teste com zoom menor.
  for (let i = 0; i < 3; i++) await pagina.click('[data-rk="zoom-menos"]');
  const srv = pagina.locator('.rk-item:has(text:text("SRV-01")) .rk-item-corpo');
  const caixa = await srv.boundingBox();
  const passoU = caixa.height / 2;
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await pagina.mouse.down();
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2 + passoU * 5, { steps: 8 });
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2 + passoU * 10.4, { steps: 8 });
  await pagina.mouse.up();
  await pagina.waitForFunction(() => /SRV-01 movido para U20/.test(document.querySelector(".rk-msg").textContent));
  assert.deepEqual(await itens(pagina), ["SRV-01@20+2", "SW-CORE@41+1", "UPS-01@10+4"]);

  // 7. Sobreposição é impedida (servidor em cima do nobreak).
  await pagina.click('.rk-item[data-item] text:text("SRV-01")');
  await pagina.fill('[data-rk-form="item"] input[name=u]', "12");
  await pagina.click('[data-rk-form="item"] button[type=submit]');
  assert.match(await mensagem(pagina), /U12–U13 já está ocupada por "UPS-01"/);
  assert.deepEqual(await itens(pagina), ["SRV-01@20+2", "SW-CORE@41+1", "UPS-01@10+4"], "nada mudou");

  // 8. Além do limite do rack.
  await pagina.fill('[data-rk-form="item"] input[name=u]', "42");
  await pagina.click('[data-rk-form="item"] button[type=submit]');
  assert.match(await mensagem(pagina), /passa do topo do rack \(U43 num rack de 42U\)/);

  // 9. Remover libera as unidades.
  pagina.once("dialog", d => d.accept());
  await pagina.click('[data-rk="remover-item"]');
  await pagina.waitForFunction(() => /removido; as unidades ficaram livres/.test(document.querySelector(".rk-msg").textContent));
  assert.equal(await pagina.locator(".rk-u-livre").count(), 37);

  // Portas e cabo físico entre dois equipamentos do rack.
  await adicionarNaU(pagina, 39, "patch", "PP-01", 1);
  await pagina.click('.rk-item[data-item] text:text("SW-CORE")');
  await pagina.selectOption('[data-rk-form="cabo"] select[name=paraItem]', { label: "PP-01 (U39)" });
  await pagina.selectOption('[data-rk-form="cabo"] select[name=paraPorta]', "1");
  await pagina.fill('[data-rk-form="cabo"] input[name=etiqueta]', "CB-001");
  await pagina.click('[data-rk-form="cabo"] button[type=submit]');
  await pagina.waitForFunction(() => /Cabo adicionado/.test(document.querySelector(".rk-msg").textContent));
  assert.equal((await projetoSalvo(pagina)).cabosRack.length, 1);
  assert.match(await pagina.textContent(".rk-lista-cabos"), /1 → RACK-01 \/ PP-01 1/);

  // 11. Vários racks no mesmo projeto.
  await pagina.click('.rk-lado [data-rk="novo-rack"]');
  await pagina.waitForFunction(() => /RACK-02/.test(document.querySelector("[data-rk-titulo]").textContent));
  assert.equal(await pagina.locator(".rk-rack-item").count(), 2);

  // 10. Atualizar a página: tudo continua.
  await pagina.reload();
  await pagina.waitForSelector("#racksApp:not([hidden]) .rk-svg", { timeout: 45000 });
  const salvo = await projetoSalvo(pagina);
  assert.equal(salvo.racks.length, 2);
  assert.deepEqual(salvo.racks[0].itens.map(i => i.nome + "@" + i.u).sort(), ["PP-01@39", "SW-CORE@41", "UPS-01@10"]);
  assert.equal(salvo.cabosRack[0].etiqueta, "CB-001");

  // 12. Exportar: PNG, SVG, PDF e relatório.
  await pagina.click('.rk-rack-item:has-text("RACK-01")');
  for (const [acao, padrao] of [["png", /^rack-01-\d{4}-\d\d-\d\d\.png$/], ["svg", /^rack-01-.*\.svg$/], ["pdf", /^rack-01-.*\.pdf$/], ["relatorio", /^pop-centro-racks-racks-.*\.xlsx$/]]) {
    const [download] = await Promise.all([pagina.waitForEvent("download", { timeout: 60000 }), pagina.click('[data-rk="' + acao + '"]')]).catch(async e => { throw new Error(acao + ": " + await mensagem(pagina) + " | " + pagina.erros.join(" ; ")); });
    assert.match(download.suggestedFilename(), padrao, acao);
  }
  const svg = await pagina.evaluate(async () => {
    const [d] = await Promise.all([new Promise(r => { const orig = window.GrafoApp.baixarArquivo; window.GrafoApp.baixarArquivo = (b) => { window.GrafoApp.baixarArquivo = orig; b.text().then(r); }; }),
      document.querySelector('[data-rk="svg"]').click()]);
    return d;
  });
  assert.match(svg, /SW-CORE/);
  assert.match(svg, /U livres: /);
  assert.match(svg, /POP Centro - Racks/);

  // 13. O diagrama lógico continua funcionando: volta pelo seletor de tipo.
  await pagina.selectOption("#modoDiagrama", "topologia");
  await pagina.waitForSelector("#racksApp[hidden]", { state: "attached" });
  assert.equal(await pagina.isVisible("#canvas"), true);
  assert.equal((await projetoSalvo(pagina)).racks.length, 2, "os racks continuam guardados");

  assert.deepEqual(pagina.erros, []);
});

test("bayface: arrastar da biblioteca e tela estreita", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 900, height: 900 } });
  await esperarDiagrama(pagina);
  await pagina.selectOption("#modoDiagrama", "racks");
  await pagina.click('.rk-palco-vazio [data-rk="novo-rack"]');
  await pagina.waitForSelector(".rk-svg");
  // Arrasta "Switch" para a U38 (HTML5 drag and drop; visível junto com a biblioteca).
  const alvo = pagina.locator('.rk-u-livre[data-u="38"]');
  await pagina.locator('.rk-peca[data-categoria="switch"]').dragTo(alvo);
  await pagina.waitForFunction(() => /instalado em U38/.test(document.querySelector(".rk-msg").textContent));
  // Clique numa peça com uma U selecionada instala ali.
  await pagina.click('.rk-u-livre[data-u="20"]');
  await pagina.click('.rk-peca[data-categoria="dwdm"]');
  await pagina.waitForFunction(() => /instalado em U20–U21/.test(document.querySelector(".rk-msg").textContent));
  // Foto real do painel: recortada no formato do equipamento, aparece no desenho e fica salva.
  await pagina.click('.rk-item[data-item] text:text("Switch 1")');
  const png = await pagina.evaluate(() => { const c = document.createElement("canvas"); c.width = 800; c.height = 120; const x = c.getContext("2d"); x.fillStyle = "#333"; x.fillRect(0, 0, 800, 120); return c.toDataURL("image/png").split(",")[1]; });
  await pagina.setInputFiles("[data-rk-foto]", { name: "frente.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await pagina.waitForFunction(() => /Foto de Switch 1 salva/.test(document.querySelector(".rk-msg").textContent));
  assert.equal(await pagina.locator(".rk-svg image.rk-foto").count(), 1);
  // Foto 800x120 tem proporção de ~2U: a altura do equipamento se ajusta em vez de cortar.
  assert.equal(await pagina.evaluate(() => window.GrafoRacks.dados().racks[0].itens.find(i => i.foto).alturaU), 2);
  assert.match(await pagina.evaluate(() => window.GrafoRacks.dados().racks[0].itens.find(i => i.foto).foto.slice(0, 23)), /^data:image\/jpeg;base64,/);
  await pagina.click('[data-rk="fotos"]');
  assert.equal(await pagina.locator(".rk-svg image.rk-foto").count(), 0, "botão Fotos esconde");
  await pagina.click('[data-rk="fotos"]');
  // Catálogo de modelos reais: busca, clique instala com fabricante, modelo, altura e portas.
  await pagina.fill("[data-rk-busca-modelo]", "r720xd");
  await pagina.click('.rk-modelos .rk-peca');
  await pagina.waitForFunction(() => /PowerEdge R720xd 1 instalado/.test(document.querySelector(".rk-msg").textContent));
  const r720 = await pagina.evaluate(() => window.GrafoRacks.dados().racks[0].itens.find(i => i.modelo === "PowerEdge R720xd"));
  assert.equal(r720.fabricante, "Dell"); assert.equal(r720.alturaU, 2); assert.equal(r720.categoria, "servidor");
  assert.match(r720.foto || "", /^data:image\/jpeg;base64,/, "foto real do catálogo vem junto");
  await pagina.fill("[data-rk-busca-modelo]", "");
  // Nomes ao lado do rack, com seta (estilo planta de datacenter).
  await pagina.click('[data-rk="nomes"]');
  assert.equal(await pagina.locator(".rk-svg .rk-nome-lado").count(), 3);
  await pagina.click('[data-rk="nomes"]');
  // Sem rolagem horizontal da página em tela menor.
  const sobra = await pagina.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return [];
    return [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed")
      .slice(0, 5).map(e => (e.id || String(e.className && e.className.baseVal != null ? e.className.baseVal : e.className)).slice(0, 40) + " " + Math.round(e.getBoundingClientRect().right));
  });
  assert.deepEqual(sobra, [], "sem rolagem horizontal da página");
  assert.deepEqual(pagina.erros, []);
});
