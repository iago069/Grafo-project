  // ==== 10-diagrama-e-layout.js: geração do DOT, imagens no SVG, organizar/grade e renderização (parte de assets/js/app.js; npm run montar) ====
  function gerarDot(dados, direcao) {
    var contagemPortas = {};
    dados.equipamentos.forEach(function (eq) { contagemPortas[eq.id] = 0; });
    dados.conexoes.forEach(function (c) {
      if (contagemPortas[c.de] != null) contagemPortas[c.de]++;
      if (contagemPortas[c.para] != null) contagemPortas[c.para]++;
    });
    var maiorQtdPortas = Math.max.apply(null, [1].concat(Object.keys(contagemPortas).map(function (id) { return contagemPortas[id]; })));
    var ranksepAuto = Math.max(1.15, Math.min(4.5, 0.95 + maiorQtdPortas * 0.16));
    // A grade parte do layout "LR" do Graphviz e depois reposiciona (posicionarEmGrade).
    var linhas = ["digraph G {", '  rankdir=' + (direcao === "TB" ? "TB" : "LR") + ';', '  splines=ortho;', '  concentrate=false;', '  overlap=false;', '  nodesep=0.45;', '  ranksep=' + ranksepAuto.toFixed(2) + ';', '  pad=0;', '  margin=0;', '  bgcolor="transparent";',
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
        var ladoSaida = ladoVoltadoPara(de, para, padraoSaida, direcao);
        portasPorEquipamento[c.de][ladoSaida].push({ indice: indice, ponta: "inicio", lado: ladoSaida, nome: c.saida || "P1", outro: para });
      }
      if (para) {
        var ladoChegada = ladoVoltadoPara(para, de, padraoChegada, direcao);
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
      linhas.push('    id="grupo_' + indiceGrupo + '";');
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

  // Reposiciona todos os equipamentos pelo layout do Graphviz (veja organizarUmaVez).
  // "opcoes" é aceito por compatibilidade com quem chama window.organizarDiagramaAutomaticamente.
  function organizarDiagramaAutomaticamente(opcoes) {
    // Registra qualquer mudança pendente antes, e o organizar inteiro como um
    // único passo no desfazer (as renderizações do meio não entram).
    salvarLocal();
    var estadoAntes = ultimoEstadoHistorico;
    aplicandoHistorico = true;
    try {
      organizarUmaVez();
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

  // Organizar = voltar ao layout do Graphviz: ele já respeita os grupos (clusters)
  // e a direção escolhida. Apaga as posições salvas e redesenha; na renderização
  // seguinte cada equipamento ganha posição nova a partir desse layout.
  function organizarUmaVez() {
    if (!estado.equipamentos.length) return;
    estado.equipamentos.forEach(function (eq) { delete eq.posicao; delete eq.deslocamento; });
    gerar();
    // Grade: o layout do Graphviz acima só serve para medir os equipamentos.
    if (selDirecao.value === "GRADE" && posicionarEmGrade()) gerar();
  }

  // Ordem dentro do grupo: começa pelo mais ligado e segue pelos vizinhos
  // (busca em largura), para equipamentos ligados ficarem lado a lado.
  function ordenarPorLigacoes(membros) {
    var noGrupo = {}, vizinhos = {};
    membros.forEach(function (eq) { noGrupo[eq.id] = eq; vizinhos[eq.id] = []; });
    estado.conexoes.forEach(function (c) {
      if (noGrupo[c.de] && noGrupo[c.para]) { vizinhos[c.de].push(c.para); vizinhos[c.para].push(c.de); }
    });
    var porGrau = membros.slice().sort(function (a, b) { return vizinhos[b.id].length - vizinhos[a.id].length; });
    var visitado = {}, ordem = [];
    porGrau.forEach(function (inicio) {
      if (visitado[inicio.id]) return;
      var fila = [inicio.id];
      visitado[inicio.id] = true;
      while (fila.length) {
        var id = fila.shift();
        ordem.push(noGrupo[id]);
        vizinhos[id].forEach(function (v) { if (!visitado[v]) { visitado[v] = true; fila.push(v); } });
      }
    });
    return ordem;
  }

  // "Grade por grupo": cada grupo vira um bloco com os equipamentos em linhas e
  // colunas, e os blocos são arrumados em prateleiras na proporção da folha do
  // PDF. Aproveita melhor a página que o layout em camadas, que com muitos
  // equipamentos fica alto e estreito. Grava eq.posicao; retorna false se não
  // houver o que medir.
  function posicionarEmGrade() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return false;
    var larguraMax = 0, alturaMax = 0, somaX = 0, somaY = 0, n = 0;
    estado.equipamentos.forEach(function (eq) {
      var node = obterNodePorId(svg, eq.id);
      var b;
      try { b = node && node.getBBox(); } catch (e) { b = null; }
      if (!b) return;
      larguraMax = Math.max(larguraMax, b.width);
      alturaMax = Math.max(alturaMax, b.height);
      if (centrosBase[eq.id]) { somaX += centrosBase[eq.id].x; somaY += centrosBase[eq.id].y; n++; }
    });
    if (!larguraMax || !n) return false;

    var ESPACO = 48, ROTULO = 30, MARGEM = 16, ENTRE_BLOCOS = 48;
    var celW = larguraMax + ESPACO, celH = alturaMax + ESPACO;
    var pagina = tamanhoPaginaMm();
    var proporcao = pagina.w / pagina.h;

    var blocos = [];
    nomesDosGrupos(estado).forEach(function (nome) {
      var membros = estado.equipamentos.filter(function (eq) { return String(eq.grupo || "").trim() === nome; });
      if (membros.length) blocos.push({ membros: membros, grupo: true });
    });
    var soltos = estado.equipamentos.filter(function (eq) { return !String(eq.grupo || "").trim(); });
    if (soltos.length) blocos.push({ membros: soltos, grupo: false });
    blocos.forEach(function (bl) {
      bl.membros = ordenarPorLigacoes(bl.membros);
      var qtd = bl.membros.length;
      // Colunas para o bloco ficar com a proporção da folha.
      bl.colunas = Math.max(1, Math.min(qtd, Math.round(Math.sqrt(qtd * celH / celW * proporcao))));
      bl.linhas = Math.ceil(qtd / bl.colunas);
      bl.w = bl.colunas * celW + (bl.grupo ? 2 * MARGEM : 0);
      bl.h = bl.linhas * celH + (bl.grupo ? ROTULO + MARGEM : 0);
    });

    // Prateleiras: testa larguras máximas e fica com a que deixa o conjunto
    // maior na folha (menor max(largura / proporção, altura)).
    function empacotar(limite) {
      var x = 0, y = 0, alturaLinha = 0, largura = 0;
      blocos.forEach(function (bl) {
        if (x > 0 && x + bl.w > limite) { x = 0; y += alturaLinha + ENTRE_BLOCOS; alturaLinha = 0; }
        bl.x = x; bl.y = y;
        x += bl.w + ENTRE_BLOCOS;
        alturaLinha = Math.max(alturaLinha, bl.h);
        largura = Math.max(largura, x - ENTRE_BLOCOS);
      });
      return { w: largura, h: y + alturaLinha };
    }
    var maiorBloco = Math.max.apply(null, blocos.map(function (bl) { return bl.w; }));
    var somaLarguras = blocos.reduce(function (s, bl) { return s + bl.w + ENTRE_BLOCOS; }, 0);
    var melhor = null;
    for (var t = 0; t <= 24; t++) {
      var limite = maiorBloco + (somaLarguras - maiorBloco) * t / 24;
      var r = empacotar(limite);
      var custo = Math.max(r.w / proporcao, r.h);
      if (!melhor || custo < melhor.custo - 1e-6) melhor = { limite: limite, custo: custo };
    }
    var total = empacotar(melhor.limite);

    // Centraliza onde o Graphviz tinha posto os equipamentos (dentro da área de desenho).
    var origemX = somaX / n - total.w / 2, origemY = somaY / n - total.h / 2;
    blocos.forEach(function (bl) {
      var x0 = origemX + bl.x + (bl.grupo ? MARGEM : 0);
      var y0 = origemY + bl.y + (bl.grupo ? ROTULO : 0);
      bl.membros.forEach(function (eq, i) {
        eq.posicao = { x: x0 + (i % bl.colunas) * celW + celW / 2, y: y0 + Math.floor(i / bl.colunas) * celH + celH / 2 };
        delete eq.deslocamento;
      });
    });
    return true;
  }

  window.organizarDiagramaAutomaticamente = organizarDiagramaAutomaticamente;

  // O que outros módulos (compartilhar.js) podem ler do editor.
  window.GrafoApp = {
    projetoAtual: function () { return projetoAtual; },
    nomesProjetos: function () { return Object.keys(projetos); },
    // Desenho atual como SVG completo (moldura e imagens embutidas); "" sem diagrama.
    svgDoDiagrama: async function () {
      var svgEl = elCanvas.querySelector("svg");
      if (!svgEl) return "";
      var copia = await prepararSvgParaExportacao(svgEl, false);
      adicionarMolduraDeExportacao(copia);
      return new XMLSerializer().serializeToString(copia);
    },
    avisar: function (texto) { avisar(texto); },
    // Usados por equipe.js (projetos de equipe).
    dadosProjeto: function (nome) {
      if (nome === projetoAtual) return clonarDados(estado);
      return projetos[nome] ? clonarDados(projetos[nome]) : null;
    },
    // Alteração de um colega: troca os dados do projeto (e redesenha se estiver aberto).
    substituirProjeto: function (nome, dados) {
      var r = Esquema.validarProjeto(dados, "reparar");
      projetos[nome] = r.dados;
      if (nome !== projetoAtual) { salvarLocal(true); return; }
      estado = clonarDados(r.dados);
      // O desfazer da versão anterior não vale mais: voltaria a versão do colega.
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      aplicandoHistorico = true;
      try {
        renderTudo();
        if (estado.equipamentos.length) gerar(); else limparDiagrama();
      } finally {
        aplicandoHistorico = false;
      }
      atualizarBotoesHistorico();
    },
    removerProjeto: function (nome) { removerProjetoDaLista(nome); },
    salvar: function () { salvarLocal(true); },
    atualizarListaProjetos: function () { renderProjetos(); }
  };

  // O Graphviz (WebAssembly) carrega de forma assíncrona; depois disso a
  // renderização é síncrona. Chamadas a gerar() antes do carregamento ficam pendentes.
  // Sem inicializador: gerar() pode ser chamado antes desta linha executar.
  var vizInstancia;
  var gerarPendente;
  // Centraliza/ajusta o zoom na primeira renderização e ao trocar de projeto.
  var ajustarNaProximaRenderizacao = true;
  var equipamentoFixoNaSeparacao = null;
  Viz.instance().then(function (viz) {
    vizInstancia = viz;
    if (gerarPendente) { gerarPendente = false; gerar(); }
  }).catch(function (e) {
    mostrarErro("Não foi possível carregar o Graphviz.\nDetalhe: " + e.message);
  });

  function gerar() {
    window.clearTimeout(atualizacaoDiagramaPendente);
    if (!vizInstancia) { gerarPendente = true; return; }
    // Erros de uma ação anterior somem ao redesenhar; avisos ficam até a pessoa fechar.
    if (!elErro.classList.contains("aviso")) esconderErro();
    removerConexoesOrfas();
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
      ajustarCaixasDosGrupos();
      var fixo = equipamentoFixoNaSeparacao;
      equipamentoFixoNaSeparacao = null;
      // Grupos mudaram de lugar: renderiza de novo para as portas acompanharem.
      // As portas podem trocar de lado e mudar o tamanho das caixas, então
      // confere de novo (até 3 rodadas) até nenhuma caixa encostar em outra.
      for (var rodada = 0; rodada < 3 && separarGruposSobrepostos(fixo); rodada++) {
        renderizarSvg();
        sincronizarPosicoes();
        aplicarPosicoesEquipamentos();
        ajustarCaixasDosGrupos();
      }
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
      aplicarCaminho();
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
      solicitarPrevia();
    } catch (e) {
      mostrarErro("Não foi possível desenhar o diagrama.\nDetalhe: " + e.message);
    }
  }

  // Uma conexão só existe com os dois equipamentos no diagrama. As exclusões já
  // levam os cabos junto; isto é a rede de segurança para qualquer outro caminho.
  function removerConexoesOrfas() {
    var ids = {};
    estado.equipamentos.forEach(function (eq) { ids[eq.id] = true; });
    var validas = estado.conexoes.filter(function (c) { return ids[c.de] && ids[c.para] && c.de !== c.para; });
    if (validas.length !== estado.conexoes.length) estado.conexoes = validas;
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

  // Direção do layout: lembrada neste navegador e aplicada na hora
  // (antes só valia no próximo "Organizar").
  try { if (/^(LR|TB|GRADE)$/.test(localStorage.getItem("grafo-direcao"))) selDirecao.value = localStorage.getItem("grafo-direcao"); } catch (e) {}
  selDirecao.addEventListener("change", function () {
    try { localStorage.setItem("grafo-direcao", selDirecao.value); } catch (e) {}
    if (estado.equipamentos.length) organizarDiagramaAutomaticamente();
  });

  btnCopiar.addEventListener("click", function () {
    if (!ultimoDot) return;
    try {
      navigator.clipboard.writeText(ultimoDot).then(function () { avisar("Código DOT copiado."); }, function () {});
      var original = btnCopiar.textContent;
      btnCopiar.textContent = "Copiado!";
      setTimeout(function () { btnCopiar.textContent = original; }, 1400);
    } catch (e) {}
  });

