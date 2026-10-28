  // ==== 01-estado-e-vista.js: estado do editor, elementos da página, zoom/arraste da vista e viewBox (parte de assets/js/editor/app.js; npm run montar) ====
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

  // Sem arredondar: a animação do zoom dá passos pequenos que o arredondamento
  // "comia" (em 12%, 0.1212 virava 0.12 e o zoom travava). A tela mostra o valor redondo.
  function limitarZoom(valor) { return Math.min(3, Math.max(0.04, Number(valor) || 1)); }

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

  // Medidas que não mudam durante um arraste (formato dos equipamentos, das
  // portas e dos rótulos: só a posição muda). Guardadas enquanto o arraste dura:
  // medir (getBBox) logo depois de mover algo obriga o navegador a recalcular o
  // layout, e o redesenho dos cabos media várias vezes por quadro.
  var cacheMedidas = null;
  function medir(el) {
    if (!cacheMedidas) return el.getBBox();
    var b = cacheMedidas.get(el);
    if (!b) { b = el.getBBox(); cacheMedidas.set(el, b); }
    return b;
  }
  function iniciarCacheDeMedidas() { cacheMedidas = new WeakMap(); }
  function encerrarCacheDeMedidas() { cacheMedidas = null; }
  // Caixa de um grupo: ajustarCaixasDosGrupos grava as medidas que acabou de
  // desenhar (el.__caixa), e quem vem depois lê sem medir de novo.
  function caixaDoGrupo(forma) {
    if (forma && forma.__caixa) return forma.__caixa;
    return forma ? forma.getBBox() : null;
  }

  // Tamanho da área do diagrama, guardado: ler clientWidth logo depois de mover
  // o SVG obriga o navegador a recalcular o layout da página a cada quadro.
  // O ResizeObserver (05-zoom…) atualiza quando a área muda de tamanho.
  var tamanhoAreaCanvas = null;
  function tamanhoDaArea() {
    if (!tamanhoAreaCanvas || !tamanhoAreaCanvas.w) tamanhoAreaCanvas = { w: elCanvas.clientWidth, h: elCanvas.clientHeight };
    return tamanhoAreaCanvas;
  }

  // Pan livre, mas sempre deixando ao menos MARGEM px do diagrama visíveis.
  function limitarPan(svg) {
    var MARGEM = 80;
    var tamanho = tamanhoNaturalSvg(svg);
    var largura = tamanho.largura * canvasView.scale;
    var altura = tamanho.altura * canvasView.scale;
    var area = tamanhoDaArea();
    var larguraCanvas = area.w;
    var alturaCanvas = area.h;
    if (!larguraCanvas || !alturaCanvas || !largura || !altura) return;
    canvasView.x = Math.min(larguraCanvas - MARGEM, Math.max(MARGEM - largura, canvasView.x));
    canvasView.y = Math.min(alturaCanvas - MARGEM, Math.max(MARGEM - altura, canvasView.y));
  }

  var textoZoomAtual = "";
  function aplicarCanvasView() {
    var svg = elCanvas.querySelector("svg");
    if (svg) {
      limitarPan(svg);
      // translate3d: fica na GPU; com .interagindo (will-change) o movimento nem repinta.
      svg.style.transform = "translate3d(" + canvasView.x + "px, " + canvasView.y + "px, 0) scale(" + canvasView.scale + ")";
    }
    var texto = Math.round(canvasView.scale * 100) + "%";
    if (texto !== textoZoomAtual) { elZoomValue.textContent = texto; textoZoomAtual = texto; }
  }

  // ---- Câmera suave -------------------------------------------------------------
  // Zoom e "ajustar à tela" deslizam até o alvo a cada quadro (requestAnimationFrame),
  // com desaceleração exponencial independente da taxa de quadros. Antes era uma
  // transição CSS que recomeçava a cada giro da roda e "engasgava". O arrastar
  // (pan) segue o ponteiro sem atraso, agrupado por quadro.
  // Durante o movimento o SVG vira camada da GPU (.interagindo -> will-change):
  // mover e ampliar não repinta nada; ao parar, ele é redesenhado nítido.
  var reduzirMovimentoCamera = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var camera = { alvo: null, ancora: null, suavidade: 0.2, quadro: 0, ultimo: 0 };
  var timerInteracao = null;
  var panAgendado = false;

  function marcarInteracao() {
    elCanvas.classList.add("interagindo");
    clearTimeout(timerInteracao);
    timerInteracao = setTimeout(function () {
      if (!camera.quadro && !canvasView.dragging) elCanvas.classList.remove("interagindo");
    }, 160);
  }

  function passoCamera(agora) {
    camera.quadro = 0;
    var alvo = camera.alvo;
    if (!alvo) return;
    var dt = camera.ultimo ? Math.min(64, agora - camera.ultimo) : 16.7;
    camera.ultimo = agora;
    var k = 1 - Math.pow(1 - camera.suavidade, dt / 16.7);
    var s0 = canvasView.scale;
    var s1 = Math.exp(Math.log(s0) + (Math.log(alvo.scale) - Math.log(s0)) * k);
    var fim;
    if (camera.ancora) {
      // Zoom em torno de um ponto (cursor ou centro): o ponto fica parado na tela.
      if (Math.abs(Math.log(alvo.scale / s1)) < 0.0015) s1 = alvo.scale;
      var px = camera.ancora.x, py = camera.ancora.y;
      canvasView.x = px - (px - canvasView.x) * s1 / s0;
      canvasView.y = py - (py - canvasView.y) * s1 / s0;
      canvasView.scale = s1;
      fim = s1 === alvo.scale;
    } else {
      canvasView.x += (alvo.x - canvasView.x) * k;
      canvasView.y += (alvo.y - canvasView.y) * k;
      canvasView.scale = s1;
      fim = Math.abs(Math.log(alvo.scale / s1)) < 0.0015 && Math.abs(alvo.x - canvasView.x) < 0.4 && Math.abs(alvo.y - canvasView.y) < 0.4;
      if (fim) { canvasView.x = alvo.x; canvasView.y = alvo.y; canvasView.scale = alvo.scale; }
    }
    aplicarCanvasView();
    if (fim) { camera.alvo = null; camera.ultimo = 0; marcarInteracao(); return; }
    camera.quadro = requestAnimationFrame(passoCamera);
  }

  function iniciarCamera() {
    marcarInteracao();
    if (reduzirMovimentoCamera && reduzirMovimentoCamera.matches) camera.suavidade = 1;
    if (!camera.quadro) { camera.ultimo = 0; camera.quadro = requestAnimationFrame(passoCamera); }
  }

  function pararCamera() {
    if (camera.quadro) cancelAnimationFrame(camera.quadro);
    camera.quadro = 0; camera.alvo = null; camera.ultimo = 0;
  }

  // Zoom animado por um fator, em torno de (px, py) do canvas (centro, se omitido).
  // Giros seguidos acumulam no alvo, então a roda rápida não perde passos.
  // suavidade: fração do caminho por quadro (0.2 = deslize; 0.5 = quase imediato).
  function zoomSuave(fator, px, py, suavidade) {
    if (px == null || py == null) { px = elCanvas.clientWidth / 2; py = elCanvas.clientHeight / 2; }
    var base = camera.alvo && camera.ancora ? camera.alvo.scale : canvasView.scale;
    camera.alvo = { scale: limitarZoom(base * fator) };
    camera.ancora = { x: px, y: py };
    camera.suavidade = suavidade || 0.2;
    iniciarCamera();
  }

  function moverCameraPara(scale, x, y) {
    camera.alvo = { scale: limitarZoom(scale), x: x, y: y };
    camera.ancora = null;
    camera.suavidade = 0.16;
    iniciarCamera();
  }

  // Pan: grava a posição e desenha uma vez por quadro, por mais eventos que cheguem.
  function agendarPan() {
    marcarInteracao();
    if (panAgendado) return;
    panAgendado = true;
    requestAnimationFrame(function () { panAgendado = false; aplicarCanvasView(); });
  }

  // Centraliza o diagrama e escolhe um zoom (até 100%) em que ele caiba inteiro.
  // animar: desliza até lá (botão ↺); sem animar, vai direto (primeira renderização).
  function ajustarATela(animar) {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var tamanho = tamanhoNaturalSvg(svg);
    var larguraCanvas = elCanvas.clientWidth;
    var alturaCanvas = elCanvas.clientHeight;
    if (!tamanho.largura || !tamanho.altura || !larguraCanvas || !alturaCanvas) return;
    var folga = 32;
    // Área livre de verdade: sem a caixa de ferramentas presa à esquerda do
    // quadro e só a parte do quadro que cabe na tela (no celular ele é mais
    // alto que a tela e o desenho ia parar lá embaixo).
    var quadro = elCanvas.getBoundingClientRect();
    var esquerda = 0;
    var caixa = document.getElementById("caixaFerramentas");
    if (caixa && caixa.offsetParent) {
      var rc = caixa.getBoundingClientRect();
      if (rc.left < quadro.left + quadro.width / 3 && rc.height > rc.width) esquerda = Math.max(0, rc.right - quadro.left + 8);
    }
    var alturaVisivel = Math.max(160, Math.min(alturaCanvas, window.innerHeight - Math.max(0, quadro.top)));
    var larguraLivre = larguraCanvas - esquerda;
    var escala = limitarZoom(Math.min(1, (larguraLivre - folga) / tamanho.largura, (alturaVisivel - folga) / tamanho.altura));
    var x = esquerda + (larguraLivre - tamanho.largura * escala) / 2;
    var y = Math.max(folga / 2, (alturaVisivel - tamanho.altura * escala) / 2);
    if (animar === true) { moverCameraPara(escala, x, y); return; }
    pararCamera();
    canvasView.scale = escala;
    canvasView.x = x;
    canvasView.y = y;
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
      if (!el.classList || !(el.classList.contains("node") || el.classList.contains("edge") || el.classList.contains("cluster") || el.classList.contains("anotacao") || el.classList.contains("legenda-cabos") || el.classList.contains("camada-mapa"))) return;
      var b;
      try { b = el.getBBox(); } catch (e) { return; }
      // Mapa recortado: conta só a área do recorte (getBBox ignora o clip-path).
      var recorte = el.classList.contains("camada-mapa") && el.querySelector("clipPath rect");
      if (recorte) { try { var rb = recorte.getBBox(); b = { x: Math.max(b.x, rb.x), y: Math.max(b.y, rb.y), width: Math.min(b.x + b.width, rb.x + rb.width) - Math.max(b.x, rb.x), height: Math.min(b.y + b.height, rb.y + rb.height) - Math.max(b.y, rb.y) }; } catch (e) {} }
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

