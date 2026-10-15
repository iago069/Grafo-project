/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. */
// Documentos do projeto: procedimentos escritos no Grafo (ficam no próprio
// projeto) e arquivos (manuais em PDF etc.) guardados no Supabase Storage,
// bucket "documentos", na pasta <id do usuário>/<projeto>/. Cada documento pode
// ficar ligado ao projeto, a um equipamento ou a um modelo de equipamento.
(function () {
  "use strict";
  var app = window.GrafoApp;
  if (!app || !app.documentosDoProjeto || document.getElementById("documentosApp")) return;

  var BUCKET = "documentos";
  var TAMANHO_MAX = 50 * 1024 * 1024;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function novoId() { return "doc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function slug(t) { return semAcento(t).replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "arquivo"; }
  function tamanhoLegivel(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function dataLegivel(iso) { try { return new Date(iso).toLocaleDateString("pt-BR"); } catch (e) { return ""; } }
  function auth() { return window.GrafoAuth; }
  function cliente() { var a = auth(); return a && a.client ? a.client() : null; }
  function usuario() { var a = auth(); return a && a.userId ? a.userId() : null; }

  // Markdown simples para os procedimentos: títulos, listas, passos, negrito, código.
  function renderTexto(texto) {
    var linhas = String(texto || "").split(/\r?\n/), html = "", lista = null;
    function fecharLista() { if (lista) { html += "</" + lista + ">"; lista = null; } }
    function inline(t) {
      return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    }
    linhas.forEach(function (l) {
      var m;
      if ((m = /^(#{1,3})\s+(.*)/.exec(l))) { fecharLista(); html += "<h" + (m[1].length + 2) + ">" + inline(m[2]) + "</h" + (m[1].length + 2) + ">"; }
      else if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (lista !== "ul") { fecharLista(); html += "<ul>"; lista = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (lista !== "ol") { fecharLista(); html += "<ol>"; lista = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if (!l.trim()) { fecharLista(); }
      else { fecharLista(); html += "<p>" + inline(l) + "</p>"; }
    });
    fecharLista();
    return html || '<p class="doc-vazio-texto">Sem conteúdo ainda.</p>';
  }

  function equipamentos() { return app.equipamentosDoDiagrama ? app.equipamentosDoDiagrama() : []; }
  function nomeDoVinculo(v) {
    if (!v) return "Projeto inteiro";
    if (v.indexOf("equip:") === 0) {
      var eq = equipamentos().find(function (e) { return e.id === v.slice(6); });
      return eq ? "Equipamento: " + eq.nome : "Equipamento removido";
    }
    if (v.indexOf("modelo:") === 0) return "Modelo: " + v.slice(7);
    return v;
  }
  function opcoesVinculo(atual) {
    var html = '<option value="">Projeto inteiro</option>';
    var eqs = equipamentos();
    if (eqs.length) html += '<optgroup label="Equipamento">' + eqs.map(function (e) { var v = "equip:" + e.id; return '<option value="' + esc(v) + '"' + (v === atual ? " selected" : "") + '>' + esc(e.nome) + '</option>'; }).join("") + '</optgroup>';
    var modelos = {};
    eqs.forEach(function (e) { if (e.modelo) modelos[e.modelo] = true; });
    var lista = Object.keys(modelos).sort();
    if (atual && atual.indexOf("modelo:") === 0 && lista.indexOf(atual.slice(7)) < 0) lista.push(atual.slice(7));
    if (lista.length) html += '<optgroup label="Modelo (todos os equipamentos desse modelo)">' + lista.map(function (m) { var v = "modelo:" + m; return '<option value="' + esc(v) + '"' + (v === atual ? " selected" : "") + '>' + esc(m) + '</option>'; }).join("") + '</optgroup>';
    return html;
  }

  // ---- interface -------------------------------------------------------------
  var fundo = document.createElement("div");
  fundo.id = "documentosApp";
  fundo.className = "paleta-fundo docs-fundo";
  fundo.hidden = true;
  fundo.innerHTML =
    '<div class="paleta docs" role="dialog" aria-modal="true" aria-labelledby="docsTitulo">' +
      '<div class="folha-topo"><strong id="docsTitulo">Documentos do projeto</strong>' +
        '<div class="galeria-acoes"><button type="button" class="ghost small" data-doc="novo">+ Procedimento</button>' +
        '<label class="primary small docs-enviar" tabindex="0" role="button" data-botao-arquivo>Enviar arquivo<input type="file" data-doc-arquivo hidden></label>' +
        '<button type="button" class="ghost small" data-doc="fechar" aria-label="Fechar">×</button></div></div>' +
      '<div class="docs-corpo">' +
        '<aside class="docs-lista-lado"><input type="search" class="docs-busca" placeholder="Buscar documento" aria-label="Buscar documento"><div class="docs-lista" data-doc-lista></div></aside>' +
        '<section class="docs-conteudo" data-doc-conteudo></section>' +
      '</div>' +
      '<div class="docs-msg" role="status" aria-live="polite" hidden></div>' +
    '</div>';
  document.body.appendChild(fundo);
  var elLista = fundo.querySelector("[data-doc-lista]");
  var elConteudo = fundo.querySelector("[data-doc-conteudo]");
  var elBusca = fundo.querySelector(".docs-busca");
  var elMsg = fundo.querySelector(".docs-msg");
  var selecionado = null, editando = false, filtroVinculo = null;

  function mensagem(texto, erro) {
    elMsg.hidden = !texto; elMsg.textContent = texto || ""; elMsg.classList.toggle("erro", !!erro);
    clearTimeout(mensagem.t); if (texto && !erro) mensagem.t = setTimeout(function () { elMsg.hidden = true; }, 4000);
  }
  function lista() { return app.documentosDoProjeto(); }
  function gravar(nova, texto) {
    var r = app.salvarDocumentos(nova);
    if (!r.ok) { mensagem("Não foi possível salvar: " + (r.erros && r.erros[0] ? r.erros[0].onde + ": " + r.erros[0].mensagem : "dados inválidos"), true); return false; }
    if (texto) mensagem(texto);
    render();
    return true;
  }

  function filtrados() {
    var q = semAcento(elBusca.value).trim();
    return lista().filter(function (d) {
      if (filtroVinculo && !casaVinculo(d, filtroVinculo)) return false;
      return !q || semAcento([d.titulo, d.pasta, d.texto, d.nomeArquivo, nomeDoVinculo(d.vinculo)].join(" ")).indexOf(q) >= 0;
    }).sort(function (a, b) { return (a.pasta || "").localeCompare(b.pasta || "", "pt") || a.titulo.localeCompare(b.titulo, "pt"); });
  }
  // Documentos de um equipamento: os dele e os do modelo dele.
  function casaVinculo(d, eq) { return d.vinculo === "equip:" + eq.id || (eq.modelo && d.vinculo === "modelo:" + eq.modelo); }

  function render() {
    var docs = filtrados();
    var titulo = fundo.querySelector("#docsTitulo");
    titulo.textContent = filtroVinculo ? "Documentos de " + filtroVinculo.nome : "Documentos do projeto";
    if (!docs.length) {
      elLista.innerHTML = '<p class="docs-vazio">' + (lista().length ? "Nada encontrado." : "Nenhum documento ainda. Escreva um procedimento ou envie um manual.") + '</p>' +
        (filtroVinculo ? '<button type="button" class="ghost small" data-doc="todos">Ver todos os documentos</button>' : "");
    } else {
      var pastaAtual = null, html = "";
      docs.forEach(function (d) {
        var pasta = d.pasta || "Sem pasta";
        if (pasta !== pastaAtual) { pastaAtual = pasta; html += '<div class="docs-pasta">' + esc(pasta) + '</div>'; }
        html += '<button type="button" class="docs-item' + (selecionado === d.id ? " ativo" : "") + '" data-doc-id="' + esc(d.id) + '">' +
          '<span class="docs-icone ' + (d.tipo === "arquivo" ? "arquivo" : "texto") + '"></span>' +
          '<span class="docs-item-textos"><span class="docs-item-titulo">' + esc(d.titulo) + '</span><span class="docs-item-sub">' + esc(nomeDoVinculo(d.vinculo)) + '</span></span></button>';
      });
      if (filtroVinculo) html += '<button type="button" class="ghost small docs-todos" data-doc="todos">Ver todos os documentos</button>';
      elLista.innerHTML = html;
    }
    renderConteudo();
  }

  function renderConteudo() {
    var d = lista().find(function (x) { return x.id === selecionado; });
    if (!d) {
      elConteudo.innerHTML = '<div class="docs-boas-vindas"><strong>Manuais e procedimentos num lugar só</strong>' +
        '<p>Escreva procedimentos (configurar OLT, migrar cliente, GMUD) ou envie manuais em PDF. Ligue cada documento a um equipamento ou a um modelo: todos os equipamentos daquele modelo mostram o manual.</p>' +
        '<p class="docs-dica">Formatação nos procedimentos: <code># Título</code>, <code>- item</code>, <code>1. passo</code>, <code>**negrito**</code>, <code>`comando`</code>.</p></div>';
      return;
    }
    if (editando && d.tipo === "procedimento") {
      elConteudo.innerHTML = '<form class="docs-form nav-form" data-doc-form>' +
        '<label class="full">Título<input name="titulo" maxlength="120" required value="' + esc(d.titulo) + '"></label>' +
        '<div class="nav-form-grid"><label>Pasta<input name="pasta" maxlength="60" list="docs-pastas" value="' + esc(d.pasta) + '" placeholder="Ex.: OLT, Procedimentos"></label>' +
        '<label>Ligado a<select name="vinculo">' + opcoesVinculo(d.vinculo) + '</select></label></div>' +
        '<label class="full">Conteúdo<textarea name="texto" maxlength="20000" rows="16" placeholder="# Configurar OLT nova&#10;1. Conectar no console&#10;2. Rodar `display version`">' + esc(d.texto) + '</textarea></label>' +
        '<datalist id="docs-pastas">' + pastas().map(function (p) { return '<option value="' + esc(p) + '">'; }).join("") + '</datalist>' +
        '<div class="nav-form-actions"><button type="button" class="ghost" data-doc="cancelar">Cancelar</button><button type="submit" class="primary">Salvar</button></div></form>';
      elConteudo.querySelector("[name=titulo]").focus();
      return;
    }
    var acoes = d.tipo === "arquivo"
      ? '<button type="button" class="primary small" data-doc="abrir-arquivo">Abrir arquivo</button>'
      : '<button type="button" class="primary small" data-doc="editar">Editar</button>';
    elConteudo.innerHTML = '<div class="docs-cabecalho"><div><h3>' + esc(d.titulo) + '</h3>' +
      '<span class="docs-meta">' + esc([d.pasta, nomeDoVinculo(d.vinculo), d.atualizado ? "atualizado em " + dataLegivel(d.atualizado) : ""].filter(Boolean).join(" · ")) + '</span></div>' +
      '<div class="docs-acoes">' + acoes + '<select class="docs-vinculo" data-doc-vinculo aria-label="Ligado a">' + opcoesVinculo(d.vinculo) + '</select>' +
      '<button type="button" class="ghost small danger-texto" data-doc="excluir">Excluir</button></div></div>' +
      (d.tipo === "arquivo"
        ? '<div class="docs-arquivo"><span class="docs-icone arquivo grande"></span><div><strong>' + esc(d.nomeArquivo) + '</strong><span>' + esc([d.mime, d.tamanho ? tamanhoLegivel(d.tamanho) : ""].filter(Boolean).join(" · ")) + '</span></div></div>'
        : '<article class="docs-texto">' + renderTexto(d.texto) + '</article>');
  }
  function pastas() { var p = {}; lista().forEach(function (d) { if (d.pasta) p[d.pasta] = true; }); return Object.keys(p).sort(); }

  function abrir(opcoes) {
    opcoes = opcoes || {};
    filtroVinculo = opcoes.equipamento || null;
    selecionado = opcoes.id || null; editando = false;
    elBusca.value = "";
    fundo.hidden = false;
    mensagem("");
    render();
    elBusca.focus();
  }
  function fechar() { fundo.hidden = true; editando = false; }

  function novoProcedimento() {
    var d = { id: novoId(), titulo: "Novo procedimento", tipo: "procedimento", pasta: filtroVinculo ? "" : "", texto: "", vinculo: filtroVinculo ? "equip:" + filtroVinculo.id : "", caminho: "", nomeArquivo: "", tamanho: 0, mime: "", atualizado: new Date().toISOString() };
    if (gravar(lista().concat([d]))) { selecionado = d.id; editando = true; renderConteudo(); render(); }
  }

  async function enviarArquivo(arquivo) {
    var sb = cliente(), uid = usuario();
    if (!sb || !uid) { mensagem("Para enviar arquivos é preciso entrar na sua conta (os arquivos ficam na nuvem).", true); return; }
    if (arquivo.size > TAMANHO_MAX) { mensagem("Arquivo grande demais (máximo " + tamanhoLegivel(TAMANHO_MAX) + ").", true); return; }
    var id = novoId();
    var caminho = uid + "/" + slug(app.projetoAtual()) + "/" + id + "-" + slug(arquivo.name);
    mensagem("Enviando " + arquivo.name + "…");
    var r = await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
    if (r.error) {
      var txt = String(r.error.message || r.error);
      mensagem(/bucket/i.test(txt) && /not found/i.test(txt)
        ? "O armazenamento de arquivos ainda não foi criado no Supabase (bucket \"documentos\"). Veja o guia do desenvolvedor."
        : "Não foi possível enviar: " + txt, true);
      return;
    }
    var d = { id: id, titulo: arquivo.name.replace(/\.[^.]+$/, ""), tipo: "arquivo", pasta: "Manuais", texto: "", vinculo: filtroVinculo ? (filtroVinculo.modelo ? "modelo:" + filtroVinculo.modelo : "equip:" + filtroVinculo.id) : "",
      caminho: caminho, nomeArquivo: arquivo.name.slice(0, 160), tamanho: arquivo.size, mime: (arquivo.type || "").slice(0, 100), atualizado: new Date().toISOString() };
    if (gravar(lista().concat([d]), arquivo.name + " enviado.")) { selecionado = id; render(); }
  }

  async function abrirArquivo(d) {
    var sb = cliente();
    if (!sb) { mensagem("Entre na sua conta para abrir arquivos da nuvem.", true); return; }
    // Abre a aba já no clique (o navegador bloquearia uma aba aberta depois do await).
    var aba = window.open("about:blank", "_blank");
    var r = await sb.storage.from(BUCKET).createSignedUrl(d.caminho, 600);
    if (r.error || !r.data) { if (aba) aba.close(); mensagem("Não foi possível abrir: " + (r.error ? r.error.message : "arquivo não encontrado"), true); return; }
    if (aba) aba.location.href = r.data.signedUrl; else window.location.href = r.data.signedUrl;
  }

  async function excluir(d) {
    var nova = lista().filter(function (x) { return x.id !== d.id; });
    if (d.tipo === "arquivo" && d.caminho && cliente()) {
      var r = await cliente().storage.from(BUCKET).remove([d.caminho]);
      if (r.error) { mensagem("Não foi possível apagar o arquivo na nuvem: " + r.error.message, true); return; }
    }
    selecionado = null;
    gravar(nova, "Documento excluído.");
  }

  // ---- eventos -----------------------------------------------------------------
  elBusca.addEventListener("input", render);
  fundo.addEventListener("click", function (ev) {
    var item = ev.target.closest("[data-doc-id]");
    if (item) { selecionado = item.getAttribute("data-doc-id"); editando = false; render(); return; }
    var b = ev.target.closest("[data-doc]");
    if (!b) return;
    var acao = b.getAttribute("data-doc");
    var d = lista().find(function (x) { return x.id === selecionado; });
    if (acao === "fechar") fechar();
    else if (acao === "novo") novoProcedimento();
    else if (acao === "todos") { filtroVinculo = null; render(); }
    else if (acao === "editar") { editando = true; renderConteudo(); }
    else if (acao === "cancelar") { editando = false; renderConteudo(); }
    else if (acao === "abrir-arquivo" && d) abrirArquivo(d);
    else if (acao === "excluir" && d) excluir(d);
  });
  fundo.addEventListener("change", function (ev) {
    if (ev.target.matches("[data-doc-arquivo]")) {
      var arq = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (arq) enviarArquivo(arq);
    } else if (ev.target.matches("[data-doc-vinculo]")) {
      var v = ev.target.value;
      gravar(lista().map(function (x) { return x.id === selecionado ? Object.assign({}, x, { vinculo: v, atualizado: new Date().toISOString() }) : x; }), "Vínculo atualizado.");
    }
  });
  fundo.addEventListener("submit", function (ev) {
    if (!ev.target.matches("[data-doc-form]")) return;
    ev.preventDefault();
    var f = ev.target;
    var ok = gravar(lista().map(function (x) {
      return x.id === selecionado ? Object.assign({}, x, { titulo: f.titulo.value.trim() || "Sem título", pasta: f.pasta.value.trim(), vinculo: f.vinculo.value, texto: f.texto.value, atualizado: new Date().toISOString() }) : x;
    }), "Procedimento salvo.");
    if (ok) { editando = false; renderConteudo(); }
  });
  fundo.addEventListener("mousedown", function (ev) { if (ev.target === fundo) fechar(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !fundo.hidden) { ev.preventDefault(); fechar(); } });

  // Item no menu lateral e atalho no editor do equipamento.
  var botaoMenu = document.getElementById("btnDocumentos");
  if (botaoMenu) botaoMenu.addEventListener("click", function () { abrir(); });
  var editorForm = document.getElementById("editorEquipForm");
  if (editorForm && !document.getElementById("btnDocsEquip")) {
    var b = document.createElement("button");
    b.type = "button"; b.id = "btnDocsEquip"; b.className = "ghost small docs-do-equip";
    b.textContent = "Documentos deste equipamento";
    b.addEventListener("click", function () {
      var nome = document.getElementById("editEquipNome").value;
      var eq = equipamentos().find(function (e) { return e.nome === nome; });
      if (eq) abrir({ equipamento: eq });
    });
    editorForm.appendChild(b);
  }

  window.GrafoDocumentos = {
    abrir: abrir,
    // Para a paleta de comandos (Ctrl+K).
    candidatos: function () {
      return lista().map(function (d) {
        return { titulo: d.titulo, sub: (d.tipo === "arquivo" ? "Arquivo" : "Procedimento") + " · " + nomeDoVinculo(d.vinculo), grupo: "Documentos", icone: "lista",
          termos: [d.pasta, d.nomeArquivo, d.texto.slice(0, 400)].join(" "), fazer: function () { abrir({ id: d.id }); } };
      });
    }
  };
})();
