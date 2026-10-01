  // ==== 12-pagina-e-pdf.js: página, prévia e PDF; inicialização do editor (parte de assets/js/app.js; npm run montar) ====
  // ---- Página, área de desenho e PDF ------------------------------------------
  // Barra lateral direita. A configuração vale para a conta neste navegador.
  var FORMATOS_PAGINA = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210] };
  var ESCALAS_PAGINA = ["ajustar", "25", "50", "75", "100", "150", "200"];
  var PAGINA_PADRAO = { formato: "A4", orientacao: "paisagem", escala: "ajustar", margem: 10, moldura: true,
    areaLargura: LIMITE_CANVAS.maxX - LIMITE_CANVAS.minX, areaAltura: LIMITE_CANVAS.maxY - LIMITE_CANVAS.minY };
  var MM_POR_PT = 25.4 / 72;   // o viewBox do Graphviz é em pt
  var DPI_PDF = 200;           // resolução alvo das imagens no PDF
  var MAX_PAGINAS_PDF = 60;
  var elPainelPagina = document.getElementById("painelPagina");
  var btnPaginaPdf = document.getElementById("btnPaginaPdf");
  var btnExportarPdf = document.getElementById("btnExportarPdf");
  var elPrevia = document.getElementById("previaPagina");
  var elPreviaResumo = document.getElementById("previaResumo");
  var campoPagina = {
    areaLargura: document.getElementById("areaLargura"),
    areaAltura: document.getElementById("areaAltura"),
    formato: document.getElementById("paginaFormato"),
    escala: document.getElementById("paginaEscala"),
    margem: document.getElementById("paginaMargem"),
    moldura: document.getElementById("paginaMoldura")
  };

  function limitarNumero(valor, min, max, padrao) {
    var n = Math.round(Number(valor));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  }

  function normalizarConfigPagina(bruto) {
    var c = Object.assign({}, PAGINA_PADRAO, bruto && typeof bruto === "object" ? bruto : {});
    if (!FORMATOS_PAGINA[c.formato]) c.formato = PAGINA_PADRAO.formato;
    if (c.orientacao !== "retrato" && c.orientacao !== "paisagem") c.orientacao = PAGINA_PADRAO.orientacao;
    if (ESCALAS_PAGINA.indexOf(String(c.escala)) < 0) c.escala = PAGINA_PADRAO.escala;
    c.escala = String(c.escala);
    c.margem = limitarNumero(c.margem, 0, 40, PAGINA_PADRAO.margem);
    c.moldura = c.moldura !== false;
    c.areaLargura = limitarNumero(c.areaLargura, 1000, 20000, PAGINA_PADRAO.areaLargura);
    c.areaAltura = limitarNumero(c.areaAltura, 1000, 20000, PAGINA_PADRAO.areaAltura);
    return c;
  }

  var configPagina = (function () {
    try { return normalizarConfigPagina(JSON.parse(localStorage.getItem(window.GrafoAuth.storageKey("grafo-pagina")) || "null")); }
    catch (e) { return normalizarConfigPagina(null); }
  })();

  function salvarConfigPagina() {
    try { localStorage.setItem(window.GrafoAuth.storageKey("grafo-pagina"), JSON.stringify(configPagina)); } catch (e) {}
  }

  // Área de desenho centrada na origem: limita o deslocamento dos equipamentos.
  function aplicarAreaDeDesenho() {
    LIMITE_CANVAS.minX = -configPagina.areaLargura / 2;
    LIMITE_CANVAS.maxX = configPagina.areaLargura / 2;
    LIMITE_CANVAS.minY = -configPagina.areaAltura / 2;
    LIMITE_CANVAS.maxY = configPagina.areaAltura / 2;
  }

  function preencherFormPagina() {
    campoPagina.areaLargura.value = configPagina.areaLargura;
    campoPagina.areaAltura.value = configPagina.areaAltura;
    campoPagina.formato.value = configPagina.formato;
    campoPagina.escala.value = configPagina.escala;
    campoPagina.margem.value = configPagina.margem;
    campoPagina.moldura.checked = configPagina.moldura;
    document.querySelectorAll('input[name="paginaOrientacao"]').forEach(function (r) { r.checked = r.value === configPagina.orientacao; });
  }

  function tamanhoPaginaMm() {
    var f = FORMATOS_PAGINA[configPagina.formato];
    return configPagina.orientacao === "retrato" ? { w: f[0], h: f[1] } : { w: f[1], h: f[0] };
  }

  // Como o desenho (larguraVb × alturaVb, em pt) cabe no papel. "Ajustar" põe
  // tudo numa página; escala fixa divide em várias páginas, sem cortar nada.
  function planoDeImpressao(larguraVb, alturaVb) {
    var pg = tamanhoPaginaMm();
    var m = Math.min(configPagina.margem, pg.w / 4, pg.h / 4);
    var areaW = pg.w - 2 * m, areaH = pg.h - 2 * m;
    var baseW = larguraVb * MM_POR_PT, baseH = alturaVb * MM_POR_PT;
    var ajustar = configPagina.escala === "ajustar";
    var escala = ajustar ? Math.min(areaW / baseW, areaH / baseH) : Number(configPagina.escala) / 100;
    var larguraMm = baseW * escala, alturaMm = baseH * escala;
    var colunas = ajustar ? 1 : Math.max(1, Math.ceil(larguraMm / areaW - 1e-6));
    var linhas = ajustar ? 1 : Math.max(1, Math.ceil(alturaMm / areaH - 1e-6));
    return { pagina: pg, margem: m, areaW: areaW, areaH: areaH, escala: escala, larguraMm: larguraMm, alturaMm: alturaMm,
      colunas: colunas, linhas: linhas, total: colunas * linhas };
  }

  // Recorta o desenho rasterizado em páginas: [{ canvas, x, y, w, h }] em mm na folha.
  function paginasDoPlano(canvas, plano) {
    var paginas = [];
    var pxPorMm = canvas.width / plano.larguraMm;
    for (var lin = 0; lin < plano.linhas; lin++) {
      for (var col = 0; col < plano.colunas; col++) {
        var xMm = col * plano.areaW, yMm = lin * plano.areaH;
        var wMm = Math.min(plano.areaW, plano.larguraMm - xMm), hMm = Math.min(plano.areaH, plano.alturaMm - yMm);
        var pedaco = canvas;
        if (plano.total > 1) {
          pedaco = document.createElement("canvas");
          pedaco.width = Math.max(1, Math.round(wMm * pxPorMm));
          pedaco.height = Math.max(1, Math.round(hMm * pxPorMm));
          pedaco.getContext("2d").drawImage(canvas, Math.round(xMm * pxPorMm), Math.round(yMm * pxPorMm), pedaco.width, pedaco.height, 0, 0, pedaco.width, pedaco.height);
        }
        // Uma página só: centraliza na área útil.
        var x = plano.margem + (plano.total === 1 ? (plano.areaW - wMm) / 2 : 0);
        var y = plano.margem + (plano.total === 1 ? (plano.areaH - hMm) / 2 : 0);
        paginas.push({ canvas: pedaco, x: x, y: y, w: wMm, h: hMm });
      }
    }
    return paginas;
  }

  function descreverPlano(plano) {
    var pg = plano.pagina;
    var partes = [configPagina.formato + " " + configPagina.orientacao + " · " + Math.round(pg.w) + " × " + Math.round(pg.h) + " mm",
      "escala " + Math.round(plano.escala * 100) + "%", plural(plano.total, "página", "páginas")];
    return partes.join(" · ");
  }

  // ---- Prévia -----------------------------------------------------------------
  var LARGURA_PREVIA = 236;  // px da miniatura de uma página
  var timerPrevia = null;
  var geracaoPrevia = 0;

  function painelPaginaAberto() { return !elPainelPagina.hidden; }

  function solicitarPrevia() {
    // Pode ser chamada por gerar() antes deste trecho inicializar.
    if (!elPainelPagina || !painelPaginaAberto()) return;
    clearTimeout(timerPrevia);
    timerPrevia = setTimeout(atualizarPrevia, 220);
  }

  async function atualizarPrevia() {
    var minha = ++geracaoPrevia;
    var temDiagrama = !!elCanvas.querySelector("svg");
    btnExportarPdf.disabled = !temDiagrama;
    if (!temDiagrama) {
      elPrevia.innerHTML = '<div class="previa-vazia">Adicione equipamentos para ver a prévia.</div>';
      elPreviaResumo.textContent = "";
      return;
    }
    elPrevia.classList.add("carregando");
    try {
      var pg = tamanhoPaginaMm();
      var escalaMiniatura = LARGURA_PREVIA / Math.max(pg.w, pg.h * 0.8); // px por mm na miniatura
      var plano = null;
      var r = await rasterizarDiagrama({ moldura: configPagina.moldura, fundo: "#ffffff", pixelsPorUnidade: function (w, h) {
        plano = planoDeImpressao(w, h);
        return (plano.larguraMm * escalaMiniatura / w) * (window.devicePixelRatio || 1);
      } });
      if (minha !== geracaoPrevia) return; // já há uma prévia mais nova
      var paginas = paginasDoPlano(r.canvas, plano);
      // Várias páginas: grade com até 3 folhas por linha, na ordem de montagem.
      var colunasGrade = paginas.length > 1 ? Math.min(3, Math.max(2, plano.colunas)) : 1;
      var MOSTRAR = colunasGrade * 3;
      elPrevia.innerHTML = "";
      elPrevia.classList.toggle("varias", paginas.length > 1);
      paginas.slice(0, MOSTRAR).forEach(function (p, i) {
        var folha = document.createElement("canvas");
        var dpr = window.devicePixelRatio || 1;
        var escalaFolha = escalaMiniatura / colunasGrade * (colunasGrade > 1 ? 0.9 : 1);
        folha.width = Math.round(pg.w * escalaFolha * dpr);
        folha.height = Math.round(pg.h * escalaFolha * dpr);
        folha.style.width = Math.round(pg.w * escalaFolha) + "px";
        folha.style.height = Math.round(pg.h * escalaFolha) + "px";
        var ctx = folha.getContext("2d");
        var k = escalaFolha * dpr;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, folha.width, folha.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(p.canvas, p.x * k, p.y * k, p.w * k, p.h * k);
        // Margem tracejada: mostra a área útil da folha.
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.strokeStyle = "rgba(20, 44, 60, 0.25)";
        ctx.lineWidth = dpr;
        ctx.strokeRect(plano.margem * k, plano.margem * k, plano.areaW * k, plano.areaH * k);
        folha.className = "previa-folha";
        folha.setAttribute("role", "img");
        folha.setAttribute("aria-label", "Página " + (i + 1) + " de " + paginas.length);
        elPrevia.appendChild(folha);
      });
      if (paginas.length > MOSTRAR) {
        var mais = document.createElement("div");
        mais.className = "previa-mais";
        mais.textContent = "+ " + (paginas.length - MOSTRAR) + " página(s)";
        elPrevia.appendChild(mais);
      }
      var resumo = descreverPlano(plano);
      if (plano.total > MAX_PAGINAS_PDF) resumo += " — acima do máximo de " + MAX_PAGINAS_PDF + "; use uma escala menor.";
      else if (configPagina.escala === "ajustar" && plano.escala < 0.3) resumo += " — o texto pode ficar pequeno; considere um formato maior.";
      elPreviaResumo.textContent = resumo;
      btnExportarPdf.disabled = plano.total > MAX_PAGINAS_PDF;
    } catch (e) {
      if (minha !== geracaoPrevia) return;
      elPrevia.innerHTML = '<div class="previa-vazia">Não foi possível gerar a prévia.</div>';
      elPreviaResumo.textContent = e.message;
    } finally {
      if (minha === geracaoPrevia) elPrevia.classList.remove("carregando");
    }
  }

  // ---- PDF --------------------------------------------------------------------
  // Também guardados no aparelho para exportar sem internet (GrafoApp.arquivosParaGuardar).
  var URL_JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js";
  var URL_SVG2PDF = "https://cdn.jsdelivr.net/npm/svg2pdf.js@2.8.1/dist/svg2pdf.umd.min.js";
  var promessaJsPdf = null;
  function carregarJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!promessaJsPdf) {
      promessaJsPdf = new Promise(function (resolver, rejeitar) {
        var script = document.createElement("script");
        // integrity: o navegador recusa o arquivo se o CDN entregar outro conteúdo.
        script.src = URL_JSPDF;
        script.integrity = "sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3";
        script.crossOrigin = "anonymous";
        script.onload = function () { window.jspdf && window.jspdf.jsPDF ? resolver(window.jspdf.jsPDF) : rejeitar(new Error("jsPDF indisponível.")); };
        script.onerror = function () { promessaJsPdf = null; rejeitar(new Error("Não foi possível carregar o gerador de PDF. Verifique a conexão.")); };
        document.head.appendChild(script);
      });
    }
    return promessaJsPdf;
  }

  // svg2pdf.js acrescenta doc.svg() ao jsPDF: o diagrama entra no PDF como
  // vetor (texto nítido em qualquer zoom, selecionável e pesquisável).
  var promessaSvg2Pdf = null;
  function carregarSvg2Pdf() {
    if (window.svg2pdf && window.svg2pdf.svg2pdf) return Promise.resolve();
    if (!promessaSvg2Pdf) {
      promessaSvg2Pdf = new Promise(function (resolver, rejeitar) {
        var script = document.createElement("script");
        script.src = URL_SVG2PDF;
        script.integrity = "sha384-7hc/mtl4lyRUMzYFqHxwNbYZwh27MESE5AWa2nEuVChLn8bCQcrn18OgGv9uHgzz";
        script.crossOrigin = "anonymous";
        script.onload = function () { window.svg2pdf && window.svg2pdf.svg2pdf ? resolver() : rejeitar(new Error("svg2pdf indisponível.")); };
        script.onerror = function () { promessaSvg2Pdf = null; rejeitar(new Error("Não foi possível carregar o svg2pdf.")); };
        document.head.appendChild(script);
      });
    }
    return promessaSvg2Pdf;
  }

  // As fontes padrão do PDF (Helvetica) só têm os caracteres do Latin-1.
  function textoCabeNaFontePdf(texto) { return /^[ -~ -ÿ\s]*$/.test(texto); }

  // Textos com emoji, setas etc. viram uma imagem pequena no mesmo lugar;
  // o resto do diagrama continua vetorial. O SVG precisa estar no documento
  // (getBBox e estilos calculados).
  function trocarTextosSemFontePorImagem(svg) {
    var ESCALA = 6;
    Array.prototype.slice.call(svg.querySelectorAll("text")).forEach(function (texto) {
      var conteudo = texto.textContent;
      if (!conteudo || textoCabeNaFontePdf(conteudo) || texto.querySelector("tspan")) return;
      var caixa;
      try { caixa = texto.getBBox(); } catch (e) { return; }
      if (!caixa || !caixa.width || !caixa.height) return;
      var estilo = getComputedStyle(texto);
      var tamanho = parseFloat(estilo.fontSize) || 10;
      var canvas = document.createElement("canvas");
      canvas.width = Math.ceil(caixa.width * ESCALA);
      canvas.height = Math.ceil(caixa.height * ESCALA);
      var ctx = canvas.getContext("2d");
      ctx.scale(ESCALA, ESCALA);
      ctx.font = estilo.fontStyle + " " + estilo.fontWeight + " " + tamanho + "px " + estilo.fontFamily;
      ctx.fillStyle = estilo.fill && estilo.fill !== "none" ? estilo.fill : "#000";
      ctx.globalAlpha = Number(estilo.fillOpacity) || 1;
      var ancora = estilo.textAnchor;
      ctx.textAlign = ancora === "middle" ? "center" : ancora === "end" ? "right" : "left";
      ctx.textBaseline = "alphabetic";
      var x = numeroSvg(texto.getAttribute("x")) - caixa.x;
      var y = numeroSvg(texto.getAttribute("y")) - caixa.y;
      ctx.fillText(conteudo, x, y);
      var imagem = document.createElementNS("http://www.w3.org/2000/svg", "image");
      imagem.setAttribute("x", caixa.x);
      imagem.setAttribute("y", caixa.y);
      imagem.setAttribute("width", caixa.width);
      imagem.setAttribute("height", caixa.height);
      var url = canvas.toDataURL("image/png");
      imagem.setAttribute("href", url);
      imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
      if (texto.getAttribute("transform")) imagem.setAttribute("transform", texto.getAttribute("transform"));
      texto.parentNode.replaceChild(imagem, texto);
    });
  }

  // Monta o PDF em vetor. Retorna o jsPDF pronto ou lança erro (o chamador
  // então usa o modo imagem).
  async function montarPdfVetorial(JsPdf) {
    await carregarSvg2Pdf();
    var svgEl = elCanvas.querySelector("svg");
    var preparado = await prepararSvgSeguroParaPng(svgEl);
    var svg = preparado.svg;
    if (configPagina.moldura) adicionarMolduraDeExportacao(svg);
    var vb = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !vb[2] || !vb[3]) throw new Error("Não foi possível determinar o tamanho do diagrama.");
    var plano = planoDeImpressao(vb[2], vb[3]);
    if (plano.total > MAX_PAGINAS_PDF) {
      var erro = new Error("O PDF teria " + plano.total + " páginas (máximo " + MAX_PAGINAS_PDF + "). Use uma escala menor ou um formato maior.");
      erro.definitivo = true;
      throw erro;
    }
    var suporte = document.createElement("div");
    suporte.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
    suporte.appendChild(svg);
    document.body.appendChild(suporte);
    try {
      trocarTextosSemFontePorImagem(svg);
      var doc = new JsPdf({ orientation: configPagina.orientacao === "retrato" ? "portrait" : "landscape", unit: "mm", format: configPagina.formato.toLowerCase(), compress: true });
      doc.setProperties({ title: projetoAtual, subject: MODOS_DIAGRAMA[modoAtual()].exportacao, creator: "Grafo" });
      for (var lin = 0, i = 0; lin < plano.linhas; lin++) {
        for (var col = 0; col < plano.colunas; col++, i++) {
          if (i > 0) doc.addPage();
          var xMm = col * plano.areaW, yMm = lin * plano.areaH;
          var wMm = Math.min(plano.areaW, plano.larguraMm - xMm), hMm = Math.min(plano.areaH, plano.alturaMm - yMm);
          // Uma página só: centraliza na área útil. Várias: cada folha mostra o
          // seu pedaço do desenho inteiro, recortado na área útil.
          var x = plano.margem + (plano.total === 1 ? (plano.areaW - wMm) / 2 : 0);
          var y = plano.margem + (plano.total === 1 ? (plano.areaH - hMm) / 2 : 0);
          doc.setFillColor(255, 255, 255);
          doc.rect(x, y, wMm, hMm, "F");
          doc.saveGraphicsState();
          doc.rect(x, y, wMm, hMm, null);
          doc.clip();
          doc.discardPath();
          await doc.svg(svg, { x: x - xMm, y: y - yMm, width: plano.larguraMm, height: plano.alturaMm });
          doc.restoreGraphicsState();
          if (plano.total > 1) {
            doc.setFontSize(7);
            doc.setTextColor(120);
            doc.text("Página " + (i + 1) + " de " + plano.total + " · linha " + (lin + 1) + ", coluna " + (col + 1),
              plano.pagina.w - plano.margem, plano.pagina.h - Math.max(2, plano.margem / 2), { align: "right" });
          }
        }
      }
      return { doc: doc, imagensIgnoradas: preparado.imagensIgnoradas };
    } finally {
      suporte.remove();
    }
  }

  // PDF com o diagrama como imagem (~DPI_PDF). Usado se o modo vetorial falhar.
  async function montarPdfRaster(JsPdf) {
    var plano = null;
    // Resolução pelo tamanho impresso (DPI_PDF), limitada pelo máximo seguro do canvas.
    var r = await rasterizarDiagrama({ moldura: configPagina.moldura, fundo: "#ffffff", pixelsPorUnidade: function (w, h) {
      plano = planoDeImpressao(w, h);
      return (plano.larguraMm / 25.4 * DPI_PDF) / w;
    } });
    if (plano.total > MAX_PAGINAS_PDF) throw new Error("O PDF teria " + plano.total + " páginas (máximo " + MAX_PAGINAS_PDF + "). Use uma escala menor ou um formato maior.");
    var paginas = paginasDoPlano(r.canvas, plano);
    var doc = new JsPdf({ orientation: configPagina.orientacao === "retrato" ? "portrait" : "landscape", unit: "mm", format: configPagina.formato.toLowerCase(), compress: true });
    doc.setProperties({ title: projetoAtual, subject: MODOS_DIAGRAMA[modoAtual()].exportacao, creator: "Grafo" });
    paginas.forEach(function (p, i) {
      if (i > 0) doc.addPage();
      doc.addImage(p.canvas, "PNG", p.x, p.y, p.w, p.h, undefined, "FAST");
      if (paginas.length > 1) {
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text("Página " + (i + 1) + " de " + paginas.length + " · linha " + (Math.floor(i / plano.colunas) + 1) + ", coluna " + (i % plano.colunas + 1),
          plano.pagina.w - plano.margem, plano.pagina.h - Math.max(2, plano.margem / 2), { align: "right" });
      }
    });
    return { doc: doc, imagensIgnoradas: r.imagensIgnoradas };
  }

  async function exportarPdf() {
    if (!elCanvas.querySelector("svg")) { mostrarErro("Gere o diagrama antes de exportar o PDF."); return; }
    var textoOriginal = btnExportarPdf.textContent;
    btnExportarPdf.disabled = true;
    btnExportarPdf.textContent = "Gerando PDF...";
    try {
      var JsPdf = await carregarJsPdf();
      var r;
      try {
        r = await montarPdfVetorial(JsPdf);
      } catch (erroVetor) {
        if (erroVetor.definitivo) throw erroVetor;
        console.warn("PDF vetorial falhou; gerando como imagem.", erroVetor);
        r = await montarPdfRaster(JsPdf);
      }
      var nome = nomeArquivoExportacao("pdf");
      baixarBlob(r.doc.output("blob"), nome);
      if (r.imagensIgnoradas > 0) avisarImagensIgnoradas("PDF", r.imagensIgnoradas);
      else { esconderErro(); avisar("PDF baixado: " + nome); }
      document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "pdf" }));
    } catch (e) {
      mostrarErro("Não foi possível exportar o PDF.\nDetalhe: " + e.message);
    } finally {
      btnExportarPdf.textContent = textoOriginal;
      btnExportarPdf.disabled = !elCanvas.querySelector("svg");
    }
  }

  function abrirPainelPagina(abrir) {
    elPainelPagina.hidden = !abrir;
    btnPaginaPdf.setAttribute("aria-expanded", abrir ? "true" : "false");
    btnPaginaPdf.classList.toggle("active", abrir);
    document.body.classList.toggle("com-painel-pagina", abrir);
    try { localStorage.setItem("grafo-painel-pagina", abrir ? "1" : "0"); } catch (e) {}
    // A prévia rasteriza o diagrama (trabalho pesado): espera o painel terminar
    // de entrar, senão a animação de abertura trava no meio.
    if (abrir) {
      elPrevia.classList.add("carregando");
      clearTimeout(timerPrevia);
      timerPrevia = setTimeout(atualizarPrevia, 280);
    }
  }

  btnPaginaPdf.addEventListener("click", function () {
    abrirPainelPagina(!painelPaginaAberto());
    // No celular o painel fica abaixo do diagrama: leva a tela até ele.
    if (painelPaginaAberto() && telaCelular.matches) elPainelPagina.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("btnFecharPagina").addEventListener("click", function () { abrirPainelPagina(false); });
  btnExportarPdf.addEventListener("click", exportarPdf);

  var timerAreaDesenho = null;
  document.getElementById("formPagina").addEventListener("input", function (event) {
    var alvo = event.target;
    var antes = { w: configPagina.areaLargura, h: configPagina.areaAltura };
    var orientacao = document.querySelector('input[name="paginaOrientacao"]:checked');
    // Campos numéricos: só aplica valor completo; o blur/change normaliza o que ficou fora da faixa.
    configPagina = normalizarConfigPagina({
      formato: campoPagina.formato.value, orientacao: orientacao ? orientacao.value : configPagina.orientacao,
      escala: campoPagina.escala.value, margem: campoPagina.margem.value === "" ? configPagina.margem : campoPagina.margem.value,
      moldura: campoPagina.moldura.checked,
      areaLargura: campoPagina.areaLargura.value === "" ? configPagina.areaLargura : campoPagina.areaLargura.value,
      areaAltura: campoPagina.areaAltura.value === "" ? configPagina.areaAltura : campoPagina.areaAltura.value
    });
    salvarConfigPagina();
    if (antes.w !== configPagina.areaLargura || antes.h !== configPagina.areaAltura) {
      aplicarAreaDeDesenho();
      // Área menor puxa para dentro quem ficou fora; redesenha quando parar de digitar.
      clearTimeout(timerAreaDesenho);
      timerAreaDesenho = setTimeout(function () { if (estado.equipamentos.length) gerar(); }, 500);
    }
    if (alvo !== campoPagina.areaLargura && alvo !== campoPagina.areaAltura) solicitarPrevia();
  });
  document.getElementById("formPagina").addEventListener("change", preencherFormPagina);

  aplicarAreaDeDesenho();
  preencherFormPagina();

  (async function initDownloads() {
    try {
      if (window.claude && window.claude.use) { downloadsCap = await window.claude.use("downloads"); }
    } catch (e) { downloadsCap = null; }
    if (ultimoDot) btnBaixar.disabled = false;
  })();

  aplicarLimitesNosCampos(document);
  projetos = carregarProjetos();
  projetoAtual = localStorage.getItem(window.GrafoAuth.storageKey("grafo-projeto-atual")) || Object.keys(projetos)[0] || "Projeto principal";
  if (!projetos[projetoAtual]) projetoAtual = Object.keys(projetos)[0] || "Projeto principal";
  if (!projetos[projetoAtual]) projetos[projetoAtual] = projetoVazio();
  estado = clonarDados(projetos[projetoAtual]);
  ultimoEstadoHistorico = JSON.stringify(estado);
  atualizarBotoesHistorico();
  renderProjetos();
  renderTudo();
  if (estado.equipamentos.length) gerar(); else limparDiagrama();
  try { if (localStorage.getItem("grafo-painel-pagina") === "1") abrirPainelPagina(true); } catch (e) {}
  if (ajustesAoCarregar.length) {
    mostrarErro("Alguns dados salvos neste navegador estavam inválidos e foram corrigidos ao carregar (" +
      plural(ajustesAoCarregar.length, "ajuste", "ajustes") + "):", ajustesAoCarregar, { aviso: true });
  }
})();
