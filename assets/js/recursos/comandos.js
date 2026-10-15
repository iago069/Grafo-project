/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. */
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
    { titulo: "Relatório de inventário (.xlsx)", grupo: "Relatórios", icone: "planilha", fazer: clicar("btnInventario"), termos: "planilha excel inventario" },
    { titulo: "Etiquetas com QR code", grupo: "Relatórios", icone: "qrcode", fazer: clicar("btnEtiquetas"), termos: "etiqueta qr imprimir" },
    { titulo: "JSON e CSV", grupo: "Integração", icone: "codigo", fazer: abrirPainel("navJsonCsv"), termos: "json csv planilha importar" },
    { titulo: "NetBox e status online", grupo: "Integração", icone: "cabo", fazer: abrirPainel("navNetbox"), termos: "netbox ping online agente" },
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
        '<input type="text" class="paleta-input" placeholder="Buscar equipamento, projeto ou ação…" aria-label="Buscar" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="paletaLista">' +
        '<kbd>Esc</kbd></div>' +
      '<div class="paleta-lista" id="paletaLista" role="listbox"></div>' +
      '<div class="paleta-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> abrir a paleta</span></div>' +
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

  function candidatos() {
    var lista = [];
    var nomeAtual = app.projetoAtual();
    var dados = app.dadosProjeto(nomeAtual) || { equipamentos: [] };
    (dados.equipamentos || []).forEach(function (eq) {
      lista.push({ titulo: eq.nome || eq.id, sub: [eq.tipo, eq.ip, eq.modelo, eq.grupo].filter(Boolean).join(" · "), grupo: "Equipamentos", icone: "equip", termos: [eq.tipo, eq.ip, eq.modelo, eq.grupo].join(" "),
        fazer: function () { modo(document.getElementById("modoDiagrama").value === "racks" ? "topologia" : document.getElementById("modoDiagrama").value)(); app.editarEquipamento(eq.id); } });
    });
    app.nomesProjetos().forEach(function (nome) {
      if (nome === nomeAtual) return;
      lista.push({ titulo: nome, sub: "Abrir projeto", grupo: "Projetos", icone: "pasta", fazer: function () { app.trocarProjeto(nome); } });
    });
    ACOES.forEach(function (a) { if (!a.visivel || a.visivel()) lista.push(a); });
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
    var pont = candidatos().map(function (c) { return { c: c, p: pontuar(c, q) }; }).filter(function (x) { return x.p > 0; });
    if (q) pont.sort(function (a, b) { return b.p - a.p; });
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

  function executar(i) {
    var it = itens[i];
    if (!it) return;
    fechar(false);
    setTimeout(function () { try { it.fazer(); } catch (e) { console.error(e); } }, 30);
  }

  function abrir() {
    if (!fundo.hidden) return;
    focoAntes = document.activeElement;
    fundo.hidden = false;
    fundo.classList.remove("saindo");
    input.value = ""; ativo = 0; render();
    input.focus();
  }
  function fechar(devolverFoco) {
    if (fundo.hidden) return;
    fundo.classList.add("saindo");
    setTimeout(function () { fundo.hidden = true; fundo.classList.remove("saindo"); }, 140);
    if (devolverFoco !== false && focoAntes && focoAntes.focus) focoAntes.focus();
  }

  input.addEventListener("input", function () { ativo = 0; render(); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); mover(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); mover(-1); }
    else if (ev.key === "Enter") { ev.preventDefault(); executar(ativo); }
    else if (ev.key === "Escape") { ev.preventDefault(); fechar(); }
  });
  lista.addEventListener("mousemove", function (ev) {
    var el = ev.target.closest(".paleta-item");
    if (!el) return;
    var i = Number(el.getAttribute("data-i"));
    if (i !== ativo) { ativo = i; mover(0); }
  });
  lista.addEventListener("click", function (ev) { var el = ev.target.closest(".paleta-item"); if (el) executar(Number(el.getAttribute("data-i"))); });
  fundo.addEventListener("mousedown", function (ev) { if (ev.target === fundo) fechar(); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !fundo.hidden) { ev.preventDefault(); fechar(); return; }
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "k" || ev.key === "K")) {
      if (document.body.classList.contains("auth-locked")) return;
      ev.preventDefault();
      if (fundo.hidden) abrir(); else fechar();
    }
  });
  window.GrafoComandos = { abrir: abrir, fechar: fechar };
})();
