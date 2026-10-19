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

  // Monta a interface quando o editor carrega.
  criarCaixaDeFerramentas();
  document.body.setAttribute("data-ferramenta-ativa", ferramentaAtual);
