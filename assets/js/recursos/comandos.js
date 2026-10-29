/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0. */
// Paleta de comandos (Ctrl+K / Cmd+K): busca equipamentos, projetos e ações num
// lugar só. As ações apenas acionam os botões que já existem na página.
(function () {
  "use strict";
  var app = window.GrafoApp;
  if (!app || document.getElementById("paletaComandos")) return;

  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clicar(id) { return function () { var b = document.getElementById(id); if (b && !b.disabled) b.click(); }; }
  function abrirPainel(id) { return function () { var b = document.querySelector('.nav-item[data-nav-panel="' + id + '"]'); if (b) { if (!b.classList.contains("active")) b.click(); b.scrollIntoView({ block: "nearest" }); } }; }
  function modo(valor) { return function () { var s = document.getElementById("modoDiagrama"); if (s && s.value !== valor) { s.value = valor; s.dispatchEvent(new Event("change", { bubbles: true })); } }; }
  function existe(id) { return function () { var b = document.getElementById(id); return !!b && !b.hidden && !b.disabled; }; }

  var ACOES = [
    { titulo: "Adicionar equipamento", grupo: "Diagrama", icone: "mais", fazer: abrirPainel("navAddEquip"), termos: "novo equipamento criar" },
    { titulo: "Adicionar cabeamento", grupo: "Diagrama", icone: "cabo", fazer: abrirPainel("navAddCable"), termos: "cabo ligar conexao" },
    { titulo: "Editar em lista", grupo: "Diagrama", icone: "lista", fazer: clicar("btnModoAvancado"), termos: "lista tabela editar varios" },
    { titulo: "Organizar diagrama", grupo: "Diagrama", icone: "layout", fazer: clicar("btnOrganizarDiagrama"), termos: "layout reorganizar arrumar" },
    { titulo: "Exportar PDF para imprimir", grupo: "Exportar", icone: "pdf", fazer: clicar("btnPaginaPdf"), termos: "pdf imprimir" },
    { titulo: "Baixar imagem PNG", grupo: "Exportar", icone: "imagem", fazer: clicar("btnBaixarPng"), termos: "png imagem foto" },
    { titulo: "Baixar vetor SVG", grupo: "Exportar", icone: "vetor", fazer: clicar("btnBaixar"), termos: "svg vetor" },
    { titulo: "Exportar projeto (.json)", grupo: "Projeto", icone: "baixar", fazer: clicar("btnExportarProjeto"), termos: "backup salvar json", atalho: "Ctrl S" },
    { titulo: "Importar projeto (.json)", grupo: "Projeto", icone: "enviar", fazer: function () { var i = document.getElementById("arquivoProjeto"); if (i) i.click(); }, termos: "abrir arquivo json" },
    { titulo: "Baixar todos os projetos", grupo: "Projeto", icone: "pacote", fazer: clicar("btnExportarTodos"), termos: "backup tudo" },
    { titulo: "Novo projeto", grupo: "Projeto", icone: "mais", fazer: clicar("btnNovoProjeto"), termos: "criar projeto" },
    { titulo: "Histórico de versões", grupo: "Projeto", icone: "historico", fazer: clicar("btnHistorico"), visivel: existe("btnHistorico"), termos: "versao restaurar desfazer" },
    { titulo: "Editar em equipe", grupo: "Projeto", icone: "equipe", fazer: clicar("btnEquipe"), visivel: existe("btnEquipe"), termos: "compartilhar convidar" },
    { titulo: "Compartilhar link", grupo: "Projeto", icone: "compartilhar", fazer: clicar("btnCompartilhar"), visivel: existe("btnCompartilhar"), termos: "link cliente" },
    { titulo: "Verificar diagrama", grupo: "Diagrama", icone: "lista", fazer: function () { app.abrirVerificador && app.abrirVerificador(); }, termos: "erros conferir ip repetido porta duplicada rede sobreposta problemas" },
    { titulo: "Endereços IP", grupo: "Diagrama", icone: "codigo", fazer: function () { app.abrirEnderecosIp && app.abrirEnderecosIp(""); }, termos: "ip rede redes /30 /29 livre proxima subrede ipam" },
    { titulo: "Relatório de inventário (.xlsx)", grupo: "Relatórios", icone: "planilha", fazer: clicar("btnInventario"), termos: "planilha excel inventario" },
    { titulo: "Etiquetas com QR code", grupo: "Relatórios", icone: "qrcode", fazer: clicar("btnEtiquetas"), termos: "etiqueta qr imprimir" },
    { titulo: "JSON e CSV", grupo: "Integração", icone: "codigo", fazer: abrirPainel("navJsonCsv"), termos: "json csv planilha importar" },
    { titulo: "Ir para Topologia", grupo: "Tipo de diagrama", icone: "topologia", fazer: modo("topologia") },
    { titulo: "Ir para Diagrama de redes", grupo: "Tipo de diagrama", icone: "redes", fazer: modo("redes"), termos: "vlan ip rede" },
    { titulo: "Ir para Monitoramento", grupo: "Tipo de diagrama", icone: "pulso", fazer: modo("monitoramento"), termos: "status offline" },
    { titulo: "Ir para Bayface de Racks", grupo: "Tipo de diagrama", icone: "rack", fazer: modo("racks"), termos: "rack datacenter u" },
    { titulo: "Alternar tema claro / escuro", grupo: "Aparência", icone: "tema", fazer: function () { var b = document.getElementById("btnTema") || document.querySelector(".theme-toggle"); if (b) b.click(); }, termos: "tema escuro claro dark" }
  ];

  // ---- interface -------------------------------------------------------------
  var fundo = document.createElement("div");
  fundo.id = "paletaComandos";
  fundo.className = "paleta-fundo";
  fundo.hidden = true;
  fundo.innerHTML =
    '<div class="paleta" role="dialog" aria-modal="true" aria-label="Paleta de comandos">' +
      '<div class="paleta-busca"><span class="paleta-lupa" aria-hidden="true"></span>' +
        '<input type="text" class="paleta-input" placeholder="Buscar equipamento, IP, cabo, VLAN, projeto ou ação…" aria-label="Buscar" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="paletaLista">' +
        '<kbd>Esc</kbd></div>' +
      '<div class="paleta-lista" id="paletaLista" role="listbox"></div>' +
      '<div class="paleta-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> ir até</span><span><kbd>Shift</kbd><kbd>Enter</kbd> editar</span><span><kbd>Ctrl</kbd><kbd>K</kbd> abrir a paleta</span></div>' +
    '</div>';
  document.body.appendChild(fundo);
  var input = fundo.querySelector(".paleta-input");
  var lista = fundo.querySelector(".paleta-lista");
  var itens = [], ativo = 0, focoAntes = null;

  // Botão na barra do topo, para quem não conhece o atalho.
  var barra = document.querySelector(".theme-toolbar");
  if (barra && !document.getElementById("btnPaleta")) {
    var botao = document.createElement("button");
    botao.type = "button"; botao.id = "btnPaleta"; botao.className = "paleta-gatilho";
    botao.setAttribute("aria-label", "Buscar (Ctrl+K)");
    botao.innerHTML = '<span class="paleta-lupa" aria-hidden="true"></span><span class="paleta-gatilho-texto">Buscar…</span><kbd>Ctrl K</kbd>';
    botao.addEventListener("click", abrir);
    barra.insertBefore(botao, barra.firstChild);
  }

  // Equipamento: Enter vai até ele no diagrama (centraliza e seleciona);
  // Shift+Enter abre o editor. No Bayface, volta para a topologia antes.
  function sairDosRacks() { var s = document.getElementById("modoDiagrama"); if (s && s.value === "racks") modo("topologia")(); }
  // Espera o equipamento aparecer no desenho (depois de trocar de projeto ou de modo).
  function quandoDesenhado(id, fazer) {
    var limite = Date.now() + 4000;
    (function tentar() {
      var svg = document.querySelector("#canvas svg");
      var ok = svg && Array.prototype.some.call(svg.querySelectorAll("g.node"), function (n) { return app.idDoNo(n) === id; });
      if (ok) { fazer(); return; }
      if (Date.now() < limite) setTimeout(tentar, 120);
    })();
  }
  function irAteEquipamento(id, editar) {
    sairDosRacks();
    quandoDesenhado(id, function () {
      if (editar) app.editarEquipamento(id);
      else if (app.focarEquipamento) app.focarEquipamento(id);
      else app.editarEquipamento(id);
    });
  }
  function ehIpv4(t) { return /^\s*(\d{1,3}\.){3}\d{1,3}\s*$/.test(t); }

  var cacheCandidatos = null;
  function candidatos() {
    if (cacheCandidatos) return cacheCandidatos;
    var lista = [];
    var nomeAtual = app.projetoAtual();
    var dados = app.dadosProjeto(nomeAtual) || { equipamentos: [], conexoes: [] };
    var nomePorId = {};
    (dados.equipamentos || []).forEach(function (eq) {
      nomePorId[eq.id] = eq.nome || eq.id;
      lista.push({ titulo: eq.nome || eq.id, sub: [eq.tipo, eq.ip, eq.modelo, eq.grupo].filter(Boolean).join(" · "), grupo: "Equipamentos", icone: "equip", termos: [eq.tipo, eq.ip, eq.modelo, eq.grupo, eq.municipio].join(" "),
        fazer: function () { irAteEquipamento(eq.id, false); }, editar: function () { irAteEquipamento(eq.id, true); } });
    });
    // Cabos: por VLAN, porta, rede ou nome das pontas (só aparecem buscando).
    (dados.conexoes || []).forEach(function (c, i) {
      var de = nomePorId[c.de] || c.de, para = nomePorId[c.para] || c.para;
      var portas = [c.saida, c.chegada].filter(Boolean).join(" → ");
      lista.push({ titulo: de + " ⇄ " + para, sub: [portas, c.vlan ? "VLAN " + c.vlan : "", c.redeVlan, c.tipo, c.potencia].filter(Boolean).join(" · "), grupo: "Cabos", icone: "cabo", soBuscando: true,
        termos: ["cabo", c.saida, c.chegada, c.vlan ? "vlan " + c.vlan : "", c.redeVlan, c.tipo, c.potencia].join(" "),
        fazer: function () { sairDosRacks(); setTimeout(function () { if (app.focarCabo) app.focarCabo(i); }, 60); } });
    });
    app.nomesProjetos().forEach(function (nome) {
      if (nome === nomeAtual) return;
      lista.push({ titulo: nome, sub: "Abrir projeto", grupo: "Projetos", icone: "pasta", fazer: function () { app.trocarProjeto(nome); } });
      // Equipamentos dos outros projetos: abre o projeto e vai até ele.
      var outro = app.dadosProjeto(nome);
      ((outro && outro.equipamentos) || []).forEach(function (eq) {
        lista.push({ titulo: eq.nome || eq.id, sub: [nome, eq.ip, eq.tipo].filter(Boolean).join(" · "), grupo: "Em outros projetos", icone: "equip", soBuscando: true, termos: [eq.ip, eq.modelo, eq.tipo, nome].join(" "),
          fazer: function () { app.trocarProjeto(nome); irAteEquipamento(eq.id, false); },
          editar: function () { app.trocarProjeto(nome); irAteEquipamento(eq.id, true); } });
      });
    });
    if (window.GrafoBiblioteca) lista = lista.concat(window.GrafoBiblioteca.candidatos());
    ACOES.forEach(function (a) { if (!a.visivel || a.visivel()) lista.push(a); });
    cacheCandidatos = lista;
    if (window.GrafoBiblioteca) {
      lista.push({ titulo: "Documentação deste diagrama", grupo: "Navegar", icone: "lista", termos: "documentos manual procedimento livro pop", fazer: function () { window.GrafoBiblioteca.livroDoProjeto(); } });
    }
    return lista;
  }

  // Pontuação simples: começa com > contém palavra > contém; todas as palavras precisam aparecer.
  function pontuar(item, q) {
    if (!q) return 1;
    var titulo = semAcento(item.titulo), resto = semAcento([item.sub, item.grupo, item.termos].join(" "));
    var total = 0, palavras = q.split(/\s+/).filter(Boolean);
    for (var i = 0; i < palavras.length; i++) {
      var p = palavras[i];
      if (titulo.indexOf(p) === 0) total += 10;
      else if (titulo.indexOf(" " + p) >= 0) total += 6;
      else if (titulo.indexOf(p) >= 0) total += 4;
      else if (resto.indexOf(p) >= 0) total += 1;
      else return 0;
    }
    return total;
  }

  function destacar(texto, q) {
    var t = esc(texto);
    if (!q) return t;
    var i = semAcento(texto).indexOf(q.split(/\s+/)[0]);
    if (i < 0) return t;
    var p = q.split(/\s+/)[0].length;
    return esc(texto.slice(0, i)) + "<mark>" + esc(texto.slice(i, i + p)) + "</mark>" + esc(texto.slice(i + p));
  }

  function render() {
    var q = semAcento(input.value).trim();
    var pont = candidatos().filter(function (c) { return q || !c.soBuscando; }).map(function (c) { return { c: c, p: pontuar(c, q) }; }).filter(function (x) { return x.p > 0; });
    if (q) pont.sort(function (a, b) { return b.p - a.p || (a.c.grupo === "Em outros projetos") - (b.c.grupo === "Em outros projetos"); });
    if (ehIpv4(input.value) && app.abrirEnderecosIp) {
      var ip = input.value.trim();
      pont.push({ c: { titulo: "Procurar " + ip + " em Endereços IP", sub: "Mostra a rede onde este IP fica e quem está nela", grupo: "Endereços IP", icone: "codigo", fazer: function () { app.abrirEnderecosIp(ip); } }, p: 1 });
    }
    itens = pont.slice(0, 40).map(function (x) { return x.c; });
    if (!q) itens = itens.filter(function (c) { return c.grupo !== "Equipamentos"; }).concat(itens.filter(function (c) { return c.grupo === "Equipamentos"; }).slice(0, 6));
    ativo = Math.min(ativo, Math.max(0, itens.length - 1));
    if (!itens.length) { lista.innerHTML = '<div class="paleta-vazio">Nada encontrado para "' + esc(input.value) + '".</div>'; return; }
    var html = "", grupoAtual = null;
    itens.forEach(function (it, i) {
      if (!q && it.grupo !== grupoAtual) { grupoAtual = it.grupo; html += '<div class="paleta-grupo">' + esc(it.grupo) + '</div>'; }
      html += '<div class="paleta-item' + (i === ativo ? " ativo" : "") + '" role="option" id="paleta-op-' + i + '" data-i="' + i + '" aria-selected="' + (i === ativo) + '">' +
        '<span class="paleta-icone" data-icone="' + esc(it.icone) + '"></span>' +
        '<span class="paleta-textos"><span class="paleta-titulo">' + destacar(it.titulo, q) + '</span>' + (it.sub ? '<span class="paleta-sub">' + esc(it.sub) + '</span>' : "") + '</span>' +
        (q ? '<span class="paleta-tag">' + esc(it.grupo) + '</span>' : "") + (it.atalho ? '<kbd>' + esc(it.atalho) + '</kbd>' : "") + '</div>';
    });
    lista.innerHTML = html;
    input.setAttribute("aria-activedescendant", "paleta-op-" + ativo);
  }

  function mover(d) {
    if (!itens.length) return;
    ativo = (ativo + d + itens.length) % itens.length;
    lista.querySelectorAll(".paleta-item").forEach(function (el) { var on = Number(el.getAttribute("data-i")) === ativo; el.classList.toggle("ativo", on); el.setAttribute("aria-selected", String(on)); });
    var el = lista.querySelector(".paleta-item.ativo");
    if (el) el.scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", "paleta-op-" + ativo);
  }

  function executar(i, editar) {
    var it = itens[i];
    if (!it) return;
    fechar(false);
    var acao = editar && it.editar ? it.editar : it.fazer;
    setTimeout(function () { try { acao(); } catch (e) { console.error(e); } }, 30);
  }

  function abrir() {
    // Fechando (animação de saída) conta como fechada: reabre na hora.
    if (!fundo.hidden && !fundo.classList.contains("saindo")) return;
    focoAntes = document.activeElement;
    fundo.hidden = false;
    fundo.classList.remove("saindo");
    cacheCandidatos = null;
    input.value = ""; ativo = 0; render();
    input.focus();
  }
  function fechar(devolverFoco) {
    if (fundo.hidden || fundo.classList.contains("saindo")) return;
    fundo.classList.add("saindo");
    setTimeout(function () { if (!fundo.classList.contains("saindo")) return; fundo.hidden = true; fundo.classList.remove("saindo"); }, 140);
    if (devolverFoco !== false && focoAntes && focoAntes.focus) focoAntes.focus();
  }

  input.addEventListener("input", function () { ativo = 0; render(); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); mover(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); mover(-1); }
    else if (ev.key === "Enter") { ev.preventDefault(); executar(ativo, ev.shiftKey); }
    else if (ev.key === "Escape") { ev.preventDefault(); fechar(); }
  });
  lista.addEventListener("mousemove", function (ev) {
    var el = ev.target.closest(".paleta-item");
    if (!el) return;
    var i = Number(el.getAttribute("data-i"));
    if (i !== ativo) { ativo = i; mover(0); }
  });
  lista.addEventListener("click", function (ev) { var el = ev.target.closest(".paleta-item"); if (el) executar(Number(el.getAttribute("data-i")), ev.shiftKey); });
  fundo.addEventListener("mousedown", function (ev) { if (ev.target === fundo) fechar(); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !fundo.hidden) { ev.preventDefault(); fechar(); return; }
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "k" || ev.key === "K")) {
      if (document.body.classList.contains("auth-locked")) return;
      ev.preventDefault();
      if (fundo.hidden || fundo.classList.contains("saindo")) abrir(); else fechar();
    }
  });
  // ---- ficha ao passar o mouse num equipamento do diagrama ----------------------
  var ficha = document.createElement("div");
  ficha.className = "ficha-equip"; ficha.hidden = true; ficha.setAttribute("role", "tooltip");
  document.body.appendChild(ficha);
  var timerFicha = null, noFicha = null;
  var NOMES_STATUS = { ativo: "Ativo", manutencao: "Manutenção", offline: "Offline" };
  function mostrarFicha(no, ev) {
    var id = app.idDoNo ? app.idDoNo(no) : null;
    var dados = id && app.dadosProjeto(app.projetoAtual());
    var eq = dados && dados.equipamentos.find(function (e) { return e.id === id; });
    if (!eq) return;
    var cabos = (dados.conexoes || []).filter(function (c) { return c.de === id || c.para === id; });
    var st = eq.status || "ativo";
    function linha(rotulo, valor) { return valor ? '<div class="ficha-linha"><span>' + rotulo + '</span><b>' + esc(valor) + '</b></div>' : ""; }
    ficha.innerHTML = '<div class="ficha-topo"><i class="ficha-led ' + st + '"></i><strong>' + esc(eq.nome || eq.id) + '</strong><em>' + esc(NOMES_STATUS[st] || st) + '</em></div>' +
      linha("Tipo", eq.tipo) + linha("Modelo", eq.modelo) + linha("IP", eq.ip) + linha("Rede", eq.rede) + linha("Grupo", eq.grupo) +
      linha("Cabos", cabos.length ? cabos.length + " · " + cabos.slice(0, 3).map(function (c) { return c.de === id ? c.saida : c.chegada; }).filter(Boolean).join(", ") + (cabos.length > 3 ? "…" : "") : "nenhum") +
      '<div class="ficha-dica">Duplo clique para editar</div>';
    ficha.hidden = false;
    posicionarFicha(ev);
  }
  function posicionarFicha(ev) {
    var w = ficha.offsetWidth, h = ficha.offsetHeight, x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 16;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 16;
    ficha.style.left = x + "px"; ficha.style.top = y + "px";
  }
  function esconderFicha() { clearTimeout(timerFicha); noFicha = null; ficha.hidden = true; }
  var canvas = document.getElementById("canvas");
  if (canvas) {
    canvas.addEventListener("mousemove", function (ev) {
      if (ev.buttons) { esconderFicha(); return; }
      var no = ev.target.closest && ev.target.closest("g.node");
      if (no !== noFicha) {
        esconderFicha(); noFicha = no;
        if (no) timerFicha = setTimeout(function () { mostrarFicha(no, ev); }, 350);
      } else if (!ficha.hidden) posicionarFicha(ev);
    });
    canvas.addEventListener("mouseleave", esconderFicha);
    canvas.addEventListener("pointerdown", esconderFicha);
    canvas.addEventListener("wheel", esconderFicha, { passive: true });
  }

  // ---- folha de atalhos (tecla ?) ---------------------------------------------
  var ATALHOS = [
    ["Geral", [["Ctrl+K", "Paleta de comandos"], ["Ctrl+S", "Exportar projeto (.json)"], ["?", "Esta folha de atalhos"], ["Esc", "Fechar janela ou limpar seleção"]]],
    ["Edição", [["Ctrl+Z", "Desfazer"], ["Ctrl+Y", "Refazer"], ["Ctrl+C", "Copiar selecionados"], ["Ctrl+V", "Colar"], ["Ctrl+D", "Duplicar selecionados"], ["Ctrl+A", "Selecionar todos"], ["Delete", "Excluir selecionados"]]],
    ["Diagrama", [["Enter|F2", "Editar o equipamento em foco"], ["Setas", "Mover o equipamento em foco"], ["Duplo clique", "Editar equipamento ou cabo"], ["Roda do mouse", "Aproximar e afastar"], ["Arrastar o fundo", "Mover a vista"]]],
    ["Busca", [["Enter", "Próximo resultado"], ["Shift+Enter", "Resultado anterior"]]]
  ];
  var folha = document.createElement("div");
  folha.className = "paleta-fundo folha-atalhos"; folha.hidden = true;
  folha.innerHTML = '<div class="paleta folha" role="dialog" aria-modal="true" aria-label="Atalhos do teclado"><div class="folha-topo"><strong>Atalhos do teclado</strong><kbd>Esc</kbd></div><div class="folha-grade">' +
    ATALHOS.map(function (g) {
      return '<section><h4>' + esc(g[0]) + '</h4>' + g[1].map(function (a) {
        return '<div class="folha-linha"><span>' + esc(a[1]) + '</span><span class="folha-teclas">' + a[0].split("|").map(function (alt) { return alt.split("+").map(function (k) { return "<kbd>" + esc(k) + "</kbd>"; }).join(""); }).join("<i>ou</i>") + '</span></div>';
      }).join("") + '</section>';
    }).join("") + '</div></div>';
  document.body.appendChild(folha);
  function campoDeTexto(el) { return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
  folha.addEventListener("mousedown", function (ev) { if (ev.target === folha) folha.hidden = true; });
  document.addEventListener("keydown", function (ev) {
    if (!folha.hidden && (ev.key === "Escape" || ev.key === "?")) { ev.preventDefault(); folha.hidden = true; return; }
    if (ev.key === "?" && !ev.ctrlKey && !ev.metaKey && !campoDeTexto(ev.target) && fundo.hidden && !document.body.classList.contains("auth-locked")) { ev.preventDefault(); folha.hidden = false; }
  });
  ACOES.push({ titulo: "Atalhos do teclado", grupo: "Ajuda", icone: "lista", fazer: function () { folha.hidden = false; }, termos: "teclado ajuda atalho", atalho: "?" });

  // ---- "Como fazer": passo a passo das tarefas do dia a dia ----------------------
  var COMO_FAZER = [
    ["Montar o diagrama", [
      ["Adicionar equipamento", "Na caixa de ferramentas do quadro, clique no primeiro botão (monitor com +). Clique num item para pôr no centro, ou arraste para onde quiser."],
      ["Ligar dois equipamentos", "Passe o mouse num equipamento: aparecem 4 bolinhas. Arraste de uma bolinha até o outro equipamento. O editor do cabo abre para você preencher as portas."],
      ["Editar equipamento ou cabo", "Duplo clique nele. No cabo dá para pôr VLAN, rede e os números das pontas."],
      ["Mudar o caminho de um cabo", "Clique no cabo e arraste os quadradinhos dos trechos. “Rota automática” na barra de baixo desfaz."],
      ["Agrupar (POP, rack, sala)", "Selecione os equipamentos (Shift + arrastar no fundo, ou Ctrl+A) e clique em Agrupar na barra que aparece."],
      ["Copiar para outro diagrama", "Selecione, Ctrl+C, abra o outro diagrama e Ctrl+V. Os cabos entre os copiados vão junto."]
    ]],
    ["Desenhar por cima", [
      ["Texto, formas e setas", "Caixa de ferramentas: T (texto), R (retângulo), E (elipse), A (seta), L (linha). Arraste no quadro. Shift deixa reto."],
      ["Caneta e borracha", "P risca à mão livre; B apaga clicando ou arrastando por cima."],
      ["Cor e espessura", "Com a ferramenta ou a forma selecionada, use a barra que aparece embaixo do quadro."],
      ["Esconder partes (camadas)", "Botão de camadas na caixa de ferramentas: VLANs, números, nomes dos cabos, desenhos, notas e grupos. Vale também no PDF."]
    ]],
    ["Trazer dados prontos", [
      ["Do Grafana, NetBox ou Juniper", "Importar e exportar → Gerar a partir de texto. Cole a tabela de interfaces (ou show lldp neighbors) e revise antes de aplicar."],
      ["De um print ou foto", "No mesmo lugar, escolha ou cole (Ctrl+V) a imagem. Ela é lida com IA e cai na mesma revisão."],
      ["Conferir um diagrama pronto", "Cole a tabela atual, clique em Ler e depois em “Comparar com o diagrama aberto”: mostra o que está diferente, o que falta e o que sobra."]
    ]],
    ["Organizar e compartilhar", [
      ["Ligar diagramas", "No editor do equipamento, escolha “Abre o diagrama”. Aparece o selo ↗: clique para abrir o outro diagrama e use “← Voltar”."],
      ["Equipe", "Botão Equipe: marque quais diagramas entram e quem pode ver ou editar cada um. Envie o link de convite."],
      ["Exportar", "Exportar → PDF para imprimir, PNG ou SVG. Ctrl+S baixa o projeto em .json."]
    ]]
  ];
  var ajuda = document.createElement("div");
  ajuda.className = "paleta-fundo folha-atalhos folha-ajuda"; ajuda.hidden = true;
  ajuda.innerHTML = '<div class="paleta folha" role="dialog" aria-modal="true" aria-label="Como fazer"><div class="folha-topo"><strong>Como fazer</strong><kbd>Esc</kbd></div>' +
    '<input type="search" class="ajuda-busca" placeholder="Buscar (ex.: VLAN, cabo, equipe)" aria-label="Buscar na ajuda"><div class="ajuda-lista">' +
    COMO_FAZER.map(function (g) {
      return '<section><h4>' + esc(g[0]) + '</h4>' + g[1].map(function (i) {
        return '<details class="ajuda-item"><summary>' + esc(i[0]) + '</summary><p>' + esc(i[1]) + '</p></details>';
      }).join("") + '</section>';
    }).join("") + '</div></div>';
  document.body.appendChild(ajuda);
  var buscaAjuda = ajuda.querySelector(".ajuda-busca");
  function abrirAjuda() { ajuda.hidden = false; buscaAjuda.value = ""; filtrarAjuda(); buscaAjuda.focus(); }
  function fecharAjuda() { if (ajuda.contains(document.activeElement)) document.activeElement.blur(); ajuda.hidden = true; }
  function filtrarAjuda() {
    var t = buscaAjuda.value.trim().toLowerCase();
    ajuda.querySelectorAll(".ajuda-item").forEach(function (d) {
      var ok = !t || d.textContent.toLowerCase().indexOf(t) >= 0;
      d.hidden = !ok;
      d.open = !!t && ok;
    });
    ajuda.querySelectorAll(".ajuda-lista section").forEach(function (sec) { sec.hidden = !sec.querySelector(".ajuda-item:not([hidden])"); });
  }
  buscaAjuda.addEventListener("input", filtrarAjuda);
  ajuda.addEventListener("mousedown", function (ev) { if (ev.target === ajuda) fecharAjuda(); });
  document.addEventListener("keydown", function (ev) { if (!ajuda.hidden && ev.key === "Escape") { ev.preventDefault(); fecharAjuda(); } });
  ACOES.push({ titulo: "Como fazer (ajuda)", grupo: "Ajuda", icone: "lista", fazer: abrirAjuda, termos: "ajuda como fazer tutorial passo a passo" });
  window.GrafoAjuda = { abrir: abrirAjuda };

  // ---- galeria de projetos ----------------------------------------------------
  var galeria = document.createElement("div");
  galeria.className = "paleta-fundo galeria-fundo"; galeria.hidden = true;
  galeria.innerHTML = '<div class="paleta galeria" role="dialog" aria-modal="true" aria-label="Projetos">' +
    '<div class="folha-topo"><strong>Projetos</strong><div class="galeria-acoes"><input type="search" class="galeria-busca" placeholder="Filtrar projetos" aria-label="Filtrar projetos"><button type="button" class="primary small" data-galeria-novo>+ Novo projeto</button><kbd>Esc</kbd></div></div>' +
    '<div class="galeria-grade"></div></div>';
  document.body.appendChild(galeria);
  var grade = galeria.querySelector(".galeria-grade"), buscaGaleria = galeria.querySelector(".galeria-busca");
  // Desenho simbólico do projeto: um bloco por equipamento (cor do tipo), ligados pelos cabos.
  function miniatura(dados) {
    var eqs = (dados.equipamentos || []).slice(0, 24), n = eqs.length;
    if (!n) return '<svg viewBox="0 0 200 90" class="galeria-mini"><text x="100" y="50" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">Vazio</text></svg>';
    var colunas = Math.max(1, Math.ceil(Math.sqrt(n * 2.2))), linhas = Math.ceil(n / colunas), pos = {};
    eqs.forEach(function (e, i) {
      var cx = colunas > 1 ? 18 + (i % colunas) * (164 / (colunas - 1)) : 100;
      var cy = linhas > 1 ? 16 + Math.floor(i / colunas) * (58 / (linhas - 1)) : 45;
      pos[e.id] = [cx, cy];
    });
    var cabos = (dados.conexoes || []).filter(function (c) { return pos[c.de] && pos[c.para]; }).slice(0, 40).map(function (c) {
      var a = pos[c.de], b = pos[c.para], m = (a[0] + b[0]) / 2;
      return '<path d="M' + a[0] + ' ' + a[1] + ' C' + m + ' ' + a[1] + ' ' + m + ' ' + b[1] + ' ' + b[0] + ' ' + b[1] + '"/>';
    }).join("");
    var blocos = eqs.map(function (e) {
      var p = pos[e.id];
      return '<rect x="' + (p[0] - 6) + '" y="' + (p[1] - 5) + '" width="12" height="10" rx="2.5" fill="' + (window.GrafoCores ? window.GrafoCores(e.tipo) : "#71ebd6") + '"/>';
    }).join("");
    return '<svg viewBox="0 0 200 90" class="galeria-mini"><g class="galeria-cabos">' + cabos + '</g>' + blocos + '</svg>';
  }
  function renderGaleria() {
    var q = semAcento(buscaGaleria.value).trim(), atual = app.projetoAtual();
    var nomes = app.nomesProjetos().filter(function (n) { return !q || semAcento(n).indexOf(q) >= 0; })
      .sort(function (a, b) { return (b === atual) - (a === atual) || a.localeCompare(b, "pt"); });
    grade.innerHTML = nomes.map(function (nome) {
      var d = app.dadosProjeto(nome) || {};
      var ne = (d.equipamentos || []).length, nc = (d.conexoes || []).length, nr = (d.racks || []).length;
      return '<button type="button" class="galeria-cartao' + (nome === atual ? " atual" : "") + '" data-projeto="' + esc(nome) + '">' + miniatura(d) +
        '<span class="galeria-nome">' + esc(nome) + (nome === atual ? ' <em>aberto</em>' : '') + '</span>' +
        '<span class="galeria-info">' + ne + ' equip. · ' + nc + ' cabos' + (nr ? ' · ' + nr + ' racks' : '') + '</span></button>';
    }).join("") || '<div class="paleta-vazio">Nenhum projeto com esse nome.</div>';
  }
  function abrirGaleria() { galeria.hidden = false; buscaGaleria.value = ""; renderGaleria(); buscaGaleria.focus(); }
  function fecharGaleria() { galeria.hidden = true; }
  buscaGaleria.addEventListener("input", renderGaleria);
  grade.addEventListener("click", function (ev) {
    var c = ev.target.closest("[data-projeto]");
    if (!c) return;
    var nome = c.getAttribute("data-projeto");
    fecharGaleria();
    if (nome !== app.projetoAtual()) app.trocarProjeto(nome);
  });
  galeria.querySelector("[data-galeria-novo]").addEventListener("click", function () { fecharGaleria(); clicar("btnNovoProjeto")(); });
  galeria.addEventListener("mousedown", function (ev) { if (ev.target === galeria) fecharGaleria(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !galeria.hidden) { ev.preventDefault(); fecharGaleria(); } });
  ACOES.unshift({ titulo: "Ver todos os projetos", grupo: "Projeto", icone: "pasta", fazer: abrirGaleria, termos: "galeria lista projetos abrir trocar" });
  var ferramentasProjeto = document.querySelector(".project-tools");
  if (ferramentasProjeto && !document.getElementById("btnGaleria")) {
    var botaoGaleria = document.createElement("button");
    botaoGaleria.type = "button"; botaoGaleria.id = "btnGaleria"; botaoGaleria.className = "ghost ferramenta";
    botaoGaleria.setAttribute("data-icone", "grade"); botaoGaleria.setAttribute("data-dica", "Todos os projetos"); botaoGaleria.setAttribute("aria-label", "Todos os projetos");
    botaoGaleria.addEventListener("click", abrirGaleria);
    var seletorProjeto = document.getElementById("projetoSelect");
    ferramentasProjeto.insertBefore(botaoGaleria, seletorProjeto ? seletorProjeto.nextSibling : null);
  }

  window.GrafoComandos = { abrir: abrir, fechar: fechar, galeria: abrirGaleria };
})();
