/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0. */
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
  // Projeto renomeado no editor: o livro ligado a ele passa a usar o nome novo.
  window.addEventListener("grafo:projeto-renomeado", function (ev) {
    var d = ev.detail || {}, mudou = false;
    dados.livros.forEach(function (l) { if (l.projeto === d.antigo) { l.projeto = d.novo; mudou = true; } });
    if (mudou) salvar();
  });

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
  alternador.innerHTML = '<button type="button" role="tab" data-vista-ir="editor">Diagrama</button><button type="button" role="tab" data-vista-ir="biblioteca">Biblioteca</button>';
  if (barra) barra.insertBefore(alternador, barra.firstChild);
  alternador.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-vista-ir]");
    if (!b) return;
    var alvo = b.getAttribute("data-vista-ir");
    if (alvo === "editor") mostrarEditor(); else irPara({ nome: alvo });
  });
  var marca = document.querySelector(".sidebar .brand");
  if (marca) { marca.style.cursor = "pointer"; marca.title = "Ir para o Início"; marca.addEventListener("click", function () { irPara({ nome: "inicio" }); }); }

  function definirVista(v) {
    document.body.setAttribute("data-vista", v);
    var aba = v === "editor" ? "editor" : (tela.nome === "inicio" ? "" : "biblioteca");
    // Guarda onde a pessoa parou, para abrir ali na próxima vez (o Início animado não conta).
    if (v === "editor" || tela.nome !== "inicio") {
      try { localStorage.setItem("grafo-ultima-vista", JSON.stringify(v === "editor" ? { vista: "editor" } : { vista: "biblioteca", tela: { nome: tela.nome, estanteId: tela.estanteId, livroId: tela.livroId, paginaId: tela.paginaId } })); } catch (e) {}
    }
    alternador.querySelectorAll("[data-vista-ir]").forEach(function (b) { var on = b.getAttribute("data-vista-ir") === aba; b.classList.toggle("ativo", on); b.setAttribute("aria-selected", String(on)); });
    if (v === "editor") window.dispatchEvent(new Event("resize"));
  }
  // O diagrama só mede direito com o editor visível: mostra primeiro, depois redesenha.
  function mostrarEditor() { pararCena(); definirVista("editor"); if (app.redesenhar) app.redesenhar(); }
  async function irPara(t) {
    if (tela.editando && !(t.nome === tela.nome && t.paginaId === tela.paginaId)) {
      if (!await confirmar("Há uma página sendo editada. Sair sem salvar?", "Página não salva", "Sair sem salvar")) return;
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
  // Livro em pé na estante, visto de lado: a lombada com o nome na vertical.
  // Altura e largura variam um pouco (pelo nome) para a prateleira parecer de verdade.
  function capaLivro(l) {
    var n = paginasDo(l.id).length, h = 0;
    for (var i = 0; i < l.nome.length; i++) h = (h * 31 + l.nome.charCodeAt(i)) & 0xffff;
    var altura = 184 + (h % 5) * 9, largura = 46 + Math.min(16, n * 2) + (h % 3) * 3;
    return '<button type="button" class="bib-livro" data-ir=\'' + esc(JSON.stringify({ nome: "livro", livroId: l.id })) + '\' style="--cor-livro:' + esc(l.cor || CORES[0]) + ';--alt:' + altura + 'px;--larg:' + largura + 'px" title="' + esc(l.nome + " · " + n + (n === 1 ? " página" : " páginas")) + '">' +
      '<span class="bib-lombada"><span class="bib-lombada-faixa"></span><strong>' + esc(l.nome) + '</strong>' + (l.projeto ? '<em class="bib-lombada-selo" title="Ligado a um diagrama"></em>' : '') +
      '<span class="bib-lombada-paginas">' + n + '</span><span class="bib-lombada-faixa baixo"></span></span></button>';
  }

  function render() {
    if (tela.nome !== "inicio") pararCena();
    if (tela.nome === "estante" && !estante(tela.estanteId)) tela = { nome: "biblioteca" };
    if (tela.nome === "livro" && !livro(tela.livroId)) tela = { nome: "biblioteca" };
    if (tela.nome === "inicio") renderInicio();
    else if (tela.nome === "biblioteca") renderBiblioteca();
    else if (tela.nome === "estante") renderEstante();
    else renderLivro();
  }

  // Miniatura simbólica do diagrama: um bloco por equipamento (cor do tipo) ligados pelos cabos.
  function miniatura(d, classe) {
    var eqs = (d.equipamentos || []).slice(0, 24), n = eqs.length;
    if (!n) return '<svg viewBox="0 0 200 80" class="' + (classe || "inicio-mini") + '"><text x="100" y="45" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">Diagrama vazio</text></svg>';
    var colunas = Math.max(1, Math.ceil(Math.sqrt(n * 2.4))), linhas = Math.ceil(n / colunas), pos = {};
    eqs.forEach(function (e, i) {
      pos[e.id] = [colunas > 1 ? 18 + (i % colunas) * (164 / (colunas - 1)) : 100, linhas > 1 ? 16 + Math.floor(i / colunas) * (48 / (linhas - 1)) : 40];
    });
    var cabos = (d.conexoes || []).filter(function (c) { return pos[c.de] && pos[c.para]; }).slice(0, 40).map(function (c, i) {
      var a = pos[c.de], b = pos[c.para], m = (a[0] + b[0]) / 2;
      return '<path style="--i:' + i + '" d="M' + a[0] + ' ' + a[1] + ' C' + m + ' ' + a[1] + ' ' + m + ' ' + b[1] + ' ' + b[0] + ' ' + b[1] + '"/>';
    }).join("");
    var blocos = eqs.map(function (e, i) { var p = pos[e.id]; return '<rect style="--i:' + i + '" x="' + (p[0] - 6) + '" y="' + (p[1] - 5) + '" width="12" height="10" rx="2.5" fill="' + (window.GrafoCores ? window.GrafoCores(e.tipo) : "#71ebd6") + '"/>'; }).join("");
    return '<svg viewBox="0 0 200 80" class="' + (classe || "inicio-mini") + '"><g class="inicio-mini-cabos">' + cabos + '</g><g class="inicio-mini-blocos">' + blocos + '</g></svg>';
  }
  var ILUSTRA_ESTANTE = '<svg class="bib-ilustra" viewBox="0 0 220 130" aria-hidden="true">' +
    '<rect x="10" y="104" width="200" height="8" rx="3" class="bi-tabua"/><rect x="10" y="44" width="200" height="6" rx="3" class="bi-tabua"/>' +
    '<rect x="26" y="58" width="18" height="46" rx="3" class="bi-l1"/><rect x="47" y="64" width="14" height="40" rx="3" class="bi-l2"/><rect x="64" y="54" width="20" height="50" rx="3" class="bi-l3"/>' +
    '<rect x="96" y="70" width="16" height="34" rx="3" class="bi-l4" transform="rotate(-12 104 104)"/><rect x="150" y="60" width="18" height="44" rx="3" class="bi-l2"/><rect x="171" y="66" width="14" height="38" rx="3" class="bi-l1"/>' +
    '<rect x="34" y="14" width="16" height="30" rx="3" class="bi-l3"/><rect x="53" y="20" width="12" height="24" rx="3" class="bi-l4"/>' +
    '<rect x="128" y="18" width="40" height="26" rx="4" class="bi-tracejado"/><path d="M148 25v12M142 31h12" class="bi-mais"/></svg>';

  // Ilustração animada do banner: rede com cabos se desenhando e pacotes correndo.
  var REDE_HEROI = (function () {
    var nos = [[70, 70, "olt"], [210, 40, "sw"], [210, 150, "sw"], [350, 90, "rt"], [120, 190, "onu"], [300, 200, "onu"], [420, 30, "nuvem"], [440, 170, "srv"]];
    var cabos = [[0, 1], [0, 2], [1, 3], [2, 3], [0, 4], [2, 5], [3, 6], [3, 7], [1, 6]];
    function caminho(c) { var a = nos[c[0]], b = nos[c[1]], m = (a[0] + b[0]) / 2; return "M" + a[0] + " " + a[1] + " C" + m + " " + a[1] + " " + m + " " + b[1] + " " + b[0] + " " + b[1]; }
    var cores = { olt: "#7DB4FF", sw: "#A8E06B", rt: "#FF8FB8", onu: "#5EEAD4", nuvem: "#FFC163", srv: "#67D3F5" };
    return '<svg class="heroi-rede" viewBox="0 0 500 240" aria-hidden="true"><defs><filter id="heroiBrilho"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      cabos.map(function (c, i) { return '<path id="hc' + i + '" class="hr-cabo" style="--i:' + i + '" d="' + caminho(c) + '"/>'; }).join("") +
      cabos.map(function (c, i) { return '<circle r="3.2" class="hr-pacote" opacity="0" style="--i:' + i + '" filter="url(#heroiBrilho)"><set attributeName="opacity" to="1" begin="' + (1.2 + i * 0.35) + 's"/><animateMotion dur="' + (2.6 + (i % 4) * 0.7) + 's" begin="' + (1.2 + i * 0.35) + 's" repeatCount="indefinite"' + (i % 2 ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : '') + '><mpath href="#hc' + i + '"/></animateMotion></circle>'; }).join("") +
      nos.map(function (n, i) {
        return '<g class="hr-no" style="--i:' + i + ';--cor:' + cores[n[2]] + '" transform="translate(' + n[0] + ' ' + n[1] + ')"><circle r="22" class="hr-halo"/><rect x="-15" y="-11" width="30" height="22" rx="6" class="hr-corpo"/><circle cx="-7" cy="0" r="2.2" class="hr-led"/><rect x="-2" y="-1.5" width="11" height="3" rx="1.5" class="hr-traco"/></g>';
      }).join("") + '</svg>';
  })();

  // Números que contam de 0 até o valor ao aparecer.
  function contarNumeros() {
    var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    raiz.querySelectorAll("[data-contar]").forEach(function (el) {
      var alvo = Number(el.getAttribute("data-contar")) || 0;
      if (reduzir || !alvo) { el.textContent = alvo; return; }
      var inicio = null, duracao = 900 + Math.min(alvo, 50) * 12;
      function passo(t) {
        if (!inicio) inicio = t;
        var p = Math.min(1, (t - inicio) / duracao), e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(alvo * e);
        if (p < 1) requestAnimationFrame(passo);
      }
      requestAnimationFrame(passo);
    });
  }

  // ---- Início: cena em tela cheia ------------------------------------------------
  // Constelação de equipamentos no fundo (canvas): pontos que se ligam quando estão
  // perto, pacotes de luz correndo nas ligações e atração leve pelo mouse.
  var cena = null;
  function pararCena() { if (cena) { cancelAnimationFrame(cena.quadro); window.removeEventListener("resize", cena.medir); cena = null; } }
  function iniciarCena(canvas, palco) {
    pararCena();
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cores = ["#5EEAD4", "#7DB4FF", "#FFC163", "#FF8FB8", "#B69CFF", "#A8E06B"];
    var nos = [], pacotes = [], w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1), mouse = { x: -9999, y: -9999 };
    function medir() {
      var r = palco.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var alvo = Math.round(Math.min(110, (w * h) / 13000));
      while (nos.length < alvo) nos.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 1.2 + Math.random() * 2.2, cor: cores[nos.length % cores.length], fase: Math.random() * 6.28 });
      nos.length = alvo;
    }
    medir();
    palco.addEventListener("pointermove", function (ev) { var r = palco.getBoundingClientRect(); mouse.x = ev.clientX - r.left; mouse.y = ev.clientY - r.top; });
    palco.addEventListener("pointerleave", function () { mouse.x = mouse.y = -9999; });
    var LIGA = 130;
    function quadro(t) {
      ctx.clearRect(0, 0, w, h);
      // Movimento.
      nos.forEach(function (n) {
        if (!reduzir) {
          var dx = mouse.x - n.x, dy = mouse.y - n.y, d2 = dx * dx + dy * dy;
          if (d2 < 32000) { n.vx += dx * 0.00004; n.vy += dy * 0.00004; }
          n.x += n.vx; n.y += n.vy;
          n.vx *= 0.995; n.vy *= 0.995;
          if (Math.abs(n.vx) < 0.05) n.vx += (Math.random() - 0.5) * 0.04;
          if (Math.abs(n.vy) < 0.05) n.vy += (Math.random() - 0.5) * 0.04;
          if (n.x < -20) n.x = w + 20; if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20; if (n.y > h + 20) n.y = -20;
        }
      });
      // Ligações.
      var ligacoes = [];
      for (var i = 0; i < nos.length; i++) for (var j = i + 1; j < nos.length; j++) {
        var a = nos[i], b = nos[j], dx2 = a.x - b.x, dy2 = a.y - b.y, d = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (d < LIGA) {
          var perto = Math.max(0, 1 - Math.hypot(mouse.x - (a.x + b.x) / 2, mouse.y - (a.y + b.y) / 2) / 220);
          ctx.strokeStyle = "rgba(143, 243, 227, " + ((1 - d / LIGA) * (0.22 + perto * 0.5)).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ligacoes.push([a, b]);
        }
      }
      // Pacotes: nascem em ligações aleatórias e correm até a ponta.
      if (!reduzir && ligacoes.length && pacotes.length < 14 && Math.random() < 0.06) {
        var l = ligacoes[(Math.random() * ligacoes.length) | 0];
        pacotes.push({ a: l[0], b: l[1], p: 0, v: 0.008 + Math.random() * 0.014 });
      }
      pacotes = pacotes.filter(function (pk) {
        pk.p += pk.v;
        if (pk.p >= 1) return false;
        var x = pk.a.x + (pk.b.x - pk.a.x) * pk.p, y = pk.a.y + (pk.b.y - pk.a.y) * pk.p;
        var g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, "rgba(255, 211, 138, 0.95)"); g.addColorStop(1, "rgba(255, 159, 67, 0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
        return true;
      });
      // Nós (com brilho que pulsa).
      nos.forEach(function (n) {
        var pulso = reduzir ? 1 : 0.7 + 0.3 * Math.sin(t / 900 + n.fase);
        ctx.fillStyle = n.cor; ctx.globalAlpha = 0.18 * pulso;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 4, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      });
      if (!reduzir && cena) cena.quadro = requestAnimationFrame(quadro);
    }
    cena = { quadro: 0, medir: medir };
    window.addEventListener("resize", medir);
    cena.quadro = requestAnimationFrame(quadro);
    // Parallax das etiquetas flutuantes e da órbita.
    if (!reduzir) palco.addEventListener("pointermove", function (ev) {
      var r = palco.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
      palco.style.setProperty("--px", px.toFixed(3)); palco.style.setProperty("--py", py.toFixed(3));
    });
  }

  function renderInicio() {
    var nome = (document.getElementById("sidebarUsuarioNome") || {}).textContent || "";
    var hora = new Date().getHours();
    var saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    var atual = app.projetoAtual ? app.projetoAtual() : "";
    var dAtual = app.dadosProjeto(atual) || {};
    var palavras1 = ["Sua", "rede", "inteira,"], palavras2 = ["num", "lugar", "só."];
    var etiquetas = [["OLT", 8, 22], ["Rack 42U", 82, 18], ["Fibra 100G", 14, 70], ["Switch", 86, 64], ["DIO 48F", 72, 84], ["POP Centro", 24, 86], ["VLAN 100", 90, 40], ["Datacenter", 6, 46]];
    var i = 0;
    function palavra(p) { return '<span class="cena-palavra" style="--w:' + (i++) + '"><span>' + esc(p) + '</span></span>'; }
    raiz.innerHTML =
      '<section class="cena" data-cena>' +
        '<canvas class="cena-ceu" aria-hidden="true"></canvas>' +
        '<div class="cena-orbita" aria-hidden="true"><span class="co co1"><i></i></span><span class="co co2"><i></i></span><span class="co co3"><i></i></span></div>' +
        etiquetas.map(function (e, k) { return '<span class="cena-etiqueta" aria-hidden="true" style="left:' + e[1] + '%;top:' + e[2] + '%;--k:' + k + '">' + esc(e[0]) + '</span>'; }).join("") +
        '<div class="cena-centro">' +
          '<span class="cena-selo"><span class="cena-selo-ponto"></span>' + esc(saudacao) + (nome && nome !== "Sem login" ? ", " + esc(nome) : "") + '</span>' +
          '<h1>' + palavras1.map(palavra).join(" ") + '<br><span class="cena-destaque">' + palavras2.map(palavra).join(" ") + '</span></h1>' +
          '<p>Desenhe a topologia, monte os racks e documente cada POP. O Grafo junta tudo e deixa pronto para o cliente.</p>' +
          '<div class="cena-botoes">' +
            '<button type="button" class="cena-btn principal" data-acao="abrir-atual"><span>Abrir diagrama</span><b aria-hidden="true">→</b></button>' +
            '<button type="button" class="cena-btn" data-acao="ir-biblioteca"><span>Biblioteca</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="cena-rodape">' +
          '<button type="button" class="cena-link" data-acao="abrir-atual"><span class="cena-ponto verde"></span>Diagrama aberto <strong>' + esc(atual || "—") + '</strong><em>' + (dAtual.equipamentos || []).length + ' equip. · ' + (dAtual.conexoes || []).length + ' cabos</em></button>' +
          '<span class="cena-sep" aria-hidden="true"></span>' +
          '<button type="button" class="cena-link" data-acao="ir-biblioteca"><span class="cena-ponto laranja"></span>Biblioteca <strong>' + dados.livros.length + (dados.livros.length === 1 ? " livro" : " livros") + '</strong><em>' + dados.paginas.length + (dados.paginas.length === 1 ? " página" : " páginas") + '</em></button>' +
          '<span class="cena-sep" aria-hidden="true"></span>' +
          '<button type="button" class="cena-link" data-acao="novo-diagrama"><span class="cena-ponto azul"></span>Novo diagrama</button>' +
        '</div>' +
      '</section>';
    var palco = raiz.querySelector("[data-cena]");
    iniciarCena(raiz.querySelector(".cena-ceu"), palco);
  }

  // Tela da Biblioteca: estantes com os livros nas prateleiras.
  function renderBiblioteca() {
    raiz.innerHTML = trilha([{ nome: "Biblioteca" }]) +
      '<div class="bib-cabecalho"><div><h1>Biblioteca</h1><p>' + dados.estantes.length + (dados.estantes.length === 1 ? " estante" : " estantes") + ' · ' + dados.livros.length + (dados.livros.length === 1 ? " livro" : " livros") + ' · ' + dados.paginas.length + (dados.paginas.length === 1 ? " página" : " páginas") + '</p></div>' +
      '<div class="inicio-acoes"><label class="inicio-busca bib-busca-pequena"><span class="paleta-lupa" aria-hidden="true"></span><input type="search" data-bib-busca placeholder="Buscar na biblioteca" aria-label="Buscar na biblioteca"></label>' +
      (dados.estantes.length ? '<button type="button" class="primary small" data-acao="nova-estante">+ Estante</button>' : '') + '</div></div>' +
      '<div class="bib-resultados" data-bib-resultados hidden></div>' +
      (dados.estantes.length ? '<div class="bib-estantes">' + dados.estantes.map(function (e, i) {
        var livros = livrosDa(e.id);
        return '<article class="bib-estante entra" style="--cor-estante:' + esc(e.cor || CORES[0]) + ';--d:' + i + '"><button type="button" class="bib-estante-topo" data-ir=\'' + esc(JSON.stringify({ nome: "estante", estanteId: e.id })) + '\'>' +
          '<strong>' + esc(e.nome) + '</strong><span>' + livros.length + (livros.length === 1 ? " livro" : " livros") + '</span></button>' +
          '<div class="bib-prateleira">' + (livros.slice(0, 8).map(capaLivro).join("") || '<p class="bib-vazio">Estante vazia.</p>') + '</div></article>';
      }).join("") + '</div>'
      : '<div class="bib-vazia">' + ILUSTRA_ESTANTE + '<div><strong>Monte a sua biblioteca</strong><p>Crie estantes (POPs, Procedimentos, Fornecedores), livros dentro delas e páginas com manuais, procedimentos e anexos. A documentação de um diagrama vai para a estante <em>POPs</em>.</p>' +
        '<div class="inicio-acoes"><button type="button" class="primary" data-acao="nova-estante">Criar a primeira estante</button><button type="button" class="ghost" data-acao="documentar-atual">Documentar o diagrama aberto</button></div></div></div>');
  }

  function renderEstante() {
    var e = estante(tela.estanteId), livros = livrosDa(e.id);
    raiz.innerHTML = trilha([{ nome: "Biblioteca", ir: { nome: "biblioteca" } }, { nome: e.nome }]) +
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
    raiz.innerHTML = trilha([{ nome: "Biblioteca", ir: { nome: "biblioteca" } }, { nome: e ? e.nome : "Sem estante", ir: e ? { nome: "estante", estanteId: e.id } : null }, { nome: l.nome }]) +
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
  // Perguntas na janela do Grafo (bonita e no tema), não na caixa do navegador.
  function perguntar(texto, padrao, titulo) {
    if (app.janela) return app.janela({ title: titulo || "Biblioteca", message: texto, defaultValue: padrao || "", kind: "prompt", confirmText: "Salvar" }).then(function (v) { return v ? String(v).trim() : null; });
    var v = window.prompt(texto, padrao || ""); return Promise.resolve(v === null ? null : v.trim());
  }
  function confirmar(texto, titulo, botao) {
    if (app.janela) return app.janela({ title: titulo || "Confirmar", message: texto, kind: "confirm", confirmText: botao || "Excluir" }).then(function (v) { return !!v; });
    return Promise.resolve(window.confirm(texto));
  }
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

  raiz.addEventListener("click", async function (ev) {
    var ir = ev.target.closest("[data-ir]");
    if (ir) {
      var destino;
      try { destino = JSON.parse(ir.getAttribute("data-ir")); } catch (e) { return; }
      // Livro: anima sendo puxado da estante antes de abrir.
      if (ir.classList.contains("bib-livro") && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        ir.classList.add("puxando");
        setTimeout(function () { irPara(destino); }, 380);
      } else irPara(destino);
      return;
    }
    var proj = ev.target.closest("[data-abrir-projeto]");
    if (proj) { abrirDiagrama(proj.getAttribute("data-abrir-projeto")); return; }
    var ab = ev.target.closest("[data-abrir-anexo]");
    if (ab) { var pa = pagina(tela.paginaId) || paginasDo(tela.livroId)[0]; if (pa) abrirAnexo(pa.anexos[Number(ab.getAttribute("data-abrir-anexo"))]); return; }
    var rm = ev.target.closest("[data-remover-anexo]");
    if (rm) {
      var pr = pagina(tela.paginaId) || paginasDo(tela.livroId)[0];
      var a = pr && pr.anexos[Number(rm.getAttribute("data-remover-anexo"))];
      if (a && await confirmar('Remover o anexo "' + a.nome + '"?')) { pr.anexos = pr.anexos.filter(function (x) { return x !== a; }); removerArquivos([a.caminho]); salvar(); render(); }
      return;
    }
    var b = ev.target.closest("[data-acao]");
    if (!b) return;
    var acao = b.getAttribute("data-acao"), nome;
    if (acao === "abrir-atual") mostrarEditor();
    else if (acao === "ir-biblioteca") irPara({ nome: "biblioteca" });
    else if (acao === "documentar-atual") abrirLivroDoProjeto();
    else if (acao === "novo-diagrama") { mostrarEditor(); var bn = document.getElementById("btnNovoProjeto"); if (bn) bn.click(); }
    else if (acao === "todos-diagramas") { if (window.GrafoComandos && window.GrafoComandos.galeria) window.GrafoComandos.galeria(); }
    else if (acao === "nova-estante" && (nome = await perguntar("Nome da estante (ex.: POPs, Procedimentos, Fornecedores):"))) {
      var e = estanteChamada(nome, true); salvar(); irPara({ nome: "estante", estanteId: e.id });
    } else if (acao === "renomear-estante" && (nome = await perguntar("Novo nome da estante:", estante(tela.estanteId).nome))) {
      estante(tela.estanteId).nome = nome; salvar(); render();
    } else if (acao === "excluir-estante") {
      var es = estante(tela.estanteId), lvs = livrosDa(es.id);
      if (!await confirmar('Excluir a estante "' + es.nome + '"' + (lvs.length ? " e os " + lvs.length + " livros dela (com todas as páginas)" : "") + "?")) return;
      var ids = lvs.map(function (l) { return l.id; });
      removerArquivos(dados.paginas.filter(function (p) { return ids.indexOf(p.livroId) >= 0; }).reduce(function (t, p) { return t.concat((p.anexos || []).map(function (a) { return a.caminho; })); }, []));
      dados.paginas = dados.paginas.filter(function (p) { return ids.indexOf(p.livroId) < 0; });
      dados.livros = dados.livros.filter(function (l) { return l.estanteId !== es.id; });
      dados.estantes = dados.estantes.filter(function (x) { return x.id !== es.id; });
      salvar(); irPara({ nome: "biblioteca" });
    } else if (acao === "novo-livro" && (nome = await perguntar("Nome do livro (ex.: POP Centro, Manuais Datacom):"))) {
      var l = { id: novoId("lv"), estanteId: tela.estanteId, nome: nome, descricao: "", projeto: "", cor: CORES[dados.livros.length % CORES.length] };
      dados.livros.push(l); salvar(); irPara({ nome: "livro", livroId: l.id });
    } else if (acao === "renomear-livro" && (nome = await perguntar("Novo nome do livro:", livro(tela.livroId).nome))) {
      livro(tela.livroId).nome = nome; salvar(); render();
    } else if (acao === "excluir-livro") {
      var lv = livro(tela.livroId), pgs = paginasDo(lv.id);
      if (!await confirmar('Excluir o livro "' + lv.nome + '"' + (pgs.length ? " e as " + pgs.length + " páginas dele" : "") + "?")) return;
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
      if (!pe || !await confirmar('Excluir a página "' + pe.titulo + '"?')) return;
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
    mostrarEditor();
    if (nome && nome !== app.projetoAtual() && app.trocarProjeto) app.trocarProjeto(nome);
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

  // ---- abertura ----------------------------------------------------------------------
  // Abre onde a pessoa parou (diagrama ou biblioteca). O QR code (?abrir=) vai sempre
  // para o diagrama. O Início animado fica na logo "Grafo" e na paleta (Ctrl+K).
  var ultima = null;
  try { ultima = JSON.parse(localStorage.getItem("grafo-ultima-vista")); } catch (e) {}
  var abrirNoEditor = /[?&]abrir=/.test(location.search) || !ultima || ultima.vista !== "biblioteca";
  try { if (localStorage.getItem("grafo-vista-inicial") === "editor") abrirNoEditor = true; } catch (e) {}
  if (migrarDocumentosAntigos()) salvar();
  if (!abrirNoEditor) tela = ultima.tela && ultima.tela.nome && ultima.tela.nome !== "inicio" ? ultima.tela : { nome: "biblioteca" };
  definirVista(abrirNoEditor ? "editor" : "inicio");
  if (!abrirNoEditor) render();
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
