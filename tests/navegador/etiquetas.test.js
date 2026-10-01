// Etiquetas com QR code (assets/js/etiquetas.js) num navegador de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

async function baixarEtiquetas(pagina, tamanho) {
  await pagina.waitForFunction(() => window.GrafoEtiquetas);
  await pagina.click("#btnEtiquetas");
  await pagina.waitForSelector("#etiquetasModal:not(.hidden)");
  assert.equal(await pagina.textContent("#etiquetasQtdEquip"), "(6)");
  assert.equal(await pagina.textContent("#etiquetasQtdCabos"), "(10)");
  if (tamanho) await pagina.selectOption("#etiquetasTamanho", tamanho);
  const download = pagina.waitForEvent("download", { timeout: 60000 });
  await pagina.click("#etiquetasGerar");
  const arquivo = await download;
  const partes = [];
  for await (const p of await arquivo.createReadStream()) partes.push(p);
  await pagina.waitForSelector("#etiquetasModal", { state: "hidden" });
  return { nome: arquivo.suggestedFilename(), pdf: Buffer.concat(partes) };
}

test("gera o PDF de etiquetas e o QR code lido leva ao equipamento", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const { nome, pdf } = await baixarEtiquetas(pagina);
  assert.match(nome, /etiquetas\.pdf$/);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");

  // Renderiza a 1ª página (pdf.js) e lê um QR code (jsQR), numa página de teste à parte.
  const leitor = await navegador.newPage();
  await leitor.goto(site.url + "/__vazio");
  await leitor.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js" });
  await leitor.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js" });
  const lido = await leitor.evaluate(async b64 => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }).promise;
    const pagina = await pdf.getPage(1);
    const vp = pagina.getViewport({ scale: 4 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext("2d");
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    // Só a primeira etiqueta (canto superior esquerdo): 63,5 × 38,1 mm a partir de (7,2; 15,15).
    const mm = vp.width / 210;
    const img = ctx.getImageData(Math.round(7.2 * mm), Math.round(15.15 * mm), Math.round(63.5 * mm), Math.round(38.1 * mm));
    const texto = (await pagina.getTextContent()).items.map(i => i.str).join(" | ");
    const qr = jsQR(img.data, img.width, img.height);
    return { qr: qr && qr.data, texto, paginas: pdf.numPages };
  }, pdf.toString("base64"));
  await leitor.close();
  assert.equal(lido.paginas, 1);
  assert.match(lido.texto, /OLT-Centro/);
  assert.match(lido.texto, /10\.0\.0\.1/);
  assert.match(lido.texto, /Switch N.cleo/);
  // Primeira etiqueta, por ordem alfabética: "OLT-Centro" (id e0).
  assert.equal(lido.qr, site.url + "/?abrir=e0&projeto=" + encodeURIComponent("Projeto Ação"));

  // Abrir o endereço do QR code: mostra o equipamento e limpa o endereço.
  await pagina.goto(lido.qr);
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => document.getElementById("editEquipNome") && document.getElementById("editEquipNome").value === "OLT-Centro", null, { timeout: 15000 });
  assert.equal(new URL(pagina.url()).search, "");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("etiqueta pequena (65 por folha) e endereço de equipamento que não existe", async () => {
  const pagina = await abrirPagina(navegador, site);
  await esperarDiagrama(pagina);
  const { pdf } = await baixarEtiquetas(pagina, "65");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await pagina.goto(site.url + "/?abrir=nao-existe&projeto=Projeto%20A%C3%A7%C3%A3o");
  await esperarDiagrama(pagina);
  await pagina.waitForFunction(() => /não encontrado/.test(document.getElementById("toasts").textContent), null, { timeout: 15000 });
  await pagina.context().close();
});
