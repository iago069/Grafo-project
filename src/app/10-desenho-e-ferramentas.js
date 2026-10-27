  // ==== 10-desenho-e-ferramentas.js: ferramentas no estilo draw.io (parte de assets/js/editor/app.js; npm run montar) ====
  // - Formas e texto livres (retângulo, elipse, seta, linha, texto) e caneta, por
  //   cima do diagrama, dentro do SVG (saem no PNG, SVG e PDF): estado.desenhos.
  // - Etiqueta de VLAN presa ao cabo e números nas pontas: conexao.vlan, redeVlan,
  //   numSaida, numChegada, etiqueta (deslocamento da etiqueta).
  // - Rota do cabo à mão: clique no cabo e arraste os quadradinhos dos trechos:
  //   conexao.rota (dobras, nas coordenadas do desenho).
  var DESENHO = {
    cores: ["#E5484D", "#3B82F6", "#22C55E", "#F59E0B", "#A855F7", "#111827", "#FFFFFF"],
    espessuras: [2, 4, 7],
    grade: 5
  };
  var ferramentaAtual = "selecionar";
  var estiloDesenho = { cor: DESENHO.cores[0], espessura: 2, tracejado: false, preencher: false, tamanho: 16 };
  var desenhoSelecionado = null;   // id
  var caboSelecionado = null;      // índice em estado.conexoes
  var rotasDesenhadas = {};        // índice do cabo -> pontos da rota desenhada

  function listaDesenhos() { return Array.isArray(estado.desenhos) ? estado.desenhos : []; }
  function novoIdDesenho() { return "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function arred(n) { return Math.round(n * 10) / 10; }
  function naGrade(n) { return Math.round(n / DESENHO.grade) * DESENHO.grade; }

  // Ponto do mouse nas coordenadas do desenho (as mesmas das posições dos equipamentos).
  function pontoNoDesenho(event) {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return null;
    var p = svg.createSVGPoint();
    p.x = event.clientX; p.y = event.clientY;
    var m = grafo.getScreenCTM();
    if (!m) return null;
    var q = p.matrixTransform(m.inverse());
    return { x: arred(q.x), y: arred(q.y) };
  }

  function el(nome, atributos, pai) {
    var e = document.createElementNS(NS_SVG, nome);
    Object.keys(atributos || {}).forEach(function (k) { if (atributos[k] != null) e.setAttribute(k, atributos[k]); });
    if (pai) pai.appendChild(e);
    return e;
  }

  // Salva uma mudança feita pelas ferramentas (vira um passo do desfazer) sem
  // redesenhar o diagrama inteiro: só desenhos, cabos e o que depende deles.
  function confirmarMudanca(cabos) {
    if (!elCanvas.querySelector("svg g.graph")) { renderTudo(); return; }
    if (cabos) { rotearCabosOrtogonalmente(); desenharAlcasDaRota(); }
    desenharDesenhos();
    aplicarCamadas();
    ajustarViewBoxAoConteudo(true);
    salvarLocal();
    atualizarJsonAvancado();
    window.dispatchEvent(new CustomEvent("grafo:render"));
  }

  // Troca só um desenho na tela (durante o arraste), mantendo a ordem.
  function redesenharUm(d) {
    var svg = elCanvas.querySelector("svg");
    var antigo = svg && svg.querySelector('g.desenho[data-desenho="' + d.id + '"]');
    var grupo = antigo ? antigo.parentNode : svg && svg.querySelector("g.camada-desenhos");
    if (!grupo) { desenharDesenhos(); return; }
    var marcador = antigo ? antigo.nextSibling : null;
    if (antigo) antigo.remove();
    desenharUm(grupo, d);
    var novo = grupo.lastChild;
    if (marcador && novo !== marcador) grupo.insertBefore(novo, marcador);
  }

  // ---- Desenhos (formas, texto, caneta) -----------------------------------------
  function caminhoDaCaneta(pontos) {
    if (!pontos || !pontos.length) return "";
    var d = "M" + pontos[0].x + "," + pontos[0].y;
    for (var i = 1; i < pontos.length - 1; i++) {
      var meio = { x: (pontos[i].x + pontos[i + 1].x) / 2, y: (pontos[i].y + pontos[i + 1].y) / 2 };
      d += " Q" + pontos[i].x + "," + pontos[i].y + " " + arred(meio.x) + "," + arred(meio.y);
    }
    var u = pontos[pontos.length - 1];
    return d + " L" + u.x + "," + u.y;
  }

  // Ponta da seta como triângulo próprio (marcadores herdam mal a cor ao exportar).
  function pontaDaSeta(d) {
    var ang = Math.atan2(d.y2 - d.y, d.x2 - d.x), tam = 8 + d.espessura * 2;
    var p1 = { x: d.x2 - tam * Math.cos(ang - 0.45), y: d.y2 - tam * Math.sin(ang - 0.45) };
    var p2 = { x: d.x2 - tam * Math.cos(ang + 0.45), y: d.y2 - tam * Math.sin(ang + 0.45) };
    return [d.x2 + "," + d.y2, arred(p1.x) + "," + arred(p1.y), arred(p2.x) + "," + arred(p2.y)].join(" ");
  }

  function caixaDoDesenho(d) {
    if (d.tipo === "caneta") {
      var xs = (d.pontos || []).map(function (p) { return p.x; }), ys = (d.pontos || []).map(function (p) { return p.y; });
      return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), x2: Math.max.apply(null, xs), y2: Math.max.apply(null, ys) };
    }
    return { x: Math.min(d.x, d.x2 == null ? d.x : d.x2), y: Math.min(d.y, d.y2 == null ? d.y : d.y2), x2: Math.max(d.x, d.x2 == null ? d.x : d.x2), y2: Math.max(d.y, d.y2 == null ? d.y : d.y2) };
  }

  function desenharUm(grupo, d) {
    var g = el("g", { "class": "desenho desenho-" + d.tipo + (d.id === desenhoSelecionado ? " selecionado" : ""), "data-desenho": d.id }, grupo);
    var traco = { stroke: d.cor, "stroke-width": d.espessura, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-dasharray": d.tracejado ? (d.espessura * 3) + " " + (d.espessura * 2.2) : null };
    var c = caixaDoDesenho(d);
    if (d.tipo === "retangulo") el("rect", Object.assign({}, traco, { x: c.x, y: c.y, width: c.x2 - c.x, height: c.y2 - c.y, rx: 4, fill: d.fundo || "none", "fill-opacity": d.fundo ? 0.25 : null }), g);
    else if (d.tipo === "elipse") el("ellipse", Object.assign({}, traco, { cx: (c.x + c.x2) / 2, cy: (c.y + c.y2) / 2, rx: Math.max(1, (c.x2 - c.x) / 2), ry: Math.max(1, (c.y2 - c.y) / 2), fill: d.fundo || "none", "fill-opacity": d.fundo ? 0.25 : null }), g);
    else if (d.tipo === "linha" || d.tipo === "seta") {
      el("line", Object.assign({}, traco, { x1: d.x, y1: d.y, x2: d.x2, y2: d.y2 }), g);
      if (d.tipo === "seta") el("polygon", { points: pontaDaSeta(d), fill: d.cor, stroke: d.cor, "stroke-width": 1, "stroke-linejoin": "round" }, g);
    } else if (d.tipo === "caneta") el("path", Object.assign({}, traco, { d: caminhoDaCaneta(d.pontos) }), g);
    else if (d.tipo === "texto") {
      var tamanho = d.tamanho || 16;
      var t = el("text", { x: d.x, y: d.y + tamanho, fill: d.cor, "font-family": "Helvetica, Arial, sans-serif", "font-size": tamanho, "font-weight": 700 }, g);
      String(d.texto || "").split(/\r?\n/).forEach(function (linha, i) {
        var ts = el("tspan", { x: d.x, dy: i ? tamanho * 1.25 : 0 }, t);
        ts.textContent = linha || " ";
      });
    }
    // Área de toque larga para traços finos.
    if (d.tipo === "linha" || d.tipo === "seta") el("line", { x1: d.x, y1: d.y, x2: d.x2, y2: d.y2, stroke: "transparent", "stroke-width": 14, "class": "desenho-toque" }, g);
    if (d.tipo === "caneta") el("path", { d: caminhoDaCaneta(d.pontos), stroke: "transparent", "stroke-width": 14, fill: "none", "class": "desenho-toque" }, g);
    // Forma sem preenchimento: pega pela borda larga (o miolo continua clicável por baixo).
    if (d.tipo === "retangulo") el("rect", { x: c.x, y: c.y, width: c.x2 - c.x, height: c.y2 - c.y, rx: 4, fill: d.fundo ? "transparent" : "none", stroke: "transparent", "stroke-width": 14, "class": "desenho-toque" }, g);
    if (d.tipo === "elipse") el("ellipse", { cx: (c.x + c.x2) / 2, cy: (c.y + c.y2) / 2, rx: Math.max(1, (c.x2 - c.x) / 2), ry: Math.max(1, (c.y2 - c.y) / 2), fill: d.fundo ? "transparent" : "none", stroke: "transparent", "stroke-width": 14, "class": "desenho-toque" }, g);
    if (d.id === desenhoSelecionado) desenharAlcasDoDesenho(g, d);
    ligarDesenho(g, d);
  }

  function desenharDesenhos() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var antigo = grafo.querySelector("g.camada-desenhos");
    if (antigo) antigo.remove();
    if (desenhoSelecionado && !listaDesenhos().some(function (d) { return d.id === desenhoSelecionado; })) desenhoSelecionado = null;
    var grupo = el("g", { "class": "camada-desenhos" });
    // Abaixo das anotações (que ficam sempre por cima), acima de cabos e equipamentos.
    var primeiraAnotacao = grafo.querySelector("g.anotacao");
    grafo.insertBefore(grupo, primeiraAnotacao || null);
    listaDesenhos().forEach(function (d) { desenharUm(grupo, d); });
    atualizarBarraDeEstilo();
  }

  function desenharAlcasDoDesenho(g, d) {
    var pontos;
    if (d.tipo === "linha" || d.tipo === "seta") pontos = [{ k: "a", x: d.x, y: d.y }, { k: "b", x: d.x2, y: d.y2 }];
    else if (d.tipo === "retangulo" || d.tipo === "elipse") {
      var c = caixaDoDesenho(d);
      pontos = [{ k: "nw", x: c.x, y: c.y }, { k: "ne", x: c.x2, y: c.y }, { k: "sw", x: c.x, y: c.y2 }, { k: "se", x: c.x2, y: c.y2 }];
    } else {
      var cx = caixaDoDesenho(d.tipo === "texto" ? caixaDeTexto(g, d) : d);
      el("rect", { x: cx.x - 4, y: cx.y - 4, width: cx.x2 - cx.x + 8, height: cx.y2 - cx.y + 8, fill: "none", stroke: "#3B82F6", "stroke-width": 1, "stroke-dasharray": "4 3", "class": "desenho-moldura" }, g);
      return;
    }
    pontos.forEach(function (p) {
      var a = el("rect", { x: p.x - 5, y: p.y - 5, width: 10, height: 10, rx: 2, fill: "#FFFFFF", stroke: "#3B82F6", "stroke-width": 1.5, "class": "desenho-alca", "data-alca": p.k }, g);
      a.addEventListener("pointerdown", function (event) { iniciarArrasteDeAlca(event, d, p.k); });
    });
  }

  function caixaDeTexto(g, d) {
    var t = g.querySelector("text");
    try { var b = t.getBBox(); return { tipo: "x", x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height }; } catch (e) { return { tipo: "x", x: d.x, y: d.y, x2: d.x + 60, y2: d.y + 20 }; }
  }

  // Ouvintes na janela (não no elemento): o desenho pode ser recriado durante o
  // arraste sem soltar do mouse. Um quadro por vez (requestAnimationFrame).
  function arrastar(event, mover, soltar) {
    var id = event.pointerId, quadro = 0, ultimo = null;
    document.body.classList.add("arrastando-desenho");
    function aoMover(e) {
      if (e.pointerId !== id) return;
      e.preventDefault();
      ultimo = e;
      if (!quadro) quadro = requestAnimationFrame(function () { quadro = 0; if (ultimo) mover(ultimo); });
    }
    function aoSoltar(e) {
      if (e.pointerId !== id) return;
      if (quadro) { cancelAnimationFrame(quadro); quadro = 0; if (ultimo) mover(ultimo); }
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
      document.body.classList.remove("arrastando-desenho");
      soltar(e);
    }
    window.addEventListener("pointermove", aoMover, { passive: false });
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
  }

  function iniciarArrasteDeAlca(event, d, alca) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      p = { x: naGrade(p.x), y: naGrade(p.y) };
      if (alca === "a") { d.x = p.x; d.y = p.y; }
      else if (alca === "b") { d.x2 = p.x; d.y2 = p.y; }
      else {
        var c = caixaDoDesenho(d);
        if (alca.indexOf("n") >= 0) c.y = p.y; else c.y2 = p.y;
        if (alca.indexOf("w") >= 0) c.x = p.x; else c.x2 = p.x;
        d.x = c.x; d.y = c.y; d.x2 = c.x2; d.y2 = c.y2;
      }
      redesenharUm(d);
    }, function () {
      var c = caixaDoDesenho(d);
      if (d.tipo !== "linha" && d.tipo !== "seta") { d.x = c.x; d.y = c.y; d.x2 = c.x2; d.y2 = c.y2; }
      confirmarMudanca();
    });
  }

  function moverDesenho(d, dx, dy) {
    if (d.tipo === "caneta") d.pontos = d.pontos.map(function (p) { return { x: arred(p.x + dx), y: arred(p.y + dy) }; });
    else { d.x = arred(d.x + dx); d.y = arred(d.y + dy); if (d.x2 != null) { d.x2 = arred(d.x2 + dx); d.y2 = arred(d.y2 + dy); } }
  }

  function ligarDesenho(g, d) {
    g.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      if (ferramentaAtual === "borracha") { event.stopPropagation(); apagarDesenho(d.id); return; }
      if (ferramentaAtual !== "selecionar") return; // desenhando por cima
      if (event.target.classList && event.target.classList.contains("desenho-alca")) return;
      event.stopPropagation();
      var inicio = pontoNoDesenho(event);
      if (!inicio) return;
      var original = JSON.stringify(d), moveu = false;
      selecionarDesenho(d.id);
      arrastar(event, function (e) {
        var p = pontoNoDesenho(e);
        if (!p) return;
        var copia = JSON.parse(original);
        Object.assign(d, copia);
        var dx = naGrade(p.x - inicio.x), dy = naGrade(p.y - inicio.y);
        if (Math.abs(dx) + Math.abs(dy) > 0) moveu = true;
        moverDesenho(d, dx, dy);
        redesenharUm(d);
      }, function () { if (moveu) confirmarMudanca(); });
    });
    g.addEventListener("dblclick", function (event) {
      event.stopPropagation();
      if (d.tipo === "texto") editarTextoDoDesenho(d);
    });
  }

  function selecionarDesenho(id) {
    if (desenhoSelecionado === id) return;
    var anterior = listaDesenhos().find(function (d) { return d.id === desenhoSelecionado; });
    desenhoSelecionado = id;
    if (id && caboSelecionado != null) selecionarCabo(null);
    if (anterior) redesenharUm(anterior);
    var atual = listaDesenhos().find(function (d) { return d.id === id; });
    if (atual) redesenharUm(atual);
    atualizarBarraDeEstilo();
  }

  function apagarDesenho(id) {
    estado.desenhos = listaDesenhos().filter(function (d) { return d.id !== id; });
    if (desenhoSelecionado === id) desenhoSelecionado = null;
    confirmarMudanca();
  }

  async function editarTextoDoDesenho(d, novo) {
    var valor = await abrirModal({ title: novo ? "Novo texto" : "Editar texto", message: "Texto que aparece no diagrama:", kind: "prompt", defaultValue: d.texto || "", confirmText: "Salvar" });
    if (valor == null) { if (novo) apagarDesenho(d.id); return; }
    valor = String(valor).slice(0, LIMITES.textoDesenho || 300);
    if (!valor.trim()) { apagarDesenho(d.id); return; }
    d.texto = valor;
    if (novo && listaDesenhos().indexOf(d) < 0) estado.desenhos = listaDesenhos().concat([d]);
    desenhoSelecionado = d.id;
    confirmarMudanca();
  }

  // ---- Desenhar com as ferramentas ----------------------------------------------
  function limiteDeDesenhos() {
    if (listaDesenhos().length >= (LIMITES.desenhos || 300)) { avisar("Limite de " + (LIMITES.desenhos || 300) + " desenhos por diagrama atingido."); return true; }
    return false;
  }

  function comecarDesenho(event) {
    var inicio = pontoNoDesenho(event);
    if (!inicio) return;
    if (limiteDeDesenhos()) return;
    var base = { id: novoIdDesenho(), cor: estiloDesenho.cor, espessura: estiloDesenho.espessura };
    if (estiloDesenho.tracejado) base.tracejado = true;
    if (ferramentaAtual === "texto") {
      var t = Object.assign(base, { tipo: "texto", x: naGrade(inicio.x), y: naGrade(inicio.y), texto: "", tamanho: estiloDesenho.tamanho });
      editarTextoDoDesenho(t, true);
      return;
    }
    if (ferramentaAtual === "caneta") {
      var traco = Object.assign(base, { tipo: "caneta", x: inicio.x, y: inicio.y, pontos: [inicio] });
      estado.desenhos = listaDesenhos().concat([traco]);
      desenharDesenhos();
      arrastar(event, function (e) {
        var p = pontoNoDesenho(e);
        var u = traco.pontos[traco.pontos.length - 1];
        if (!p || Math.hypot(p.x - u.x, p.y - u.y) < 3 || traco.pontos.length >= (LIMITES.pontosCaneta || 600)) return;
        traco.pontos.push(p);
        redesenharUm(traco);
      }, function () {
        if (traco.pontos.length < 2) traco.pontos.push({ x: inicio.x + 0.5, y: inicio.y + 0.5 });
        confirmarMudanca();
      });
      return;
    }
    var p0 = { x: naGrade(inicio.x), y: naGrade(inicio.y) };
    var forma = Object.assign(base, { tipo: ferramentaAtual, x: p0.x, y: p0.y, x2: p0.x, y2: p0.y });
    if ((ferramentaAtual === "retangulo" || ferramentaAtual === "elipse") && estiloDesenho.preencher) forma.fundo = estiloDesenho.cor;
    estado.desenhos = listaDesenhos().concat([forma]);
    desenharDesenhos();
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      forma.x2 = naGrade(p.x); forma.y2 = naGrade(p.y);
      // Shift: linha reta (0/45/90°) ou forma quadrada.
      if (e.shiftKey) {
        var dx = forma.x2 - forma.x, dy = forma.y2 - forma.y;
        if (forma.tipo === "linha" || forma.tipo === "seta") {
          if (Math.abs(dx) > Math.abs(dy) * 2) forma.y2 = forma.y; else if (Math.abs(dy) > Math.abs(dx) * 2) forma.x2 = forma.x;
          else { var m = Math.max(Math.abs(dx), Math.abs(dy)); forma.x2 = forma.x + Math.sign(dx) * m; forma.y2 = forma.y + Math.sign(dy) * m; }
        } else { var l = Math.max(Math.abs(dx), Math.abs(dy)); forma.x2 = forma.x + Math.sign(dx || 1) * l; forma.y2 = forma.y + Math.sign(dy || 1) * l; }
      }
      redesenharUm(forma);
    }, function () {
      // Clique sem arrastar: tamanho padrão.
      if (Math.abs(forma.x2 - forma.x) < 4 && Math.abs(forma.y2 - forma.y) < 4) {
        forma.x2 = forma.x + (forma.tipo === "linha" || forma.tipo === "seta" ? 80 : 120);
        forma.y2 = forma.y + (forma.tipo === "linha" || forma.tipo === "seta" ? 0 : 60);
      }
      if (forma.tipo !== "linha" && forma.tipo !== "seta") { var c = caixaDoDesenho(forma); forma.x = c.x; forma.y = c.y; forma.x2 = c.x2; forma.y2 = c.y2; }
      desenhoSelecionado = forma.id;
      confirmarMudanca();
      escolherFerramenta("selecionar");
    });
  }

  // Com uma ferramenta de desenho ativa, o clique no canvas desenha em vez de mover a tela.
  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || event.pointerType === "touch" && event.isPrimary === false) return;
    if (ferramentaAtual === "selecionar") {
      // Clique no vazio tira a seleção do desenho e do cabo.
      if (!event.target.closest || (!event.target.closest("g.desenho") && !event.target.closest("g.edge") && !event.target.closest(".rota-alca"))) {
        if (desenhoSelecionado) { desenhoSelecionado = null; desenharDesenhos(); }
        if (caboSelecionado != null) selecionarCabo(null);
      }
      return;
    }
    if (ferramentaAtual === "borracha") {
      var alvo = event.target.closest && event.target.closest("g.desenho");
      if (alvo) { event.stopPropagation(); apagarDesenho(alvo.getAttribute("data-desenho")); }
      else event.stopPropagation();
      return;
    }
    if (!elCanvas.querySelector("svg g.graph")) { avisar("Adicione equipamentos antes de desenhar."); return; }
    event.stopPropagation();
    event.preventDefault();
    comecarDesenho(event);
  }, true);

  // Borracha arrastando: apaga o que passar por baixo.
  elCanvas.addEventListener("pointermove", function (event) {
    if (ferramentaAtual !== "borracha" || !(event.buttons & 1)) return;
    var alvo = document.elementFromPoint(event.clientX, event.clientY);
    var g = alvo && alvo.closest && alvo.closest("g.desenho");
    if (g) apagarDesenho(g.getAttribute("data-desenho"));
  });

  document.addEventListener("keydown", function (event) {
    var alvo = event.target;
    if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
    if (document.querySelector(".modal-backdrop:not(.hidden)")) return;
    if ((event.key === "Delete" || event.key === "Backspace") && desenhoSelecionado) {
      event.preventDefault(); event.stopImmediatePropagation();
      apagarDesenho(desenhoSelecionado);
      return;
    }
    if (event.key === "Escape" && (ferramentaAtual !== "selecionar" || desenhoSelecionado || caboSelecionado != null)) {
      escolherFerramenta("selecionar");
      desenhoSelecionado = null;
      selecionarCabo(null);
      desenharDesenhos();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var atalho = { v: "selecionar", t: "texto", r: "retangulo", e: "elipse", a: "seta", l: "linha", p: "caneta", b: "borracha" }[event.key.toLowerCase()];
    if (atalho && document.body.getAttribute("data-vista") !== "inicio" && caixaFerramentas && !caixaFerramentas.hidden) {
      event.preventDefault();
      escolherFerramenta(atalho);
    }
  }, true);

  // ---- Caixa de ferramentas e barra de estilo -----------------------------------
  var FERRAMENTAS = [
    ["selecionar", "Selecionar e mover (V)", '<path d="M5 3l14 8-6 1.5L10 19z"/>'],
    ["texto", "Texto (T)", '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
    ["retangulo", "Retângulo (R)", '<rect x="4" y="6" width="16" height="12" rx="2"/>'],
    ["elipse", "Elipse (E)", '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>'],
    ["seta", "Seta (A)", '<path d="M5 19L19 5M10 5h9v9"/>'],
    ["linha", "Linha (L)", '<path d="M5 19L19 5"/>'],
    ["caneta", "Caneta (P)", '<path d="M4 20c3-1 4-4 7-7l5-5 3 3-5 5c-3 3-6 4-7 7z"/><path d="M14 7l3 3"/>'],
    ["borracha", "Borracha (B): clique ou arraste sobre o desenho", '<path d="M7 20h11M5 15l8-8 6 6-5 5H9z"/>']
  ];
  var caixaFerramentas = null, barraEstilo = null;

  function svgIcone(conteudo) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + conteudo + "</svg>";
  }

  function criarCaixaDeFerramentas() {
    var area = elCanvas.parentNode;
    if (!area || document.getElementById("caixaFerramentas")) return;
    caixaFerramentas = document.createElement("div");
    caixaFerramentas.id = "caixaFerramentas";
    caixaFerramentas.className = "caixa-ferramentas";
    caixaFerramentas.setAttribute("role", "toolbar");
    caixaFerramentas.setAttribute("aria-label", "Ferramentas de desenho");
    caixaFerramentas.innerHTML = FERRAMENTAS.map(function (f) {
      return '<button type="button" class="ferramenta-desenho" data-ferramenta="' + f[0] + '" title="' + f[1] + '" aria-label="' + f[1] + '" aria-pressed="' + (f[0] === ferramentaAtual) + '">' + svgIcone(f[2]) + "</button>";
    }).join("");
    area.appendChild(caixaFerramentas);
    caixaFerramentas.addEventListener("click", function (event) {
      var b = event.target.closest("[data-ferramenta]");
      if (b) escolherFerramenta(b.getAttribute("data-ferramenta"));
    });
    caixaFerramentas.addEventListener("pointerdown", function (event) { event.stopPropagation(); });

    barraEstilo = document.createElement("div");
    barraEstilo.className = "barra-estilo-desenho";
    barraEstilo.hidden = true;
    barraEstilo.innerHTML =
      '<div class="be-grupo" data-be="cores">' + DESENHO.cores.map(function (c) { return '<button type="button" class="be-cor" data-cor="' + c + '" style="--c:' + c + '" title="Cor ' + c + '" aria-label="Cor ' + c + '"></button>'; }).join("") + "</div>" +
      '<div class="be-grupo" data-be="espessura">' + DESENHO.espessuras.map(function (e, i) { return '<button type="button" class="be-esp" data-esp="' + e + '" title="' + ["Fina", "Média", "Grossa"][i] + '"><span style="height:' + e + 'px"></span></button>'; }).join("") + "</div>" +
      '<div class="be-grupo"><button type="button" class="be-alt" data-be-alt="tracejado" title="Tracejado">┄</button><button type="button" class="be-alt" data-be-alt="preencher" title="Preencher a forma">◼</button></div>' +
      '<div class="be-grupo" data-be="texto"><button type="button" class="be-alt" data-be-tam="-2" title="Texto menor">A−</button><button type="button" class="be-alt" data-be-tam="2" title="Texto maior">A+</button></div>' +
      '<div class="be-grupo" data-be="cabo"><span class="be-dica">Arraste os quadradinhos para mudar o caminho</span><button type="button" class="be-alt be-texto" data-be-acao="rota-auto">Rota automática</button></div>' +
      '<div class="be-grupo"><button type="button" class="be-alt be-perigo" data-be-acao="excluir" title="Excluir (Delete)">Excluir</button></div>';
    area.appendChild(barraEstilo);
    barraEstilo.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    barraEstilo.addEventListener("click", aoClicarNaBarraDeEstilo);
    atualizarBarraDeEstilo();
  }

  function escolherFerramenta(nome) {
    ferramentaAtual = nome;
    document.body.setAttribute("data-ferramenta-ativa", nome);
    if (caixaFerramentas) caixaFerramentas.querySelectorAll("[data-ferramenta]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-ferramenta") === nome)); });
    if (nome !== "selecionar") { selecionarCabo(null); }
    atualizarBarraDeEstilo();
  }

  function desenhoAtual() { return listaDesenhos().find(function (d) { return d.id === desenhoSelecionado; }) || null; }

  function atualizarBarraDeEstilo() {
    if (!barraEstilo) return;
    var d = desenhoAtual();
    var desenhando = ["texto", "retangulo", "elipse", "seta", "linha", "caneta"].indexOf(ferramentaAtual) >= 0;
    var cabo = caboSelecionado != null && estado.conexoes[caboSelecionado];
    barraEstilo.hidden = !(d || desenhando || cabo);
    if (barraEstilo.hidden) return;
    var tipo = d ? d.tipo : ferramentaAtual;
    var mostrar = function (qual, sim) { var g = barraEstilo.querySelector('[data-be="' + qual + '"]'); if (g) g.hidden = !sim; };
    var deDesenho = !!(d || desenhando);
    barraEstilo.querySelectorAll(".be-grupo").forEach(function (g) { g.hidden = false; });
    mostrar("cores", deDesenho);
    mostrar("espessura", deDesenho && tipo !== "texto");
    mostrar("texto", deDesenho && tipo === "texto");
    mostrar("cabo", !!cabo && !deDesenho);
    var alt = barraEstilo.querySelector('[data-be-alt="tracejado"]').parentNode;
    alt.hidden = !deDesenho || tipo === "texto";
    barraEstilo.querySelector('[data-be-alt="preencher"]').hidden = !(tipo === "retangulo" || tipo === "elipse");
    barraEstilo.querySelector('[data-be-acao="excluir"]').parentNode.hidden = !d;
    var cor = d ? d.cor : estiloDesenho.cor, esp = d ? d.espessura : estiloDesenho.espessura;
    barraEstilo.querySelectorAll("[data-cor]").forEach(function (b) { b.classList.toggle("ativo", b.getAttribute("data-cor").toUpperCase() === String(cor).toUpperCase()); });
    barraEstilo.querySelectorAll("[data-esp]").forEach(function (b) { b.classList.toggle("ativo", Number(b.getAttribute("data-esp")) === Number(esp)); });
    barraEstilo.querySelector('[data-be-alt="tracejado"]').classList.toggle("ativo", d ? !!d.tracejado : estiloDesenho.tracejado);
    barraEstilo.querySelector('[data-be-alt="preencher"]').classList.toggle("ativo", d ? !!d.fundo : estiloDesenho.preencher);
  }

  function aoClicarNaBarraDeEstilo(event) {
    var b = event.target.closest("button");
    if (!b) return;
    var d = desenhoAtual();
    if (b.hasAttribute("data-cor")) {
      estiloDesenho.cor = b.getAttribute("data-cor");
      if (d) { d.cor = estiloDesenho.cor; if (d.fundo) d.fundo = d.cor; confirmarMudanca(); }
    } else if (b.hasAttribute("data-esp")) {
      estiloDesenho.espessura = Number(b.getAttribute("data-esp"));
      if (d) { d.espessura = estiloDesenho.espessura; confirmarMudanca(); }
    } else if (b.getAttribute("data-be-alt") === "tracejado") {
      estiloDesenho.tracejado = d ? !d.tracejado : !estiloDesenho.tracejado;
      if (d) { if (estiloDesenho.tracejado) d.tracejado = true; else delete d.tracejado; confirmarMudanca(); }
    } else if (b.getAttribute("data-be-alt") === "preencher") {
      estiloDesenho.preencher = d ? !d.fundo : !estiloDesenho.preencher;
      if (d) { if (estiloDesenho.preencher) d.fundo = d.cor; else delete d.fundo; confirmarMudanca(); }
    } else if (b.hasAttribute("data-be-tam")) {
      var novo = Math.max(8, Math.min(72, ((d && d.tamanho) || estiloDesenho.tamanho) + Number(b.getAttribute("data-be-tam"))));
      estiloDesenho.tamanho = novo;
      if (d) { d.tamanho = novo; confirmarMudanca(); }
    } else if (b.getAttribute("data-be-acao") === "excluir" && d) apagarDesenho(d.id);
    else if (b.getAttribute("data-be-acao") === "rota-auto" && caboSelecionado != null) {
      var c = estado.conexoes[caboSelecionado];
      if (c) { delete c.rota; confirmarMudanca(true); avisar("O cabo voltou para a rota automática."); }
    }
    atualizarBarraDeEstilo();
  }

  // ---- Etiqueta de VLAN e números nas pontas do cabo ---------------------------
  function pontoAoLongo(pts, distancia, doFim) {
    var lista = doFim ? pts.slice().reverse() : pts;
    var resto = distancia;
    for (var i = 1; i < lista.length; i++) {
      var a = lista[i - 1], b = lista[i], comp = Math.hypot(b.x - a.x, b.y - a.y);
      if (comp >= resto || i === lista.length - 1) {
        var t = comp ? Math.min(1, resto / comp) : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, horizontal: Math.abs(a.y - b.y) < 0.5 };
      }
      resto -= comp;
    }
    return { x: lista[0].x, y: lista[0].y, horizontal: true };
  }

  function meioDaRota(pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return pontoAoLongo(pts, total / 2);
  }

  function desenharExtrasDoCabo(aresta, pts, conexao) {
    aresta.querySelectorAll(".cabo-extra").forEach(function (e) { e.remove(); });
    if (!pts || pts.length < 2) return;
    [["numSaida", false], ["numChegada", true]].forEach(function (par) {
      var valor = String(conexao[par[0]] || "").trim();
      if (!valor) return;
      var p = pontoAoLongo(pts, 26, par[1]);
      var t = el("text", { "class": "cabo-extra cabo-num", x: arred(p.x + (p.horizontal ? 0 : 6)), y: arred(p.y + (p.horizontal ? -5 : 4)), "text-anchor": p.horizontal ? "middle" : "start",
        "font-family": "Helvetica, Arial, sans-serif", "font-size": 10, "font-weight": 700, fill: "#14212B", stroke: "#FFFFFF", "stroke-width": 3, "paint-order": "stroke" }, aresta);
      t.textContent = valor;
    });
    var vlan = String(conexao.vlan || "").trim(), rede = String(conexao.redeVlan || "").trim();
    if (!vlan && !rede) return;
    var meio = meioDaRota(pts);
    var desloc = conexao.etiqueta || { x: meio.horizontal ? 0 : 46, y: meio.horizontal ? -32 : 0 };
    var cx = meio.x + desloc.x, cy = meio.y + desloc.y;
    var g = el("g", { "class": "cabo-extra cabo-etiqueta" }, aresta);
    el("line", { x1: arred(meio.x), y1: arred(meio.y), x2: arred(cx), y2: arred(cy), stroke: "#D6336C", "stroke-width": 1, "stroke-dasharray": "3 2", "class": "cabo-etiqueta-guia" }, g);
    var linhas = [vlan ? "VLAN " + vlan.replace(/^vlan\s*/i, "") : "", rede].filter(Boolean);
    var rect = el("rect", { rx: 3, fill: "#F8C9D4", stroke: "#D6336C", "stroke-width": 1 }, g);
    var texto = el("text", { "font-family": "Helvetica, Arial, sans-serif", "font-size": 9.5, fill: "#3A0E1C", "text-anchor": "middle" }, g);
    linhas.forEach(function (l, i) { var ts = el("tspan", { x: arred(cx), y: arred(cy + 3.5 + (i - (linhas.length - 1) / 2) * 12) }, texto); ts.textContent = l; });
    var largura = 90;
    try { largura = Math.max(60, texto.getBBox().width + 14); } catch (e) {}
    var altura = linhas.length * 12 + 8;
    rect.setAttribute("x", arred(cx - largura / 2)); rect.setAttribute("y", arred(cy - altura / 2));
    rect.setAttribute("width", arred(largura)); rect.setAttribute("height", altura);
    // Arrastar a etiqueta: ela continua presa ao cabo (a guia tracejada mostra a qual).
    g.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || ferramentaAtual !== "selecionar") return;
      event.stopPropagation();
      var inicio = pontoNoDesenho(event), base = { x: desloc.x, y: desloc.y }, moveu = false;
      if (!inicio) return;
      arrastar(event, function (e) {
        var p = pontoNoDesenho(e);
        if (!p) return;
        conexao.etiqueta = { x: arred(base.x + p.x - inicio.x), y: arred(base.y + p.y - inicio.y) };
        moveu = true;
        desenharExtrasDoCabo(aresta, pts, conexao);
      }, function () { if (moveu) confirmarMudanca(true); });
    });
    g.addEventListener("dblclick", function (event) { event.stopPropagation(); abrirEditorCabo(conexao); });
  }

  // ---- Rota do cabo à mão -------------------------------------------------------
  // Liga os pontos com trechos retos (horizontal ou vertical), dobrando onde precisa.
  function ortogonalizar(pontos) {
    var saida = [pontos[0]];
    for (var i = 1; i < pontos.length; i++) {
      var a = saida[saida.length - 1], b = pontos[i];
      if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
        // Dobra que mantém a direção do trecho anterior.
        var anterior = saida[saida.length - 2];
        var vinhaHorizontal = anterior ? Math.abs(anterior.y - a.y) < 0.5 : true;
        saida.push(vinhaHorizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      }
      saida.push(b);
    }
    return saida;
  }

  function limparPontos(pontos) {
    var p = pontos.filter(function (q, i) { var a = pontos[i - 1]; return !a || Math.abs(a.x - q.x) > 0.5 || Math.abs(a.y - q.y) > 0.5; });
    // Tira pontos no meio de um trecho reto.
    return p.filter(function (q, i) {
      if (i === 0 || i === p.length - 1) return true;
      var a = p[i - 1], b = p[i + 1];
      return !((Math.abs(a.x - q.x) < 0.5 && Math.abs(q.x - b.x) < 0.5) || (Math.abs(a.y - q.y) < 0.5 && Math.abs(q.y - b.y) < 0.5));
    });
  }

  // A rota guarda as duas pontas de quando foi feita. Se um equipamento mudou de
  // lugar (arrastar, Organizar), ela não vale mais: o cabo volta para a rota
  // automática em vez de dar voltas pelo desenho. Retorna null nesse caso.
  var TOLERANCIA_PONTA = 30;
  function rotaManualDoCabo(s, e, rota) {
    if (!Array.isArray(rota) || rota.length < 3) return null;
    var a = rota[0], b = rota[rota.length - 1];
    if (Math.hypot(a.x - s.x, a.y - s.y) > TOLERANCIA_PONTA || Math.hypot(b.x - e.x, b.y - e.y) > TOLERANCIA_PONTA) return null;
    var meio = rota.slice(1, -1).map(function (p) { return { x: p.x, y: p.y }; });
    return limparPontos(ortogonalizar([s].concat(meio, [e])));
  }

  // Depois de Organizar: rotas à mão saem, e notas e desenhos vêm para logo
  // abaixo dos equipamentos (senão ficam longe e o zoom vai lá embaixo).
  function arrumarDepoisDeOrganizar() {
    estado.conexoes.forEach(function (c) { delete c.rota; delete c.etiqueta; });
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    var m = grafo && grafo.getScreenCTM();
    if (!m) return false;
    var inv = m.inverse(), caixa = null;
    svg.querySelectorAll("g.node").forEach(function (no) {
      var r = no.getBoundingClientRect();
      [[r.left, r.top], [r.right, r.bottom]].forEach(function (c) {
        var q = svg.createSVGPoint(); q.x = c[0]; q.y = c[1];
        var t = q.matrixTransform(inv);
        if (!caixa) caixa = { x: t.x, y: t.y, x2: t.x, y2: t.y };
        caixa.x = Math.min(caixa.x, t.x); caixa.y = Math.min(caixa.y, t.y);
        caixa.x2 = Math.max(caixa.x2, t.x); caixa.y2 = Math.max(caixa.y2, t.y);
      });
    });
    if (!caixa) return false;
    var mudou = false, y = caixa.y2 + 50;
    var longe = function (b) { return b.x2 < caixa.x - 200 || b.x > caixa.x2 + 200 || b.y2 < caixa.y - 200 || b.y > caixa.y2 + 200; };
    (estado.anotacoes || []).forEach(function (a) {
      if (!longe({ x: a.x, y: a.y, x2: a.x + 200, y2: a.y + 40 })) return;
      a.x = Math.round(caixa.x); a.y = Math.round(y); y += 60; mudou = true;
    });
    var desenhos = listaDesenhos();
    if (desenhos.length) {
      var bd = null;
      desenhos.forEach(function (d) { var b = caixaDoDesenho(d); bd = bd ? { x: Math.min(bd.x, b.x), y: Math.min(bd.y, b.y), x2: Math.max(bd.x2, b.x2), y2: Math.max(bd.y2, b.y2) } : b; });
      if (bd && longe(bd)) {
        var dx = caixa.x - bd.x, dy = y + 10 - bd.y;
        desenhos.forEach(function (d) { moverDesenho(d, dx, dy); });
        mudou = true;
      }
    }
    return mudou;
  }

  function selecionarCabo(indice) {
    caboSelecionado = indice;
    var svg = elCanvas.querySelector("svg");
    if (svg) {
      svg.querySelectorAll("g.edge.cabo-selecionado").forEach(function (a) { a.classList.remove("cabo-selecionado"); });
      if (indice != null) { var a = svg.querySelector('g.edge[id="edge_' + indice + '"]'); if (a) a.classList.add("cabo-selecionado"); }
    }
    if (indice != null && desenhoSelecionado) { desenhoSelecionado = null; desenharDesenhos(); }
    desenharAlcasDaRota();
    atualizarBarraDeEstilo();
  }

  function desenharAlcasDaRota() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    grafo.querySelectorAll("g.rota-alcas").forEach(function (g) { g.remove(); });
    var pts = caboSelecionado != null ? rotasDesenhadas[caboSelecionado] : null;
    if (!pts) return;
    var g = el("g", { "class": "rota-alcas" }, grafo);
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 16) continue;
      var horizontal = Math.abs(a.y - b.y) < 0.5;
      var alca = el("rect", { x: arred((a.x + b.x) / 2 - 6), y: arred((a.y + b.y) / 2 - 6), width: 12, height: 12, rx: 3,
        "class": "rota-alca " + (horizontal ? "rota-h" : "rota-v"), "data-trecho": i }, g);
      alca.addEventListener("pointerdown", iniciarArrasteDeTrecho);
      alca.addEventListener("dblclick", function (event) { event.stopPropagation(); var c = estado.conexoes[caboSelecionado]; if (c) abrirEditorCabo(c); });
    }
  }

  // Arrastar o trecho k do cabo para os lados (como no draw.io). Trecho preso a
  // uma porta ganha uma dobra perto dela para continuar saindo reto.
  function iniciarArrasteDeTrecho(event) {
    if (event.button !== 0 || caboSelecionado == null) return;
    event.stopPropagation();
    event.preventDefault();
    var indice = caboSelecionado, conexao = estado.conexoes[indice];
    var P = (rotasDesenhadas[indice] || []).map(function (p) { return { x: p.x, y: p.y }; });
    var k = Number(event.currentTarget.getAttribute("data-trecho"));
    if (!conexao || P.length < 2 || !(k >= 0)) return;
    var horizontal = Math.abs(P[k].y - P[k + 1].y) < 0.5;
    function toco(de, para) {
      var comp = Math.hypot(para.x - de.x, para.y - de.y) || 1, d = Math.min(20, comp / 3);
      return { x: arred(de.x + (para.x - de.x) / comp * d), y: arred(de.y + (para.y - de.y) / comp * d) };
    }
    if (k + 1 === P.length - 1) { var m2 = toco(P[k + 1], P[k]); P.splice(k + 1, 0, { x: m2.x, y: m2.y }, { x: m2.x, y: m2.y }); }
    if (k === 0) { var m1 = toco(P[0], P[1]); P.splice(1, 0, { x: m1.x, y: m1.y }, { x: m1.x, y: m1.y }); k += 2; }
    var moveu = false;
    var svg = elCanvas.querySelector("svg");
    var aresta = svg && svg.querySelector('g.edge[id="edge_' + indice + '"]');
    var caminho = aresta && aresta.querySelector("path");
    var alcaArrastada = event.currentTarget;
    // Só a alça arrastada fica visível; o cabo é redesenhado sozinho (sem rotear os outros).
    if (svg) svg.querySelectorAll(".rota-alca").forEach(function (a) { if (a !== alcaArrastada) a.style.display = "none"; });
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      if (horizontal) { P[k].y = naGrade(p.y); P[k + 1].y = naGrade(p.y); }
      else { P[k].x = naGrade(p.x); P[k + 1].x = naGrade(p.x); }
      moveu = true;
      var pts = limparPontos(P.map(function (q) { return { x: q.x, y: q.y }; }));
      if (caminho) caminho.setAttribute("d", caminhoOrtogonalArredondado(pts));
      if (aresta) desenharExtrasDoCabo(aresta, pts, conexao);
      alcaArrastada.setAttribute("x", arred((P[k].x + P[k + 1].x) / 2 - 6));
      alcaArrastada.setAttribute("y", arred((P[k].y + P[k + 1].y) / 2 - 6));
    }, function () {
      if (!moveu) { desenharAlcasDaRota(); return; }
      var limpa = limparPontos(P.map(function (q) { return { x: q.x, y: q.y }; }));
      conexao.rota = limpa.slice(0, LIMITES.pontosRota || 40);
      confirmarMudanca(true);
    });
  }

  // Clique no cabo seleciona (alças da rota e barra com "Rota automática").
  function ativarSelecaoDosCabos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var m = /^edge_(\d+)$/.exec(aresta.id || "");
      if (!m) return;
      aresta.addEventListener("click", function (event) {
        if (ferramentaAtual !== "selecionar") return;
        if (event.target.closest && event.target.closest(".cabo-etiqueta")) return;
        event.stopPropagation();
        selecionarCabo(Number(m[1]));
      });
    });
    if (caboSelecionado != null && !estado.conexoes[caboSelecionado]) caboSelecionado = null;
    selecionarCabo(caboSelecionado);
  }

  // ---- Biblioteca de equipamentos (como as formas do draw.io) -------------------
  // Clique num item: entra no centro da tela. Arrastar: entra onde soltar.
  var bibliotecaEquip = null, entradasSeguidas = 0;

  function nomeLivre(tipo) {
    var usados = {};
    estado.equipamentos.forEach(function (eq) { usados[String(eq.nome || "").toLowerCase()] = true; });
    for (var n = 1; ; n++) { var nome = (tipo || "Equipamento") + " " + n; if (!usados[nome.toLowerCase()]) return nome.slice(0, 60); }
  }

  function adicionarEquipamentoEm(tipo, icone, ponto) {
    var limite = limiteAtingido("equipamento");
    if (limite) { avisar(limite); return null; }
    var v = Esquema.validarEquipamento({ id: novoId(), nome: nomeLivre(tipo), tipo: tipo, icone: icone || iconePorTipo(tipo), imagem: "", corFonte: "#16323D", status: "ativo" });
    if (!v.ok) { avisar(textoDosErros(v.erros)); return null; }
    var eq = v.dados;
    if (ponto) eq.posicao = { x: Math.round(ponto.x), y: Math.round(ponto.y) };
    estado.equipamentos.push(eq);
    renderTudo();
    if (typeof renderSidebarPanels === "function") renderSidebarPanels();
    avisar(eq.nome + " adicionado. Duplo clique nele para editar o nome, IP e portas.");
    return eq;
  }

  function pontoParaNovo() {
    var c = centroVisivelNoDesenho();
    var passo = (entradasSeguidas++ % 6) * 40;
    return { x: c.x + passo, y: c.y + passo };
  }

  function tiposParaBiblioteca() {
    var lista = (typeof catalogoTiposEquipamentos !== "undefined" ? catalogoTiposEquipamentos : []).filter(function (t) { return t && t.nome; });
    var vistos = {}, icones = {};
    return lista.filter(function (t) {
      if (t.apelido) return false; // outro nome para um símbolo que já está na lista
      var k = normalizarTextoEquipamento(t.nome), ic = String(t.icone || "");
      if (vistos[k] || (ic && icones[ic] && !/CX\.png$/i.test(ic))) return false; // CTO e CX usam o mesmo desenho, de propósito
      vistos[k] = true; if (ic) icones[ic] = true;
      return true;
    });
  }

  function criarBibliotecaDeEquipamentos() {
    if (!caixaFerramentas || document.getElementById("bibliotecaEquip")) return;
    var botao = document.createElement("button");
    botao.type = "button";
    botao.className = "ferramenta-desenho ferramenta-equip";
    botao.id = "btnBibliotecaEquip";
    botao.title = "Equipamentos: clique para adicionar, ou arraste para o diagrama";
    botao.setAttribute("aria-label", botao.title);
    botao.setAttribute("aria-expanded", "false");
    botao.innerHTML = svgIcone('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10M12 16v4M9 10h6M12 7v6"/>');
    caixaFerramentas.insertBefore(botao, caixaFerramentas.firstChild);
    var sep = document.createElement("span");
    sep.className = "ferramentas-sep";
    caixaFerramentas.insertBefore(sep, botao.nextSibling);

    bibliotecaEquip = document.createElement("div");
    bibliotecaEquip.id = "bibliotecaEquip";
    bibliotecaEquip.className = "biblioteca-equip painel-flutuante";
    bibliotecaEquip.hidden = true;
    bibliotecaEquip.setAttribute("role", "dialog");
    bibliotecaEquip.setAttribute("aria-label", "Equipamentos");
    bibliotecaEquip.innerHTML = '<div class="be-topo"><strong>Equipamentos</strong><span>clique ou arraste</span></div>' +
      '<input type="search" class="be-busca" placeholder="Buscar (OLT, switch...)" aria-label="Buscar equipamento">' +
      '<div class="be-grade"></div>';
    document.body.appendChild(bibliotecaEquip);
    bibliotecaEquip.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    var busca = bibliotecaEquip.querySelector(".be-busca"), grade = bibliotecaEquip.querySelector(".be-grade");

    function montar() {
      var termo = busca.value.trim().toLowerCase();
      var tipos = tiposParaBiblioteca().filter(function (t) { return !termo || t.nome.toLowerCase().indexOf(termo) >= 0; });
      // O que começa com o termo vem primeiro ("olt" acha OLT antes de Volt).
      if (termo) tipos.sort(function (x, y) { return x.nome.toLowerCase().indexOf(termo) - y.nome.toLowerCase().indexOf(termo) || x.nome.localeCompare(y.nome); });
      grade.innerHTML = tipos.map(function (t) {
        var icone = t.icone || iconePorTipo(t.nome);
        return '<button type="button" class="be-item" draggable="true" data-tipo="' + escaparHtml(t.nome) + '" data-icone="' + escaparHtml(icone || "") + '" title="' + escaparHtml(t.nome) + '">' +
          '<span class="be-icone">' + (icone ? '<img src="' + escaparHtml(icone) + '" alt="" draggable="false">' : "") + '</span><span class="be-nome">' + escaparHtml(t.nome) + "</span></button>";
      }).join("") || '<p class="be-vazio">Nada encontrado.</p>';
    }
    function abrir(sim) {
      if (!sim && bibliotecaEquip.contains(document.activeElement)) document.activeElement.blur();
      bibliotecaEquip.hidden = !sim;
      botao.setAttribute("aria-pressed", String(sim));
      botao.setAttribute("aria-expanded", String(sim));
      if (sim) {
        busca.value = ""; montar();
        if (window.innerWidth > 760) posicionarAoLado(bibliotecaEquip, caixaFerramentas, elCanvas.getBoundingClientRect());
        busca.focus();
      }
    }
    botao.addEventListener("click", function (event) { event.stopPropagation(); abrir(bibliotecaEquip.hidden); });
    busca.addEventListener("input", montar);
    busca.addEventListener("keydown", function (event) {
      if (event.key === "Escape") abrir(false);
      if (event.key === "Enter") { var primeiro = grade.querySelector(".be-item"); if (primeiro) primeiro.click(); }
    });
    grade.addEventListener("click", function (event) {
      var item = event.target.closest(".be-item");
      if (!item) return;
      if (!elCanvas.querySelector("svg g.graph") && estado.equipamentos.length) return;
      adicionarEquipamentoEm(item.getAttribute("data-tipo"), item.getAttribute("data-icone"), estado.equipamentos.length ? pontoParaNovo() : null);
    });
    grade.addEventListener("dragstart", function (event) {
      var item = event.target.closest(".be-item");
      if (!item) return;
      event.dataTransfer.setData("application/x-grafo-equip", JSON.stringify({ tipo: item.getAttribute("data-tipo"), icone: item.getAttribute("data-icone") }));
      event.dataTransfer.setData("text/plain", item.getAttribute("data-tipo"));
      event.dataTransfer.effectAllowed = "copy";
    });
    elCanvas.addEventListener("dragover", function (event) {
      if (Array.prototype.indexOf.call(event.dataTransfer.types || [], "application/x-grafo-equip") < 0) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      elCanvas.classList.add("recebendo-equip");
    });
    elCanvas.addEventListener("dragleave", function () { elCanvas.classList.remove("recebendo-equip"); });
    elCanvas.addEventListener("drop", function (event) {
      var bruto = event.dataTransfer.getData("application/x-grafo-equip");
      elCanvas.classList.remove("recebendo-equip");
      if (!bruto) return;
      event.preventDefault();
      var dado = JSON.parse(bruto);
      adicionarEquipamentoEm(dado.tipo, dado.icone, pontoNoDesenho(event));
    });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !bibliotecaEquip.hidden) abrir(false); });
    document.addEventListener("pointerdown", function (event) {
      if (!bibliotecaEquip.hidden && !bibliotecaEquip.contains(event.target) && event.target !== botao && !botao.contains(event.target)) abrir(false);
    });
  }

  // ---- Ligar dois equipamentos com o mouse (como no draw.io) ---------------------
  // Passar o mouse num equipamento mostra 4 bolinhas; arrastar de uma até outro
  // equipamento cria o cabo e abre o editor para preencher as portas.
  var ligacao = { no: null, timer: 0 };

  function caixaNoDesenho(elemento) {
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    var m = grafo && grafo.getScreenCTM();
    if (!m) return null;
    var inv = m.inverse(), r = elemento.getBoundingClientRect(), pts = [[r.left, r.top], [r.right, r.bottom]].map(function (c) {
      var q = svg.createSVGPoint(); q.x = c[0]; q.y = c[1]; return q.matrixTransform(inv);
    });
    return { x: pts[0].x, y: pts[0].y, x2: pts[1].x, y2: pts[1].y };
  }

  function esconderBolinhas() {
    var g = elCanvas.querySelector("g.ligar-alcas");
    if (g) g.remove();
    ligacao.no = null;
  }

  function mostrarBolinhas(no) {
    if (ferramentaAtual !== "selecionar" || arrastandoEquipamento || document.body.classList.contains("arrastando-desenho")) return;
    if (ligacao.no === no) return;
    esconderBolinhas();
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    var c = caixaNoDesenho(no);
    if (!grafo || !c) return;
    ligacao.no = no;
    var g = el("g", { "class": "ligar-alcas" }, grafo);
    var cx = (c.x + c.x2) / 2, cy = (c.y + c.y2) / 2, folga = 12;
    [[cx, c.y - folga], [c.x2 + folga, cy], [cx, c.y2 + folga], [c.x - folga, cy]].forEach(function (p) {
      var b = el("g", { "class": "ligar-bolinha", transform: "translate(" + arred(p[0]) + "," + arred(p[1]) + ")" }, g);
      el("circle", { r: 7 }, b);
      el("path", { d: "M-3.5 0H3.5M0 -3.5V3.5" }, b);
      b.addEventListener("pointerdown", function (event) { iniciarLigacao(event, no, { x: p[0], y: p[1] }); });
    });
    g.addEventListener("pointerenter", function () { clearTimeout(ligacao.timer); });
    g.addEventListener("pointerleave", function () { agendarEsconder(); });
  }

  function agendarEsconder() {
    clearTimeout(ligacao.timer);
    ligacao.timer = setTimeout(esconderBolinhas, 350);
  }

  function iniciarLigacao(event, noOrigem, inicio) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    clearTimeout(ligacao.timer);
    var origem = idEquipamentoDoNode(noOrigem);
    var svg = elCanvas.querySelector("svg"), grafo = svg.querySelector("g.graph");
    var linha = el("path", { "class": "ligar-linha", d: "" }, grafo);
    var alvo = null;
    function marcarAlvo(no) {
      if (alvo === no) return;
      if (alvo) alvo.classList.remove("ligar-alvo");
      alvo = no;
      if (alvo) alvo.classList.add("ligar-alvo");
    }
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      var meioX = arred((inicio.x + p.x) / 2);
      linha.setAttribute("d", "M" + arred(inicio.x) + "," + arred(inicio.y) + " H" + meioX + " V" + p.y + " H" + p.x);
      var sob = document.elementFromPoint(e.clientX, e.clientY);
      var no = sob && sob.closest && sob.closest("#canvas g.node");
      marcarAlvo(no && no !== noOrigem ? no : null);
    }, function () {
      linha.remove();
      var destino = alvo && idEquipamentoDoNode(alvo);
      marcarAlvo(null);
      esconderBolinhas();
      if (!destino || destino === origem) return;
      var limite = limiteAtingido("cabo");
      if (limite) { avisar(limite); return; }
      var v = Esquema.validarConexao({ de: origem, para: destino, tipo: "", saida: "", chegada: "", potencia: "1G", cor: corParaNovoCabo({ de: origem, para: destino, tipo: "" }), grossura: 2, estilo: "solid" },
        estado.equipamentos.map(function (eq) { return eq.id; }));
      if (!v.ok) { avisar(textoDosErros(v.erros)); return; }
      estado.conexoes.push(v.dados);
      renderTudo();
      // Já abre o editor do cabo novo para preencher portas, tipo e VLAN.
      abrirEditorCabo(v.dados);
    });
  }

  function ativarLigacaoPeloMouse() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    ligacao.no = null;
    svg.querySelectorAll("g.node").forEach(function (no) {
      if (!idEquipamentoDoNode(no)) return;
      no.addEventListener("pointerenter", function () { clearTimeout(ligacao.timer); mostrarBolinhas(no); });
      no.addEventListener("pointerleave", agendarEsconder);
      no.addEventListener("pointerdown", function () { esconderBolinhas(); });
    });
  }

  // ---- Link entre diagramas ---------------------------------------------------------
  // Equipamento com "Abre o diagrama" ganha um selo ↗; clicar abre o outro
  // diagrama, e aparece "← Voltar para ..." para voltar.
  var voltarPara = null;

  function abrirDiagramaLigado(nome) {
    if (!projetos[nome]) { avisar("O diagrama “" + nome + "” não existe mais."); return; }
    voltarPara = projetoAtual;
    var sel = document.getElementById("projetoSelect");
    sel.value = nome;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    mostrarVoltar();
  }

  function mostrarVoltar() {
    var chip = document.getElementById("voltarDiagrama");
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button";
      chip.id = "voltarDiagrama";
      chip.className = "voltar-diagrama";
      elCanvas.parentNode.appendChild(chip);
      chip.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      chip.addEventListener("click", function () {
        var destino = voltarPara;
        chip.hidden = true;
        voltarPara = null;
        if (destino && projetos[destino]) {
          var sel = document.getElementById("projetoSelect");
          sel.value = destino;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }
    chip.textContent = "← Voltar para " + voltarPara;
    chip.hidden = !voltarPara;
    posicionarFerramentas();
  }

  function desenharLinksDeDiagrama() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var chip = document.getElementById("voltarDiagrama");
    if (chip && voltarPara && (voltarPara === projetoAtual || !projetos[voltarPara])) { chip.hidden = true; voltarPara = null; }
    svg.querySelectorAll("g.selo-diagrama").forEach(function (g) { g.remove(); });
    estado.equipamentos.forEach(function (eq) {
      if (!eq.diagrama) return;
      var no = obterNodePorId(svg, eq.id);
      if (!no) return;
      var b;
      try { b = no.getBBox(); } catch (e) { return; }
      var g = el("g", { "class": "selo-diagrama", tabindex: "0", role: "link", "aria-label": "Abrir o diagrama " + eq.diagrama }, no);
      var x = b.x + b.width - 4, y = b.y + 4;
      var titulo = el("title", {}, g); titulo.textContent = "Abrir o diagrama “" + eq.diagrama + "”";
      el("rect", { x: arred(x - 22), y: arred(y - 2), width: 24, height: 18, rx: 5 }, g);
      var t = el("text", { x: arred(x - 10), y: arred(y + 11.5), "text-anchor": "middle" }, g);
      t.textContent = "↗";
      g.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      g.addEventListener("click", function (event) { event.stopPropagation(); abrirDiagramaLigado(eq.diagrama); });
      g.addEventListener("dblclick", function (event) { event.stopPropagation(); });
      g.addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); abrirDiagramaLigado(eq.diagrama); } });
    });
  }

  // ---- Camadas: mostrar ou esconder partes do desenho ----------------------------
  // Vale na tela e na exportação (o estilo vai junto no SVG copiado). Fica guardado
  // neste navegador, por diagrama.
  var CAMADAS = [
    ["vlan", "Etiquetas de VLAN", "g.cabo-etiqueta"],
    ["numeros", "Números nas pontas", "text.cabo-num"],
    ["rotulos", "Nome dos cabos", "g.edge > text:not(.cabo-extra), g.edge > g > text:not(.cabo-extra)"],
    ["desenhos", "Desenhos e formas", "g.camada-desenhos"],
    ["notas", "Notas", "g.anotacao"],
    ["grupos", "Caixas dos grupos", "g.cluster"],
    ["mapa", "Mapa (municípios e imagem)", null],
    ["cidades", "Nome das cidades", null],
    ["legenda", "Legenda dos cabos", "g.legenda-cabos"],
    ["tipos", "Legenda dos tipos (embaixo)", null],
    ["cores", "Cor diferente em cada cabo", null]
  ];
  function chaveCamadas() { return "grafo-camadas:" + projetoAtual; }
  function camadasOcultas() {
    try { return JSON.parse(localStorage.getItem(chaveCamadas()) || "{}") || {}; } catch (e) { return {}; }
  }
  function aplicarCamadas() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var ocultas = camadasOcultas();
    CAMADAS.forEach(function (c) {
      if (!c[2]) return;
      svg.querySelectorAll(c[2]).forEach(function (e) {
        // Só mostra de volta o que a própria camada escondeu (a LAG esconde rótulos repetidos).
        if (ocultas[c[0]]) { if (e.style.display !== "none") { e.style.display = "none"; e.setAttribute("data-camada-oculta", ""); } }
        else if (e.hasAttribute("data-camada-oculta")) { e.style.display = ""; e.removeAttribute("data-camada-oculta"); }
      });
    });
    // Legenda dos tipos, embaixo do quadro (fora do desenho).
    elLegenda.hidden = !!ocultas.tipos;
    var botao = document.getElementById("btnCamadas");
    if (botao) botao.classList.toggle("com-ocultas", Object.keys(ocultas).some(function (k) { return ocultas[k]; }));
  }
  // Esconde uma camada pelo "×" da própria legenda (volta em Camadas).
  function ocultarCamada(k) {
    var ocultas = camadasOcultas();
    ocultas[k] = true;
    try { localStorage.setItem(chaveCamadas(), JSON.stringify(ocultas)); } catch (e) {}
    if (k === "legenda") gerar(); else aplicarCamadas();
    avisar("Legenda removida. Para mostrar de novo: Camadas.");
  }

  function criarMenuDeCamadas() {
    if (!caixaFerramentas || document.getElementById("btnCamadas")) return;
    var sep = document.createElement("span"); sep.className = "ferramentas-sep";
    var botao = document.createElement("button");
    botao.type = "button"; botao.id = "btnCamadas"; botao.className = "ferramenta-desenho";
    botao.title = "Camadas: mostrar ou esconder VLANs, números, desenhos, notas…";
    botao.setAttribute("aria-label", botao.title);
    botao.setAttribute("aria-expanded", "false");
    botao.innerHTML = svgIcone('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>');
    caixaFerramentas.appendChild(sep);
    caixaFerramentas.appendChild(botao);
    var ajudaBtn = document.createElement("button");
    ajudaBtn.type = "button"; ajudaBtn.id = "btnComoFazer"; ajudaBtn.className = "ferramenta-desenho";
    ajudaBtn.title = "Como fazer: passo a passo das ferramentas";
    ajudaBtn.setAttribute("aria-label", ajudaBtn.title);
    ajudaBtn.innerHTML = svgIcone('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.5h.01"/>');
    caixaFerramentas.appendChild(ajudaBtn);
    ajudaBtn.addEventListener("click", function () { if (window.GrafoAjuda) window.GrafoAjuda.abrir(); });
    var menu = document.createElement("div");
    menu.id = "menuCamadas"; menu.className = "menu-camadas painel-flutuante"; menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    function montar() {
      var ocultas = camadasOcultas();
      menu.innerHTML = '<strong>Mostrar no diagrama</strong>' + CAMADAS.map(function (c) {
        return '<label><input type="checkbox" data-camada="' + c[0] + '"' + (ocultas[c[0]] ? "" : " checked") + "> " + c[1] + "</label>";
      }).join("") + '<p>Vale também para o PDF, PNG e SVG.</p>';
    }
    function abrir(sim) {
      if (!sim && menu.contains(document.activeElement)) document.activeElement.blur();
      menu.hidden = !sim;
      botao.setAttribute("aria-expanded", String(sim));
      botao.setAttribute("aria-pressed", String(sim));
      if (sim) { montar(); posicionarAoLado(menu, botao); }
    }
    botao.addEventListener("click", function (event) { event.stopPropagation(); abrir(menu.hidden); });
    menu.addEventListener("change", function (event) {
      var k = event.target.getAttribute("data-camada");
      if (!k) return;
      var ocultas = camadasOcultas();
      if (event.target.checked) delete ocultas[k]; else ocultas[k] = true;
      try { localStorage.setItem(chaveCamadas(), JSON.stringify(ocultas)); } catch (e) {}
      if (k === "cores" || k === "legenda" || k === "mapa" || k === "cidades") { gerar(); return; } // muda o desenho: redesenha
      aplicarCamadas();
    });
    document.addEventListener("pointerdown", function (event) { if (!menu.hidden && !menu.contains(event.target) && !botao.contains(event.target)) abrir(false); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !menu.hidden) abrir(false); });
  }

  // Coloca um painel flutuante ao lado do botão, sempre inteiro dentro da tela.
  // limite: retângulo (do quadro) em que o painel deve caber, se houver.
  function posicionarAoLado(painel, botao, limite) {
    var b = botao.getBoundingClientRect();
    painel.style.position = "fixed";
    painel.style.transform = "none";
    var alturaMax = limite ? Math.min(560, limite.height - 16) : window.innerHeight - 24;
    painel.style.maxHeight = Math.max(220, alturaMax) + "px";
    if (limite) b = { top: Math.max(b.top, limite.top + 8), left: b.left, right: b.right };
    var w = painel.offsetWidth, h = painel.offsetHeight;
    var esquerda = b.right + 10;
    if (esquerda + w > window.innerWidth - 12) esquerda = Math.max(12, b.left - w - 10);
    var topo = Math.min(b.top, window.innerHeight - h - 12);
    painel.style.left = Math.round(esquerda) + "px";
    painel.style.top = Math.round(Math.max(12, topo)) + "px";
  }

  // A caixa de ferramentas, a barra de estilo e o "Voltar" ficam presos ao quadro
  // (não por cima da barra de cima nem do seletor de modo).
  function posicionarFerramentas() {
    if (!caixaFerramentas) return;
    var quadro = elCanvas.getBoundingClientRect(), pai = elCanvas.parentNode.getBoundingClientRect();
    if (!quadro.width || window.innerWidth <= 760) {
      caixaFerramentas.style.top = caixaFerramentas.style.left = caixaFerramentas.style.maxHeight = "";
      if (barraEstilo) barraEstilo.style.top = barraEstilo.style.left = barraEstilo.style.bottom = "";
      return;
    }
    var topo = quadro.top - pai.top + 12, esquerda = quadro.left - pai.left + 12;
    caixaFerramentas.style.top = Math.round(topo) + "px";
    caixaFerramentas.style.left = Math.round(esquerda) + "px";
    caixaFerramentas.style.maxHeight = Math.round(quadro.height - 24) + "px";
    if (barraEstilo) {
      barraEstilo.style.left = Math.round(quadro.left - pai.left + quadro.width / 2) + "px";
      barraEstilo.style.top = "auto";
      barraEstilo.style.bottom = Math.round(pai.bottom - quadro.bottom + 12) + "px";
    }
    var voltar = document.getElementById("voltarDiagrama");
    if (voltar) { voltar.style.top = Math.round(topo) + "px"; voltar.style.left = Math.round(esquerda + caixaFerramentas.offsetWidth + 10) + "px"; }
  }

  // ---- Estilo de diagrama de operadora (como o PDF de interligação do core) -------
  // Cor pela categoria da ligação (só em cabo com a cor padrão), rótulo curto num
  // selo ("ae7 · 20G", descrição completa ao passar o mouse) e legenda no desenho.
  var COR_CABO_PADRAO_APP = "#5A7284";
  // Cada ligação ganha uma cor diferente (as portas da mesma LAG ficam com a mesma).
  var PALETA_CABOS = ["#1E6FD9", "#D32F2F", "#1B7F2A", "#8E24AA", "#E08A00", "#00897B", "#C2185B", "#5D4037",
    "#3949AB", "#7CB342", "#F4511E", "#00ACC1", "#6D4C41", "#AD1457", "#546E7A", "#9E9D24"];
  function chaveDaLigacao(c, i) {
    var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(c.tipo || "");
    return m ? [c.de, c.para].sort().join("|") + "|" + m[1].toLowerCase() : "cabo" + i;
  }
  function ehCorPadrao(cor) { return !cor || String(cor).toUpperCase() === COR_CABO_PADRAO_APP; }
  // Cor para um cabo novo: a mesma das outras portas da LAG, ou a da paleta menos usada.
  function corParaNovoCabo(c) {
    if (!ehCorPadrao(c.cor)) return c.cor;
    var chave = chaveDaLigacao(c, -1);
    var irmao = estado.conexoes.find(function (o, i) { return o !== c && !ehCorPadrao(o.cor) && chaveDaLigacao(o, i) === chave; });
    if (irmao) return irmao.cor;
    var uso = {};
    PALETA_CABOS.forEach(function (cor) { uso[cor] = 0; });
    var vistas = {};
    estado.conexoes.forEach(function (o, i) {
      var k = chaveDaLigacao(o, i), cor = String(o.cor || "").toUpperCase();
      if (vistas[k] || !(cor in uso)) return;
      vistas[k] = true;
      uso[cor]++;
    });
    return PALETA_CABOS.slice().sort(function (a, b) { return uso[a] - uso[b] || PALETA_CABOS.indexOf(a) - PALETA_CABOS.indexOf(b); })[0];
  }
  function corAutomaticaLigada() { return !camadasOcultas().cores; }
  // Cabos antigos ainda com a cor padrão: cor da paleta pela ordem das ligações.
  var corDasLigacoes = {};
  function prepararCoresDosCabos(conexoes) {
    corDasLigacoes = {};
    var n = 0;
    conexoes.forEach(function (c, i) {
      var k = chaveDaLigacao(c, i);
      if (corDasLigacoes[k] == null) corDasLigacoes[k] = PALETA_CABOS[n++ % PALETA_CABOS.length];
    });
  }
  function corDoCaboNoDesenho(c, porId, indice) {
    if (estado.mapa && estado.mapa.cabosPretos && ehCorPadrao(c.cor)) return "#111111"; // estilo mapa
    if (!corAutomaticaLigada() || !ehCorPadrao(c.cor)) return c.cor || COR_CABO_PADRAO_APP;
    return corDasLigacoes[chaveDaLigacao(c, indice)] || COR_CABO_PADRAO_APP;
  }

  // "10G" × 2 = "20G"; "40G" × 2 = "80G".
  function somaVelocidade(potencia, vezes) {
    var m = /^(\d+(?:[.,]\d+)?)\s*([MGT])$/i.exec(String(potencia || "").trim());
    if (!m || vezes < 2) return potencia || "";
    var n = parseFloat(m[1].replace(",", ".")) * vezes;
    return String(Math.round(n * 10) / 10).replace(".", ",") + m[2].toUpperCase();
  }
  // Tamanho de cada LAG (mesmos equipamentos e mesmo aeN), para o rótulo somar.
  function contarLags() {
    var n = {};
    estado.conexoes.forEach(function (c) {
      var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(c.tipo || "");
      if (!m) return;
      var k = [c.de, c.para].sort().join("|") + "|" + m[1].toLowerCase();
      n[k] = (n[k] || 0) + 1;
    });
    return n;
  }
  var tamanhoDasLags = {};
  function rotuloCurto(c) {
    var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(c.tipo || "");
    var trafego = (c.trafegoEntrada ? " ↓" + c.trafegoEntrada : "") + (c.trafegoSaida ? " ↑" + c.trafegoSaida : "") +
      (c.distanciaKm != null && c.distanciaKm !== "" ? " · " + String(c.distanciaKm).replace(".", ",") + " km" : "");
    if (m) {
      var k = [c.de, c.para].sort().join("|") + "|" + m[1].toLowerCase();
      return m[1] + " · " + somaVelocidade(c.potencia, tamanhoDasLags[k] || 1) + trafego;
    }
    return (c.potencia || (c.tipo ? String(c.tipo).slice(0, 18) : "")) + trafego;
  }
  // Legenda automática no desenho (sai no PNG/SVG/PDF): uma linha por ligação
  // (a LAG conta uma vez), com a cor do cabo, as pontas e o selo curto.
  var LEGENDA_MAX = 30;
  function desenharLegendaCabos() {
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var antiga = grafo.querySelector("g.legenda-cabos");
    if (antiga) antiga.remove();
    if (!estado.conexoes.length || camadasOcultas().legenda) return; // removida: nem ocupa espaço
    var nomePorId = {};
    estado.equipamentos.forEach(function (eq) { nomePorId[eq.id] = eq.nome || eq.id; });
    tamanhoDasLags = contarLags();
    var vistas = {}, itens = [];
    estado.conexoes.forEach(function (c, i) {
      var k = chaveDaLigacao(c, i);
      if (vistas[k]) return;
      vistas[k] = true;
      itens.push({ cor: corValida(corDoCaboNoDesenho(c, null, i), "#5A7284"), nome: (nomePorId[c.de] || c.de) + " ↔ " + (nomePorId[c.para] || c.para), selo: rotuloCurto(c), estilo: c.estilo });
    });
    var sobra = itens.length - LEGENDA_MAX;
    if (sobra > 0) itens = itens.slice(0, LEGENDA_MAX);
    var maxX = -Infinity, minY = Infinity;
    grafo.querySelectorAll("g.node, g.cluster").forEach(function (n) {
      try { var bb = n.getBBox(), t = translateDoElemento(n); maxX = Math.max(maxX, bb.x + t.x + bb.width); minY = Math.min(minY, bb.y + t.y); } catch (e) {}
    });
    if (!isFinite(maxX)) return;
    var maiorTexto = itens.reduce(function (m, it) { return Math.max(m, it.nome.length * 5.6 + (it.selo ? it.selo.length * 5.2 + 14 : 0)); }, 60);
    var linha = 18, largura = Math.min(520, Math.max(200, 58 + maiorTexto)), altura = 34 + itens.length * linha + (sobra > 0 ? linha : 0);
    var x = maxX + 60, y = minY;
    var g = el("g", { "class": "legenda-cabos" }, grafo);
    el("rect", { x: x, y: y, width: largura, height: altura, rx: 10, fill: "#FFFFFF", stroke: "#D3DCE3", "stroke-width": 1 }, g);
    var titulo = el("text", { x: x + 14, y: y + 20, "font-family": "Helvetica, Arial, sans-serif", "font-size": 10, "font-weight": 700, "letter-spacing": "0.08em", fill: "#14212B" }, g);
    var fechar = el("g", { "class": "legenda-fechar", transform: "translate(" + (x + largura - 22) + "," + (y + 8) + ")" }, g);
    el("title", null, fechar).textContent = "Remover a legenda (volta em Camadas)";
    el("rect", { width: 16, height: 16, rx: 5, fill: "#EEF2F5" }, fechar);
    el("path", { d: "M5 5l6 6M11 5l-6 6", stroke: "#4B5F6E", "stroke-width": 1.6, "stroke-linecap": "round" }, fechar);
    fechar.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    fechar.addEventListener("click", function (ev) { ev.stopPropagation(); ocultarCamada("legenda"); });
    titulo.textContent = "LEGENDA · " + (itens.length + Math.max(0, sobra)) + (itens.length + Math.max(0, sobra) === 1 ? " LIGAÇÃO" : " LIGAÇÕES");
    itens.forEach(function (it, i) {
      var yy = y + 40 + i * linha;
      el("line", { x1: x + 14, y1: yy - 3.5, x2: x + 40, y2: yy - 3.5, stroke: it.cor, "stroke-width": 3.5, "stroke-linecap": "round", "stroke-dasharray": it.estilo === "dashed" ? "5 4" : it.estilo === "dotted" ? "1 4" : null }, g);
      var t = el("text", { x: x + 50, y: yy, "font-family": "Helvetica, Arial, sans-serif", "font-size": 10, fill: "#14212B" }, g);
      t.textContent = it.nome;
      if (it.selo) {
        var s2 = el("tspan", { dx: 8, fill: "#5B6F7E", "font-family": "Menlo, Consolas, monospace", "font-size": 9 }, t);
        s2.textContent = it.selo;
      }
    });
    if (sobra > 0) {
      var mais = el("text", { x: x + 50, y: y + 40 + itens.length * linha, "font-family": "Helvetica, Arial, sans-serif", "font-size": 9.5, "font-style": "italic", fill: "#5B6F7E" }, g);
      mais.textContent = "+ " + sobra + " ligações (veja a lista de cabos)";
    }
  }

  // Troca o texto do Graphviz pelo rótulo curto; o texto completo vira dica.
  function prepararRotuloCurto(aresta, c) {
    var texto = aresta.querySelector("text");
    if (!texto) return;
    var completo = [c.tipo, c.potencia].filter(Boolean).join(" · ");
    texto.textContent = rotuloCurto(c) || completo;
    var dica = aresta.querySelector("title.dica-completa") || document.createElementNS(NS_SVG, "title");
    dica.setAttribute("class", "dica-completa");
    dica.textContent = completo + (c.saida || c.chegada ? "\n" + (c.saida || "?") + " → " + (c.chegada || "?") : "");
    aresta.insertBefore(dica, aresta.firstChild);
  }
  // Selo arredondado atrás do rótulo, com a borda na cor do cabo e o ponto de status.
  function desenharSeloDoRotulo(aresta) {
    aresta.querySelectorAll(".selo-cabo").forEach(function (e) { e.remove(); });
    var texto = aresta.querySelector("text");
    if (!texto || texto.style.display === "none" || !texto.textContent.trim()) return;
    var b;
    try { b = texto.getBBox(); } catch (e) { return; }
    if (!b.width) return;
    var caminho = aresta.querySelector("path");
    var cor = (caminho && caminho.getAttribute("stroke")) || COR_CABO_PADRAO_APP;
    var g = el("g", { "class": "selo-cabo" });
    el("rect", { x: arred(b.x - 16), y: arred(b.y - 3), width: arred(b.width + 22), height: arred(b.height + 6), rx: arred((b.height + 6) / 2), fill: "#FFFFFF", stroke: cor, "stroke-width": 1.2 }, g);
    el("circle", { cx: arred(b.x - 8), cy: arred(b.y + b.height / 2), r: 2.6, fill: "#22A447" }, g);
    aresta.insertBefore(g, texto);
    texto.setAttribute("fill", "#14212B");
    texto.setAttribute("font-weight", "700");
  }

  // Monta a interface quando o editor carrega.
  criarCaixaDeFerramentas();
  criarBibliotecaDeEquipamentos();
  criarMenuDeCamadas();
  posicionarFerramentas();
  window.addEventListener("resize", posicionarFerramentas);
  if (window.ResizeObserver) new ResizeObserver(posicionarFerramentas).observe(elCanvas);
  window.addEventListener("grafo:render", posicionarFerramentas);
  document.body.setAttribute("data-ferramenta-ativa", ferramentaAtual);
