/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0. */
// Permissões da conta, decididas pelo banco (Supabase):
// - Temas exclusivos (opções com data-tema-exclusivo, ex.: Fernando): só para quem
//   tem o tema em grafo_temas_liberados (grafo_meus_temas).
// - Conta bloqueada e comunicado para todos: grafo_minha_situacao.
// - Painel do administrador (menu da conta): só para quem está em grafo_admins.
//   Lê grafo_admin_painel e grava por grafo_admin_definir_tema / _admin / _bloqueio /
//   _aviso; o banco recusa todas para quem não é admin.
// Tudo é reconferido a cada minuto e ao voltar para a aba (vale sem F5).
(function () {
  "use strict";
  var auth = window.GrafoAuth;
  var sb = auth && auth.client ? auth.client() : null;
  if (!sb || !auth.userId || !auth.userId() || document.getElementById("adminApp")) return;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function data(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return "—"; } }
  function bytes(b) { b = Number(b) || 0; return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : b > 1024 ? Math.round(b / 1024) + " KB" : b + " B"; }
  function avisar(t) { if (window.GrafoApp && window.GrafoApp.avisar) window.GrafoApp.avisar(t); }

  var TEMAS_EXCLUSIVOS = {};
  document.querySelectorAll("#temaSelect option[data-tema-exclusivo]").forEach(function (o) { TEMAS_EXCLUSIVOS[o.getAttribute("data-tema-exclusivo")] = o.textContent; });

  // ---- temas liberados para esta conta ------------------------------------------
  function aplicarTemasLiberados(lista) {
    var select = document.getElementById("temaSelect");
    if (!select) return;
    lista = lista || [];
    select.querySelectorAll("option[data-tema-exclusivo]").forEach(function (opcao) {
      var liberado = lista.indexOf(opcao.getAttribute("data-tema-exclusivo")) >= 0;
      opcao.hidden = !liberado;
      document.querySelectorAll('[data-opcoes-de="temaSelect"] [data-valor="' + opcao.value + '"]').forEach(function (item) { item.hidden = !liberado; });
      if (liberado && window.__temaExclusivoPendente === opcao.value) {
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

  // ---- conta bloqueada e comunicado ----------------------------------------------
  var telaBloqueio = null, faixaAviso = null;
  function aplicarSituacao(s) {
    s = s || {};
    // Bloqueio: tela por cima de tudo, só com "Sair".
    if (s.bloqueado && !telaBloqueio) {
      telaBloqueio = document.createElement("div");
      telaBloqueio.className = "conta-bloqueada";
      telaBloqueio.setAttribute("role", "alertdialog");
      telaBloqueio.innerHTML = '<div class="conta-bloqueada-caixa"><span class="conta-bloqueada-icone" aria-hidden="true"></span>' +
        '<h2>Conta bloqueada</h2><p>O administrador do Grafo bloqueou o acesso desta conta.</p>' +
        '<p class="conta-bloqueada-motivo" data-motivo></p><button type="button" class="primary" data-sair>Sair</button></div>';
      telaBloqueio.querySelector("[data-sair]").addEventListener("click", function () { var b = document.getElementById("accountLogout"); if (b) b.click(); else location.reload(); });
      document.body.appendChild(telaBloqueio);
    } else if (!s.bloqueado && telaBloqueio) { telaBloqueio.remove(); telaBloqueio = null; }
    if (telaBloqueio) telaBloqueio.querySelector("[data-motivo]").textContent = s.motivo ? "Motivo: " + s.motivo : "";
    // Comunicado: faixa no topo; "Ok" esconde aquele comunicado neste navegador.
    var aviso = s.aviso, visto = null;
    try { visto = localStorage.getItem("grafo-aviso-visto"); } catch (e) {}
    if (aviso && String(aviso.id) !== visto) {
      if (!faixaAviso) {
        faixaAviso = document.createElement("div");
        faixaAviso.setAttribute("role", "status");
        faixaAviso.innerHTML = '<span class="faixa-aviso-icone" aria-hidden="true"></span><span data-texto></span><button type="button" class="ghost small" data-ok>Ok</button>';
        faixaAviso.querySelector("[data-ok]").addEventListener("click", function () {
          try { localStorage.setItem("grafo-aviso-visto", faixaAviso.getAttribute("data-id")); } catch (e) {}
          faixaAviso.remove(); faixaAviso = null;
        });
        document.body.appendChild(faixaAviso);
      }
      faixaAviso.className = "faixa-aviso " + (aviso.tipo || "info");
      faixaAviso.setAttribute("data-id", aviso.id);
      faixaAviso.querySelector("[data-texto]").textContent = aviso.texto;
    } else if (faixaAviso && (!aviso || String(aviso.id) === visto)) { faixaAviso.remove(); faixaAviso = null; }
  }

  function conferir() {
    sb.rpc("grafo_meus_temas").then(function (r) { if (!r.error && Array.isArray(r.data)) aplicarTemasLiberados(r.data); });
    sb.rpc("grafo_minha_situacao").then(function (r) { if (!r.error && r.data && !Array.isArray(r.data)) aplicarSituacao(r.data); });
  }
  conferir();
  setInterval(function () { if (!document.hidden) conferir(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) conferir(); });
  window.addEventListener("focus", conferir);

  sb.rpc("grafo_eh_admin").then(function (r) {
    if (r.error || r.data !== true) return; // usuário comum (ou migração não instalada)
    montar();
  });

  // ---- painel do administrador ---------------------------------------------------
  function montar() {
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
    // Alterações ainda não salvas: "usuario|campo" -> { usuario, campo, valor, email, motivo }.
    // campo: "tema:<nome>", "admin" ou "bloqueio".
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
    function chamada(p) {
      if (p.campo.indexOf("tema:") === 0) return sb.rpc("grafo_admin_definir_tema", { p_usuario: p.usuario, p_tema: p.campo.slice(5), p_liberar: p.valor });
      if (p.campo === "admin") return sb.rpc("grafo_admin_definir_admin", { p_usuario: p.usuario, p_admin: p.valor });
      return sb.rpc("grafo_admin_definir_bloqueio", { p_usuario: p.usuario, p_bloquear: p.valor, p_motivo: p.motivo || "" });
    }
    async function salvar() {
      var listaP = Object.keys(pendentes).map(function (k) { return pendentes[k]; });
      // Tirar admin antes de bloquear (o banco não bloqueia admin).
      listaP.sort(function (a, b) { return (a.campo === "bloqueio") - (b.campo === "bloqueio"); });
      var botao = fundo.querySelector('[data-admin="salvar"]');
      botao.disabled = true; botao.textContent = "Salvando…";
      var falhas = [];
      for (var i = 0; i < listaP.length; i++) {
        var p = listaP[i];
        var r = await chamada(p);
        if (r.error) falhas.push(p.email + ": " + r.error.message);
        else delete pendentes[p.usuario + "|" + p.campo];
      }
      botao.disabled = false; botao.textContent = "Salvar alterações";
      atualizarBarra();
      if (falhas.length) { avisar("Não foi possível salvar: " + falhas[0]); return; }
      avisar(listaP.length + (listaP.length === 1 ? " alteração salva." : " alterações salvas.") + " Vale para as pessoas em até 1 minuto, sem recarregar.");
      conferir();
      carregar();
    }
    async function publicarAviso(remover) {
      var texto = remover ? "" : fundo.querySelector("[data-aviso-texto]").value.trim();
      if (!remover && !texto) { avisar("Escreva o comunicado antes de publicar."); return; }
      var r = await sb.rpc("grafo_admin_definir_aviso", { p_texto: texto, p_tipo: fundo.querySelector("[data-aviso-tipo]").value });
      if (r.error) { avisar("Não foi possível " + (remover ? "remover" : "publicar") + ": " + r.error.message); return; }
      avisar(remover ? "Comunicado removido." : "Comunicado publicado para todos.");
      conferir();
      carregar();
    }
    fundo.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-admin]");
      if (!b) return;
      var acao = b.getAttribute("data-admin");
      if (acao === "fechar") fechar();
      else if (acao === "atualizar" || acao === "descartar") { pendentes = {}; atualizarBarra(); carregar(); }
      else if (acao === "salvar") salvar();
      else if (acao === "publicar-aviso") publicarAviso(false);
      else if (acao === "remover-aviso") publicarAviso(true);
    });
    // Caixinhas só registram a alteração; vale ao clicar em Salvar.
    fundo.addEventListener("change", function (ev) {
      var caixa = ev.target.closest("[data-campo]");
      if (!caixa) return;
      var campo = caixa.getAttribute("data-campo"), usuario = caixa.getAttribute("data-usuario");
      var chave = usuario + "|" + campo;
      if (caixa.checked === (caixa.getAttribute("data-original") === "1")) delete pendentes[chave];
      else {
        var motivo = "";
        if (campo === "bloqueio" && caixa.checked) {
          motivo = window.prompt("Motivo do bloqueio (aparece para a pessoa; pode deixar em branco):", "") ;
          if (motivo === null) { caixa.checked = false; return; }
        }
        pendentes[chave] = { usuario: usuario, campo: campo, valor: caixa.checked, email: caixa.getAttribute("data-email"), motivo: motivo };
      }
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
      var usuarios = d.usuarios || [], erros = d.erros || [], arq = d.arquivos || {}, eu = d.eu || auth.userId();
      var ativos7 = usuarios.filter(function (u) { return u.ultimo_acesso && Date.now() - new Date(u.ultimo_acesso) < 7 * 864e5; }).length;
      var bloqueadas = usuarios.filter(function (u) { return u.bloqueado; }).length;
      var projetos = usuarios.reduce(function (t, u) { return t + (u.projetos || 0); }, 0);
      function cartao(rotulo, valor, sub) { return '<div class="admin-cartao"><span>' + esc(rotulo) + '</span><strong>' + esc(valor) + '</strong>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
      function caixa(u, campo, marcado, rotulo, extra) {
        return '<label class="admin-tema' + (extra || "") + '"><input type="checkbox" data-campo="' + esc(campo) + '" data-usuario="' + esc(u.id) + '" data-email="' + esc(u.email) + '" data-original="' + (marcado ? "1" : "0") + '"' + (marcado ? " checked" : "") + (u.id === eu && campo !== "tema:fernando" && campo.indexOf("tema:") !== 0 ? " disabled title=\"Você não pode alterar isto na sua própria conta\"" : "") + '> ' + esc(rotulo) + '</label>';
      }
      var aviso = d.aviso;
      corpo.innerHTML =
        '<div class="admin-cartoes">' +
          cartao("Contas", usuarios.length, ativos7 + " ativas nos últimos 7 dias" + (bloqueadas ? " · " + bloqueadas + " bloqueada" + (bloqueadas > 1 ? "s" : "") : "")) +
          cartao("Projetos", projetos, (d.equipes || 0) + " de equipe") +
          cartao("Arquivos", arq.quantidade || 0, bytes(arq.bytes) + " no Storage") +
          cartao("Erros (7 dias)", erros.reduce(function (t, e) { return t + Number(e.vezes || 0); }, 0), erros.length + " tipos diferentes") +
        '</div>' +
        '<h4 class="admin-titulo">Comunicado para todos</h4>' +
        '<div class="admin-aviso">' +
          (aviso ? '<p class="admin-aviso-atual">No ar desde ' + esc(data(aviso.criado_em)) + ': <strong>' + esc(aviso.texto) + '</strong></p>' : '<p class="admin-aviso-atual">Nenhum comunicado no ar.</p>') +
          '<div class="admin-aviso-form"><input type="text" maxlength="300" data-aviso-texto placeholder="Ex.: Manutenção hoje às 22h; o Grafo pode ficar fora do ar por 10 minutos.">' +
          '<select data-aviso-tipo aria-label="Tipo do comunicado"><option value="info">Informação</option><option value="alerta">Alerta</option><option value="sucesso">Novidade</option></select>' +
          '<button type="button" class="primary small" data-admin="publicar-aviso">Publicar</button>' +
          (aviso ? '<button type="button" class="ghost small danger-texto" data-admin="remover-aviso">Remover</button>' : '') + '</div></div>' +
        '<h4 class="admin-titulo">Contas</h4>' +
        '<div class="admin-tabela"><table><thead><tr><th>E-mail</th><th>Admin</th><th>Bloqueada</th><th>Temas exclusivos</th><th>Projetos</th><th>Dados</th><th>Último acesso</th></tr></thead><tbody>' +
        usuarios.map(function (u) {
          return '<tr' + (u.bloqueado ? ' class="admin-linha-bloqueada"' : '') + '><td>' + esc(u.email) + (u.id === eu ? ' <em class="admin-tag admin">você</em>' : '') + (u.confirmado ? '' : ' <em class="admin-tag aviso">não confirmado</em>') +
              (u.bloqueado && u.motivo ? '<small class="admin-motivo">Motivo: ' + esc(u.motivo) + '</small>' : '') + '</td>' +
            '<td>' + caixa(u, "admin", u.admin, "Admin") + '</td>' +
            '<td>' + caixa(u, "bloqueio", u.bloqueado, "Bloqueada", " perigo") + '</td>' +
            '<td>' + (Object.keys(TEMAS_EXCLUSIVOS).map(function (t) { return caixa(u, "tema:" + t, (u.temas || []).indexOf(t) >= 0, TEMAS_EXCLUSIVOS[t]); }).join("") || "—") + '</td>' +
            '<td>' + (u.projetos || 0) + '</td><td>' + bytes(u.tamanho) + '</td><td>' + data(u.ultimo_acesso) + '</td></tr>';
        }).join("") + '</tbody></table></div>' +
        '<h4 class="admin-titulo">Erros recentes (7 dias)</h4>' +
        (erros.length ? '<div class="admin-tabela"><table><thead><tr><th>Mensagem</th><th>Vezes</th><th>Pessoas</th><th>Última vez</th></tr></thead><tbody>' +
          erros.map(function (e) { return '<tr><td class="admin-erro">' + esc(e.mensagem) + (e.origem ? '<small>' + esc(e.origem) + '</small>' : '') + '</td><td>' + esc(e.vezes) + '</td><td>' + esc(e.pessoas) + '</td><td>' + data(e.ultima_vez) + '</td></tr>'; }).join("") +
          '</tbody></table></div>' : '<p class="docs-vazio">Nenhum erro nos últimos 7 dias.</p>') +
        '<p class="admin-rodape">Atualizado em ' + esc(data(d.gerado_em)) + '. Marque ou desmarque as caixinhas e clique em <strong>Salvar alterações</strong>: vale para as pessoas em até 1 minuto, sem recarregar. Você não pode tirar o seu próprio acesso de admin nem bloquear a sua conta.</p>';
    }
    window.GrafoAdmin = { abrir: abrir };
  }
})();
