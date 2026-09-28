  // ==== 01-estado-e-vista.js: estado do editor, elementos da página, zoom/arraste da vista e viewBox (parte de assets/js/app.js; npm run montar) ====
  var contadorId = 1;
  function novoId() { return "eq" + (contadorId++) + "_" + Math.random().toString(36).slice(2, 6); }

  var estado = { equipamentos: [], conexoes: [] };

  var elListaEquip = document.getElementById("listaEquip");
  var elListaConex = document.getElementById("listaConex");
  var elFiltroEquip = document.getElementById("filtroEquip");
  var elFiltroConex = document.getElementById("filtroConex");
  var elFormEquip = document.getElementById("formEquipamento");
  var elFormCab = document.getElementById("formCabemamento");
  var elErro = document.getElementById("erro");
  var elCanvas = document.getElementById("canvas");
  var elZoomValue = document.getElementById("zoomValue");
  var elWorkspace = document.getElementById("workspace");
  var elPainelDados = document.getElementById("painelDados");
  var elProjetoSelect = document.getElementById("projetoSelect");
  var elLegenda = document.getElementById("legenda");
  var elDotCode = document.getElementById("dot-code");
  var elJsonAvancado = document.getElementById("jsonAvancado");
  var btnGerar = document.getElementById("btnGerar");
  var btnOrganizar = document.getElementById("btnOrganizarDiagrama");
  var btnCopiar = document.getElementById("btnCopiarDot");
  var btnBaixar = document.getElementById("btnBaixar");
  var btnBaixarPng = document.getElementById("btnBaixarPng");
  var btnDesfazer = document.getElementById("btnDesfazer");
  var btnRefazer = document.getElementById("btnRefazer");
  var selDirecao = document.getElementById("direcao");
  var btnTema = document.getElementById("btnTema");
  var btnModoAvancado = document.getElementById("btnModoAvancado");
  var btnSidebarCollapse = document.getElementById("btnSidebarCollapse");
  var elSidebar = document.querySelector(".sidebar");

  document.querySelectorAll(".nav-item").forEach(function (item) {
    if (!item.title) item.title = item.textContent.trim();
  });

  var ultimoDot = "";
  var downloadsCap = null;
  var projetos = {};
  var projetoAtual = "Projeto principal";
  var historicoDesfazer = [];
  var historicoRefazer = [];
  var ultimoEstadoHistorico = null;
  var aplicandoHistorico = false;
  var atualizacaoDiagramaPendente = null;
  var canvasView = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
  var LIMITE_CANVAS = LIMITES.canvas;
  Object.defineProperty(window, 'LIMITE_CANVAS', { value: LIMITE_CANVAS, configurable: true, writable: true, enumerable: true });
  Object.defineProperty(globalThis, 'LIMITE_CANVAS', { value: LIMITE_CANVAS, configurable: true, writable: true, enumerable: true });

  function limitarZoom(valor) { return Math.min(3, Math.max(0.08, Number(valor.toFixed(2)))); }

  function limitarPosicaoNoCanvas(valor, min, max) {
    var numero = Number(valor) || 0;
    if (!Number.isFinite(numero)) return min;
    return Math.min(max, Math.max(min, numero));
  }

  function normalizarEquipamentoDentroDoCanvas(equipamento) {
    if (!equipamento || !equipamento.deslocamento) return equipamento;
    equipamento.deslocamento.x = limitarPosicaoNoCanvas(equipamento.deslocamento.x, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
    equipamento.deslocamento.y = limitarPosicaoNoCanvas(equipamento.deslocamento.y, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
    return equipamento;
  }

  // Largura/altura do SVG em px sem zoom (o Graphviz usa "pt": 1pt = 4/3 px).
  function comprimentoEmPx(valor) {
    var n = parseFloat(valor) || 0;
    return /pt$/i.test(String(valor || "")) ? n * 4 / 3 : n;
  }
  function tamanhoNaturalSvg(svg) {
    return { largura: comprimentoEmPx(svg.getAttribute("width")), altura: comprimentoEmPx(svg.getAttribute("height")) };
  }

  // Pan livre, mas sempre deixando ao menos MARGEM px do diagrama visíveis.
  function limitarPan(svg) {
    var MARGEM = 80;
    var tamanho = tamanhoNaturalSvg(svg);
    var largura = tamanho.largura * canvasView.scale;
    var altura = tamanho.altura * canvasView.scale;
    var larguraCanvas = elCanvas.clientWidth;
    var alturaCanvas = elCanvas.clientHeight;
    if (!larguraCanvas || !alturaCanvas || !largura || !altura) return;
    canvasView.x = Math.min(larguraCanvas - MARGEM, Math.max(MARGEM - largura, canvasView.x));
    canvasView.y = Math.min(alturaCanvas - MARGEM, Math.max(MARGEM - altura, canvasView.y));
  }

  function aplicarCanvasView() {
    var svg = elCanvas.querySelector("svg");
    if (svg) {
      limitarPan(svg);
      svg.style.transform = "translate(" + canvasView.x + "px, " + canvasView.y + "px) scale(" + canvasView.scale + ")";
    }
    elZoomValue.textContent = Math.round(canvasView.scale * 100) + "%";
  }

  // Centraliza o diagrama e escolhe um zoom (até 100%) em que ele caiba inteiro.
  function ajustarATela() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var tamanho = tamanhoNaturalSvg(svg);
    var larguraCanvas = elCanvas.clientWidth;
    var alturaCanvas = elCanvas.clientHeight;
    if (!tamanho.largura || !tamanho.altura || !larguraCanvas || !alturaCanvas) return;
    var folga = 32;
    canvasView.scale = limitarZoom(Math.min(1, (larguraCanvas - folga) / tamanho.largura, (alturaCanvas - folga) / tamanho.altura));
    canvasView.x = (larguraCanvas - tamanho.largura * canvasView.scale) / 2;
    canvasView.y = (alturaCanvas - tamanho.altura * canvasView.scale) / 2;
    aplicarCanvasView();
  }

  function translateDoElemento(el) {
    var m = /translate\(\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*[, ]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i.exec(el.getAttribute("transform") || "");
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
  }

  // Equipamentos arrastados/organizados podem sair da área original que o
  // Graphviz calculou. Recalcula o viewBox para envolver todo o conteúdo, senão
  // o que fica fora é cortado (inclusive na exportação SVG/PNG).
  // manterPosicao: compensa o pan para o diagrama não "pular" na tela.
  function ajustarViewBoxAoConteudo(manterPosicao) {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Array.prototype.forEach.call(grafo.children, function (el) {
      if (!el.classList || !(el.classList.contains("node") || el.classList.contains("edge") || el.classList.contains("cluster"))) return;
      var b;
      try { b = el.getBBox(); } catch (e) { return; }
      if (!b || (!b.width && !b.height)) return;
      var t = translateDoElemento(el);
      minX = Math.min(minX, b.x + t.x);
      minY = Math.min(minY, b.y + t.y);
      maxX = Math.max(maxX, b.x + t.x + b.width);
      maxY = Math.max(maxY, b.y + t.y + b.height);
    });
    if (!Number.isFinite(minX)) return;

    // Coordenadas do grupo g.graph -> coordenadas do viewBox (o Graphviz usa translate/scale).
    var matriz = grafo.transform && grafo.transform.baseVal.consolidate();
    var m = matriz ? matriz.matrix : { a: 1, d: 1, e: 0, f: 0 };
    var margem = 24;
    var x1 = Math.min(m.a * minX, m.a * maxX) + m.e - margem;
    var y1 = Math.min(m.d * minY, m.d * maxY) + m.f - margem;
    var largura = Math.abs(m.a * (maxX - minX)) + margem * 2;
    var altura = Math.abs(m.d * (maxY - minY)) + margem * 2;

    var vbAntigo = svg.viewBox.baseVal;
    var pxPorUnidade = vbAntigo && vbAntigo.width ? tamanhoNaturalSvg(svg).largura / vbAntigo.width : 4 / 3;
    if (manterPosicao && vbAntigo && vbAntigo.width) {
      canvasView.x += (x1 - vbAntigo.x) * pxPorUnidade * canvasView.scale;
      canvasView.y += (y1 - vbAntigo.y) * pxPorUnidade * canvasView.scale;
    }
    svg.setAttribute("viewBox", [x1, y1, largura, altura].map(function (v) { return v.toFixed(2); }).join(" "));
    svg.setAttribute("width", (largura * pxPorUnidade).toFixed(2) + "px");
    svg.setAttribute("height", (altura * pxPorUnidade).toFixed(2) + "px");
    aplicarCanvasView();
  }

  // Depois de mover equipamentos: recalcula cabos e área do diagrama na hora.
  function finalizarMovimento() {
    if (roteamentoCabosFrame) { cancelAnimationFrame(roteamentoCabosFrame); roteamentoCabosFrame = null; }
    ajustarCaixasDosGrupos();
    rotearCabosOrtogonalmente();
    ajustarViewBoxAoConteudo(true);
  }

  // Cada nó/aresta do SVG recebe id="equip_N"/"edge_N" no DOT (N = posição na
  // renderização). Estas listas guardam o que foi renderizado, para não depender
  // do texto do <title>, que o Graphviz pode alterar.
  var idsEquipRenderizados = [];
  var conexoesRenderizadas = [];

  function idEquipamentoDoNode(node) {
    var m = /^equip_(\d+)$/.exec(node && node.id || "");
    return m ? idsEquipRenderizados[Number(m[1])] || null : null;
  }

  function conexaoDaAresta(aresta) {
    var m = /^edge_(\d+)$/.exec(aresta && aresta.id || "");
    return m ? conexoesRenderizadas[Number(m[1])] || null : null;
  }

  function aplicarPosicoesEquipamentos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.node").forEach(function (node) {
      var idNode = idEquipamentoDoNode(node);
      if (!idNode) return;
      var equipamento = estado.equipamentos.find(function (eq) { return eq.id === idNode; });
      if (!equipamento || !equipamento.deslocamento) return;
      normalizarEquipamentoDentroDoCanvas(equipamento);
      atualizarPosicaoAbsoluta(equipamento);
      node.setAttribute("transform", "translate(" + equipamento.deslocamento.x + "," + equipamento.deslocamento.y + ")");
    });
  }

  window.limitarPosicaoNoCanvas = limitarPosicaoNoCanvas;
  window.normalizarEquipamentoDentroDoCanvas = normalizarEquipamentoDentroDoCanvas;
  window.LIMITE_CANVAS = LIMITE_CANVAS;
  globalThis.limitarPosicaoNoCanvas = limitarPosicaoNoCanvas;
  globalThis.normalizarEquipamentoDentroDoCanvas = normalizarEquipamentoDentroDoCanvas;
  globalThis.LIMITE_CANVAS = LIMITE_CANVAS;

  function numeroSvg(valor) {
    var n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function obterNodePorId(svg, id) {
    var encontrado = null;
    svg.querySelectorAll("g.node").forEach(function (node) {
      if (!encontrado && idEquipamentoDoNode(node) === id) encontrado = node;
    });
    return encontrado;
  }

