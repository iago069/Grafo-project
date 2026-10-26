  // ==== 11-exportacao-svg-png.js: imagens embutidas, moldura e exportação SVG/PNG (parte de assets/js/editor/app.js; npm run montar) ====
  function blobParaDataUrl(blob) {
    return new Promise(function (resolver, rejeitar) {
      var leitor = new FileReader();
      leitor.onload = function () { resolver(leitor.result); };
      leitor.onerror = rejeitar;
      leitor.readAsDataURL(blob);
    });
  }

  // Cópia dos ícones em base64 (assets/js/editor/icones-embutidos.js), carregada só
  // na hora de exportar. Com o app aberto direto do disco (file://) o
  // navegador bloqueia o fetch das imagens e o canvas do PNG; sem esta cópia
  // os ícones sumiam da exportação.
  var promessaIconesEmbutidos = null;
  function carregarIconesEmbutidos() {
    if (window.ICONES_EMBUTIDOS) return Promise.resolve(window.ICONES_EMBUTIDOS);
    if (!promessaIconesEmbutidos) {
      promessaIconesEmbutidos = new Promise(function (resolver) {
        var script = document.createElement("script");
        script.src = "./assets/js/editor/icones-embutidos.js";
        script.onload = function () { resolver(window.ICONES_EMBUTIDOS || {}); };
        script.onerror = function () { promessaIconesEmbutidos = null; resolver({}); };
        document.head.appendChild(script);
      });
    }
    return promessaIconesEmbutidos;
  }

  async function iconeEmbutido(origem) {
    var nome = "";
    try { nome = decodeURIComponent(new URL(origem, document.baseURI).pathname.split("/").pop() || ""); }
    catch (e) { nome = String(origem).split(/[\\/]/).pop(); }
    if (!nome) return "";
    var icones = await carregarIconesEmbutidos();
    var chave = Object.keys(icones).find(function (k) { return k.toLowerCase() === nome.toLowerCase(); });
    return chave ? icones[chave] : "";
  }

  // Imagem como data: URL para ir dentro do arquivo exportado: lê o arquivo
  // e, se o navegador bloquear (file://), usa a cópia embutida. "" se nenhum der.
  // Cache por origem: a prévia do PDF rasteriza várias vezes seguidas.
  var cacheImagensExportacao = {};
  function imagemParaExportacao(origem) {
    if (!origem) return Promise.resolve("");
    if (/^data:/i.test(origem)) return Promise.resolve(origem);
    if (!cacheImagensExportacao[origem]) {
      cacheImagensExportacao[origem] = (async function () {
        try {
          var resposta = await fetch(resolverUrlRelativa(origem), { cache: "force-cache" });
          if (!resposta.ok && resposta.status !== 0) throw new Error("HTTP " + resposta.status);
          return await blobParaDataUrl(await resposta.blob());
        } catch (erroFetch) {}
        return await iconeEmbutido(origem);
      })();
      // Falha não fica em cache: a próxima tentativa busca de novo.
      cacheImagensExportacao[origem].then(function (v) { if (!v) delete cacheImagensExportacao[origem]; });
    }
    return cacheImagensExportacao[origem];
  }

  async function fonteImagemComoDataUrl(origem, imagemViva) {
    if (!origem) return "";
    var dataUrl = await imagemParaExportacao(origem);
    if (dataUrl) return dataUrl;

    var absoluta;
    try { absoluta = new URL(origem, document.baseURI).href; }
    catch (e) { absoluta = origem; }

    if (imagemViva) {
      try {
        var bbox = imagemViva.getBBox();
        var largura = Math.max(1, Math.ceil(bbox.width || Number(imagemViva.getAttribute("width")) || 1));
        var altura = Math.max(1, Math.ceil(bbox.height || Number(imagemViva.getAttribute("height")) || 1));
        var canvasTmp = document.createElement("canvas");
        canvasTmp.width = largura * 2;
        canvasTmp.height = altura * 2;
        var ctxTmp = canvasTmp.getContext("2d");
        ctxTmp.drawImage(imagemViva, 0, 0, canvasTmp.width, canvasTmp.height);
        return canvasTmp.toDataURL("image/png");
      } catch (erroCanvas) {}
    }

    return absoluta;
  }

  function obterOrigemDaImagemSvg(imagem) {
    if (!imagem) return "";
    var href = imagem.getAttribute("href");
    var hrefXlink = imagem.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    return href || hrefXlink || "";
  }

  // Mesmo efeito do filtro da tela (filtroCorIcone): matiz e saturação da cor,
  // luminosidade e transparência da imagem. Retorna PNG em data URL, ou null.
  function tingirImagem(dataUrl, cor) {
    return new Promise(function (resolver) {
      var img = new Image();
      img.onload = function () {
        try {
          // Até 512 px no lado maior: nítido na impressão (o ícone tem ~84 pt).
          var nw = img.naturalWidth || 512, nh = img.naturalHeight || 512;
          var k = Math.min(1, 512 / Math.max(nw, nh));
          var w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          ctx.globalCompositeOperation = "color";
          ctx.fillStyle = cor;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "destination-in";
          ctx.drawImage(img, 0, 0, w, h);
          resolver(canvas.toDataURL("image/png"));
        } catch (e) { resolver(null); }
      };
      img.onerror = function () { resolver(null); };
      img.src = dataUrl;
    });
  }

  // Cor do ícone na exportação: o svg2pdf (PDF) ignora filtros SVG, então o tom
  // vai direto na imagem e o filtro sai (para não aplicar duas vezes).
  async function aplicarTomNaImagem(imagem, dataUrl) {
    var tom = /url\(#tom-([0-9a-f]{6})\)/i.exec(imagem.getAttribute("filter") || "");
    if (!tom) return dataUrl;
    var tingida = await tingirImagem(dataUrl, "#" + tom[1]);
    if (!tingida) return dataUrl;
    imagem.removeAttribute("filter");
    return tingida;
  }

  // Papel escuro: inverte a claridade do desenho do catálogo mantendo o tom
  // (o mesmo que o filtro invert + hue-rotate da tela), pixel a pixel.
  function clarearIcone(dataUrl) {
    return new Promise(function (resolver) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          var d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
          for (var i = 0; i < p.length; i += 4) {
            var r = p[i], g = p[i + 1], b = p[i + 2];
            var max = Math.max(r, g, b), min = Math.min(r, g, b);
            // Nova claridade = 255 - claridade (com um teto, para não estourar no branco).
            var desloc = (255 - (max + min)) * 0.92;
            p[i] = Math.max(0, Math.min(255, r + desloc));
            p[i + 1] = Math.max(0, Math.min(255, g + desloc));
            p[i + 2] = Math.max(0, Math.min(255, b + desloc));
          }
          ctx.putImageData(d, 0, 0);
          resolver(c.toDataURL("image/png"));
        } catch (e) { resolver(null); }
      };
      img.onerror = function () { resolver(null); };
      img.src = dataUrl;
    });
  }

  async function prepararSvgParaExportacao(svgEl, removerImagens) {
    var copia = svgEl.cloneNode(true);
    copia.querySelectorAll(".legenda-fechar").forEach(function (b) { b.remove(); }); // botão da tela
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    copia.style.transform = "none";
    copia.style.transformOrigin = "";

    var imagensVivas = Array.prototype.slice.call(svgEl.querySelectorAll("image"));
    var imagensCopia = Array.prototype.slice.call(copia.querySelectorAll("image"));

    await Promise.all(imagensCopia.map(async function (imagem, indice) {
      if (removerImagens) {
        imagem.remove();
        return;
      }

      var origem = obterOrigemDaImagemSvg(imagem);

      if (!origem && imagensVivas[indice]) {
        origem = obterOrigemDaImagemSvg(imagensVivas[indice]);
      }

      if (!origem) return;

      try {
        var dataUrl = await fonteImagemComoDataUrl(origem, imagensVivas[indice]);
        if (!dataUrl) return;
        dataUrl = await aplicarTomNaImagem(imagem, dataUrl);
        if (imagem.getAttribute("class") === "eq-icone-catalogo" && papelEscuroNaTela()) dataUrl = (await clarearIcone(dataUrl)) || dataUrl;
        imagem.setAttribute("href", dataUrl);
        imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
      } catch (erroImagem) {
        console.warn("Não foi possível incorporar imagem na exportação:", origem, erroImagem);
      }
    }));

    return copia;
  }

  // Nome do arquivo exportado: projeto + data, ex.: "projeto-principal-2026-09-26.png".
  // Diagrama de redes e de monitoramento levam o tipo no nome ("…-monitoramento-…").
  function nomeArquivoExportacao(extensao) {
    var base = normalizarTextoEquipamento(projetoAtual).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "diagrama";
    var modo = modoAtual();
    var sufixo = modo === "redes" ? "-rede" : modo === "monitoramento" ? "-monitoramento" : "";
    var hoje = new Date();
    var data = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
    return base + sufixo + "-" + data + "." + extensao;
  }

  // Tema escuro: o papel da tela é escuro, e a exportação acompanha. As cores
  // padrão do desenho (claras na tela via CSS) são gravadas na cópia, porque o
  // CSS da página não vai junto para o PDF/PNG/SVG. Cores escolhidas pelo usuário ficam.
  var CORES_PAPEL_ESCURO = {
    text: { "#14212b": "#E8F1F8", "#111111": "#E8F1F8", "#405363": "#9CB7C8", "#34495a": "#9CB7C8", "#1f5f8b": "#71C7F0", "#2ead68": "#4BE08C" }
  };
  function corEscura(cor) {
    var m = String(cor || "").match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3 || (m.length > 3 && Number(m[3]) < 0.5)) return null;
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 90;
  }
  // Fundo do layout (o do app, atrás dos painéis).
  function corDoLayout() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    var h = /^#([0-9a-f]{6})$/i.exec(v);
    if (h) return "rgb(" + [0, 2, 4].map(function (i) { return parseInt(h[1].slice(i, i + 2), 16); }).join(", ") + ")";
    return v || getComputedStyle(document.body).backgroundColor;
  }
  // Exportação escura quando o quadro OU o tema do app são escuros: o PDF fica
  // todo na cor do layout, sem o papel branco.
  function papelEscuroNaTela() {
    return !!(corEscura(getComputedStyle(elCanvas).backgroundColor) || corEscura(corDoLayout()));
  }
  function aplicarPapelEscuroNaCopia(svg) {
    svg.querySelectorAll("text").forEach(function (t) {
      var nova = CORES_PAPEL_ESCURO.text[String(t.getAttribute("fill") || "").toLowerCase()];
      if (nova) t.setAttribute("fill", nova);
    });
    svg.querySelectorAll("g.node polygon").forEach(function (p) {
      if (String(p.getAttribute("fill") || "").toLowerCase() === "#ffffff") { p.setAttribute("fill", "#132636"); p.setAttribute("stroke", "#DCEBF5"); p.setAttribute("stroke-width", "1.4"); }
    });
    svg.querySelectorAll("g.cluster path, g.cluster polygon").forEach(function (p) { if (p.getAttribute("stroke") && p.getAttribute("stroke") !== "none") p.setAttribute("stroke", "#4E6A80"); });
    svg.querySelectorAll("g.cluster text").forEach(function (t) { t.setAttribute("fill", "#9CB7C8"); });
    svg.querySelectorAll("g.edge path, g.edge polygon").forEach(function (p) {
      if (String(p.getAttribute("stroke") || "").toLowerCase() === "#5a7284") { p.setAttribute("stroke", "#7FA3BC"); if (p.tagName.toLowerCase() === "polygon") p.setAttribute("fill", "#7FA3BC"); }
    });
    svg.querySelectorAll(".eq-moldura-icone").forEach(function (r) { r.setAttribute("stroke", "#8FA9BC"); });
    // Legenda dos cabos: a caixa acompanha o fundo, sem retângulo branco.
    svg.querySelectorAll("g.legenda-cabos rect").forEach(function (r) { r.setAttribute("fill", "#FFFFFF"); r.setAttribute("fill-opacity", "0.05"); r.setAttribute("stroke", "#4E6A80"); });
    svg.querySelectorAll("g.legenda-cabos text").forEach(function (t) { t.setAttribute("fill", "#E8F1F8"); });
    svg.querySelectorAll("g.legenda-cabos tspan").forEach(function (t) { t.setAttribute("fill", "#9CB7C8"); });
    svg.querySelectorAll("g.edge g.selo-cabo rect, g.edge rect.selo-cabo").forEach(function (r) { if (String(r.getAttribute("fill") || "").toLowerCase() === "#ffffff") { r.setAttribute("fill", "#132636"); } });
    // Etiquetas de cabo e IPs ficam legíveis por cima das linhas.
    svg.querySelectorAll("g.edge text").forEach(function (t) { t.setAttribute("fill", "#9CB7C8"); });
  }

  // Emoldura a cópia exportada: cabeçalho (projeto, data, totais), rodapé com a
  // legenda de tipos e fundo sólido. Aumenta o viewBox em volta do desenho.
  // Cor de fundo da exportação: a mesma do quadro na tela (papel escuro → azul-noite).
  // Fundo transparente na tela vira branco.
  function corDeFundoDaExportacao() {
    var c = papelEscuroNaTela() ? (corEscura(corDoLayout()) ? corDoLayout() : getComputedStyle(elCanvas).backgroundColor) : (getComputedStyle(elCanvas).backgroundColor || "");
    if (papelEscuroNaTela() && !/rgb/.test(c)) return "#0E1C27";
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c);
    if (!m || (m[4] != null && Number(m[4]) < 0.5)) return "#ffffff";
    return "#" + [m[1], m[2], m[3]].map(function (n) { return ("0" + Number(n).toString(16)).slice(-2); }).join("");
  }
  function rgbDaCor(hex) {
    var h = String(hex).replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function adicionarMolduraDeExportacao(svg) {
    var vb = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(function (n) { return !Number.isFinite(n); }) || !vb[2] || !vb[3]) return;
    var NS = "http://www.w3.org/2000/svg";
    var MARGEM = 28, TOPO = 104, RODAPE = 46;
    var larguraNova = Math.max(vb[2] + 2 * MARGEM, 440);
    var alturaNova = vb[3] + TOPO + RODAPE;
    var x0 = vb[0] - (larguraNova - vb[2]) / 2;
    var y0 = vb[1] - TOPO;
    var baseRodape = vb[1] + vb[3];

    var estilo = getComputedStyle(elCanvas);
    var escuro = papelEscuroNaTela();
    var fundo = corDeFundoDaExportacao();
    var tinta = escuro ? "#E8F1F8" : (estilo.getPropertyValue("--ink").trim() || "#16323D");
    if (escuro) aplicarPapelEscuroNaCopia(svg);

    function el(tag, atributos, texto) {
      var no = document.createElementNS(NS, tag);
      Object.keys(atributos).forEach(function (k) { no.setAttribute(k, atributos[k]); });
      if (texto != null) no.textContent = texto;
      return no;
    }
    function plural(n, singular, pluralTexto) { return n + " " + (n === 1 ? singular : pluralTexto); }

    var fonte = "Helvetica, Arial, sans-serif";
    var data = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    var moldura = el("g", { "class": "moldura-exportacao", "font-family": fonte, fill: tinta });
    moldura.appendChild(el("text", { x: x0 + MARGEM, y: y0 + 46, "font-size": 30, "font-weight": "bold", "letter-spacing": "-0.5" }, projetoAtual));
    moldura.appendChild(el("text", { x: x0 + MARGEM, y: y0 + 72, "font-size": 13, "fill-opacity": 0.7 },
      (estado.subtitulo ? estado.subtitulo + " · " : "") + MODOS_DIAGRAMA[modoAtual()].exportacao + " · " + data + " · " + plural(estado.equipamentos.length, "equipamento", "equipamentos") + " · " + plural(estado.conexoes.length, "cabo", "cabos")));
    moldura.appendChild(el("line", { x1: x0 + MARGEM, x2: x0 + larguraNova - MARGEM, y1: y0 + TOPO - 8, y2: y0 + TOPO - 8, stroke: tinta, "stroke-opacity": 0.15 }));
    moldura.appendChild(el("line", { x1: x0 + MARGEM, x2: x0 + larguraNova - MARGEM, y1: baseRodape + 12, y2: baseRodape + 12, stroke: tinta, "stroke-opacity": 0.15 }));

    // Legenda: a mesma da tela (por tipo; no Monitoramento, por status).
    var xLegenda = x0 + MARGEM;
    var yLegenda = baseRodape + 30;
    (camadasOcultas().tipos ? [] : itensDaLegenda(estado)).forEach(function (item) {
      moldura.appendChild(el("rect", { x: xLegenda, y: yLegenda - 7.5, width: 8, height: 8, rx: item.status ? 4 : 1.5, fill: item.cor }));
      var rotulo = el("text", { x: xLegenda + 12, y: yLegenda, "font-size": 9, "fill-opacity": 0.8 }, item.texto);
      moldura.appendChild(rotulo);
      xLegenda += 12 + item.texto.length * 5.2 + 16;
    });
    moldura.appendChild(el("text", { x: x0 + larguraNova - MARGEM, y: yLegenda, "font-size": 8.5, "fill-opacity": 0.5, "text-anchor": "end" }, "Gerado com Grafo"));

    svg.insertBefore(el("rect", { x: x0, y: y0, width: larguraNova, height: alturaNova, fill: fundo }), svg.firstChild);
    svg.appendChild(moldura);

    // width/height acompanham o viewBox, mantendo a unidade original (pt/px).
    ["width", "height"].forEach(function (attr, i) {
      var valor = String(svg.getAttribute(attr) || "");
      var numero = parseFloat(valor);
      if (!numero) return;
      var unidade = valor.replace(/^[\d.\s-]+/, "");
      svg.setAttribute(attr, (numero * (i === 0 ? larguraNova / vb[2] : alturaNova / vb[3])).toFixed(2) + unidade);
    });
    svg.setAttribute("viewBox", [x0, y0, larguraNova, alturaNova].map(function (n) { return n.toFixed(2); }).join(" "));
  }

  function baixarBlob(blob, nome) {
    if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === "function") {
      window.navigator.msSaveOrOpenBlob(blob, nome);
      return;
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function carregarImagemParaCanvas(origem) {
    return new Promise(async function (resolver, rejeitar) {
      var fonte = origem;
      try { fonte = await fonteImagemComoDataUrl(origem, null); } catch (e) {}

      var img = new Image();
      img.onload = function () { resolver(img); };
      img.onerror = function () { rejeitar(new Error("Falha ao carregar imagem: " + origem)); };
      img.src = fonte;
    });
  }

  async function desenharImagensDosEquipamentosNoPng(contexto, svgEl, escala, viewBox) {
    var imagensSvg = Array.prototype.slice.call(svgEl.querySelectorAll("image"));

    for (var i = 0; i < imagensSvg.length; i++) {
      var imagemSvg = imagensSvg[i];
      var origem = obterOrigemDaImagemSvg(imagemSvg);

      if (!origem) continue;

      var raster = null;
      try {
        raster = imagemSvg;
        var teste = document.createElement("canvas");
        teste.width = 1;
        teste.height = 1;
        teste.getContext("2d").drawImage(imagemSvg, 0, 0, 1, 1);
      } catch (e) {
        raster = await carregarImagemParaCanvas(origem);
      }

      var x = numeroSvg(imagemSvg.getAttribute("x"));
      var y = numeroSvg(imagemSvg.getAttribute("y"));
      var largura = numeroSvg(imagemSvg.getAttribute("width"));
      var altura = numeroSvg(imagemSvg.getAttribute("height"));
      if (!largura || !altura) continue;

      var matriz = imagemSvg.getCTM();
      if (!matriz) continue;

      contexto.save();
      contexto.setTransform(
        escala * matriz.a,
        escala * matriz.b,
        escala * matriz.c,
        escala * matriz.d,
        escala * (matriz.e - viewBox.x),
        escala * (matriz.f - viewBox.y)
      );

      contexto.beginPath();
      var raio = Math.min(3, largura / 2, altura / 2);
      if (contexto.roundRect) {
        contexto.roundRect(x, y, largura, altura, raio);
      } else {
        contexto.rect(x, y, largura, altura);
      }
      contexto.clip();

      contexto.drawImage(raster, x, y, largura, altura);
      contexto.restore();
    }
  }

  btnBaixar.addEventListener("click", async function () {
    if (!ultimoDot) return;
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) return;

    try {
      var svgExportavel = await prepararSvgParaExportacao(svgEl, false);
      adicionarMolduraDeExportacao(svgExportavel);
      var svgText = new XMLSerializer().serializeToString(svgExportavel);
      var nomeSvg = nomeArquivoExportacao("svg");

      if (downloadsCap) {
        try {
          await downloadsCap.save({ filename: nomeSvg, data: svgText });
          avisar("SVG baixado.");
          document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "svg" }));
          return;
        } catch (e) {}
      }

      baixarBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), nomeSvg);
      avisar("SVG baixado: " + nomeSvg);
      document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "svg" }));
    } catch (e) {
      mostrarErro("Não foi possível exportar o SVG.\nDetalhe: " + e.message);
    }
  });

  async function prepararSvgSeguroParaPng(svgEl) {
    var copia = svgEl.cloneNode(true);
    copia.querySelectorAll(".legenda-fechar").forEach(function (b) { b.remove(); }); // botão da tela
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    copia.style.transform = "none";
    copia.style.transformOrigin = "";

    var imagensOriginais = Array.prototype.slice.call(svgEl.querySelectorAll("image"));
    var imagensCopia = Array.prototype.slice.call(copia.querySelectorAll("image"));
    var imagensIgnoradas = 0;

    for (var i = 0; i < imagensCopia.length; i++) {
      var imagem = imagensCopia[i];
      var origem = obterOrigemDaImagemSvg(imagem);

      if (!origem && imagensOriginais[i]) {
        origem = obterOrigemDaImagemSvg(imagensOriginais[i]);
      }

      if (!origem) {
        imagem.remove();
        imagensIgnoradas++;
        continue;
      }

      // Só data: URL pode ir para o PNG: qualquer imagem externa bloqueia o canvas.
      var dataUrl = await imagemParaExportacao(origem);
      if (dataUrl) {
        dataUrl = await aplicarTomNaImagem(imagem, dataUrl);
        if (imagem.getAttribute("class") === "eq-icone-catalogo" && papelEscuroNaTela()) dataUrl = (await clarearIcone(dataUrl)) || dataUrl;
        imagem.setAttribute("href", dataUrl);
        imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
      } else {
        console.warn("Imagem ignorada na exportação PNG (não foi possível lê-la):", origem);
        imagem.remove();
        imagensIgnoradas++;
      }
    }

    return { svg: copia, imagensIgnoradas: imagensIgnoradas };
  }

  function carregarSvgSerializadoComoImagem(svgText) {
    return new Promise(function (resolver, rejeitar) {
      var blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var imagem = new Image();

      imagem.onload = function () {
        resolver({ imagem: imagem, url: url });
      };

      imagem.onerror = function () {
        URL.revokeObjectURL(url);
        rejeitar(new Error("O navegador não conseguiu rasterizar o SVG do diagrama."));
      };

      imagem.src = url;
    });
  }

  function canvasParaPngBlob(canvas) {
    return new Promise(function (resolver, rejeitar) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) {
            rejeitar(new Error("O navegador retornou um PNG vazio."));
            return;
          }
          resolver(blob);
        }, "image/png");
      } catch (erro) {
        rejeitar(erro);
      }
    });
  }

  // Canvas grande demais trava ou sai em branco (Safari: ~16 MP). Acima disso a
  // resolução é reduzida, mantendo o desenho inteiro.
  var MAX_PIXELS_RASTER = 16e6;
  var MAX_LADO_RASTER = 12000;

  // Desenha o diagrama num canvas, com as imagens embutidas (PNG e PDF usam isto).
  // opcoes.moldura: cabeçalho + legenda. opcoes.pixelsPorUnidade(larguraVb, alturaVb):
  // quantos pixels por unidade do viewBox (pt do Graphviz); padrão 2.
  async function rasterizarDiagrama(opcoes) {
    opcoes = opcoes || {};
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) throw new Error("Gere o diagrama antes de exportar.");
    var preparado = await prepararSvgSeguroParaPng(svgEl);
    if (opcoes.moldura !== false) adicionarMolduraDeExportacao(preparado.svg);
    var svgText = new XMLSerializer().serializeToString(preparado.svg);
    var carregado = await carregarSvgSerializadoComoImagem(svgText);
    try {
      // Tamanho da cópia (emoldurada ou não), não do SVG da tela.
      var vb = preparado.svg.viewBox && preparado.svg.viewBox.baseVal;
      var largura = vb && vb.width ? vb.width : (parseFloat(svgEl.getAttribute("width")) || carregado.imagem.naturalWidth || carregado.imagem.width);
      var altura = vb && vb.height ? vb.height : (parseFloat(svgEl.getAttribute("height")) || carregado.imagem.naturalHeight || carregado.imagem.height);
      if (!largura || !altura) throw new Error("Não foi possível determinar o tamanho do diagrama.");

      var escala = opcoes.pixelsPorUnidade ? opcoes.pixelsPorUnidade(largura, altura) : 2;
      escala = Math.min(escala, Math.sqrt(MAX_PIXELS_RASTER / (largura * altura)), MAX_LADO_RASTER / Math.max(largura, altura));
      escala = Math.max(escala, 0.05);

      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(largura * escala));
      canvas.height = Math.max(1, Math.ceil(altura * escala));
      var contexto = canvas.getContext("2d");
      if (!contexto) throw new Error("Canvas 2D não está disponível neste navegador.");
      contexto.fillStyle = opcoes.fundo || getComputedStyle(elCanvas).backgroundColor || "#ffffff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.imageSmoothingQuality = "high";
      contexto.drawImage(carregado.imagem, 0, 0, canvas.width, canvas.height);
      return { canvas: canvas, larguraVb: largura, alturaVb: altura, imagensIgnoradas: preparado.imagensIgnoradas };
    } finally {
      URL.revokeObjectURL(carregado.url);
    }
  }

  function avisarImagensIgnoradas(formato, quantidade) {
    mostrarErro(formato + " baixado, mas " + quantidade + " imagem(ns) não puderam ser incluídas.\n" +
      "Se forem imagens novas em assets/images, rode \"npm run icones\"; se vierem de outro site, envie o arquivo pelo campo Imagem do equipamento.", null, { aviso: true });
  }

  btnBaixarPng.addEventListener("click", async function () {
    if (!elCanvas.querySelector("svg")) {
      mostrarErro("Gere o diagrama antes de baixar o PNG.");
      return;
    }
    var textoOriginalBotao = btnBaixarPng.textContent;
    btnBaixarPng.disabled = true;
    btnBaixarPng.textContent = "Gerando PNG...";
    try {
      var r = await rasterizarDiagrama({ moldura: true });
      baixarBlob(await canvasParaPngBlob(r.canvas), nomeArquivoExportacao("png"));
      if (r.imagensIgnoradas > 0) avisarImagensIgnoradas("PNG", r.imagensIgnoradas);
      else { esconderErro(); avisar("PNG baixado."); }
      document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "png" }));
    } catch (e) {
      mostrarErro("Não foi possível exportar o diagrama como PNG.\nDetalhe: " + e.message);
    } finally {
      btnBaixarPng.disabled = false;
      btnBaixarPng.textContent = textoOriginalBotao;
    }
  });

