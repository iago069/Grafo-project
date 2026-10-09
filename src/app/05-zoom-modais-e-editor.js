  // ==== 05-zoom-modais-e-editor.js: zoom, toque, barra lateral, modais e editor de equipamento/cabo (parte de assets/js/editor/app.js; npm run montar) ====
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

  // Roda do mouse: zoom em passos (~16%) que deslizam até o alvo, em torno do
  // cursor; giros rápidos acumulam. Pinça no touchpad (chega como ctrl+roda):
  // zoom contínuo quase imediato. Dois dedos no touchpad (deltas pequenos ou
  // horizontais, sem ctrl): move o diagrama, como nos editores de desenho.
  elCanvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    var escalaDelta = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    var dx = event.deltaX * escalaDelta, dy = event.deltaY * escalaDelta;
    var rect = elCanvas.getBoundingClientRect();
    var px = event.clientX - rect.left, py = event.clientY - rect.top;
    if (event.ctrlKey) {
      zoomSuave(Math.exp(-dy * 0.012), px, py, 0.55);
      return;
    }
    var rodaDeMouse = event.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(event.deltaY));
    if (rodaDeMouse) {
      zoomSuave(Math.min(1.6, Math.max(1 / 1.6, Math.exp(-dy * 0.0015))), px, py, 0.2);
      return;
    }
    pararCamera();
    canvasView.x -= dx;
    canvasView.y -= dy;
    agendarPan();
  }, { passive: false });

  // Pinça com dois dedos (tela de toque): zoom no ponto médio + arrasto.
  var toques = {};
  var pinca = null;
  function pontoMedio() {
    var ids = Object.keys(toques);
    var a = toques[ids[0]], b = toques[ids[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.pointerType !== "touch") return;
    toques[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (Object.keys(toques).length === 2) {
      canvasView.dragging = false; // a pinça assume no lugar do pan de um dedo
      elCanvas.classList.remove("panning");
      pararCamera();
      pinca = pontoMedio();
    }
  }, true);
  elCanvas.addEventListener("pointermove", function (event) {
    if (!toques[event.pointerId]) return;
    toques[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (!pinca || Object.keys(toques).length !== 2) return;
    var atual = pontoMedio();
    var rect = elCanvas.getBoundingClientRect();
    canvasView.x += atual.x - pinca.x;
    canvasView.y += atual.y - pinca.y;
    if (pinca.dist > 0) definirZoom(canvasView.scale * atual.dist / pinca.dist, atual.x - rect.left, atual.y - rect.top);
    agendarPan(); // o arrasto vale mesmo quando o zoom já está no limite
    pinca = atual;
  }, true);
  function fimDoToque(event) {
    delete toques[event.pointerId];
    if (Object.keys(toques).length < 2) pinca = null;
  }
  elCanvas.addEventListener("pointerup", fimDoToque, true);
  elCanvas.addEventListener("pointercancel", fimDoToque, true);

  // Área do canvas mudou de tamanho (painel da direita, lista, janela): mantém
  // o centro do diagrama no centro da área, em vez de ele escapar pela borda.
  if (window.ResizeObserver) {
    var tamanhoCanvasAnterior = null;
    new ResizeObserver(function () {
      var w = elCanvas.clientWidth, h = elCanvas.clientHeight;
      tamanhoAreaCanvas = { w: w, h: h };
      if (tamanhoCanvasAnterior && elCanvas.querySelector("svg") && (w !== tamanhoCanvasAnterior.w || h !== tamanhoCanvasAnterior.h)) {
        canvasView.x += (w - tamanhoCanvasAnterior.w) / 2;
        canvasView.y += (h - tamanhoCanvasAnterior.h) / 2;
        aplicarCanvasView();
      }
      tamanhoCanvasAnterior = { w: w, h: h };
    }).observe(elCanvas);
  }

  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    if (Object.keys(toques).length >= 2) return; // segundo dedo: é pinça, não pan
    canvasView.dragging = true;
    canvasView.startX = event.clientX;
    canvasView.startY = event.clientY;
    // Pegar o diagrama no meio de um zoom animado: para onde está e segue a mão.
    pararCamera();
    canvasView.originX = canvasView.x;
    canvasView.originY = canvasView.y;
    elCanvas.classList.add("panning");
    marcarInteracao();
    elCanvas.setPointerCapture(event.pointerId);
  });

  elCanvas.addEventListener("pointermove", function (event) {
    if (!canvasView.dragging) return;
    canvasView.x = canvasView.originX + event.clientX - canvasView.startX;
    canvasView.y = canvasView.originY + event.clientY - canvasView.startY;
    agendarPan();
  });

  function terminarPan(event) {
    if (!canvasView.dragging) return;
    canvasView.dragging = false;
    elCanvas.classList.remove("panning");
    marcarInteracao(); // tira a camada da GPU logo depois, para redesenhar nítido
    if (event && elCanvas.hasPointerCapture(event.pointerId)) elCanvas.releasePointerCapture(event.pointerId);
  }

  elCanvas.addEventListener("pointerup", terminarPan);
  elCanvas.addEventListener("pointercancel", terminarPan);
  document.getElementById("btnZoomIn").addEventListener("click", function () { zoomSuave(1.25); });
  document.getElementById("btnZoomOut").addEventListener("click", function () { zoomSuave(1 / 1.25); });
  document.getElementById("btnZoomReset").addEventListener("click", function () { ajustarATela(true); });

  // No celular a barra lateral vira um menu no topo: começa recolhida (só a
  // marca e o botão ☰), para o diagrama aparecer logo na primeira tela.
  var telaCelular = window.matchMedia("(max-width: 700px)");
  function definirSidebarRecolhida(recolhida) {
    elSidebar.classList.toggle("collapsed", recolhida);
    btnSidebarCollapse.textContent = telaCelular.matches ? (recolhida ? "☰" : "×") : (recolhida ? "›" : "‹");
    var rotulo = telaCelular.matches ? (recolhida ? "Abrir menu" : "Fechar menu") : (recolhida ? "Expandir barra lateral" : "Recolher barra lateral");
    btnSidebarCollapse.setAttribute("aria-label", rotulo);
    btnSidebarCollapse.setAttribute("aria-expanded", recolhida ? "false" : "true");
    btnSidebarCollapse.title = rotulo;
  }
  btnSidebarCollapse.addEventListener("click", function () {
    definirSidebarRecolhida(!elSidebar.classList.contains("collapsed"));
  });
  if (telaCelular.matches) definirSidebarRecolhida(true);
  var ouvirTela = function () { definirSidebarRecolhida(elSidebar.classList.contains("collapsed")); };
  if (telaCelular.addEventListener) telaCelular.addEventListener("change", ouvirTela);

  btnModoAvancado.addEventListener("click", function () {
    var fechado = elPainelDados.classList.toggle("painel-dados-oculto");
    elWorkspace.classList.toggle("modo-avancado-fechado", fechado);
    btnModoAvancado.classList.toggle("active", !fechado);
    btnModoAvancado.textContent = fechado ? "Editar em lista" : "Fechar lista";
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

    mostrarModalBackdrop(modalRef.backdrop);

    return new Promise(function (resolver) {
      modalRef.resolver = resolver;
    });
  }

  function fecharModal(valor) {
    esconderModal(modalRef.backdrop);
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
    mostrarModalBackdrop(editor.backdrop);
    var primeiro = form.querySelector("input, select");
    if (primeiro) { primeiro.focus(); if (primeiro.select) primeiro.select(); }
  }

  function fecharEditor() {
    esconderModal(editor.backdrop);
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
    campoEditor("editEquipMensagem").textContent = "";
    campoEditor("editEquipGrupo").value = eq.grupo || "";
    campoEditor("editEquipRede").value = eq.rede || "";
    selecionarOpcao(campoEditor("editEquipStatus"), eq.status || "ativo");
    campoEditor("editEquipIcone").innerHTML = '<option value="">— sem ícone —</option>' + CATALOGO_ICONES.map(function (icone) {
      return '<option value="' + escaparHtml(icone.valor) + '">' + escaparHtml(icone.nome) + '</option>';
    }).join("");
    selecionarOpcao(campoEditor("editEquipIcone"), eq.icone || "");
    campoEditor("editEquipCor").value = corValida(eq.corFonte, "#16323D");
    campoEditor("editEquipCorIconeOriginal").checked = !eq.corIcone;
    campoEditor("editEquipCorIcone").value = eq.corIcone || "#2E9E5B";
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
    campoEditor("editCaboPotencia").value = c.potencia || "";
    campoEditor("editCaboCor").value = corValida(c.cor, "#5A7284");
    campoEditor("editCaboGrossura").value = Number(c.grossura) || 2;
    selecionarOpcao(campoEditor("editCaboEstilo"), c.estilo || "solid");
    campoEditor("editCaboMensagem").textContent = "";
    var de = estado.equipamentos.find(function (eq) { return eq.id === c.de; });
    var para = estado.equipamentos.find(function (eq) { return eq.id === c.para; });
    mostrarEditor("Editar cabo" + (de && para ? ": " + (de.nome || de.id) + " → " + (para.nome || para.id) : ""), editor.formCabo);
  }

  campoEditor("editEquipIp").addEventListener("input", function (event) { event.target.setCustomValidity(""); });
  // Escolher uma cor já desmarca "Original".
  campoEditor("editEquipCorIcone").addEventListener("input", function () { campoEditor("editEquipCorIconeOriginal").checked = false; });

  editor.formEquip.addEventListener("submit", function (event) {
    event.preventDefault();
    var eq = editor.equipamento;
    if (!eq) return;
    var tipo = campoEditor("editEquipTipo").value.trim();
    // Tipo trocado com o ícone ainda no padrão do tipo antigo: segue o novo tipo.
    var icone = campoEditor("editEquipIcone").value;
    if (tipo !== (eq.tipo || "") && icone === (eq.icone || "") && icone === iconePorTipo(eq.tipo)) icone = iconePorTipo(tipo);
    var validacao = Esquema.validarEquipamento(Object.assign({}, eq, {
      nome: campoEditor("editEquipNome").value, tipo: tipo, icone: icone,
      modelo: campoEditor("editEquipModelo").value, ip: campoEditor("editEquipIp").value,
      grupo: campoEditor("editEquipGrupo").value, status: campoEditor("editEquipStatus").value,
      rede: campoEditor("editEquipRede").value,
      corFonte: campoEditor("editEquipCor").value,
      corIcone: campoEditor("editEquipCorIconeOriginal").checked ? "" : campoEditor("editEquipCorIcone").value
    }));
    if (!validacao.ok) { campoEditor("editEquipMensagem").textContent = textoDosErros(validacao.erros); return; }
    Object.assign(eq, validacao.dados);
    fecharEditor();
    renderTudo();
  });

  editor.formCabo.addEventListener("submit", function (event) {
    event.preventDefault();
    var c = editor.conexao;
    if (!c) return;
    var de = campoEditor("editCaboDe").value;
    var para = campoEditor("editCaboPara").value;
    var validacao = Esquema.validarConexao(Object.assign({}, c, {
      de: de, para: para, saida: campoEditor("editCaboSaida").value, chegada: campoEditor("editCaboChegada").value,
      tipo: campoEditor("editCaboTipo").value, potencia: campoEditor("editCaboPotencia").value, cor: campoEditor("editCaboCor").value,
      grossura: campoEditor("editCaboGrossura").value, estilo: campoEditor("editCaboEstilo").value
    }), estado.equipamentos.map(function (eq) { return eq.id; }));
    if (!validacao.ok) { campoEditor("editCaboMensagem").textContent = textoDosErros(validacao.erros); return; }
    // Trocou as pontas: o arraste manual do cabo antigo não vale mais.
    if (de !== c.de || para !== c.para) { delete c.deslocamento; delete validacao.dados.deslocamento; }
    Object.assign(c, validacao.dados);
    fecharEditor();
    renderTudo();
    avisarPortaEmUso(c);
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

