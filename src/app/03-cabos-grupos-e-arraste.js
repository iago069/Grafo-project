  // ==== 03-cabos-grupos-e-arraste.js: rota dos cabos, caixas dos grupos e arrastar equipamentos/cabos (parte de assets/js/app.js; npm run montar) ====
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
      try { b = node.getBBox(); } catch (e) { return; }
      if (!id || !b || !b.width) return;
      lista.push({ equipamento: id, custo: 5000,
        x1: b.x + t.x - FOLGA_OBSTACULO, y1: b.y + t.y - FOLGA_OBSTACULO,
        x2: b.x + t.x + b.width + FOLGA_OBSTACULO, y2: b.y + t.y + b.height + FOLGA_OBSTACULO });
    });
    nomesDosGrupos(estado).forEach(function (nome, indice) {
      var forma = svg.querySelector('g.cluster[id="grupo_' + indice + '"] path, g.cluster[id="grupo_' + indice + '"] polygon');
      var b;
      try { b = forma && forma.getBBox(); } catch (e) { b = null; }
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
      rotas.push({ aresta: aresta, path: path, s: s, e: e, conexao: conexao });
    });
    var obstaculos = coletarObstaculos(svg);
    // Cabos curtos primeiro ficam com a trilha ideal; os longos desviam deles.
    function comprimento(r) { return Math.abs(r.s.x - r.e.x) + Math.abs(r.s.y - r.e.y); }
    rotas.sort(function (a, b) { return comprimento(a) - comprimento(b); });
    var existentes = [];
    rotas.forEach(function (rota) {
      var pts = tracarRota(rota.s, rota.e, existentes, obstaculosDoCabo(obstaculos, rota.conexao, rota.s, rota.e));
      existentes.push.apply(existentes, segmentosDaRota(pts));
      rota.path.setAttribute("d", caminhoOrtogonalArredondado(pts));
      posicionarRotuloDaAresta(rota.aresta, pts);
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
        try { b = node.getBBox(); } catch (e) { return; }
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
      var larguraRotulo = rotulo ? rotulo.getBBox().width + 16 : 0;
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
      try { b = forma && forma.getBBox(); } catch (e) { b = null; }
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
        arrastandoEquipamento = true;
        node.classList.add("arrastando");
        function mover(movimento) {
          // Limita já durante o arraste: o nó para na borda da área de desenho
          // em vez de "pular" de volta ao soltar.
          deslocamento.x = limitarPosicaoNoCanvas(originalX + (movimento.clientX - inicioX) * escalaX, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
          deslocamento.y = limitarPosicaoNoCanvas(originalY + (movimento.clientY - inicioY) * escalaY, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
          node.setAttribute("transform", "translate(" + deslocamento.x + "," + deslocamento.y + ")");
          solicitarRoteamentoCabos();
        }
        function soltar() {
          arrastandoEquipamento = false;
          node.classList.remove("arrastando");
          node.removeEventListener("pointermove", mover);
          node.removeEventListener("pointerup", soltar);
          node.removeEventListener("pointercancel", soltar);
          // Clique sem arrastar não redesenha (manteria o duplo clique funcionando).
          if (Math.abs(deslocamento.x - originalX) < 0.5 && Math.abs(deslocamento.y - originalY) < 0.5) return;
          equipamento.deslocamento = { x: deslocamento.x, y: deslocamento.y };
          atualizarPosicaoAbsoluta(equipamento);
          // Redesenha para as portas irem para o lado voltado aos vizinhos.
          // O grupo deste equipamento fica parado; os outros é que abrem espaço.
          equipamentoFixoNaSeparacao = equipamento.id;
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

