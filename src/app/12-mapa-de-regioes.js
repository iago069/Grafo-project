  // ==== 12-mapa-de-regioes.js: Mapa Regional — municípios (GeoJSON/TopoJSON/SVG) e imagem no fundo do diagrama (parte de assets/js/editor/app.js; npm run montar) ====
  // estado.mapa = {
  //   regioes: [{ nome, codigo, d, transform?, oculta?, cor? }],  municípios já projetados (largura ~1000)
  //   largura, altura, x, y, escala,                                onde o mapa fica no desenho
  //   estilo ("referencia" | "grafo"), cor, contorno, sombra, nomes, cabosPretos,
  //   imagem: { src (data URL), largura, altura, x, y, escala, rotacao, opacidade, visivel, bloqueado }
  // }
  // Equipamentos com eq.municipio vão para um ponto dentro do município (não o
  // centro da caixa, que em município torto cai fora). Os cabos continuam os do
  // diagrama: o traçado no mapa é esquemático, não o caminho real da fibra; a
  // distância é a cadastrada no cabo (nunca calculada pelo desenho).

  var MAPA_LARGURA_BASE = 1000;
  var MAPA_MAX_CARACTERES = 1500000; // soma dos caminhos (cabe no salvamento)
  var IMAGEM_MAX_LADO = 3000, IMAGEM_MAX_BYTES = 3500000;
  var ESTILOS_MAPA = {
    referencia: { cor: "#008A2E", contorno: "#000000", sombra: true, cabosPretos: true },
    grafo: { cor: "#CFE6D6", contorno: "#5A7284", sombra: false, cabosPretos: false }
  };
  var COR_MAPA_PADRAO = ESTILOS_MAPA.referencia.cor;

  function temRegioes() { return !!(estado.mapa && estado.mapa.regioes && estado.mapa.regioes.length); }
  function temImagemDeFundo() { return !!(estado.mapa && estado.mapa.imagem && estado.mapa.imagem.src); }
  function mapaAtivo() { return temRegioes() || temImagemDeFundo(); }
  function regioesVisiveis() { return temRegioes() ? estado.mapa.regioes.filter(function (r) { return !r.oculta; }) : []; }

  // ---- Leitura dos arquivos ----
  // Coordenadas geográficas → plano: equirretangular corrigido pela latitude
  // média (bom para municípios e regiões), y para baixo, largura MAPA_LARGURA_BASE.
  // Coordenadas fora de -180..180 / -90..90 são tratadas como já projetadas
  // (UTM, Mercator...): só escala, mantendo a proporção.
  function projetarAneis(poligonos) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    poligonos.forEach(function (p) { p.aneis.forEach(function (anel) { anel.forEach(function (c) {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]; if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    }); }); });
    if (!isFinite(minX)) return null;
    var geografico = minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
    var kx = geografico ? Math.cos(((minY + maxY) / 2) * Math.PI / 180) : 1;
    var largura = (maxX - minX) * kx || 1, altura = (maxY - minY) || 1;
    var esc = MAPA_LARGURA_BASE / largura;
    function ponto(c) { return [(c[0] - minX) * kx * esc, (maxY - c[1]) * esc]; } // norte para cima
    var regioes = poligonos.map(function (p) {
      var d = p.aneis.map(function (anel) {
        var saida = [], ultimo = null;
        anel.forEach(function (c) {
          var q = ponto(c);
          if (ultimo && Math.abs(q[0] - ultimo[0]) + Math.abs(q[1] - ultimo[1]) < 0.7) return; // tira pontos colados
          saida.push(q[0].toFixed(1) + " " + q[1].toFixed(1));
          ultimo = q;
        });
        return saida.length > 2 ? "M" + saida.join("L") + "Z" : "";
      }).join("");
      return { nome: p.nome, codigo: p.codigo, d: d };
    }).filter(function (r) { return r.d; });
    return { regioes: regioes, largura: MAPA_LARGURA_BASE, altura: Math.max(1, Math.round(altura * esc)), geografico: geografico };
  }
  function propriedade(props, chaves) {
    props = props || {};
    for (var i = 0; i < chaves.length; i++) if (props[chaves[i]] != null && String(props[chaves[i]]).trim()) return String(props[chaves[i]]).trim();
    return "";
  }
  function nomeDaFeicao(props) { return propriedade(props, ["NM_MUN", "nome", "NOME", "name", "NAME", "NM_MUNICIP", "municipio", "MUNICIPIO", "cidade", "CIDADE", "NM_UF"]).slice(0, 80); }
  function codigoDaFeicao(props) { return propriedade(props, ["CD_MUN", "CD_GEOCMU", "CD_MUNICIP", "codigo_ibge", "cod_ibge", "geocodigo", "GEOCODIGO", "id"]).slice(0, 20); }
  function poligonosDaGeometria(geo, nome, codigo, saida) {
    if (!geo) return;
    if (geo.type === "Polygon") saida.push({ nome: nome, codigo: codigo, aneis: geo.coordinates });
    else if (geo.type === "MultiPolygon") geo.coordinates.forEach(function (pol) { saida.push({ nome: nome, codigo: codigo, aneis: pol }); });
    else if (geo.type === "GeometryCollection") (geo.geometries || []).forEach(function (g) { poligonosDaGeometria(g, nome, codigo, saida); });
  }
  function lerGeoJson(obj) {
    if (!obj || !obj.type) throw new Error("não é um GeoJSON (falta \"type\").");
    var feicoes = obj.type === "FeatureCollection" ? obj.features : obj.type === "Feature" ? [obj] : [{ geometry: obj, properties: {} }];
    var poligonos = [], ignoradas = 0;
    (feicoes || []).forEach(function (f) {
      var antes = poligonos.length;
      poligonosDaGeometria(f && f.geometry, nomeDaFeicao(f && f.properties), codigoDaFeicao(f && f.properties), poligonos);
      if (poligonos.length === antes) ignoradas++;
    });
    // Um município com várias partes (ilhas, MultiPolygon) vira uma região só.
    var porChave = {}, juntos = [];
    poligonos.forEach(function (p) {
      var chave = p.codigo || p.nome;
      if (chave && porChave[chave]) { porChave[chave].aneis = porChave[chave].aneis.concat(p.aneis); return; }
      var novo = { nome: p.nome, codigo: p.codigo, aneis: p.aneis.slice() };
      if (chave) porChave[chave] = novo;
      juntos.push(novo);
    });
    var r = projetarAneis(juntos);
    if (r) r.ignoradas = ignoradas;
    return r;
  }
  // TopoJSON (formato padrão do mapshaper): arcos compartilhados + transform.
  function lerTopoJson(topo) {
    var t = topo.transform;
    var arcos = (topo.arcs || []).map(function (arco) {
      var x = 0, y = 0;
      return arco.map(function (p) {
        if (t) { x += p[0]; y += p[1]; return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; }
        return p.slice(0, 2);
      });
    });
    function arco(i) { return i >= 0 ? arcos[i] : arcos[~i].slice().reverse(); }
    function anel(indices) {
      var pts = [];
      indices.forEach(function (i, k) { var a = arco(i); pts = pts.concat(k ? a.slice(1) : a); });
      return pts;
    }
    function geometria(g) {
      if (!g) return null;
      if (g.type === "Polygon") return { type: "Polygon", coordinates: g.arcs.map(anel) };
      if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.arcs.map(function (pol) { return pol.map(anel); }) };
      if (g.type === "GeometryCollection") return { type: "GeometryCollection", geometries: (g.geometries || []).map(geometria) };
      return null;
    }
    var feicoes = [];
    Object.keys(topo.objects || {}).forEach(function (k) {
      var obj = topo.objects[k];
      var lista = obj.type === "GeometryCollection" ? obj.geometries : [obj];
      (lista || []).forEach(function (g) { feicoes.push({ type: "Feature", properties: g.properties || {}, geometry: geometria(g) }); });
    });
    return lerGeoJson({ type: "FeatureCollection", features: feicoes });
  }
  // SVG vetorial (mapshaper ou outro programa): cada path/polygon vira uma região.
  // Só os atributos d/points/id/data-name são lidos; nada do SVG é executado.
  function lerSvgDeMapa(texto) {
    var doc = new DOMParser().parseFromString(texto, "image/svg+xml");
    var svg = doc.querySelector("svg");
    if (!svg || doc.querySelector("parsererror")) throw new Error("SVG inválido.");
    var vb = String(svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    var largura = vb.length === 4 && vb[2] ? vb[2] : parseFloat(svg.getAttribute("width")) || 1000;
    var altura = vb.length === 4 && vb[3] ? vb[3] : parseFloat(svg.getAttribute("height")) || 1000;
    var ox = vb.length === 4 ? vb[0] : 0, oy = vb.length === 4 ? vb[1] : 0;
    var esc = MAPA_LARGURA_BASE / largura;
    var regioes = [];
    svg.querySelectorAll("path, polygon").forEach(function (el) {
      var d = el.tagName.toLowerCase() === "polygon" ? "M" + String(el.getAttribute("points") || "").trim().replace(/\s+/g, " L") + "Z" : el.getAttribute("d");
      if (!d || !/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(d)) return;
      var nome = el.getAttribute("data-name") || el.getAttribute("id") || (el.querySelector("title") || {}).textContent || "";
      regioes.push({ nome: String(nome).slice(0, 80), codigo: "", d: d, transform: "translate(" + (-ox * esc).toFixed(3) + "," + (-oy * esc).toFixed(3) + ") scale(" + esc.toFixed(6) + ")" });
    });
    return { regioes: regioes, largura: MAPA_LARGURA_BASE, altura: Math.round(altura * esc), geografico: false };
  }
  function lerArquivoDeMapa(nome, texto) {
    if (/\.(shp|kml|kmz|dbf|zip)$/i.test(nome)) throw new Error("esse formato não é lido direto. Abra no mapshaper.org e exporte em GeoJSON, TopoJSON ou SVG.");
    if (/\.svg$/i.test(nome) || /^\s*<(\?xml|svg)/i.test(texto)) return lerSvgDeMapa(texto);
    var obj;
    try { obj = JSON.parse(texto); } catch (e) { throw new Error("o arquivo não é JSON válido (GeoJSON/TopoJSON)."); }
    if (obj && obj.type === "Topology") return lerTopoJson(obj);
    return lerGeoJson(obj);
  }

  // ---- Imagem de fundo (PNG, JPG, SVG) ----
  // SVG é limpo (sem scripts, eventos, foreignObject, links externos) e entra
  // como imagem: nada dele roda. Imagem grande é reduzida para caber no salvamento.
  function limparSvg(texto) {
    var doc = new DOMParser().parseFromString(texto, "image/svg+xml");
    var svg = doc.querySelector("svg");
    if (!svg || doc.querySelector("parsererror")) throw new Error("SVG inválido.");
    doc.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video").forEach(function (e) { e.remove(); });
    doc.querySelectorAll("*").forEach(function (e) {
      Array.prototype.slice.call(e.attributes).forEach(function (a) {
        var n = a.name.toLowerCase(), v = String(a.value || "").trim().toLowerCase();
        if (n.indexOf("on") === 0) e.removeAttribute(a.name);
        else if ((n === "href" || n === "xlink:href") && !/^(#|data:image\/(png|jpe?g|gif);)/.test(v)) e.removeAttribute(a.name);
        else if (/javascript:|url\(\s*['"]?\s*(https?:|\/\/)/.test(v)) e.removeAttribute(a.name);
      });
    });
    return new XMLSerializer().serializeToString(svg);
  }
  function carregarImagem(src) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { falha(new Error("não deu para abrir a imagem.")); };
      img.src = src;
    });
  }
  async function prepararImagemDeFundo(arquivo) {
    var ehSvg = /\.svg$/i.test(arquivo.name) || arquivo.type === "image/svg+xml";
    var src;
    if (ehSvg) {
      var limpo = limparSvg(await arquivo.text());
      src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(limpo)));
    } else {
      if (!/^image\/(png|jpe?g)$/.test(arquivo.type)) throw new Error("use PNG, JPG ou SVG.");
      src = await new Promise(function (ok) { var l = new FileReader(); l.onload = function () { ok(String(l.result)); }; l.readAsDataURL(arquivo); });
    }
    var img = await carregarImagem(src);
    var w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
    var grande = !ehSvg && (Math.max(w, h) > IMAGEM_MAX_LADO || src.length > IMAGEM_MAX_BYTES);
    if (grande) {
      var f = Math.min(1, IMAGEM_MAX_LADO / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.round(w * f); c.height = Math.round(h * f);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      src = c.toDataURL("image/jpeg", 0.86);
      w = c.width; h = c.height;
    }
    if (src.length > IMAGEM_MAX_BYTES) throw new Error("imagem pesada demais mesmo reduzida (máx. ~2,5 MB).");
    return { src: src, largura: w, altura: h };
  }

  // ---- Posição ----
  function caixaDosEquipamentos() {
    var svg = elCanvas.querySelector("svg"), caixa = null;
    if (svg) svg.querySelectorAll("g.node").forEach(function (n) {
      try {
        var b = n.getBBox(), t = translateDoElemento(n);
        var c = { x1: b.x + t.x, y1: b.y + t.y, x2: b.x + t.x + b.width, y2: b.y + t.y + b.height };
        caixa = caixa ? { x1: Math.min(caixa.x1, c.x1), y1: Math.min(caixa.y1, c.y1), x2: Math.max(caixa.x2, c.x2), y2: Math.max(caixa.y2, c.y2) } : c;
      } catch (e) {}
    });
    return caixa || { x1: 0, y1: 0, x2: 1200, y2: 800 };
  }
  // Encaixa um objeto {largura, altura, x, y, escala} em volta da caixa dada.
  function encaixar(obj, caixa, folga) {
    var w = caixa.x2 - caixa.x1 + 2 * folga, h = caixa.y2 - caixa.y1 + 2 * folga;
    var esc = Math.max(w / obj.largura, h / obj.altura);
    obj.escala = Math.round(esc * 1000) / 1000;
    obj.x = Math.round((caixa.x1 + caixa.x2) / 2 - obj.largura * esc / 2);
    obj.y = Math.round((caixa.y1 + caixa.y2) / 2 - obj.altura * esc / 2);
  }
  // Caixa (em coordenadas do mapa) das regiões visíveis.
  function caixaDasRegioesVisiveis() {
    var svg = elCanvas.querySelector("svg"), caixa = null;
    if (!svg) return null;
    svg.querySelectorAll("g.camada-mapa g.mapa-regioes > path").forEach(function (p) {
      try {
        var b = p.getBBox(), m = p.getAttribute("transform");
        var s = 1, tx = 0, ty = 0;
        if (m) { var mm = /translate\(([-\d.e]+),([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(m); if (mm) { tx = +mm[1]; ty = +mm[2]; s = +mm[3]; } }
        var c = { x1: b.x * s + tx, y1: b.y * s + ty, x2: (b.x + b.width) * s + tx, y2: (b.y + b.height) * s + ty };
        caixa = caixa ? { x1: Math.min(caixa.x1, c.x1), y1: Math.min(caixa.y1, c.y1), x2: Math.max(caixa.x2, c.x2), y2: Math.max(caixa.y2, c.y2) } : c;
      } catch (e) {}
    });
    return caixa;
  }

  // Ponto bem dentro do município (aproxima o "polo de inacessibilidade"):
  // grade de pontos na caixa, fica com o de dentro mais longe da borda.
  function pontoInterno(pathEl) {
    var b;
    try { b = pathEl.getBBox(); } catch (e) { return null; }
    if (!b.width || !b.height || !pathEl.isPointInFill) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    var N = 24, dentro = [], fora = [];
    for (var i = 0; i <= N; i++) for (var j = 0; j <= N; j++) {
      var p = { x: b.x + b.width * i / N, y: b.y + b.height * j / N };
      var pt = pathEl.ownerSVGElement.createSVGPoint(); pt.x = p.x; pt.y = p.y;
      (pathEl.isPointInFill(pt) ? dentro : fora).push(p);
    }
    if (!dentro.length) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    var melhor = dentro[0], dist = -1;
    dentro.forEach(function (p) {
      // A borda da caixa também conta como "fora" (região que enche a caixa inteira).
      var borda = Math.min(p.x - b.x, b.x + b.width - p.x, p.y - b.y, b.y + b.height - p.y);
      var d = borda * borda;
      fora.forEach(function (q) { var dd = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y); if (dd < d) d = dd; });
      if (d > dist) { dist = d; melhor = p; }
    });
    return melhor;
  }
  function regiaoPorNome(nome) {
    if (!temRegioes() || !nome) return -1;
    var alvo = normalizarTextoEquipamento(nome);
    for (var i = 0; i < estado.mapa.regioes.length; i++) {
      var r = estado.mapa.regioes[i];
      if (normalizarTextoEquipamento(r.nome) === alvo || (r.codigo && r.codigo === String(nome).trim())) return i;
    }
    return -1;
  }
  // Centro (coordenadas do desenho) para um equipamento no município; vários no
  // mesmo município ficam um embaixo do outro.
  function pontoNoMunicipio(nome, ordem) {
    var i = regiaoPorNome(nome);
    if (i < 0) return null;
    var svg = elCanvas.querySelector("svg");
    var path = svg && svg.querySelector('g.camada-mapa g.mapa-regioes > path[data-regiao="' + i + '"]');
    if (!path) return null;
    var p = pontoInterno(path);
    if (!p) return null;
    var r = estado.mapa.regioes[i], s = 1, tx = 0, ty = 0;
    var mm = r.transform && /translate\(([-\d.e]+),([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(r.transform);
    if (mm) { tx = +mm[1]; ty = +mm[2]; s = +mm[3]; }
    var m = estado.mapa, esc = Number(m.escala) || 1;
    return { x: Math.round(m.x + (p.x * s + tx) * esc), y: Math.round(m.y + (p.y * s + ty) * esc + (ordem || 0) * 170) };
  }
  // Põe os equipamentos com município dentro dele (os fixados ficam onde estão).
  function posicionarNosMunicipios(ids) {
    if (!temRegioes()) return 0;
    var contagem = {}, n = 0;
    estado.equipamentos.forEach(function (eq) {
      if (!eq.municipio) return;
      var k = normalizarTextoEquipamento(eq.municipio);
      var ordem = contagem[k] || 0;
      contagem[k] = ordem + 1;
      if (ids && ids.indexOf(eq.id) < 0) return;
      if (eq.fixo) return;
      var ponto = pontoNoMunicipio(eq.municipio, ordem);
      if (ponto) { eq.posicao = ponto; delete eq.deslocamento; n++; }
    });
    return n;
  }

  // ---- Desenho ----
  function desenharMapa() {
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var antigo = grafo.querySelector("g.camada-mapa");
    if (antigo) antigo.remove();
    document.body.classList.toggle("com-mapa", mapaAtivo());
    if (!mapaAtivo() || camadasOcultas().mapa) return;
    var m = estado.mapa;
    var NS = "http://www.w3.org/2000/svg";
    function no(tag, at, pai) {
      var e = document.createElementNS(NS, tag);
      Object.keys(at).forEach(function (k) { if (at[k] != null) e.setAttribute(k, at[k]); });
      if (pai) pai.appendChild(e);
      return e;
    }
    var camada = no("g", { "class": "camada-mapa", "pointer-events": "none" });
    // Atrás de tudo: logo depois do fundo do Graphviz.
    var primeiroG = Array.prototype.find.call(grafo.children, function (c) { return c.tagName.toLowerCase() === "g"; });
    grafo.insertBefore(camada, primeiroG || null);

    // Imagem de fundo (abaixo dos municípios).
    if (temImagemDeFundo() && m.imagem.visivel !== false) {
      var im = m.imagem, ei = Number(im.escala) || 1;
      var cx = im.largura * ei / 2, cy = im.altura * ei / 2;
      var gImg = no("g", { "class": "mapa-imagem", transform: "translate(" + (im.x || 0) + "," + (im.y || 0) + ") rotate(" + (Number(im.rotacao) || 0) + " " + cx + " " + cy + ")" }, camada);
      var el = no("image", { width: im.largura * ei, height: im.altura * ei, opacity: im.opacidade == null ? 1 : im.opacidade, preserveAspectRatio: "none" }, gImg);
      el.setAttributeNS("http://www.w3.org/1999/xlink", "href", im.src);
      el.setAttribute("href", im.src);
    }
    if (!temRegioes()) return;
    var esc = Number(m.escala) || 1;
    var g = no("g", { "class": "mapa-municipios", transform: "translate(" + (m.x || 0) + "," + (m.y || 0) + ") scale(" + esc + ")" }, camada);
    var traco = 1.4 / esc;
    var cor = /^#[0-9a-f]{6}$/i.test(m.cor || "") ? m.cor : COR_MAPA_PADRAO;
    var contorno = /^#[0-9a-f]{6}$/i.test(m.contorno || "") ? m.contorno : "#000000";
    if (m.sombra !== false) {
      var sombra = no("g", { "class": "mapa-sombra", transform: "translate(" + (7 / esc) + "," + (7 / esc) + ")", fill: "#000000" }, g);
      m.regioes.forEach(function (r) { if (!r.oculta) no("path", { d: r.d, transform: r.transform || null }, sombra); });
    }
    var regioes = no("g", { "class": "mapa-regioes", fill: cor, stroke: contorno, "stroke-width": traco, "stroke-linejoin": "round" }, g);
    m.regioes.forEach(function (r, i) {
      if (r.oculta) return;
      var p = no("path", { d: r.d, transform: r.transform || null, "data-regiao": i, fill: /^#[0-9a-f]{6}$/i.test(r.cor || "") ? r.cor : null }, regioes);
      if (r.nome) no("title", {}, p).textContent = r.nome;
    });
    if (m.nomes && !camadasOcultas().cidades) {
      var claro = (function () { var h = cor.replace("#", ""); var l = 0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16); return l < 140; })();
      var nomes = no("g", { "class": "mapa-nomes", "font-family": "Helvetica, Arial, sans-serif", "font-weight": "bold", fill: claro ? "#FFFFFF" : "#16323D", "fill-opacity": 0.6, "text-anchor": "middle" }, g);
      regioes.querySelectorAll("path").forEach(function (p) {
        var r = m.regioes[Number(p.getAttribute("data-regiao"))];
        if (!r || !r.nome) return;
        var b;
        try { b = p.getBBox(); } catch (e) { return; }
        var s = 1, mm = r.transform && /scale\(([-\d.e]+)\)/.exec(r.transform);
        if (mm) s = +mm[1];
        if (b.width * s * esc < 70) return; // região pequena demais para o nome
        var pi = pontoInterno(p) || { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        var t = no("text", { x: pi.x, y: pi.y, "font-size": 12 / esc / s }, nomes);
        if (r.transform) t.setAttribute("transform", r.transform);
        t.textContent = r.nome.toUpperCase();
      });
    }
    // Textos legíveis sobre o mapa: contorno claro e fino atrás das letras.
    svg.querySelectorAll("g.node > text, g.edge > text, g.cluster > text").forEach(function (t) {
      t.setAttribute("stroke", "#FFFFFF"); t.setAttribute("stroke-opacity", "0.85"); t.setAttribute("stroke-width", "2"); t.setAttribute("stroke-linejoin", "round"); t.setAttribute("paint-order", "stroke");
    });
  }

  // ---- Painel "Mapa regional" ----
  (function () {
    var painel = document.getElementById("navMapa");
    if (!painel) return;
    function campo(id) { return document.getElementById(id); }
    var arquivo = campo("mapaArquivo"), arquivoImagem = campo("mapaArquivoImagem"), situacao = campo("mapaSituacao");
    var listaRegioes = campo("mapaListaRegioes"), buscaRegiao = campo("mapaBuscaRegiao");
    var alvoAjuste = "municipios"; // "municipios" | "imagem"

    function atualizarPainel() {
      var m = estado.mapa;
      campo("mapaControles").hidden = !temRegioes();
      campo("mapaControlesImagem").hidden = !temImagemDeFundo();
      campo("mapaAjuste").hidden = !mapaAtivo();
      var partes = [];
      if (temRegioes()) partes.push(regioesVisiveis().length + " de " + m.regioes.length + " municípios visíveis");
      if (temImagemDeFundo()) partes.push("imagem de fundo" + (m.imagem.visivel === false ? " (oculta)" : "") + (m.imagem.bloqueado ? " · bloqueada" : ""));
      situacao.textContent = partes.length ? partes.join(" · ") : "Nenhum mapa ainda.";
      campo("mapaAlvoImagem").disabled = !temImagemDeFundo();
      campo("mapaAlvoMunicipios").disabled = !temRegioes();
      if (alvoAjuste === "imagem" && !temImagemDeFundo()) alvoAjuste = "municipios";
      if (alvoAjuste === "municipios" && !temRegioes() && temImagemDeFundo()) alvoAjuste = "imagem";
      campo("mapaAlvoMunicipios").classList.toggle("active", alvoAjuste === "municipios");
      campo("mapaAlvoImagem").classList.toggle("active", alvoAjuste === "imagem");
      if (temRegioes()) {
        campo("mapaCor").value = /^#[0-9a-f]{6}$/i.test(m.cor || "") ? m.cor : COR_MAPA_PADRAO;
        campo("mapaContorno").value = /^#[0-9a-f]{6}$/i.test(m.contorno || "") ? m.contorno : "#000000";
        campo("mapaSombra").checked = m.sombra !== false;
        campo("mapaNomes").checked = !!m.nomes;
        campo("mapaCabosPretos").checked = !!m.cabosPretos;
        campo("mapaEstiloReferencia").classList.toggle("active", m.estilo !== "grafo");
        campo("mapaEstiloGrafo").classList.toggle("active", m.estilo === "grafo");
        montarListaRegioes();
      }
      if (temImagemDeFundo()) {
        campo("mapaOpacidade").value = Math.round((m.imagem.opacidade == null ? 1 : m.imagem.opacidade) * 100);
        campo("mapaRotacao").value = Number(m.imagem.rotacao) || 0;
        campo("mapaRotacaoValor").textContent = (Number(m.imagem.rotacao) || 0) + "°";
        campo("mapaImagemVisivel").checked = m.imagem.visivel !== false;
        campo("mapaImagemBloqueada").checked = !!m.imagem.bloqueado;
      }
    }
    function montarListaRegioes() {
      var termo = normalizarTextoEquipamento(buscaRegiao.value);
      var m = estado.mapa;
      var itens = m.regioes.map(function (r, i) { return { r: r, i: i }; })
        .filter(function (x) { return !termo || normalizarTextoEquipamento(x.r.nome).indexOf(termo) >= 0 || String(x.r.codigo || "").indexOf(termo) >= 0; })
        .sort(function (a, b) { return String(a.r.nome).localeCompare(String(b.r.nome), "pt"); });
      var MAX = 300;
      listaRegioes.innerHTML = itens.slice(0, MAX).map(function (x) {
        return '<label class="mapa-regiao"><input type="checkbox" data-regiao="' + x.i + '"' + (x.r.oculta ? "" : " checked") + '>' +
          '<span>' + escaparHtml(x.r.nome || "(sem nome)") + '</span>' + (x.r.codigo ? '<em>' + escaparHtml(x.r.codigo) + '</em>' : "") +
          '<input type="color" data-regiao-cor="' + x.i + '" value="' + escaparHtml(/^#[0-9a-f]{6}$/i.test(x.r.cor || "") ? x.r.cor : (m.cor || COR_MAPA_PADRAO)) + '" title="Cor só deste município"></label>';
      }).join("") + (itens.length > MAX ? '<p class="mapa-mais">+ ' + (itens.length - MAX) + ' — use a busca</p>' : "") + (!itens.length ? '<p class="mapa-mais">Nenhum município com esse nome.</p>' : "");
    }
    function mudou(redesenharTudo) {
      salvarLocal();
      if (redesenharTudo) gerar();
      else { desenharMapa(); ajustarViewBoxAoConteudo(true); }
      atualizarPainel();
    }
    new MutationObserver(function () { if (painel.classList.contains("open")) atualizarPainel(); }).observe(painel, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("grafo:render", function () { if (painel.classList.contains("open")) atualizarPainel(); document.body.classList.toggle("com-mapa", mapaAtivo()); });

    function lerTexto(f) { return new Promise(function (ok) { var l = new FileReader(); l.onload = function () { ok(String(l.result)); }; l.readAsText(f, "UTF-8"); }); }
    arquivo.addEventListener("change", async function () {
      var f = arquivo.files[0];
      arquivo.value = "";
      if (!f) return;
      try {
        var mapa = lerArquivoDeMapa(f.name, await lerTexto(f));
        if (!mapa || !mapa.regioes.length) throw new Error("não achei nenhum município/região (Polygon ou MultiPolygon) no arquivo.");
        var total = mapa.regioes.reduce(function (s, r) { return s + r.d.length; }, 0);
        if (total > MAPA_MAX_CARACTERES) throw new Error("o mapa é detalhado demais. No mapshaper, use Simplify (uns 5%) antes de exportar.");
        var anterior = estado.mapa || {};
        var estilo = ESTILOS_MAPA[anterior.estilo === "grafo" ? "grafo" : "referencia"];
        var novo = { regioes: mapa.regioes, largura: mapa.largura, altura: mapa.altura, estilo: anterior.estilo || "referencia",
          cor: anterior.cor || estilo.cor, contorno: anterior.contorno || estilo.contorno, sombra: anterior.sombra != null ? anterior.sombra : estilo.sombra,
          nomes: !!anterior.nomes, cabosPretos: anterior.cabosPretos != null ? anterior.cabosPretos : estilo.cabosPretos };
        if (anterior.imagem) novo.imagem = anterior.imagem;
        encaixar(novo, caixaDosEquipamentos(), 120);
        var v = Esquema.validarMapa(novo);
        if (!v.ok) throw new Error(v.mensagem);
        estado.mapa = v.dados;
        alvoAjuste = "municipios";
        avisar("Mapa carregado: " + mapa.regioes.length + (mapa.regioes.length === 1 ? " município/região." : " municípios/regiões.") +
          (mapa.ignoradas ? " " + mapa.ignoradas + " item(ns) sem polígono foram ignorados." : "") + " Desmarque os que não usa e arraste os equipamentos.");
        mudou(true);
      } catch (e) { avisar("Não deu para ler o mapa: " + (e.message || e)); }
    });
    arquivoImagem.addEventListener("change", async function () {
      var f = arquivoImagem.files[0];
      arquivoImagem.value = "";
      if (!f) return;
      try {
        var im = await prepararImagemDeFundo(f);
        var imagem = { src: im.src, largura: im.largura, altura: im.altura, rotacao: 0, opacidade: 1, visivel: true, bloqueado: false };
        encaixar(imagem, caixaDosEquipamentos(), 120);
        var novo = Object.assign({}, estado.mapa || { regioes: [], largura: 1000, altura: 1000 }, { imagem: imagem });
        if (!novo.regioes) novo.regioes = [];
        var v = Esquema.validarMapa(novo);
        if (!v.ok) throw new Error(v.mensagem);
        estado.mapa = v.dados;
        alvoAjuste = "imagem";
        avisar("Imagem no fundo. Ela é só um desenho: não tem municípios nem coordenadas. Ajuste tamanho, posição e opacidade no painel.");
        mudou(true);
      } catch (e) { avisar("Não deu para usar a imagem: " + (e.message || e)); }
    });

    // Estilos prontos.
    function aplicarEstilo(nome) {
      if (!temRegioes()) return;
      var e = ESTILOS_MAPA[nome];
      Object.assign(estado.mapa, { estilo: nome, cor: e.cor, contorno: e.contorno, sombra: e.sombra, cabosPretos: e.cabosPretos });
      mudou(true);
    }
    campo("mapaEstiloReferencia").addEventListener("click", function () { aplicarEstilo("referencia"); });
    campo("mapaEstiloGrafo").addEventListener("click", function () { aplicarEstilo("grafo"); });
    campo("mapaCor").addEventListener("input", function (e) { if (!temRegioes()) return; estado.mapa.cor = e.target.value; mudou(false); });
    campo("mapaContorno").addEventListener("input", function (e) { if (!temRegioes()) return; estado.mapa.contorno = e.target.value; mudou(false); });
    campo("mapaSombra").addEventListener("change", function (e) { if (!temRegioes()) return; estado.mapa.sombra = e.target.checked; mudou(false); });
    campo("mapaNomes").addEventListener("change", function (e) { if (!temRegioes()) return; estado.mapa.nomes = e.target.checked; mudou(false); });
    campo("mapaCabosPretos").addEventListener("change", function (e) { if (!temRegioes()) return; estado.mapa.cabosPretos = e.target.checked; mudou(true); });

    // Municípios: mostrar/ocultar, cor própria, busca, só os marcados.
    buscaRegiao.addEventListener("input", montarListaRegioes);
    listaRegioes.addEventListener("change", function (e) {
      var i = e.target.getAttribute("data-regiao");
      if (i != null) { estado.mapa.regioes[+i].oculta = !e.target.checked; if (!estado.mapa.regioes[+i].oculta) delete estado.mapa.regioes[+i].oculta; mudou(false); return; }
      var k = e.target.getAttribute("data-regiao-cor");
      if (k != null) { estado.mapa.regioes[+k].cor = e.target.value; mudou(false); }
    });
    campo("mapaMarcarTodos").addEventListener("click", function () { estado.mapa.regioes.forEach(function (r) { delete r.oculta; }); mudou(false); });
    campo("mapaDesmarcarTodos").addEventListener("click", function () {
      // Os da busca atual (ou todos): útil para depois marcar só os da rota.
      var termo = normalizarTextoEquipamento(buscaRegiao.value);
      estado.mapa.regioes.forEach(function (r) { if (!termo || normalizarTextoEquipamento(r.nome).indexOf(termo) >= 0) r.oculta = true; });
      mudou(false);
    });
    campo("mapaSoComEquipamentos").addEventListener("click", function () {
      var usados = {};
      estado.equipamentos.forEach(function (eq) { var i = regiaoPorNome(eq.municipio); if (i >= 0) usados[i] = true; });
      if (!Object.keys(usados).length) { avisar("Nenhum equipamento tem município. Escolha o município na edição do equipamento."); return; }
      estado.mapa.regioes.forEach(function (r, i) { if (usados[i]) delete r.oculta; else r.oculta = true; });
      mudou(false);
    });
    campo("mapaEncaixarSelecao").addEventListener("click", function () {
      if (!temRegioes()) return;
      // Encaixa a região visível em volta dos equipamentos, mantendo a proporção.
      var regiao = caixaDasRegioesVisiveis();
      if (!regiao) return;
      var m = estado.mapa, eqs = caixaDosEquipamentos();
      var w = eqs.x2 - eqs.x1 + 240, h = eqs.y2 - eqs.y1 + 240;
      var esc = Math.max(w / (regiao.x2 - regiao.x1), h / (regiao.y2 - regiao.y1));
      m.escala = Math.round(esc * 1000) / 1000;
      m.x = Math.round((eqs.x1 + eqs.x2) / 2 - (regiao.x1 + regiao.x2) / 2 * esc);
      m.y = Math.round((eqs.y1 + eqs.y2) / 2 - (regiao.y1 + regiao.y2) / 2 * esc);
      mudou(false);
    });
    campo("mapaPosicionar").addEventListener("click", function () {
      var n = posicionarNosMunicipios(null);
      if (!n) { avisar("Nenhum equipamento com município (ou todos estão fixados). Escolha o município na edição do equipamento."); return; }
      avisar(n + (n === 1 ? " equipamento colocado" : " equipamentos colocados") + " dentro do seu município.");
      salvarLocal(); gerar();
    });

    // Ajuste de posição: municípios ou imagem.
    campo("mapaAlvoMunicipios").addEventListener("click", function () { alvoAjuste = "municipios"; atualizarPainel(); });
    campo("mapaAlvoImagem").addEventListener("click", function () { alvoAjuste = "imagem"; atualizarPainel(); });
    painel.querySelectorAll("[data-mapa-mover]").forEach(function (b) {
      b.addEventListener("click", function () {
        var obj = alvoAjuste === "imagem" ? (temImagemDeFundo() && estado.mapa.imagem) : (temRegioes() && estado.mapa);
        if (!obj) return;
        if (alvoAjuste === "imagem" && obj.bloqueado) { avisar("A imagem está bloqueada. Desmarque \"Bloquear\" para mexer."); return; }
        var passo = 40, dir = b.getAttribute("data-mapa-mover");
        if (dir === "cima") obj.y -= passo;
        if (dir === "baixo") obj.y += passo;
        if (dir === "esquerda") obj.x -= passo;
        if (dir === "direita") obj.x += passo;
        if (dir === "maior" || dir === "menor") {
          var f = dir === "maior" ? 1.1 : 1 / 1.1;
          var cx = obj.x + obj.largura * obj.escala / 2, cy = obj.y + obj.altura * obj.escala / 2;
          obj.escala = Math.max(0.01, Math.min(500, Math.round(obj.escala * f * 10000) / 10000));
          obj.x = Math.round(cx - obj.largura * obj.escala / 2); obj.y = Math.round(cy - obj.altura * obj.escala / 2);
        }
        mudou(false);
      });
    });
    campo("mapaEnquadrar").addEventListener("click", function () {
      if (alvoAjuste === "imagem" && temImagemDeFundo()) { if (estado.mapa.imagem.bloqueado) return; encaixar(estado.mapa.imagem, caixaDosEquipamentos(), 120); }
      else if (temRegioes()) encaixar(estado.mapa, caixaDosEquipamentos(), 120);
      mudou(false);
    });
    // Imagem: opacidade, rotação, visível, bloqueada, trocar, remover.
    campo("mapaOpacidade").addEventListener("input", function (e) { if (!temImagemDeFundo() || estado.mapa.imagem.bloqueado) return; estado.mapa.imagem.opacidade = Number(e.target.value) / 100; mudou(false); });
    campo("mapaRotacao").addEventListener("input", function (e) { if (!temImagemDeFundo() || estado.mapa.imagem.bloqueado) return; estado.mapa.imagem.rotacao = Number(e.target.value); mudou(false); });
    campo("mapaImagemVisivel").addEventListener("change", function (e) { if (!temImagemDeFundo()) return; estado.mapa.imagem.visivel = e.target.checked; mudou(false); });
    campo("mapaImagemBloqueada").addEventListener("change", function (e) { if (!temImagemDeFundo()) return; estado.mapa.imagem.bloqueado = e.target.checked; mudou(false); });
    campo("mapaRemoverImagem").addEventListener("click", function () { if (!temImagemDeFundo()) return; delete estado.mapa.imagem; if (!temRegioes()) delete estado.mapa; mudou(true); });
    campo("mapaRemover").addEventListener("click", async function () {
      if (!temRegioes()) return;
      if (!await abrirModal({ title: "Remover os municípios", message: "Tirar os municípios do fundo deste diagrama? Equipamentos e cabos ficam como estão.", confirmText: "Remover" })) return;
      estado.mapa.regioes = [];
      if (!temImagemDeFundo()) delete estado.mapa;
      mudou(true);
    });
  })();

  // ---- Município no editor do equipamento ----
  // Lista os municípios do mapa; ao salvar com município novo, o equipamento vai
  // para dentro dele (a não ser que esteja fixado).
  function preencherCampoMunicipio(select, valor) {
    if (!select) return;
    var nomes = temRegioes() ? estado.mapa.regioes.map(function (r) { return r.nome; }).filter(Boolean) : [];
    nomes = nomes.filter(function (n, i) { return nomes.indexOf(n) === i; }).sort(function (a, b) { return a.localeCompare(b, "pt"); });
    if (valor && nomes.indexOf(valor) < 0) nomes.unshift(valor);
    select.innerHTML = '<option value="">— nenhum —</option>' + nomes.map(function (n) { return '<option value="' + escaparHtml(n) + '">' + escaparHtml(n) + "</option>"; }).join("");
    select.value = valor || "";
    var rotulo = select.closest("label");
    if (rotulo) rotulo.hidden = !temRegioes() && !valor;
  }

