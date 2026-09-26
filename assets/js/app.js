(function () {
  "use strict";

  var ICONES = [""];
  var EQUIPAMENTOS_API_URL = (window.EQUIPAMENTOS_API_URL && window.EQUIPAMENTOS_API_URL.trim()) || "/api/equipamentos";

  function resolverUrlRelativa(origem) {
    if (!origem) return origem;
    if (/^(data:|blob:|https?:|\/\/)/i.test(origem)) return origem;
    var arquivo = String(origem).trim();
    if (!arquivo) return origem;
    var caminho = arquivo.replace(/\\/g, "/");
    try {
      if (!caminho.startsWith("/")) {
        return new URL("./" + caminho, document.baseURI || window.location.href).href;
      }
      return new URL(caminho, document.baseURI || window.location.href).href;
    } catch (e) {
      return arquivo;
    }
  }

  function normalizarNomeArquivoImagem(valor) {
    return String(valor || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  }

  var ASSET_BASE = "./assets/images/";
  var ASSET_FALLBACK_BASE = "./";

  function caminhoImagem(nomeArquivo) {
    if (!nomeArquivo) return "";
    var nome = String(nomeArquivo).trim();
    if (!nome) return "";
    if (/^(data:|blob:|https?:|\/\/)/i.test(nome)) return nome;
    var caminhoPadrao = nome.replace(/\\/g, "/");
    var semPrefixo = caminhoPadrao.replace(/^\.\//, "");
    var candidatos = [
      ASSET_BASE + semPrefixo,
      ASSET_FALLBACK_BASE + semPrefixo,
      semPrefixo,
      ASSET_BASE + nome,
      ASSET_FALLBACK_BASE + nome
    ];
    return candidatos.find(function (caminho) {
      return Boolean(caminho) && !caminho.includes("undefined");
    }) || caminhoPadrao;
  }

  var TIPOS_BASE = [
    { nome: "OLT", icone: caminhoImagem("OLT.jpeg") },
    { nome: "Switch", icone: caminhoImagem("SWITCH.jpeg") },
    { nome: "Roteador", icone: caminhoImagem("MIKROTIK.png") },
    { nome: "Rádio", icone: "" },
    { nome: "ONT", icone: "" },
    { nome: "ONU", icone: "" },
    { nome: "Firewall", icone: "" },
    { nome: "Servidor", icone: "" },
    { nome: "Antena", icone: "" },
    { nome: "MikroTik", icone: caminhoImagem("MIKROTIK.png") },
    { nome: "UPS", icone: caminhoImagem("NOBREAK.jpeg") },
    { nome: "Nobreak", icone: caminhoImagem("NOBREAK.jpeg") }
  ];
  var CATALOGO_ICONES = [
    { valor: caminhoImagem("MIKROTIK.png"), nome: "MikroTik / RB", arquivo: caminhoImagem("MIKROTIK.png") },
    { valor: caminhoImagem("OLT.jpeg"), nome: "OLT", arquivo: caminhoImagem("OLT.jpeg") },
    { valor: caminhoImagem("SWITCH.jpeg"), nome: "Switch", arquivo: caminhoImagem("SWITCH.jpeg") },
    { valor: caminhoImagem("RETIFICADOR.jpeg"), nome: "Retificador / RPS", arquivo: caminhoImagem("RETIFICADOR.jpeg") },
    { valor: caminhoImagem("NOBREAK.jpeg"), nome: "Nobreak", arquivo: caminhoImagem("NOBREAK.jpeg") },
    { valor: caminhoImagem("VOLT.jpeg"), nome: "Módulo / Conversor", arquivo: caminhoImagem("VOLT.jpeg") }
  ];
  var catalogoTiposEquipamentos = TIPOS_BASE.slice();

  function normalizarTextoEquipamento(valor) {
    return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  function extrairNomeTipo(item) {
    if (!item) return "";
    return item.nome || item.tipo || item.tipoequipamento || item.label || item.value || "";
  }

  function extrairIconeTipo(item) {
    if (!item) return "";
    return item.icone || item.arquivo || item.imagem || item.iconeArquivo || item.icon || "";
  }

  function imagemDoIcone(valor) {
    if (!valor) return "";
    var valorNormalizado = normalizarNomeArquivoImagem(valor);
    var item = CATALOGO_ICONES.find(function (icone) {
      var alvo = normalizarNomeArquivoImagem(icone.valor || icone.arquivo || icone.nome || "");
      return alvo === valorNormalizado || normalizarNomeArquivoImagem(icone.arquivo || "") === valorNormalizado;
    });
    if (item) return item.arquivo || "";

    var valorEmTexto = String(valor || "").toLowerCase();
    if (valorEmTexto.indexOf("mikrotik") >= 0 || valorEmTexto.indexOf("rb/") >= 0 || valorEmTexto.indexOf("roteador") >= 0) return caminhoImagem("MIKROTIK.png");
    if (valorEmTexto.indexOf("switch") >= 0) return caminhoImagem("SWITCH.jpeg");
    if (valorEmTexto.indexOf("olt") >= 0) return caminhoImagem("OLT.jpeg");
    if (valorEmTexto.indexOf("retificador") >= 0 || valorEmTexto.indexOf("rps") >= 0) return caminhoImagem("RETIFICADOR.jpeg");
    if (valorEmTexto.indexOf("nobreak") >= 0 || valorEmTexto.indexOf("nobreack") >= 0) return caminhoImagem("NOBREAK.jpeg");
    if (valorEmTexto.indexOf("conversor") >= 0 || valorEmTexto.indexOf("modulo") >= 0 || valorEmTexto.indexOf("volt") >= 0) return caminhoImagem("VOLT.jpeg");
    return "";
  }

  function renderizarTiposSugeridos() {
    var datalist = document.getElementById("tipos-sugeridos");
    if (!datalist) return;
    var itens = [];
    catalogoTiposEquipamentos.forEach(function (tipo) {
      var nome = extrairNomeTipo(tipo);
      if (!nome) return;
      var chave = normalizarTextoEquipamento(nome);
      if (!itens.some(function (entry) { return normalizarTextoEquipamento(entry.nome) === chave; })) {
        itens.push({ nome: nome, icone: extrairIconeTipo(tipo) });
      }
    });
    datalist.innerHTML = itens.map(function (tipo) {
      return '<option value="' + escaparHtml(tipo.nome) + '"></option>';
    }).join("");
  }

  function buscarTipoNoCatalogo(tipo) {
    var chave = normalizarTextoEquipamento(tipo);
    if (!chave) return null;
    return catalogoTiposEquipamentos.find(function (item) {
      var nome = normalizarTextoEquipamento(extrairNomeTipo(item));
      return nome === chave || nome.indexOf(chave) >= 0 || chave.indexOf(nome) >= 0;
    }) || null;
  }

  function registrarTipoEquipamento(nome, opcoes) {
    var nomeTipo = String(nome || "").trim();
    if (!nomeTipo) return false;
    var item = {
      nome: nomeTipo,
      icone: opcoes && opcoes.icone ? opcoes.icone : ""
    };
    var existente = buscarTipoNoCatalogo(nomeTipo);
    if (existente) {
      if (opcoes && opcoes.icone && !existente.icone) existente.icone = opcoes.icone;
      return true;
    }
    catalogoTiposEquipamentos.push(item);
    renderizarTiposSugeridos();
    return true;
  }

  function aplicarCatalogoExterno(lista) {
    var tipos = Array.isArray(lista) ? lista : [];
    var merge = TIPOS_BASE.slice();
    tipos.forEach(function (item) {
      if (!item) return;
      var nome = String(extrairNomeTipo(item) || "").trim();
      if (!nome) return;
      var icone = extrairIconeTipo(item) || "";
      // A API manda só o nome do arquivo ("OLT.jpeg"); emojis passam direto.
      if (/^[\w.-]+\.(png|jpe?g|gif|svg|webp)$/i.test(icone)) icone = caminhoImagem(icone);
      merge.push({ nome: nome, icone: icone });
    });
    catalogoTiposEquipamentos = merge.filter(function (item, index, array) {
      var nome = String(extrairNomeTipo(item) || "").trim();
      if (!nome) return false;
      return array.findIndex(function (entry) {
        return normalizarTextoEquipamento(extrairNomeTipo(entry)) === normalizarTextoEquipamento(nome);
      }) === index;
    });
    renderizarTiposSugeridos();
  }

  function carregarTiposDeEquipamento() {
    var urls = [EQUIPAMENTOS_API_URL, "/api/equipamentos", "./data/equipamentos.json", "/data/equipamentos.json"];
    var indiceAtual = 0;

    function tentarProximo() {
      if (indiceAtual >= urls.length) {
        catalogoTiposEquipamentos = TIPOS_BASE.slice();
        renderizarTiposSugeridos();
        return;
      }

      var urlAtual = urls[indiceAtual++];
      fetch(urlAtual, { cache: "no-store" })
        .then(function (resposta) {
          if (!resposta.ok) throw new Error("HTTP " + resposta.status);
          return resposta.json();
        })
        .then(function (dados) {
          var lista = Array.isArray(dados) ? dados : (Array.isArray(dados.tipos) ? dados.tipos : []);
          if (lista.length) {
            aplicarCatalogoExterno(lista);
          } else {
            catalogoTiposEquipamentos = TIPOS_BASE.slice();
            renderizarTiposSugeridos();
          }
        })
        .catch(function () {
          tentarProximo();
        });
    }

    tentarProximo();
  }

  function iconePorTipo(tipo) {
    var itemCatalogo = buscarTipoNoCatalogo(tipo);
    if (itemCatalogo && itemCatalogo.icone) return itemCatalogo.icone;

    var chave = normalizarTextoEquipamento(tipo);
    if (chave.indexOf("olt") >= 0) return ASSET_BASE + "OLT.jpeg";
    if (chave.indexOf("switch") >= 0) return ASSET_BASE + "SWITCH.jpeg";
    if (chave.indexOf("roteador") >= 0 || chave.indexOf("mikrotik") >= 0 || chave.indexOf("rb/") >= 0) return ASSET_BASE + "MIKROTIK.png";
    if (chave.indexOf("retificador") >= 0 || chave.indexOf("rps") >= 0) return ASSET_BASE + "RETIFICADOR.jpeg";
    if (chave.indexOf("nobreak") >= 0 || chave.indexOf("nobreack") >= 0) return ASSET_BASE + "NOBREAK.jpeg";
    if (chave.indexOf("conversor") >= 0 || chave.indexOf("modulo") >= 0 || chave.indexOf("volt") >= 0) return ASSET_BASE + "VOLT.jpeg";
    return "";
  }

  window.apiEquipamentos = {
    listar: function () { return catalogoTiposEquipamentos.slice(); },
    registrar: registrarTipoEquipamento,
    recarregar: carregarTiposDeEquipamento,
    url: EQUIPAMENTOS_API_URL
  };

  renderizarTiposSugeridos();
  carregarTiposDeEquipamento();

  var contadorId = 1;
  function novoId() { return "eq" + (contadorId++) + "_" + Math.random().toString(36).slice(2, 6); }

  var estado = { equipamentos: [], conexoes: [] };

  var elListaEquip = document.getElementById("listaEquip");
  var elListaConex = document.getElementById("listaConex");
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
  var LIMITE_CANVAS = { minX: -4200, maxX: 4200, minY: -3200, maxY: 3200 };
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

  // ---- Posições absolutas ---------------------------------------------------
  // eq.posicao guarda o centro do equipamento nas coordenadas do grupo g.graph,
  // que não dependem do layout do Graphviz. O transform de cada nó
  // (eq.deslocamento) é recalculado a cada renderização a partir dela, então o
  // equipamento não "pula" quando as portas mudam de lado e o Graphviz refaz o layout.
  var centrosBase = {};

  function registrarCentrosBase(svg) {
    centrosBase = {};
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      if (!id) return;
      try {
        var b = node.getBBox();
        centrosBase[id] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      } catch (e) {}
    });
  }

  function posicaoValida(p) { return !!p && Number.isFinite(p.x) && Number.isFinite(p.y); }

  // Retorna true se algum equipamento ainda não tinha posição absoluta
  // (equipamento novo ou projeto salvo antes desta versão).
  function sincronizarPosicoes() {
    var novos = false;
    estado.equipamentos.forEach(function (eq) {
      var base = centrosBase[eq.id];
      if (!base) return;
      if (posicaoValida(eq.posicao)) {
        eq.deslocamento = { x: eq.posicao.x - base.x, y: eq.posicao.y - base.y };
      } else {
        var d = eq.deslocamento || { x: 0, y: 0 };
        eq.posicao = { x: base.x + (Number(d.x) || 0), y: base.y + (Number(d.y) || 0) };
        novos = true;
      }
    });
    return novos;
  }

  function atualizarPosicaoAbsoluta(eq) {
    var base = centrosBase[eq.id];
    var d = eq.deslocamento || { x: 0, y: 0 };
    if (base) eq.posicao = { x: base.x + d.x, y: base.y + d.y };
  }

  // ---- Portas ---------------------------------------------------------------
  // A porta fica no lado do equipamento voltado para o equipamento do outro
  // lado do cabo. Sem posição conhecida, usa o padrão do layout.
  function ladoVoltadoPara(origem, destino, padrao) {
    if (!origem || !destino || !posicaoValida(origem.posicao) || !posicaoValida(destino.posicao)) return padrao;
    var dx = destino.posicao.x - origem.posicao.x;
    var dy = destino.posicao.y - origem.posicao.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return padrao;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "direita" : "esquerda";
    return dy > 0 ? "baixo" : "cima";
  }

  // Preenchido por gerarDot: por equipamento, as portas na ordem em que o
  // Graphviz desenha as caixas (cima, esquerda, direita, baixo).
  var portasRenderizadas = {};
  var VETOR_LADO = { esquerda: { x: -1, y: 0 }, direita: { x: 1, y: 0 }, cima: { x: 0, y: -1 }, baixo: { x: 0, y: 1 } };

  // Ponto onde cada ponta de cabo encosta na porta, com a direção de saída:
  // { "3:inicio": { x, y, dx, dy } }. As caixas das portas são os únicos
  // polígonos com borda dentro do nó.
  function obterPontosDasPortas(svg) {
    var pontos = {};
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      var info = id && portasRenderizadas[id];
      if (!info) return;
      var caixas = Array.prototype.filter.call(node.querySelectorAll("polygon"), function (p) {
        var s = String(p.getAttribute("stroke") || "").toLowerCase();
        return s && s !== "none" && s !== "transparent";
      });
      var t = translateDoElemento(node);
      info.ordem.forEach(function (porta, i) {
        var b;
        try { b = caixas[i] && caixas[i].getBBox(); } catch (e) { b = null; }
        if (!b) return;
        var v = VETOR_LADO[porta.lado];
        pontos[porta.indice + ":" + porta.ponta] = {
          x: b.x + b.width / 2 + t.x + v.x * b.width / 2,
          y: b.y + b.height / 2 + t.y + v.y * b.height / 2,
          dx: v.x,
          dy: v.y
        };
      });
    });
    return pontos;
  }

  // ---- Cabos ----------------------------------------------------------------
  var CONFIG_ROTEAMENTO_CABOS = {
    espaco: 12,     // distância mínima entre trilhas paralelas
    saida: 18,      // trecho reto saindo da porta antes da primeira curva
    raioCurva: 10
  };
  var roteamentoCabosFrame = null;

  // Caminho ortogonal com as quinas arredondadas (curva quadrática em cada canto).
  // O raio encolhe em trechos curtos para a curva não passar do segmento.
  function caminhoOrtogonalArredondado(pontos) {
    var p = pontos.filter(function (ponto, i) {
      var anterior = pontos[i - 1];
      return !anterior || Math.abs(anterior.x - ponto.x) > 0.01 || Math.abs(anterior.y - ponto.y) > 0.01;
    });
    function fmt(n) { return n.toFixed(2); }
    var d = "M" + fmt(p[0].x) + "," + fmt(p[0].y);
    for (var i = 1; i < p.length - 1; i++) {
      var a = p[i - 1], b = p[i], c = p[i + 1];
      var lenAntes = Math.hypot(b.x - a.x, b.y - a.y);
      var lenDepois = Math.hypot(c.x - b.x, c.y - b.y);
      var r = Math.min(CONFIG_ROTEAMENTO_CABOS.raioCurva, lenAntes / 2, lenDepois / 2);
      if (r < 0.5) { d += " L" + fmt(b.x) + "," + fmt(b.y); continue; }
      var entrada = { x: b.x - (b.x - a.x) / lenAntes * r, y: b.y - (b.y - a.y) / lenAntes * r };
      var saida = { x: b.x + (c.x - b.x) / lenDepois * r, y: b.y + (c.y - b.y) / lenDepois * r };
      d += " L" + fmt(entrada.x) + "," + fmt(entrada.y) + " Q" + fmt(b.x) + "," + fmt(b.y) + " " + fmt(saida.x) + "," + fmt(saida.y);
    }
    var ultimo = p[p.length - 1];
    if (p.length > 1) d += " L" + fmt(ultimo.x) + "," + fmt(ultimo.y);
    return d;
  }

  function segmentosDaRota(pontos) {
    var segmentos = [];
    for (var i = 1; i < pontos.length; i++) {
      var p = pontos[i - 1], q = pontos[i];
      if (Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01) continue;
      segmentos.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, horizontal: Math.abs(p.y - q.y) < 0.5 });
    }
    return segmentos;
  }

  function intervalosSobrepoem(a1, a2, b1, b2) {
    return Math.max(a1, a2) > Math.min(b1, b2) + 0.5 && Math.max(b1, b2) > Math.min(a1, a2) + 0.5;
  }

  // Custo de uma rota contra os cabos já desenhados: cabo colado/por cima de
  // outro é o pior caso, cruzamento vem logo depois.
  function custoDaRota(pontos, existentes) {
    var espaco = CONFIG_ROTEAMENTO_CABOS.espaco;
    var custo = 0;
    segmentosDaRota(pontos).forEach(function (a) {
      existentes.forEach(function (b) {
        if (a.horizontal !== b.horizontal) {
          var h = a.horizontal ? a : b, v = a.horizontal ? b : a;
          var cruza = v.x1 > Math.min(h.x1, h.x2) + 1 && v.x1 < Math.max(h.x1, h.x2) - 1 &&
            h.y1 > Math.min(v.y1, v.y2) + 1 && h.y1 < Math.max(v.y1, v.y2) - 1;
          if (cruza) custo += 1000;
        } else if (a.horizontal) {
          if (Math.abs(a.y1 - b.y1) < espaco && intervalosSobrepoem(a.x1, a.x2, b.x1, b.x2)) custo += 2000;
        } else if (Math.abs(a.x1 - b.x1) < espaco && intervalosSobrepoem(a.y1, a.y2, b.y1, b.y2)) {
          custo += 2000;
        }
      });
    });
    return custo;
  }

  // Testa a trilha do meio da rota (x de um trecho vertical ou y de um
  // horizontal) em passos de "espaco" ao redor de "preferido" e fica com a de
  // menor custo. Afastar-se do ideal custa pouco perto de evitar um cruzamento.
  function melhorVariante(construir, preferido, existentes, limite1, limite2) {
    var espaco = CONFIG_ROTEAMENTO_CABOS.espaco;
    var temLimite = limite1 != null && limite2 != null;
    var limMin = temLimite ? Math.min(limite1, limite2) : -Infinity;
    var limMax = temLimite ? Math.max(limite1, limite2) : Infinity;
    var melhor = null, melhorCusto = Infinity;
    for (var i = 0; i < 81; i++) {
      var v = preferido + Math.ceil(i / 2) * espaco * (i % 2 ? 1 : -1);
      if (v < limMin || v > limMax) continue;
      var pontos = construir(v);
      var custo = custoDaRota(pontos, existentes) + Math.abs(v - preferido) * 0.5;
      if (custo < melhorCusto) { melhor = pontos; melhorCusto = custo; }
      if (melhorCusto < 1) break;
    }
    return melhor || construir(temLimite ? (limMin + limMax) / 2 : preferido);
  }

  // Pontos de um cabo ortogonal de s até e (cada um com a direção de saída da porta).
  function tracarRota(s, e, existentes) {
    var saida = CONFIG_ROTEAMENTO_CABOS.saida;
    var a = { x: s.x + s.dx * saida, y: s.y + s.dy * saida };
    var b = { x: e.x + e.dx * saida, y: e.y + e.dy * saida };
    var horizS = s.dx !== 0, horizE = e.dx !== 0;

    function trechoVertical(x) { return [s, { x: x, y: s.y }, { x: x, y: e.y }, e]; }
    function trechoHorizontal(y) { return [s, { x: s.x, y: y }, { x: e.x, y: y }, e]; }

    if (horizS && horizE) {
      if (s.dx === -e.dx && (b.x - a.x) * s.dx >= 0) {
        // "Z": portas uma de frente para a outra, trecho vertical no meio.
        return melhorVariante(trechoVertical, (a.x + b.x) / 2, existentes, a.x, b.x);
      }
      if (s.dx === e.dx) {
        // "U": as duas portas do mesmo lado; contorna por fora.
        return melhorVariante(trechoVertical, s.dx > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x), existentes);
      }
      // Portas de costas uma para a outra: sai, cruza pelo meio na horizontal e volta.
      return melhorVariante(function (y) {
        return [s, a, { x: a.x, y: y }, { x: b.x, y: y }, b, e];
      }, (s.y + e.y) / 2, existentes);
    }

    if (!horizS && !horizE) {
      if (s.dy === -e.dy && (b.y - a.y) * s.dy >= 0) {
        return melhorVariante(trechoHorizontal, (a.y + b.y) / 2, existentes, a.y, b.y);
      }
      if (s.dy === e.dy) {
        return melhorVariante(trechoHorizontal, s.dy > 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y), existentes);
      }
      return melhorVariante(function (x) {
        return [s, a, { x: x, y: a.y }, { x: x, y: b.y }, b, e];
      }, (s.x + e.x) / 2, existentes);
    }

    // Uma porta na lateral e a outra em cima/embaixo: um "L" quando dá.
    if (horizS) {
      if ((e.x - s.x) * s.dx > 0 && (s.y - e.y) * e.dy > 0) return [s, { x: e.x, y: s.y }, e];
      return [s, a, { x: a.x, y: b.y }, b, e];
    }
    if ((e.y - s.y) * s.dy > 0 && (s.x - e.x) * e.dx > 0) return [s, { x: s.x, y: e.y }, e];
    return [s, a, { x: b.x, y: a.y }, b, e];
  }

  // Rótulo do cabo no meio do trecho mais longo (acima, se horizontal; ao lado, se vertical).
  function posicionarRotuloDaAresta(aresta, pontos) {
    var texto = aresta.querySelector("text");
    if (!texto) return;
    var melhor = null, maior = -1;
    for (var i = 1; i < pontos.length; i++) {
      var comp = Math.abs(pontos[i].x - pontos[i - 1].x) + Math.abs(pontos[i].y - pontos[i - 1].y);
      if (comp > maior) { maior = comp; melhor = [pontos[i - 1], pontos[i]]; }
    }
    if (!melhor) return;
    texto.removeAttribute("transform");
    var horizontal = Math.abs(melhor[0].y - melhor[1].y) < 0.5;
    if (horizontal) {
      texto.setAttribute("x", ((melhor[0].x + melhor[1].x) / 2).toFixed(2));
      texto.setAttribute("y", (melhor[0].y - 5).toFixed(2));
      texto.setAttribute("text-anchor", "middle");
    } else {
      texto.setAttribute("x", (melhor[0].x + 5).toFixed(2));
      texto.setAttribute("y", ((melhor[0].y + melhor[1].y) / 2 + 3).toFixed(2));
      texto.setAttribute("text-anchor", "start");
    }
  }

  function rotearCabosOrtogonalmente() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var pontos = obterPontosDasPortas(svg);
    var rotas = [];
    estado.conexoes.forEach(function (conexao, indice) {
      var aresta = svg.querySelector('g.edge[id="edge_' + indice + '"]');
      var path = aresta && aresta.querySelector("path");
      var s = pontos[indice + ":inicio"], e = pontos[indice + ":fim"];
      if (!path || !s || !e) return;
      aresta.removeAttribute("transform");
      rotas.push({ aresta: aresta, path: path, s: s, e: e });
    });
    // Cabos curtos primeiro ficam com a trilha ideal; os longos desviam deles.
    function comprimento(r) { return Math.abs(r.s.x - r.e.x) + Math.abs(r.s.y - r.e.y); }
    rotas.sort(function (a, b) { return comprimento(a) - comprimento(b); });
    var existentes = [];
    rotas.forEach(function (rota) {
      var pts = tracarRota(rota.s, rota.e, existentes);
      existentes.push.apply(existentes, segmentosDaRota(pts));
      rota.path.setAttribute("d", caminhoOrtogonalArredondado(pts));
      posicionarRotuloDaAresta(rota.aresta, pts);
    });
  }

  function solicitarRoteamentoCabos() {
    if (roteamentoCabosFrame) cancelAnimationFrame(roteamentoCabosFrame);
    roteamentoCabosFrame = requestAnimationFrame(function () {
      roteamentoCabosFrame = null;
      rotearCabosOrtogonalmente();
    });
  }

  function ativarArrasteDosEquipamentos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var viewBox = svg.viewBox && svg.viewBox.baseVal;
    svg.querySelectorAll("g.node").forEach(function (node) {
      var idNode = idEquipamentoDoNode(node);
      var equipamento = idNode && estado.equipamentos.find(function (eq) { return eq.id === idNode; });
      if (!equipamento) return;
      node.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        svg.querySelectorAll("g.node.selecionado").forEach(function (item) { item.classList.remove("selecionado"); });
        node.classList.add("selecionado");
        node.setPointerCapture(event.pointerId);
        // Lido a cada arraste: "Organizar diagrama" troca o objeto de posição.
        var deslocamento = equipamento.deslocamento || { x: 0, y: 0 };
        // rect já inclui o zoom (transform CSS), então não divide por canvasView.scale de novo.
        var rect = svg.getBoundingClientRect();
        var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
        var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
        var inicioX = event.clientX;
        var inicioY = event.clientY;
        var originalX = deslocamento.x;
        var originalY = deslocamento.y;
        function mover(movimento) {
          deslocamento.x = originalX + (movimento.clientX - inicioX) * escalaX;
          deslocamento.y = originalY + (movimento.clientY - inicioY) * escalaY;
          node.setAttribute("transform", "translate(" + deslocamento.x + "," + deslocamento.y + ")");
          solicitarRoteamentoCabos();
        }
        function soltar() {
          deslocamento.x = limitarPosicaoNoCanvas(deslocamento.x, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
          deslocamento.y = limitarPosicaoNoCanvas(deslocamento.y, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
          node.removeEventListener("pointermove", mover);
          node.removeEventListener("pointerup", soltar);
          node.removeEventListener("pointercancel", soltar);
          // Clique sem arrastar não redesenha (manteria o duplo clique funcionando).
          if (Math.abs(deslocamento.x - originalX) < 0.5 && Math.abs(deslocamento.y - originalY) < 0.5) return;
          equipamento.deslocamento = { x: deslocamento.x, y: deslocamento.y };
          atualizarPosicaoAbsoluta(equipamento);
          // Redesenha para as portas irem para o lado voltado aos vizinhos.
          gerar();
          atualizarJsonAvancado();
        }
        node.addEventListener("pointermove", mover);
        node.addEventListener("pointerup", soltar);
        node.addEventListener("pointercancel", soltar);
      });
      node.addEventListener("dblclick", function (event) {
        event.stopPropagation();
        abrirEditorEquipamento(equipamento);
      });

      // Teclado: Tab foca o equipamento, setas movem (Shift = passo maior),
      // Enter/F2 abre o editor.
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", "Equipamento " + (equipamento.nome || equipamento.id) + ". Use as setas para mover e Enter para editar.");
      node.addEventListener("focus", function () {
        svg.querySelectorAll("g.node.selecionado").forEach(function (item) { item.classList.remove("selecionado"); });
        node.classList.add("selecionado");
      });
      node.addEventListener("blur", function () { node.classList.remove("selecionado"); });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
          return;
        }
        var passo = event.shiftKey ? 50 : 10;
        var setas = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
        var delta = setas[event.key];
        if (!delta) return;
        event.preventDefault();
        var atual = equipamento.deslocamento || { x: 0, y: 0 };
        var x = limitarPosicaoNoCanvas(atual.x + delta[0], LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
        var y = limitarPosicaoNoCanvas(atual.y + delta[1], LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
        equipamento.deslocamento = { x: x, y: y };
        atualizarPosicaoAbsoluta(equipamento);
        node.setAttribute("transform", "translate(" + x + "," + y + ")");
        finalizarMovimento();
        salvarLocal();
        atualizarJsonAvancado();
        // Troca as portas de lado quando o usuário para de apertar as setas.
        solicitarAtualizacaoDiagrama();
      });
    });
  }

  function ativarArrasteDosCabos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var viewBox = svg.viewBox && svg.viewBox.baseVal;
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var conexao = conexaoDaAresta(aresta);
      if (!conexao) return;
      var deslocamento = conexao.deslocamento || { x: 0, y: 0 };
      aresta.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        aresta.classList.add("selecionado");
        aresta.setPointerCapture(event.pointerId);
        var rect = svg.getBoundingClientRect();
        var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
        var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
        var inicioX = event.clientX;
        var inicioY = event.clientY;
        var originalX = deslocamento.x;
        var originalY = deslocamento.y;
        function mover(movimento) {
          deslocamento.x = originalX + (movimento.clientX - inicioX) * escalaX / canvasView.scale;
          deslocamento.y = originalY + (movimento.clientY - inicioY) * escalaY / canvasView.scale;
          aresta.setAttribute("transform", "translate(" + deslocamento.x + "," + deslocamento.y + ")");
        }
        function soltar() {
          conexao.deslocamento = { x: deslocamento.x, y: deslocamento.y };
          salvarLocal();
          atualizarJsonAvancado();
          solicitarAtualizacaoDiagrama();
          aresta.classList.remove("selecionado");
          aresta.removeEventListener("pointermove", mover);
          aresta.removeEventListener("pointerup", soltar);
          aresta.removeEventListener("pointercancel", soltar);
        }
        aresta.addEventListener("pointermove", mover);
        aresta.addEventListener("pointerup", soltar);
        aresta.addEventListener("pointercancel", soltar);
      });
    });
  }

  // Busca por nome, IP ou modelo: destaca quem bate, apaga o resto.
  // Reaplicada a cada renderização, porque o SVG é recriado.
  var elBusca = document.getElementById("buscaEquip");
  var elBuscaResultado = document.getElementById("buscaResultado");
  var busca = { encontrados: [], atual: -1 };

  function equipamentoBateComBusca(eq, termo) {
    return [eq.nome, eq.ip, eq.modelo].some(function (valor) {
      return normalizarTextoEquipamento(valor).indexOf(termo) >= 0;
    });
  }

  function aplicarBusca() {
    var svg = elCanvas.querySelector("svg");
    var termo = normalizarTextoEquipamento(elBusca.value);
    busca.encontrados = [];
    if (svg) {
      svg.querySelectorAll("g.node, g.edge, g.cluster").forEach(function (el) {
        el.classList.remove("apagado", "encontrado", "encontrado-atual");
      });
    }
    elBuscaResultado.classList.remove("sem-resultado");
    if (!termo) { busca.atual = -1; elBuscaResultado.textContent = ""; return; }
    var ids = {};
    estado.equipamentos.forEach(function (eq) { if (equipamentoBateComBusca(eq, termo)) ids[eq.id] = true; });
    if (svg) {
      svg.querySelectorAll("g.node").forEach(function (node) {
        var id = idEquipamentoDoNode(node);
        if (!id) return;
        if (ids[id]) { node.classList.add("encontrado"); busca.encontrados.push(node); }
        else node.classList.add("apagado");
      });
      svg.querySelectorAll("g.edge").forEach(function (aresta) {
        var c = conexaoDaAresta(aresta);
        if (!c || !(ids[c.de] || ids[c.para])) aresta.classList.add("apagado");
      });
    }
    if (busca.atual >= busca.encontrados.length) busca.atual = -1;
    if (busca.atual >= 0) busca.encontrados[busca.atual].classList.add("encontrado-atual");
    if (!busca.encontrados.length) {
      elBuscaResultado.textContent = "nada encontrado";
      elBuscaResultado.classList.add("sem-resultado");
    } else {
      elBuscaResultado.textContent = (busca.atual >= 0 ? (busca.atual + 1) + " de " : "") + busca.encontrados.length + (busca.atual >= 0 ? "" : busca.encontrados.length === 1 ? " encontrado" : " encontrados");
    }
  }

  // Centraliza o resultado seguinte (passo 1) ou anterior (passo -1).
  function irParaResultado(passo) {
    if (!busca.encontrados.length) return;
    busca.atual = (busca.atual + passo + busca.encontrados.length) % busca.encontrados.length;
    aplicarBusca();
    if (canvasView.scale < 0.8) { canvasView.scale = 1; aplicarCanvasView(); }
    var alvo = busca.encontrados[busca.atual].getBoundingClientRect();
    var area = elCanvas.getBoundingClientRect();
    canvasView.x += (area.left + area.width / 2) - (alvo.left + alvo.width / 2);
    canvasView.y += (area.top + area.height / 2) - (alvo.top + alvo.height / 2);
    aplicarCanvasView();
  }

  elBusca.addEventListener("input", function () { busca.atual = -1; aplicarBusca(); });
  elBusca.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); irParaResultado(event.shiftKey ? -1 : 1); }
    if (event.key === "Escape") { elBusca.value = ""; busca.atual = -1; aplicarBusca(); }
  });

  // Duplo clique (ou Enter com o cabo focado) abre o editor do cabo.
  function ativarEdicaoDosCabos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var conexao = conexaoDaAresta(aresta);
      if (!conexao) return;
      aresta.setAttribute("tabindex", "0");
      aresta.setAttribute("role", "button");
      aresta.setAttribute("aria-label", "Cabo " + (conexao.tipo || "") + ". Enter para editar.");
      // Sem isto o canvas captura o ponteiro para o pan e o dblclick vai para ele.
      aresta.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      aresta.addEventListener("dblclick", function (event) {
        event.stopPropagation();
        abrirEditorCabo(conexao);
      });
      aresta.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== "F2") return;
        event.preventDefault();
        abrirEditorCabo(conexao);
      });
    });
  }

  // Zoom mantendo fixo o ponto (px, py) do canvas — o cursor, ou o centro se omitido.
  function definirZoom(novoZoom, px, py) {
    var zoomAnterior = canvasView.scale;
    var zoomAtual = limitarZoom(novoZoom);
    if (zoomAnterior === zoomAtual) return;
    if (px == null || py == null) { px = elCanvas.clientWidth / 2; py = elCanvas.clientHeight / 2; }
    canvasView.x = px - (px - canvasView.x) * zoomAtual / zoomAnterior;
    canvasView.y = py - (py - canvasView.y) * zoomAtual / zoomAnterior;
    canvasView.scale = zoomAtual;
    aplicarCanvasView();
  }

  elCanvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    var rect = elCanvas.getBoundingClientRect();
    definirZoom(canvasView.scale * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    canvasView.dragging = true;
    canvasView.startX = event.clientX;
    canvasView.startY = event.clientY;
    canvasView.originX = canvasView.x;
    canvasView.originY = canvasView.y;
    elCanvas.classList.add("panning");
    elCanvas.setPointerCapture(event.pointerId);
  });

  elCanvas.addEventListener("pointermove", function (event) {
    if (!canvasView.dragging) return;
    canvasView.x = canvasView.originX + event.clientX - canvasView.startX;
    canvasView.y = canvasView.originY + event.clientY - canvasView.startY;
    aplicarCanvasView();
  });

  function terminarPan(event) {
    if (!canvasView.dragging) return;
    canvasView.dragging = false;
    elCanvas.classList.remove("panning");
    if (event && elCanvas.hasPointerCapture(event.pointerId)) elCanvas.releasePointerCapture(event.pointerId);
  }

  elCanvas.addEventListener("pointerup", terminarPan);
  elCanvas.addEventListener("pointercancel", terminarPan);
  document.getElementById("btnZoomIn").addEventListener("click", function () { definirZoom(canvasView.scale + 0.1); });
  document.getElementById("btnZoomOut").addEventListener("click", function () { definirZoom(canvasView.scale - 0.1); });
  document.getElementById("btnZoomReset").addEventListener("click", ajustarATela);

  btnSidebarCollapse.addEventListener("click", function () {
    var recolhida = elSidebar.classList.toggle("collapsed");
    btnSidebarCollapse.textContent = recolhida ? "›" : "‹";
    btnSidebarCollapse.setAttribute("aria-label", recolhida ? "Expandir barra lateral" : "Recolher barra lateral");
    btnSidebarCollapse.title = recolhida ? "Expandir barra lateral" : "Recolher barra lateral";
  });

  btnModoAvancado.addEventListener("click", function () {
    var fechado = elPainelDados.classList.toggle("painel-dados-oculto");
    elWorkspace.classList.toggle("modo-avancado-fechado", fechado);
    btnModoAvancado.classList.toggle("active", !fechado);
    btnModoAvancado.textContent = fechado ? "Modo avançado" : "Fechar modo avançado";
  });

  var modalRef = {
    backdrop: document.getElementById("appModal"),
    title: document.getElementById("modalTitle"),
    message: document.getElementById("modalMessage"),
    fieldWrap: document.getElementById("modalFieldWrap"),
    input: document.getElementById("modalInput"),
    cancel: document.querySelector("[data-modal-cancel]"),
    confirm: document.querySelector("[data-modal-confirm]"),
    close: document.querySelector("[data-modal-close]"),
    resolver: null,
    mode: "confirm"
  };

  function abrirModal(opcoes) {
    var config = Object.assign({
      title: "Atenção",
      message: "",
      defaultValue: "",
      confirmText: "OK",
      cancelText: "Cancelar",
      kind: "confirm"
    }, opcoes || {});

    modalRef.title.textContent = config.title;
    modalRef.message.textContent = config.message;
    modalRef.input.value = config.defaultValue || "";
    modalRef.confirm.textContent = config.confirmText;
    modalRef.cancel.textContent = config.cancelText;
    modalRef.mode = config.kind;

    if (config.kind === "prompt") {
      modalRef.fieldWrap.classList.remove("hidden");
      modalRef.input.focus();
      modalRef.input.select && modalRef.input.select();
    } else {
      modalRef.fieldWrap.classList.add("hidden");
    }

    modalRef.backdrop.classList.remove("hidden");

    return new Promise(function (resolver) {
      modalRef.resolver = resolver;
    });
  }

  function fecharModal(valor) {
    modalRef.backdrop.classList.add("hidden");
    if (modalRef.resolver) {
      var resposta = valor;
      if (modalRef.mode === "prompt") {
        resposta = modalRef.input.value.trim();
      }
      modalRef.resolver(resposta);
      modalRef.resolver = null;
    }
  }

  modalRef.cancel.addEventListener("click", function () { fecharModal(null); });
  modalRef.close.addEventListener("click", function () { fecharModal(null); });
  modalRef.confirm.addEventListener("click", function () {
    if (modalRef.mode === "prompt") {
      fecharModal(modalRef.input.value);
    } else {
      fecharModal(true);
    }
  });
  modalRef.backdrop.addEventListener("click", function (event) {
    if (event.target === modalRef.backdrop) fecharModal(null);
  });
  modalRef.input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      fecharModal(modalRef.input.value);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      fecharModal(null);
    }
  });

  // Editor de equipamento/cabo aberto pelo diagrama (duplo clique ou Enter).
  var editor = {
    backdrop: document.getElementById("editorModal"),
    titulo: document.getElementById("editorTitulo"),
    formEquip: document.getElementById("editorEquipForm"),
    formCabo: document.getElementById("editorCaboForm"),
    equipamento: null,
    conexao: null
  };

  function campoEditor(id) { return document.getElementById(id); }

  // Garante que o select tenha a opção (ex.: capacidade "2.5G" vinda de CSV),
  // senão o valor some ao salvar.
  function selecionarOpcao(select, valor) {
    if (valor && !Array.prototype.some.call(select.options, function (o) { return o.value === valor; })) {
      select.appendChild(new Option(valor, valor));
    }
    select.value = valor || select.options[0].value;
  }

  function mostrarEditor(titulo, form) {
    editor.titulo.textContent = titulo;
    editor.formEquip.classList.toggle("hidden", form !== editor.formEquip);
    editor.formCabo.classList.toggle("hidden", form !== editor.formCabo);
    editor.backdrop.classList.remove("hidden");
    var primeiro = form.querySelector("input, select");
    if (primeiro) { primeiro.focus(); if (primeiro.select) primeiro.select(); }
  }

  function fecharEditor() {
    editor.backdrop.classList.add("hidden");
    editor.equipamento = null;
    editor.conexao = null;
  }

  function abrirEditorEquipamento(eq) {
    editor.equipamento = eq;
    editor.conexao = null;
    campoEditor("editEquipNome").value = eq.nome || "";
    campoEditor("editEquipTipo").value = eq.tipo || "";
    campoEditor("editEquipModelo").value = eq.modelo || "";
    campoEditor("editEquipIp").value = eq.ip || "";
    campoEditor("editEquipIp").setCustomValidity("");
    campoEditor("editEquipGrupo").value = eq.grupo || "";
    selecionarOpcao(campoEditor("editEquipStatus"), eq.status || "ativo");
    campoEditor("editEquipIcone").innerHTML = '<option value="">— sem ícone —</option>' + CATALOGO_ICONES.map(function (icone) {
      return '<option value="' + escaparHtml(icone.valor) + '">' + escaparHtml(icone.nome) + '</option>';
    }).join("");
    selecionarOpcao(campoEditor("editEquipIcone"), eq.icone || "");
    campoEditor("editEquipCor").value = corValida(eq.corFonte, "#16323D");
    mostrarEditor("Editar equipamento", editor.formEquip);
  }

  function abrirEditorCabo(c) {
    editor.conexao = c;
    editor.equipamento = null;
    var options = estado.equipamentos.map(function (eq) {
      return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
    }).join("");
    campoEditor("editCaboDe").innerHTML = options;
    campoEditor("editCaboPara").innerHTML = options;
    campoEditor("editCaboDe").value = c.de;
    campoEditor("editCaboPara").value = c.para;
    campoEditor("editCaboSaida").value = c.saida || "";
    campoEditor("editCaboChegada").value = c.chegada || "";
    campoEditor("editCaboTipo").value = c.tipo || "";
    selecionarOpcao(campoEditor("editCaboPotencia"), c.potencia || "1G");
    campoEditor("editCaboCor").value = corValida(c.cor, "#5A7284");
    campoEditor("editCaboGrossura").value = Number(c.grossura) || 2;
    selecionarOpcao(campoEditor("editCaboEstilo"), c.estilo || "solid");
    campoEditor("editCaboMensagem").textContent = "";
    var de = estado.equipamentos.find(function (eq) { return eq.id === c.de; });
    var para = estado.equipamentos.find(function (eq) { return eq.id === c.para; });
    mostrarEditor("Editar cabo" + (de && para ? ": " + (de.nome || de.id) + " → " + (para.nome || para.id) : ""), editor.formCabo);
  }

  campoEditor("editEquipIp").addEventListener("input", function (event) { event.target.setCustomValidity(""); });

  editor.formEquip.addEventListener("submit", function (event) {
    event.preventDefault();
    var eq = editor.equipamento;
    if (!eq) return;
    var nome = campoEditor("editEquipNome").value.trim();
    var campoIp = campoEditor("editEquipIp");
    var ip = campoIp.value.trim();
    if (!ipValido(ip)) {
      campoIp.setCustomValidity("IP inválido. Ex.: 10.0.0.1, 10.0.0.0/24 ou 2001:db8::1");
      campoIp.reportValidity();
      return;
    }
    var tipo = campoEditor("editEquipTipo").value.trim();
    eq.nome = nome || eq.nome;
    // Tipo trocado com o ícone ainda no padrão do tipo antigo: segue o novo tipo.
    var icone = campoEditor("editEquipIcone").value;
    if (tipo !== (eq.tipo || "") && icone === (eq.icone || "") && icone === iconePorTipo(eq.tipo)) icone = iconePorTipo(tipo);
    eq.icone = icone;
    eq.tipo = tipo;
    eq.modelo = campoEditor("editEquipModelo").value.trim();
    eq.ip = ip;
    eq.grupo = campoEditor("editEquipGrupo").value.trim();
    eq.status = campoEditor("editEquipStatus").value;
    eq.corFonte = campoEditor("editEquipCor").value;
    fecharEditor();
    renderTudo();
  });

  editor.formCabo.addEventListener("submit", function (event) {
    event.preventDefault();
    var c = editor.conexao;
    if (!c) return;
    var de = campoEditor("editCaboDe").value;
    var para = campoEditor("editCaboPara").value;
    if (de === para) { campoEditor("editCaboMensagem").textContent = "Origem e destino precisam ser diferentes."; return; }
    // Trocou as pontas: o arraste manual do cabo antigo não vale mais.
    if (de !== c.de || para !== c.para) delete c.deslocamento;
    c.de = de;
    c.para = para;
    c.saida = campoEditor("editCaboSaida").value.trim();
    c.chegada = campoEditor("editCaboChegada").value.trim();
    c.tipo = campoEditor("editCaboTipo").value.trim();
    c.potencia = campoEditor("editCaboPotencia").value;
    c.cor = campoEditor("editCaboCor").value;
    c.grossura = Math.min(10, Math.max(1, Number(campoEditor("editCaboGrossura").value) || 2));
    c.estilo = campoEditor("editCaboEstilo").value;
    fecharEditor();
    renderTudo();
  });

  editor.backdrop.querySelectorAll("[data-editor-fechar]").forEach(function (botao) {
    botao.addEventListener("click", fecharEditor);
  });
  editor.backdrop.querySelectorAll("[data-editor-excluir]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      var eq = editor.equipamento;
      var c = editor.conexao;
      var nome = eq ? (eq.nome || eq.id) : "este cabo";
      fecharEditor();
      abrirModal({
        title: eq ? "Excluir equipamento" : "Excluir cabo",
        message: eq ? "Excluir " + nome + " e os cabos ligados a ele?" : "Excluir este cabo?",
        confirmText: "Excluir"
      }).then(function (confirmou) {
        if (!confirmou) return;
        if (eq) {
          estado.equipamentos = estado.equipamentos.filter(function (item) { return item !== eq; });
          estado.conexoes = estado.conexoes.filter(function (item) { return item.de !== eq.id && item.para !== eq.id; });
        } else if (c) {
          estado.conexoes = estado.conexoes.filter(function (item) { return item !== c; });
        }
        renderTudo();
      });
    });
  });
  editor.backdrop.addEventListener("click", function (event) {
    if (event.target === editor.backdrop) fecharEditor();
  });
  editor.backdrop.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.preventDefault(); fecharEditor(); }
  });

  function clonarDados(dados) { return JSON.parse(JSON.stringify(dados)); }
  function projetoVazio() { return { equipamentos: [], conexoes: [] }; }

  function carregarProjetos() {
    try {
      var salvo = JSON.parse(localStorage.getItem("grafo-projetos") || "null");
      if (salvo && typeof salvo === "object" && Object.keys(salvo).length) {
        var projetosSanitizados = {};
        Object.keys(salvo).forEach(function (nome) {
          var projeto = salvo[nome];
          if (!projeto || typeof projeto !== "object") return;
          var equipamentos = Array.isArray(projeto.equipamentos) ? projeto.equipamentos.map(migrarImagensAntigas) : [];
          var conexoes = Array.isArray(projeto.conexoes) ? projeto.conexoes : [];
          projetosSanitizados[nome] = { equipamentos: equipamentos, conexoes: conexoes };
        });
        if (Object.keys(projetosSanitizados).length) {
          // "diagrama-estado" é o formato antigo (um projeto só), já migrado para
          // "grafo-projetos"; apagar libera espaço no localStorage.
          localStorage.removeItem("diagrama-estado");
          return projetosSanitizados;
        }
      }
    } catch (e) {}
    var legado = carregarLocal();
    if (legado && Array.isArray(legado.equipamentos) && legado.equipamentos.length) {
      legado.equipamentos.forEach(migrarImagensAntigas);
      return { "Projeto principal": clonarDados(legado) };
    }
    return { "Projeto principal": projetoVazio() };
  }
  // semHistorico: salva sem criar entrada no desfazer (para dados que o próprio
  // app recalcula, como as posições depois de renderizar).
  function salvarLocal(semHistorico) {
    try {
      var estadoAtual = JSON.stringify(estado);
      if (!semHistorico && !aplicandoHistorico && ultimoEstadoHistorico && ultimoEstadoHistorico !== estadoAtual) {
        historicoDesfazer.push(JSON.parse(ultimoEstadoHistorico));
        if (historicoDesfazer.length > 50) historicoDesfazer.shift();
        historicoRefazer = [];
      }
      ultimoEstadoHistorico = estadoAtual;
      btnDesfazer.disabled = historicoDesfazer.length === 0;
      btnRefazer.disabled = historicoRefazer.length === 0;
      projetos[projetoAtual] = clonarDados(estado);
      localStorage.setItem("grafo-projetos", JSON.stringify(projetos));
      localStorage.setItem("grafo-projeto-atual", projetoAtual);
    } catch (e) {
      var cheio = e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
      if (cheio) {
        mostrarErro("Não foi possível salvar: o espaço do navegador para projetos está cheio.\n" +
          "Remova imagens enviadas ou projetos antigos e use \"Exportar projeto (.json)\" para guardar uma cópia.");
      }
    }
  }
  // Projetos salvos antes da correção dos nomes das imagens (MIROTIK/RTIFICADOR).
  function migrarImagensAntigas(eq) {
    if (!eq || typeof eq !== "object") return eq;
    ["icone", "imagem"].forEach(function (campo) {
      if (typeof eq[campo] !== "string" || /^data:/i.test(eq[campo])) return;
      eq[campo] = eq[campo].replace(/MIROTIK\.(png|jpeg)$/i, "MIKROTIK.png").replace(/RTIFICADOR\.jpeg$/i, "RETIFICADOR.jpeg");
    });
    return eq;
  }
  function carregarLocal() { try { var s = localStorage.getItem("diagrama-estado"); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function salvarTema(t) { try { localStorage.setItem("diagrama-tema", t); } catch (e) {} }
  function carregarTema() { try { return localStorage.getItem("diagrama-tema"); } catch (e) { return null; } }

  function renderProjetos() {
    elProjetoSelect.innerHTML = Object.keys(projetos).map(function (nome) {
      return '<option value="' + escaparHtml(nome) + '"' + (nome === projetoAtual ? " selected" : "") + '>' + escaparHtml(nome) + '</option>';
    }).join("");
  }

  // Projeto de exemplo da tela vazia: um POP pequeno com as situações mais comuns.
  var PROJETO_EXEMPLO = {
    equipamentos: [
      { id: "ex_borda", nome: "RB-BORDA", tipo: "Roteador", modelo: "CCR2004", ip: "10.0.0.1", grupo: "POP Centro" },
      { id: "ex_core", nome: "SW-CORE", tipo: "Switch", modelo: "CRS326", ip: "10.0.0.2", grupo: "POP Centro" },
      { id: "ex_olt", nome: "OLT-01", tipo: "OLT", modelo: "DM4610", ip: "10.0.0.10", grupo: "POP Centro" },
      { id: "ex_nobreak", nome: "NOBREAK-01", tipo: "Nobreak", grupo: "POP Centro" },
      { id: "ex_acesso", nome: "SW-BAIRRO", tipo: "Switch", ip: "10.0.1.2", grupo: "Armário Bairro", status: "manutencao" }
    ],
    conexoes: [
      { de: "ex_borda", para: "ex_core", tipo: "Fibra", potencia: "10G", saida: "sfp+1", chegada: "sfp1" },
      { de: "ex_core", para: "ex_olt", tipo: "Fibra", potencia: "10G", saida: "sfp2", chegada: "xe1/1/1" },
      { de: "ex_core", para: "ex_acesso", tipo: "Fibra", potencia: "1G", saida: "sfp3", chegada: "ge1" },
      { de: "ex_nobreak", para: "ex_core", tipo: "Energia", estilo: "dashed", cor: "#D99A22" }
    ]
  };

  function carregarExemplo() {
    var exemplo = clonarDados(PROJETO_EXEMPLO);
    exemplo.equipamentos.forEach(function (eq) { eq.icone = iconePorTipo(eq.tipo); eq.imagem = ""; eq.status = eq.status || "ativo"; });
    estado = exemplo;
    ajustarNaProximaRenderizacao = true;
    renderTudo();
  }

  function mostrarEstadoVazio() {
    elCanvas.innerHTML =
      '<div class="estado-vazio">' +
        '<strong>Nenhum equipamento ainda</strong>' +
        '<span>Adicione equipamentos pela barra lateral ou veja um exemplo pronto.</span>' +
        '<button type="button" class="primary" data-carregar-exemplo>Carregar exemplo</button>' +
      '</div>';
    var botao = elCanvas.querySelector("[data-carregar-exemplo]");
    // O canvas captura o ponteiro para o pan; sem isto o clique não chega ao botão.
    botao.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    botao.addEventListener("click", carregarExemplo);
  }

  function limparDiagrama() {
    ultimoDot = "";
    elCanvas.classList.add("vazio");
    mostrarEstadoVazio();
    elLegenda.innerHTML = "";
    elDotCode.textContent = "";
    btnCopiar.disabled = true;
    btnBaixar.disabled = true;
    btnBaixarPng.disabled = true;
  }

  function atualizarBotoesHistorico() {
    btnDesfazer.disabled = historicoDesfazer.length === 0;
    btnRefazer.disabled = historicoRefazer.length === 0;
  }

  function restaurarHistorico(origem, destino) {
    if (!origem.length) return;
    destino.push(clonarDados(estado));
    estado = clonarDados(origem.pop());
    aplicandoHistorico = true;
    renderTudo();
    if (estado.equipamentos.length) gerar(); else limparDiagrama();
    aplicandoHistorico = false;
    atualizarBotoesHistorico();
  }

  btnDesfazer.addEventListener("click", function () { restaurarHistorico(historicoDesfazer, historicoRefazer); });
  btnRefazer.addEventListener("click", function () { restaurarHistorico(historicoRefazer, historicoDesfazer); });

  function abrirProjeto(nome) {
    if (!projetos[nome]) return;
    salvarLocal();
    projetoAtual = nome;
    estado = clonarDados(projetos[nome]);
    historicoDesfazer = [];
    historicoRefazer = [];
    ultimoEstadoHistorico = JSON.stringify(estado);
    ajustarNaProximaRenderizacao = true;
    renderProjetos();
    renderTudo();
    if (estado.equipamentos.length) gerar(); else limparDiagrama();
  }

  elProjetoSelect.addEventListener("change", function (event) { abrirProjeto(event.target.value); });
  document.getElementById("btnNovoProjeto").addEventListener("click", function () {
    abrirModal({
      title: "Novo projeto",
      message: "Digite o nome do novo projeto:",
      confirmText: "Criar",
      cancelText: "Cancelar",
      kind: "prompt"
    }).then(function (valor) {
      var nome = valor ? String(valor).trim() : "";
      if (!nome) return;
      if (projetos[nome]) { mostrarErro("Escolha um nome novo para o projeto."); return; }
      salvarLocal();
      projetos[nome] = { equipamentos: [], conexoes: [] };
      projetoAtual = nome;
      estado = clonarDados(projetos[nome]);
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      salvarLocal();
      renderProjetos();
      renderTudo();
      limparDiagrama();
    });
  });

  document.getElementById("btnExcluirProjeto").addEventListener("click", function () {
    var nomes = Object.keys(projetos);
    if (nomes.length <= 1) { mostrarErro("Mantenha ao menos um projeto salvo."); return; }
    abrirModal({
      title: "Excluir projeto",
      message: "Deseja excluir o projeto \"" + projetoAtual + "\"?",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      kind: "confirm"
    }).then(function (confirmado) {
      if (!confirmado) return;
      delete projetos[projetoAtual];
      projetoAtual = Object.keys(projetos)[0];
      estado = clonarDados(projetos[projetoAtual]);
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      salvarLocal();
      renderProjetos();
      renderTudo();
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
    });
  });

  document.getElementById("btnExportarProjeto").addEventListener("click", function () {
    salvarLocal();
    var conteudo = JSON.stringify({ projeto: projetoAtual, equipamentos: estado.equipamentos, conexoes: estado.conexoes }, null, 2);
    var arquivo = projetoAtual.replace(/[^\wÀ-ſ-]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
    baixarBlob(new Blob([conteudo], { type: "application/json" }), "grafo-" + arquivo + ".json");
  });

  document.getElementById("arquivoProjeto").addEventListener("change", function (event) {
    var arquivo = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var dados = JSON.parse(leitor.result);
        if (!dados || !Array.isArray(dados.equipamentos)) throw new Error('O arquivo precisa ter a lista "equipamentos".');
        if (!Array.isArray(dados.conexoes)) dados.conexoes = [];
        if (dados.equipamentos.length) validarDados(dados);
        dados.equipamentos.forEach(function (eq) { if (!eq.icone) eq.icone = ""; if (!eq.imagem) eq.imagem = ""; migrarImagensAntigas(eq); });

        var base = String(dados.projeto || arquivo.name.replace(/\.json$/i, "")).trim() || "Projeto importado";
        var nome = base;
        for (var i = 2; projetos[nome]; i++) nome = base + " (" + i + ")";

        salvarLocal();
        projetos[nome] = { equipamentos: dados.equipamentos, conexoes: dados.conexoes };
        abrirProjeto(nome);
        salvarLocal();
        esconderErro();
      } catch (e) { mostrarErro("Não foi possível importar o projeto.\nDetalhe: " + e.message); }
    };
    leitor.readAsText(arquivo, "UTF-8");
  });

  var themePresets = { "theme-nord": { bg: "#2E3440", bgPanel: "rgba(32, 38, 48, 0.95)", bgPanel2: "#3B4252", line: "rgba(136, 192, 208, 0.22)", lineSoft: "rgba(129, 161, 193, 0.18)", text: "#ECEFF4", textDim: "#D8DEE9", accent: "#88C0D0", accentInk: "#2E3440", teal: "#8FBCBB", paper: "#F4F6FA", paperLine: "#D8DEE9", ink: "#2E3440", danger: "#FF7D6C", fieldBg: "rgba(236,239,244,0.05)", fieldText: "#ECEFF4", fieldBorder: "rgba(136,192,208,0.22)", ghostBg: "rgba(236,239,244,0.04)", ghostText: "#D8DEE9", ghostBorder: "rgba(136,192,208,0.22)", optionBg: "#F4F6FA", optionText: "#2E3440", optionActiveBg: "#88C0D0", optionActiveText: "#2E3440", shadowSoft: "0 10px 30px rgba(5, 12, 20, 0.25)", shadowCard: "0 12px 28px rgba(6, 15, 22, 0.22)" }, "theme-dark-modern": { bg: "#1F1F1F", bgPanel: "rgba(33, 33, 33, 0.94)", bgPanel2: "#2B2B2B", line: "rgba(124, 124, 124, 0.2)", lineSoft: "rgba(170, 170, 170, 0.14)", text: "#F3F3F3", textDim: "#C9C9C9", accent: "#5AA9FF", accentInk: "#0F172A", teal: "#7CE6D8", paper: "#F8F8F8", paperLine: "#E2E2E2", ink: "#1D1D1D", danger: "#FF7D6C", fieldBg: "rgba(255,255,255,0.03)", fieldText: "#F3F3F3", fieldBorder: "rgba(170,170,170,0.18)", ghostBg: "rgba(255,255,255,0.02)", ghostText: "#C9C9C9", ghostBorder: "rgba(170,170,170,0.18)", optionBg: "#F8F8F8", optionText: "#1D1D1D", optionActiveBg: "#5AA9FF", optionActiveText: "#0F172A", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.24)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.18)" }, "theme-dracula": { bg: "#282A36", bgPanel: "rgba(40, 42, 54, 0.95)", bgPanel2: "#1E2029", line: "rgba(255, 121, 198, 0.18)", lineSoft: "rgba(189, 147, 249, 0.18)", text: "#F8F8F2", textDim: "#BD93F9", accent: "#FF79C6", accentInk: "#282A36", teal: "#8BE9FD", paper: "#F7F7F7", paperLine: "#E5E5E5", ink: "#282A36", danger: "#FF5555", fieldBg: "rgba(248,248,242,0.04)", fieldText: "#F8F8F2", fieldBorder: "rgba(255,121,198,0.2)", ghostBg: "rgba(248,248,242,0.03)", ghostText: "#BD93F9", ghostBorder: "rgba(255,121,198,0.2)", optionBg: "#F7F7F7", optionText: "#282A36", optionActiveBg: "#FF79C6", optionActiveText: "#282A36", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.28)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.2)" }, "theme-dark-plus": { bg: "#0D1117", bgPanel: "rgba(13, 17, 23, 0.94)", bgPanel2: "#161B22", line: "rgba(110, 118, 129, 0.18)", lineSoft: "rgba(110, 118, 129, 0.14)", text: "#C9D1D9", textDim: "#8B949E", accent: "#58A6FF", accentInk: "#0D1117", teal: "#39D353", paper: "#F6F8FA", paperLine: "#D0D7DE", ink: "#0D1117", danger: "#F85149", fieldBg: "rgba(201,209,217,0.04)", fieldText: "#C9D1D9", fieldBorder: "rgba(110,118,129,0.22)", ghostBg: "rgba(201,209,217,0.03)", ghostText: "#8B949E", ghostBorder: "rgba(110,118,129,0.22)", optionBg: "#F6F8FA", optionText: "#0D1117", optionActiveBg: "#58A6FF", optionActiveText: "#0D1117", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.3)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.22)" }, "theme-catppuccin-mocha": { bg: "#1E1E2E", bgPanel: "rgba(30, 30, 46, 0.94)", bgPanel2: "#302D41", line: "rgba(203, 166, 247, 0.18)", lineSoft: "rgba(137, 180, 250, 0.16)", text: "#CDD6F4", textDim: "#BAC2DE", accent: "#F38BA8", accentInk: "#1E1E2E", teal: "#94E2D5", paper: "#F4F3F8", paperLine: "#D9E0EC", ink: "#1E1E2E", danger: "#F38BA8", fieldBg: "rgba(205,214,244,0.05)", fieldText: "#CDD6F4", fieldBorder: "rgba(203,166,247,0.22)", ghostBg: "rgba(205,214,244,0.04)", ghostText: "#BAC2DE", ghostBorder: "rgba(203,166,247,0.22)", optionBg: "#F4F3F8", optionText: "#1E1E2E", optionActiveBg: "#F38BA8", optionActiveText: "#1E1E2E", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.25)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.2)" }, "theme-github-light": { bg: "#F6F8FA", bgPanel: "rgba(255, 255, 255, 0.96)", bgPanel2: "#FFFFFF", line: "rgba(208, 215, 222, 0.65)", lineSoft: "rgba(208, 215, 222, 0.8)", text: "#24292F", textDim: "#57606A", accent: "#0969DA", accentInk: "#FFFFFF", teal: "#1A7F37", paper: "#FFFFFF", paperLine: "#D0D7DE", ink: "#24292F", danger: "#CF222E", fieldBg: "rgba(36,41,47,0.03)", fieldText: "#24292F", fieldBorder: "rgba(208,215,222,0.9)", ghostBg: "rgba(36,41,47,0.02)", ghostText: "#57606A", ghostBorder: "rgba(208,215,222,0.9)", optionBg: "#FFFFFF", optionText: "#24292F", optionActiveBg: "#0969DA", optionActiveText: "#FFFFFF", shadowSoft: "0 18px 36px rgba(16, 33, 46, 0.12)", shadowCard: "0 12px 24px rgba(16, 33, 46, 0.08)" }, "theme-solarized-light": { bg: "#FDF6E3", bgPanel: "rgba(255, 250, 240, 0.96)", bgPanel2: "#F5E6C5", line: "rgba(147, 161, 161, 0.4)", lineSoft: "rgba(147, 161, 161, 0.3)", text: "#002B36", textDim: "#586E75", accent: "#B58900", accentInk: "#002B36", teal: "#2AA198", paper: "#FFFDF7", paperLine: "#EEE8D5", ink: "#073642", danger: "#DC322F", fieldBg: "rgba(0,43,54,0.04)", fieldText: "#002B36", fieldBorder: "rgba(147,161,161,0.5)", ghostBg: "rgba(0,43,54,0.03)", ghostText: "#586E75", ghostBorder: "rgba(147,161,161,0.5)", optionBg: "#FFFDF7", optionText: "#073642", optionActiveBg: "#B58900", optionActiveText: "#FDF6E3", shadowSoft: "0 18px 36px rgba(7, 54, 66, 0.12)", shadowCard: "0 12px 24px rgba(7, 54, 66, 0.08)" }, "theme-light-plus": { bg: "#F3F3F3", bgPanel: "rgba(255, 255, 255, 0.96)", bgPanel2: "#F7F7F7", line: "rgba(201, 201, 201, 0.7)", lineSoft: "rgba(201, 201, 201, 0.55)", text: "#1F1F1F", textDim: "#5B5B5B", accent: "#2F80ED", accentInk: "#FFFFFF", teal: "#00A39D", paper: "#FFFFFF", paperLine: "#E5E5E5", ink: "#1F1F1F", danger: "#D64545", fieldBg: "rgba(31,31,31,0.04)", fieldText: "#1F1F1F", fieldBorder: "rgba(201,201,201,0.9)", ghostBg: "rgba(31,31,31,0.03)", ghostText: "#5B5B5B", ghostBorder: "rgba(201,201,201,0.9)", optionBg: "#FFFFFF", optionText: "#1F1F1F", optionActiveBg: "#2F80ED", optionActiveText: "#FFFFFF", shadowSoft: "0 18px 36px rgba(31, 31, 31, 0.08)", shadowCard: "0 12px 24px rgba(31, 31, 31, 0.06)" }, "theme-alto-contraste": { bg: "#000000", bgPanel: "rgba(0, 0, 0, 0.98)", bgPanel2: "#111111", line: "rgba(255, 255, 255, 0.46)", lineSoft: "rgba(255, 255, 255, 0.28)", text: "#FFFFFF", textDim: "#E6E6E6", accent: "#FFFF00", accentInk: "#000000", teal: "#00FFFF", paper: "#FFFFFF", paperLine: "#DADADA", ink: "#000000", danger: "#FF0000", fieldBg: "rgba(255,255,255,0.06)", fieldText: "#FFFFFF", fieldBorder: "rgba(255,255,255,0.5)", ghostBg: "rgba(255,255,255,0.04)", ghostText: "#E6E6E6", ghostBorder: "rgba(255,255,255,0.5)", optionBg: "#FFFFFF", optionText: "#000000", optionActiveBg: "#FFFF00", optionActiveText: "#000000", shadowSoft: "0 0 0 2px rgba(255,255,255,0.25)", shadowCard: "0 0 0 2px rgba(255,255,255,0.22)" } };

  var temaSelect = document.getElementById("temaSelect");

  function removerTemaCustomizado() {
    [
      "--bg", "--bg-panel", "--bg-panel-2", "--line", "--line-soft", "--text", "--text-dim", "--accent", "--accent-ink",
      "--teal", "--paper", "--paper-line", "--ink", "--danger", "--field-bg", "--field-text", "--field-border",
      "--ghost-bg", "--ghost-text", "--ghost-border", "--option-bg", "--option-text", "--option-active-bg",
      "--option-active-text", "--shadow-soft", "--shadow-card"
    ].forEach(function (prop) {
      document.documentElement.style.removeProperty(prop);
    });
  }

  function aplicarTemaPersonalizado(chave) {
    var preset = themePresets[chave];
    if (!preset) return;
    Object.keys(preset).forEach(function (key) {
      // Números também viram segmento: bgPanel2 -> --bg-panel-2 (o nome usado no CSS).
      var cssKey = key.replace(/[A-Z]|\d+/g, function (trecho) { return "-" + trecho.toLowerCase(); });
      document.documentElement.style.setProperty("--" + cssKey, preset[key]);
    });
    document.documentElement.setAttribute("data-theme", "custom");
  }

  function aplicarTemaSelecionado(valor) {
    if (valor === "auto") {
      document.documentElement.removeAttribute("data-theme");
      removerTemaCustomizado();
      btnTema.textContent = "Tema: Automático";
      salvarTema("");
      return;
    }

    if (valor === "light" || valor === "dark") {
      document.documentElement.setAttribute("data-theme", valor);
      removerTemaCustomizado();
      btnTema.textContent = "Tema: " + (valor === "dark" ? "Escuro" : "Claro");
      salvarTema(valor);
      return;
    }

    aplicarTemaPersonalizado(valor);
    var opcaoTema = temaSelect.querySelector('option[value="' + valor + '"]');
    btnTema.textContent = "Tema: " + (opcaoTema ? opcaoTema.textContent : "Personalizado");
    salvarTema(valor);
  }

  var temaSalvo = carregarTema();
  if (temaSalvo && themePresets[temaSalvo]) {
    temaSelect.value = temaSalvo;
    aplicarTemaSelecionado(temaSalvo);
  } else if (temaSalvo === "dark" || temaSalvo === "light") {
    temaSelect.value = temaSalvo;
    document.documentElement.setAttribute("data-theme", temaSalvo);
    btnTema.textContent = "Tema: " + (temaSalvo === "dark" ? "Escuro" : "Claro");
  } else {
    temaSelect.value = "auto";
    btnTema.textContent = "Tema: Automático";
  }

  btnTema.addEventListener("click", function () {
    var atual = document.documentElement.getAttribute("data-theme");
    var temaAtual = temaSelect.value;

    if (temaAtual && themePresets[temaAtual]) {
      aplicarTemaSelecionado(temaAtual);
      return;
    }

    if (atual === "dark") {
      document.documentElement.setAttribute("data-theme", "light");
      temaSelect.value = "light";
      btnTema.textContent = "Tema: Claro";
      salvarTema("light");
    } else if (atual === "light") {
      document.documentElement.setAttribute("data-theme", "dark");
      temaSelect.value = "dark";
      btnTema.textContent = "Tema: Escuro";
      salvarTema("dark");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      temaSelect.value = "dark";
      btnTema.textContent = "Tema: Escuro";
      salvarTema("dark");
    }
  });

  temaSelect.addEventListener("change", function (event) {
    aplicarTemaSelecionado(event.target.value);
  });

  function escapar(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n"); }
  function escaparHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escaparHtmlDot(s) {
    return escaparHtml(s).replace(/'/g, "&apos;");
  }
  // Dados podem vir de JSON/CSV importado: só aceita cores #rgb/#rrggbb.
  function corValida(cor, padrao) {
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(cor || "")) ? cor : padrao;
  }
  // Aceita data:image/ e caminhos http(s)/relativos; bloqueia javascript: e afins.
  function imagemSegura(url) {
    var s = String(url || "").trim();
    if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
    return s;
  }
  function corPorTipo(tipo) {
    var paleta = ["#BFE7E3", "#C9D9FF", "#FFE0A8", "#F6C4D8", "#D8C7F2", "#B9E3F5", "#D8E8B8"];
    var str = String(tipo || "outro"); var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff; }
    return paleta[Math.abs(hash) % paleta.length];
  }
  function corPorStatus(status) { return status === "manutencao" ? "#D99A22" : status === "offline" ? "#D94B5B" : "#2EAD68"; }
  function marcadorStatus(status) { return status === "manutencao" ? "⚙" : status === "offline" ? "×" : "●"; }
  // Rótulo exibido no diagrama; o valor salvo continua sem acento ("manutencao").
  function rotuloStatus(status) { return status === "manutencao" ? "MANUTENÇÃO" : status === "offline" ? "OFFLINE" : "ATIVO"; }

  function renderEquipamentos() {
    elListaEquip.innerHTML = estado.equipamentos.map(function (eq, i) {
      var opcoesEmoji = ICONES.map(function (ic) {
        return '<option value="' + escaparHtml(ic) + '"' + (ic === eq.icone ? " selected" : "") + '>' + (ic ? escaparHtml(ic) : "— sem ícone —") + '</option>';
      }).join("");
      var opcoesImagem = CATALOGO_ICONES.map(function (icone) {
        return '<option value="' + escaparHtml(icone.valor) + '"' + (icone.valor === eq.icone ? " selected" : "") + '>' + escaparHtml(icone.nome) + '</option>';
      }).join("");
      return (
        '<div class="equip-card" data-idx="' + i + '">' +
          '<div class="equip-row1">' +
            '<input type="text" data-field="nome" value="' + escaparHtml(eq.nome) + '" placeholder="Nome do equipamento" aria-label="Nome do equipamento">' +
            '<select data-field="icone" aria-label="Ícone"><optgroup label="Símbolos">' + opcoesImagem + '</optgroup><optgroup label="Emojis">' + opcoesEmoji + '</optgroup></select>' +
            '<span class="equip-status"><i class="equip-status-dot ' + (eq.status || "ativo") + '"></i>' + (eq.status === "manutencao" ? "Manutenção" : eq.status === "offline" ? "Offline" : "Ativo") + '</span>' +
            '<button type="button" class="ghost small equip-advanced-toggle" data-action="toggle-avancado">Modo avançado</button>' +
            '<button type="button" class="ghost small" data-action="remover-equip" title="Remover" aria-label="Remover equipamento">×</button>' +
          '</div>' +
          '<div class="equip-advanced" data-advanced-panel>' +
            '<div class="equip-row2">' +
              '<input type="text" data-field="modelo" value="' + escaparHtml(eq.modelo) + '" placeholder="Modelo (fabricante)" aria-label="Modelo (fabricante)">' +
              '<input type="text" data-field="tipo" value="' + escaparHtml(eq.tipo) + '" placeholder="Tipo" aria-label="Tipo" list="tipos-sugeridos">' +
              '<input type="text" data-field="ip" value="' + escaparHtml(eq.ip || "") + '" placeholder="IP (ex.: 10.0.0.1)" aria-label="IP" aria-invalid="' + (ipValido(eq.ip) ? "false" : "true") + '" inputmode="decimal" autocomplete="off" spellcheck="false">' +
              '<input type="text" data-field="grupo" value="' + escaparHtml(eq.grupo || "") + '" placeholder="Grupo / rack / sala" aria-label="Grupo / rack / sala">' +
            '</div>' +
            '<div class="equip-row3">' +
              '<label class="color-picker">Fonte <input type="color" data-field="corFonte" value="' + corValida(eq.corFonte, "#16323D") + '"></label>' +
              '<label class="color-picker">Status <select data-field="status"><option value="ativo"' + ((eq.status || "ativo") === "ativo" ? " selected" : "") + '>Ativo</option><option value="manutencao"' + (eq.status === "manutencao" ? " selected" : "") + '>Manutenção</option><option value="offline"' + (eq.status === "offline" ? " selected" : "") + '>Offline</option></select></label>' +
              '<label class="upload-label">Imagem/logo (opcional) <input type="file" accept="image/*" data-action="upload-imagem"></label>' +
              (imagemSegura(eq.imagem) ? '<img class="thumb" src="' + escaparHtml(imagemSegura(eq.imagem)) + '" alt=""><button type="button" class="ghost small" data-action="remover-imagem">remover imagem</button>' : '') +
            '</div>' +
            '<div class="equip-id">id: ' + escaparHtml(eq.id) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function renderConexoes() {
    var opcoesEquip = estado.equipamentos.map(function (eq) { return { id: eq.id, nome: eq.nome || eq.id }; });
    elListaConex.innerHTML = estado.conexoes.map(function (c, j) {
      function opcoes(selecionado) {
        return opcoesEquip.map(function (o) {
          return '<option value="' + escaparHtml(o.id) + '"' + (o.id === selecionado ? " selected" : "") + '>' + escaparHtml(o.nome) + '</option>';
        }).join("");
      }
      return (
        '<div class="conex-row" data-idx="' + j + '">' +
          '<select data-field="de" aria-label="Origem">' + opcoes(c.de) + '</select>' +
          '<span class="conex-arrow">→</span>' +
          '<select data-field="para" aria-label="Destino">' + opcoes(c.para) + '</select>' +
          '<input type="text" data-field="tipo" value="' + escaparHtml(c.tipo) + '" placeholder="Tipo de enlace" aria-label="Tipo de enlace">' +
          '<input type="text" data-field="saida" value="' + escaparHtml(c.saida || "") + '" placeholder="Porta origem" aria-label="Porta origem">' +
          '<input type="text" data-field="chegada" value="' + escaparHtml(c.chegada || "") + '" placeholder="Porta destino" aria-label="Porta destino">' +
          '<select data-field="potencia" title="Capacidade do cabo" aria-label="Capacidade do cabo">' +
            ["1G", "10G", "25G", "40G", "100G", "GPON"].map(function (potencia) { return '<option value="' + potencia + '"' + (potencia === (c.potencia || "1G") ? " selected" : "") + '>' + potencia + '</option>'; }).join("") +
          '</select>' +
          '<label class="color-picker">Linha <input type="color" data-field="cor" value="' + corValida(c.cor, "#5A7284") + '"></label>' +
          '<button type="button" class="ghost small" data-action="remover-conex" title="Remover" aria-label="Remover conexão">×</button>' +
        '</div>'
      );
    }).join("");
  }

  function renderSidebarPanels() {
    var options = estado.equipamentos.map(function (eq) {
      return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
    }).join("");
    var de = document.getElementById("navCableDe");
    var para = document.getElementById("navCablePara");
    var deAtual = de.value;
    var paraAtual = para.value;
    de.innerHTML = options;
    para.innerHTML = options;
    if (estado.equipamentos.some(function (eq) { return eq.id === deAtual; })) de.value = deAtual;
    if (estado.equipamentos.some(function (eq) { return eq.id === paraAtual; })) para.value = paraAtual;
    if (estado.equipamentos.length > 1 && de.value === para.value) para.value = estado.equipamentos[1].id;

    // Sugere os grupos já usados, para não criar "Rack 01" e "rack 01" separados.
    var gruposUsados = {};
    estado.equipamentos.forEach(function (eq) { var g = String(eq.grupo || "").trim(); if (g) gruposUsados[g] = true; });
    document.getElementById("grupos-sugeridos").innerHTML = Object.keys(gruposUsados).sort().map(function (g) {
      return '<option value="' + escaparHtml(g) + '"></option>';
    }).join("");
  }

  function solicitarAtualizacaoDiagrama() {
    window.clearTimeout(atualizacaoDiagramaPendente);
    atualizacaoDiagramaPendente = window.setTimeout(function () {
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
    }, 120);
  }

  function renderTudo() { renderEquipamentos(); renderConexoes(); renderSidebarPanels(); atualizarJsonAvancado(); salvarLocal(); solicitarAtualizacaoDiagrama(); }

  function atualizarJsonAvancado() {
    elJsonAvancado.value = JSON.stringify(estado, null, 2);
  }

  elListaEquip.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var card = e.target.closest(".equip-card");
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    estado.equipamentos[idx][campo] = e.target.value;
    if (campo === "ip") {
      var invalido = !ipValido(e.target.value);
      e.target.setAttribute("aria-invalid", invalido ? "true" : "false");
      e.target.title = invalido ? "IP inválido. Ex.: 10.0.0.1, 10.0.0.0/24 ou 2001:db8::1" : "";
    }
    if (campo === "nome") renderConexoes();
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  // Imagens enviadas ficam dentro do projeto no localStorage (~5 MB no total),
  // então são reduzidas para no máximo 256 px antes de salvar.
  var LADO_MAXIMO_IMAGEM = 256;
  function lerImagemReduzida(arquivo, concluir) {
    var leitor = new FileReader();
    leitor.onload = function () {
      var original = leitor.result;
      if (/^data:image\/svg/i.test(original)) { concluir(original); return; }
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, LADO_MAXIMO_IMAGEM / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        var reduzida = canvas.toDataURL("image/webp", 0.85);
        concluir(reduzida.length < original.length ? reduzida : original);
      };
      img.onerror = function () { concluir(original); };
      img.src = original;
    };
    leitor.readAsDataURL(arquivo);
  }

  elListaEquip.addEventListener("change", function (e) {
    if (e.target.getAttribute("data-action") === "upload-imagem") {
      var card = e.target.closest(".equip-card");
      var idx = parseInt(card.getAttribute("data-idx"), 10);
      var arquivo = e.target.files && e.target.files[0];
      if (!arquivo) return;
      lerImagemReduzida(arquivo, function (imagem) {
        estado.equipamentos[idx].imagem = imagem;
        renderEquipamentos();
        atualizarJsonAvancado();
        salvarLocal();
        solicitarAtualizacaoDiagrama();
      });
      return;
    }
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var card = e.target.closest(".equip-card");
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    estado.equipamentos[idx][campo] = e.target.value;
    renderEquipamentos();
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  elListaEquip.addEventListener("click", function (e) {
    var acao = e.target.getAttribute("data-action");
    if (!acao) return;
    var card = e.target.closest(".equip-card");
    if (acao === "toggle-avancado") {
      var painelAvancado = card.querySelector("[data-advanced-panel]");
      var aberto = painelAvancado.classList.toggle("open");
      e.target.textContent = aberto ? "Fechar avançado" : "Modo avançado";
      return;
    }
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    if (acao === "remover-equip") {
      var idRemovido = estado.equipamentos[idx].id;
      estado.equipamentos.splice(idx, 1);
      estado.conexoes = estado.conexoes.filter(function (c) { return c.de !== idRemovido && c.para !== idRemovido; });
      renderTudo();
    } else if (acao === "remover-imagem") {
      estado.equipamentos[idx].imagem = "";
      renderEquipamentos();
      atualizarJsonAvancado();
      salvarLocal();
    }
  });

  document.getElementById("btnAddEquip").addEventListener("click", function () {
    abrirFormularioEquipamento();
  });

  function abrirFormularioEquipamento() {
    elFormEquip.classList.remove("hidden");
    elFormCab.classList.add("hidden");
    setTimeout(function () {
      var input = document.getElementById("novoEquipNome");
      if (input) input.focus();
    }, 20);
  }

  function fecharFormularioEquipamento() {
    elFormEquip.classList.add("hidden");
    document.getElementById("novoEquipNome").value = "";
    document.getElementById("novoEquipTipo").value = "";
    document.getElementById("novoEquipModelo").value = "";
    document.getElementById("novoEquipIp").value = "";
    document.getElementById("novoEquipCor").value = "#16323D";
  }

  // IPv4 (com máscara /0-32 opcional) ou IPv6 (com /0-128 opcional). Vazio é aceito.
  function ipValido(valor) {
    var ip = String(valor || "").trim();
    if (!ip) return true;
    var partes = ip.split("/");
    if (partes.length > 2) return false;
    var endereco = partes[0], mascara = partes[1];
    var octeto = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
    if (new RegExp("^" + octeto + "(\\." + octeto + "){3}$").test(endereco)) {
      return mascara === undefined || (/^\d{1,2}$/.test(mascara) && Number(mascara) <= 32);
    }
    var ehIpv6 = endereco.indexOf(":") >= 0 && /^[0-9a-fA-F:.]+$/.test(endereco) &&
      endereco.indexOf(":::") < 0 && (endereco.match(/::/g) || []).length <= 1 && endereco.split(":").every(function (g) { return g.length <= 4 || g.indexOf(".") >= 0; });
    return ehIpv6 && (mascara === undefined || (/^\d{1,3}$/.test(mascara) && Number(mascara) <= 128));
  }

  function abrirFormularioCabemamento() {
    elFormCab.classList.remove("hidden");
    elFormEquip.classList.add("hidden");
    var de = document.getElementById("novoCabDe");
    var para = document.getElementById("novoCabPara");
    var options = estado.equipamentos.map(function (eq) { return '<option value="' + eq.id + '">' + (eq.nome || eq.id) + '</option>'; }).join("");
    de.innerHTML = options;
    para.innerHTML = options;
    if (estado.equipamentos.length > 1) {
      de.value = estado.equipamentos[0].id;
      para.value = estado.equipamentos[1].id;
    }
    setTimeout(function () { var input = document.getElementById("novoCabNome"); if (input) input.focus(); }, 20);
  }

  function fecharFormularioCabemamento() {
    elFormCab.classList.add("hidden");
    document.getElementById("novoCabNome").value = "";
    document.getElementById("novoCabCor").value = "#5A7284";
    document.getElementById("novoCabGrossura").value = "2";
    document.getElementById("novoCabSaida").value = "";
    document.getElementById("novoCabChegada").value = "";
    document.getElementById("novoCabPotencia").value = "1G";
    document.getElementById("novoCabEstilo").value = "solid";
  }

  function fecharPaineisLaterais() {
    document.querySelectorAll(".nav-panel.open").forEach(function (panel) { panel.classList.remove("open"); });
    document.querySelectorAll(".nav-item[data-nav-panel].active").forEach(function (item) { item.classList.remove("active"); });
  }

  document.querySelectorAll(".nav-item[data-nav-panel]").forEach(function (item) {
    item.addEventListener("click", function () {
      var panel = document.getElementById(item.getAttribute("data-nav-panel"));
      var estavaAberto = panel.classList.contains("open");
      fecharPaineisLaterais();
      if (!estavaAberto) {
        panel.classList.add("open");
        item.classList.add("active");
        if (panel.id === "navAddCable") renderSidebarPanels();
      }
    });
  });

  document.querySelectorAll("[data-nav-close]").forEach(function (button) {
    button.addEventListener("click", fecharPaineisLaterais);
  });

  document.getElementById("navEquipIp").addEventListener("input", function (event) {
    event.target.setCustomValidity("");
  });

  document.getElementById("navEquipForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var nome = document.getElementById("navEquipNome").value.trim();
    if (!nome) return;
    var arquivo = document.getElementById("navEquipImagem").files[0];
    var tipo = document.getElementById("navEquipTipo").value.trim();
    var iconeInformado = document.getElementById("navEquipIcone").value.trim();
    var campoIp = document.getElementById("navEquipIp");
    var ip = campoIp.value.trim();
    if (!ipValido(ip)) {
      campoIp.setCustomValidity("IP inválido. Ex.: 10.0.0.1, 10.0.0.0/24 ou 2001:db8::1");
      campoIp.reportValidity();
      return;
    }
    var novoEquipamento = { id: novoId(), nome: nome, modelo: document.getElementById("navEquipModelo").value.trim(), ip: ip, tipo: tipo, icone: iconeInformado || iconePorTipo(tipo), imagem: "", corFonte: "#16323D",
      grupo: document.getElementById("navEquipGrupo").value.trim(), status: document.getElementById("navEquipStatus").value };
    function concluir(imagem) {
      novoEquipamento.imagem = imagem || "";
      estado.equipamentos.push(novoEquipamento);
      renderTudo();
      renderSidebarPanels();
      event.target.reset();
      fecharPaineisLaterais();
      esconderErro();
    }
    if (!arquivo) { concluir(""); return; }
    lerImagemReduzida(arquivo, concluir);
  });

  document.getElementById("navCableForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var de = document.getElementById("navCableDe").value;
    var para = document.getElementById("navCablePara").value;
    var mensagem = document.getElementById("navCableMessage");
    if (!de || !para) { mensagem.textContent = "Cadastre dois equipamentos primeiro."; return; }
    if (de === para) { mensagem.textContent = "Origem e destino precisam ser diferentes."; return; }
    estado.conexoes.push({
      de: de, para: para, tipo: document.getElementById("navCableTipo").value.trim(),
      cor: document.getElementById("navCableCor").value, grossura: Number(document.getElementById("navCableGrossura").value || 2),
      estilo: document.getElementById("navCableEstilo").value, saida: document.getElementById("navCableSaida").value.trim(), chegada: document.getElementById("navCableChegada").value.trim(), potencia: document.getElementById("navCablePotencia").value
    });
    renderTudo();
    event.target.reset();
    document.getElementById("navCableCor").value = "#5A7284";
    document.getElementById("navCableGrossura").value = "2";
    mensagem.textContent = "";
    fecharPaineisLaterais();
    esconderErro();
  });

  document.addEventListener("click", function (event) {
    var navAction = event.target.getAttribute("data-nav-action");
    if (navAction === "export-diagram") btnBaixar.click();
  });

  document.addEventListener("click", function (event) {
    var action = event.target.getAttribute("data-action");
    if (!action) return;

    if (action === "cancelar-equip" || action === "fechar-form-equip") {
      fecharFormularioEquipamento();
    }

    if (action === "cancelar-cab" || action === "fechar-form-cab") {
      fecharFormularioCabemamento();
    }

    if (action === "salvar-equip") {
      var nome = document.getElementById("novoEquipNome").value.trim();
      var tipo = document.getElementById("novoEquipTipo").value.trim();
      var modelo = document.getElementById("novoEquipModelo").value.trim();
      var ip = document.getElementById("novoEquipIp").value.trim();
      var cor = document.getElementById("novoEquipCor").value || "#16323D";
      if (!nome) {
        mostrarErro("Informe o nome do equipamento.");
        return;
      }
      if (!ipValido(ip)) {
        mostrarErro("IP inválido. Ex.: 10.0.0.1, 10.0.0.0/24 ou 2001:db8::1");
        return;
      }
      estado.equipamentos.push({ id: novoId(), nome: nome, modelo: modelo, ip: ip, tipo: tipo, icone: iconePorTipo(tipo), imagem: "", corFonte: cor });
      renderTudo();
      fecharFormularioEquipamento();
      esconderErro();
    }

    if (action === "salvar-cab") {
      var cabNome = document.getElementById("novoCabNome").value.trim();
      var de = document.getElementById("novoCabDe").value;
      var para = document.getElementById("novoCabPara").value;
      var cor = document.getElementById("novoCabCor").value || "#5A7284";
      var grossura = Number(document.getElementById("novoCabGrossura").value || 2);
      if (!de || !para || !cabNome) {
        mostrarErro("Informe nome, origem e destino do cabeamento.");
        return;
      }
      if (de === para) {
        mostrarErro("Origem e destino do cabeamento precisam ser diferentes.");
        return;
      }
      estado.conexoes.push({
        de: de, para: para, tipo: cabNome, cor: cor, grossura: grossura,
        saida: document.getElementById("novoCabSaida").value.trim(),
        chegada: document.getElementById("novoCabChegada").value.trim(),
        potencia: document.getElementById("novoCabPotencia").value,
        estilo: document.getElementById("novoCabEstilo").value
      });
      renderTudo();
      fecharFormularioCabemamento();
      esconderErro();
    }
  });

  elListaConex.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var row = e.target.closest(".conex-row");
    var idx = parseInt(row.getAttribute("data-idx"), 10);
    estado.conexoes[idx][campo] = e.target.value;
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  elListaConex.addEventListener("click", function (e) {
    if (e.target.getAttribute("data-action") === "remover-conex") {
      var row = e.target.closest(".conex-row");
      var idx = parseInt(row.getAttribute("data-idx"), 10);
      estado.conexoes.splice(idx, 1);
      renderTudo();
    }
  });

  document.getElementById("btnAddConex").addEventListener("click", function () {
    if (estado.equipamentos.length < 2) {
      mostrarErro("Adicione ao menos dois equipamentos antes de criar uma conexão.");
      return;
    }
    abrirFormularioCabemamento();
  });

  // ---- Importação CSV --------------------------------------------------------
  // Uma linha por cabo; os equipamentos são criados a partir dos nomes em
  // origem/destino. Linha sem destino cadastra só o equipamento. Cada campo
  // aceita alguns nomes de coluna (sem diferenciar maiúsculas/acentos).
  var COLUNAS_CSV = {
    origem: ["origem", "de", "equipamento", "equipamento_origem", "nome"],
    destino: ["destino", "para", "equipamento_destino"],
    porta_origem: ["porta_origem", "saida", "porta_saida", "porta_de"],
    porta_destino: ["porta_destino", "chegada", "porta_chegada", "porta_para"],
    tipo: ["tipo", "tipo_enlace", "enlace", "cabo", "tipo_cabo"],
    capacidade: ["capacidade", "potencia", "velocidade"],
    ip_origem: ["ip_origem", "ip", "ip_de"],
    ip_destino: ["ip_destino", "ip_para"],
    modelo_origem: ["modelo_origem", "modelo"],
    modelo_destino: ["modelo_destino"],
    tipo_origem: ["tipo_origem", "tipo_equipamento"],
    tipo_destino: ["tipo_destino"]
  };
  var MODELO_CSV =
    "origem;ip_origem;modelo_origem;porta_origem;destino;ip_destino;modelo_destino;porta_destino;tipo;capacidade\r\n" +
    "OLT-01;10.0.0.2;Huawei MA5800;xe1/1/1;SW-CORE;10.0.0.1;DM4270;ge1/1;Fibra;10G\r\n" +
    "RB-BORDA;10.0.0.254;MikroTik CCR;eth1;SW-CORE;10.0.0.1;DM4270;ge1/2;Cobre;1G\r\n" +
    "NOBREAK-01;;;;;;;;;\r\n";

  function normalizarCabecalhoCsv(texto) { return normalizarTextoEquipamento(texto).replace(/[\s-]+/g, "_"); }

  // O separador mais frequente na primeira linha (fora de aspas): ";", "," ou tab.
  function detectarSeparadorCsv(primeiraLinha) {
    var contagem = { ";": 0, ",": 0, "\t": 0 };
    var dentroDeAspas = false;
    for (var i = 0; i < primeiraLinha.length; i++) {
      var ch = primeiraLinha[i];
      if (ch === '"') dentroDeAspas = !dentroDeAspas;
      else if (!dentroDeAspas && contagem[ch] !== undefined) contagem[ch]++;
    }
    return Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; })[0];
  }

  // Linhas e campos do CSV, respeitando aspas (separador e "" dentro de aspas).
  function lerLinhasCsv(texto) {
    texto = String(texto || "").replace(/^﻿/, "");
    var separador = detectarSeparadorCsv(texto.split(/\r?\n/)[0] || "");
    var linhas = [], linha = [], campo = "", dentroDeAspas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (dentroDeAspas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') dentroDeAspas = false;
        else campo += ch;
      } else if (ch === '"') {
        dentroDeAspas = true;
      } else if (ch === separador) {
        linha.push(campo); campo = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && texto[i + 1] === "\n") i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = "";
      } else {
        campo += ch;
      }
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas.filter(function (l) { return l.some(function (c) { return c.trim(); }); });
  }

  // Retorna { dados: { equipamentos, conexoes }, avisos: [texto, ...] }.
  function importarCsv(texto) {
    var linhas = lerLinhasCsv(texto);
    if (linhas.length < 2) throw new Error("O CSV precisa de uma linha de cabeçalho e ao menos uma linha de dados.");
    var cabecalho = linhas[0].map(normalizarCabecalhoCsv);
    var coluna = {};
    Object.keys(COLUNAS_CSV).forEach(function (campo) {
      for (var i = 0; i < COLUNAS_CSV[campo].length; i++) {
        var posicao = cabecalho.indexOf(COLUNAS_CSV[campo][i]);
        if (posicao >= 0) { coluna[campo] = posicao; break; }
      }
    });
    if (coluna.origem === undefined) throw new Error('Coluna "origem" não encontrada. Use "Baixar modelo CSV" para ver o formato.');
    function valor(linha, campo) { return coluna[campo] === undefined ? "" : String(linha[coluna[campo]] || "").trim(); }

    var dados = { equipamentos: [], conexoes: [] };
    var avisos = [];
    var porNome = {};
    function obterEquipamento(nome, ip, modelo, tipo, numeroLinha) {
      var chave = normalizarTextoEquipamento(nome);
      var eq = porNome[chave];
      if (!eq) {
        eq = { id: novoId(), nome: nome, modelo: "", ip: "", tipo: "", icone: "", imagem: "", corFonte: "#16323D" };
        porNome[chave] = eq;
        dados.equipamentos.push(eq);
      }
      if (ip) {
        if (!ipValido(ip)) avisos.push("Linha " + numeroLinha + ": IP inválido \"" + ip + "\" em " + nome + " (importado mesmo assim).");
        if (!eq.ip) eq.ip = ip;
        else if (eq.ip !== ip) avisos.push("Linha " + numeroLinha + ": " + nome + " já tinha o IP " + eq.ip + "; \"" + ip + "\" foi ignorado.");
      }
      if (modelo && !eq.modelo) eq.modelo = modelo;
      if (tipo && !eq.tipo) eq.tipo = tipo;
      return eq;
    }

    for (var n = 1; n < linhas.length; n++) {
      var linha = linhas[n], numeroLinha = n + 1;
      var nomeOrigem = valor(linha, "origem"), nomeDestino = valor(linha, "destino");
      if (!nomeOrigem) { avisos.push("Linha " + numeroLinha + ": sem origem, ignorada."); continue; }
      var de = obterEquipamento(nomeOrigem, valor(linha, "ip_origem"), valor(linha, "modelo_origem"), valor(linha, "tipo_origem"), numeroLinha);
      if (!nomeDestino) continue;
      var para = obterEquipamento(nomeDestino, valor(linha, "ip_destino"), valor(linha, "modelo_destino"), valor(linha, "tipo_destino"), numeroLinha);
      if (de === para) { avisos.push("Linha " + numeroLinha + ": origem e destino iguais, cabo ignorado."); continue; }
      // "10 GB", "10Gbps" -> "10G"
      var capacidade = valor(linha, "capacidade").toUpperCase().replace(/\s+/g, "").replace(/(BPS|B)$/, "");
      dados.conexoes.push({
        de: de.id, para: para.id, tipo: valor(linha, "tipo") || "Cabo", potencia: capacidade || "1G",
        saida: valor(linha, "porta_origem"), chegada: valor(linha, "porta_destino"),
        cor: "#5A7284", grossura: 2, estilo: "solid"
      });
    }
    // Ícone pelo tipo ou, sem tipo, pelo nome (ex.: "OLT-01" -> ícone de OLT).
    dados.equipamentos.forEach(function (eq) { eq.icone = iconePorTipo(eq.tipo || eq.nome); });
    return { dados: dados, avisos: avisos };
  }

  document.getElementById("arquivoCsv").addEventListener("change", function (event) {
    var arquivo = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      // O Excel em português costuma salvar CSV em Windows-1252, não UTF-8.
      var texto;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(leitor.result); }
      catch (erroUtf8) { texto = new TextDecoder("windows-1252").decode(leitor.result); }
      try {
        var resultado = importarCsv(texto);
        if (!resultado.dados.equipamentos.length) throw new Error("Nenhum equipamento encontrado no arquivo.");
        estado = resultado.dados;
        ajustarNaProximaRenderizacao = true;
        renderTudo();
        gerar(); // já agora, para os avisos abaixo não serem apagados pela renderização
        if (resultado.avisos.length) {
          mostrarErro("CSV importado (" + estado.equipamentos.length + " equipamento(s), " + estado.conexoes.length + " cabo(s)) com avisos:\n" +
            resultado.avisos.slice(0, 10).join("\n") + (resultado.avisos.length > 10 ? "\n… e mais " + (resultado.avisos.length - 10) : ""));
        }
      } catch (erroCsv) { mostrarErro("Não foi possível importar o CSV.\nDetalhe: " + erroCsv.message); }
    };
    leitor.readAsArrayBuffer(arquivo);
  });

  document.getElementById("btnModeloCsv").addEventListener("click", function () {
    // BOM para o Excel abrir os acentos certos.
    baixarBlob(new Blob(["﻿" + MODELO_CSV], { type: "text/csv;charset=utf-8" }), "modelo-grafo.csv");
  });

  document.getElementById("btnAplicarJson").addEventListener("click", function () {
    try {
      var novo = JSON.parse(elJsonAvancado.value);
      validarDados(novo);
      novo.equipamentos.forEach(function (eq) { if (!eq.icone) eq.icone = ""; if (!eq.imagem) eq.imagem = ""; migrarImagensAntigas(eq); });
      estado = novo;
      ajustarNaProximaRenderizacao = true;
      renderTudo();
      esconderErro();
    } catch (e) { mostrarErro("Não foi possível aplicar o JSON.\nDetalhe: " + e.message); }
  });
  document.getElementById("btnAtualizarJson").addEventListener("click", atualizarJsonAvancado);

  function esconderErro() { elErro.style.display = "none"; elErro.textContent = ""; }
  function mostrarErro(msg) { elErro.style.display = "block"; elErro.textContent = msg; }

  function validarDados(dados) {
    if (!dados || typeof dados !== "object") throw new Error('O JSON precisa ser um objeto com "equipamentos" e "conexoes".');
    if (!Array.isArray(dados.equipamentos) || dados.equipamentos.length === 0) throw new Error('Inclua ao menos um item em "equipamentos".');
    if (!Array.isArray(dados.conexoes)) throw new Error('Inclua a chave "conexoes" como lista (pode ser vazia: []).');
    var ids = {};
    dados.equipamentos.forEach(function (eq, i) {
      if (!eq.id) throw new Error('O equipamento na posição ' + i + ' está sem "id".');
      if (ids[eq.id]) throw new Error('O id "' + eq.id + '" está duplicado.');
      ids[eq.id] = true;
    });
    dados.conexoes.forEach(function (c, i) {
      if (!c.de || !c.para) throw new Error('A conexão na posição ' + i + ' precisa de "de" e "para".');
      if (!ids[c.de] || !ids[c.para]) throw new Error('A conexão na posição ' + i + ' referencia um id inexistente.');
    });
  }

  function gerarDot(dados, direcao) {
    var contagemPortas = {};
    dados.equipamentos.forEach(function (eq) { contagemPortas[eq.id] = 0; });
    dados.conexoes.forEach(function (c) {
      if (contagemPortas[c.de] != null) contagemPortas[c.de]++;
      if (contagemPortas[c.para] != null) contagemPortas[c.para]++;
    });
    var maiorQtdPortas = Math.max.apply(null, [1].concat(Object.keys(contagemPortas).map(function (id) { return contagemPortas[id]; })));
    var ranksepAuto = Math.max(1.15, Math.min(4.5, 0.95 + maiorQtdPortas * 0.16));
    var linhas = ["digraph G {", '  rankdir=' + direcao + ';', '  splines=ortho;', '  concentrate=false;', '  overlap=false;', '  nodesep=0.45;', '  ranksep=' + ranksepAuto.toFixed(2) + ';', '  pad=0;', '  margin=0;', '  bgcolor="transparent";',
      '  node [shape=box, style="filled", fontname="Helvetica", fontsize=10, margin="0.02,0.02", color="#547184", penwidth=1.1];',
      '  edge [fontname="Helvetica", fontsize=8, color="#263746", fontcolor="#344D61", penwidth=1.5, arrowhead=none, labeldistance=1.25, labelangle=0, labelfontname="Helvetica", labelfontsize=8];'];
    // Cada ponta de cabo vira uma porta no lado do equipamento voltado para o
    // outro equipamento. Sem posição conhecida (primeira renderização), usa o
    // padrão do layout: saída à direita/embaixo, chegada à esquerda/em cima.
    var equipamentoPorId = {};
    dados.equipamentos.forEach(function (eq) { equipamentoPorId[eq.id] = eq; });
    var portasPorEquipamento = {};
    dados.equipamentos.forEach(function (eq) { portasPorEquipamento[eq.id] = { cima: [], esquerda: [], direita: [], baixo: [] }; });
    var padraoSaida = direcao === "TB" ? "baixo" : "direita";
    var padraoChegada = direcao === "TB" ? "cima" : "esquerda";
    dados.conexoes.forEach(function (c, indice) {
      var de = equipamentoPorId[c.de], para = equipamentoPorId[c.para];
      if (de) {
        var ladoSaida = ladoVoltadoPara(de, para, padraoSaida);
        portasPorEquipamento[c.de][ladoSaida].push({ indice: indice, ponta: "inicio", lado: ladoSaida, nome: c.saida || "P1", outro: para });
      }
      if (para) {
        var ladoChegada = ladoVoltadoPara(para, de, padraoChegada);
        portasPorEquipamento[c.para][ladoChegada].push({ indice: indice, ponta: "fim", lado: ladoChegada, nome: c.chegada || "P2", outro: de });
      }
    });
    // Dentro de cada lado, ordena pela posição do outro equipamento para os
    // cabos não se cruzarem ao sair.
    function coordenadaDoOutro(porta, eixo) {
      return porta.outro && posicaoValida(porta.outro.posicao) ? porta.outro.posicao[eixo] : 0;
    }
    function ordenarPor(eixo) {
      return function (a, b) { return coordenadaDoOutro(a, eixo) - coordenadaDoOutro(b, eixo) || a.indice - b.indice; };
    }
    portasRenderizadas = {};
    Object.keys(portasPorEquipamento).forEach(function (id) {
      var lados = portasPorEquipamento[id];
      lados.esquerda.sort(ordenarPor("y"));
      lados.direita.sort(ordenarPor("y"));
      lados.cima.sort(ordenarPor("x"));
      lados.baixo.sort(ordenarPor("x"));
      // Mesma ordem em que o Graphviz desenha as caixas (ordem da tabela abaixo).
      portasRenderizadas[id] = {
        ordem: lados.cima.concat(lados.esquerda, lados.direita, lados.baixo),
        nCima: lados.cima.length,
        nBaixo: lados.baixo.length
      };
    });

    var CONFIG_PORTA = { largura: 52, alturaMaxima: 24, alturaMinima: 14, fonteMaxima: 10, fonteMinima: 7, paddingMaximo: 3, paddingMinimo: 1, fundo: "#FFFFFF", borda: "#202020", texto: "#111111", maxCaracteres: 11 };
    var ALTURA_BASE_EQUIPAMENTO = 92;

    function calcularFontePorta(altura) {
      if (altura >= 24) return 10;
      if (altura >= 20) return 9;
      return Math.max(CONFIG_PORTA.fonteMinima, 8);
    }

    function calcularPaddingPorta(altura) {
      if (altura >= 24) return CONFIG_PORTA.paddingMaximo;
      if (altura >= 20) return 2;
      return CONFIG_PORTA.paddingMinimo;
    }

    // Porta com tamanho fixo (alturaMaxima) quando há uma ligação só no lado,
    // diminuindo 2 pt a cada ligação a mais até alturaMinima. Com muitas portas
    // o equipamento cresce em vez de a porta encolher mais.
    function calcularLayoutPortas(totalPortas) {
      totalPortas = Math.max(Number(totalPortas) || 1, 1);
      var alturaPorta = Math.max(CONFIG_PORTA.alturaMinima, CONFIG_PORTA.alturaMaxima - (totalPortas - 1) * 2);
      return { alturaPorta: Math.round(alturaPorta), fonte: calcularFontePorta(alturaPorta), padding: calcularPaddingPorta(alturaPorta) };
    }

    function limitarNomePorta(nome) {
      nome = String(nome || "PORTA").trim();
      if (nome.length > CONFIG_PORTA.maxCaracteres) return nome.substring(0, CONFIG_PORTA.maxCaracteres - 1) + "…";
      return nome;
    }

    function celulaPorta(porta, layout) {
      var nome = escaparHtmlDot(limitarNomePorta(porta.nome));
      return '<TD BORDER="1" COLOR="' + CONFIG_PORTA.borda + '" BGCOLOR="' + CONFIG_PORTA.fundo + '" WIDTH="' + CONFIG_PORTA.largura + '" HEIGHT="' + layout.alturaPorta + '" FIXEDSIZE="TRUE" CELLPADDING="' + layout.padding + '" ALIGN="CENTER" VALIGN="MIDDLE"><FONT FACE="Helvetica" POINT-SIZE="' + layout.fonte + '" COLOR="' + CONFIG_PORTA.texto + '">' + nome + '</FONT></TD>';
    }

    function linhaEquipamento(eq) {
      var status = eq.status || "ativo";
      var corStatus = corPorStatus(status);
      var corFonte = corValida(eq.corFonte, "#16323D");
      var nome = escaparHtmlDot(eq.nome || eq.id);
      var modelo = escaparHtmlDot(eq.modelo || "");
      var tipo = escaparHtmlDot(eq.tipo || "Equipamento");
      var ip = escaparHtmlDot(String(eq.ip || "").trim());
      var portas = portasPorEquipamento[eq.id];
      var layoutLateral = calcularLayoutPortas(Math.max(portas.esquerda.length, portas.direita.length));
      var layoutTopo = calcularLayoutPortas(Math.max(portas.cima.length, portas.baixo.length));

      // Portas laterais numa tabela interna: fica centralizada na coluna e
      // mantém a altura das portas (sem isso o Graphviz as estica até a altura
      // da área da imagem).
      function colunaPortas(lista) {
        if (!lista.length) return '<TD WIDTH="' + CONFIG_PORTA.largura + '"></TD>';
        return '<TD VALIGN="MIDDLE" WIDTH="' + CONFIG_PORTA.largura + '"><TABLE BORDER="0" CELLSPACING="2" CELLPADDING="0">' +
          lista.map(function (p) { return '<TR>' + celulaPorta(p, layoutLateral) + '</TR>'; }).join("") +
          '</TABLE></TD>';
      }
      function linhaPortas(lista) {
        if (!lista.length) return "";
        return '<TR><TD COLSPAN="3"><TABLE BORDER="0" CELLSPACING="4" CELLPADDING="0"><TR>' +
          lista.map(function (p) { return celulaPorta(p, layoutTopo); }).join("") +
          '</TR></TABLE></TD></TR>';
      }
      var alturaPortasLaterais = Math.max(portas.esquerda.length, portas.direita.length) * (layoutLateral.alturaPorta + 2);
      var alturaMeio = Math.max(ALTURA_BASE_EQUIPAMENTO, alturaPortasLaterais);

      // Ordem das linhas = ordem em que o Graphviz desenha as portas:
      // cima, (cabeçalho), esquerda, direita, (status), baixo.
      var rotulo = '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">' +
        linhaPortas(portas.cima) +
        '<TR><TD COLSPAN="3" CELLPADDING="3" ALIGN="CENTER"><FONT FACE="Helvetica" POINT-SIZE="11" COLOR="#14212B"><B>' + nome + '</B></FONT><BR/>' +
        (modelo ? '<FONT FACE="Helvetica" POINT-SIZE="9" COLOR="#14212B">' + modelo + '</FONT><BR/>' : "") +
        '<FONT FACE="Helvetica" POINT-SIZE="8" COLOR="#405363">' + tipo + '</FONT>' +
        (ip ? '<BR/><FONT FACE="Courier" POINT-SIZE="8" COLOR="#1F5F8B">' + ip + '</FONT>' : "") +
        '</TD></TR>' +
        '<TR>' + colunaPortas(portas.esquerda) +
        '<TD BORDER="0" CELLPADDING="0" WIDTH="120" HEIGHT="' + alturaMeio + '"></TD>' +
        colunaPortas(portas.direita) + '</TR>' +
        '<TR><TD COLSPAN="3" CELLPADDING="4" ALIGN="CENTER"><FONT FACE="Helvetica" POINT-SIZE="9" COLOR="' + corStatus + '"><B>' + escaparHtmlDot(marcadorStatus(status) + " " + rotuloStatus(status)) + '</B></FONT></TD></TR>' +
        linhaPortas(portas.baixo) +
        '</TABLE>>';
      return '    "' + escapar(eq.id) + '" [id="equip_' + dados.equipamentos.indexOf(eq) + '", label=' + rotulo + ', shape=plain, color="transparent", fontcolor="' + corFonte + '"];';
    }
    var grupos = {};
    dados.equipamentos.forEach(function (eq) {
      var grupo = String(eq.grupo || "").trim();
      if (!grupo) { linhas.push(linhaEquipamento(eq).replace(/^    /, "  ")); return; }
      if (!grupos[grupo]) grupos[grupo] = [];
      grupos[grupo].push(eq);
    });
    // O id do cluster usa o índice: derivar do nome fazia "Sala 1" e "Sala-1"
    // (ou "Rack Á" e "Rack É") virarem o mesmo cluster.
    Object.keys(grupos).forEach(function (grupo, indiceGrupo) {
      linhas.push('  subgraph "cluster_' + indiceGrupo + '" {');
      linhas.push('    label="' + escapar(grupo) + '";');
      linhas.push('    color="#6C8292"; style="rounded,dashed"; penwidth=1.0; fontname="Helvetica"; fontsize=9;');
      grupos[grupo].forEach(function (eq) { linhas.push(linhaEquipamento(eq)); });
      linhas.push("  }");
    });
    dados.conexoes.forEach(function (c, indice) {
      var corConexao = corValida(c.cor, "#5A7284");
      var grossura = Math.min(10, Number(c.grossura) || 2);
      var estilo = c.estilo && c.estilo !== "solid" ? ', style="' + escapar(c.estilo) + '"' : "";
      var portaDirecao = direcao === "TB" ? ', tailport="n", headport="s"' : ', tailport="e", headport="w"';
      var portas = ', tailport="out_' + indice + '", headport="in_' + indice + '"';
      if (direcao === "TB") portas = portaDirecao;
      if (direcao !== "TB") portas = portaDirecao;
      var capacidade = c.potencia ? " · " + c.potencia : "";
      var rotuloTexto = c.tipo ? c.tipo + capacidade : capacidade.replace(/^ · /, "");
      var rotulo = ' [id="edge_' + indice + '", label="' + escapar(rotuloTexto) + '", color="' + corConexao + '", fontcolor="#34495A", penwidth=' + Math.max(1, grossura) + estilo + portas + ']';
      linhas.push('  "' + escapar(c.de) + '" -> "' + escapar(c.para) + '"' + rotulo + ';');
    });
    linhas.push("}");
    return linhas.join("\n");
  }

  function atualizarLegenda(dados) {
    var tipos = {};
    dados.equipamentos.forEach(function (eq) { tipos[eq.tipo || "outro"] = true; });
    elLegenda.innerHTML = "";
    Object.keys(tipos).forEach(function (tipo) {
      var span = document.createElement("span");
      var i = document.createElement("i"); i.style.background = corPorTipo(tipo);
      span.appendChild(i); span.appendChild(document.createTextNode(tipo));
      elLegenda.appendChild(span);
    });
  }

  function aplicarImagensNoSvg(dados) {
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) return;

    var porId = {};
    dados.equipamentos.forEach(function (eq) {
      var imagem = eq.imagem || imagemDoIcone(eq.icone);
      if (imagem) porId[eq.id] = imagem;
    });

    function bboxSeguro(elemento) {
      try { return elemento && elemento.getBBox ? elemento.getBBox() : null; }
      catch (e) { return null; }
    }

    function normalizarTexto(valor) {
      return String(valor || "").replace(/\s+/g, " ").trim();
    }

    svgEl.querySelectorAll("g.node").forEach(function (g) {
      var id = idEquipamentoDoNode(g);
      if (!id) return;
      var origemImagem = porId[id];
      if (!origemImagem) return;

      var equipamento = dados.equipamentos.find(function (eq) { return eq.id === id; });
      if (!equipamento) return;

      try {
        g.querySelectorAll("image[data-equip-img='1']").forEach(function (imagemAntiga) {
          imagemAntiga.remove();
        });

        var bboxNode = g.getBBox();
        // Pela ordem do rótulo (gerarDot): portas de cima, nome, modelo (se
        // houver), tipo, IP (se houver), portas laterais, status, portas de baixo.
        // Comparar pelo texto falhava quando uma porta tinha o mesmo nome do modelo.
        var textos = Array.prototype.slice.call(g.querySelectorAll("text"));
        var infoPortas = portasRenderizadas[id] || { nCima: 0, nBaixo: 0 };
        var linhasCabecalho = 2 + (normalizarTexto(equipamento.modelo || "") ? 1 : 0) + (normalizarTexto(equipamento.ip || "") ? 1 : 0);
        var cabecalho = textos.slice(infoPortas.nCima, infoPortas.nCima + linhasCabecalho);
        var statusTexto = textos[textos.length - 1 - infoPortas.nBaixo] || null;

        var fundoCabecalho = bboxNode.y + Math.min(36, bboxNode.height * 0.28);
        cabecalho.forEach(function (texto) {
          var box = bboxSeguro(texto);
          if (box) fundoCabecalho = Math.max(fundoCabecalho, box.y + box.height);
        });

        var topoStatus = bboxNode.y + bboxNode.height - Math.min(22, bboxNode.height * 0.18);
        var boxStatus = bboxSeguro(statusTexto);
        if (boxStatus) topoStatus = boxStatus.y;

        var areaTopo = fundoCabecalho + 5;
        var areaBaixo = topoStatus - 5;
        var areaAltura = Math.max(16, areaBaixo - areaTopo);

        var ehCatalogo = !!imagemDoIcone(equipamento.icone);
        var tamanhoDesejado = ehCatalogo ? 84 : 48;
        var tam = Math.max(12, Math.min(tamanhoDesejado, areaAltura - 4, 108));

        var centroX = bboxNode.x + bboxNode.width / 2;
        var x = centroX - tam / 2;
        var y = areaTopo + (areaAltura - tam) / 2;

        var urlImagem = resolverUrlRelativa(origemImagem);
        var img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("data-equip-img", "1");
        img.setAttributeNS("http://www.w3.org/1999/xlink", "href", urlImagem);
        img.setAttribute("href", urlImagem);
        img.setAttribute("x", x);
        img.setAttribute("y", y);
        img.setAttribute("width", tam);
        img.setAttribute("height", tam);
        img.setAttribute("preserveAspectRatio", "xMidYMid meet");
        img.setAttribute("pointer-events", "none");

        var clipId = "clip-" + id.replace(/[^a-zA-Z0-9]/g, "") + "-equip";
        var defs = svgEl.querySelector("defs");
        if (!defs) {
          defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          svgEl.insertBefore(defs, svgEl.firstChild);
        }
        var clipAntigo = defs.querySelector("#" + clipId);
        if (clipAntigo) clipAntigo.remove();

        var clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clip.setAttribute("id", clipId);
        var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", tam);
        rect.setAttribute("height", tam);
        rect.setAttribute("rx", 3);
        clip.appendChild(rect);
        defs.appendChild(clip);
        img.setAttribute("clip-path", "url(#" + clipId + ")");

        var primeiroTexto = g.querySelector("text");
        if (primeiroTexto) g.insertBefore(img, primeiroTexto);
        else g.appendChild(img);
      } catch (err) {}
    });
  }

  // Organiza em camadas a partir das conexões (busca em largura; cada parte
  // desconectada começa pela sua própria raiz) e grava a posição absoluta de
  // cada equipamento. Roda duas vezes: depois da primeira, as portas mudam de
  // lado e o tamanho dos equipamentos muda junto.
  function organizarDiagramaAutomaticamente(opcoes) {
    // Registra qualquer mudança pendente antes, e o organizar inteiro como um
    // único passo no desfazer (as renderizações do meio não entram).
    salvarLocal();
    var estadoAntes = ultimoEstadoHistorico;
    aplicandoHistorico = true;
    try {
      for (var passada = 0; passada < 2; passada++) organizarUmaVez(opcoes);
    } finally {
      aplicandoHistorico = false;
    }
    if (estadoAntes && estadoAntes !== JSON.stringify(estado)) {
      historicoDesfazer.push(JSON.parse(estadoAntes));
      if (historicoDesfazer.length > 50) historicoDesfazer.shift();
      historicoRefazer = [];
    }
    salvarLocal(true);
    atualizarBotoesHistorico();
    ajustarATela();
    atualizarJsonAvancado();
  }

  function organizarUmaVez(opcoes) {
    if (!estado.equipamentos.length) return;
    gerar();
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;

    var config = Object.assign({ espacoEntreCamadas: 140, espacoNaCamada: 60 }, opcoes || {});
    var horizontal = ((selDirecao && selDirecao.value) || "LR") !== "TB";

    // Tamanho de cada equipamento, para espaçar sem sobrepor.
    var base = {};
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      if (!id) return;
      try {
        var b = node.getBBox();
        base[id] = { largura: b.width, altura: b.height };
      } catch (e) {}
    });

    var ids = estado.equipamentos.map(function (eq) { return eq.id; }).filter(function (id) { return base[id]; });
    if (!ids.length) return;

    var vizinhos = {};
    ids.forEach(function (id) { vizinhos[id] = []; });
    estado.conexoes.forEach(function (c) {
      if (!vizinhos[c.de] || !vizinhos[c.para] || c.de === c.para) return;
      vizinhos[c.de].push(c.para);
      vizinhos[c.para].push(c.de);
    });

    // Camadas por BFS; em cada parte, a raiz é o equipamento com mais conexões.
    var camadaDe = {};
    var camadas = [];
    ids.slice().sort(function (a, b) { return vizinhos[b].length - vizinhos[a].length; }).forEach(function (raiz) {
      if (camadaDe[raiz] !== undefined) return;
      camadaDe[raiz] = 0;
      var fila = [raiz];
      while (fila.length) {
        var atual = fila.shift();
        var n = camadaDe[atual];
        (camadas[n] = camadas[n] || []).push(atual);
        vizinhos[atual].forEach(function (v) {
          if (camadaDe[v] === undefined) { camadaDe[v] = n + 1; fila.push(v); }
        });
      }
    });

    // Ordena cada camada pela posição média dos vizinhos na camada anterior,
    // o que reduz cabos cruzados.
    var ordem = {};
    camadas.forEach(function (camada, n) {
      if (n > 0) {
        camada.forEach(function (id) {
          var pais = vizinhos[id].filter(function (v) { return camadaDe[v] === n - 1; });
          ordem[id] = pais.length ? pais.reduce(function (s, v) { return s + ordem[v]; }, 0) / pais.length : 0;
        });
        camada.sort(function (a, b) { return ordem[a] - ordem[b]; });
      }
      camada.forEach(function (id, i) { ordem[id] = i; });
    });

    // Posições usando o tamanho real de cada equipamento, para nada se sobrepor.
    var destino = {};
    var inicioCamada = 0;
    camadas.forEach(function (camada) {
      var espessura = Math.max.apply(null, camada.map(function (id) { return horizontal ? base[id].largura : base[id].altura; }));
      var total = camada.reduce(function (s, id) { return s + (horizontal ? base[id].altura : base[id].largura); }, 0) +
        config.espacoNaCamada * (camada.length - 1);
      var cursor = -total / 2;
      var centroCamada = inicioCamada + espessura / 2;
      camada.forEach(function (id) {
        var tamanho = horizontal ? base[id].altura : base[id].largura;
        var centroNaCamada = cursor + tamanho / 2;
        destino[id] = horizontal ? { x: centroCamada, y: centroNaCamada } : { x: centroNaCamada, y: centroCamada };
        cursor += tamanho + config.espacoNaCamada;
      });
      inicioCamada += espessura + config.espacoEntreCamadas;
    });

    estado.equipamentos.forEach(function (eq) {
      if (destino[eq.id]) eq.posicao = { x: destino[eq.id].x, y: destino[eq.id].y };
    });
    // Renderiza de novo: com as posições novas as portas mudam de lado.
    gerar();
  }

  window.organizarDiagramaAutomaticamente = organizarDiagramaAutomaticamente;

  // O Graphviz (WebAssembly) carrega de forma assíncrona; depois disso a
  // renderização é síncrona. Chamadas a gerar() antes do carregamento ficam pendentes.
  // Sem inicializador: gerar() pode ser chamado antes desta linha executar.
  var vizInstancia;
  var gerarPendente;
  // Centraliza/ajusta o zoom na primeira renderização e ao trocar de projeto.
  var ajustarNaProximaRenderizacao = true;
  Viz.instance().then(function (viz) {
    vizInstancia = viz;
    if (gerarPendente) { gerarPendente = false; gerar(); }
  }).catch(function (e) {
    mostrarErro("Não foi possível carregar o Graphviz.\nDetalhe: " + e.message);
  });

  function gerar() {
    window.clearTimeout(atualizacaoDiagramaPendente);
    if (!vizInstancia) { gerarPendente = true; return; }
    esconderErro();
    try { validarDados(estado); } catch (e) { mostrarErro(e.message); return; }

    // Se o estado já está registrado no histórico, o que mudar aqui é só o que
    // a renderização recalcula (posições): não vira um passo a mais no desfazer.
    // Se há uma mudança pendente (ex.: arrastar), ela é registrada no fim, junto.
    var jaRegistrado = JSON.stringify(estado) === ultimoEstadoHistorico;
    var svgAntigo = elCanvas.querySelector("svg");
    var ancoraAntiga =svgAntigo && !ajustarNaProximaRenderizacao ? ancoraDoSvg(svgAntigo) : null;
    var focado = document.activeElement && document.activeElement.closest ? document.activeElement.closest("#canvas g.node") : null;
    var idFocado = focado ? idEquipamentoDoNode(focado) : null;

    try {
      renderizarSvg();
      // Equipamento novo só ganha posição depois de renderizado; renderiza de
      // novo para as portas dele irem para o lado certo.
      if (sincronizarPosicoes()) { renderizarSvg(); sincronizarPosicoes(); }
      aplicarPosicoesEquipamentos();
      rotearCabosOrtogonalmente();
      ajustarViewBoxAoConteudo(false);
      if (ajustarNaProximaRenderizacao) {
        ajustarNaProximaRenderizacao = false;
        ajustarATela();
      } else {
        // O viewBox novo pode ter outra origem: compensa o pan para o
        // diagrama continuar no mesmo lugar da tela.
        if (ancoraAntiga) {
          var ancoraNova = ancoraDoSvg(elCanvas.querySelector("svg"));
          canvasView.x += (ancoraAntiga.x - ancoraNova.x) * canvasView.scale;
          canvasView.y += (ancoraAntiga.y - ancoraNova.y) * canvasView.scale;
        }
        aplicarCanvasView();
      }
      ativarArrasteDosEquipamentos();
      ativarEdicaoDosCabos();
      aplicarBusca();
      aplicarImagensNoSvg(estado);
      atualizarLegenda(estado);
      btnCopiar.disabled = false;
      btnBaixar.disabled = false;
      btnBaixarPng.disabled = false;
      if (idFocado) {
        var noFocado = obterNodePorId(elCanvas.querySelector("svg"), idFocado);
        if (noFocado) noFocado.focus({ preventScroll: true });
      }
      salvarLocal(jaRegistrado);
    } catch (e) {
      mostrarErro("Não foi possível desenhar o diagrama.\nDetalhe: " + e.message);
    }
  }

  function renderizarSvg() {
    var dot = gerarDot(estado, selDirecao.value);
    ultimoDot = dot;
    idsEquipRenderizados = estado.equipamentos.map(function (eq) { return eq.id; });
    conexoesRenderizadas = estado.conexoes.slice();
    elDotCode.textContent = dot;
    elCanvas.classList.remove("vazio");
    elCanvas.innerHTML = vizInstancia.renderString(dot, { format: "svg" });
    registrarCentrosBase(elCanvas.querySelector("svg"));
  }

  // Posição (px, sem zoom) da origem do g.graph dentro do SVG.
  function ancoraDoSvg(svg) {
    var grafo = svg.querySelector("g.graph");
    var vb = svg.viewBox.baseVal;
    var matriz = grafo && grafo.transform.baseVal.consolidate();
    var m = matriz ? matriz.matrix : { e: 0, f: 0 };
    var pxPorUnidade = vb && vb.width ? tamanhoNaturalSvg(svg).largura / vb.width : 4 / 3;
    return { x: (m.e - (vb ? vb.x : 0)) * pxPorUnidade, y: (m.f - (vb ? vb.y : 0)) * pxPorUnidade };
  }

  window.gerar = gerar;

  btnGerar.addEventListener("click", gerar);
  btnOrganizar.addEventListener("click", function () { organizarDiagramaAutomaticamente(); });

  btnCopiar.addEventListener("click", function () {
    if (!ultimoDot) return;
    try {
      navigator.clipboard.writeText(ultimoDot);
      var original = btnCopiar.textContent;
      btnCopiar.textContent = "Copiado!";
      setTimeout(function () { btnCopiar.textContent = original; }, 1400);
    } catch (e) {}
  });

  function blobParaDataUrl(blob) {
    return new Promise(function (resolver, rejeitar) {
      var leitor = new FileReader();
      leitor.onload = function () { resolver(leitor.result); };
      leitor.onerror = rejeitar;
      leitor.readAsDataURL(blob);
    });
  }

  // Cópia dos ícones em base64 (assets/js/icones-embutidos.js), carregada só
  // na hora de exportar. Com o app aberto direto do disco (file://) o
  // navegador bloqueia o fetch das imagens e o canvas do PNG; sem esta cópia
  // os ícones sumiam da exportação.
  var promessaIconesEmbutidos = null;
  function carregarIconesEmbutidos() {
    if (window.ICONES_EMBUTIDOS) return Promise.resolve(window.ICONES_EMBUTIDOS);
    if (!promessaIconesEmbutidos) {
      promessaIconesEmbutidos = new Promise(function (resolver) {
        var script = document.createElement("script");
        script.src = "./assets/js/icones-embutidos.js";
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
  async function imagemParaExportacao(origem) {
    if (!origem) return "";
    if (/^data:/i.test(origem)) return origem;
    try {
      var resposta = await fetch(resolverUrlRelativa(origem), { cache: "force-cache" });
      if (!resposta.ok && resposta.status !== 0) throw new Error("HTTP " + resposta.status);
      return await blobParaDataUrl(await resposta.blob());
    } catch (erroFetch) {}
    return await iconeEmbutido(origem);
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

  async function prepararSvgParaExportacao(svgEl, removerImagens) {
    var copia = svgEl.cloneNode(true);
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
        imagem.setAttribute("href", dataUrl);
        imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
      } catch (erroImagem) {
        console.warn("Não foi possível incorporar imagem na exportação:", origem, erroImagem);
      }
    }));

    return copia;
  }

  // Nome do arquivo exportado: projeto + data, ex.: "projeto-principal-2026-09-26.png".
  function nomeArquivoExportacao(extensao) {
    var base = normalizarTextoEquipamento(projetoAtual).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "diagrama";
    var hoje = new Date();
    var data = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
    return base + "-" + data + "." + extensao;
  }

  // Emoldura a cópia exportada: cabeçalho (projeto, data, totais), rodapé com a
  // legenda de tipos e fundo sólido. Aumenta o viewBox em volta do desenho.
  function adicionarMolduraDeExportacao(svg) {
    var vb = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(function (n) { return !Number.isFinite(n); }) || !vb[2] || !vb[3]) return;
    var NS = "http://www.w3.org/2000/svg";
    var MARGEM = 24, TOPO = 62, RODAPE = 42;
    var larguraNova = Math.max(vb[2] + 2 * MARGEM, 440);
    var alturaNova = vb[3] + TOPO + RODAPE;
    var x0 = vb[0] - (larguraNova - vb[2]) / 2;
    var y0 = vb[1] - TOPO;
    var baseRodape = vb[1] + vb[3];

    var estilo = getComputedStyle(elCanvas);
    var fundo = estilo.backgroundColor || "#ffffff";
    var tinta = estilo.getPropertyValue("--ink").trim() || "#16323D";

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
    moldura.appendChild(el("text", { x: x0 + MARGEM, y: y0 + 28, "font-size": 16, "font-weight": "bold" }, projetoAtual));
    moldura.appendChild(el("text", { x: x0 + MARGEM, y: y0 + 45, "font-size": 9.5, "fill-opacity": 0.65 },
      "Topologia de rede · " + data + " · " + plural(estado.equipamentos.length, "equipamento", "equipamentos") + " · " + plural(estado.conexoes.length, "cabo", "cabos")));
    moldura.appendChild(el("line", { x1: x0 + MARGEM, x2: x0 + larguraNova - MARGEM, y1: y0 + TOPO - 8, y2: y0 + TOPO - 8, stroke: tinta, "stroke-opacity": 0.15 }));
    moldura.appendChild(el("line", { x1: x0 + MARGEM, x2: x0 + larguraNova - MARGEM, y1: baseRodape + 12, y2: baseRodape + 12, stroke: tinta, "stroke-opacity": 0.15 }));

    // Legenda: um quadrado colorido por tipo, como a legenda da tela.
    var tipos = [];
    estado.equipamentos.forEach(function (eq) { var t = eq.tipo || "outro"; if (tipos.indexOf(t) < 0) tipos.push(t); });
    var xLegenda = x0 + MARGEM;
    var yLegenda = baseRodape + 30;
    tipos.forEach(function (tipo) {
      moldura.appendChild(el("rect", { x: xLegenda, y: yLegenda - 7.5, width: 8, height: 8, rx: 1.5, fill: corPorTipo(tipo) }));
      var rotulo = el("text", { x: xLegenda + 12, y: yLegenda, "font-size": 9, "fill-opacity": 0.8 }, tipo);
      moldura.appendChild(rotulo);
      xLegenda += 12 + tipo.length * 5.2 + 16;
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
          return;
        } catch (e) {}
      }

      baixarBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), nomeSvg);
    } catch (e) {
      mostrarErro("Não foi possível exportar o SVG.\nDetalhe: " + e.message);
    }
  });

  async function prepararSvgSeguroParaPng(svgEl) {
    var copia = svgEl.cloneNode(true);
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

  btnBaixarPng.addEventListener("click", async function () {
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) {
      mostrarErro("Gere o diagrama antes de baixar o PNG.");
      return;
    }

    var carregado = null;
    var textoOriginalBotao = btnBaixarPng.textContent;
    btnBaixarPng.disabled = true;
    btnBaixarPng.textContent = "Gerando PNG...";

    try {
      var preparado = await prepararSvgSeguroParaPng(svgEl);
      adicionarMolduraDeExportacao(preparado.svg);
      var svgText = new XMLSerializer().serializeToString(preparado.svg);
      carregado = await carregarSvgSerializadoComoImagem(svgText);

      // Tamanho da cópia emoldurada, não do SVG da tela.
      var vb = preparado.svg.viewBox && preparado.svg.viewBox.baseVal;
      var largura = vb && vb.width ? vb.width : (parseFloat(svgEl.getAttribute("width")) || carregado.imagem.naturalWidth || carregado.imagem.width);
      var altura = vb && vb.height ? vb.height : (parseFloat(svgEl.getAttribute("height")) || carregado.imagem.naturalHeight || carregado.imagem.height);

      if (!largura || !altura) throw new Error("Não foi possível determinar o tamanho do diagrama.");

      var escala = 2;
      var canvasPng = document.createElement("canvas");
      canvasPng.width = Math.max(1, Math.ceil(largura * escala));
      canvasPng.height = Math.max(1, Math.ceil(altura * escala));

      var contexto = canvasPng.getContext("2d");
      if (!contexto) throw new Error("Canvas 2D não está disponível neste navegador.");

      contexto.save();
      contexto.setTransform(1, 0, 0, 1, 0, 0);
      contexto.fillStyle = getComputedStyle(elCanvas).backgroundColor || "#ffffff";
      contexto.fillRect(0, 0, canvasPng.width, canvasPng.height);
      contexto.restore();

      contexto.drawImage(carregado.imagem, 0, 0, canvasPng.width, canvasPng.height);

      var pngBlob = await canvasParaPngBlob(canvasPng);
      baixarBlob(pngBlob, nomeArquivoExportacao("png"));

      if (preparado.imagensIgnoradas > 0) {
        mostrarErro("PNG baixado, mas " + preparado.imagensIgnoradas + " imagem(ns) não puderam ser incluídas.\n" +
          "Se forem imagens novas em assets/images, rode \"npm run icones\"; se vierem de outro site, envie o arquivo pelo campo Imagem do equipamento.");
      } else {
        esconderErro();
      }
    } catch (e) {
      mostrarErro("Não foi possível exportar o diagrama como PNG.\nDetalhe: " + e.message);
    } finally {
      if (carregado && carregado.url) URL.revokeObjectURL(carregado.url);
      btnBaixarPng.disabled = false;
      btnBaixarPng.textContent = textoOriginalBotao;
    }
  });

  (async function initDownloads() {
    try {
      if (window.claude && window.claude.use) { downloadsCap = await window.claude.use("downloads"); }
    } catch (e) { downloadsCap = null; }
    if (ultimoDot) btnBaixar.disabled = false;
  })();

  projetos = carregarProjetos();
  projetoAtual = localStorage.getItem("grafo-projeto-atual") || Object.keys(projetos)[0] || "Projeto principal";
  if (!projetos[projetoAtual]) projetoAtual = Object.keys(projetos)[0] || "Projeto principal";
  if (!projetos[projetoAtual]) projetos[projetoAtual] = projetoVazio();
  estado = clonarDados(projetos[projetoAtual]);
  ultimoEstadoHistorico = JSON.stringify(estado);
  atualizarBotoesHistorico();
  renderProjetos();
  renderTudo();
  if (estado.equipamentos.length) gerar(); else limparDiagrama();
})();
