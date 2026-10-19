  // ==== 03-cabos-grupos-e-arraste.js: rota dos cabos, caixas dos grupos e arrastar equipamentos/cabos (parte de assets/js/editor/app.js; npm run montar) ====
  // ---- Cabos ----------------------------------------------------------------
  var CONFIG_ROTEAMENTO_CABOS = {
    espaco: 12,     // distância mínima entre trilhas paralelas
    saida: 18,      // trecho reto saindo da porta antes da primeira curva
    raioCurva: 10
  };
  var roteamentoCabosFrame = null;
  var arrastandoEquipamento = false;

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

  // Trecho reto (horizontal ou vertical) passando por dentro do retângulo.
  function segmentoAtravessaRetangulo(seg, r) {
    if (seg.horizontal) {
      return seg.y1 > r.y1 && seg.y1 < r.y2 && Math.max(seg.x1, seg.x2) > r.x1 && Math.min(seg.x1, seg.x2) < r.x2;
    }
    return seg.x1 > r.x1 && seg.x1 < r.x2 && Math.max(seg.y1, seg.y2) > r.y1 && Math.min(seg.y1, seg.y2) < r.y2;
  }

  // Custo de uma rota contra os cabos já desenhados: cabo colado/por cima de
  // outro é o pior caso, cruzamento vem logo depois. Obstáculos (equipamentos
  // e caixas de outros grupos, de rotearCabosOrtogonalmente): passar por cima
  // de um equipamento é pior que tudo; atravessar um grupo alheio, quase.
  function custoDaRota(pontos, existentes, obstaculos) {
    var espaco = CONFIG_ROTEAMENTO_CABOS.espaco;
    var custo = 0;
    var segmentos = segmentosDaRota(pontos);
    (obstaculos || []).forEach(function (r) {
      segmentos.forEach(function (seg) { if (segmentoAtravessaRetangulo(seg, r)) custo += r.custo; });
    });
    segmentos.forEach(function (a) {
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
  function melhorVariante(construir, preferido, existentes, obstaculos, limite1, limite2) {
    var espaco = CONFIG_ROTEAMENTO_CABOS.espaco;
    var temLimite = limite1 != null && limite2 != null;
    var limMin = temLimite ? Math.min(limite1, limite2) : -Infinity;
    var limMax = temLimite ? Math.max(limite1, limite2) : Infinity;
    var melhor = null, melhorCusto = Infinity;
    // Arrastando: roteia a cada quadro, então testa menos trilhas (±12 em vez
    // de ±40). Ao soltar, gerar() refaz tudo com a busca completa.
    var tentativas = arrastandoEquipamento ? 25 : 81;
    for (var i = 0; i < tentativas; i++) {
      var v = preferido + Math.ceil(i / 2) * espaco * (i % 2 ? 1 : -1);
      if (v < limMin || v > limMax) continue;
      var pontos = construir(v);
      var custo = custoDaRota(pontos, existentes, obstaculos) + Math.abs(v - preferido) * 0.5;
      if (custo < melhorCusto) { melhor = pontos; melhorCusto = custo; }
      if (melhorCusto < 1) break;
    }
    return melhor || construir(temLimite ? (limMin + limMax) / 2 : preferido);
  }

  // Pontos de um cabo ortogonal de s até e (cada um com a direção de saída da porta).
  function tracarRota(s, e, existentes, obstaculos) {
    var saida = CONFIG_ROTEAMENTO_CABOS.saida;
    var a = { x: s.x + s.dx * saida, y: s.y + s.dy * saida };
    var b = { x: e.x + e.dx * saida, y: e.y + e.dy * saida };
    var horizS = s.dx !== 0, horizE = e.dx !== 0;

    function trechoVertical(x) { return [s, { x: x, y: s.y }, { x: x, y: e.y }, e]; }
    function trechoHorizontal(y) { return [s, { x: s.x, y: y }, { x: e.x, y: y }, e]; }
    // Contornos com um trecho a mais: sai da porta, desce/sobe (ou vai para o
    // lado) até uma trilha livre, atravessa e entra na outra porta.
    function contornoHorizontal(y) { return [s, a, { x: a.x, y: y }, { x: b.x, y: y }, b, e]; }
    function contornoVertical(x) { return [s, a, { x: x, y: a.y }, { x: x, y: b.y }, b, e]; }

    // Fica com a rota mais barata entre as candidatas (a primeira ganha empates).
    function maisBarata() {
      var melhor = null, melhorCusto = Infinity;
      Array.prototype.forEach.call(arguments, function (pts) {
        var c = custoDaRota(pts, existentes, obstaculos) + pts.length;
        if (c < melhorCusto) { melhor = pts; melhorCusto = c; }
      });
      return melhor;
    }

    if (horizS && horizE) {
      if (s.dx === -e.dx && (b.x - a.x) * s.dx >= 0) {
        // "Z": portas uma de frente para a outra, trecho vertical no meio.
        // Se o Z bater num equipamento/grupo, tenta contornar por cima ou por baixo.
        return maisBarata(
          melhorVariante(trechoVertical, (a.x + b.x) / 2, existentes, obstaculos, a.x, b.x),
          melhorVariante(contornoHorizontal, (s.y + e.y) / 2, existentes, obstaculos)
        );
      }
      if (s.dx === e.dx) {
        // "U": as duas portas do mesmo lado; contorna por fora.
        return melhorVariante(trechoVertical, s.dx > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x), existentes, obstaculos);
      }
      // Portas de costas uma para a outra: sai, cruza pelo meio na horizontal e volta.
      return melhorVariante(contornoHorizontal, (s.y + e.y) / 2, existentes, obstaculos);
    }

    if (!horizS && !horizE) {
      if (s.dy === -e.dy && (b.y - a.y) * s.dy >= 0) {
        return maisBarata(
          melhorVariante(trechoHorizontal, (a.y + b.y) / 2, existentes, obstaculos, a.y, b.y),
          melhorVariante(contornoVertical, (s.x + e.x) / 2, existentes, obstaculos)
        );
      }
      if (s.dy === e.dy) {
        return melhorVariante(trechoHorizontal, s.dy > 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y), existentes, obstaculos);
      }
      return melhorVariante(contornoVertical, (s.x + e.x) / 2, existentes, obstaculos);
    }

    // Uma porta na lateral e a outra em cima/embaixo: um "L" quando dá.
    if (horizS) {
      if ((e.x - s.x) * s.dx > 0 && (s.y - e.y) * e.dy > 0) return maisBarata([s, { x: e.x, y: s.y }, e], [s, a, { x: a.x, y: b.y }, b, e]);
      return [s, a, { x: a.x, y: b.y }, b, e];
    }
    if ((e.y - s.y) * s.dy > 0 && (s.x - e.x) * e.dx > 0) return maisBarata([s, { x: s.x, y: e.y }, e], [s, a, { x: b.x, y: a.y }, b, e]);
    return [s, a, { x: b.x, y: a.y }, b, e];
  }

  // Retângulos que os cabos devem evitar: todos os equipamentos e as caixas
  // dos grupos. Cada rota ignora os próprios equipamentos e os grupos deles
  // (o cabo precisa sair/entrar ali).
  var FOLGA_OBSTACULO = 6;
  var FOLGA_GRUPO = 16;
  function coletarObstaculos(svg) {
    var lista = [];
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      var b, t = translateDoElemento(node);
      try { b = medir(node); } catch (e) { return; }
      if (!id || !b || !b.width) return;
      lista.push({ equipamento: id, custo: 5000,
        x1: b.x + t.x - FOLGA_OBSTACULO, y1: b.y + t.y - FOLGA_OBSTACULO,
        x2: b.x + t.x + b.width + FOLGA_OBSTACULO, y2: b.y + t.y + b.height + FOLGA_OBSTACULO });
    });
    nomesDosGrupos(estado).forEach(function (nome, indice) {
      var forma = svg.querySelector('g.cluster[id="grupo_' + indice + '"] path, g.cluster[id="grupo_' + indice + '"] polygon');
      var b;
      try { b = caixaDoGrupo(forma); } catch (e) { b = null; }
      if (!b || !b.width) return;
      // Folga maior que a dos equipamentos: o cabo não corre colado na borda
      // e o rótulo dele (5 px acima do trecho) não cai dentro da caixa.
      lista.push({ grupo: nome, custo: 1500,
        x1: b.x - FOLGA_GRUPO, y1: b.y - FOLGA_GRUPO, x2: b.x + b.width + FOLGA_GRUPO, y2: b.y + b.height + FOLGA_GRUPO });
    });
    return lista;
  }

  // Só os obstáculos ao alcance das variantes de rota (melhorVariante testa
  // até ~480 px para cada lado); o resto nem entra na conta.
  var ALCANCE_DESVIO = 520;
  function obstaculosDoCabo(todos, conexao, s, e) {
    var ids = [conexao.de, conexao.para];
    var grupos = estado.equipamentos.filter(function (eq) { return ids.indexOf(eq.id) >= 0; })
      .map(function (eq) { return String(eq.grupo || "").trim(); }).filter(Boolean);
    var x1 = Math.min(s.x, e.x) - ALCANCE_DESVIO, x2 = Math.max(s.x, e.x) + ALCANCE_DESVIO;
    var y1 = Math.min(s.y, e.y) - ALCANCE_DESVIO, y2 = Math.max(s.y, e.y) + ALCANCE_DESVIO;
    return todos.filter(function (o) {
      if (o.x2 < x1 || o.x1 > x2 || o.y2 < y1 || o.y1 > y2) return false;
      if (o.equipamento) return ids.indexOf(o.equipamento) < 0;
      return grupos.indexOf(o.grupo) < 0;
    });
  }

  // Rótulo do cabo no meio do trecho mais longo (acima, se horizontal; ao lado, se
  // vertical). Com "ocupados" (caixas dos rótulos já postos), se ficar em cima de
  // outro, tenta outros pontos do trecho e os outros trechos; a caixa escolhida
  // entra em "ocupados".
  function posicionarRotuloDaAresta(aresta, pontos, ocupados) {
    var texto = aresta.querySelector("text");
    if (!texto) return;
    var trechos = [];
    for (var i = 1; i < pontos.length; i++) {
      var comp = Math.abs(pontos[i].x - pontos[i - 1].x) + Math.abs(pontos[i].y - pontos[i - 1].y);
      if (comp > 0) trechos.push({ a: pontos[i - 1], b: pontos[i], comp: comp });
    }
    if (!trechos.length) return;
    trechos.sort(function (p, q) { return q.comp - p.comp; });
    texto.removeAttribute("transform");
    function colocar(trecho, t) {
      var horizontal = Math.abs(trecho.a.y - trecho.b.y) < 0.5;
      if (horizontal) {
        texto.setAttribute("x", (trecho.a.x + (trecho.b.x - trecho.a.x) * t).toFixed(2));
        texto.setAttribute("y", (trecho.a.y - 5).toFixed(2));
        texto.setAttribute("text-anchor", "middle");
      } else {
        texto.setAttribute("x", (trecho.a.x + 5).toFixed(2));
        texto.setAttribute("y", (trecho.a.y + (trecho.b.y - trecho.a.y) * t + 3).toFixed(2));
        texto.setAttribute("text-anchor", "start");
      }
    }
    colocar(trechos[0], 0.5);
    if (!ocupados || !texto.textContent.trim()) return;
    function caixa() {
      try { var b = texto.getBBox(); return { x1: b.x - 2, y1: b.y - 1, x2: b.x + b.width + 2, y2: b.y + b.height + 1 }; } catch (e) { return null; }
    }
    function livre(c) {
      return c && !ocupados.some(function (o) { return c.x1 < o.x2 && c.x2 > o.x1 && c.y1 < o.y2 && c.y2 > o.y1; });
    }
    var primeira = caixa();
    if (!primeira) return;
    if (livre(primeira)) { ocupados.push(primeira); return; }
    var fracoes = [0.3, 0.7, 0.15, 0.85, 0.5];
    for (var k = 0; k < Math.min(trechos.length, 3); k++) {
      if (trechos[k].comp < 40) continue;
      for (var f = 0; f < fracoes.length; f++) {
        colocar(trechos[k], fracoes[f]);
        var c = caixa();
        if (livre(c)) { ocupados.push(c); return; }
      }
    }
    // Nenhum lugar livre: fica no meio do trecho mais longo.
    colocar(trechos[0], 0.5);
    ocupados.push(primeira);
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
      rotas.push({ aresta: aresta, path: path, s: s, e: e, conexao: conexao });
    });
    var obstaculos = coletarObstaculos(svg);
    // Cabos curtos primeiro ficam com a trilha ideal; os longos desviam deles.
    function comprimento(r) { return Math.abs(r.s.x - r.e.x) + Math.abs(r.s.y - r.e.y); }
    rotas.sort(function (a, b) { return comprimento(a) - comprimento(b); });
    var existentes = [], rotulos = [];
    rotasDesenhadas = {};
    rotas.forEach(function (rota) {
      // Rota feita à mão (10-desenho-e-ferramentas.js) passa pelas dobras escolhidas.
      var manual = Array.isArray(rota.conexao.rota) && rota.conexao.rota.length;
      var pts = manual ? rotaManualDoCabo(rota.s, rota.e, rota.conexao.rota)
        : tracarRota(rota.s, rota.e, existentes, obstaculosDoCabo(obstaculos, rota.conexao, rota.s, rota.e));
      existentes.push.apply(existentes, segmentosDaRota(pts));
      rota.path.setAttribute("d", caminhoOrtogonalArredondado(pts));
      posicionarRotuloDaAresta(rota.aresta, pts, rotulos);
      rotasDesenhadas[estado.conexoes.indexOf(rota.conexao)] = pts;
      desenharExtrasDoCabo(rota.aresta, pts, rota.conexao);
    });
  }

  function solicitarRoteamentoCabos() {
    if (roteamentoCabosFrame) cancelAnimationFrame(roteamentoCabosFrame);
    roteamentoCabosFrame = requestAnimationFrame(function () {
      roteamentoCabosFrame = null;
      ajustarCaixasDosGrupos();
      rotearCabosOrtogonalmente();
    });
  }

  // Nomes dos grupos na mesma ordem que gerarDot numera os clusters (grupo_N).
  function nomesDosGrupos(dados) {
    var grupos = {};
    dados.equipamentos.forEach(function (eq) { var g = String(eq.grupo || "").trim(); if (g) grupos[g] = true; });
    return Object.keys(grupos);
  }

  // O Graphviz desenha a caixa de cada grupo onde ELE posicionou os equipamentos,
  // mas eles ficam na posição salva (arrastada/organizada). Redesenha cada caixa
  // em volta dos membros, com o rótulo no topo, na mesma distância de antes.
  function ajustarCaixasDosGrupos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var nomes = nomesDosGrupos(estado);
    var nosPorId = {};
    svg.querySelectorAll("g.node").forEach(function (node) { var id = idEquipamentoDoNode(node); if (id) nosPorId[id] = node; });
    nomes.forEach(function (nome, indice) {
      var caixa = svg.querySelector('g.cluster[id="grupo_' + indice + '"]');
      var forma = caixa && caixa.querySelector("path, polygon");
      if (!forma) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      estado.equipamentos.forEach(function (eq) {
        var node = String(eq.grupo || "").trim() === nome && nosPorId[eq.id];
        if (!node) return;
        var b, t = translateDoElemento(node);
        try { b = medir(node); } catch (e) { return; }
        minX = Math.min(minX, b.x + t.x); minY = Math.min(minY, b.y + t.y);
        maxX = Math.max(maxX, b.x + t.x + b.width); maxY = Math.max(maxY, b.y + t.y + b.height);
      });
      if (!Number.isFinite(minX)) return;

      // Espaço do rótulo: guardado na primeira vez, a partir do desenho do Graphviz.
      var rotulo = caixa.querySelector("text");
      if (!caixa.hasAttribute("data-topo-rotulo")) {
        var original = forma.getBBox();
        var br = rotulo ? rotulo.getBBox() : null;
        caixa.setAttribute("data-topo-rotulo", br ? (br.y + br.height - original.y + 6).toFixed(2) : "10");
        caixa.setAttribute("data-base-rotulo", rotulo ? (numeroSvg(rotulo.getAttribute("y")) - original.y).toFixed(2) : "0");
      }
      var MARGEM = 10;
      var topoRotulo = Number(caixa.getAttribute("data-topo-rotulo"));
      var larguraRotulo = rotulo ? medir(rotulo).width + 16 : 0;
      var x = minX - MARGEM, y = minY - topoRotulo, w = maxX - minX + 2 * MARGEM, h = maxY - y + MARGEM;
      if (w < larguraRotulo) { x -= (larguraRotulo - w) / 2; w = larguraRotulo; }
      var r = 6;
      if (forma.tagName.toLowerCase() === "polygon") {
        forma.setAttribute("points", [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(function (p) { return p.join(","); }).join(" "));
      } else {
        forma.setAttribute("d", "M" + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
          "V" + (y + h - r) + "Q" + (x + w) + "," + (y + h) + " " + (x + w - r) + "," + (y + h) +
          "H" + (x + r) + "Q" + x + "," + (y + h) + " " + x + "," + (y + h - r) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "Z");
      }
      forma.__caixa = { x: x, y: y, width: w, height: h }; // lido por caixaDoGrupo (sem medir de novo)
      if (rotulo) {
        rotulo.setAttribute("x", (x + w / 2).toFixed(2));
        rotulo.setAttribute("y", (y + Number(caixa.getAttribute("data-base-rotulo"))).toFixed(2));
      }
    });
  }

  // Caixas de grupos (racks/salas) não podem se sobrepor: quando duas se
  // encostam, o grupo inteiro é empurrado para fora pelo eixo de menor
  // sobreposição. O grupo do equipamento recém-arrastado (fixoId) fica parado.
  // Retorna true se moveu algo (aí as caixas precisam ser redesenhadas).
  var ESPACO_ENTRE_GRUPOS = 24;

  // Para onde empurrar "movel" para sair de cima de "outro": testa as 4 direções
  // e fica com a que menos sobrepõe os demais grupos; empate vai para a menor
  // distância. Só olhar o eixo de menor sobreposição deixava um grupo espremido
  // entre dois vizinhos indo e voltando entre eles.
  function melhorEmpurrao(movel, outro, grupos) {
    var e = ESPACO_ENTRE_GRUPOS;
    var candidatos = [
      { dx: outro.x2 + e - movel.x1, dy: 0 },
      { dx: outro.x1 - e - movel.x2, dy: 0 },
      { dx: 0, dy: outro.y2 + e - movel.y1 },
      { dx: 0, dy: outro.y1 - e - movel.y2 }
    ];
    var melhor = null;
    candidatos.forEach(function (c) {
      var area = 0;
      grupos.forEach(function (g) {
        if (g === movel || g === outro) return;
        var ox = Math.min(movel.x2 + c.dx, g.x2) - Math.max(movel.x1 + c.dx, g.x1) + e;
        var oy = Math.min(movel.y2 + c.dy, g.y2) - Math.max(movel.y1 + c.dy, g.y1) + e;
        if (ox > 0 && oy > 0) area += ox * oy;
      });
      var custo = area * 1000 + Math.abs(c.dx) + Math.abs(c.dy);
      if (!melhor || custo < melhor.custo) melhor = { dx: c.dx, dy: c.dy, custo: custo };
    });
    return melhor;
  }

  function separarGruposSobrepostos(fixoId) {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return false;
    var nosPorId = {};
    svg.querySelectorAll("g.node").forEach(function (node) { var id = idEquipamentoDoNode(node); if (id) nosPorId[id] = node; });
    var grupos = [];
    nomesDosGrupos(estado).forEach(function (nome, indice) {
      var forma = svg.querySelector('g.cluster[id="grupo_' + indice + '"] path, g.cluster[id="grupo_' + indice + '"] polygon');
      var b;
      try { b = caixaDoGrupo(forma); } catch (e) { b = null; }
      if (!b || !b.width) return;
      var membros = estado.equipamentos.filter(function (eq) { return String(eq.grupo || "").trim() === nome && nosPorId[eq.id]; });
      if (!membros.length) return;
      grupos.push({
        x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height, membros: membros,
        fixo: membros.some(function (eq) { return eq.id === fixoId; })
      });
    });
    if (grupos.length < 2) return false;

    function mover(g, dx, dy) {
      g.x1 += dx; g.x2 += dx; g.y1 += dy; g.y2 += dy;
      g.membros.forEach(function (eq) {
        var d = eq.deslocamento || { x: 0, y: 0 };
        eq.deslocamento = {
          x: limitarPosicaoNoCanvas(d.x + dx, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX),
          y: limitarPosicaoNoCanvas(d.y + dy, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY)
        };
        atualizarPosicaoAbsoluta(eq);
        nosPorId[eq.id].setAttribute("transform", "translate(" + eq.deslocamento.x + "," + eq.deslocamento.y + ")");
      });
    }

    var moveu = false;
    for (var passada = 0; passada < 30; passada++) {
      var houveSobreposicao = false;
      for (var i = 0; i < grupos.length; i++) {
        for (var j = i + 1; j < grupos.length; j++) {
          var a = grupos[i], b = grupos[j];
          var sobreX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + ESPACO_ENTRE_GRUPOS;
          var sobreY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + ESPACO_ENTRE_GRUPOS;
          if (sobreX <= 0 || sobreY <= 0) continue;
          houveSobreposicao = true;
          // Move quem não está fixo; se nenhum estiver, o segundo.
          var movel = b.fixo && !a.fixo ? a : b, outro = movel === a ? b : a;
          var passo = melhorEmpurrao(movel, outro, grupos);
          mover(movel, passo.dx, passo.dy);
          moveu = true;
        }
      }
      if (!houveSobreposicao) break;
    }
    return moveu;
  }

  // Caixa do nó no desenho (coordenadas do g.graph), com o translate aplicado.
  function caixaDoNo(node, t) {
    var b;
    try { b = node.getBBox(); } catch (e) { return null; }
    t = t || translateDoElemento(node);
    return { x1: b.x + t.x, y1: b.y + t.y, x2: b.x + t.x + b.width, y2: b.y + t.y + b.height };
  }

  // ---- Guias de alinhamento ------------------------------------------------------
  // Ao arrastar, o nó "gruda" quando a borda ou o centro dele chega perto da
  // borda ou do centro de outro equipamento, e uma linha tracejada mostra o
  // alinhamento. Alt desliga (movimento livre).
  function desenharGuias(svg, guias) {
    var grafo = svg.querySelector("g.graph");
    if (!grafo) return;
    var g = grafo.querySelector("g.guias-alinhamento");
    if (!g) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "guias-alinhamento");
      grafo.appendChild(g);
    }
    var html = guias.map(function (l) {
      return '<line x1="' + l.x1 + '" y1="' + l.y1 + '" x2="' + l.x2 + '" y2="' + l.y2 + '" vector-effect="non-scaling-stroke"/>';
    }).join("");
    if (g.getAttribute("data-html") !== html) { g.innerHTML = html; g.setAttribute("data-html", html); }
  }
  function apagarGuias(svg) {
    var g = svg && svg.querySelector("g.guias-alinhamento");
    if (g) g.remove();
  }

  // Ajusta (dx, dy) para alinhar a caixa "base" com alguma das "outras".
  // limite: distância máxima (unidades do desenho) para grudar.
  function encaixarNasGuias(base, outras, dx, dy, limite) {
    function candidatos(c) { return [c.x1, (c.x1 + c.x2) / 2, c.x2]; }
    function candidatosY(c) { return [c.y1, (c.y1 + c.y2) / 2, c.y2]; }
    var melhorX = null, melhorY = null;
    var movida = { x1: base.x1 + dx, x2: base.x2 + dx, y1: base.y1 + dy, y2: base.y2 + dy };
    outras.forEach(function (o) {
      candidatos(movida).forEach(function (v) {
        candidatos(o).forEach(function (alvo) {
          var d = alvo - v;
          if (Math.abs(d) <= limite && (!melhorX || Math.abs(d) < Math.abs(melhorX.d))) melhorX = { d: d, x: alvo, o: o };
        });
      });
      candidatosY(movida).forEach(function (v) {
        candidatosY(o).forEach(function (alvo) {
          var d = alvo - v;
          if (Math.abs(d) <= limite && (!melhorY || Math.abs(d) < Math.abs(melhorY.d))) melhorY = { d: d, y: alvo, o: o };
        });
      });
    });
    var guias = [];
    if (melhorX) dx += melhorX.d;
    if (melhorY) dy += melhorY.d;
    var final = { x1: base.x1 + dx, x2: base.x2 + dx, y1: base.y1 + dy, y2: base.y2 + dy };
    if (melhorX) guias.push({ x1: melhorX.x, x2: melhorX.x, y1: Math.min(final.y1, melhorX.o.y1) - 12, y2: Math.max(final.y2, melhorX.o.y2) + 12 });
    if (melhorY) guias.push({ y1: melhorY.y, y2: melhorY.y, x1: Math.min(final.x1, melhorY.o.x1) - 12, x2: Math.max(final.x2, melhorY.o.x2) + 12 });
    return { dx: dx, dy: dy, guias: guias };
  }

  function ativarArrasteDosEquipamentos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var viewBox = svg.viewBox && svg.viewBox.baseVal;
    svg.querySelectorAll("g.node").forEach(function (node) {
      var idNode = idEquipamentoDoNode(node);
      var equipamento = idNode && estado.equipamentos.find(function (eq) { return eq.id === idNode; });
      if (!equipamento) return;
      // O miolo do equipamento (tabela do Graphviz) não tem fundo: um clique ali
      // atravessava e virava arraste do diagrama. Um retângulo transparente do
      // tamanho do nó faz o equipamento inteiro responder ao clique.
      if (!node.querySelector("rect.area-clique")) {
        var caixa;
        try { caixa = node.getBBox(); } catch (e) { caixa = null; }
        if (caixa && caixa.width) {
          var area = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          area.setAttribute("class", "area-clique");
          area.setAttribute("x", caixa.x); area.setAttribute("y", caixa.y);
          area.setAttribute("width", caixa.width); area.setAttribute("height", caixa.height);
          area.setAttribute("fill", "transparent");
          node.insertBefore(area, node.firstChild);
        }
      }
      node.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        // Shift/Ctrl + clique: soma ou tira da seleção, sem arrastar. O foco que
        // o clique dá ao nó não pode refazer a seleção (ver o "focus" abaixo).
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          focoPorCliqueComModificador = true;
          setTimeout(function () { focoPorCliqueComModificador = false; }, 0);
          alternarSelecao(idNode);
          return;
        }
        var jaSelecionado = !!selecao[idNode];
        if (!jaSelecionado) definirSelecao([idNode]);
        node.setPointerCapture(event.pointerId);
        // rect já inclui o zoom (transform CSS), então não divide por canvasView.scale de novo.
        var rect = svg.getBoundingClientRect();
        var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
        var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
        var inicioX = event.clientX;
        var inicioY = event.clientY;
        // Todos os selecionados andam juntos. Lido a cada arraste: "Organizar"
        // troca o objeto de posição.
        var grupoArraste = idsSelecionados().map(function (id) {
          var eq = estado.equipamentos.find(function (item) { return item.id === id; });
          var el = obterNodePorId(svg, id);
          if (!eq || !el) return null;
          var d = eq.deslocamento || { x: 0, y: 0 };
          return { eq: eq, node: el, ox: d.x, oy: d.y, x: d.x, y: d.y };
        }).filter(Boolean);
        // Quanto o conjunto pode andar sem ninguém sair da área de desenho.
        var limites = grupoArraste.reduce(function (l, m) {
          return { dxMin: Math.max(l.dxMin, LIMITE_CANVAS.minX - m.ox), dxMax: Math.min(l.dxMax, LIMITE_CANVAS.maxX - m.ox),
            dyMin: Math.max(l.dyMin, LIMITE_CANVAS.minY - m.oy), dyMax: Math.min(l.dyMax, LIMITE_CANVAS.maxY - m.oy) };
        }, { dxMin: -Infinity, dxMax: Infinity, dyMin: -Infinity, dyMax: Infinity });
        // Guias: caixa do nó pego x caixas dos equipamentos que ficam parados.
        var principal = grupoArraste.find(function (m) { return m.eq === equipamento; }) || grupoArraste[0];
        var basePrincipal = caixaDoNo(node, { x: principal.ox, y: principal.oy });
        var parados = [];
        svg.querySelectorAll("g.node").forEach(function (outro) {
          var id = idEquipamentoDoNode(outro);
          if (id && !selecao[id]) { var c = caixaDoNo(outro); if (c) parados.push(c); }
        });
        var moveu = false;
        arrastandoEquipamento = true;
        iniciarCacheDeMedidas(); // formato das peças não muda até soltar
        grupoArraste.forEach(function (m) { m.node.classList.add("arrastando"); });
        elCanvas.classList.add("arrastando-no");
        // Mouses de alta taxa mandam vários movimentos por quadro: a posição é
        // gravada em cada um, mas os nós e os cabos são desenhados uma vez por quadro.
        var quadroMover = 0, guiasAtuais = [];
        function desenharPosicao() {
          quadroMover = 0;
          grupoArraste.forEach(function (m) { m.node.setAttribute("transform", "translate(" + m.x + "," + m.y + ")"); });
          desenharGuias(svg, guiasAtuais);
        }
        function mover(movimento) {
          var dx = (movimento.clientX - inicioX) * escalaX;
          var dy = (movimento.clientY - inicioY) * escalaY;
          if (!moveu && Math.abs(movimento.clientX - inicioX) + Math.abs(movimento.clientY - inicioY) < 3) return;
          moveu = true;
          guiasAtuais = [];
          if (!movimento.altKey && basePrincipal && parados.length) {
            var encaixe = encaixarNasGuias(basePrincipal, parados, dx, dy, 7 * escalaX);
            dx = encaixe.dx; dy = encaixe.dy; guiasAtuais = encaixe.guias;
          }
          // Limita já durante o arraste: o conjunto para na borda da área de
          // desenho em vez de "pular" de volta ao soltar.
          dx = Math.min(limites.dxMax, Math.max(limites.dxMin, dx));
          dy = Math.min(limites.dyMax, Math.max(limites.dyMin, dy));
          grupoArraste.forEach(function (m) { m.x = m.ox + dx; m.y = m.oy + dy; });
          if (!quadroMover) quadroMover = requestAnimationFrame(desenharPosicao); // antes do roteamento, no mesmo quadro
          solicitarRoteamentoCabos();
        }
        function soltar() {
          arrastandoEquipamento = false;
          if (quadroMover) { cancelAnimationFrame(quadroMover); desenharPosicao(); }
          encerrarCacheDeMedidas();
          apagarGuias(svg);
          grupoArraste.forEach(function (m) { m.node.classList.remove("arrastando"); });
          elCanvas.classList.remove("arrastando-no");
          node.removeEventListener("pointermove", mover);
          node.removeEventListener("pointerup", soltar);
          node.removeEventListener("pointercancel", soltar);
          // Clique sem arrastar num equipamento de uma seleção maior: fica só ele.
          if (!moveu) {
            if (jaSelecionado && grupoArraste.length > 1) definirSelecao([idNode]);
            return; // não redesenha (manteria o duplo clique funcionando)
          }
          grupoArraste.forEach(function (m) {
            m.eq.deslocamento = { x: m.x, y: m.y };
            atualizarPosicaoAbsoluta(m.eq);
          });
          // Redesenha para as portas irem para o lado voltado aos vizinhos.
          // O grupo do equipamento pego fica parado; os outros é que abrem espaço.
          // Espera o quadro do "soltar" aparecer: o redesenho completo é o
          // trabalho mais pesado e travaria a mão bem no momento de soltar.
          equipamentoFixoNaSeparacao = equipamento.id;
          requestAnimationFrame(function () { setTimeout(function () { gerar(); atualizarJsonAvancado(); }, 0); });
        }
        node.addEventListener("pointermove", mover);
        node.addEventListener("pointerup", soltar);
        node.addEventListener("pointercancel", soltar);
      });
      node.addEventListener("dblclick", function (event) {
        event.stopPropagation();
        abrirEditorEquipamento(equipamento);
      });

      // Teclado: Tab foca o equipamento, setas movem a seleção (Shift = passo
      // maior), Enter/F2 abre o editor.
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", "Equipamento " + (equipamento.nome || equipamento.id) + ". Use as setas para mover e Enter para editar.");
      node.addEventListener("focus", function () {
        if (!focoPorCliqueComModificador && !selecao[idNode]) definirSelecao([idNode]);
      });
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
        var ids = selecao[idNode] ? idsSelecionados() : [idNode];
        ids.forEach(function (id) {
          var eq = estado.equipamentos.find(function (item) { return item.id === id; });
          var el = obterNodePorId(svg, id);
          if (!eq) return;
          var atual = eq.deslocamento || { x: 0, y: 0 };
          var x = limitarPosicaoNoCanvas(atual.x + delta[0], LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
          var y = limitarPosicaoNoCanvas(atual.y + delta[1], LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
          eq.deslocamento = { x: x, y: y };
          atualizarPosicaoAbsoluta(eq);
          if (el) el.setAttribute("transform", "translate(" + x + "," + y + ")");
        });
        finalizarMovimento();
        salvarLocal();
        atualizarJsonAvancado();
        // Troca as portas de lado quando o usuário para de apertar as setas.
        solicitarAtualizacaoDiagrama();
      });
    });
    aplicarSelecaoNoSvg();
  }

  // ---- Seleção de vários equipamentos ------------------------------------------------
  // Clique seleciona; Shift/Ctrl + clique soma ou tira; Shift + arrastar numa área
  // vazia desenha um retângulo de seleção; Ctrl+A seleciona tudo; Esc limpa.
  // A seleção sobrevive aos redesenhos (é por id) e some com equipamentos excluídos.
  var selecao = {};
  var focoPorCliqueComModificador = false;
  function idsSelecionados() {
    return estado.equipamentos.filter(function (eq) { return selecao[eq.id]; }).map(function (eq) { return eq.id; });
  }
  function aplicarSelecaoNoSvg() {
    var svg = elCanvas.querySelector("svg");
    if (svg) svg.querySelectorAll("g.node").forEach(function (node) {
      node.classList.toggle("selecionado", !!selecao[idEquipamentoDoNode(node)]);
    });
    atualizarBarraSelecao();
  }
  function definirSelecao(ids) {
    selecao = {};
    ids.forEach(function (id) { selecao[id] = true; });
    aplicarSelecaoNoSvg();
  }
  function alternarSelecao(id) {
    if (selecao[id]) delete selecao[id]; else selecao[id] = true;
    aplicarSelecaoNoSvg();
  }
  function limparSelecao() {
    if (!Object.keys(selecao).length) return;
    definirSelecao([]);
  }

  // Barra flutuante sobre o diagrama quando há 2 ou mais selecionados.
  var elBarraSelecao = document.getElementById("barraSelecao");
  function atualizarBarraSelecao() {
    if (!elBarraSelecao) return;
    var n = idsSelecionados().length;
    elBarraSelecao.hidden = n < 2;
    if (n < 2) return;
    elBarraSelecao.querySelector("[data-selecao-contagem]").textContent = n + " selecionados";
    elBarraSelecao.style.top = (elCanvas.offsetTop + 12) + "px";
  }

  // Retângulo de seleção: Shift + arrastar numa parte vazia do diagrama.
  // Registrado antes do pan (05-zoom…): com Shift, o pan nem começa.
  var inicioCliqueVazio = null;
  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || !elCanvas.querySelector("svg")) return;
    if (!event.shiftKey) { inicioCliqueVazio = { x: event.clientX, y: event.clientY }; return; }
    event.stopImmediatePropagation();
    event.preventDefault();
    var area = elCanvas.getBoundingClientRect();
    var ret = document.createElement("div");
    ret.className = "retangulo-selecao";
    elCanvas.appendChild(ret);
    var x0 = event.clientX, y0 = event.clientY;
    var somar = Object.assign({}, selecao);
    function desenhar(x, y) {
      var l = Math.min(x0, x), t = Math.min(y0, y);
      ret.style.transform = "translate(" + (l - area.left) + "px," + (t - area.top) + "px)";
      ret.style.width = Math.abs(x - x0) + "px";
      ret.style.height = Math.abs(y - y0) + "px";
      return { l: l, t: t, r: Math.max(x0, x), b: Math.max(y0, y) };
    }
    desenhar(x0, y0);
    elCanvas.setPointerCapture(event.pointerId);
    function mover(e) {
      var r = desenhar(e.clientX, e.clientY);
      var nova = Object.assign({}, somar);
      elCanvas.querySelectorAll("svg g.node").forEach(function (node) {
        var b = node.getBoundingClientRect();
        if (b.right >= r.l && b.left <= r.r && b.bottom >= r.t && b.top <= r.b) nova[idEquipamentoDoNode(node)] = true;
      });
      selecao = nova;
      aplicarSelecaoNoSvg();
    }
    function soltar(e) {
      ret.remove();
      elCanvas.removeEventListener("pointermove", mover);
      elCanvas.removeEventListener("pointerup", soltar);
      elCanvas.removeEventListener("pointercancel", soltar);
      if (elCanvas.hasPointerCapture(e.pointerId)) elCanvas.releasePointerCapture(e.pointerId);
    }
    elCanvas.addEventListener("pointermove", mover);
    elCanvas.addEventListener("pointerup", soltar);
    elCanvas.addEventListener("pointercancel", soltar);
  });
  // Clique (sem arrastar) numa parte vazia: limpa a seleção.
  elCanvas.addEventListener("pointerup", function (event) {
    var inicio = inicioCliqueVazio;
    inicioCliqueVazio = null;
    if (inicio && Math.abs(event.clientX - inicio.x) + Math.abs(event.clientY - inicio.y) < 4) limparSelecao();
  });

  // ---- Copiar, colar, duplicar, excluir e atalhos ---------------------------------
  // A cópia fica guardada neste navegador (dá para colar em outro projeto ou aba).
  var CHAVE_COPIA = "grafo-copia";

  function copiarSelecao() {
    var ids = idsSelecionados();
    if (!ids.length) return null;
    var conjunto = {};
    ids.forEach(function (id) { conjunto[id] = true; });
    var copia = {
      equipamentos: clonarDados(estado.equipamentos.filter(function (eq) { return conjunto[eq.id]; })),
      conexoes: clonarDados(estado.conexoes.filter(function (c) { return conjunto[c.de] && conjunto[c.para]; }))
    };
    try { localStorage.setItem(CHAVE_COPIA, JSON.stringify(copia)); } catch (e) {}
    return copia;
  }

  function nomeDeCopia(nome) {
    var usados = {};
    estado.equipamentos.forEach(function (eq) { usados[String(eq.nome || "").toLowerCase()] = true; });
    var base = String(nome || "Equipamento").replace(/ \(cópia(?: \d+)?\)$/, "");
    var candidato = (base + " (cópia)").slice(0, LIMITES.nome);
    for (var n = 2; usados[candidato.toLowerCase()]; n++) candidato = (base.slice(0, LIMITES.nome - 12) + " (cópia " + n + ")");
    return candidato;
  }

  // Cola a cópia com ids e nomes novos, 48 px para baixo e para a direita.
  function colar(copia) {
    if (!copia || !Array.isArray(copia.equipamentos) || !copia.equipamentos.length) { avisar("Nada copiado ainda. Selecione equipamentos e use Ctrl+C."); return; }
    var cabe = LIMITES.equipamentos - estado.equipamentos.length;
    if (cabe <= 0) { avisar("Limite de " + LIMITES.equipamentos + " equipamentos atingido: não há espaço para colar."); return; }
    var origem = copia.equipamentos.slice(0, cabe);
    var novoIdDe = {}, novos = [];
    origem.forEach(function (eq) {
      var r = Esquema.validarEquipamento(Object.assign({}, eq, { id: novoId(), nome: nomeDeCopia(eq.nome) }));
      if (!r.ok) return;
      var novo = r.dados;
      delete novo.deslocamento;
      if (posicaoValida(eq.posicao)) novo.posicao = { x: eq.posicao.x + 48, y: eq.posicao.y + 48 };
      else delete novo.posicao;
      novoIdDe[eq.id] = novo.id;
      estado.equipamentos.push(novo);
      novos.push(novo.id);
    });
    (copia.conexoes || []).forEach(function (c) {
      if (!novoIdDe[c.de] || !novoIdDe[c.para]) return;
      var r = Esquema.validarConexao(Object.assign({}, c, { de: novoIdDe[c.de], para: novoIdDe[c.para] }), estado.equipamentos.map(function (eq) { return eq.id; }));
      if (r.ok) { delete r.dados.deslocamento; estado.conexoes.push(r.dados); }
    });
    if (!novos.length) return;
    definirSelecao(novos);
    renderTudo();
    var cortados = copia.equipamentos.length - origem.length;
    avisar(plural(novos.length, "equipamento colado", "equipamentos colados") + (cortados ? " (" + cortados + " ficaram de fora pelo limite de " + LIMITES.equipamentos + ")" : "") + ".");
  }

  function lerCopia() {
    try { return JSON.parse(localStorage.getItem(CHAVE_COPIA) || "null"); } catch (e) { return null; }
  }

  function excluirSelecao() {
    var ids = idsSelecionados();
    if (!ids.length) return;
    var sai = {};
    ids.forEach(function (id) { sai[id] = true; });
    estado.equipamentos = estado.equipamentos.filter(function (eq) { return !sai[eq.id]; });
    estado.conexoes = estado.conexoes.filter(function (c) { return !sai[c.de] && !sai[c.para]; });
    selecao = {};
    renderTudo();
    avisar(plural(ids.length, "equipamento excluído", "equipamentos excluídos") + ".", { desfazer: true });
  }

  function digitandoEmCampo(alvo) {
    return !!alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable);
  }
  function algumaJanelaAberta() {
    return !!document.querySelector(".modal-backdrop:not(.hidden)");
  }

  document.addEventListener("keydown", function (event) {
    if (document.body.classList.contains("auth-locked") || digitandoEmCampo(event.target) || algumaJanelaAberta()) return;
    var ctrl = event.ctrlKey || event.metaKey;
    var tecla = String(event.key).toLowerCase();
    if (ctrl && !event.altKey && tecla === "z") { event.preventDefault(); (event.shiftKey ? btnRefazer : btnDesfazer).click(); return; }
    if (ctrl && !event.altKey && tecla === "y") { event.preventDefault(); btnRefazer.click(); return; }
    if (ctrl && tecla === "a" && elCanvas.querySelector("svg")) { event.preventDefault(); definirSelecao(estado.equipamentos.map(function (eq) { return eq.id; })); return; }
    if (ctrl && tecla === "c" && idsSelecionados().length) {
      event.preventDefault();
      var n = copiarSelecao().equipamentos.length;
      avisar(plural(n, "equipamento copiado", "equipamentos copiados") + ". Ctrl+V cola.");
      return;
    }
    if (ctrl && tecla === "v") { event.preventDefault(); colar(lerCopia()); return; }
    if (ctrl && tecla === "d" && idsSelecionados().length) { event.preventDefault(); colar(copiarSelecao()); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && idsSelecionados().length) { event.preventDefault(); excluirSelecao(); return; }
    if (event.key === "Escape") limparSelecao();
  });

  if (elBarraSelecao) {
    elBarraSelecao.addEventListener("click", function (event) {
      var acao = event.target.closest("[data-selecao]");
      if (!acao) return;
      var qual = acao.getAttribute("data-selecao");
      if (qual === "duplicar") colar(copiarSelecao());
      else if (qual === "copiar") { var n = copiarSelecao().equipamentos.length; avisar(plural(n, "equipamento copiado", "equipamentos copiados") + ". Ctrl+V cola."); }
      else if (qual === "excluir") excluirSelecao();
      else if (qual === "limpar") limparSelecao();
    });
    // Não deixa o clique na barra virar pan no canvas.
    elBarraSelecao.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
  }

  // ---- Anotações livres ------------------------------------------------------------
  // Caixas de texto ("aguardando instalação", "cliente X") desenhadas por cima do
  // diagrama, dentro do SVG: saem no SVG, PNG, PDF e no link de visualização.
  // Botão "Anotação" cria no centro da tela; duplo clique edita; arrastar move.
  var NS_SVG = "http://www.w3.org/2000/svg";
  var ANOTACAO = { fonte: 11, linha: 15, padding: 10, maxCaracteres: 34 };

  function listaAnotacoes() { return Array.isArray(estado.anotacoes) ? estado.anotacoes : []; }

  // Quebra o texto nas linhas digitadas e, dentro delas, por palavras.
  function linhasDaAnotacao(texto) {
    var linhas = [];
    String(texto || "").split(/\r?\n/).forEach(function (paragrafo) {
      var atual = "";
      paragrafo.split(/\s+/).forEach(function (palavra) {
        while (palavra.length > ANOTACAO.maxCaracteres) { // palavra enorme: corta
          if (atual) { linhas.push(atual); atual = ""; }
          linhas.push(palavra.slice(0, ANOTACAO.maxCaracteres));
          palavra = palavra.slice(ANOTACAO.maxCaracteres);
        }
        if (!palavra) return;
        if (atual && (atual + " " + palavra).length > ANOTACAO.maxCaracteres) { linhas.push(atual); atual = palavra; }
        else atual = atual ? atual + " " + palavra : palavra;
      });
      linhas.push(atual);
    });
    while (linhas.length > 1 && !linhas[linhas.length - 1]) linhas.pop();
    return linhas;
  }

  function corDaBorda(cor) {
    return { "#FFF3B0": "#D9B64A", "#D6ECFF": "#6D9CC9", "#DDF5D8": "#6DAF68", "#FFDDE4": "#D07A8E", "#ECEFF3": "#8C99A6" }[String(cor).toUpperCase()] || "#8C99A6";
  }

  function desenharAnotacoes() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    grafo.querySelectorAll("g.anotacao").forEach(function (g) { g.remove(); });
    listaAnotacoes().forEach(function (a) {
      var g = document.createElementNS(NS_SVG, "g");
      g.setAttribute("class", "anotacao");
      g.setAttribute("data-anotacao", a.id);
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", "Anotação: " + a.texto + ". Enter para editar.");
      var rect = document.createElementNS(NS_SVG, "rect");
      rect.setAttribute("x", a.x); rect.setAttribute("y", a.y);
      rect.setAttribute("rx", 6);
      rect.setAttribute("fill", a.cor || Esquema.CORES_ANOTACAO[0]);
      rect.setAttribute("stroke", corDaBorda(a.cor));
      rect.setAttribute("stroke-width", 1);
      var texto = document.createElementNS(NS_SVG, "text");
      texto.setAttribute("font-family", "Helvetica, Arial, sans-serif");
      texto.setAttribute("font-size", ANOTACAO.fonte);
      texto.setAttribute("fill", "#14212B");
      var linhas = linhasDaAnotacao(a.texto);
      linhas.forEach(function (linha, i) {
        var tspan = document.createElementNS(NS_SVG, "tspan");
        tspan.setAttribute("x", a.x + ANOTACAO.padding);
        tspan.setAttribute("y", a.y + ANOTACAO.padding + ANOTACAO.fonte + i * ANOTACAO.linha);
        tspan.textContent = linha || " ";
        texto.appendChild(tspan);
      });
      g.appendChild(rect);
      g.appendChild(texto);
      grafo.appendChild(g); // por último: fica por cima dos equipamentos e cabos
      var larguraTexto = 60;
      try { larguraTexto = Math.max(60, texto.getBBox().width); } catch (e) {}
      rect.setAttribute("width", (larguraTexto + 2 * ANOTACAO.padding).toFixed(1));
      rect.setAttribute("height", (linhas.length * ANOTACAO.linha + 2 * ANOTACAO.padding - (ANOTACAO.linha - ANOTACAO.fonte) + 4).toFixed(1));
      ligarAnotacao(svg, g, a);
    });
  }

  function ligarAnotacao(svg, g, a) {
    g.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      event.stopPropagation();
      var viewBox = svg.viewBox && svg.viewBox.baseVal;
      var rect = svg.getBoundingClientRect();
      var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
      var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
      var inicio = { x: event.clientX, y: event.clientY }, dx = 0, dy = 0, quadro = 0;
      g.setPointerCapture(event.pointerId);
      g.classList.add("arrastando");
      function mover(e) {
        dx = (e.clientX - inicio.x) * escalaX;
        dy = (e.clientY - inicio.y) * escalaY;
        if (!quadro) quadro = requestAnimationFrame(function () { quadro = 0; g.setAttribute("transform", "translate(" + dx + "," + dy + ")"); });
      }
      function soltar() {
        if (quadro) cancelAnimationFrame(quadro);
        g.classList.remove("arrastando");
        g.removeEventListener("pointermove", mover);
        g.removeEventListener("pointerup", soltar);
        g.removeEventListener("pointercancel", soltar);
        if (Math.abs(dx) + Math.abs(dy) < 0.5) { g.removeAttribute("transform"); return; }
        a.x = limitarPosicaoNoCanvas(a.x + dx, -LIMITES.coordenada, LIMITES.coordenada);
        a.y = limitarPosicaoNoCanvas(a.y + dy, -LIMITES.coordenada, LIMITES.coordenada);
        desenharAnotacoes();
        ajustarViewBoxAoConteudo(true);
        salvarLocal();
        atualizarJsonAvancado();
      }
      g.addEventListener("pointermove", mover);
      g.addEventListener("pointerup", soltar);
      g.addEventListener("pointercancel", soltar);
    });
    g.addEventListener("dblclick", function (event) { event.stopPropagation(); abrirEditorAnotacao(a); });
    g.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); abrirEditorAnotacao(a); }
    });
  }

  // Ponto do centro da área visível, nas coordenadas do desenho.
  function centroVisivelNoDesenho() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return { x: 0, y: 0 };
    var area = elCanvas.getBoundingClientRect();
    var p = svg.createSVGPoint();
    p.x = area.left + area.width / 2;
    p.y = area.top + area.height / 2;
    var m = grafo.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  var editorAnotacao = {
    backdrop: document.getElementById("anotacaoModal"),
    texto: document.getElementById("anotacaoTexto"),
    cores: document.getElementById("anotacaoCores"),
    atual: null,
    nova: false
  };

  function abrirEditorAnotacao(a, nova) {
    if (!editorAnotacao.backdrop) return;
    editorAnotacao.atual = a;
    editorAnotacao.nova = !!nova;
    editorAnotacao.texto.value = a.texto || "";
    editorAnotacao.cores.querySelectorAll("input").forEach(function (r) { r.checked = r.value.toUpperCase() === String(a.cor || Esquema.CORES_ANOTACAO[0]).toUpperCase(); });
    editorAnotacao.backdrop.querySelector("[data-anotacao-excluir]").hidden = !!nova;
    document.getElementById("anotacaoTitulo").textContent = nova ? "Nova anotação" : "Editar anotação";
    mostrarModalBackdrop(editorAnotacao.backdrop);
    // Foco na hora (a janela já está visível): com atraso, o que a pessoa
    // digitasse nos primeiros instantes era selecionado e apagado pela próxima tecla.
    editorAnotacao.texto.focus();
    if (!nova) editorAnotacao.texto.select(); // editar: começa com o texto todo marcado
  }

  function fecharEditorAnotacao() {
    esconderModal(editorAnotacao.backdrop);
    editorAnotacao.atual = null;
  }

  function salvarAnotacao() {
    var a = editorAnotacao.atual;
    if (!a) return;
    var escolhida = editorAnotacao.cores.querySelector("input:checked");
    var r = Esquema.validarProjeto({ equipamentos: [], conexoes: [], anotacoes: [Object.assign({}, a, { texto: editorAnotacao.texto.value, cor: escolhida ? escolhida.value : a.cor })] }, "estrito");
    if (!r.ok) { editorAnotacao.texto.focus(); editorAnotacao.texto.setCustomValidity(r.erros[0].mensagem); editorAnotacao.texto.reportValidity(); return; }
    if (!Array.isArray(estado.anotacoes)) estado.anotacoes = [];
    var salva = r.dados.anotacoes[0];
    if (editorAnotacao.nova) estado.anotacoes.push(salva);
    else Object.assign(a, salva);
    fecharEditorAnotacao();
    renderTudo();
  }

  function excluirAnotacao() {
    var a = editorAnotacao.atual;
    if (!a) return;
    estado.anotacoes = listaAnotacoes().filter(function (item) { return item !== a; });
    fecharEditorAnotacao();
    renderTudo();
    avisar("Anotação excluída.", { desfazer: true });
  }

  function criarAnotacao() {
    if (!elCanvas.querySelector("svg")) { avisar("Adicione equipamentos antes de criar anotações."); return; }
    if (listaAnotacoes().length >= LIMITES.anotacoes) { avisar("Limite de " + LIMITES.anotacoes + " anotações por diagrama atingido."); return; }
    var centro = centroVisivelNoDesenho();
    abrirEditorAnotacao({ id: "nota_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), texto: "", x: Math.round(centro.x - 90), y: Math.round(centro.y - 20), cor: Esquema.CORES_ANOTACAO[0] }, true);
  }

  if (editorAnotacao.backdrop) {
    document.getElementById("btnAnotacao").addEventListener("click", criarAnotacao);
    editorAnotacao.backdrop.querySelector("[data-anotacao-salvar]").addEventListener("click", salvarAnotacao);
    editorAnotacao.backdrop.querySelector("[data-anotacao-excluir]").addEventListener("click", excluirAnotacao);
    editorAnotacao.backdrop.querySelectorAll("[data-anotacao-fechar]").forEach(function (b) { b.addEventListener("click", fecharEditorAnotacao); });
    editorAnotacao.texto.addEventListener("input", function () { editorAnotacao.texto.setCustomValidity(""); });
    editorAnotacao.backdrop.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); fecharEditorAnotacao(); }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); salvarAnotacao(); }
    });
    editorAnotacao.backdrop.addEventListener("click", function (event) { if (event.target === editorAnotacao.backdrop) fecharEditorAnotacao(); });
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

