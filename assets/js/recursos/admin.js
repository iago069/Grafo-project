/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. */
// Permissões da conta, decididas pelo banco (Supabase):
// - Temas exclusivos (opções com data-tema-exclusivo, ex.: Fernando): aparecem só
//   para quem tem o tema em grafo_temas_liberados (função grafo_meus_temas).
// - Painel do administrador: no menu da conta, só para quem está em grafo_admins
//   (grafo_eh_admin). Os dados vêm de grafo_admin_painel e as liberações de
//   grafo_admin_definir_tema; o banco recusa as duas para quem não é admin.
(function () {
  "use strict";
  var auth = window.GrafoAuth;
  var sb = auth && auth.client ? auth.client() : null;
  if (!sb || !auth.userId || !auth.userId() || document.getElementById("adminApp")) return;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function data(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return "—"; } }
  function bytes(b) { b = Number(b) || 0; return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : b > 1024 ? Math.round(b / 1024) + " KB" : b + " B"; }
  function avisar(t) { if (window.GrafoApp && window.GrafoApp.avisar) window.GrafoApp.avisar(t); }

  // Temas exclusivos que existem no app: { fernando: "Fernando" }.
  var TEMAS_EXCLUSIVOS = {};
  document.querySelectorAll("#temaSelect option[data-tema-exclusivo]").forEach(function (o) { TEMAS_EXCLUSIVOS[o.getAttribute("data-tema-exclusivo")] = o.textContent; });

  // ---- temas liberados para esta conta ------------------------------------------
  // Mostra os temas liberados e esconde os retirados (quem perdeu o acesso volta
  // para o tema automático na hora, sem precisar recarregar a página).
  function aplicarTemasLiberados(lista) {
    var select = document.getElementById("temaSelect");
    if (!select) return;
    lista = lista || [];
    select.querySelectorAll("option[data-tema-exclusivo]").forEach(function (opcao) {
      var liberado = lista.indexOf(opcao.getAttribute("data-tema-exclusivo")) >= 0;
      opcao.hidden = !liberado;
      document.querySelectorAll('[data-opcoes-de="temaSelect"] [data-valor="' + opcao.value + '"]').forEach(function (item) { item.hidden = !liberado; });
      if (liberado && window.__temaExclusivoPendente === opcao.value) {
        // Era o tema escolhido da última vez: aplica agora que foi confirmado.
        window.__temaExclusivoPendente = null;
        select.value = opcao.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (!liberado && select.value === opcao.value) {
        select.value = "auto";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        avisar("O tema " + opcao.textContent + " não está mais liberado para esta conta.");
      }
    });
  }
  function conferirMeusTemas() {
    return sb.rpc("grafo_meus_temas").then(function (r) { if (!r.error && Array.isArray(r.data)) aplicarTemasLiberados(r.data); });
  }
  conferirMeusTemas();
  // Reconfere sozinho: a cada minuto e ao voltar para a aba (mudanças do admin valem sem F5).
  setInterval(function () { if (!document.hidden) conferirMeusTemas(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) conferirMeusTemas(); });
  window.addEventListener("focus", conferirMeusTemas);

  sb.rpc("grafo_eh_admin").then(function (r) {
    if (r.error || r.data !== true) return; // usuário comum (ou migração não instalada)
    montar();
  });

  function montar() {
    // Item no menu da conta, antes do "Sair".
    var lista = document.getElementById("contaMenuLista");
    var separador = lista && lista.querySelector(".conta-separador");
    if (lista) {
      var item = document.createElement("button");
      item.type = "button"; item.setAttribute("role", "menuitem"); item.className = "conta-item";
      item.id = "btnAdmin"; item.setAttribute("data-icone", "admin"); item.setAttribute("aria-haspopup", "dialog");
      item.textContent = "Painel do administrador";
      item.addEventListener("click", function () { abrir(); });
      lista.insertBefore(item, separador || null);
    }
    var selo = document.getElementById("sidebarUsuario");
    if (selo) selo.classList.add("eh-admin");

    var fundo = document.createElement("div");
    fundo.id = "adminApp";
    fundo.className = "paleta-fundo docs-fundo";
    fundo.hidden = true;
    fundo.innerHTML = '<div class="paleta docs admin" role="dialog" aria-modal="true" aria-labelledby="adminTitulo">' +
      '<div class="folha-topo"><strong id="adminTitulo">Painel do administrador</strong><div class="galeria-acoes">' +
      '<button type="button" class="ghost small" data-admin="atualizar">Atualizar</button><button type="button" class="ghost small" data-admin="fechar" aria-label="Fechar">×</button></div></div>' +
      '<div class="admin-corpo" data-admin-corpo><p class="docs-vazio">Carregando…</p></div>' +
      '<div class="admin-salvar" data-admin-salvar hidden><span data-admin-pendentes></span>' +
        '<button type="button" class="ghost small" data-admin="descartar">Descartar</button>' +
        '<button type="button" class="primary small" data-admin="salvar">Salvar alterações</button></div></div>';
    document.body.appendChild(fundo);
    var corpo = fundo.querySelector("[data-admin-corpo]");
    var barraSalvar = fundo.querySelector("[data-admin-salvar]");
    // Alterações ainda não salvas: "usuario|tema" -> { usuario, tema, liberar, email }.
    var pendentes = {};

    function atualizarBarra() {
      var n = Object.keys(pendentes).length;
      barraSalvar.hidden = !n;
      fundo.querySelector("[data-admin-pendentes]").textContent = n + (n === 1 ? " alteração não salva" : " alterações não salvas");
    }
    function abrir() { fundo.hidden = false; pendentes = {}; atualizarBarra(); carregar(); }
    function fechar() {
      if (Object.keys(pendentes).length && !window.confirm("Há alterações não salvas no painel. Fechar mesmo assim?")) return;
      fundo.hidden = true;
    }
    async function salvar() {
      var lista = Object.keys(pendentes).map(function (k) { return pendentes[k]; });
      var botao = fundo.querySelector('[data-admin="salvar"]');
      botao.disabled = true; botao.textContent = "Salvando…";
      var falhas = [];
      for (var i = 0; i < lista.length; i++) {
        var p = lista[i];
        var r = await sb.rpc("grafo_admin_definir_tema", { p_usuario: p.usuario, p_tema: p.tema, p_liberar: p.liberar });
        if (r.error) falhas.push(p.email + ": " + r.error.message);
        else delete pendentes[p.usuario + "|" + p.tema];
      }
      botao.disabled = false; botao.textContent = "Salvar alterações";
      atualizarBarra();
      if (falhas.length) { avisar("Não foi possível salvar: " + falhas[0]); return; }
      avisar(lista.length + (lista.length === 1 ? " alteração salva." : " alterações salvas.") + " Vale para as pessoas em até 1 minuto, sem recarregar.");
      conferirMeusTemas();
      carregar();
    }
    fundo.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-admin]");
      if (!b) return;
      var acao = b.getAttribute("data-admin");
      if (acao === "fechar") fechar();
      else if (acao === "atualizar") { pendentes = {}; atualizarBarra(); carregar(); }
      else if (acao === "descartar") { pendentes = {}; atualizarBarra(); carregar(); }
      else if (acao === "salvar") salvar();
    });
    // Marcar/desmarcar um tema só registra a alteração; vale ao clicar em Salvar.
    fundo.addEventListener("change", function (ev) {
      var caixa = ev.target.closest("[data-liberar-tema]");
      if (!caixa) return;
      var chave = caixa.getAttribute("data-usuario") + "|" + caixa.getAttribute("data-liberar-tema");
      if (caixa.checked === (caixa.getAttribute("data-original") === "1")) delete pendentes[chave];
      else pendentes[chave] = { usuario: caixa.getAttribute("data-usuario"), tema: caixa.getAttribute("data-liberar-tema"), liberar: caixa.checked, email: caixa.getAttribute("data-email") };
      caixa.closest("label").classList.toggle("alterado", !!pendentes[chave]);
      atualizarBarra();
    });
    fundo.addEventListener("mousedown", function (ev) { if (ev.target === fundo) fechar(); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !fundo.hidden) fechar(); });

    function carregar() {
      corpo.innerHTML = '<p class="docs-vazio">Carregando…</p>';
      sb.rpc("grafo_admin_painel").then(function (r) {
        if (r.error) { corpo.innerHTML = '<p class="docs-vazio">Não foi possível carregar: ' + esc(r.error.message) + '</p>'; return; }
        render(r.data || {});
      });
    }

    function render(d) {
      var usuarios = d.usuarios || [], erros = d.erros || [], arq = d.arquivos || {};
      var ativos7 = usuarios.filter(function (u) { return u.ultimo_acesso && Date.now() - new Date(u.ultimo_acesso) < 7 * 864e5; }).length;
      var projetos = usuarios.reduce(function (t, u) { return t + (u.projetos || 0); }, 0);
      var nomesTemas = Object.keys(TEMAS_EXCLUSIVOS);
      function cartao(rotulo, valor, sub) { return '<div class="admin-cartao"><span>' + esc(rotulo) + '</span><strong>' + esc(valor) + '</strong>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
      function caixasTemas(u) {
        var temas = u.temas || [];
        return nomesTemas.map(function (t) {
          return '<label class="admin-tema"><input type="checkbox" data-liberar-tema="' + esc(t) + '" data-usuario="' + esc(u.id) + '" data-email="' + esc(u.email) + '" data-original="' + (temas.indexOf(t) >= 0 ? "1" : "0") + '"' + (temas.indexOf(t) >= 0 ? " checked" : "") + '> ' + esc(TEMAS_EXCLUSIVOS[t]) + '</label>';
        }).join("") || "—";
      }
      corpo.innerHTML =
        '<div class="admin-cartoes">' +
          cartao("Contas", usuarios.length, ativos7 + " ativas nos últimos 7 dias") +
          cartao("Projetos", projetos, (d.equipes || 0) + " de equipe") +
          cartao("Arquivos", arq.quantidade || 0, bytes(arq.bytes) + " no Storage") +
          cartao("Erros (7 dias)", erros.reduce(function (t, e) { return t + Number(e.vezes || 0); }, 0), erros.length + " tipos diferentes") +
        '</div>' +
        '<h4 class="admin-titulo">Contas</h4>' +
        '<div class="admin-tabela"><table><thead><tr><th>E-mail</th><th>Papel</th><th>Temas exclusivos</th><th>Projetos</th><th>Dados</th><th>Último acesso</th><th>Criada em</th></tr></thead><tbody>' +
        usuarios.map(function (u) {
          return '<tr><td>' + esc(u.email) + (u.confirmado ? '' : ' <em class="admin-tag aviso">não confirmado</em>') + '</td>' +
            '<td>' + (u.admin ? '<em class="admin-tag admin">Admin</em>' : '<em class="admin-tag">Usuário</em>') + '</td>' +
            '<td>' + caixasTemas(u) + '</td>' +
            '<td>' + (u.projetos || 0) + '</td><td>' + bytes(u.tamanho) + '</td><td>' + data(u.ultimo_acesso) + '</td><td>' + data(u.criado_em) + '</td></tr>';
        }).join("") + '</tbody></table></div>' +
        '<h4 class="admin-titulo">Erros recentes (7 dias)</h4>' +
        (erros.length ? '<div class="admin-tabela"><table><thead><tr><th>Mensagem</th><th>Vezes</th><th>Pessoas</th><th>Última vez</th></tr></thead><tbody>' +
          erros.map(function (e) { return '<tr><td class="admin-erro">' + esc(e.mensagem) + (e.origem ? '<small>' + esc(e.origem) + '</small>' : '') + '</td><td>' + esc(e.vezes) + '</td><td>' + esc(e.pessoas) + '</td><td>' + data(e.ultima_vez) + '</td></tr>'; }).join("") +
          '</tbody></table></div>' : '<p class="docs-vazio">Nenhum erro nos últimos 7 dias.</p>') +
        '<p class="admin-rodape">Atualizado em ' + esc(data(d.gerado_em)) + '. Marque ou desmarque "Fernando" e clique em <strong>Salvar alterações</strong>: vale para a pessoa em até 1 minuto, sem recarregar. Para tornar alguém admin, use a tabela <code>grafo_admins</code> no Supabase.</p>';
    }
    window.GrafoAdmin = { abrir: abrir };
  }
})();
