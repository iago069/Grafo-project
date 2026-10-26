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
    var recolher = !elSidebar.classList.contains("collapsed");
    if (recolher) fecharPaineisLaterais(); // recolhida não deixa formulário aberto
    definirSidebarRecolhida(recolher);
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
    // O foco não pode ficar no campo escondido: os atalhos do teclado parariam.
    if (modalRef.backdrop.contains(document.activeElement)) document.activeElement.blur();
    if (modalRef.resolver) {
      var resposta = valor;
      // Pergunta com texto: Cancelar (ou Esc) responde null, não o que foi digitado.
      if (modalRef.mode === "prompt") {
        resposta = valor === false || valor == null ? null : modalRef.input.value.trim();
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
    campoEditor("editEquipGateway").value = eq.gateway || "";
    campoEditor("editEquipMascara").value = eq.mascara || "";
    selecionarOpcao(campoEditor("editEquipStatus"), eq.status || "ativo");
    campoEditor("editEquipIcone").innerHTML = '<option value="">— sem ícone —</option>' + CATALOGO_ICONES.map(function (icone) {
      return '<option value="' + escaparHtml(icone.valor) + '">' + escaparHtml(icone.nome) + '</option>';
    }).join("");
    selecionarOpcao(campoEditor("editEquipIcone"), eq.icone || "");
    campoEditor("editEquipCor").value = corValida(eq.corFonte, "#16323D");
    campoEditor("editEquipCorIconeOriginal").checked = !eq.corIcone;
    campoEditor("editEquipCorIcone").value = eq.corIcone || "#2E9E5B";
    // Outro diagrama que abre pelo selo ↗ do equipamento.
    var outros = Object.keys(projetos).filter(function (n) { return n !== projetoAtual; }).sort();
    if (eq.diagrama && outros.indexOf(eq.diagrama) < 0) outros.unshift(eq.diagrama);
    campoEditor("editEquipDiagrama").innerHTML = '<option value="">— nenhum —</option>' + outros.map(function (n) { return '<option value="' + escaparHtml(n) + '">' + escaparHtml(n) + "</option>"; }).join("");
    campoEditor("editEquipDiagrama").value = eq.diagrama || "";
    campoEditor("editEquipPotenciaDbm").value = eq.potenciaDbm != null ? eq.potenciaDbm : "";
    mostrarEditor("Editar equipamento", editor.formEquip);
  }

  // ---- Ficha do equipamento ---------------------------------------------------
  // Texto pronto para colar (configuração, chamado, planilha):
  //   nome / Host / gateway / mask. A máscara sai do /24 do IP quando não foi
  //   preenchida; "/24" vira 255.255.255.0.
  function mascaraDoPrefixo(prefixo) {
    var n = Number(prefixo);
    if (!(n >= 0 && n <= 32)) return "";
    var partes = [];
    for (var i = 0; i < 4; i++) { var bits = Math.max(0, Math.min(8, n - i * 8)); partes.push(256 - Math.pow(2, 8 - bits)); }
    return partes.join(".");
  }
  // Tudo automático a partir do IP: sem /prefixo vale /24; o gateway é o primeiro
  // endereço útil da rede (ex.: 10.0.0.25/24 → 10.0.0.1). Gateway e máscara
  // preenchidos à mão no equipamento têm prioridade.
  function prefixoDaMascara(m) {
    if (/^\/?\d{1,2}$/.test(m)) return Number(m.replace("/", ""));
    var partes = m.split(".").map(Number), bits = 0;
    partes.forEach(function (o) { while (o & 128) { bits++; o = (o << 1) & 255; } });
    return partes.length === 4 ? bits : null;
  }
  function fichaDoEquipamento(eq) {
    var ip = String(eq.ip || "").trim(), barra = ip.indexOf("/");
    var host = barra >= 0 ? ip.slice(0, barra) : ip;
    var ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    var manual = String(eq.mascara || "").trim();
    var prefixo = manual ? prefixoDaMascara(manual) : barra >= 0 ? Number(ip.slice(barra + 1)) : 24;
    var mascara = ipv4 && prefixo != null ? mascaraDoPrefixo(prefixo) : manual;
    var gateway = String(eq.gateway || "").replace(/\/.*$/, "");
    if (!gateway && ipv4 && prefixo != null && prefixo < 31) {
      var n = host.split(".").reduce(function (a, o) { return a * 256 + Number(o); }, 0);
      var tamanho = Math.pow(2, 32 - prefixo), rede = n - (n % tamanho), gw = rede + 1;
      if (gw === n) gw = rede + tamanho - 2; // o próprio equipamento é o .1: usa o último útil
      gateway = [24, 16, 8, 0].map(function (d) { return Math.floor(gw / Math.pow(2, d)) % 256; }).join(".");
    }
    return "nome: " + (eq.nome || eq.id || "") + "\nHost: " + host + "\ngateway: " + gateway + "\nmask: " + mascara;
  }
  var fichaModal = document.getElementById("fichaModal");
  function abrirFicha(eq) {
    var campo = document.getElementById("fichaTexto");
    var lista = Array.isArray(eq) ? eq : [eq];
    campo.value = lista.map(fichaDoEquipamento).join("\n\n");
    campo.rows = Math.min(18, lista.length * 5);
    document.getElementById("fichaTitulo").textContent = lista.length > 1 ? "Fichas dos equipamentos (" + lista.length + ")" : "Ficha: " + (lista[0].nome || lista[0].id);
    mostrarModalBackdrop(fichaModal);
    campo.focus();
    campo.select();
  }
  function fecharFicha() {
    esconderModal(fichaModal);
    if (fichaModal.contains(document.activeElement)) document.activeElement.blur();
  }
  fichaModal.querySelectorAll("[data-ficha-fechar]").forEach(function (b) { b.addEventListener("click", fecharFicha); });
  fichaModal.addEventListener("click", function (e) { if (e.target === fichaModal) fecharFicha(); });
  fichaModal.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); fecharFicha(); } });
  fichaModal.querySelector("[data-ficha-copiar]").addEventListener("click", function () {
    var campo = document.getElementById("fichaTexto");
    function copiado() { avisar("Ficha copiada."); fecharFicha(); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(campo.value).then(copiado, function () { campo.select(); document.execCommand("copy"); copiado(); });
    } else { campo.select(); document.execCommand("copy"); copiado(); }
  });
  // Todos os equipamentos do diagrama de uma vez, para copiar e mandar.
  document.getElementById("btnFichas").addEventListener("click", function () {
    if (!estado.equipamentos.length) { avisar("Adicione equipamentos primeiro."); return; }
    abrirFicha(estado.equipamentos);
  });
  campoEditor("editEquipFicha").addEventListener("click", function () {
    var eq = editor.equipamento;
    if (!eq) return;
    // Mostra o que está nos campos agora, mesmo antes de salvar.
    abrirFicha(Object.assign({}, eq, { nome: campoEditor("editEquipNome").value, ip: campoEditor("editEquipIp").value,
      gateway: campoEditor("editEquipGateway").value, mascara: campoEditor("editEquipMascara").value }));
  });

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
    campoEditor("editCaboVlan").value = c.vlan || "";
    campoEditor("editCaboDistancia").value = c.distanciaKm != null ? c.distanciaKm : "";
    campoEditor("editCaboTrafegoEntrada").value = c.trafegoEntrada || "";
    campoEditor("editCaboTrafegoSaida").value = c.trafegoSaida || "";
    campoEditor("editCaboRedeVlan").value = c.redeVlan || "";
    campoEditor("editCaboNumSaida").value = c.numSaida || "";
    campoEditor("editCaboNumChegada").value = c.numChegada || "";
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
      gateway: campoEditor("editEquipGateway").value, mascara: campoEditor("editEquipMascara").value,
      corFonte: campoEditor("editEquipCor").value,
      corIcone: campoEditor("editEquipCorIconeOriginal").checked ? "" : campoEditor("editEquipCorIcone").value,
      diagrama: campoEditor("editEquipDiagrama").value,
      potenciaDbm: campoEditor("editEquipPotenciaDbm").value === "" ? null : campoEditor("editEquipPotenciaDbm").value
    }));
    if (!validacao.ok) { campoEditor("editEquipMensagem").textContent = textoDosErros(validacao.erros); return; }
    if (!validacao.dados.diagrama) { delete validacao.dados.diagrama; delete eq.diagrama; }
    if (validacao.dados.potenciaDbm == null) { delete validacao.dados.potenciaDbm; delete eq.potenciaDbm; }
    ["gateway", "mascara"].forEach(function (k) { if (!validacao.dados[k]) { delete validacao.dados[k]; delete eq[k]; } });
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
      grossura: campoEditor("editCaboGrossura").value, estilo: campoEditor("editCaboEstilo").value,
      vlan: campoEditor("editCaboVlan").value, redeVlan: campoEditor("editCaboRedeVlan").value,
      numSaida: campoEditor("editCaboNumSaida").value, numChegada: campoEditor("editCaboNumChegada").value,
      distanciaKm: campoEditor("editCaboDistancia").value === "" ? null : campoEditor("editCaboDistancia").value,
      trafegoEntrada: campoEditor("editCaboTrafegoEntrada").value, trafegoSaida: campoEditor("editCaboTrafegoSaida").value
    }), estado.equipamentos.map(function (eq) { return eq.id; }));
    if (!validacao.ok) { campoEditor("editCaboMensagem").textContent = textoDosErros(validacao.erros); return; }
    // Trocou as pontas: o arraste manual do cabo antigo não vale mais.
    if (de !== c.de || para !== c.para) { delete c.deslocamento; delete validacao.dados.deslocamento; delete c.rota; delete validacao.dados.rota; }
    // Campo da etiqueta apagado: não guarda texto vazio.
    ["vlan", "redeVlan", "numSaida", "numChegada", "trafegoEntrada", "trafegoSaida"].forEach(function (k) { if (!validacao.dados[k]) { delete validacao.dados[k]; delete c[k]; } });
    if (validacao.dados.distanciaKm == null) { delete validacao.dados.distanciaKm; delete c.distanciaKm; }
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
      // Exclui na hora; o aviso traz "Desfazer" (o histórico do Ctrl+Z guarda o antes).
      if (eq) {
        estado.equipamentos = estado.equipamentos.filter(function (item) { return item !== eq; });
        estado.conexoes = estado.conexoes.filter(function (item) { return item.de !== eq.id && item.para !== eq.id; });
      } else if (c) {
        estado.conexoes = estado.conexoes.filter(function (item) { return item !== c; });
      }
      renderTudo();
      avisar((eq ? nome + " excluído" : "Cabo excluído") + ".", { desfazer: true });
    });
  });
  editor.backdrop.addEventListener("click", function (event) {
    if (event.target === editor.backdrop) fecharEditor();
  });
  editor.backdrop.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.preventDefault(); fecharEditor(); }
  });

