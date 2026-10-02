  // ==== 02-posicoes-e-portas.js: posições absolutas dos equipamentos e lado das portas (parte de assets/js/editor/app.js; npm run montar) ====
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
  // Prefere o eixo do layout (esquerda/direita em "LR", cima/baixo em "TB"):
  // só usa o outro eixo quando os dois estão quase alinhados nele. Sem isso,
  // no LR os filhos empilhados numa coluna ganhavam porta em cima e os cabos
  // desciam pela coluna, por cima dos outros equipamentos.
  var DISTANCIA_MINIMA_NO_EIXO = 40;
  function ladoVoltadoPara(origem, destino, padrao, direcao) {
    if (!origem || !destino || !posicaoValida(origem.posicao) || !posicaoValida(destino.posicao)) return padrao;
    var dx = destino.posicao.x - origem.posicao.x;
    var dy = destino.posicao.y - origem.posicao.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return padrao;
    // Na grade não há eixo principal: vale o lado para onde o outro está mais longe.
    // Grade e grupos lado a lado: a porta vai para o lado de onde o vizinho está de fato.
    // Estrela: colunas à esquerda e à direita (lateral mesmo bem acima ou abaixo)
    // e a linha de baixo bem mais funda que larga (posicionarEmEstrela).
    var horizontal = direcao === "ESTRELA" ? Math.abs(dx) >= Math.abs(dy) / 2 : direcao === "GRADE" || direcao === "LADO" ? Math.abs(dx) >= Math.abs(dy) : direcao === "TB"
      ? Math.abs(dy) < DISTANCIA_MINIMA_NO_EIXO && Math.abs(dx) > Math.abs(dy)
      : Math.abs(dx) >= DISTANCIA_MINIMA_NO_EIXO || Math.abs(dx) >= Math.abs(dy);
    if (horizontal) return dx > 0 ? "direita" : "esquerda";
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
        try { b = caixas[i] && medir(caixas[i]); } catch (e) { b = null; }
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

