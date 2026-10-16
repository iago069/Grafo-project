/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. */
// Tela de Início e Biblioteca (documentação no estilo BookStack), separadas dos
// diagramas. Estrutura: estantes → livros → capítulos → páginas.
// - Dados: { estantes:[{id,nome,descricao,cor}], livros:[{id,estanteId,nome,descricao,projeto,cor}],
//   paginas:[{id,livroId,capitulo,titulo,texto,anexos:[{caminho,nome,tamanho,mime}],atualizado}] }
// - Logado: tabela grafo_biblioteca (uma linha por pessoa) + cópia no navegador.
//   Sem login: só no navegador. Anexos: Supabase Storage, bucket "documentos".
// - Um livro pode ser ligado a um diagrama (projeto): "Documentos" na barra lateral
//   abre o livro do projeto aberto (e cria, na estante POPs, se não existir).
// - Na primeira vez, os documentos antigos (dentro dos projetos) viram livros.
(function () {
  "use strict";
  var app = window.GrafoApp;
  if (!app || document.getElementById("telaInicio")) return;

  var BUCKET = "documentos", TAMANHO_MAX = 50 * 1024 * 1024;
  var CORES = ["#2F80ED", "#1F9D8D", "#E0932F", "#B65CD6", "#D64545", "#3BA55C", "#5B6CFF", "#C2185B"];

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function novoId(p) { return p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function slug(t) { return semAcento(t).replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "arquivo"; }
  function tamanhoLegivel(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function dataLegivel(iso) { try { return new Date(iso).toLocaleDateString("pt-BR"); } catch (e) { return ""; } }
  function avisar(t) { if (app.avisar) app.avisar(t); }
  function auth() { return window.GrafoAuth; }
  function cliente() { var a = auth(); return a && a.client ? a.client() : null; }
  function usuario() { var a = auth(); return a && a.userId ? a.userId() : null; }

  // Markdown simples: títulos, listas, passos, negrito, código, links e citações.
  function renderTexto(texto) {
    var linhas = String(texto || "").split(/\r?\n/), html = "", lista = null, emCodigo = false, codigo = [];
    function fecharLista() { if (lista) { html += "</" + lista + ">"; lista = null; } }
    function inline(t) {
      return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }
    linhas.forEach(function (l) {
      var m;
      if (/^```/.test(l)) { if (emCodigo) { html += "<pre>" + esc(codigo.join("\n")) + "</pre>"; codigo = []; } else fecharLista(); emCodigo = !emCodigo; return; }
      if (emCodigo) { codigo.push(l); return; }
      if ((m = /^(#{1,3})\s+(.*)/.exec(l))) { fecharLista(); html += "<h" + (m[1].length + 1) + ">" + inline(m[2]) + "</h" + (m[1].length + 1) + ">"; }
      else if ((m = /^>\s?(.*)/.exec(l))) { fecharLista(); html += "<blockquote>" + inline(m[1]) + "</blockquote>"; }
      else if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (lista !== "ul") { fecharLista(); html += "<ul>"; lista = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (lista !== "ol") { fecharLista(); html += "<ol>"; lista = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if (!l.trim()) fecharLista();
      else { fecharLista(); html += "<p>" + inline(l) + "</p>"; }
    });
    if (emCodigo) html += "<pre>" + esc(codigo.join("\n")) + "</pre>";
    fecharLista();
    return html || '<p class="bib-vazio">Página em branco. Clique em Editar para escrever.</p>';
  }

  // ---- dados e sincronização ----------------------------------------------------
  var dados = { estantes: [], livros: [], paginas: [] };
  var chaveCache = "grafo-biblioteca:" + (usuario() || "convidado");
  var timerSalvar = null, salvandoNuvem = false, nuvemOk = true;
  function normalizar(d) {
    d = d && typeof d === "object" ? d : {};
    return { estantes: Array.isArray(d.estantes) ? d.estantes : [], livros: Array.isArray(d.livros) ? d.livros : [], paginas: Array.isArray(d.paginas) ? d.paginas : [], migrado: !!d.migrado };
  }
  try { dados = normalizar(JSON.parse(localStorage.getItem(chaveCache))); } catch (e) {}
  function salvar() {
    try { localStorage.setItem(chaveCache, JSON.stringify(dados)); } catch (e) {}
    var sb = cliente(), uid = usuario();
    if (!sb || !uid) return;
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () {
      salvandoNuvem = true;
      sb.from("grafo_biblioteca").upsert({ user_id: uid, dados: dados, atualizado_em: new Date().toISOString() }).then(function (r) {
        salvandoNuvem = false;
        nuvemOk = !r.error;
        if (r.error) avisar("A biblioteca ficou salva só neste navegador: " + r.error.message);
      });
    }, 700);
  }
  function carregarDaNuvem() {
    var sb = cliente(), uid = usuario();
    if (!sb || !uid) return Promise.resolve();
    return sb.from("grafo_biblioteca").select("dados").eq("user_id", uid).maybeSingle().then(function (r) {
      if (r.error) { nuvemOk = false; return; }
      if (r.data && r.data.dados && !salvandoNuvem && !timerSalvar) {
        dados = normalizar(r.data.dados);
        try { localStorage.setItem(chaveCache, JSON.stringify(dados)); } catch (e) {}
      }
    });
  }

  // Documentos antigos (procedimentos e arquivos dentro dos projetos) viram livros.
  function migrarDocumentosAntigos() {
    if (dados.migrado) return false;
    var mudou = false;
    (app.nomesProjetos ? app.nomesProjetos() : []).forEach(function (nome) {
      var p = app.dadosProjeto(nome);
      var docs = p && Array.isArray(p.documentos) ? p.documentos : [];
      if (!docs.length) return;
      var livro = livroDoProjeto(nome, true);
      docs.forEach(function (doc) {
        dados.paginas.push({ id: novoId("pg"), livroId: livro.id, capitulo: doc.pasta || "", titulo: doc.titulo || "Sem título", texto: doc.texto || "",
          anexos: doc.tipo === "arquivo" && doc.caminho ? [{ caminho: doc.caminho, nome: doc.nomeArquivo, tamanho: doc.tamanho, mime: doc.mime }] : [],
          atualizado: doc.atualizado || new Date().toISOString() });
      });
      mudou = true;
    });
    dados.migrado = true;
    return mudou;
  }

  function estante(id) { return dados.estantes.find(function (e) { return e.id === id; }); }
  function livro(id) { return dados.livros.find(function (l) { return l.id === id; }); }
  function pagina(id) { return dados.paginas.find(function (p) { return p.id === id; }); }
  function livrosDa(estanteId) { return dados.livros.filter(function (l) { return l.estanteId === estanteId; }); }
  function paginasDo(livroId) { return dados.paginas.filter(function (p) { return p.livroId === livroId; }); }
  function estanteChamada(nome, criar) {
    var e = dados.estantes.find(function (x) { return semAcento(x.nome) === semAcento(nome); });
    if (!e && criar) { e = { id: novoId("es"), nome: nome, descricao: "", cor: CORES[dados.estantes.length % CORES.length] }; dados.estantes.push(e); }
    return e;
  }
  function livroDoProjeto(nomeProjeto, criar) {
    var l = dados.livros.find(function (x) { return x.projeto === nomeProjeto; });
    if (!l && criar) {
      var e = estanteChamada("POPs", true);
      l = { id: novoId("lv"), estanteId: e.id, nome: nomeProjeto, descricao: "Documentação do diagrama " + nomeProjeto, projeto: nomeProjeto, cor: CORES[dados.livros.length % CORES.length] };
      dados.livros.push(l);
    }
    return l;
  }

  // ---- vista: Início / Biblioteca x Diagrama -------------------------------------
  var tela = { nome: "inicio" }; // inicio | estante | livro (com paginaId e editando)
  var raiz = document.createElement("section");
  raiz.id = "telaInicio";
  raiz.className = "inicio";
  raiz.setAttribute("aria-label", "Início e biblioteca");
  var workspace = document.querySelector(".workspace");
  if (workspace && workspace.parentNode) workspace.parentNode.insertBefore(raiz, workspace);
  else document.body.appendChild(raiz);

  // Alternador no topo: Início | Diagrama.
  var barra = document.querySelector(".theme-toolbar");
  var alternador = document.createElement("div");
  alternador.className = "vista-alternador";
  alternador.setAttribute("role", "tablist");
  alternador.innerHTML = '<button type="button" role="tab" data-vista-ir="inicio">Início</button><button type="button" role="tab" data-vista-ir="editor">Diagrama</button>';
  if (barra) barra.insertBefore(alternador, barra.firstChild);
  alternador.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-vista-ir]");
    if (!b) return;
    if (b.getAttribute("data-vista-ir") === "inicio") irPara({ nome: "inicio" }); else mostrarEditor();
  });
  var marca = document.querySelector(".sidebar .brand");
  if (marca) { marca.style.cursor = "pointer"; marca.title = "Ir para o Início"; marca.addEventListener("click", function () { irPara({ nome: "inicio" }); }); }

  function definirVista(v) {
    document.body.setAttribute("data-vista", v);
    alternador.querySelectorAll("[data-vista-ir]").forEach(function (b) { var on = b.getAttribute("data-vista-ir") === v; b.classList.toggle("ativo", on); b.setAttribute("aria-selected", String(on)); });
    if (v === "editor") window.dispatchEvent(new Event("resize"));
  }
  function mostrarEditor() { definirVista("editor"); }
  function irPara(t) {
    if (tela.editando && !(t.nome === tela.nome && t.paginaId === tela.paginaId)) {
      if (!window.confirm("Há uma página sendo editada. Sair sem salvar?")) return;
    }
    tela = t;
    definirVista("inicio");
    render();
    raiz.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // ---- render ------------------------------------------------------------------------
  function trilha(itens) {
    return '<nav class="bib-trilha" aria-label="Caminho">' + itens.map(function (it, i) {
      return (i ? '<span class="bib-trilha-sep">›</span>' : "") + (it.ir ? '<button type="button" class="bib-trilha-item" data-ir=\'' + esc(JSON.stringify(it.ir)) + '\'>' + esc(it.nome) + '</button>' : '<span class="bib-trilha-atual">' + esc(it.nome) + '</span>');
    }).join("") + '</nav>';
  }
  function capaLivro(l) {
    var n = paginasDo(l.id).length;
    return '<button type="button" class="bib-livro" data-ir=\'' + esc(JSON.stringify({ nome: "livro", livroId: l.id })) + '\' style="--cor-livro:' + esc(l.cor || CORES[0]) + '">' +
      '<span class="bib-livro-capa"><span class="bib-livro-lombada"></span><strong>' + esc(l.nome) + '</strong>' + (l.projeto ? '<em class="bib-selo">diagrama</em>' : '') + '</span>' +
      '<span class="bib-livro-info">' + n + (n === 1 ? " página" : " páginas") + '</span></button>';
  }

  function render() {
    if (tela.nome === "estante" && !estante(tela.estanteId)) tela = { nome: "inicio" };
    if (tela.nome === "livro" && !livro(tela.livroId)) tela = { nome: "inicio" };
    if (tela.nome === "inicio") renderInicio();
    else if (tela.nome === "estante") renderEstante();
    else renderLivro();
  }

  function renderInicio() {
    var nome = (document.getElementById("sidebarUsuarioNome") || {}).textContent || "";
    var hora = new Date().getHours();
    var saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    var projetos = (app.nomesProjetos ? app.nomesProjetos() : []).slice(0, 8);
    var recentes = dados.paginas.slice().sort(function (a, b) { return String(b.atualizado).localeCompare(String(a.atualizado)); }).slice(0, 6);
    raiz.innerHTML =
      '<div class="inicio-topo"><div><span class="inicio-sobre">Grafo</span><h1>' + esc(saudacao + (nome && nome !== "Sem login" ? ", " + nome : "")) + '</h1>' +
        '<p>Seus diagramas e a documentação da rede num lugar só.</p></div>' +
        '<label class="inicio-busca"><span class="paleta-lupa" aria-hidden="true"></span><input type="search" data-bib-busca placeholder="Buscar na biblioteca (páginas, livros, estantes)" aria-label="Buscar na biblioteca"></label></div>' +
      '<div class="bib-resultados" data-bib-resultados hidden></div>' +
      '<section class="inicio-bloco"><div class="inicio-bloco-topo"><h2>Diagramas</h2><div class="inicio-acoes">' +
        '<button type="button" class="ghost small" data-acao="todos-diagramas">Ver todos</button><button type="button" class="primary small" data-acao="novo-diagrama">+ Novo diagrama</button></div></div>' +
        '<div class="inicio-diagramas">' + projetos.map(function (n) {
          var d = app.dadosProjeto(n) || {};
          var lv = livroDoProjeto(n, false);
          return '<button type="button" class="inicio-diagrama' + (n === app.projetoAtual() ? " atual" : "") + '" data-abrir-projeto="' + esc(n) + '">' +
            '<span class="inicio-diagrama-icone" aria-hidden="true"></span><span class="inicio-diagrama-textos"><strong>' + esc(n) + '</strong>' +
            '<small>' + (d.equipamentos || []).length + ' equip. · ' + (d.conexoes || []).length + ' cabos' + ((d.racks || []).length ? ' · ' + d.racks.length + ' racks' : '') + (lv ? ' · com documentação' : '') + '</small></span></button>';
        }).join("") + '</div></section>' +
      '<section class="inicio-bloco"><div class="inicio-bloco-topo"><h2>Biblioteca</h2><div class="inicio-acoes"><button type="button" class="primary small" data-acao="nova-estante">+ Estante</button></div></div>' +
        (dados.estantes.length ? '<div class="bib-estantes">' + dados.estantes.map(function (e) {
          var livros = livrosDa(e.id);
          return '<article class="bib-estante" style="--cor-estante:' + esc(e.cor || CORES[0]) + '"><button type="button" class="bib-estante-topo" data-ir=\'' + esc(JSON.stringify({ nome: "estante", estanteId: e.id })) + '\'>' +
            '<strong>' + esc(e.nome) + '</strong><span>' + livros.length + (livros.length === 1 ? " livro" : " livros") + '</span></button>' +
            '<div class="bib-prateleira">' + (livros.slice(0, 6).map(capaLivro).join("") || '<p class="bib-vazio">Estante vazia.</p>') + '</div></article>';
        }).join("") + '</div>'
        : '<div class="bib-boas-vindas"><strong>Monte a sua biblioteca</strong><p>Crie estantes (ex.: POPs, Procedimentos, Fornecedores), livros dentro delas e páginas com manuais, procedimentos e anexos. A documentação de um diagrama vai para a estante POPs pelo item <em>Documentos</em> da barra lateral.</p><button type="button" class="primary" data-acao="nova-estante">Criar a primeira estante</button></div>') +
      '</section>' +
      (recentes.length ? '<section class="inicio-bloco"><div class="inicio-bloco-topo"><h2>Páginas recentes</h2></div><div class="bib-recentes">' + recentes.map(function (p) {
        var l = livro(p.livroId);
        return '<button type="button" class="bib-recente" data-ir=\'' + esc(JSON.stringify({ nome: "livro", livroId: p.livroId, paginaId: p.id })) + '\'><strong>' + esc(p.titulo) + '</strong><small>' + esc(l ? l.nome : "") + ' · ' + esc(dataLegivel(p.atualizado)) + '</small></button>';
      }).join("") + '</div></section>' : '') +
      (usuario() && !nuvemOk ? '<p class="bib-nota">A biblioteca está salva só neste navegador (a tabela da biblioteca ainda não existe no Supabase).</p>' : '');
  }

  function renderEstante() {
    var e = estante(tela.estanteId), livros = livrosDa(e.id);
    raiz.innerHTML = trilha([{ nome: "Início", ir: { nome: "inicio" } }, { nome: e.nome }]) +
      '<div class="bib-cabecalho" style="--cor-estante:' + esc(e.cor) + '"><div><h1>' + esc(e.nome) + '</h1><p>' + esc(e.descricao || livros.length + (livros.length === 1 ? " livro" : " livros")) + '</p></div>' +
      '<div class="inicio-acoes"><button type="button" class="ghost small" data-acao="renomear-estante">Renomear</button><button type="button" class="ghost small danger-texto" data-acao="excluir-estante">Excluir estante</button>' +
      '<button type="button" class="primary small" data-acao="novo-livro">+ Livro</button></div></div>' +
      (livros.length ? '<div class="bib-livros-grade">' + livros.map(capaLivro).join("") + '</div>' : '<div class="bib-boas-vindas"><strong>Estante vazia</strong><p>Crie um livro para guardar as páginas (ex.: "POP Centro", "Manuais Datacom").</p><button type="button" class="primary" data-acao="novo-livro">Criar livro</button></div>');
  }

  function renderLivro() {
    var l = livro(tela.livroId), e = estante(l.estanteId), paginas = paginasDo(l.id);
    var p = tela.paginaId ? pagina(tela.paginaId) : paginas[0];
    if (p && p.livroId !== l.id) p = null;
    var capitulos = {};
    paginas.forEach(function (x) { (capitulos[x.capitulo || ""] = capitulos[x.capitulo || ""] || []).push(x); });
    var nomesCap = Object.keys(capitulos).sort(function (a, b) { return (a === "") - (b === "") || a.localeCompare(b, "pt"); });
    var indice = nomesCap.map(function (c) {
      return (c ? '<div class="bib-capitulo">' + esc(c) + '</div>' : '') + capitulos[c].map(function (x) {
        return '<button type="button" class="bib-indice-item' + (p && x.id === p.id ? " ativo" : "") + '" data-ir=\'' + esc(JSON.stringify({ nome: "livro", livroId: l.id, paginaId: x.id })) + '\'>' + esc(x.titulo) + '</button>';
      }).join("");
    }).join("");
    var conteudo;
    if (!p) conteudo = '<div class="bib-boas-vindas"><strong>Livro sem páginas</strong><p>Escreva a primeira página: um procedimento, a descrição do POP, contatos, senhas de acesso físico, fotos…</p><button type="button" class="primary" data-acao="nova-pagina">+ Página</button></div>';
    else if (tela.editando) {
      conteudo = '<form class="bib-editor nav-form" data-bib-form>' +
        '<div class="nav-form-grid"><label>Título<input name="titulo" maxlength="140" required value="' + esc(p.titulo) + '"></label>' +
        '<label>Capítulo (opcional)<input name="capitulo" maxlength="80" list="bib-capitulos" value="' + esc(p.capitulo) + '" placeholder="Ex.: Acesso, Energia, Procedimentos"></label></div>' +
        '<datalist id="bib-capitulos">' + nomesCap.filter(Boolean).map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + '</datalist>' +
        '<label class="full">Conteúdo<textarea name="texto" rows="18" maxlength="50000" placeholder="# Título&#10;- item&#10;1. passo&#10;**negrito**, `comando`, [link](https://...)&#10;```&#10;bloco de código&#10;```">' + esc(p.texto) + '</textarea></label>' +
        '<div class="nav-form-actions"><button type="button" class="ghost" data-acao="cancelar-edicao">Cancelar</button><button type="submit" class="primary">Salvar página</button></div></form>';
    } else {
      conteudo = '<div class="bib-pagina-topo"><div><h1>' + esc(p.titulo) + '</h1><span class="bib-meta">' + esc([p.capitulo, "atualizada em " + dataLegivel(p.atualizado)].filter(Boolean).join(" · ")) + '</span></div>' +
        '<div class="inicio-acoes"><button type="button" class="primary small" data-acao="editar-pagina">Editar</button>' +
        '<label class="ghost small bib-anexar" tabindex="0" role="button" data-botao-arquivo>Anexar arquivo<input type="file" data-bib-anexo hidden></label>' +
        '<button type="button" class="ghost small danger-texto" data-acao="excluir-pagina">Excluir</button></div></div>' +
        '<article class="bib-texto">' + renderTexto(p.texto) + '</article>' +
        ((p.anexos || []).length ? '<div class="bib-anexos"><h4>Anexos</h4>' + p.anexos.map(function (a, i) {
          return '<div class="bib-anexo"><span class="docs-icone arquivo"></span><div><strong>' + esc(a.nome) + '</strong><small>' + esc([a.mime, a.tamanho ? tamanhoLegivel(a.tamanho) : ""].filter(Boolean).join(" · ")) + '</small></div>' +
            '<button type="button" class="ghost small" data-abrir-anexo="' + i + '">Abrir</button><button type="button" class="ghost small danger-texto" data-remover-anexo="' + i + '" aria-label="Remover anexo">×</button></div>';
        }).join("") + '</div>' : '');
    }
    raiz.innerHTML = trilha([{ nome: "Início", ir: { nome: "inicio" } }, { nome: e ? e.nome : "Sem estante", ir: e ? { nome: "estante", estanteId: e.id } : null }, { nome: l.nome }]) +
      '<div class="bib-livro-layout">' +
        '<aside class="bib-indice" style="--cor-livro:' + esc(l.cor) + '"><div class="bib-indice-capa"><strong>' + esc(l.nome) + '</strong>' + (l.descricao ? '<small>' + esc(l.descricao) + '</small>' : '') + '</div>' +
          (l.projeto ? '<button type="button" class="ghost small bib-abrir-diagrama" data-abrir-projeto="' + esc(l.projeto) + '">Abrir o diagrama</button>' : '') +
          '<button type="button" class="primary small" data-acao="nova-pagina">+ Página</button>' +
          '<div class="bib-indice-lista">' + (indice || '<p class="bib-vazio">Sem páginas.</p>') + '</div>' +
          '<div class="bib-indice-rodape"><button type="button" class="ghost small" data-acao="renomear-livro">Renomear livro</button><button type="button" class="ghost small danger-texto" data-acao="excluir-livro">Excluir livro</button></div></aside>' +
        '<section class="bib-conteudo">' + conteudo + '</section></div>';
    if (tela.editando) { var t = raiz.querySelector("[name=titulo]"); if (t) t.focus(); }
  }

  // ---- busca ------------------------------------------------------------------------
  function buscar(q) {
    q = semAcento(q).trim();
    if (!q) return [];
    var r = [];
    dados.estantes.forEach(function (e) { if (semAcento(e.nome).indexOf(q) >= 0) r.push({ tipo: "Estante", titulo: e.nome, ir: { nome: "estante", estanteId: e.id } }); });
    dados.livros.forEach(function (l) { if (semAcento(l.nome + " " + l.descricao).indexOf(q) >= 0) r.push({ tipo: "Livro", titulo: l.nome, ir: { nome: "livro", livroId: l.id } }); });
    dados.paginas.forEach(function (p) {
      var texto = semAcento(p.texto), i = texto.indexOf(q);
      if (semAcento(p.titulo).indexOf(q) >= 0 || i >= 0) {
        var l = livro(p.livroId);
        r.push({ tipo: "Página", titulo: p.titulo, sub: (l ? l.nome : "") + (i >= 0 ? " · …" + String(p.texto).slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, " ") + "…" : ""), ir: { nome: "livro", livroId: p.livroId, paginaId: p.id } });
      }
    });
    return r.slice(0, 30);
  }

  // ---- ações -------------------------------------------------------------------------
  function perguntar(texto, padrao) { var v = window.prompt(texto, padrao || ""); return v === null ? null : v.trim(); }
  async function anexar(arquivo) {
    var p = pagina(tela.paginaId) || paginasDo(tela.livroId)[0];
    var sb = cliente(), uid = usuario();
    if (!p) return;
    if (!sb || !uid) { avisar("Para anexar arquivos é preciso entrar na sua conta."); return; }
    if (arquivo.size > TAMANHO_MAX) { avisar("Arquivo grande demais (máximo 50 MB)."); return; }
    var caminho = uid + "/biblioteca/" + p.livroId + "/" + novoId("ax") + "-" + slug(arquivo.name);
    avisar("Enviando " + arquivo.name + "…");
    var r = await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
    if (r.error) { avisar(/not found/i.test(r.error.message) ? "O armazenamento de arquivos (bucket documentos) não existe no Supabase." : "Não foi possível enviar: " + r.error.message); return; }
    p.anexos = (p.anexos || []).concat([{ caminho: caminho, nome: arquivo.name.slice(0, 160), tamanho: arquivo.size, mime: (arquivo.type || "").slice(0, 100) }]);
    p.atualizado = new Date().toISOString();
    salvar(); render();
    avisar(arquivo.name + " anexado.");
  }
  async function abrirAnexo(a) {
    var sb = cliente();
    if (!sb) { avisar("Entre na sua conta para abrir anexos."); return; }
    var aba = window.open("about:blank", "_blank");
    var r = await sb.storage.from(BUCKET).createSignedUrl(a.caminho, 600);
    if (r.error || !r.data) { if (aba) aba.close(); avisar("Não foi possível abrir: " + (r.error ? r.error.message : "arquivo não encontrado")); return; }
    if (aba) aba.location.href = r.data.signedUrl; else window.location.href = r.data.signedUrl;
  }
  function removerArquivos(caminhos) {
    var sb = cliente();
    if (sb && caminhos.length) sb.storage.from(BUCKET).remove(caminhos);
  }

  raiz.addEventListener("click", function (ev) {
    var ir = ev.target.closest("[data-ir]");
    if (ir) { try { irPara(JSON.parse(ir.getAttribute("data-ir"))); } catch (e) {} return; }
    var proj = ev.target.closest("[data-abrir-projeto]");
    if (proj) { abrirDiagrama(proj.getAttribute("data-abrir-projeto")); return; }
    var ab = ev.target.closest("[data-abrir-anexo]");
    if (ab) { var pa = pagina(tela.paginaId) || paginasDo(tela.livroId)[0]; if (pa) abrirAnexo(pa.anexos[Number(ab.getAttribute("data-abrir-anexo"))]); return; }
    var rm = ev.target.closest("[data-remover-anexo]");
    if (rm) {
      var pr = pagina(tela.paginaId) || paginasDo(tela.livroId)[0];
      var a = pr && pr.anexos[Number(rm.getAttribute("data-remover-anexo"))];
      if (a && window.confirm('Remover o anexo "' + a.nome + '"?')) { pr.anexos = pr.anexos.filter(function (x) { return x !== a; }); removerArquivos([a.caminho]); salvar(); render(); }
      return;
    }
    var b = ev.target.closest("[data-acao]");
    if (!b) return;
    var acao = b.getAttribute("data-acao"), nome;
    if (acao === "novo-diagrama") { mostrarEditor(); var bn = document.getElementById("btnNovoProjeto"); if (bn) bn.click(); }
    else if (acao === "todos-diagramas") { if (window.GrafoComandos && window.GrafoComandos.galeria) window.GrafoComandos.galeria(); }
    else if (acao === "nova-estante" && (nome = perguntar("Nome da estante (ex.: POPs, Procedimentos, Fornecedores):"))) {
      var e = estanteChamada(nome, true); salvar(); irPara({ nome: "estante", estanteId: e.id });
    } else if (acao === "renomear-estante" && (nome = perguntar("Novo nome da estante:", estante(tela.estanteId).nome))) {
      estante(tela.estanteId).nome = nome; salvar(); render();
    } else if (acao === "excluir-estante") {
      var es = estante(tela.estanteId), lvs = livrosDa(es.id);
      if (!window.confirm('Excluir a estante "' + es.nome + '"' + (lvs.length ? " e os " + lvs.length + " livros dela (com todas as páginas)" : "") + "?")) return;
      var ids = lvs.map(function (l) { return l.id; });
      removerArquivos(dados.paginas.filter(function (p) { return ids.indexOf(p.livroId) >= 0; }).reduce(function (t, p) { return t.concat((p.anexos || []).map(function (a) { return a.caminho; })); }, []));
      dados.paginas = dados.paginas.filter(function (p) { return ids.indexOf(p.livroId) < 0; });
      dados.livros = dados.livros.filter(function (l) { return l.estanteId !== es.id; });
      dados.estantes = dados.estantes.filter(function (x) { return x.id !== es.id; });
      salvar(); irPara({ nome: "inicio" });
    } else if (acao === "novo-livro" && (nome = perguntar("Nome do livro (ex.: POP Centro, Manuais Datacom):"))) {
      var l = { id: novoId("lv"), estanteId: tela.estanteId, nome: nome, descricao: "", projeto: "", cor: CORES[dados.livros.length % CORES.length] };
      dados.livros.push(l); salvar(); irPara({ nome: "livro", livroId: l.id });
    } else if (acao === "renomear-livro" && (nome = perguntar("Novo nome do livro:", livro(tela.livroId).nome))) {
      livro(tela.livroId).nome = nome; salvar(); render();
    } else if (acao === "excluir-livro") {
      var lv = livro(tela.livroId), pgs = paginasDo(lv.id);
      if (!window.confirm('Excluir o livro "' + lv.nome + '"' + (pgs.length ? " e as " + pgs.length + " páginas dele" : "") + "?")) return;
      removerArquivos(pgs.reduce(function (t, p) { return t.concat((p.anexos || []).map(function (a) { return a.caminho; })); }, []));
      dados.paginas = dados.paginas.filter(function (p) { return p.livroId !== lv.id; });
      dados.livros = dados.livros.filter(function (x) { return x.id !== lv.id; });
      salvar(); irPara({ nome: "estante", estanteId: lv.estanteId });
    } else if (acao === "nova-pagina") {
      var p = { id: novoId("pg"), livroId: tela.livroId, capitulo: "", titulo: "Nova página", texto: "", anexos: [], atualizado: new Date().toISOString() };
      dados.paginas.push(p); salvar();
      tela = { nome: "livro", livroId: tela.livroId, paginaId: p.id, editando: true }; render();
    } else if (acao === "editar-pagina") {
      tela.paginaId = tela.paginaId || (paginasDo(tela.livroId)[0] || {}).id; tela.editando = true; render();
    } else if (acao === "cancelar-edicao") { tela.editando = false; render(); }
    else if (acao === "excluir-pagina") {
      var pe = pagina(tela.paginaId) || paginasDo(tela.livroId)[0];
      if (!pe || !window.confirm('Excluir a página "' + pe.titulo + '"?')) return;
      removerArquivos((pe.anexos || []).map(function (a) { return a.caminho; }));
      dados.paginas = dados.paginas.filter(function (x) { return x !== pe; });
      salvar(); tela = { nome: "livro", livroId: tela.livroId }; render();
    }
  });
  raiz.addEventListener("submit", function (ev) {
    if (!ev.target.matches("[data-bib-form]")) return;
    ev.preventDefault();
    var f = ev.target, p = pagina(tela.paginaId);
    if (!p) return;
    p.titulo = f.titulo.value.trim() || "Sem título";
    p.capitulo = f.capitulo.value.trim();
    p.texto = f.texto.value;
    p.atualizado = new Date().toISOString();
    tela.editando = false;
    salvar(); render();
    avisar("Página salva.");
  });
  raiz.addEventListener("change", function (ev) {
    if (!ev.target.matches("[data-bib-anexo]")) return;
    var arq = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (arq) anexar(arq);
  });
  raiz.addEventListener("input", function (ev) {
    if (!ev.target.matches("[data-bib-busca]")) return;
    var caixa = raiz.querySelector("[data-bib-resultados]"), res = buscar(ev.target.value);
    caixa.hidden = !ev.target.value.trim();
    caixa.innerHTML = res.length ? res.map(function (r) {
      return '<button type="button" class="bib-resultado" data-ir=\'' + esc(JSON.stringify(r.ir)) + '\'><em>' + esc(r.tipo) + '</em><strong>' + esc(r.titulo) + '</strong>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</button>';
    }).join("") : '<p class="bib-vazio">Nada encontrado.</p>';
  });

  function abrirDiagrama(nome) {
    if (nome && nome !== app.projetoAtual() && app.trocarProjeto) app.trocarProjeto(nome);
    mostrarEditor();
  }
  // "Documentos" na barra lateral: abre o livro do diagrama aberto (cria na estante POPs).
  function abrirLivroDoProjeto() {
    var nome = app.projetoAtual();
    var l = livroDoProjeto(nome, true);
    salvar();
    irPara({ nome: "livro", livroId: l.id });
  }
  var botaoDocs = document.getElementById("btnDocumentos");
  if (botaoDocs) {
    botaoDocs.textContent = "Documentação do diagrama";
    botaoDocs.title = "Abre o livro deste diagrama na Biblioteca (estante POPs)";
    botaoDocs.addEventListener("click", abrirLivroDoProjeto);
  }

  // ---- início ------------------------------------------------------------------------
  // Começa no Início, a não ser que a página tenha sido aberta para um equipamento
  // (QR code: ?abrir=) ou que esteja guardado para abrir direto no diagrama.
  var abrirNoEditor = /[?&]abrir=/.test(location.search);
  try { if (localStorage.getItem("grafo-vista-inicial") === "editor") abrirNoEditor = true; } catch (e) {}
  if (migrarDocumentosAntigos()) salvar();
  definirVista(abrirNoEditor ? "editor" : "inicio");
  render();
  carregarDaNuvem().then(function () {
    if (migrarDocumentosAntigos()) salvar();
    if (document.body.getAttribute("data-vista") === "inicio" && !tela.editando) render();
  });

  window.GrafoBiblioteca = {
    inicio: function () { irPara({ nome: "inicio" }); },
    editor: mostrarEditor,
    livroDoProjeto: abrirLivroDoProjeto,
    // Para a paleta de comandos (Ctrl+K).
    candidatos: function () {
      return dados.paginas.map(function (p) {
        var l = livro(p.livroId);
        return { titulo: p.titulo, sub: "Página · " + (l ? l.nome : ""), grupo: "Biblioteca", icone: "lista", termos: [p.capitulo, String(p.texto).slice(0, 400)].join(" "),
          fazer: function () { irPara({ nome: "livro", livroId: p.livroId, paginaId: p.id }); } };
      }).concat(dados.livros.map(function (l) {
        return { titulo: l.nome, sub: "Livro", grupo: "Biblioteca", icone: "lista", fazer: function () { irPara({ nome: "livro", livroId: l.id }); } };
      }));
    }
  };
})();
