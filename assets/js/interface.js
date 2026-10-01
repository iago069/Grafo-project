/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Detalhes da interface que não mexem nos dados:
// - menu da conta (botão com a inicial do e-mail: Minha conta, Instalar app, Sair);
// - selo de salvamento: cor conforme o texto que auth.js põe em #cloudStatus;
// - legenda dos ícones do menu lateral quando ele está recolhido.
(function () {
  "use strict";

  // ---- Menu da conta -----------------------------------------------------------
  var botao = document.getElementById("contaMenuBotao");
  var lista = document.getElementById("contaMenuLista");
  var email = document.getElementById("accountEmail");

  function itens() {
    return Array.prototype.filter.call(lista.querySelectorAll("[role=menuitem]"), function (item) { return !item.hidden; });
  }
  function aberto() { return !lista.hidden; }
  function abrir(focarPrimeiro) {
    lista.hidden = false;
    lista.classList.remove("saindo");
    botao.setAttribute("aria-expanded", "true");
    if (focarPrimeiro) { var primeiro = itens()[0]; if (primeiro) primeiro.focus(); }
  }
  function fechar(devolverFoco) {
    if (!aberto()) return;
    botao.setAttribute("aria-expanded", "false");
    if (devolverFoco) botao.focus();
    var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) { lista.hidden = true; return; }
    lista.classList.add("saindo");
    setTimeout(function () { if (lista.classList.contains("saindo")) { lista.hidden = true; lista.classList.remove("saindo"); } }, 130);
  }

  if (botao && lista) {
    botao.addEventListener("click", function () {
      if (aberto() && !lista.classList.contains("saindo")) fechar(false); else abrir(false);
    });
    botao.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        if (event.key !== "ArrowDown" && aberto()) return;
        event.preventDefault();
        abrir(true);
      }
    });
    // Captura: fecha o menu e devolve o foco ao botão antes de a ação do item
    // rodar, para a janela que ela abrir devolver o foco a algo visível.
    lista.addEventListener("click", function (event) {
      if (event.target.closest("[role=menuitem]")) fechar(true);
    }, true);
    lista.addEventListener("keydown", function (event) {
      var todos = itens();
      var i = todos.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        var proximo = todos[(i + (event.key === "ArrowDown" ? 1 : -1) + todos.length) % todos.length];
        if (proximo) proximo.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        todos[event.key === "Home" ? 0 : todos.length - 1].focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        fechar(true);
      } else if (event.key === "Tab") {
        fechar(false);
      }
    });
    document.addEventListener("click", function (event) {
      if (aberto() && !event.target.closest(".conta-menu")) fechar(false);
    });
  }

  // Inicial e e-mail completo no menu, a partir do e-mail que auth.js preenche.
  function atualizarConta() {
    var texto = (email && email.textContent || "").trim();
    var inicial = (texto.match(/[a-z0-9À-ÿ]/i) || ["?"])[0].toUpperCase();
    document.querySelectorAll("[data-conta-inicial]").forEach(function (el) { el.textContent = inicial; });
    document.querySelectorAll("[data-conta-email]").forEach(function (el) { el.textContent = texto; });
    if (botao) botao.title = texto ? "Conta: " + texto : "Sua conta";
  }
  if (email) {
    new MutationObserver(atualizarConta).observe(email, { childList: true, characterData: true, subtree: true });
    atualizarConta();
  }

  // ---- Selo de salvamento ------------------------------------------------------
  var status = document.getElementById("cloudStatus");
  function atualizarStatus() {
    var texto = status.textContent || "";
    var estado = /erro|falha|sem internet|outro lugar|alterado em/i.test(texto) ? "aviso"
      : /salvando|enviando|pendente|sincronizando|carregando/i.test(texto) ? "ocupado"
      : /salvo/i.test(texto) ? "ok" : "";
    status.setAttribute("data-estado", estado);
    status.hidden = !texto.trim();
  }
  if (status) {
    new MutationObserver(atualizarStatus).observe(status, { childList: true, characterData: true, subtree: true });
    atualizarStatus();
  }

  // ---- Legenda dos ícones com o menu lateral recolhido -------------------------
  var sidebar = document.querySelector(".sidebar");
  var legenda = null;
  function mostrarLegenda(item) {
    if (!sidebar || !sidebar.classList.contains("collapsed") || window.matchMedia("(max-width: 700px)").matches) return;
    var texto = (item.childNodes[0] && item.childNodes[0].nodeType === 3 ? item.childNodes[0].textContent : item.textContent).trim();
    if (!texto) return;
    if (!legenda) {
      legenda = document.createElement("div");
      legenda.className = "nav-legenda";
      legenda.setAttribute("role", "tooltip");
      document.body.appendChild(legenda);
    }
    legenda.textContent = texto;
    var r = item.getBoundingClientRect();
    legenda.style.top = Math.round(r.top + r.height / 2) + "px";
    legenda.style.left = Math.round(r.right + 10) + "px";
    legenda.classList.add("visivel");
  }
  function esconderLegenda() { if (legenda) legenda.classList.remove("visivel"); }
  if (sidebar) {
    sidebar.addEventListener("mouseover", function (event) {
      var item = event.target.closest(".nav-item");
      if (item) mostrarLegenda(item); else esconderLegenda();
    });
    sidebar.addEventListener("mouseleave", esconderLegenda);
    sidebar.addEventListener("focusin", function (event) {
      var item = event.target.closest(".nav-item");
      if (item && item.matches(":focus-visible")) mostrarLegenda(item);
    });
    sidebar.addEventListener("focusout", esconderLegenda);
    sidebar.addEventListener("click", esconderLegenda);
    window.addEventListener("scroll", esconderLegenda, true);
  }
})();
