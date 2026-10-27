// Editor num navegador de verdade: diagrama, formulários, PDF e celular.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

test("desenha o diagrama do projeto salvo, sem erros", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  assert.equal(await pagina.locator("#canvas svg g.node").count(), 6);
  assert.ok(await pagina.locator("#canvas svg g.edge").count() >= 5);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("adicionar equipamento pela barra lateral aparece no diagrama", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.fill("#navEquipNome", "Switch Teste");
  await pagina.fill("#navEquipIp", "10.9.9.9");
  await pagina.click('#navEquipForm button[type="submit"]');
  await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {}); // ficha do equipamento
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas svg g.node").length === 7, null, { timeout: 20000 });
  assert.match(await pagina.textContent("#canvas svg"), /Switch Teste/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("exporta um PDF válido", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  await pagina.click("#btnExportarMenu");
  await pagina.click("#btnPaginaPdf");
  await pagina.waitForSelector("#btnExportarPdf:not([disabled])", { timeout: 30000 });
  const download = pagina.waitForEvent("download", { timeout: 60000 });
  await pagina.evaluate(() => document.getElementById("btnExportarPdf").click());
  const arquivo = await (await download).createReadStream();
  const partes = [];
  for await (const p of arquivo) partes.push(p);
  const pdf = Buffer.concat(partes);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 10000, "PDF pequeno demais: " + pdf.length + " bytes");
  assert.match(pdf.subarray(-1024).toString("latin1"), /%%EOF/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("celular: editor sem rolagem para os lados e menu abre", async () => {
  const pagina = await abrirPagina(navegador, site, { celular: true });
  await esperarDiagrama(pagina);
  const fora = await pagina.evaluate(() => [...document.querySelectorAll("body *")].filter(el => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width && st.display !== "none" && st.visibility !== "hidden" && r.right > innerWidth + 1 && !el.closest("#canvas");
  }).map(el => el.id || el.className).slice(0, 10));
  assert.deepEqual(fora, []);
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("menu da conta: inicial do e-mail, abre a janela Minha conta e fecha com Esc", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  assert.equal(await pagina.textContent("#contaMenuBotao .conta-avatar"), "T");
  assert.equal(await pagina.getAttribute("#cloudStatus", "data-estado") !== null, true);
  await pagina.click("#contaMenuBotao");
  await pagina.waitForSelector("#contaMenuLista", { state: "visible" });
  assert.equal(await pagina.getAttribute("#contaMenuBotao", "aria-expanded"), "true");
  assert.match(await pagina.textContent("#contaMenuLista"), /teste@grafo/);
  await pagina.click("#accountOpen");
  await pagina.waitForSelector("#contaMenuLista", { state: "hidden" });
  await pagina.waitForSelector("#contaModal", { state: "visible" });
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("#contaModal", { state: "hidden" });
  // Foco volta ao botão da conta (visível), não ao item do menu fechado.
  assert.equal(await pagina.evaluate(() => document.activeElement.id), "contaMenuBotao");

  // Teclado: seta para baixo abre e foca o primeiro item; Esc fecha e volta ao botão.
  await pagina.focus("#contaMenuBotao");
  await pagina.keyboard.press("ArrowDown");
  await pagina.waitForFunction(() => document.activeElement.id === "accountOpen");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("#contaMenuLista", { state: "hidden" });
  // Clique fora fecha.
  await pagina.click("#contaMenuBotao");
  await pagina.waitForSelector("#contaMenuLista", { state: "visible" });
  await pagina.mouse.click(700, 500);
  await pagina.waitForSelector("#contaMenuLista", { state: "hidden" });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("barra do diagrama: menus Exportar, Organizar (sentido) e Tema", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  // Exportar ▾ → PNG baixa um arquivo.
  await pagina.click("#btnExportarMenu");
  await pagina.waitForSelector("#menuExportar", { state: "visible" });
  const download = pagina.waitForEvent("download", { timeout: 30000 });
  await pagina.click("#btnBaixarPng");
  assert.match((await download).suggestedFilename(), /\.png$/);
  await pagina.waitForSelector("#menuExportar", { state: "hidden" });

  // Organizar ▾ → "Cima → Baixo" muda o select que o app lê e fica marcado.
  await pagina.click("#btnLayoutMenu");
  await pagina.click('#menuLayout [data-valor="TB"]');
  assert.equal(await pagina.inputValue("#direcao"), "TB");
  assert.equal(await pagina.evaluate(() => localStorage.getItem("grafo-direcao")), "TB");
  await pagina.click("#btnLayoutMenu");
  assert.equal(await pagina.getAttribute('#menuLayout [data-valor="TB"]', "aria-checked"), "true");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("#menuLayout", { state: "hidden" });
  assert.equal(await pagina.evaluate(() => document.activeElement.id), "btnLayoutMenu");

  // Tema ▾ → Escuro: aplica o tema e o ícone vira a lua.
  await pagina.click("#temaMenuBotao");
  await pagina.click('#menuTema [data-valor="dark"]');
  assert.equal(await pagina.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
  assert.equal(await pagina.getAttribute("#temaMenuBotao", "data-icone"), "tema-escuro");
  // Teclado: seta para baixo abre e vai para o primeiro item.
  await pagina.focus("#temaMenuBotao");
  await pagina.keyboard.press("ArrowDown");
  await pagina.waitForFunction(() => document.activeElement.getAttribute("data-valor") === "auto");
  await pagina.keyboard.press("Enter");
  assert.equal(await pagina.getAttribute("#temaMenuBotao", "data-icone"), "tema-auto");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("menu lateral: formulário abre deslizando e o menu recolhido mostra legendas", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  assert.equal(await pagina.isVisible("#navEquipNome"), false);
  await pagina.click('[data-nav-panel="navAddEquip"]');
  await pagina.waitForFunction(() => document.getElementById("navAddEquip").getBoundingClientRect().height > 200);
  assert.equal(await pagina.isVisible("#navEquipNome"), true);
  await pagina.click('#navAddEquip [data-nav-close]');
  await pagina.waitForFunction(() => document.getElementById("navAddEquip").getBoundingClientRect().height < 1);
  // Fechado, os campos saem também do alcance do teclado (visibility: hidden).
  await pagina.waitForSelector("#navEquipNome", { state: "hidden", timeout: 2000 });

  await pagina.click("#btnSidebarCollapse");
  await pagina.waitForFunction(() => document.querySelector(".sidebar").classList.contains("collapsed"));
  await pagina.hover("#btnEtiquetas");
  await pagina.waitForSelector(".nav-legenda.visivel");
  assert.equal(await pagina.textContent(".nav-legenda"), "Etiquetas com QR code");
  await pagina.context().close();
});

test("menu lateral: seção fecha pelo título, continua fechada ao recarregar e o recolhido mostra tudo", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const titulo = ".nav-section:has(#btnEtiquetas) > .nav-label";
  assert.equal(await pagina.getAttribute(titulo, "aria-expanded"), "true");
  await pagina.click(titulo);
  assert.equal(await pagina.getAttribute(titulo, "aria-expanded"), "false");
  assert.equal(await pagina.isVisible("#btnEtiquetas"), false);
  await pagina.reload();
  await esperarDiagrama(pagina);
  assert.equal(await pagina.isVisible("#btnEtiquetas"), false, "continua fechada");
  // Recolhido, todos os ícones aparecem, mesmo os de seção fechada.
  await pagina.click("#btnSidebarCollapse");
  await pagina.waitForFunction(() => document.querySelector(".sidebar").classList.contains("collapsed"));
  assert.equal(await pagina.isVisible("#btnEtiquetas"), true);
  await pagina.click("#btnSidebarCollapse");
  await pagina.click(titulo);
  assert.equal(await pagina.isVisible("#btnEtiquetas"), true);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("quadro de símbolos: todos os tipos na lista, com ícone, e o tipo certo para cada nome", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const tipos = await pagina.$$eval("#tipos-sugeridos option", l => l.map(o => o.value));
  for (const t of ["Volt POP Protect", "RB / CCR", "Switch", "Retificador", "Câmera", "Nobreak", "Conversor de fibra", "Concentrador Hotspot", "CX",
    "Decoder", "DIO", "AP WiFi", "OLT", "ONU", "POE", "UniFi", "NVR", "Servidor", "DWDM", "MUX", "DEMUX", "Ar condicionado", "Bateria",
    "Switch POE", "Conversor de mídia", "Controle de acesso", "Aligera", "Dream Machine", "Nuvem VPLS"]) assert.ok(tipos.includes(t), t + " na lista de tipos");
  // Outros nomes do mesmo equipamento não repetem na lista (VOLT = Volt POP Protect).
  for (const t of ["VOLT", "UPS", "HVAC", "RPS", "AR", "MikroTik", "Camera IP"]) assert.ok(!tipos.includes(t), t + " não deve repetir na lista");
  assert.equal(tipos.length, 31); // com Splitter e CTO (FTTH)
  // Todas as imagens existem.
  const quebradas = await pagina.evaluate(async () => {
    const urls = [...new Set(window.apiEquipamentos.listar().map(t => t.icone).filter(Boolean))];
    const r = await Promise.all(urls.map(u => fetch(u).then(x => x.ok ? "" : u)));
    return r.filter(Boolean);
  });
  assert.deepEqual(quebradas, []);
  // Tipo digitado -> ícone: o nome mais específico ganha, e só palavra inteira conta.
  for (const [nome, tipo] of [["SWP-01", "Switch POE 24p"], ["DIO-01", "DIO"], ["RADIO-01", "Rádio"], ["DMX-01", "DEMUX"], ["VOLT-01", "VOLT"]]) {
    // O formulário fecha depois de adicionar.
    await pagina.click('[data-nav-panel="navAddEquip"]');
    await pagina.waitForSelector("#navEquipNome", { state: "visible" });
    await pagina.fill("#navEquipNome", nome);
    await pagina.fill("#navEquipTipo", tipo);
    await pagina.click('#navEquipForm button[type="submit"]');
    await pagina.locator("#fichaModal:not(.hidden) .modal-actions [data-ficha-fechar]").click({ timeout: 3000 }).catch(() => {}); // ficha do equipamento
    await pagina.waitForFunction(n => document.getElementById("canvas").textContent.includes(n), nome, { timeout: 20000 });
  }
  const icone = await pagina.evaluate(() => {
    const projetos = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0)));
    const atual = Object.values(projetos).find(p => p.equipamentos.some(e => e.nome === "SWP-01"));
    return Object.fromEntries(atual.equipamentos.map(e => [e.nome, (e.icone || "").split("/").pop()]));
  });
  assert.equal(icone["SWP-01"], "SWITCH-POE.png");
  assert.equal(icone["DIO-01"], "DIO.png");
  assert.notEqual(icone["RADIO-01"], "DIO.png");
  assert.equal(icone["DMX-01"], "DEMUX.png");
  assert.equal(icone["VOLT-01"], "VOLT.png");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("projeto salvo com os ícones antigos (.jpeg) abre com os novos, sem fundo (.png)", async () => {
  const projetos = { "Antigo": { equipamentos: [
    { id: "a", nome: "OLT-ANTIGA", tipo: "OLT", icone: "./assets/images/OLT.jpeg" },
    { id: "b", nome: "NB-ANTIGO", tipo: "UPS", icone: "", imagem: "./assets/images/NOBREAK.jpeg" },
    // Caminho de antes da pasta assets/images/equipamentos/.
    { id: "c", nome: "SW-ANTIGO", tipo: "Switch", icone: "./assets/images/SWITCH.png" }
  ], conexoes: [] } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => document.querySelectorAll("#canvas svg image").length >= 3, null, { timeout: 20000 });
  const hrefs = await pagina.$$eval("#canvas svg image", l => l.map(i => i.getAttribute("href") || i.getAttribute("xlink:href")));
  assert.ok(hrefs.some(h => /\/equipamentos\/OLT\.png$/.test(h)), hrefs.join(", "));
  assert.ok(hrefs.some(h => /\/equipamentos\/NOBREAK\.png$/.test(h)), hrefs.join(", "));
  assert.ok(hrefs.some(h => /\/equipamentos\/SWITCH\.png$/.test(h)), hrefs.join(", "));
  // As imagens existem de verdade.
  const quebradas = await pagina.evaluate(async hs => (await Promise.all(hs.map(h => fetch(h).then(r => r.ok ? "" : h)))).filter(Boolean), hrefs);
  assert.deepEqual(quebradas, []);
  assert.ok(!hrefs.some(h => /\.jpeg$/.test(h)), "nenhum .jpeg");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("JSON e CSV fica na seção Integração da barra lateral (e não mais em Editar em lista)", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  assert.equal(await pagina.$("#painelDados #jsonAvancado"), null, "saiu de Editar em lista");
  assert.ok(await pagina.$('.nav-section:has([data-nav-panel="navNetbox"]) [data-nav-panel="navJsonCsv"]'), "item na seção Integração");
  assert.ok(await pagina.$("#menuExportar #btnExportarProjeto"), "Exportar projeto fica no menu Exportar");
  await pagina.click('[data-nav-panel="navJsonCsv"]');
  await pagina.waitForSelector("#jsonAvancado", { state: "visible" });
  const json = JSON.parse(await pagina.inputValue("#jsonAvancado"));
  assert.ok(json.equipamentos.length > 0, "mostra o projeto atual");
  json.equipamentos[0].nome = "NOME-PELO-JSON";
  await pagina.fill("#jsonAvancado", JSON.stringify(json));
  await pagina.click("#btnAplicarJson");
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("NOME-PELO-JSON"), null, { timeout: 20000 });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Exportar projeto (.json) leva as anotações; importar o arquivo traz de volta", async () => {
  const projetos = { "Com notas": { equipamentos: [{ id: "a", nome: "SW-1", tipo: "Switch" }], conexoes: [],
    anotacoes: [{ id: "n1", texto: "Trocar fonte em março", x: 10, y: 10, cor: "#FFF3B0" }] } };
  const pagina = await abrirPagina(navegador, site, { projetos });
  await esperarDiagrama(pagina);
  await pagina.click("#btnExportarMenu"); // fica no menu Exportar da barra do diagrama
  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#btnExportarProjeto")]);
  const arquivo = JSON.parse(require("fs").readFileSync(await download.path(), "utf8"));
  assert.equal(arquivo.anotacoes.length, 1);
  assert.equal(arquivo.anotacoes[0].texto, "Trocar fonte em março");

  await pagina.setInputFiles("#arquivoProjeto", { name: "copia.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(arquivo)) });
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("Trocar fonte em março"), null, { timeout: 20000 });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Importar JSON sem ícone usa a foto do tipo", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const arquivo = { equipamentos: [{ id: "a", nome: "SW-JSON", tipo: "Switch" }, { id: "b", nome: "CACHE-JSON", tipo: "Servidor" }], conexoes: [{ de: "a", para: "b" }] };
  await pagina.setInputFiles("#arquivoProjeto", { name: "sem-icone.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(arquivo)) });
  await pagina.waitForFunction(() => document.getElementById("canvas").textContent.includes("CACHE-JSON"), null, { timeout: 20000 });
  const icones = await pagina.evaluate(() => window.GrafoApp.dadosProjeto(window.GrafoApp.projetoAtual()).equipamentos.map(e => e.icone));
  assert.match(icones[0], /SWITCH.png$/);
  assert.match(icones[1], /SERVIDOR.svg$/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Importar CSV num projeto com conteúdo pergunta antes; Cancelar mantém o projeto", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const antes = await pagina.locator("#canvas svg g.node").count();
  const csv = "origem;destino\r\nNOVO-1;NOVO-2\r\n";
  await pagina.setInputFiles("#arquivoCsv", { name: "novo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await pagina.waitForSelector("#appModal:not(.hidden)");
  assert.match(await pagina.textContent("#modalMessage"), /substitui o projeto aberto/);
  await pagina.click("#appModal [data-modal-cancel]");
  await pagina.waitForTimeout(500);
  assert.equal(await pagina.locator("#canvas svg g.node").count(), antes, "nada mudou");
  assert.ok(!(await pagina.textContent("#canvas")).includes("NOVO-1"));
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Importar projeto e Importar CSV abrem pelo teclado (Tab + Enter)", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  // A escuta vai antes: o Playwright leva um instante para passar a capturar o
  // seletor de arquivos, e um Enter logo em seguida às vezes chegava antes.
  const abertos = [];
  pagina.on("filechooser", s => abertos.push(s));
  await pagina.waitForTimeout(300);
  await pagina.click("#btnExportarMenu"); // Importar projeto fica no menu Exportar
  await pagina.focus('label[data-botao-arquivo]:has(#arquivoProjeto)');
  await pagina.keyboard.press("Enter");
  await assert.doesNotReject(async () => { for (let t = 0; !abertos.length; t++) { if (t > 50) throw new Error("seletor não abriu"); await pagina.waitForTimeout(100); } });
  assert.equal(await abertos[0].element().getAttribute("id"), "arquivoProjeto");
  await pagina.click('[data-nav-panel="navJsonCsv"]');
  await pagina.waitForSelector("label[data-botao-arquivo]:has(#arquivoCsv)", { state: "visible" });
  await pagina.focus("label[data-botao-arquivo]:has(#arquivoCsv)");
  await pagina.keyboard.press(" ");
  await assert.doesNotReject(async () => { for (let t = 0; abertos.length < 2; t++) { if (t > 50) throw new Error("seletor não abriu"); await pagina.waitForTimeout(100); } });
  assert.equal(await abertos[1].element().getAttribute("id"), "arquivoCsv");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("tamanho do equipamento: + e − nos selecionados, A+/A− na barra e o controle do editor", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 } });
  await esperarDiagrama(pagina);
  const largura = () => pagina.evaluate(() => {
    const no = [...document.querySelectorAll("#canvas svg g.node")].find(g => g.textContent.includes("OLT-Centro"));
    return no.getBBox().width * no.getBBox().height;
  });
  const salvo = () => pagina.evaluate(() => {
    const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
    const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
    return JSON.parse(localStorage.getItem(chave))[atual].equipamentos.find(e => e.nome === "OLT-Centro").tamanho;
  });
  const antes = await largura();
  await pagina.click("#canvas");
  await pagina.keyboard.press("Control+a");
  await pagina.keyboard.press("+");
  await pagina.keyboard.press("+");
  await pagina.waitForFunction(a => {
    const no = [...document.querySelectorAll("#canvas svg g.node")].find(g => g.textContent.includes("OLT-Centro"));
    return no && no.getBBox().width * no.getBBox().height > a * 1.1;
  }, antes, { timeout: 20000 });
  assert.equal(await salvo(), 120);
  await pagina.click('[data-selecao="menor"]');
  await pagina.waitForFunction(() => {
    const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
    const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
    return JSON.parse(localStorage.getItem(chave))[atual].equipamentos.find(e => e.nome === "OLT-Centro").tamanho === 110;
  });
  // Editor: o controle mostra o tamanho atual.
  await pagina.keyboard.press("Escape");
  const no = pagina.locator("#canvas g.node", { hasText: "OLT-Centro" }).first();
  await no.dblclick();
  await pagina.waitForSelector("#editEquipTamanho", { state: "visible" });
  assert.equal(await pagina.inputValue("#editEquipTamanho"), "110");
  await pagina.click('[data-tamanho-passo="-10"]');
  assert.equal(await pagina.textContent("#editEquipTamanhoValor"), "100%");
  await pagina.click('#editorEquipForm button[type="submit"], #editorEquipForm .primary');
  await pagina.waitForFunction(() => {
    const chave = Object.keys(localStorage).find(k => k.indexOf("grafo-projetos") === 0);
    const atual = localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf("grafo-projeto-atual") === 0));
    return JSON.parse(localStorage.getItem(chave))[atual].equipamentos.find(e => e.nome === "OLT-Centro").tamanho === undefined;
  });
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
