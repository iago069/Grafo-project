  // ==== 04-busca-caminho-e-limpar.js: busca, rastrear caminho e limpar diagrama (parte de assets/js/app.js; npm run montar) ====
  // Busca por nome, IP ou modelo: destaca quem bate, apaga o resto.
  // Reaplicada a cada renderização, porque o SVG é recriado.
  var elBusca = document.getElementById("buscaEquip");
  var elBuscaResultado = document.getElementById("buscaResultado");
  var busca = { encontrados: [], atual: -1 };

  function equipamentoBateComBusca(eq, termo) {
    return [eq.nome, eq.ip, eq.modelo].some(function (valor) {
      return normalizarTextoEquipamento(valor).indexOf(termo) >= 0;
    });
  }

  function aplicarBusca() {
    var svg = elCanvas.querySelector("svg");
    var termo = normalizarTextoEquipamento(elBusca.value);
    busca.encontrados = [];
    if (svg) {
      svg.querySelectorAll("g.node, g.edge, g.cluster").forEach(function (el) {
        el.classList.remove("apagado", "encontrado", "encontrado-atual");
      });
    }
    elBuscaResultado.classList.remove("sem-resultado");
    if (!termo) { busca.atual = -1; elBuscaResultado.textContent = ""; return; }
    var ids = {};
    estado.equipamentos.forEach(function (eq) { if (equipamentoBateComBusca(eq, termo)) ids[eq.id] = true; });
    if (svg) {
      svg.querySelectorAll("g.node").forEach(function (node) {
        var id = idEquipamentoDoNode(node);
        if (!id) return;
        if (ids[id]) { node.classList.add("encontrado"); busca.encontrados.push(node); }
        else node.classList.add("apagado");
      });
      svg.querySelectorAll("g.edge").forEach(function (aresta) {
        var c = conexaoDaAresta(aresta);
        if (!c || !(ids[c.de] || ids[c.para])) aresta.classList.add("apagado");
      });
    }
    if (busca.atual >= busca.encontrados.length) busca.atual = -1;
    if (busca.atual >= 0) busca.encontrados[busca.atual].classList.add("encontrado-atual");
    if (!busca.encontrados.length) {
      elBuscaResultado.textContent = "nada encontrado";
      elBuscaResultado.classList.add("sem-resultado");
    } else {
      elBuscaResultado.textContent = (busca.atual >= 0 ? (busca.atual + 1) + " de " : "") + busca.encontrados.length + (busca.atual >= 0 ? "" : busca.encontrados.length === 1 ? " encontrado" : " encontrados");
    }
  }

  // Centraliza o resultado seguinte (passo 1) ou anterior (passo -1).
  function irParaResultado(passo) {
    if (!busca.encontrados.length) return;
    busca.atual = (busca.atual + passo + busca.encontrados.length) % busca.encontrados.length;
    aplicarBusca();
    if (canvasView.scale < 0.8) { canvasView.scale = 1; aplicarCanvasView(); }
    var alvo = busca.encontrados[busca.atual].getBoundingClientRect();
    var area = elCanvas.getBoundingClientRect();
    canvasView.x += (area.left + area.width / 2) - (alvo.left + alvo.width / 2);
    canvasView.y += (area.top + area.height / 2) - (alvo.top + alvo.height / 2);
    aplicarCanvasView();
  }

  // Rastrear caminho: menor sequência de cabos entre dois equipamentos (busca em
  // largura, ignorando o sentido do cabo). Usa as mesmas classes da busca, por
  // isso abrir um fecha o outro.
  var elCaminhoBar = document.getElementById("caminhoBar");
  var elCaminhoDe = document.getElementById("caminhoDe");
  var elCaminhoPara = document.getElementById("caminhoPara");
  var elCaminhoResultado = document.getElementById("caminhoResultado");
  var btnCaminho = document.getElementById("btnCaminho");

  function caminhoAberto() { return !elCaminhoBar.classList.contains("hidden"); }

  function preencherSelectsCaminho() {
    [elCaminhoDe, elCaminhoPara].forEach(function (select) {
      var atual = select.value;
      select.innerHTML = '<option value="">— escolha —</option>' + estado.equipamentos.map(function (eq) {
        return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
      }).join("");
      if (estado.equipamentos.some(function (eq) { return eq.id === atual; })) select.value = atual;
    });
  }

  function menorCaminho(origem, destino) {
    var vizinhos = {};
    estado.conexoes.forEach(function (c) {
      (vizinhos[c.de] = vizinhos[c.de] || []).push(c.para);
      (vizinhos[c.para] = vizinhos[c.para] || []).push(c.de);
    });
    var anterior = {};
    anterior[origem] = null;
    var fila = [origem];
    while (fila.length) {
      var atual = fila.shift();
      if (atual === destino) break;
      (vizinhos[atual] || []).forEach(function (v) {
        if (!(v in anterior)) { anterior[v] = atual; fila.push(v); }
      });
    }
    if (!(destino in anterior)) return null;
    var caminho = [];
    for (var no = destino; no !== null; no = anterior[no]) caminho.unshift(no);
    return caminho;
  }

  function aplicarCaminho() {
    if (!caminhoAberto()) return;
    var svg = elCanvas.querySelector("svg");
    var de = elCaminhoDe.value, para = elCaminhoPara.value;
    elCaminhoResultado.classList.remove("sem-resultado");
    if (svg) svg.querySelectorAll("g.node, g.edge").forEach(function (el) { el.classList.remove("apagado", "encontrado", "encontrado-atual", "caminho"); });
    if (!de || !para) { elCaminhoResultado.textContent = "Escolha os dois equipamentos."; return; }
    if (de === para) { elCaminhoResultado.textContent = "Escolha equipamentos diferentes."; return; }
    var caminho = menorCaminho(de, para);
    if (!caminho) {
      elCaminhoResultado.textContent = "Não há ligação entre eles.";
      elCaminhoResultado.classList.add("sem-resultado");
      return;
    }
    var nosNoCaminho = {}, trechos = {};
    caminho.forEach(function (id, i) {
      nosNoCaminho[id] = true;
      if (i) { trechos[caminho[i - 1] + "|" + id] = true; trechos[id + "|" + caminho[i - 1]] = true; }
    });
    var nomes = caminho.map(function (id) {
      var eq = estado.equipamentos.find(function (e) { return e.id === id; });
      return eq ? (eq.nome || eq.id) : id;
    });
    var saltos = caminho.length - 1;
    elCaminhoResultado.textContent = saltos + (saltos === 1 ? " cabo: " : " cabos: ") + nomes.join(" → ");
    if (!svg) return;
    svg.querySelectorAll("g.node").forEach(function (node) {
      node.classList.add(nosNoCaminho[idEquipamentoDoNode(node)] ? "encontrado" : "apagado");
    });
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var c = conexaoDaAresta(aresta);
      aresta.classList.add(c && trechos[c.de + "|" + c.para] ? "caminho" : "apagado");
    });
  }

  function abrirCaminho() {
    elBusca.value = "";
    busca.atual = -1;
    aplicarBusca();
    preencherSelectsCaminho();
    elCaminhoBar.classList.remove("hidden");
    btnCaminho.classList.add("active");
    btnCaminho.setAttribute("aria-expanded", "true");
    aplicarCaminho();
    elCaminhoDe.focus();
  }

  function fecharCaminho() {
    if (!caminhoAberto()) return;
    elCaminhoBar.classList.add("hidden");
    btnCaminho.classList.remove("active");
    btnCaminho.setAttribute("aria-expanded", "false");
    var svg = elCanvas.querySelector("svg");
    if (svg) svg.querySelectorAll("g.edge.caminho").forEach(function (el) { el.classList.remove("caminho"); });
    aplicarBusca();
  }

  // ---- Limpar diagrama -------------------------------------------------------
  // Remove tudo, só os cabos, ou os equipamentos de um tipo/grupo/status (com os
  // cabos ligados a eles). Vira um passo do desfazer, como qualquer edição.
  var limpar = {
    backdrop: document.getElementById("limparModal"),
    form: document.getElementById("limparForm"),
    tipo: document.getElementById("limparTipo"),
    grupo: document.getElementById("limparGrupo"),
    status: document.getElementById("limparStatus"),
    resumo: document.getElementById("limparResumo"),
    confirmar: document.getElementById("limparConfirmar")
  };

  function valoresDistintos(campo, vazio) {
    var vistos = {};
    estado.equipamentos.forEach(function (eq) { vistos[String(eq[campo] || "").trim() || vazio] = true; });
    return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  function preencherSelectLimpar(select, valores) {
    var atual = select.value;
    select.innerHTML = valores.map(function (v) { return '<option value="' + escaparHtml(v) + '">' + escaparHtml(v) + '</option>'; }).join("");
    select.disabled = !valores.length;
    if (valores.indexOf(atual) >= 0) select.value = atual;
  }

  var SEM_TIPO = "(sem tipo)", SEM_GRUPO = "(sem grupo)";

  // Quais equipamentos e cabos a opção escolhida remove.
  function selecaoParaLimpar() {
    var modo = (limpar.form.querySelector('input[name="limparModo"]:checked') || {}).value;
    if (modo === "tudo") return { equipamentos: estado.equipamentos.slice(), conexoes: estado.conexoes.slice() };
    if (modo === "cabos") return { equipamentos: [], conexoes: estado.conexoes.slice() };
    var filtro = {
      tipo: function (eq) { return (String(eq.tipo || "").trim() || SEM_TIPO) === limpar.tipo.value; },
      grupo: function (eq) { return (String(eq.grupo || "").trim() || SEM_GRUPO) === limpar.grupo.value; },
      status: function (eq) { return (eq.status || "ativo") === limpar.status.value; }
    }[modo];
    var equipamentos = filtro ? estado.equipamentos.filter(filtro) : [];
    var ids = {};
    equipamentos.forEach(function (eq) { ids[eq.id] = true; });
    return { equipamentos: equipamentos, conexoes: estado.conexoes.filter(function (c) { return ids[c.de] || ids[c.para]; }) };
  }

  function atualizarResumoLimpar() {
    var s = selecaoParaLimpar();
    var total = s.equipamentos.length + s.conexoes.length;
    limpar.resumo.innerHTML = total
      ? "Vai remover <strong>" + escaparHtml(plural(s.equipamentos.length, "equipamento", "equipamentos")) + "</strong> e <strong>" +
        escaparHtml(plural(s.conexoes.length, "cabo", "cabos")) + "</strong>. Dá para desfazer com ↶."
      : "Nada para remover com essa opção.";
    limpar.confirmar.disabled = !total;
  }

  function abrirLimpar() {
    preencherSelectLimpar(limpar.tipo, valoresDistintos("tipo", SEM_TIPO));
    preencherSelectLimpar(limpar.grupo, valoresDistintos("grupo", SEM_GRUPO));
    atualizarResumoLimpar();
    mostrarModalBackdrop(limpar.backdrop);
    var marcado = limpar.form.querySelector('input[name="limparModo"]:checked');
    if (marcado) marcado.focus();
  }

  // Modais: a saída anima (.saindo) antes de virar .hidden. Se reabrir no
  // meio da saída, mostrarModalBackdrop cancela e o timer não esconde mais.
  var reduzirMovimento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function mostrarModalBackdrop(backdrop) {
    backdrop.classList.remove("saindo", "hidden");
  }
  function esconderModal(backdrop) {
    if (backdrop.classList.contains("hidden")) return;
    if (reduzirMovimento && reduzirMovimento.matches) { backdrop.classList.add("hidden"); return; }
    backdrop.classList.add("saindo");
    setTimeout(function () {
      if (!backdrop.classList.contains("saindo")) return;
      backdrop.classList.remove("saindo");
      backdrop.classList.add("hidden");
    }, 150);
  }

  function fecharLimpar() { esconderModal(limpar.backdrop); }

  document.getElementById("btnLimpar").addEventListener("click", abrirLimpar);
  limpar.backdrop.querySelectorAll("[data-limpar-fechar]").forEach(function (b) { b.addEventListener("click", fecharLimpar); });
  limpar.backdrop.addEventListener("click", function (event) { if (event.target === limpar.backdrop) fecharLimpar(); });
  limpar.backdrop.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fecharLimpar(); } });
  limpar.form.addEventListener("change", function (event) {
    // Escolher no select marca a opção dele.
    var label = event.target.closest("label");
    var radio = label && label.querySelector('input[type="radio"]');
    if (event.target.tagName === "SELECT" && radio) radio.checked = true;
    atualizarResumoLimpar();
  });
  limpar.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var s = selecaoParaLimpar();
    var removerEq = {}, removerCabo = new Set(s.conexoes);
    s.equipamentos.forEach(function (eq) { removerEq[eq.id] = true; });
    estado.equipamentos = estado.equipamentos.filter(function (eq) { return !removerEq[eq.id]; });
    estado.conexoes = estado.conexoes.filter(function (c) { return !removerCabo.has(c); });
    fecharLimpar();
    fecharCaminho();
    renderTudo();
  });

  btnCaminho.addEventListener("click", function () { if (caminhoAberto()) fecharCaminho(); else abrirCaminho(); });
  document.getElementById("btnFecharCaminho").addEventListener("click", fecharCaminho);
  elCaminhoDe.addEventListener("change", aplicarCaminho);
  elCaminhoPara.addEventListener("change", aplicarCaminho);

  elBusca.addEventListener("input", function () { fecharCaminho(); busca.atual = -1; aplicarBusca(); });
  elBusca.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); irParaResultado(event.shiftKey ? -1 : 1); }
    if (event.key === "Escape") { elBusca.value = ""; busca.atual = -1; aplicarBusca(); }
  });

