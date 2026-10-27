  // ==== 06-projetos-historico-e-backup.js: projetos, desfazer/refazer, exportar/importar e lembrete de backup (parte de assets/js/editor/app.js; npm run montar) ====
  function clonarDados(dados) { return JSON.parse(JSON.stringify(dados)); }
  function projetoVazio() { return { equipamentos: [], conexoes: [] }; }

  // O que foi corrigido ao carregar os dados salvos (mostrado depois da 1ª renderização).
  var ajustesAoCarregar = [];

  function carregarProjetos() {
    ajustesAoCarregar = [];
    try {
      var salvo = JSON.parse(localStorage.getItem(window.GrafoAuth.storageKey("grafo-projetos")) || "null");
      if (salvo && typeof salvo === "object" && !Array.isArray(salvo) && Object.keys(salvo).length) {
        var projetosSanitizados = {};
        var nomes = Object.keys(salvo);
        if (nomes.length > LIMITES.projetos) {
          ajustesAoCarregar.push({ onde: "Projetos", mensagem: "máximo de " + LIMITES.projetos + " projetos — os excedentes não foram carregados" });
          nomes = nomes.slice(0, LIMITES.projetos);
        }
        // Os dados salvos passam pelas mesmas regras da importação, no modo que
        // corrige em vez de recusar: um dado estragado não trava o app.
        nomes.forEach(function (nomeBruto) {
          var nomeValido = Esquema.validarNomeProjeto(nomeBruto);
          var nome = nomeValido.ok ? nomeValido.dados : String(nomeBruto).trim().slice(0, LIMITES.nomeProjeto) || "Projeto sem nome";
          var baseNome = nome.slice(0, LIMITES.nomeProjeto - 5);
          for (var n = 2; projetosSanitizados[nome]; n++) nome = baseNome + " (" + n + ")";
          if (!nomeValido.ok) ajustesAoCarregar.push({ onde: 'Projeto "' + nome + '"', mensagem: "nome: " + nomeValido.mensagem + " — corrigido" });
          var projeto = salvo[nomeBruto];
          if (projeto && typeof projeto === "object" && Array.isArray(projeto.equipamentos)) projeto.equipamentos.forEach(migrarImagensAntigas);
          var r = Esquema.validarProjeto(projeto, "reparar");
          r.ajustes.forEach(function (a) { ajustesAoCarregar.push({ onde: (nomes.length > 1 ? nome + " › " : "") + a.onde, mensagem: a.mensagem }); });
          projetosSanitizados[nome] = r.dados;
        });
        if (Object.keys(projetosSanitizados).length) {
          // "diagrama-estado" é o formato antigo (um projeto só), já migrado para
          // "grafo-projetos"; apagar libera espaço no localStorage.
          localStorage.removeItem(window.GrafoAuth.storageKey("diagrama-estado"));
          return projetosSanitizados;
        }
      }
    } catch (e) {}
    var legado = carregarLocal();
    if (legado && Array.isArray(legado.equipamentos) && legado.equipamentos.length) {
      legado.equipamentos.forEach(migrarImagensAntigas);
      var r = Esquema.validarProjeto(legado, "reparar");
      ajustesAoCarregar = ajustesAoCarregar.concat(r.ajustes);
      return { "Projeto principal": r.dados };
    }
    return { "Projeto principal": projetoVazio() };
  }
  // semHistorico: salva sem criar entrada no desfazer (para dados que o próprio
  // app recalcula, como as posições depois de renderizar).
  function salvarLocal(semHistorico) {
    try {
      var estadoAtual = JSON.stringify(estado);
      // Mudança feita pelo usuário (não só posições recalculadas ao redesenhar).
      if (!semHistorico && ultimoEstadoHistorico && ultimoEstadoHistorico !== estadoAtual) {
        registrarAlteracao(projetoAtual);
        atualizarLembreteBackup();
      }
      if (!semHistorico && !aplicandoHistorico && ultimoEstadoHistorico && ultimoEstadoHistorico !== estadoAtual) {
        historicoDesfazer.push(JSON.parse(ultimoEstadoHistorico));
        if (historicoDesfazer.length > 50) historicoDesfazer.shift();
        historicoRefazer = [];
      }
      ultimoEstadoHistorico = estadoAtual;
      btnDesfazer.disabled = historicoDesfazer.length === 0;
      btnRefazer.disabled = historicoRefazer.length === 0;
      projetos[projetoAtual] = clonarDados(estado);
      localStorage.setItem(window.GrafoAuth.storageKey("grafo-projetos"), JSON.stringify(projetos));
      localStorage.setItem(window.GrafoAuth.storageKey("grafo-projeto-atual"), projetoAtual);
    } catch (e) {
      var cheio = e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
      if (cheio) {
        mostrarErro("Não foi possível salvar: o espaço do navegador para projetos está cheio.\n" +
          "Remova imagens enviadas ou projetos antigos e use \"Exportar projeto (.json)\" para guardar uma cópia local.");
      }
    }
    window.GrafoAuth.scheduleSave(projetos, projetoAtual);
    // Avisa outros módulos (compartilhar.js) que o projeto pode ter mudado.
    document.dispatchEvent(new CustomEvent("grafo:alterado"));
  }
  // Projetos salvos antes da correção dos nomes das imagens (MIROTIK/RTIFICADOR)
  // e de os ícones .jpeg virarem .png sem fundo.
  function migrarImagensAntigas(eq) {
    if (!eq || typeof eq !== "object") return eq;
    ["icone", "imagem"].forEach(function (campo) {
      if (typeof eq[campo] !== "string" || /^data:/i.test(eq[campo])) return;
      eq[campo] = nomeAtualDaImagem(eq[campo].replace(/MIROTIK\.(png|jpeg)$/i, "MIKROTIK.png").replace(/RTIFICADOR\.jpeg$/i, "RETIFICADOR.jpeg"));
    });
    return eq;
  }
  function carregarLocal() { try { var s = localStorage.getItem(window.GrafoAuth.storageKey("diagrama-estado")); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function salvarTema(t) { try { localStorage.setItem("diagrama-tema", t); } catch (e) {} }
  function carregarTema() { try { return localStorage.getItem("diagrama-tema"); } catch (e) { return null; } }

  // Projetos de equipe (equipe.js) aparecem com 👥 na lista.
  function ehProjetoDeEquipe(nome) { return !!(window.GrafoEquipe && window.GrafoEquipe.ehEquipe(nome)); }

  function renderProjetos() {
    elProjetoSelect.innerHTML = Object.keys(projetos).map(function (nome) {
      var rotulo = (ehProjetoDeEquipe(nome) ? "👥 " : "") + nome;
      return '<option value="' + escaparHtml(nome) + '"' + (nome === projetoAtual ? " selected" : "") + '>' + escaparHtml(rotulo) + '</option>';
    }).join("");
    atualizarLembreteBackup();
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
    if (estado.modo) exemplo.modo = estado.modo;
    estado = exemplo;
    ajustarNaProximaRenderizacao = true;
    renderTudo();
  }

  function mostrarEstadoVazio() {
    elCanvas.innerHTML =
      '<div class="estado-vazio">' +
        // Ilustração: três equipamentos se ligando (cabos desenhando, LEDs piscando).
        '<svg class="vazio-ilustra" viewBox="0 0 220 120" aria-hidden="true">' +
          '<path class="vi-cabo" d="M58 60 C85 60 85 30 110 30"/><path class="vi-cabo vi-c2" d="M58 60 C85 60 85 90 110 90"/><path class="vi-cabo vi-c3" d="M150 30 C170 30 170 60 180 60"/>' +
          '<rect class="vi-eq" x="14" y="44" width="44" height="32" rx="7"/><rect class="vi-eq vi-e2" x="110" y="16" width="40" height="28" rx="7"/>' +
          '<rect class="vi-eq vi-e3" x="110" y="76" width="40" height="28" rx="7"/><rect class="vi-eq vi-e4 vi-tracejado" x="180" y="46" width="30" height="28" rx="7"/>' +
          '<circle class="vi-led" cx="26" cy="60" r="2.5"/><circle class="vi-led vi-l2" cx="120" cy="30" r="2.5"/><circle class="vi-led vi-l3" cx="120" cy="90" r="2.5"/>' +
          '<path class="vi-mais" d="M195 54v12M189 60h12"/>' +
        '</svg>' +
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
    solicitarPrevia();
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
    contagemAnterior = null; // trocar de projeto não é "chegar ao limite"
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

  // ---- Modo do projeto (tipo de diagrama) ------------------------------------
  // Muda o que os equipamentos mostram (gerarDot), a legenda, a ordem dos tipos
  // sugeridos e o título da exportação. Projeto sem "modo" é Topologia.
  var MODOS_DIAGRAMA = {
    topologia: { titulo: "Topologia", exportacao: "Topologia de rede" },
    redes: { titulo: "Diagrama de redes", exportacao: "Diagrama de redes" },
    monitoramento: { titulo: "Monitoramento", exportacao: "Diagrama de monitoramento" },
    // Disposição física dos racks (recursos/racks.js); o diagrama lógico fica guardado.
    racks: { titulo: "Bayface de Racks", exportacao: "Bayface de racks" },
    // Rede óptica: sinal estimado em cada splitter, CTO e ONU (perdas de splitter, fibra e conectores).
    ftth: { titulo: "FTTH (rede óptica)", exportacao: "Rede FTTH" }
  };

  // Modelos prontos para começar um projeto (o Organizar arruma na primeira abertura).
  function eqModelo(id, nome, tipo, extra) { return Object.assign({ id: id, nome: nome, tipo: tipo, icone: iconePorTipo(tipo), status: "ativo" }, extra || {}); }
  function caboModelo(de, para, saida, chegada, tipo, potencia, extra) { return Object.assign({ de: de, para: para, saida: saida, chegada: chegada, tipo: tipo, potencia: potencia }, extra || {}); }
  var MODELOS_PRONTOS = {
    pop: { modo: "topologia", dados: function () { return {
      equipamentos: [eqModelo("rb", "RB-BORDA", "RB / CCR", { ip: "10.0.0.1" }), eqModelo("sw", "SW-CORE", "Switch", { ip: "10.0.0.2" }),
        eqModelo("olt", "OLT-01", "OLT", { ip: "10.0.0.10" }), eqModelo("dio", "DIO-48F", "DIO"), eqModelo("nb", "NOBREAK", "Nobreak"), eqModelo("ret", "RETIFICADOR", "Retificador")],
      conexoes: [caboModelo("rb", "sw", "sfp1", "sfp-sfpplus1", "Fibra", "10G"), caboModelo("sw", "olt", "sfp-sfpplus2", "uplink1", "Fibra", "10G"),
        caboModelo("olt", "dio", "pon1", "f1", "Fibra", "GPON"), caboModelo("ret", "olt", "48V", "PWR", "Energia", ""), caboModelo("nb", "sw", "saída 1", "PWR", "Energia", "")] }; } },
    datacenter: { modo: "topologia", dados: function () { return {
      equipamentos: [eqModelo("evpn", "CORE-EVPN", "Switch", { modelo: "Juniper QFX5120" }), eqModelo("l2", "CORE-L2", "Switch", { modelo: "Juniper" }),
        eqModelo("l3", "CORE-L3", "Switch", { modelo: "Juniper" }), eqModelo("bng", "BNG", "RB / CCR", { modelo: "Juniper MX204" }),
        eqModelo("cgnat", "CGNAT", "Servidor"), eqModelo("cdn", "CACHE CDN", "Servidor"), eqModelo("ix", "TRÂNSITO / IX", "Nuvem VPLS")],
      conexoes: [caboModelo("evpn", "l2", "et-0/0/30", "et-0/0/48", "LAG ae14 (CORE-L2)", "100G"), caboModelo("evpn", "l3", "et-0/0/6", "et-0/0/48", "CORE-L3", "100G"),
        caboModelo("evpn", "bng", "et-0/0/4", "et-0/0/0", "WAN BNG", "100G"), caboModelo("evpn", "cgnat", "et-0/0/14", "port 1", "LAG ae10 (CGNAT)", "40G"),
        caboModelo("evpn", "cgnat", "et-0/0/15", "port 2", "LAG ae10 (CGNAT)", "40G"), caboModelo("l2", "cdn", "xe-0/0/33", "eth0", "Cache CDN", "10G"),
        caboModelo("evpn", "ix", "et-0/0/11", "", "Trânsito IP", "100G")] }; } },
    ftth: { modo: "ftth", dados: function () {
      var eqs = [eqModelo("olt", "OLT-01", "OLT", { potenciaDbm: 5 }), eqModelo("sp1", "SPLITTER 1:8", "Splitter")], cabos = [caboModelo("olt", "sp1", "PON 1/1", "IN", "Fibra", "GPON", { distanciaKm: 2 })];
      ["A", "B", "C"].forEach(function (l, i) {
        eqs.push(eqModelo("cto" + l, "CTO-" + l + " 1:8", "CTO"));
        cabos.push(caboModelo("sp1", "cto" + l, "S" + (i + 1), "IN", "Fibra", "", { distanciaKm: 1 + i * 0.8 }));
        eqs.push(eqModelo("onu" + l, "CLIENTE " + l, "ONU"));
        cabos.push(caboModelo("cto" + l, "onu" + l, "P1", "PON", "Drop", "", { distanciaKm: 0.2 }));
      });
      return { equipamentos: eqs, conexoes: cabos }; } },
    // Rota 100G do PDF "ROTA FINAL 100G MAPA": nomes, IP, modelos, portas,
    // capacidades e distâncias como aparecem no PDF. Posições na mesma
    // distribuição do PDF; o mapa (malha municipal) é importado pelo usuário.
    // Pendências de revisão na nota do diagrama.
    rota100g: { modo: "topologia", dados: function () {
      var k = 2.4; // escala das posições (pixels do PDF → desenho)
      function eq(id, nome, municipio, modelo, x, y, extra) {
        return eqModelo(id, nome, "Switch", Object.assign({ modelo: modelo, municipio: municipio, posicao: { x: Math.round(x * k), y: Math.round(y * k) } }, extra || {}));
      }
      function cabo(de, para, saida, chegada, capacidade, km) {
        return caboModelo(de, para, saida, chegada, "Fibra", capacidade, { distanciaKm: km, grossura: capacidade === "100G" ? 4 : 2 });
      }
      return {
        subtitulo: "Rota final 100G · Ibirubá → Boqueirão do Leão",
        equipamentos: [
          eq("ibr", "POP-IBR01_DISTR-14 | Ibirubá - Coprel", "Ibirubá", "DM4270 48XS+4CX", 470, 230, { ip: "10.200.200.14" }),
          eq("qzn", "POP-QZN01_DISTR-13 | Quinze de Novembro - Cidade", "Quinze de Novembro", "NOVO DM4270-48XS-6CS", 512, 330),
          eq("fvz", "DISTRIBUICAO_FVZ_017", "Fortaleza dos Valos", "NOVO DM4270-48X-6C", 432, 378),
          eq("esq", "ESQ_GAUCHA_FV_101 | Fortaleza dos Valos - Esquina Gaúcha", "Fortaleza dos Valos", "NOVO DM4270 24X4C", 343, 460),
          eq("stj", "DISTRIBUICAO_STJ_121 | Salto do Jacuí - Sindicato", "Salto do Jacuí", "NOVO DM4270-48XS-6CS", 432, 572),
          eq("jacz", "POP-JACZ01_DISTR-136 | Jacuizinho - Cidade", "Jacuizinho", "NOVO DM4270-48XS-6CS", 548, 535),
          eq("ths03", "POP-THS03_DISTR-220 | Tunas - Sindicato", "Tunas", "DM4270 48XS+6CX", 632, 612),
          eq("ths01", "POP-THS01_DISTR-137 | Tunas - Cidade", "Tunas", "DM4370 4GT+4GX+4XS", 696, 570),
          eq("laa", "POP-LAA01_DISTR-221 | Lagoão - Torre", "Lagoão", "DM4270 48XS+6CX", 722, 682),
          eq("grxa", "POP-GRXA01_DISTR-232 | Gramado Xavier - Torre", "Gramado Xavier", "DM4270 48XS+6CX", 868, 720),
          eq("bql", "POP-BQL01_DISTR-3 | Boqueirão do Leão - Cidade", "Boqueirão do Leão", "DM4270 48XS+6CX", 982, 722)
        ],
        conexoes: [
          cabo("ibr", "qzn", "HE1/4", "HE1/2", "100G", 20),
          cabo("qzn", "fvz", "HE1/1", "HE1/2", "100G", 30),
          cabo("fvz", "esq", "HE1/1", "HE1/2", "100G", 16),
          cabo("esq", "stj", "HE1/1", "HE1/2", "100G", 26),
          cabo("stj", "jacz", "HE1/1", "HE1/2", "100G", 20),
          cabo("jacz", "ths03", "HE1/1", "HE1/2", "100G", 16),
          cabo("ths03", "ths01", "HE1/4", "GE1/4", "1G", 1),
          cabo("ths03", "laa", "HE1/3", "HE1/2", "100G", 15),
          cabo("laa", "grxa", "HE1/1", "HE1/2", "100G", 52),
          cabo("grxa", "bql", "HE1/1", "HE1/2", "100G", 20)
        ],
        anotacoes: [{ id: "revisar", x: Math.round(250 * k), y: Math.round(820 * k), cor: "#FFF3B0", texto:
          "Exemplo montado a partir do PDF ROTA FINAL 100G MAPA. REVISAR: modelos, a ordem das portas HE1/x em cada ponta e qual distância vai em cada trecho " +
          "(lidas na ordem do PDF). Mapa: Mapa de regiões → importe a malha municipal do RS (IBGE, pelo mapshaper) → Só com equipamentos → Pôr nos municípios." }]
      }; } }
  };
  var elModoDiagrama = document.getElementById("modoDiagrama");
  var modoNaTela = null, modoJaMostrado = false;
  // (Seguro mesmo antes de estas variáveis existirem: 00-catalogo chama cedo.)
  function modoAtual() { return MODOS_DIAGRAMA && estado && MODOS_DIAGRAMA[estado.modo] ? estado.modo : "topologia"; }
  // Chamado a cada renderTudo: só refaz o que depende do modo quando ele muda.
  function aplicarModoNaTela() {
    var modo = modoAtual();
    if (modo === modoNaTela) return;
    modoNaTela = modo;
    if (elModoDiagrama) elModoDiagrama.value = modo;
    document.body.setAttribute("data-modo-diagrama", modo);
    // Troca de tipo com transição (o painel entra de novo, suave). Não anima na abertura.
    var painel = document.querySelector(".render-panel");
    if (painel && modoJaMostrado) { painel.classList.remove("trocando-modo"); void painel.offsetWidth; painel.classList.add("trocando-modo"); clearTimeout(aplicarModoNaTela.t); aplicarModoNaTela.t = setTimeout(function () { painel.classList.remove("trocando-modo"); }, 600); }
    modoJaMostrado = true;
    ajustarLarguraDoSeletorDeModo();
    renderizarTiposSugeridos();
  }
  // O seletor tem a largura do texto escolhido. Chrome/Edge fazem isso pelo CSS
  // (field-sizing); no Firefox e no Safari ele teria a largura da opção mais
  // longa, com um vão antes da seta. Lá, mede o texto e ajusta.
  function ajustarLarguraDoSeletorDeModo() {
    if (!elModoDiagrama || (window.CSS && CSS.supports && CSS.supports("field-sizing", "content"))) return;
    var estilo = getComputedStyle(elModoDiagrama);
    var medida = document.createElement("span");
    medida.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" + estilo.font + ";letter-spacing:" + estilo.letterSpacing;
    medida.textContent = elModoDiagrama.options[elModoDiagrama.selectedIndex].text;
    document.body.appendChild(medida);
    var largura = medida.getBoundingClientRect().width + parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight) +
      parseFloat(estilo.borderLeftWidth) + parseFloat(estilo.borderRightWidth) + 2 +
      // Lista personalizável (base-select): a seta e o espaço antes dela ficam por dentro.
      (window.CSS && CSS.supports && CSS.supports("appearance", "base-select") ? 14 + (parseFloat(estilo.columnGap) || 0) : 0);
    medida.remove();
    elModoDiagrama.style.width = Math.ceil(largura) + "px";
  }
  // A fonte da página pode chegar depois: mede de novo quando ela carregar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarLarguraDoSeletorDeModo);
  if (elModoDiagrama) elModoDiagrama.addEventListener("change", function () {
    var modo = elModoDiagrama.value;
    if (!MODOS_DIAGRAMA[modo] || modo === modoAtual()) return;
    estado.modo = modo;
    renderTudo();
    avisar("Tipo de diagrama: " + MODOS_DIAGRAMA[modo].titulo + ".");
  });

  var novoProjeto = {
    backdrop: document.getElementById("novoProjetoModal"),
    form: document.getElementById("novoProjetoForm"),
    nome: document.getElementById("novoProjetoNome"),
    mensagem: document.getElementById("novoProjetoMensagem")
  };
  function fecharNovoProjeto() { esconderModal(novoProjeto.backdrop); }
  // Escolher um modelo já marca o tipo de diagrama dele.
  novoProjeto.form.addEventListener("change", function (event) {
    if (event.target.name !== "modeloProjeto" || !MODELOS_PRONTOS[event.target.value]) return;
    var radio = novoProjeto.form.querySelector('input[name="modoProjeto"][value="' + MODELOS_PRONTOS[event.target.value].modo + '"]');
    if (radio) radio.checked = true;
  });
  document.getElementById("btnNovoProjeto").addEventListener("click", function () {
    novoProjeto.form.reset();
    novoProjeto.mensagem.textContent = "";
    mostrarModalBackdrop(novoProjeto.backdrop);
    novoProjeto.nome.focus();
  });
  novoProjeto.backdrop.querySelectorAll("[data-novo-projeto-fechar]").forEach(function (b) { b.addEventListener("click", fecharNovoProjeto); });
  novoProjeto.backdrop.addEventListener("click", function (event) { if (event.target === novoProjeto.backdrop) fecharNovoProjeto(); });
  novoProjeto.backdrop.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fecharNovoProjeto(); } });
  novoProjeto.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var validacaoNome = Esquema.validarNomeProjeto(novoProjeto.nome.value);
    var erro = !validacaoNome.ok ? "Nome inválido: " + validacaoNome.mensagem + "."
      : projetos[validacaoNome.dados] ? "Já existe um projeto com esse nome."
      : Object.keys(projetos).length >= LIMITES.projetos ? "Limite de " + LIMITES.projetos + " projetos atingido. Exclua algum antes." : "";
    if (erro) { novoProjeto.mensagem.textContent = erro; novoProjeto.nome.focus(); return; }
    var nome = validacaoNome.dados;
    var escolhido = novoProjeto.form.querySelector('input[name="modoProjeto"]:checked');
    var modo = escolhido && MODOS_DIAGRAMA[escolhido.value] ? escolhido.value : "topologia";
    var modeloEscolhido = novoProjeto.form.querySelector('input[name="modeloProjeto"]:checked');
    var modelo = modeloEscolhido && MODELOS_PRONTOS[modeloEscolhido.value];
    fecharNovoProjeto();
    salvarLocal();
    projetos[nome] = modelo ? Object.assign(Esquema.validarProjeto(modelo.dados(), "reparar").dados, { modo: modelo.modo }) : { equipamentos: [], conexoes: [], modo: modo };
    if (modelo) modo = modelo.modo;
    projetoAtual = nome;
    estado = clonarDados(projetos[nome]);
    historicoDesfazer = [];
    historicoRefazer = [];
    ultimoEstadoHistorico = JSON.stringify(estado);
    salvarLocal();
    renderProjetos();
    if (modelo) { ajustarNaProximaRenderizacao = true; renderTudo(); }
    else { renderTudo(); limparDiagrama(); }
    avisar("Projeto \"" + nome + "\" criado (" + MODOS_DIAGRAMA[modo].titulo + (modelo ? ", a partir de um modelo" : "") + ").");
  });

  // ---- Renomear o projeto aberto ------------------------------------------------
  // Leva junto: links "Abre o diagrama" dos outros projetos, camadas escolhidas,
  // o livro da Biblioteca ligado a ele e, se for de equipe, o nome no servidor.
  async function renomearProjetoAtual() {
    var antigo = projetoAtual;
    var valor = await abrirModal({ title: "Renomear projeto", message: "Novo nome do projeto:", kind: "prompt", defaultValue: antigo, confirmText: "Renomear" });
    if (valor == null) return;
    var validacao = Esquema.validarNomeProjeto(valor);
    if (!validacao.ok) { avisar("Nome inválido: " + validacao.mensagem + "."); return; }
    var novo = validacao.dados;
    if (novo === antigo) return;
    if (projetos[novo]) { avisar("Já existe um projeto chamado “" + novo + "”."); return; }
    var equipe = window.GrafoEquipe;
    if (equipe && equipe.ehEquipe && equipe.ehEquipe(antigo)) {
      try { await equipe.renomear(antigo, novo); }
      catch (e) { avisar("Não foi possível renomear no servidor: " + (e.message || e)); return; }
    }
    salvarLocal(true);
    projetos[novo] = projetos[antigo];
    delete projetos[antigo];
    projetoAtual = novo;
    Object.keys(projetos).forEach(function (nome) {
      (projetos[nome].equipamentos || []).forEach(function (eq) { if (eq.diagrama === antigo) eq.diagrama = novo; });
    });
    estado.equipamentos.forEach(function (eq) { if (eq.diagrama === antigo) eq.diagrama = novo; });
    try {
      var camadas = localStorage.getItem("grafo-camadas:" + antigo);
      if (camadas) { localStorage.setItem("grafo-camadas:" + novo, camadas); localStorage.removeItem("grafo-camadas:" + antigo); }
    } catch (e) {}
    salvarLocal(true);
    renderProjetos();
    renderTudo();
    window.dispatchEvent(new CustomEvent("grafo:projeto-renomeado", { detail: { antigo: antigo, novo: novo } }));
    avisar("Projeto renomeado para “" + novo + "”.");
  }
  document.getElementById("btnRenomearProjeto").addEventListener("click", renomearProjetoAtual);

  // Tira um projeto da lista (excluído, ou a pessoa saiu da equipe) e abre outro.
  function removerProjetoDaLista(nome) {
    if (!projetos[nome]) return;
    delete projetos[nome];
    if (!Object.keys(projetos).length) projetos["Projeto principal"] = projetoVazio();
    if (projetoAtual === nome) {
      projetoAtual = Object.keys(projetos)[0];
      estado = clonarDados(projetos[projetoAtual]);
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      ajustarNaProximaRenderizacao = true;
      renderTudo();
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
    }
    salvarLocal(true);
    renderProjetos();
  }

  document.getElementById("btnExcluirProjeto").addEventListener("click", function () {
    // Projeto de equipe: o dono exclui para todos; os membros saem (equipe.js).
    if (ehProjetoDeEquipe(projetoAtual)) { window.GrafoEquipe.excluirOuSair(projetoAtual); return; }
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
      var excluido = projetoAtual;
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
      avisar("Projeto \"" + excluido + "\" excluído.");
    });
  });

  function exportarProjeto() {
    salvarLocal();
    var arquivoJson = { projeto: projetoAtual, equipamentos: estado.equipamentos, conexoes: estado.conexoes };
    if (estado.modo) arquivoJson.modo = estado.modo;
    // Sem isto o backup perdia as caixas de texto (Importar projeto já as aceita).
    if (estado.anotacoes && estado.anotacoes.length) arquivoJson.anotacoes = estado.anotacoes;
    var conteudo = JSON.stringify(arquivoJson, null, 2);
    var arquivo = projetoAtual.replace(/[^\wÀ-ſ-]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
    baixarBlob(new Blob([conteudo], { type: "application/json" }), "grafo-" + arquivo + ".json");
    registrarBackup(projetoAtual);
    avisar("Projeto exportado: grafo-" + arquivo + ".json");
  }

  document.getElementById("btnExportarProjeto").addEventListener("click", exportarProjeto);

  // Cópia de todos os projetos da conta num arquivo (LGPD: portabilidade).
  // "Importar projeto" reconhece o formato e traz todos de volta.
  var FORMATO_BACKUP = "grafo-backup";
  function exportarTodosProjetos() {
    salvarLocal();
    var hoje = new Date();
    var data = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
    var conteudo = JSON.stringify({ formato: FORMATO_BACKUP, versao: 1, exportadoEm: hoje.toISOString(), projetoAtual: projetoAtual, projetos: projetos }, null, 2);
    var nome = "grafo-todos-os-projetos-" + data + ".json";
    baixarBlob(new Blob([conteudo], { type: "application/json" }), nome);
    Object.keys(projetos).forEach(registrarBackup);
    avisar(plural(Object.keys(projetos).length, "projeto exportado", "projetos exportados") + ": " + nome);
  }
  document.getElementById("btnExportarTodos").addEventListener("click", exportarTodosProjetos);

  // Backup completo: valida todos antes de importar qualquer um.
  function importarBackupCompleto(bruto, nomeArquivo) {
    var origem = bruto.projetos && typeof bruto.projetos === "object" && !Array.isArray(bruto.projetos) ? bruto.projetos : null;
    var nomes = origem ? Object.keys(origem) : [];
    if (!nomes.length) { mostrarErro('Não foi possível importar "' + nomeArquivo + '": o backup não tem projetos.'); return; }
    var livres = LIMITES.projetos - Object.keys(projetos).length;
    if (nomes.length > livres) {
      mostrarErro("Não foi possível importar: o backup tem " + plural(nomes.length, "projeto", "projetos") + " e cabem só mais " + Math.max(0, livres) +
        " (limite de " + LIMITES.projetos + "). Exclua alguns antes.");
      return;
    }
    var validados = [], erros = [], ajustes = [];
    nomes.forEach(function (nomeBruto) {
      var projeto = origem[nomeBruto];
      if (projeto && Array.isArray(projeto.equipamentos)) projeto.equipamentos.forEach(migrarImagensAntigas);
      var r = Esquema.validarProjeto(projeto, "estrito");
      var nomeValido = Esquema.validarNomeProjeto(nomeBruto);
      var rotulo = nomeValido.ok ? nomeValido.dados : "Projeto importado";
      r.erros.forEach(function (e) { erros.push({ onde: rotulo + " › " + e.onde, mensagem: e.mensagem }); });
      r.ajustes.forEach(function (a) { ajustes.push({ onde: rotulo + " › " + a.onde, mensagem: a.mensagem }); });
      validados.push({ base: rotulo, dados: r.dados });
    });
    if (erros.length) { mostrarErrosDeValidacao('"' + nomeArquivo + '"', { ok: false, erros: erros, ajustes: ajustes }); return; }

    salvarLocal();
    var importados = [];
    validados.forEach(function (v) {
      var nome = v.base;
      for (var i = 2; projetos[nome]; i++) nome = v.base.slice(0, LIMITES.nomeProjeto - 5) + " (" + i + ")";
      projetos[nome] = v.dados;
      importados.push(nome);
    });
    abrirProjeto(importados[0]);
    salvarLocal();
    importados.forEach(registrarBackup);
    mostrarAvisosDaImportacao('"' + nomeArquivo + '"', { ok: true, erros: [], ajustes: ajustes });
    avisar(plural(importados.length, "projeto importado", "projetos importados") + ".");
  }

  // Ctrl+S (Cmd+S no Mac) exporta o projeto aberto em vez de "salvar a página".
  document.addEventListener("keydown", function (event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || String(event.key).toLowerCase() !== "s") return;
    event.preventDefault();
    exportarProjeto();
  });

  // ---- Lembrete de backup ---------------------------------------------------
  // A conta sincroniza os projetos. Esta informação local registra quando foi
  // feita uma exportação de backup independente da sincronização.
  var LEMBRETE_DIAS_ENTRE_BACKUPS = 7;
  var LEMBRETE_DIAS_SEM_BACKUP = 1;
  var DIA_MS = 24 * 60 * 60 * 1000;
  var elLembrete = document.getElementById("lembreteBackup");

  function lerInfoBackup() {
    try { return JSON.parse(localStorage.getItem(window.GrafoAuth.storageKey("grafo-backup")) || "{}") || {}; } catch (e) { return {}; }
  }
  function gravarInfoBackup(info) {
    try { localStorage.setItem(window.GrafoAuth.storageKey("grafo-backup"), JSON.stringify(info)); } catch (e) {}
  }

  function registrarBackup(nome) {
    var info = lerInfoBackup();
    info[nome] = { ultimo: Date.now(), pendenteDesde: null, adiadoAte: null };
    gravarInfoBackup(info);
    atualizarLembreteBackup();
  }

  function registrarAlteracao(nome) {
    var info = lerInfoBackup();
    var item = info[nome] || { ultimo: null, pendenteDesde: null, adiadoAte: null };
    if (item.pendenteDesde) return;
    item.pendenteDesde = Date.now();
    info[nome] = item;
    gravarInfoBackup(info);
  }

  function descreverDias(ms) {
    var dias = Math.floor(ms / DIA_MS);
    return dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : "há " + dias + " dias";
  }

  function atualizarLembreteBackup() {
    if (!elLembrete) return;
    var item = lerInfoBackup()[projetoAtual];
    var agora = Date.now();
    var mostrar = false, texto = "";
    if (item && item.pendenteDesde && estado.equipamentos.length && !(item.adiadoAte && item.adiadoAte > agora)) {
      if (item.ultimo && agora - item.ultimo >= LEMBRETE_DIAS_ENTRE_BACKUPS * DIA_MS) {
        mostrar = true;
        texto = "Último backup deste projeto: " + descreverDias(agora - item.ultimo) + ".";
      } else if (!item.ultimo && agora - item.pendenteDesde >= LEMBRETE_DIAS_SEM_BACKUP * DIA_MS) {
        mostrar = true;
        texto = "Este projeto ainda não tem backup.";
      }
    }
    elLembrete.classList.toggle("hidden", !mostrar);
    if (mostrar) elLembrete.querySelector("[data-lembrete-texto]").textContent = texto + " Os dados ficam só neste navegador.";
  }

  if (elLembrete) {
    elLembrete.querySelector("[data-lembrete-exportar]").addEventListener("click", exportarProjeto);
    elLembrete.querySelector("[data-lembrete-adiar]").addEventListener("click", function () {
      var info = lerInfoBackup();
      if (info[projetoAtual]) { info[projetoAtual].adiadoAte = Date.now() + DIA_MS; gravarInfoBackup(info); }
      atualizarLembreteBackup();
    });
  }

  document.getElementById("arquivoProjeto").addEventListener("change", function (event) {
    var arquivo = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var bruto;
      try { bruto = JSON.parse(leitor.result); }
      catch (e) { mostrarErro('Não foi possível importar "' + arquivo.name + '": o arquivo não é um JSON válido.', [{ onde: "JSON", mensagem: e.message }]); return; }
      if (bruto && bruto.formato === FORMATO_BACKUP) { importarBackupCompleto(bruto, arquivo.name); return; }
      if (bruto && Array.isArray(bruto.equipamentos)) bruto.equipamentos.forEach(migrarImagensAntigas);
      var resultado = Esquema.validarProjeto(bruto, "estrito");
      if (!resultado.ok) { mostrarErrosDeValidacao('"' + arquivo.name + '"', resultado); return; }
      if (Object.keys(projetos).length >= LIMITES.projetos) {
        mostrarErro("Não foi possível importar: o limite é de " + LIMITES.projetos + " projetos. Exclua algum antes.");
        return;
      }

      var nomeArquivo = bruto.projeto != null ? bruto.projeto : arquivo.name.replace(/\.json$/i, "");
      var nomeValido = Esquema.validarNomeProjeto(nomeArquivo);
      var base = nomeValido.ok ? nomeValido.dados : "Projeto importado";
      var nome = base;
      for (var i = 2; projetos[nome]; i++) nome = base.slice(0, LIMITES.nomeProjeto - 5) + " (" + i + ")";

      salvarLocal();
      // Sem ícone no arquivo: usa a foto do tipo (Switch, OLT, Servidor…), como no CSV.
      resultado.dados.equipamentos.forEach(function (eq) { if (!eq.icone && !eq.imagem) eq.icone = iconePorTipo(eq.tipo || eq.nome); });
      projetos[nome] = resultado.dados;
      abrirProjeto(nome);
      salvarLocal();
      // Veio de um arquivo: esse arquivo já é um backup do projeto.
      registrarBackup(nome);
      mostrarAvisosDaImportacao('"' + arquivo.name + '"', resultado);
      avisar("Projeto \"" + nome + "\" importado.");
    };
    leitor.readAsText(arquivo, "UTF-8");
  });

