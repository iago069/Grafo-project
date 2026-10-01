  // ==== 08-listas-e-formularios.js: listas de equipamentos/cabos, formulários e painéis da barra lateral (parte de assets/js/app.js; npm run montar) ====
  function escapar(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n"); }
  function escaparHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escaparHtmlDot(s) {
    return escaparHtml(s).replace(/'/g, "&apos;");
  }
  // Dados podem vir de JSON/CSV importado: só aceita cores #rgb/#rrggbb.
  function corValida(cor, padrao) {
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(cor || "")) ? cor : padrao;
  }
  // Aceita data:image/ e caminhos http(s)/relativos; bloqueia javascript: e afins.
  function imagemSegura(url) {
    var s = String(url || "").trim();
    if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
    return s;
  }
  function corPorTipo(tipo) {
    var paleta = ["#BFE7E3", "#C9D9FF", "#FFE0A8", "#F6C4D8", "#D8C7F2", "#B9E3F5", "#D8E8B8"];
    var str = String(tipo || "outro"); var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff; }
    return paleta[Math.abs(hash) % paleta.length];
  }
  function corPorStatus(status) { return status === "manutencao" ? "#D99A22" : status === "offline" ? "#D94B5B" : "#2EAD68"; }
  function marcadorStatus(status) { return status === "manutencao" ? "⚙" : status === "offline" ? "×" : "●"; }
  // Rótulo exibido no diagrama; o valor salvo continua sem acento ("manutencao").
  function rotuloStatus(status) { return status === "manutencao" ? "MANUTENÇÃO" : status === "offline" ? "OFFLINE" : "ATIVO"; }

  function renderEquipamentos() {
    elListaEquip.innerHTML = estado.equipamentos.map(function (eq, i) {
      var opcoesEmoji = ICONES.map(function (ic) {
        return '<option value="' + escaparHtml(ic) + '"' + (ic === eq.icone ? " selected" : "") + '>' + (ic ? escaparHtml(ic) : "— sem ícone —") + '</option>';
      }).join("");
      var opcoesImagem = CATALOGO_ICONES.map(function (icone) {
        return '<option value="' + escaparHtml(icone.valor) + '"' + (icone.valor === eq.icone ? " selected" : "") + '>' + escaparHtml(icone.nome) + '</option>';
      }).join("");
      return (
        '<div class="equip-card" data-idx="' + i + '">' +
          '<div class="equip-row1">' +
            '<input type="text" data-field="nome" data-limite="nome" value="' + escaparHtml(eq.nome) + '" placeholder="Nome do equipamento" aria-label="Nome do equipamento">' +
            '<select data-field="icone" aria-label="Ícone"><optgroup label="Símbolos">' + opcoesImagem + '</optgroup><optgroup label="Emojis">' + opcoesEmoji + '</optgroup></select>' +
            '<span class="equip-status"><i class="equip-status-dot ' + (eq.status || "ativo") + '"></i>' + (eq.status === "manutencao" ? "Manutenção" : eq.status === "offline" ? "Offline" : "Ativo") + '</span>' +
            '<button type="button" class="ghost small equip-advanced-toggle" data-action="toggle-avancado" aria-expanded="false">Detalhes</button>' +
            '<button type="button" class="ghost small" data-action="remover-equip" title="Remover" aria-label="Remover equipamento">×</button>' +
          '</div>' +
          '<div class="equip-advanced" data-advanced-panel>' +
            '<div class="equip-row2">' +
              '<input type="text" data-field="modelo" data-limite="modelo" list="modelos-sugeridos" autocomplete="off" value="' + escaparHtml(eq.modelo) + '" placeholder="Modelo (fabricante)" aria-label="Modelo (fabricante)">' +
              '<input type="text" data-field="tipo" data-limite="tipo" value="' + escaparHtml(eq.tipo) + '" placeholder="Tipo" aria-label="Tipo" list="tipos-sugeridos">' +
              '<input type="text" data-field="ip" data-limite="ip" value="' + escaparHtml(eq.ip || "") + '" placeholder="IP (ex.: 10.0.0.1)" aria-label="IP" aria-invalid="' + (ipValido(eq.ip) ? "false" : "true") + '" inputmode="decimal" autocomplete="off" spellcheck="false">' +
              '<input type="text" data-field="grupo" data-limite="grupo" value="' + escaparHtml(eq.grupo || "") + '" placeholder="Grupo / rack / sala" aria-label="Grupo / rack / sala">' +
            '</div>' +
            '<div class="equip-row2">' +
              '<input type="text" data-field="rede" data-limite="rede" value="' + escaparHtml(eq.rede || "") + '" placeholder="VLAN / rede (ex.: VLAN 10 · 10.0.0.0/24)" aria-label="VLAN / rede" autocomplete="off" spellcheck="false">' +
            '</div>' +
            '<div class="equip-row3">' +
              '<label class="color-picker">Fonte <input type="color" data-field="corFonte" value="' + corValida(eq.corFonte, "#16323D") + '"></label>' +
              '<label class="color-picker">Status <select data-field="status"><option value="ativo"' + ((eq.status || "ativo") === "ativo" ? " selected" : "") + '>Ativo</option><option value="manutencao"' + (eq.status === "manutencao" ? " selected" : "") + '>Manutenção</option><option value="offline"' + (eq.status === "offline" ? " selected" : "") + '>Offline</option></select></label>' +
              '<label class="upload-label">Imagem/logo (opcional) <input type="file" accept="image/*" data-action="upload-imagem"></label>' +
              (imagemSegura(eq.imagem) ? '<img class="thumb" src="' + escaparHtml(imagemSegura(eq.imagem)) + '" alt=""><button type="button" class="ghost small" data-action="remover-imagem">remover imagem</button>' : '') +
            '</div>' +
            '<div class="equip-id">id: ' + escaparHtml(eq.id) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
    aplicarLimitesNosCampos(elListaEquip);
    filtrarListas();
  }

  // maxlength dos campos marcados com data-limite="<chave de LIMITES>": a tela
  // usa os mesmos limites da validação (esquema.js).
  function aplicarLimitesNosCampos(raiz) {
    (raiz || document).querySelectorAll("[data-limite]").forEach(function (campo) {
      var limite = LIMITES[campo.getAttribute("data-limite")];
      if (typeof limite === "number") campo.maxLength = limite;
    });
  }

  // Filtro e contagem das seções da lista. Esconde (sem apagar) os itens que não
  // batem; a contagem mostra "3 de 40" enquanto há filtro.
  function filtrarLista(lista, seletor, itens, filtro, contagem, textos) {
    var termo = normalizarTextoEquipamento(filtro.value);
    var visiveis = 0;
    lista.querySelectorAll(seletor).forEach(function (el) {
      var item = itens[parseInt(el.getAttribute("data-idx"), 10)];
      if (!item) return; // linha de uma renderização anterior, prestes a ser refeita
      var bate = !termo || textos(item).some(function (t) { return normalizarTextoEquipamento(t).indexOf(termo) >= 0; });
      el.hidden = !bate;
      if (bate) visiveis++;
    });
    contagem.textContent = termo ? visiveis + " de " + itens.length : String(itens.length);
    var aviso = lista.querySelector(".lista-vazia-filtro");
    if (termo && !visiveis && itens.length) {
      if (!aviso) { aviso = document.createElement("div"); aviso.className = "lista-vazia-filtro"; lista.appendChild(aviso); }
      aviso.textContent = 'Nada encontrado para "' + filtro.value.trim() + '".';
    } else if (aviso) aviso.remove();
  }

  function filtrarListas() {
    var nomePorId = {};
    estado.equipamentos.forEach(function (eq) { nomePorId[eq.id] = eq.nome; });
    filtrarLista(elListaEquip, ".equip-card", estado.equipamentos, elFiltroEquip, document.getElementById("contagemEquip"),
      function (eq) { return [eq.nome, eq.ip, eq.tipo, eq.grupo, eq.modelo]; });
    filtrarLista(elListaConex, ".conex-row", estado.conexoes, elFiltroConex, document.getElementById("contagemConex"),
      function (c) { return [nomePorId[c.de], nomePorId[c.para], c.tipo, c.saida, c.chegada, c.potencia]; });
  }
  elFiltroEquip.addEventListener("input", filtrarListas);
  elFiltroConex.addEventListener("input", filtrarListas);

  function renderConexoes() {
    var opcoesEquip = estado.equipamentos.map(function (eq) { return { id: eq.id, nome: eq.nome || eq.id }; });
    elListaConex.innerHTML = estado.conexoes.map(function (c, j) {
      function opcoes(selecionado) {
        return opcoesEquip.map(function (o) {
          return '<option value="' + escaparHtml(o.id) + '"' + (o.id === selecionado ? " selected" : "") + '>' + escaparHtml(o.nome) + '</option>';
        }).join("");
      }
      return (
        '<div class="conex-row" data-idx="' + j + '">' +
          '<select data-field="de" aria-label="Origem">' + opcoes(c.de) + '</select>' +
          '<span class="conex-arrow">→</span>' +
          '<select data-field="para" aria-label="Destino">' + opcoes(c.para) + '</select>' +
          '<input type="text" data-field="tipo" data-limite="tipoCabo" value="' + escaparHtml(c.tipo) + '" placeholder="Tipo de enlace" aria-label="Tipo de enlace">' +
          '<input type="text" data-field="saida" data-limite="porta" value="' + escaparHtml(c.saida || "") + '" placeholder="Porta origem" aria-label="Porta origem">' +
          '<input type="text" data-field="chegada" data-limite="porta" value="' + escaparHtml(c.chegada || "") + '" placeholder="Porta destino" aria-label="Porta destino">' +
          '<input type="text" data-field="potencia" data-limite="capacidade" value="' + escaparHtml(c.potencia || "") + '" list="capacidades-sugeridas" placeholder="Capacidade" title="Capacidade do cabo" aria-label="Capacidade do cabo" autocomplete="off">' +
          '<label class="color-picker">Linha <input type="color" data-field="cor" value="' + corValida(c.cor, "#5A7284") + '"></label>' +
          '<button type="button" class="ghost small" data-action="remover-conex" title="Remover" aria-label="Remover conexão">×</button>' +
        '</div>'
      );
    }).join("");
    aplicarLimitesNosCampos(elListaConex);
    filtrarListas();
  }

  function renderSidebarPanels() {
    preencherSelectsCaminho();
    var options = estado.equipamentos.map(function (eq) {
      return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
    }).join("");
    var de = document.getElementById("navCableDe");
    var para = document.getElementById("navCablePara");
    var deAtual = de.value;
    var paraAtual = para.value;
    de.innerHTML = options;
    para.innerHTML = options;
    if (estado.equipamentos.some(function (eq) { return eq.id === deAtual; })) de.value = deAtual;
    if (estado.equipamentos.some(function (eq) { return eq.id === paraAtual; })) para.value = paraAtual;
    if (estado.equipamentos.length > 1 && de.value === para.value) para.value = estado.equipamentos[1].id;

    // Sugere os grupos já usados, para não criar "Rack 01" e "rack 01" separados.
    var gruposUsados = {};
    estado.equipamentos.forEach(function (eq) { var g = String(eq.grupo || "").trim(); if (g) gruposUsados[g] = true; });
    document.getElementById("grupos-sugeridos").innerHTML = Object.keys(gruposUsados).sort().map(function (g) {
      return '<option value="' + escaparHtml(g) + '"></option>';
    }).join("");
  }

  function solicitarAtualizacaoDiagrama() {
    window.clearTimeout(atualizacaoDiagramaPendente);
    atualizacaoDiagramaPendente = window.setTimeout(function () {
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
    }, 120);
  }

  function renderTudo() { aplicarModoNaTela(); renderEquipamentos(); renderConexoes(); renderSidebarPanels(); atualizarJsonAvancado(); atualizarContadorEquipamentos(); salvarLocal(); solicitarAtualizacaoDiagrama(); }

  // Contador "n/35" na barra do diagrama. Perto do limite fica em alerta; no
  // limite, os botões de adicionar são bloqueados e aparece um aviso (uma vez).
  var elContadorEquip = document.getElementById("contadorEquip");
  var contagemAnterior = null;
  function atualizarContadorEquipamentos() {
    var n = estado.equipamentos.length, max = LIMITES.equipamentos;
    var cheio = n >= max;
    elContadorEquip.textContent = n + "/" + max;
    elContadorEquip.classList.toggle("perto", !cheio && n >= max - 5);
    elContadorEquip.classList.toggle("cheio", cheio);
    elContadorEquip.title = cheio ? "Limite de " + max + " equipamentos atingido. Exclua algum para adicionar outro."
      : "Equipamentos no diagrama: " + n + " de " + max;
    ["btnAddEquip"].forEach(function (id) { var b = document.getElementById(id); if (b) b.disabled = cheio; });
    var navAdd = document.querySelector('.nav-item[data-nav-panel="navAddEquip"]');
    if (navAdd) navAdd.classList.toggle("no-limite", cheio);
    // Aviso só quando a contagem sobe até o limite (não ao abrir um projeto já cheio).
    if (cheio && contagemAnterior !== null && contagemAnterior < max && n > contagemAnterior) {
      avisar("Limite de " + max + " equipamentos atingido neste diagrama.");
    }
    contagemAnterior = n;
  }

  function atualizarJsonAvancado() {
    elJsonAvancado.value = JSON.stringify(estado, null, 2);
  }

  // Edição direta na lista: o campo só é gravado se o item continuar válido
  // pelas regras do esquema. Enquanto inválido, o campo fica marcado e o valor
  // anterior continua salvo; ao sair do campo (change), ele volta ao salvo.
  function validarCampoDaLista(tipo, item, campo, valor) {
    var candidato = Object.assign({}, item);
    candidato[campo] = valor;
    var r = tipo === "equipamento" ? Esquema.validarEquipamento(candidato)
      : Esquema.validarConexao(candidato, estado.equipamentos.map(function (eq) { return eq.id; }));
    return r.ok ? { ok: true, valor: r.dados[campo] } : { ok: false, mensagem: textoDosErros(r.erros) };
  }

  function marcarCampo(input, mensagem) {
    input.setAttribute("aria-invalid", mensagem ? "true" : "false");
    input.title = mensagem || "";
  }

  elListaEquip.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo || e.target.tagName === "SELECT") return;
    var card = e.target.closest(".equip-card");
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("equipamento", estado.equipamentos[idx], campo, e.target.value);
    marcarCampo(e.target, r.ok ? "" : r.mensagem);
    if (!r.ok) return;
    estado.equipamentos[idx][campo] = r.valor;
    if (campo === "nome") renderConexoes();
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  // Imagens enviadas ficam dentro do projeto no localStorage (~5 MB no total),
  // então são reduzidas para no máximo 256 px antes de salvar.
  var LADO_MAXIMO_IMAGEM = 256;
  function lerImagemReduzida(arquivo, concluir) {
    var leitor = new FileReader();
    leitor.onload = function () {
      var original = leitor.result;
      if (/^data:image\/svg/i.test(original)) { concluir(original); return; }
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, LADO_MAXIMO_IMAGEM / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        var reduzida = canvas.toDataURL("image/webp", 0.85);
        concluir(reduzida.length < original.length ? reduzida : original);
      };
      img.onerror = function () { concluir(original); };
      img.src = original;
    };
    leitor.readAsDataURL(arquivo);
  }

  elListaEquip.addEventListener("change", function (e) {
    if (e.target.getAttribute("data-action") === "upload-imagem") {
      var card = e.target.closest(".equip-card");
      var idx = parseInt(card.getAttribute("data-idx"), 10);
      var arquivo = e.target.files && e.target.files[0];
      if (!arquivo) return;
      lerImagemReduzida(arquivo, function (imagem) {
        var r = validarCampoDaLista("equipamento", estado.equipamentos[idx], "imagem", imagem);
        if (!r.ok) { mostrarErro("Não foi possível usar essa imagem.", [{ onde: arquivo.name, mensagem: r.mensagem }]); return; }
        estado.equipamentos[idx].imagem = r.valor;
        renderEquipamentos();
        atualizarJsonAvancado();
        salvarLocal();
        solicitarAtualizacaoDiagrama();
      });
      return;
    }
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var card = e.target.closest(".equip-card");
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("equipamento", estado.equipamentos[idx], campo, e.target.value);
    if (!r.ok) mostrarErro("Valor não aceito em " + (estado.equipamentos[idx].nome || "equipamento") + "; o anterior foi mantido.", [{ onde: campo, mensagem: r.mensagem }]);
    else estado.equipamentos[idx][campo] = r.valor;
    renderEquipamentos();
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  elListaEquip.addEventListener("click", function (e) {
    var acao = e.target.getAttribute("data-action");
    if (!acao) return;
    var card = e.target.closest(".equip-card");
    if (acao === "toggle-avancado") {
      var painelAvancado = card.querySelector("[data-advanced-panel]");
      var aberto = painelAvancado.classList.toggle("open");
      e.target.textContent = aberto ? "Ocultar detalhes" : "Detalhes";
      e.target.setAttribute("aria-expanded", aberto ? "true" : "false");
      return;
    }
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    if (acao === "remover-equip") {
      var idRemovido = estado.equipamentos[idx].id;
      estado.equipamentos.splice(idx, 1);
      estado.conexoes = estado.conexoes.filter(function (c) { return c.de !== idRemovido && c.para !== idRemovido; });
      renderTudo();
    } else if (acao === "remover-imagem") {
      estado.equipamentos[idx].imagem = "";
      renderEquipamentos();
      atualizarJsonAvancado();
      salvarLocal();
    }
  });

  document.getElementById("btnAddEquip").addEventListener("click", function () {
    abrirFormularioEquipamento();
  });

  function abrirFormularioEquipamento() {
    elFormEquip.classList.remove("hidden");
    elFormCab.classList.add("hidden");
    setTimeout(function () {
      var input = document.getElementById("novoEquipNome");
      if (input) input.focus();
    }, 20);
  }

  function fecharFormularioEquipamento() {
    elFormEquip.classList.add("hidden");
    document.getElementById("novoEquipNome").value = "";
    document.getElementById("novoEquipTipo").value = "";
    document.getElementById("novoEquipModelo").value = "";
    document.getElementById("novoEquipIp").value = "";
    document.getElementById("novoEquipCor").value = "#16323D";
  }

  function abrirFormularioCabemamento() {
    elFormCab.classList.remove("hidden");
    elFormEquip.classList.add("hidden");
    var de = document.getElementById("novoCabDe");
    var para = document.getElementById("novoCabPara");
    var options = estado.equipamentos.map(function (eq) { return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>'; }).join("");
    de.innerHTML = options;
    para.innerHTML = options;
    if (estado.equipamentos.length > 1) {
      de.value = estado.equipamentos[0].id;
      para.value = estado.equipamentos[1].id;
    }
    setTimeout(function () { var input = document.getElementById("novoCabNome"); if (input) input.focus(); }, 20);
  }

  function fecharFormularioCabemamento() {
    elFormCab.classList.add("hidden");
    document.getElementById("novoCabNome").value = "";
    document.getElementById("novoCabCor").value = "#5A7284";
    document.getElementById("novoCabGrossura").value = "2";
    document.getElementById("novoCabSaida").value = "";
    document.getElementById("novoCabChegada").value = "";
    document.getElementById("novoCabPotencia").value = "1G";
    document.getElementById("novoCabEstilo").value = "solid";
  }

  function fecharPaineisLaterais() {
    document.querySelectorAll(".nav-panel.open").forEach(function (panel) { panel.classList.remove("open"); });
    document.querySelectorAll(".nav-item[data-nav-panel].active").forEach(function (item) { item.classList.remove("active"); });
  }

  document.querySelectorAll(".nav-item[data-nav-panel]").forEach(function (item) {
    item.addEventListener("click", function () {
      var panel = document.getElementById(item.getAttribute("data-nav-panel"));
      var estavaAberto = panel.classList.contains("open");
      fecharPaineisLaterais();
      if (!estavaAberto) {
        panel.classList.add("open");
        item.classList.add("active");
        if (panel.id === "navAddCable") renderSidebarPanels();
      }
    });
  });

  document.querySelectorAll("[data-nav-close]").forEach(function (button) {
    button.addEventListener("click", fecharPaineisLaterais);
  });

  document.getElementById("navEquipIp").addEventListener("input", function (event) {
    event.target.setCustomValidity("");
  });

  // Erros de GrafoEsquema.validarEquipamento/validarConexao em texto para o formulário
  // ("IP: IP inválido…"), sem o prefixo "Equipamento ›"/"Cabo ›".
  function textoDosErros(erros) {
    return erros.map(function (e) {
      var campo = e.onde.replace(/^(Equipamento|Cabo)( › )?/, "");
      return (campo ? campo + ": " : "") + e.mensagem;
    }).join("\n");
  }

  // Mensagem quando já se chegou ao limite; null se ainda cabe.
  function limiteAtingido(tipo) {
    if (tipo === "equipamento" && estado.equipamentos.length >= LIMITES.equipamentos) return "Limite de " + LIMITES.equipamentos + " equipamentos por projeto atingido.";
    if (tipo === "cabo" && estado.conexoes.length >= LIMITES.conexoes) return "Limite de " + LIMITES.conexoes + " cabos por projeto atingido.";
    return null;
  }

  document.getElementById("navEquipForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var mensagem = document.getElementById("navEquipMessage");
    mensagem.textContent = limiteAtingido("equipamento") || "";
    if (mensagem.textContent) return;
    var arquivo = document.getElementById("navEquipImagem").files[0];
    var tipo = document.getElementById("navEquipTipo").value.trim();
    var iconeInformado = document.getElementById("navEquipIcone").value.trim();
    var validacao = Esquema.validarEquipamento({ id: novoId(), nome: document.getElementById("navEquipNome").value, modelo: document.getElementById("navEquipModelo").value,
      ip: document.getElementById("navEquipIp").value, tipo: tipo, icone: iconeInformado || iconePorTipo(tipo), imagem: "", corFonte: "#16323D",
      grupo: document.getElementById("navEquipGrupo").value, status: document.getElementById("navEquipStatus").value,
      rede: document.getElementById("navEquipRede").value });
    if (!validacao.ok) { mensagem.textContent = textoDosErros(validacao.erros); return; }
    var novoEquipamento = validacao.dados;
    function concluir(imagem) {
      var comImagem = Esquema.validarEquipamento(Object.assign({}, novoEquipamento, { imagem: imagem || "" }));
      if (!comImagem.ok) { mensagem.textContent = textoDosErros(comImagem.erros); return; }
      novoEquipamento = comImagem.dados;
      mensagem.textContent = "";
      estado.equipamentos.push(novoEquipamento);
      renderTudo();
      renderSidebarPanels();
      event.target.reset();
      fecharPaineisLaterais();
      esconderErro();
    }
    if (!arquivo) { concluir(""); return; }
    lerImagemReduzida(arquivo, concluir);
  });

  document.getElementById("navCableForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var de = document.getElementById("navCableDe").value;
    var para = document.getElementById("navCablePara").value;
    var mensagem = document.getElementById("navCableMessage");
    if (!de || !para) { mensagem.textContent = "Cadastre dois equipamentos primeiro."; return; }
    mensagem.textContent = limiteAtingido("cabo") || "";
    if (mensagem.textContent) return;
    var validacao = Esquema.validarConexao({
      de: de, para: para, tipo: document.getElementById("navCableTipo").value,
      cor: document.getElementById("navCableCor").value, grossura: document.getElementById("navCableGrossura").value,
      estilo: document.getElementById("navCableEstilo").value, saida: document.getElementById("navCableSaida").value, chegada: document.getElementById("navCableChegada").value, potencia: document.getElementById("navCablePotencia").value
    }, estado.equipamentos.map(function (eq) { return eq.id; }));
    if (!validacao.ok) { mensagem.textContent = textoDosErros(validacao.erros); return; }
    estado.conexoes.push(validacao.dados);
    renderTudo();
    avisarPortaEmUso(validacao.dados);
    event.target.reset();
    document.getElementById("navCableCor").value = "#5A7284";
    document.getElementById("navCableGrossura").value = "2";
    mensagem.textContent = "";
    fecharPaineisLaterais();
    esconderErro();
  });

  document.addEventListener("click", function (event) {
    var navAction = event.target.getAttribute("data-nav-action");
    if (navAction === "export-diagram") btnBaixar.click();
  });

  document.addEventListener("click", function (event) {
    var action = event.target.getAttribute("data-action");
    if (!action) return;

    if (action === "cancelar-equip" || action === "fechar-form-equip") {
      fecharFormularioEquipamento();
    }

    if (action === "cancelar-cab" || action === "fechar-form-cab") {
      fecharFormularioCabemamento();
    }

    if (action === "salvar-equip") {
      var nome = document.getElementById("novoEquipNome").value.trim();
      var tipo = document.getElementById("novoEquipTipo").value.trim();
      var modelo = document.getElementById("novoEquipModelo").value.trim();
      var ip = document.getElementById("novoEquipIp").value.trim();
      var cor = document.getElementById("novoEquipCor").value || "#16323D";
      if (limiteAtingido("equipamento")) { mostrarErro(limiteAtingido("equipamento")); return; }
      var validacaoEquip = Esquema.validarEquipamento({ id: novoId(), nome: nome, modelo: modelo, ip: ip, tipo: tipo, icone: iconePorTipo(tipo), imagem: "", corFonte: cor });
      if (!validacaoEquip.ok) { mostrarErro("Não foi possível adicionar o equipamento.", validacaoEquip.erros); return; }
      estado.equipamentos.push(validacaoEquip.dados);
      renderTudo();
      fecharFormularioEquipamento();
      esconderErro();
    }

    if (action === "salvar-cab") {
      var cabNome = document.getElementById("novoCabNome").value.trim();
      var de = document.getElementById("novoCabDe").value;
      var para = document.getElementById("novoCabPara").value;
      var cor = document.getElementById("novoCabCor").value || "#5A7284";
      var grossura = document.getElementById("novoCabGrossura").value;
      if (!de || !para || !cabNome) {
        mostrarErro("Informe nome, origem e destino do cabeamento.");
        return;
      }
      if (limiteAtingido("cabo")) { mostrarErro(limiteAtingido("cabo")); return; }
      var validacaoCabo = Esquema.validarConexao({
        de: de, para: para, tipo: cabNome, cor: cor, grossura: grossura,
        saida: document.getElementById("novoCabSaida").value,
        chegada: document.getElementById("novoCabChegada").value,
        potencia: document.getElementById("novoCabPotencia").value,
        estilo: document.getElementById("novoCabEstilo").value
      }, estado.equipamentos.map(function (eq) { return eq.id; }));
      if (!validacaoCabo.ok) { mostrarErro("Não foi possível adicionar o cabeamento.", validacaoCabo.erros); return; }
      estado.conexoes.push(validacaoCabo.dados);
      renderTudo();
      fecharFormularioCabemamento();
      esconderErro();
      avisarPortaEmUso(validacaoCabo.dados);
    }
  });

  elListaConex.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo || e.target.tagName === "SELECT") return;
    var idx = parseInt(e.target.closest(".conex-row").getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("cabo", estado.conexoes[idx], campo, e.target.value);
    marcarCampo(e.target, r.ok ? "" : r.mensagem);
    if (!r.ok) return;
    estado.conexoes[idx][campo] = r.valor;
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  // Ao sair do campo (ou trocar origem/destino): grava o valor já padronizado
  // (ex.: capacidade "10 gbps" -> "10G") ou, se inválido, volta ao anterior.
  elListaConex.addEventListener("change", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var idx = parseInt(e.target.closest(".conex-row").getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("cabo", estado.conexoes[idx], campo, e.target.value);
    if (!r.ok) {
      mostrarErro("Valor não aceito no cabo " + (idx + 1) + "; o anterior foi mantido.", [{ onde: campo, mensagem: r.mensagem }]);
      renderConexoes();
      return;
    }
    estado.conexoes[idx][campo] = r.valor;
    if (e.target.tagName !== "SELECT") e.target.value = r.valor;
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  elListaConex.addEventListener("click", function (e) {
    if (e.target.getAttribute("data-action") === "remover-conex") {
      var row = e.target.closest(".conex-row");
      var idx = parseInt(row.getAttribute("data-idx"), 10);
      estado.conexoes.splice(idx, 1);
      renderTudo();
    }
  });

  document.getElementById("btnAddConex").addEventListener("click", function () {
    if (estado.equipamentos.length < 2) {
      mostrarErro("Adicione ao menos dois equipamentos antes de criar uma conexão.");
      return;
    }
    abrirFormularioCabemamento();
  });

