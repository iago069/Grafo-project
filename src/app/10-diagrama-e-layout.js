  // ==== 10-diagrama-e-layout.js: geração do DOT, imagens no SVG, organizar/grade e renderização (parte de assets/js/editor/app.js; npm run montar) ====
  // Linhas de texto do cabeçalho do equipamento (acima do ícone), conforme o
  // modo do projeto. aplicarImagensNoSvg usa a quantidade para achar o ícone.
  //   Topologia: nome, modelo, tipo, IP.
  //   Redes: nome, IP (em destaque), VLAN / rede, tipo.
  //   Monitoramento: nome, tipo, IP.
  // ---- FTTH: sinal estimado em cada ponto da rede óptica ----------------------
  // Parte de cada OLT (potência de saída, padrão +5 dBm) e desce pelos cabos:
  // 0,35 dB/km de fibra, 0,5 dB por ligação (conectores/fusões) e a perda do
  // splitter na saída dele (1:2 3,7 · 1:4 7,3 · 1:8 10,5 · 1:16 13,7 · 1:32 17,1 · 1:64 20,5 dB).
  var PERDA_SPLITTER = { 2: 3.7, 4: 7.3, 8: 10.5, 16: 13.7, 32: 17.1, 64: 20.5 };
  var sinaisFtth = {};
  function razaoDoSplitter(eq) {
    var texto = [eq.tipo, eq.nome, eq.modelo].join(" ");
    if (!/split|divisor|cto|caixa/i.test(texto)) return 0;
    var m = /1\s*[:x\/]\s*(\d+)/i.exec(texto);
    return m && PERDA_SPLITTER[Number(m[1])] ? Number(m[1]) : 0;
  }
  function calcularSinaisFtth(dados) {
    var porId = {}, vizinhos = {}, sinal = {}, fila = [];
    dados.equipamentos.forEach(function (eq) { porId[eq.id] = eq; vizinhos[eq.id] = []; });
    dados.conexoes.forEach(function (c) {
      if (!vizinhos[c.de] || !vizinhos[c.para]) return;
      vizinhos[c.de].push({ id: c.para, km: Number(c.distanciaKm) || 0 });
      vizinhos[c.para].push({ id: c.de, km: Number(c.distanciaKm) || 0 });
    });
    dados.equipamentos.forEach(function (eq) {
      if (!/\bolt\b/i.test([eq.tipo, eq.nome].join(" "))) return;
      sinal[eq.id] = eq.potenciaDbm != null ? Number(eq.potenciaDbm) : 5;
      fila.push(eq.id);
    });
    var olts = {};
    fila.forEach(function (id) { olts[id] = true; });
    while (fila.length) {
      var u = fila.shift(), saida = sinal[u] - (olts[u] ? 0 : (PERDA_SPLITTER[razaoDoSplitter(porId[u])] || 0));
      vizinhos[u].forEach(function (v) {
        if (sinal[v.id] != null) return;
        sinal[v.id] = saida - v.km * 0.35 - 0.5;
        fila.push(v.id);
      });
    }
    var resultado = {};
    Object.keys(sinal).forEach(function (id) { if (!olts[id]) resultado[id] = Math.sign(sinal[id]) * Math.round(Math.abs(sinal[id]) * 10) / 10; });
    return resultado;
  }
  function corDoSinal(dbm) { return dbm >= -25 ? "#1E8E4E" : dbm >= -27 ? "#B7791F" : "#C53030"; }

  function linhasDoCabecalho(eq, modo) {
    function fonte(tamanho, cor, texto, opcoes) {
      opcoes = opcoes || {};
      var conteudo = escaparHtmlDot(texto);
      if (opcoes.negrito) conteudo = "<B>" + conteudo + "</B>";
      return '<FONT FACE="' + (opcoes.mono ? "Courier" : "Helvetica") + '" POINT-SIZE="' + tamanho + '" COLOR="' + cor + '">' + conteudo + '</FONT>';
    }
    var nome = fonte(11, "#14212B", eq.nome || eq.id, { negrito: true });
    var modelo = String(eq.modelo || "").trim();
    var tipo = fonte(8, "#405363", eq.tipo || "Equipamento");
    var ip = String(eq.ip || "").trim();
    var rede = String(eq.rede || "").trim();
    if (modo === "redes") {
      return [nome]
        .concat(ip ? [fonte(10, "#1F5F8B", ip, { mono: true, negrito: true })] : [])
        .concat(rede ? [fonte(9, "#6A3FB5", rede, { negrito: true })] : [])
        .concat([tipo]);
    }
    if (modo === "monitoramento") {
      return [nome, tipo].concat(ip ? [fonte(8, "#1F5F8B", ip, { mono: true })] : []);
    }
    if (modo === "ftth") {
      var dbm = sinaisFtth[eq.id];
      var linhaSinal = dbm != null ? [fonte(10, corDoSinal(dbm), (razaoDoSplitter(eq) ? "entrada " : "") + String(dbm).replace(".", ",") + " dBm", { negrito: true, mono: true })]
        : eq.potenciaDbm != null ? [fonte(9, "#1F5F8B", "saída +" + String(eq.potenciaDbm).replace(".", ",") + " dBm", { mono: true })] : [];
      return [nome, tipo].concat(linhaSinal);
    }
    return [nome]
      .concat(modelo ? [fonte(9, "#14212B", modelo)] : [])
      .concat([tipo])
      .concat(ip ? [fonte(8, "#1F5F8B", ip, { mono: true })] : []);
  }

  // Monitoramento: fundo claro na cor do status, atrás do "● ATIVO".
  var FUNDO_STATUS = { ativo: "#E3F5EA", manutencao: "#FBEFD5", offline: "#FBE1E4" };

  function gerarDot(dados, direcao) {
    var modo = modoAtual();
    sinaisFtth = modo === "ftth" ? calcularSinaisFtth(dados) : {};
    var contagemPortas = {};
    dados.equipamentos.forEach(function (eq) { contagemPortas[eq.id] = 0; });
    dados.conexoes.forEach(function (c) {
      if (contagemPortas[c.de] != null) contagemPortas[c.de]++;
      if (contagemPortas[c.para] != null) contagemPortas[c.para]++;
    });
    var maiorQtdPortas = Math.max.apply(null, [1].concat(Object.keys(contagemPortas).map(function (id) { return contagemPortas[id]; })));
    var ranksepAuto = Math.max(1.15, Math.min(4.5, 0.95 + maiorQtdPortas * 0.16), (larguraDoMaiorRotulo() + 80) / 72);
    // A grade parte do layout "LR" do Graphviz e depois reposiciona (posicionarEmGrade).
    var linhas = ["digraph G {", '  rankdir=' + (direcao === "TB" ? "TB" : "LR") + ';', '  splines=ortho;', '  concentrate=false;', '  overlap=false;', '  nodesep=0.7;', '  ranksep=' + ranksepAuto.toFixed(2) + ';', '  pad=0;', '  margin=0;', '  bgcolor="transparent";',
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
    // Estrela: a regra própria (colunas e linha de baixo) só vale para os cabos do
    // centro; nos ramos, que são camadas, vale a regra do Esquerda → Direita.
    var centrosDaEstrela = {}, grauPorId = {};
    if (direcao === "ESTRELA") {
      var vizinhosPorId = {};
      dados.conexoes.forEach(function (c) {
        if (c.de === c.para) return;
        (vizinhosPorId[c.de] = vizinhosPorId[c.de] || {})[c.para] = true;
        (vizinhosPorId[c.para] = vizinhosPorId[c.para] || {})[c.de] = true;
      });
      var maiorGrau = maiorNumeroDeVizinhos(dados);
      Object.keys(vizinhosPorId).forEach(function (id) {
        var grau = Object.keys(vizinhosPorId[id]).length;
        grauPorId[id] = grau;
        if (grau === maiorGrau || grau >= LIGACOES_PARA_ESTRELA) centrosDaEstrela[id] = true;
      });
    }
    // Cabo do centro da estrela: colunas (longe na horizontal) chegam pela
    // lateral; o que está no vão entre elas (a linha de baixo), por baixo/cima.
    function ladoNaEstrela(origem, destino, padrao, limite) {
      if (!origem || !destino || !posicaoValida(origem.posicao) || !posicaoValida(destino.posicao)) return padrao;
      var dx = destino.posicao.x - origem.posicao.x, dy = destino.posicao.y - origem.posicao.y;
      if (Math.abs(dx) >= limite || Math.abs(dy) < 1) return dx >= 0 ? "direita" : "esquerda";
      return dy > 0 ? "baixo" : "cima";
    }
    dados.conexoes.forEach(function (c, indice) {
      var de = equipamentoPorId[c.de], para = equipamentoPorId[c.para];
      var centro = direcao === "ESTRELA" ? (centrosDaEstrela[c.de] ? c.de : centrosDaEstrela[c.para] ? c.para : null) : null;
      var limite = centro ? limiteLateralDaEstrela(grauPorId[centro]) : 0;
      var direcaoDoCabo = direcao === "ESTRELA" ? "LR" : direcao;
      if (de) {
        var ladoSaida = centro ? ladoNaEstrela(de, para, padraoSaida, limite) : ladoVoltadoPara(de, para, padraoSaida, direcaoDoCabo);
        portasPorEquipamento[c.de][ladoSaida].push({ indice: indice, ponta: "inicio", lado: ladoSaida, nome: c.saida || "P1", outro: para });
      }
      if (para) {
        var ladoChegada = centro ? ladoNaEstrela(para, de, padraoChegada, limite) : ladoVoltadoPara(para, de, padraoChegada, direcaoDoCabo);
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

    // Portas de cima e de baixo ficam "em pé" (estreitas e altas); o nome é girado
    // depois de desenhar (girarNomesDasPortasEmPe), porque o Graphviz não gira texto.
    function celulaPorta(porta, layout, emPe) {
      var nome = escaparHtmlDot(limitarNomePorta(porta.nome));
      return '<TD BORDER="1" COLOR="' + CONFIG_PORTA.borda + '" BGCOLOR="' + CONFIG_PORTA.fundo + '" WIDTH="' + (emPe ? layout.alturaPorta : CONFIG_PORTA.largura) + '" HEIGHT="' + (emPe ? CONFIG_PORTA.largura : layout.alturaPorta) + '" FIXEDSIZE="TRUE" CELLPADDING="' + layout.padding + '" ALIGN="CENTER" VALIGN="MIDDLE"><FONT FACE="Helvetica" POINT-SIZE="' + layout.fonte + '" COLOR="' + CONFIG_PORTA.texto + '">' + nome + '</FONT></TD>';
    }

    function linhaEquipamento(eq) {
      var status = eq.status || "ativo";
      var corStatus = corPorStatus(status);
      var corFonte = corValida(eq.corFonte, "#16323D");
      var portas = portasPorEquipamento[eq.id];
      var layoutLateral = calcularLayoutPortas(Math.max(portas.esquerda.length, portas.direita.length));
      var layoutTopo = calcularLayoutPortas(Math.max(portas.cima.length, portas.baixo.length));

      // Portas laterais numa tabela interna: fica centralizada na coluna e
      // mantém a altura das portas (sem isso o Graphviz as estica até a altura
      // da área da imagem).
      function colunaPortas(lista) {
        if (!lista.length) return '<TD WIDTH="' + CONFIG_PORTA.largura + '"></TD>';
        // Tamanho travado (FIXEDSIZE): sem isto o Graphviz esticava a coluna até a
        // altura do equipamento e abria um vão entre as portas.
        return '<TD VALIGN="MIDDLE" WIDTH="' + CONFIG_PORTA.largura + '"><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0" FIXEDSIZE="TRUE" WIDTH="' + CONFIG_PORTA.largura + '" HEIGHT="' + lista.length * layoutLateral.alturaPorta + '">' +
          lista.map(function (p) { return '<TR>' + celulaPorta(p, layoutLateral) + '</TR>'; }).join("") +
          '</TABLE></TD>';
      }
      function tabelaPortasEmPe(lista) {
        return '<TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0" FIXEDSIZE="TRUE" WIDTH="' + lista.length * layoutTopo.alturaPorta + '" HEIGHT="' + CONFIG_PORTA.largura + '"><TR>' +
          lista.map(function (p) { return celulaPorta(p, layoutTopo, true); }).join("") + '</TR></TABLE>';
      }
      // Portas de cima/baixo coladas no equipamento: o texto que ficaria entre elas
      // e o ícone (nome em cima, status embaixo) vai para o lado direito delas. Uma
      // célula vazia do mesmo tamanho à esquerda mantém as portas centralizadas.
      function linhaPortasComTexto(lista, texto, largura, alinhamento) {
        return '<TR><TD COLSPAN="3"><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0"><TR>' +
          '<TD WIDTH="' + largura + '"></TD><TD>' + tabelaPortasEmPe(lista) + '</TD>' +
          '<TD WIDTH="' + largura + '" CELLPADDING="3" ALIGN="LEFT" VALIGN="' + alinhamento + '">' + texto + '</TD>' +
          '</TR></TABLE></TD></TR>';
      }
      var alturaPortasLaterais = Math.max(portas.esquerda.length, portas.direita.length) * layoutLateral.alturaPorta;
      var alturaMeio = Math.max(ALTURA_BASE_EQUIPAMENTO, alturaPortasLaterais);

      // Ordem das linhas = ordem em que o Graphviz desenha as portas:
      // cima, (cabeçalho), esquerda, direita, (status), baixo.
      var cabecalho = linhasDoCabecalho(eq, modo).join("<BR/>");
      var textoStatus = escaparHtmlDot(marcadorStatus(status) + " " + rotuloStatus(status));
      var htmlStatus = modo === "monitoramento"
        ? '<TABLE BORDER="0" CELLPADDING="4" STYLE="rounded" BGCOLOR="' + (FUNDO_STATUS[status] || FUNDO_STATUS.ativo) + '"><TR><TD><FONT FACE="Helvetica" POINT-SIZE="11" COLOR="' + corStatus + '"><B>' + textoStatus + '</B></FONT></TD></TR></TABLE>'
        : '<FONT FACE="Helvetica" POINT-SIZE="9" COLOR="' + corStatus + '"><B>' + textoStatus + '</B></FONT>';
      // Largura aproximada do texto (pt) para a célula ao lado das portas.
      var larguraCabecalho = Math.ceil(Math.max(
        String(eq.nome || eq.id).length * 7, String(eq.modelo || "").length * 5.5, String(eq.tipo || "").length * 5,
        String(eq.ip || "").length * 5, String(eq.rede || "").length * 5.5) + 8);
      var larguraStatus = Math.ceil(textoStatus.length * (modo === "monitoramento" ? 8 : 6.5) + 12);
      var infoPortas = portasRenderizadas[eq.id];
      infoPortas.cabecalhoAoLado = portas.cima.length > 0;
      infoPortas.statusAoLado = portas.baixo.length > 0;

      // Ordem dos textos = ordem em que o Graphviz desenha: portas de cima,
      // cabeçalho, portas laterais, portas de baixo e status (ou status antes
      // das portas de baixo, quando não há portas embaixo).
      var rotulo = '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">' +
        (portas.cima.length
          ? linhaPortasComTexto(portas.cima, cabecalho, larguraCabecalho, "BOTTOM")
          : '<TR><TD COLSPAN="3" CELLPADDING="3" ALIGN="CENTER">' + cabecalho + '</TD></TR>') +
        // Portas laterais e área do ícone num bloco só: se o nome ao lado das
        // portas de cima alargar o equipamento, a sobra fica por fora do bloco e
        // as portas laterais continuam coladas no ícone.
        '<TR><TD COLSPAN="3"><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0" FIXEDSIZE="TRUE" WIDTH="' + (2 * CONFIG_PORTA.largura + 88) + '" HEIGHT="' + alturaMeio + '"><TR>' + colunaPortas(portas.esquerda) +
        '<TD BORDER="0" CELLPADDING="0" WIDTH="88" HEIGHT="' + alturaMeio + '"></TD>' +
        colunaPortas(portas.direita) + '</TR></TABLE></TD></TR>' +
        (portas.baixo.length
          ? linhaPortasComTexto(portas.baixo, htmlStatus, larguraStatus, "TOP")
          : '<TR><TD COLSPAN="3" CELLPADDING="' + (modo === "monitoramento" ? 2 : 4) + '" ALIGN="CENTER">' + htmlStatus + '</TD></TR>') +
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
      var estiloCabo = c.estilo;
      // Monitoramento: cabo que chega a um equipamento offline fica vermelho e tracejado.
      if (modo === "monitoramento" && [c.de, c.para].some(function (id) { return equipamentoPorId[id] && equipamentoPorId[id].status === "offline"; })) {
        corConexao = corPorStatus("offline");
        estiloCabo = "dashed";
      }
      var estilo = estiloCabo && estiloCabo !== "solid" ? ', style="' + escapar(estiloCabo) + '"' : "";
      var portaDirecao = direcao === "TB" ? ', tailport="n", headport="s"' : ', tailport="e", headport="w"';
      var portas = ', tailport="out_' + indice + '", headport="in_' + indice + '"';
      if (direcao === "TB") portas = portaDirecao;
      if (direcao !== "TB") portas = portaDirecao;
      var capacidade = (c.potencia ? " · " + c.potencia : "") + (modo === "ftth" && c.distanciaKm != null ? " · " + String(c.distanciaKm).replace(".", ",") + " km" : "");
      var rotuloTexto = c.tipo ? c.tipo + capacidade : capacidade.replace(/^ · /, "");
      var rotulo = ' [id="edge_' + indice + '", label="' + escapar(rotuloTexto) + '", color="' + corConexao + '", fontcolor="#34495A", penwidth=' + Math.max(1, grossura) + estilo + portas + ']';
      linhas.push('  "' + escapar(c.de) + '" -> "' + escapar(c.para) + '"' + rotulo + ';');
    });
    linhas.push("}");
    return linhas.join("\n");
  }

  // Itens da legenda (tela e exportação): por tipo; no Monitoramento, a
  // contagem por status ("3 ativos", "1 offline").
  function itensDaLegenda(dados) {
    if (modoAtual() === "monitoramento") {
      var contagem = { ativo: 0, manutencao: 0, offline: 0 };
      dados.equipamentos.forEach(function (eq) { contagem[contagem[eq.status] != null ? eq.status : "ativo"]++; });
      return [["ativo", "ativo", "ativos"], ["manutencao", "em manutenção", "em manutenção"], ["offline", "offline", "offline"]].map(function (s) {
        var n = contagem[s[0]];
        return { cor: corPorStatus(s[0]), texto: n + " " + (n === 1 ? s[1] : s[2]), status: s[0] };
      });
    }
    var tipos = [];
    dados.equipamentos.forEach(function (eq) { var t = eq.tipo || "outro"; if (tipos.indexOf(t) < 0) tipos.push(t); });
    return tipos.map(function (t) { return { cor: corPorTipo(t), texto: t }; });
  }

  function atualizarLegenda(dados) {
    elLegenda.innerHTML = "";
    elLegenda.classList.toggle("legenda-status", modoAtual() === "monitoramento");
    itensDaLegenda(dados).forEach(function (item) {
      var span = document.createElement("span");
      if (item.status) span.setAttribute("data-status", item.status);
      var i = document.createElement("i"); i.style.background = item.cor;
      span.appendChild(i); span.appendChild(document.createTextNode(item.texto));
      // Quantidade de cada tipo (só na tela; a exportação usa itensDaLegenda).
      if (!item.status) {
        var n = dados.equipamentos.filter(function (eq) { return (eq.tipo || "outro") === item.texto; }).length;
        var b = document.createElement("b"); b.className = "legenda-qtd"; b.textContent = n;
        span.appendChild(b);
      }
      elLegenda.appendChild(span);
    });
  }

  // Nomes das portas de cima e de baixo, na vertical (lidos de baixo para cima).
  // Pela ordem do rótulo (gerarDot): os primeiros textos do nó são as portas de
  // cima e os últimos, as de baixo; as caixas com borda seguem portasRenderizadas.
  function girarNomesDasPortasEmPe(svgEl) {
    if (!svgEl) return;
    svgEl.querySelectorAll("g.node").forEach(function (no) {
      var info = portasRenderizadas[idEquipamentoDoNode(no)];
      if (!info || !(info.nCima || info.nBaixo)) return;
      var textos = Array.prototype.slice.call(no.querySelectorAll("text"));
      var caixas = Array.prototype.filter.call(no.querySelectorAll("polygon"), function (p) {
        var s = String(p.getAttribute("stroke") || "").toLowerCase();
        return s && s !== "none" && s !== "transparent";
      });
      var pares = [];
      for (var i = 0; i < info.nCima; i++) pares.push([textos[i], caixas[i]]);
      var fim = textos.length - (info.statusAoLado ? 1 : 0);
      for (var j = 1; j <= info.nBaixo; j++) pares.push([textos[fim - j], caixas[info.ordem.length - j]]);
      pares.forEach(function (par) {
        var texto = par[0], caixa = par[1];
        if (!texto || !caixa) return;
        var b;
        try { b = caixa.getBBox(); } catch (e) { return; }
        var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        var tamanho = parseFloat(texto.getAttribute("font-size")) || 9;
        texto.setAttribute("x", cx.toFixed(2));
        texto.setAttribute("y", (cy + tamanho * 0.35).toFixed(2));
        texto.setAttribute("text-anchor", "middle");
        texto.setAttribute("transform", "rotate(-90 " + cx.toFixed(2) + " " + cy.toFixed(2) + ")");
      });
    });
  }

  // Filtro SVG que dá o tom da cor ao ícone mantendo claros e escuros do desenho
  // (blend "color": matiz e saturação da cor, luminosidade da imagem). Um por cor.
  function filtroCorIcone(defs, cor) {
    var id = "tom-" + cor.slice(1).toLowerCase();
    if (defs.querySelector("#" + id)) return id;
    var ns = "http://www.w3.org/2000/svg";
    var filtro = document.createElementNS(ns, "filter");
    filtro.setAttribute("id", id);
    filtro.setAttribute("color-interpolation-filters", "sRGB");
    [["feFlood", { "flood-color": cor, result: "cor" }],
     ["feBlend", { in: "cor", in2: "SourceGraphic", mode: "color", result: "tom" }],
     ["feComposite", { in: "tom", in2: "SourceAlpha", operator: "in" }]].forEach(function (p) {
      var el = document.createElementNS(ns, p[0]);
      Object.keys(p[1]).forEach(function (k) { el.setAttribute(k, p[1][k]); });
      filtro.appendChild(el);
    });
    defs.appendChild(filtro);
    return id;
  }

  // Ícones do catálogo desenhados sem quadro em volta (os demais já têm um).
  var COR_MOLDURA_ICONE = "#57555A";
  var ICONES_SEM_MOLDURA = ["CONCENTRADOR-HOTSPOT.png", "CONVERSOR-FIBRA.png", "CONVERSOR-MIDIA.png", "CX.png", "DECODER.png",
    "DEMUX.png", "DIO.png", "DWDM.png", "MIKROTIK.png", "MUX.png", "NUVEM-VPLS.png", "NVR.png", "OLT.png", "ONU.svg",
    "POE.png", "SERVIDOR.svg", "SWITCH-POE.png", "UNIFI.png"];
  function iconeSemMoldura(icone) {
    var arquivo = String(icone || "").split(/[\/]/).pop();
    return ICONES_SEM_MOLDURA.indexOf(arquivo) >= 0;
  }

  function aplicarImagensNoSvg(dados) {
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) return;

    var porId = {};
    dados.equipamentos.forEach(function (eq) {
      var imagem = nomeAtualDaImagem(eq.imagem) || imagemDoIcone(eq.icone);
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
        g.querySelectorAll("[data-equip-img='1']").forEach(function (imagemAntiga) {
          imagemAntiga.remove();
        });

        var bboxNode = g.getBBox();
        // Pela ordem do rótulo (gerarDot): portas de cima, nome, modelo (se
        // houver), tipo, IP (se houver), portas laterais, status, portas de baixo.
        // Comparar pelo texto falhava quando uma porta tinha o mesmo nome do modelo.
        var textos = Array.prototype.slice.call(g.querySelectorAll("text"));
        var infoPortas = portasRenderizadas[id] || { nCima: 0, nBaixo: 0 };
        var linhasCabecalho = linhasDoCabecalho(equipamento, modoAtual()).length;
        var cabecalho = textos.slice(infoPortas.nCima, infoPortas.nCima + linhasCabecalho);
        var statusTexto = (infoPortas.statusAoLado ? textos[textos.length - 1] : textos[textos.length - 1 - infoPortas.nBaixo]) || null;

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

        // Ícone do catálogo sem moldura própria: ganha a mesma moldura do UPS/RPS
        // e o desenho encolhe para caber dentro dela.
        var moldura = null;
        if (!nomeAtualDaImagem(equipamento.imagem) && iconeSemMoldura(equipamento.icone)) {
          var traco = Math.max(1.5, tam * 0.045);
          moldura = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          moldura.setAttribute("data-equip-img", "1");
          moldura.setAttribute("class", "eq-moldura-icone");
          moldura.setAttribute("x", x + traco / 2);
          moldura.setAttribute("y", y + traco / 2);
          moldura.setAttribute("width", tam - traco);
          moldura.setAttribute("height", tam - traco);
          moldura.setAttribute("rx", tam * 0.04);
          moldura.setAttribute("fill", "none");
          moldura.setAttribute("stroke", COR_MOLDURA_ICONE);
          moldura.setAttribute("stroke-width", traco);
          moldura.setAttribute("pointer-events", "none");
          var interno = tam * 0.72;
          x += (tam - interno) / 2;
          y += (tam - interno) / 2;
          tam = interno;
        }

        var urlImagem = resolverUrlRelativa(origemImagem);
        var img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("data-equip-img", "1");
        // Na tela escura, o desenho do catálogo clareia (CSS); a imagem própria fica como veio.
        img.setAttribute("class", ehCatalogo && !nomeAtualDaImagem(equipamento.imagem) ? "eq-icone-catalogo" : "eq-icone-proprio");
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
        if (/^#[0-9a-f]{6}$/i.test(equipamento.corIcone || "")) img.setAttribute("filter", "url(#" + filtroCorIcone(defs, equipamento.corIcone) + ")");

        var primeiroTexto = g.querySelector("text");
        if (primeiroTexto) g.insertBefore(img, primeiroTexto);
        else g.appendChild(img);
        if (moldura) g.insertBefore(moldura, img);
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
    if (selDirecao.value === "LADO" && posicionarGruposLadoALado()) gerar();
    arrumarDepoisDeOrganizar(); // rotas à mão saem; notas e desenhos longe vêm para perto
    gerar();
  }

  // Arruma blocos {w, h} em prateleiras (linhas), testando larguras máximas e
  // ficando com a que deixa o conjunto maior na folha. Grava bl.x/bl.y; retorna {w, h}.
  function empacotarEmPrateleiras(blocos, proporcao, entre) {
    function empacotar(limite) {
      var x = 0, y = 0, alturaLinha = 0, largura = 0;
      blocos.forEach(function (bl) {
        if (x > 0 && x + bl.w > limite) { x = 0; y += alturaLinha + entre; alturaLinha = 0; }
        bl.x = x; bl.y = y;
        x += bl.w + entre;
        alturaLinha = Math.max(alturaLinha, bl.h);
        largura = Math.max(largura, x - entre);
      });
      return { w: largura, h: y + alturaLinha };
    }
    var maiorBloco = Math.max.apply(null, blocos.map(function (bl) { return bl.w; }));
    var somaLarguras = blocos.reduce(function (s, bl) { return s + bl.w + entre; }, 0);
    var melhor = null;
    for (var t = 0; t <= 32; t++) {
      var limite = maiorBloco + (somaLarguras - maiorBloco) * t / 32;
      var r = empacotar(limite);
      var custo = Math.max(r.w / proporcao, r.h);
      if (!melhor || custo < melhor.custo - 1e-6) melhor = { limite: limite, custo: custo };
    }
    return empacotar(melhor.limite);
  }

  // "Grupos lado a lado": cada grupo mantém o próprio layout em camadas (quem
  // liga em quem, como no Esquerda → Direita), mas os grupos são arrumados em
  // linhas na proporção da folha do PDF, em vez de um embaixo do outro. Com
  // muitos equipamentos o desenho deixa de ficar alto e estreito.
  // O Graphviz calcula o layout de cada grupo sozinho, com caixas do tamanho
  // exato de cada equipamento (medido no desenho atual, já com as portas).
  function posicionarGruposLadoALado() {
    var svg = elCanvas.querySelector("svg");
    if (!svg || !vizInstancia) return false;
    var tamanhos = {}, somaX = 0, somaY = 0, n = 0;
    estado.equipamentos.forEach(function (eq) {
      var node = obterNodePorId(svg, eq.id);
      var b;
      try { b = node && node.getBBox(); } catch (e) { b = null; }
      if (!b || !b.width) return;
      tamanhos[eq.id] = { w: b.width, h: b.height };
      if (centrosBase[eq.id]) { somaX += centrosBase[eq.id].x; somaY += centrosBase[eq.id].y; n++; }
    });
    if (!n) return false;

    var MARGEM = 18, ROTULO = 30, ENTRE_BLOCOS = 56;
    var blocos = [];
    nomesDosGrupos(estado).forEach(function (nome) {
      var membros = estado.equipamentos.filter(function (eq) { return String(eq.grupo || "").trim() === nome && tamanhos[eq.id]; });
      if (membros.length) blocos.push({ membros: membros, grupo: true });
    });
    var soltos = estado.equipamentos.filter(function (eq) { return !String(eq.grupo || "").trim() && tamanhos[eq.id]; });
    if (soltos.length) blocos.push({ membros: soltos, grupo: false });
    if (blocos.length < 2) return posicionarEmGrade(); // um grupo só: não há o que pôr lado a lado

    function aspas(t) { return '"' + String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    try {
      blocos.forEach(function (bl) {
        var ids = {};
        bl.membros.forEach(function (eq) { ids[eq.id] = true; });
        var linhas = ["digraph G {", "  rankdir=LR; nodesep=0.55; ranksep=1.3; splines=false; pad=0;",
          '  node [shape=box, fixedsize=true, label=""];'];
        bl.membros.forEach(function (eq) {
          var t = tamanhos[eq.id];
          linhas.push("  " + aspas(eq.id) + " [width=" + (t.w / 72).toFixed(3) + ", height=" + (t.h / 72).toFixed(3) + "];");
        });
        estado.conexoes.forEach(function (c) {
          if (ids[c.de] && ids[c.para] && c.de !== c.para) linhas.push("  " + aspas(c.de) + " -> " + aspas(c.para) + ";");
        });
        linhas.push("}");
        var json = JSON.parse(vizInstancia.renderString(linhas.join("\n"), { format: "json" }));
        var bb = String(json.bb || "0,0,0,0").split(",").map(Number); // pt, y para cima
        bl.centros = {};
        (json.objects || []).forEach(function (o) {
          if (!o.pos || !ids[o.name]) return;
          var p = String(o.pos).split(",").map(Number);
          // No SVG o y cresce para baixo: a origem do bloco é o canto de cima.
          bl.centros[o.name] = { x: p[0] - bb[0], y: bb[3] - p[1] };
        });
        bl.w = (bb[2] - bb[0]) + (bl.grupo ? 2 * MARGEM : 0);
        bl.h = (bb[3] - bb[1]) + (bl.grupo ? ROTULO + MARGEM : 0);
      });
    } catch (e) {
      console.error("Grupos lado a lado: falha no layout, usando a grade.", e);
      return posicionarEmGrade();
    }

    // Blocos mais altos primeiro: as prateleiras ficam mais parelhas.
    blocos.sort(function (a, b) { return b.h - a.h; });
    var pagina = tamanhoPaginaMm();
    var total = empacotarEmPrateleiras(blocos, pagina.w / pagina.h, ENTRE_BLOCOS);
    var origemX = somaX / n - total.w / 2, origemY = somaY / n - total.h / 2;
    blocos.forEach(function (bl) {
      var x0 = origemX + bl.x + (bl.grupo ? MARGEM : 0);
      var y0 = origemY + bl.y + (bl.grupo ? ROTULO : 0);
      bl.membros.forEach(function (eq) {
        var c = bl.centros[eq.id];
        if (!c) return;
        eq.posicao = { x: x0 + c.x, y: y0 + c.y };
        delete eq.deslocamento;
      });
    });
    return true;
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

  // Projeto "grande": algum equipamento com muitas ligações (um núcleo).
  var LIGACOES_PARA_ESTRELA = 5;
  // Espaço entre o centro e a primeira camada: cresce com os cabos que passam ali.
  function vaoDaEstrela(grau) { return 110 + Math.min(grau || 0, 24) * 5; }
  // Largura do maior nome de cabo ligado ao equipamento (texto "tipo · capacidade").
  function larguraDoMaiorRotulo(id) {
    var maior = 0;
    estado.conexoes.forEach(function (c) {
      if (id && c.de !== id && c.para !== id) return;
      var texto = [c.tipo, c.potencia].filter(Boolean).join(" · ");
      if (/^LAGs+aed+/i.test(c.tipo || "")) texto += " · 2×";
      maior = Math.max(maior, texto.length);
    });
    return Math.min(420, maior * 5.6);
  }
  // Distância horizontal a partir da qual o vizinho é de uma coluna (porta na
  // lateral do centro). Menor que a da coluna mais perto (meia largura do centro,
  // no mínimo 96, mais o vão) e maior que a metade da linha de baixo.
  function limiteLateralDaEstrela(grau) { return 96 + vaoDaEstrela(grau) * 0.75; }
  function maiorNumeroDeVizinhos(dados) {
    var vizinhos = {};
    dados.conexoes.forEach(function (c) {
      if (c.de === c.para) return;
      (vizinhos[c.de] = vizinhos[c.de] || {})[c.para] = true;
      (vizinhos[c.para] = vizinhos[c.para] || {})[c.de] = true;
    });
    return Object.keys(vizinhos).reduce(function (m, id) { return Math.max(m, Object.keys(vizinhos[id]).length); }, 0);
  }

  // Layout de fato usado: "Automático" vira estrela num projeto grande e
  // Esquerda → Direita nos demais.
  function direcaoEfetiva() {
    var valor = selDirecao.value;
    if (valor === "CENTRO") return "ESTRELA";
    if (valor === "AUTO") return maiorNumeroDeVizinhos(estado) >= LIGACOES_PARA_ESTRELA ? "ESTRELA" : "LR";
    return valor;
  }

  // "Centro (estrela)": o equipamento com mais ligações fica no meio; os
  // vizinhos dele se dividem em colunas à esquerda e à direita e numa linha
  // embaixo, e o que vem depois de cada vizinho segue para fora, em camadas.
  // Cada parte desligada do resto é arrumada assim, e as partes vão para
  // prateleiras na proporção da folha. Grava eq.posicao; false se não há o que medir.
  // Ordem natural de portas: xe-0/0/2 < xe-0/0/14 < et-0/0/1 (tipo, depois números).
  function compararPortas(a, b) {
    var pa = String(a).toLowerCase().match(/\d+|\D+/g) || [], pb = String(b).toLowerCase().match(/\d+|\D+/g) || [];
    for (var i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] === pb[i]) continue;
      var na = /^\d/.test(pa[i]), nb = /^\d/.test(pb[i]);
      if (na && nb) return Number(pa[i]) - Number(pb[i]);
      return pa[i] < pb[i] ? -1 : 1;
    }
    return pa.length - pb.length;
  }

  function posicionarEmEstrela() {
    var svg = elCanvas.querySelector("svg");
    if (!svg || !vizInstancia) return false;
    var tam = {}, somaX = 0, somaY = 0, n = 0;
    estado.equipamentos.forEach(function (eq) {
      var node = obterNodePorId(svg, eq.id);
      var b;
      try { b = node && node.getBBox(); } catch (e) { b = null; }
      if (!b || !b.width) return;
      tam[eq.id] = { w: b.width, h: b.height };
      if (centrosBase[eq.id]) { somaX += centrosBase[eq.id].x; somaY += centrosBase[eq.id].y; n++; }
    });
    if (!n) return false;

    var ordem = {}, vizinhos = {};
    estado.equipamentos.forEach(function (eq, i) { if (tam[eq.id]) { ordem[eq.id] = i; vizinhos[eq.id] = []; } });
    estado.conexoes.forEach(function (c) {
      if (!vizinhos[c.de] || !vizinhos[c.para] || c.de === c.para) return;
      if (vizinhos[c.de].indexOf(c.para) < 0) vizinhos[c.de].push(c.para);
      if (vizinhos[c.para].indexOf(c.de) < 0) vizinhos[c.para].push(c.de);
    });
    function porOrdem(a, b) { return ordem[a] - ordem[b]; }

    var ENTRE_PARTES = 90;
    function aspas(t) { return '"' + String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    // Layout em camadas (Graphviz) de um lado da estrela, a partir do centro.
    // Devolve { id: {x, y} } com o centro em (0, 0) e y para baixo.
    function camadasDoLado(centro, ids, rankdir, vao) {
      var dentro = {};
      ids.forEach(function (id) { dentro[id] = true; });
      // Vizinhos ligados entre si ficam lado a lado com portas viradas um para o
      // outro: precisam de mais espaço para os nomes das portas e dos cabos.
      var entreVizinhos = estado.conexoes.some(function (c) { return dentro[c.de] && dentro[c.para] && distancia[c.de] === distancia[c.para]; });
      var linhas = ["digraph G {", "  rankdir=" + rankdir + "; nodesep=" + (entreVizinhos ? "2.4" : "0.95") + "; ranksep=" + (vao / 72).toFixed(2) + "; splines=false; pad=0;",
        '  node [shape=box, fixedsize=true, label=""];', "  " + aspas(centro) + " [width=0.1, height=0.1];"];
      ids.forEach(function (id) {
        linhas.push("  " + aspas(id) + " [width=" + (tam[id].w / 72).toFixed(3) + ", height=" + (tam[id].h / 72).toFixed(3) + "];");
      });
      // Cabos sempre "para fora" (do mais perto do centro para o mais longe).
      var vistos = {};
      estado.conexoes.forEach(function (c) {
        var a = c.de, b = c.para;
        var aDentro = dentro[a] || a === centro, bDentro = dentro[b] || b === centro;
        if (!aDentro || !bDentro || a === b) return;
        if (distancia[a] > distancia[b]) { var t = a; a = b; b = t; }
        if (vistos[a + "\n" + b]) return;
        vistos[a + "\n" + b] = true;
        linhas.push("  " + aspas(a) + " -> " + aspas(b) + (distancia[a] === distancia[b] ? " [constraint=false]" : "") + ";");
      });
      linhas.push("}");
      var json = JSON.parse(vizInstancia.renderString(linhas.join("\n"), { format: "json" }));
      var bruto = {};
      (json.objects || []).forEach(function (o) {
        if (!o.pos) return;
        var p = String(o.pos).split(",").map(Number);
        bruto[o.name] = { x: p[0], y: -p[1] };
      });
      var c0 = bruto[centro] || { x: 0, y: 0 };
      var r = {};
      ids.forEach(function (id) { if (bruto[id]) r[id] = { x: bruto[id].x - c0.x, y: bruto[id].y - c0.y }; });
      // Cada camada alinhada pela borda voltada para o centro (o Graphviz centraliza
      // pela largura, e nomes compridos deixavam a coluna torta).
      var eixo = rankdir === "TB" ? "y" : "x", sinal = rankdir === "RL" ? -1 : 1;
      var borda = {};
      ids.forEach(function (id) {
        if (!r[id]) return;
        var meio = (eixo === "x" ? tam[id].w : tam[id].h) / 2;
        var d = distancia[id];
        borda[d] = Math.min(borda[d] == null ? Infinity : borda[d], sinal * r[id][eixo] - meio);
      });
      ids.forEach(function (id) {
        if (!r[id]) return;
        var meio = (eixo === "x" ? tam[id].w : tam[id].h) / 2;
        r[id][eixo] = sinal * (borda[distancia[id]] + meio);
      });
      return r;
    }

    var restantes = Object.keys(vizinhos);
    var blocos = [], distancia = {};
    while (restantes.length) {
      // Centro da parte: o mais ligado (empate: o que vem primeiro na lista).
      var centro = restantes.slice().sort(function (a, b) { return vizinhos[b].length - vizinhos[a].length || porOrdem(a, b); })[0];
      var visto = {}, fila = [centro];
      visto[centro] = true;
      distancia[centro] = 0;
      while (fila.length) {
        var atual = fila.shift();
        vizinhos[atual].forEach(function (v) { if (!visto[v]) { visto[v] = true; distancia[v] = distancia[atual] + 1; fila.push(v); } });
      }
      restantes = restantes.filter(function (id) { return !visto[id]; });

      // Ramos: o que continua ligado entre si sem passar pelo centro fica junto
      // (ex.: conversores que chegam no mesmo DIO).
      var ramoDe = {}, ramos = [];
      // Vizinhos na ordem das portas do centro (xe-0/0/14 antes de xe-0/0/33):
      // as colunas seguem a mesma ordem das portas e os cabos não se cruzam.
      var portaNoCentro = {};
      estado.conexoes.forEach(function (c) {
        var outro = c.de === centro ? c.para : c.para === centro ? c.de : null;
        if (!outro) return;
        var porta = c.de === centro ? c.saida : c.chegada;
        if (porta && (portaNoCentro[outro] == null || compararPortas(porta, portaNoCentro[outro]) < 0)) portaNoCentro[outro] = porta;
      });
      function porPorta(a, b) {
        var pa = portaNoCentro[a], pb = portaNoCentro[b];
        if (pa && pb) return compararPortas(pa, pb) || porOrdem(a, b);
        return pa ? -1 : pb ? 1 : porOrdem(a, b);
      }
      vizinhos[centro].slice().sort(porPorta).forEach(function (raiz) {
        if (ramoDe[raiz] != null) return;
        var ramo = [], pilha = [raiz];
        ramoDe[raiz] = ramos.length;
        while (pilha.length) {
          var id = pilha.pop();
          ramo.push(id);
          vizinhos[id].forEach(function (v) { if (v !== centro && ramoDe[v] == null) { ramoDe[v] = ramos.length; pilha.push(v); } });
        }
        ramos.push(ramo);
      });

      // Divide os ramos: embaixo só com muitos (cerca de 1/5); o resto
      // equilibrado entre esquerda e direita pelo número de equipamentos.
      var lados = { esquerda: [], direita: [], baixo: [] };
      var carga = { esquerda: 0, direita: 0, baixo: 0 };
      var pesos = ramos.length >= 10 ? { direita: 0.4, esquerda: 0.4, baixo: 0.2 } : { direita: 0.5, esquerda: 0.5 };
      ramos.map(function (ramo, i) { return { ramo: ramo, i: i }; })
        .sort(function (a, b) { return b.ramo.length - a.ramo.length || a.i - b.i; })
        .forEach(function (item) {
          var melhor = null;
          Object.keys(pesos).forEach(function (lado) {
            var custo = (carga[lado] + item.ramo.length) / pesos[lado];
            if (!melhor || custo < melhor.custo - 1e-9) melhor = { lado: lado, custo: custo };
          });
          lados[melhor.lado].push(item);
          carga[melhor.lado] += item.ramo.length;
        });
      function idsDoLado(lado) {
        return lados[lado].sort(function (a, b) { return a.i - b.i; }).reduce(function (t, item) { return t.concat(item.ramo); }, []);
      }

      // O vão entre o centro e as colunas precisa caber o maior nome de cabo.
      var vao = Math.max(vaoDaEstrela(vizinhos[centro].length), larguraDoMaiorRotulo(centro) + 90);
      var limite = limiteLateralDaEstrela(vizinhos[centro].length);
      var metadeW = tam[centro].w / 2, metadeH = tam[centro].h / 2;
      var pos = {};
      pos[centro] = { x: 0, y: 0 };
      var alturaColunas = 0;
      try {
        // A linha de baixo precisa caber no vão entre as colunas (é o que dá a
        // porta embaixo do centro, ladoNaEstrela); o que não cabe vai para os lados.
        var pb = null, idsBaixo, minX, maxX, pertoY;
        while ((idsBaixo = idsDoLado("baixo")).length) {
          pb = camadasDoLado(centro, idsBaixo, "TB", vao);
          minX = Infinity; maxX = -Infinity; pertoY = Infinity;
          idsBaixo.forEach(function (id) {
            minX = Math.min(minX, pb[id].x - tam[id].w / 2); maxX = Math.max(maxX, pb[id].x + tam[id].w / 2);
            pertoY = Math.min(pertoY, pb[id].y - tam[id].h / 2);
          });
          if ((maxX - minX) / 2 <= limite - 10) break;
          var sobra = lados.baixo.pop();
          var lado = carga.esquerda < carga.direita ? "esquerda" : "direita";
          lados[lado].push(sobra);
          carga[lado] += sobra.ramo.length;
          pb = null;
        }
        [["direita", "LR", 1], ["esquerda", "RL", -1]].forEach(function (cfg) {
          var ids = idsDoLado(cfg[0]);
          if (!ids.length) return;
          var p = camadasDoLado(centro, ids, cfg[1], vao);
          var minY = Infinity, maxY = -Infinity, perto = Infinity;
          ids.forEach(function (id) {
            minY = Math.min(minY, p[id].y - tam[id].h / 2); maxY = Math.max(maxY, p[id].y + tam[id].h / 2);
            perto = Math.min(perto, cfg[2] * p[id].x - tam[id].w / 2);
          });
          var meio = (minY + maxY) / 2, alt = maxY - minY;
          alturaColunas = Math.max(alturaColunas, alt);
          // Coluna centrada no centro, com a borda de dentro a um vão dele.
          ids.forEach(function (id) { pos[id] = { x: p[id].x + cfg[2] * (metadeW + vao - perto), y: p[id].y - meio }; });
        });
        if (pb) {
          var meioX = (minX + maxX) / 2;
          // Embaixo, na altura em que as colunas terminam (no vão entre elas).
          var topo = Math.max(metadeH + vao * 0.6, alturaColunas / 2 - 20);
          idsBaixo.forEach(function (id) { pos[id] = { x: pb[id].x - meioX, y: pb[id].y + (topo - pertoY) }; });
        }
      } catch (e) {
        console.error("Centro (estrela): falha no layout, usando a grade.", e);
        return posicionarEmGrade();
      }

      var bl = { ids: Object.keys(pos), pos: pos };
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      bl.ids.forEach(function (id) {
        var p = pos[id], t = tam[id];
        minX = Math.min(minX, p.x - t.w / 2); maxX = Math.max(maxX, p.x + t.w / 2);
        minY = Math.min(minY, p.y - t.h / 2); maxY = Math.max(maxY, p.y + t.h / 2);
      });
      bl.minX = minX; bl.minY = minY; bl.w = maxX - minX; bl.h = maxY - minY;
      blocos.push(bl);
    }

    // A parte principal primeiro; as soltas vão em prateleiras ao lado/abaixo.
    blocos.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
    var pagina = tamanhoPaginaMm();
    var total = blocos.length > 1 ? empacotarEmPrateleiras(blocos, pagina.w / pagina.h, ENTRE_PARTES) : (blocos[0].x = 0, blocos[0].y = 0, { w: blocos[0].w, h: blocos[0].h });
    var origemX = somaX / n - total.w / 2, origemY = somaY / n - total.h / 2;
    blocos.forEach(function (bl) {
      bl.ids.forEach(function (id) {
        var eq = estado.equipamentos[ordem[id]];
        eq.posicao = { x: origemX + bl.x + bl.pos[id].x - bl.minX, y: origemY + bl.y + bl.pos[id].y - bl.minY };
        delete eq.deslocamento;
      });
    });
    return true;
  }

  window.organizarDiagramaAutomaticamente = organizarDiagramaAutomaticamente;
  window.GrafoCores = corPorTipo;

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
    // Janela do próprio Grafo (no lugar do prompt/confirm do navegador): { title, message, kind: "prompt"|"confirm", defaultValue, confirmText }.
    janela: function (opcoes) { return abrirModal(opcoes); },
    // Paleta de comandos (comandos.js): abrir o editor de um equipamento e trocar de projeto.
    editarEquipamento: function (id) { var eq = estado.equipamentos.find(function (e) { return e.id === id; }); if (eq) abrirEditorEquipamento(eq); return !!eq; },
    idDoNo: function (no) { return idEquipamentoDoNode(no); },
    redesenhar: function () { solicitarAtualizacaoDiagrama(); },
    trocarProjeto: function (nome) { var sel = document.getElementById("projetoSelect"); if (!sel || !projetos[nome]) return false; sel.value = nome; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; },
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
    // Usados por racks.js (Bayface de Racks). As regras físicas ficam no esquema,
    // que também valida o projeto ao abrir, importar e sincronizar.
    racksDoProjeto: function () {
      return { racks: clonarDados(estado.racks || []), cabos: clonarDados(estado.cabosRack || []) };
    },
    salvarRacks: function (racks, cabos) {
      var r = Esquema.validarRacksDoProjeto(racks, cabos);
      if (!r.ok) return r;
      estado.racks = r.dados.racks;
      estado.cabosRack = r.dados.cabos;
      renderTudo();
      return r;
    },
    // Documentos antigos guardados no projeto (biblioteca.js os migra para a Biblioteca).
    documentosDoProjeto: function () { return clonarDados(estado.documentos || []); },
    salvarDocumentos: function (lista) {
      var r = Esquema.validarProjeto({ equipamentos: [], conexoes: [], documentos: lista }, "estrito");
      if (!r.ok) return r;
      estado.documentos = r.dados.documentos || [];
      renderTudo();
      return r;
    },
    equipamentosDoDiagrama: function () {
      return estado.equipamentos.map(function (eq) { return { id: eq.id, nome: eq.nome, tipo: eq.tipo || "", modelo: eq.modelo || "" }; });
    },
    bibliotecasPdf: async function () {
      var JsPdf = await carregarJsPdf();
      await carregarSvg2Pdf();
      return JsPdf;
    },
    baixarArquivo: function (blob, nome) { baixarBlob(blob, nome); },
    mostrarErro: function (texto, detalhes) { mostrarErro(texto, detalhes); },
    // Usados por integracao.js (NetBox + agente).
    // Cria um projeto novo com os dados de um POP. Retorna o nome, ou null se recusado.
    importarProjetoExterno: function (dados, origem) {
      var resultado = Esquema.validarProjeto(dados, "estrito");
      if (!resultado.ok) { mostrarErrosDeValidacao(origem, resultado); return null; }
      if (Object.keys(projetos).length >= LIMITES.projetos) {
        mostrarErro("Não foi possível importar: o limite é de " + LIMITES.projetos + " projetos. Exclua algum antes.");
        return null;
      }
      var nomeValido = Esquema.validarNomeProjeto(dados.projeto || "");
      var base = nomeValido.ok ? nomeValido.dados : "POP importado";
      var nome = base;
      for (var i = 2; projetos[nome]; i++) nome = base.slice(0, LIMITES.nomeProjeto - 5) + " (" + i + ")";
      salvarLocal();
      projetos[nome] = resultado.dados;
      abrirProjeto(nome);
      salvarLocal();
      mostrarAvisosDaImportacao(origem, resultado);
      return nome;
    },
    ipsDoProjeto: function () {
      return estado.equipamentos.map(function (eq) { return (eq.ip || "").split("/")[0]; }).filter(Boolean);
    },
    // mapa: { ip: { online } }. Equipamento em manutenção não muda. Retorna quantos mudaram.
    atualizarStatusOnline: function (mapa) {
      var mudou = 0;
      estado.equipamentos.forEach(function (eq) {
        var r = mapa[(eq.ip || "").split("/")[0]];
        if (!r || eq.status === "manutencao") return;
        var novo = r.online ? "ativo" : "offline";
        if (eq.status !== novo) { eq.status = novo; mudou++; }
      });
      if (mudou) renderTudo();
      return mudou;
    },
    // Usado por historico.js: volta o projeto para uma versão guardada. Entra no
    // desfazer como um passo (Ctrl+Z volta para como estava antes de restaurar).
    restaurarDados: function (nome, dados) {
      if (nome !== projetoAtual) {
        // Projeto excluído que volta pelo histórico: recriado com o mesmo nome.
        if (!projetos[nome]) { projetos[nome] = projetoVazio(); renderProjetos(); }
        abrirProjeto(nome);
      }
      var r = Esquema.validarProjeto(dados, "reparar");
      estado = clonarDados(r.dados);
      selecao = {};
      ajustarNaProximaRenderizacao = true;
      renderTudo();
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
      return r.ajustes.length;
    },
    // Usados por primeiros-passos.js.
    // Abre o projeto e a janela do equipamento (QR code das etiquetas). false se não achar.
    mostrarEquipamento: function (projeto, id) {
      if (projeto && projeto !== projetoAtual) {
        if (!projetos[projeto]) return false;
        abrirProjeto(projeto);
        elProjetoSelect.value = projeto;
      }
      var eq = estado.equipamentos.find(function (item) { return item.id === id; });
      if (!eq) return false;
      abrirEditorEquipamento(eq);
      return true;
    },
    carregarJsPdf: function () { return carregarJsPdf(); },
    // O que o editor pode precisar depois de aberto, para guardar no aparelho e
    // funcionar sem internet: gerador de PDF, ícones dos equipamentos e a cópia
    // embutida deles (exportação).
    arquivosParaGuardar: function () {
      var icones = CATALOGO_ICONES.map(function (item) { return item.arquivo; });
      return [URL_JSPDF, URL_SVG2PDF, "./assets/js/editor/icones-embutidos.js"].concat(icones);
    },
    resumoAtual: function () { return { equipamentos: estado.equipamentos.length, conexoes: estado.conexoes.length }; },
    carregarExemplo: function () { carregarExemplo(); },
    // Abre um formulário da barra lateral ("navAddEquip" ou "navAddCable"),
    // expandindo o menu antes, se estiver recolhido (celular).
    abrirPainelLateral: function (id) {
      var painel = document.getElementById(id);
      var item = document.querySelector('.nav-item[data-nav-panel="' + id + '"]');
      if (!painel || !item) return;
      if (elSidebar.classList.contains("collapsed")) definirSidebarRecolhida(false);
      // Seção do menu fechada pelo título (interface.js): abre antes.
      var secao = item.closest(".nav-section");
      if (secao && secao.classList.contains("fechada")) secao.querySelector(".nav-label").click();
      fecharPaineisLaterais();
      painel.classList.add("open");
      item.classList.add("active");
      if (id === "navAddCable") renderSidebarPanels();
      item.scrollIntoView({ behavior: "smooth", block: "start" });
      var campo = painel.querySelector("input, select");
      if (campo) setTimeout(function () { campo.focus({ preventScroll: true }); }, 350);
    },
    abrirPdf: function () {
      abrirPainelPagina(true);
      if (telaCelular.matches) elPainelPagina.scrollIntoView({ behavior: "smooth", block: "start" });
    },
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

  // Entrada do diagrama ao abrir, importar ou organizar: os equipamentos surgem em
  // sequência e os cabos se desenham. Edições pequenas não animam (só redesenham).
  var movimentoReduzido = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var timerRevelar = null;
  function revelarDiagrama() {
    var svg = elCanvas.querySelector("svg");
    if (!svg || movimentoReduzido.matches) return;
    svg.querySelectorAll("g.node").forEach(function (no, i) { no.style.setProperty("--i", Math.min(i, 30)); });
    svg.querySelectorAll("g.edge").forEach(function (aresta, i) {
      aresta.style.setProperty("--i", Math.min(i, 40));
      aresta.querySelectorAll("path").forEach(function (caminho) {
        try { caminho.style.setProperty("--len", Math.ceil(caminho.getTotalLength()) + 1); } catch (e) {}
      });
    });
    svg.classList.add("revelando");
    clearTimeout(timerRevelar);
    timerRevelar = setTimeout(function () { svg.classList.remove("revelando"); }, 2600);
  }

  // Passar o mouse num equipamento acende os cabos dele e os vizinhos; o resto esmaece.
  function ativarFocoAoPassar() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var arestasPorEquip = {};
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var c = conexaoDaAresta(aresta);
      if (!c) return;
      (arestasPorEquip[c.de] = arestasPorEquip[c.de] || []).push({ aresta: aresta, outro: c.para });
      (arestasPorEquip[c.para] = arestasPorEquip[c.para] || []).push({ aresta: aresta, outro: c.de });
    });
    var nosPorEquip = {};
    svg.querySelectorAll("g.node").forEach(function (no) { var id = idEquipamentoDoNode(no); if (id) nosPorEquip[id] = no; });
    function limpar() {
      svg.classList.remove("focando");
      svg.querySelectorAll(".foco, .vizinho, .ligado").forEach(function (el) { el.classList.remove("foco", "vizinho", "ligado"); });
    }
    Object.keys(nosPorEquip).forEach(function (id) {
      var no = nosPorEquip[id];
      no.addEventListener("pointerenter", function (ev) {
        if (ev.buttons || svg.classList.contains("revelando")) return;
        limpar();
        var ligacoes = arestasPorEquip[id] || [];
        if (!ligacoes.length) return;
        svg.classList.add("focando");
        no.classList.add("foco");
        ligacoes.forEach(function (l) {
          l.aresta.classList.add("ligado");
          if (nosPorEquip[l.outro]) nosPorEquip[l.outro].classList.add("vizinho");
        });
      });
      no.addEventListener("pointerleave", limpar);
      no.addEventListener("pointerdown", limpar);
    });
  }
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
    // Ninguém tem posição (projeto importado ou "Organizar"): é a hora do layout inicial.
    var semPosicoes = estado.equipamentos.every(function (eq) { return !posicaoValida(eq.posicao); });

    try {
      renderizarSvg();
      // Equipamento novo só ganha posição depois de renderizado; renderiza de
      // novo para as portas dele irem para o lado certo.
      if (sincronizarPosicoes()) { renderizarSvg(); sincronizarPosicoes(); }
      // Estrela: duas rodadas, porque as portas mudam de lado (e o tamanho das
      // caixas muda) depois da primeira.
      if (semPosicoes && direcaoEfetiva() === "ESTRELA") {
        for (var passo = 0; passo < 2 && posicionarEmEstrela(); passo++) { renderizarSvg(); sincronizarPosicoes(); }
      }
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
      desenharDesenhos(); // formas, textos e caneta (10-desenho-e-ferramentas.js)
      desenharAnotacoes(); // antes do viewBox: as anotações também contam na área do desenho
      ajustarViewBoxAoConteudo(false);
      var revelarAgora = ajustarNaProximaRenderizacao;
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
      ativarSelecaoDosCabos();
      ativarLigacaoPeloMouse();
      ativarFocoAoPassar();
      if (revelarAgora) revelarDiagrama();
      aplicarBusca();
      aplicarCaminho();
      aplicarImagensNoSvg(estado);
      girarNomesDasPortasEmPe(elCanvas.querySelector("svg"));
      desenharLinksDeDiagrama();
      aplicarCamadas();
      atualizarLegenda(estado);
      btnCopiar.disabled = false;
      btnBaixar.disabled = false;
      btnBaixarPng.disabled = false;
      if (idFocado) {
        var noFocado = obterNodePorId(elCanvas.querySelector("svg"), idFocado);
        // Devolver o foco não é "clicar" no equipamento: não mexe na seleção.
        if (noFocado) {
          focoPorCliqueComModificador = true;
          try { noFocado.focus({ preventScroll: true }); } finally { focoPorCliqueComModificador = false; }
        }
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
    var dot = gerarDot(estado, direcaoEfetiva());
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
  try { if (/^(AUTO|CENTRO|LR|TB|GRADE|LADO)$/.test(localStorage.getItem("grafo-direcao"))) selDirecao.value = localStorage.getItem("grafo-direcao"); } catch (e) {}
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

