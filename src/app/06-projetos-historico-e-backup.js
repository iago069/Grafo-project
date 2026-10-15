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
    racks: { titulo: "Bayface de Racks", exportacao: "Bayface de racks" }
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
    if (painel && modoJaMostrado) { painel.classList.remove("trocando-modo"); void painel.offsetWidth; painel.classList.add("trocando-modo"); }
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
    fecharNovoProjeto();
    salvarLocal();
    projetos[nome] = { equipamentos: [], conexoes: [], modo: modo };
    projetoAtual = nome;
    estado = clonarDados(projetos[nome]);
    historicoDesfazer = [];
    historicoRefazer = [];
    ultimoEstadoHistorico = JSON.stringify(estado);
    salvarLocal();
    renderProjetos();
    renderTudo();
    limparDiagrama();
    avisar("Projeto \"" + nome + "\" criado (" + MODOS_DIAGRAMA[modo].titulo + ").");
  });

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

