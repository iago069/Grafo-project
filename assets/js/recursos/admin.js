/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. */
// Painel de administração. Só aparece para quem está em grafo_admins no Supabase
// (função grafo_eh_admin); os dados vêm de grafo_admin_painel(), que o banco
// recusa para quem não é admin. Sem a migração 2026-10-15-admin.sql, nada aparece.
(function () {
  "use strict";
  var auth = window.GrafoAuth;
  var sb = auth && auth.client ? auth.client() : null;
  if (!sb || !auth.userId || !auth.userId() || document.getElementById("adminApp")) return;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function data(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return "—"; } }
  function bytes(b) { b = Number(b) || 0; return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : b > 1024 ? Math.round(b / 1024) + " KB" : b + " B"; }

  sb.rpc("grafo_eh_admin").then(function (r) {
    if (r.error || r.data !== true) return; // usuário comum (ou migração não instalada)
    montar();
  });

  function montar() {
    // Item no menu lateral, num grupo próprio no fim.
    var nav = document.querySelector(".sidebar .nav");
    var usuario = document.getElementById("sidebarUsuario");
    if (nav) {
      var secao = document.createElement("div");
      secao.className = "nav-section nav-admin";
      secao.innerHTML = '<button class="nav-label" type="button" aria-expanded="true">Administração</button>' +
        '<button class="nav-item" id="btnAdmin" type="button" data-icon="admin" title="Contas, uso e erros do Grafo (só administradores)">Painel do administrador</button>';
      nav.insertBefore(secao, usuario || null);
      secao.querySelector(".nav-label").addEventListener("click", function () {
        var fechada = secao.classList.toggle("fechada");
        this.setAttribute("aria-expanded", String(!fechada));
      });
      secao.querySelector("#btnAdmin").addEventListener("click", abrir);
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
      '<div class="admin-corpo" data-admin-corpo><p class="docs-vazio">Carregando…</p></div></div>';
    document.body.appendChild(fundo);
    var corpo = fundo.querySelector("[data-admin-corpo]");

    function abrir() { fundo.hidden = false; carregar(); }
    function fechar() { fundo.hidden = true; }
    fundo.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-admin]");
      if (b && b.getAttribute("data-admin") === "fechar") fechar();
      else if (b && b.getAttribute("data-admin") === "atualizar") carregar();
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
      function cartao(rotulo, valor, sub) { return '<div class="admin-cartao"><span>' + esc(rotulo) + '</span><strong>' + esc(valor) + '</strong>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
      corpo.innerHTML =
        '<div class="admin-cartoes">' +
          cartao("Contas", usuarios.length, ativos7 + " ativas nos últimos 7 dias") +
          cartao("Projetos", projetos, (d.equipes || 0) + " de equipe") +
          cartao("Arquivos", arq.quantidade || 0, bytes(arq.bytes) + " no Storage") +
          cartao("Erros (7 dias)", erros.reduce(function (t, e) { return t + Number(e.vezes || 0); }, 0), erros.length + " tipos diferentes") +
        '</div>' +
        '<h4 class="admin-titulo">Contas</h4>' +
        '<div class="admin-tabela"><table><thead><tr><th>E-mail</th><th>Papel</th><th>Projetos</th><th>Dados</th><th>Último acesso</th><th>Criada em</th></tr></thead><tbody>' +
        usuarios.map(function (u) {
          return '<tr><td>' + esc(u.email) + (u.confirmado ? '' : ' <em class="admin-tag aviso">não confirmado</em>') + '</td>' +
            '<td>' + (u.admin ? '<em class="admin-tag admin">Admin</em>' : '<em class="admin-tag">Usuário</em>') + '</td>' +
            '<td>' + (u.projetos || 0) + '</td><td>' + bytes(u.tamanho) + '</td><td>' + data(u.ultimo_acesso) + '</td><td>' + data(u.criado_em) + '</td></tr>';
        }).join("") + '</tbody></table></div>' +
        '<h4 class="admin-titulo">Erros recentes (7 dias)</h4>' +
        (erros.length ? '<div class="admin-tabela"><table><thead><tr><th>Mensagem</th><th>Vezes</th><th>Pessoas</th><th>Última vez</th></tr></thead><tbody>' +
          erros.map(function (e) { return '<tr><td class="admin-erro">' + esc(e.mensagem) + (e.origem ? '<small>' + esc(e.origem) + '</small>' : '') + '</td><td>' + esc(e.vezes) + '</td><td>' + esc(e.pessoas) + '</td><td>' + data(e.ultima_vez) + '</td></tr>'; }).join("") +
          '</tbody></table></div>' : '<p class="docs-vazio">Nenhum erro nos últimos 7 dias.</p>') +
        '<p class="admin-rodape">Atualizado em ' + esc(data(d.gerado_em)) + '. Para tornar alguém admin ou tirar, use a tabela <code>grafo_admins</code> no Supabase.</p>';
    }
    window.GrafoAdmin = { abrir: abrir };
  }
})();
