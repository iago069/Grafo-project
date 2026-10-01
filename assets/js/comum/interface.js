/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Detalhes da interface que não mexem nos dados:
// - menu da conta (botão com a inicial do e-mail: Minha conta, Instalar app, Sair);
// - menus suspensos (Exportar, Organizar, Tema) e legendas dos botões só com ícone;
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

  // ---- Menus suspensos (Exportar, Organizar, Tema) -----------------------------
  // Botão com aria-haspopup="menu" e aria-controls="<id do .menu-flutuante>".
  var REDUZIR = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var menuAberto = null;

  function itensDo(menu) {
    return Array.prototype.filter.call(menu.querySelectorAll("[role^=menuitem]"), function (item) { return !item.hidden && !item.disabled; });
  }
  function abrirMenu(botaoMenu, focarPrimeiro) {
    var menu = document.getElementById(botaoMenu.getAttribute("aria-controls"));
    if (!menu) return;
    if (menuAberto && menuAberto.menu !== menu) fecharMenu(false);
    menu.hidden = false;
    menu.classList.remove("saindo");
    // Abre para a esquerda se não couber à direita (botões perto da borda).
    menu.classList.remove("para-esquerda");
    var r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) menu.classList.add("para-esquerda");
    botaoMenu.setAttribute("aria-expanded", "true");
    menuAberto = { botao: botaoMenu, menu: menu };
    esconderDica();
    if (focarPrimeiro) { var primeiro = itensDo(menu)[0]; if (primeiro) primeiro.focus(); }
  }
  function fecharMenu(devolverFoco) {
    if (!menuAberto) return;
    var atual = menuAberto;
    menuAberto = null;
    atual.botao.setAttribute("aria-expanded", "false");
    if (devolverFoco) atual.botao.focus();
    if (REDUZIR && REDUZIR.matches) { atual.menu.hidden = true; return; }
    atual.menu.classList.add("saindo");
    setTimeout(function () {
      if (atual.menu.classList.contains("saindo")) { atual.menu.hidden = true; atual.menu.classList.remove("saindo"); }
    }, 120);
  }

  document.addEventListener("click", function (event) {
    var botaoMenu = event.target.closest('[aria-haspopup="menu"][aria-controls]:not(#contaMenuBotao)');
    if (botaoMenu) {
      if (menuAberto && menuAberto.botao === botaoMenu) fecharMenu(false); else abrirMenu(botaoMenu, false);
      return;
    }
    if (!menuAberto) return;
    // Item escolhido fecha o menu; clique fora também. (O foco volta ao botão do
    // menu antes da ação do item, para a janela que ela abrir devolvê-lo a algo visível.)
    if (event.target.closest(".menu-flutuante [role^=menuitem]")) return;
    if (!event.target.closest(".menu-flutuante")) fecharMenu(false);
  });
  document.addEventListener("click", function (event) {
    if (menuAberto && event.target.closest(".menu-flutuante [role^=menuitem]")) fecharMenu(true);
  }, true);
  document.addEventListener("keydown", function (event) {
    var botaoMenu = event.target.closest && event.target.closest('[aria-haspopup="menu"][aria-controls]:not(#contaMenuBotao)');
    if (botaoMenu && event.key === "ArrowDown") { event.preventDefault(); abrirMenu(botaoMenu, true); return; }
    if (!menuAberto || !menuAberto.menu.contains(event.target)) {
      if (menuAberto && event.key === "Escape") fecharMenu(true);
      return;
    }
    var todos = itensDo(menuAberto.menu);
    var i = todos.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      var proximo = todos[(i + (event.key === "ArrowDown" ? 1 : -1) + todos.length) % todos.length];
      if (proximo) proximo.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      fecharMenu(true);
    } else if (event.key === "Tab") {
      fecharMenu(false);
    }
  });

  // Opções de um <select> escondido viram itens de menu (Sentido do diagrama, Tema).
  // O select continua valendo: escolher um item muda o valor e avisa o app (change).
  function montarOpcoes(container) {
    var select = document.getElementById(container.getAttribute("data-opcoes-de"));
    if (!select) return;
    container.innerHTML = "";
    Array.prototype.forEach.call(select.children, function (filho) {
      var opcoes = filho.tagName === "OPTGROUP" ? filho.children : [filho];
      if (filho.tagName === "OPTGROUP") {
        var rotulo = document.createElement("div");
        rotulo.className = "menu-rotulo";
        rotulo.textContent = filho.label;
        container.appendChild(rotulo);
      }
      Array.prototype.forEach.call(opcoes, function (opcao) {
        var item = document.createElement("button");
        item.type = "button";
        item.className = "menu-item menu-opcao";
        item.setAttribute("role", "menuitemradio");
        item.setAttribute("data-valor", opcao.value);
        item.textContent = opcao.textContent;
        container.appendChild(item);
      });
    });
    container.addEventListener("click", function (event) {
      var item = event.target.closest("[data-valor]");
      if (!item) return;
      select.value = item.getAttribute("data-valor");
      select.dispatchEvent(new Event("change", { bubbles: true }));
      marcar();
    });
    function marcar() {
      container.querySelectorAll("[data-valor]").forEach(function (item) {
        item.setAttribute("aria-checked", item.getAttribute("data-valor") === select.value ? "true" : "false");
      });
      if (select.id === "temaSelect") atualizarIconeTema(select);
    }
    select.addEventListener("change", marcar);
    marcar();
    // O app pode trocar o valor sem "change" (tema salvo, botão antigo): confere ao abrir.
    var botaoDoMenu = document.querySelector('[aria-controls="' + container.closest(".menu-flutuante").id + '"]');
    if (botaoDoMenu) botaoDoMenu.addEventListener("click", marcar);
  }

  // Ícone do botão de tema: automático, claro (sol), escuro (lua) ou alto contraste.
  function atualizarIconeTema(select) {
    var botaoTema = document.getElementById("temaMenuBotao");
    if (!botaoTema) return;
    var opcao = select.options[select.selectedIndex];
    var grupo = opcao && opcao.parentElement.tagName === "OPTGROUP" ? opcao.parentElement.label : "";
    var icone = select.value === "auto" ? "tema-auto"
      : grupo === "Acessibilidade" ? "tema-contraste"
      : (select.value === "dark" || grupo === "Escuro") ? "tema-escuro" : "tema-claro";
    botaoTema.setAttribute("data-icone", icone);
    var nome = opcao ? opcao.textContent : "";
    botaoTema.setAttribute("data-dica", "Tema: " + nome);
    botaoTema.setAttribute("aria-label", "Tema: " + nome);
  }

  document.querySelectorAll("[data-opcoes-de]").forEach(montarOpcoes);
  // 07-temas.js aplica o tema salvo ao carregar sem disparar "change": o ícone
  // acompanha as mudanças de tema na raiz da página.
  var temaSelect = document.getElementById("temaSelect");
  if (temaSelect) {
    new MutationObserver(function () { atualizarIconeTema(temaSelect); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  }

  // ---- Legendas de botões só com ícone (data-dica) ------------------------------
  var dica = null;
  function mostrarDica(alvo) {
    if (window.matchMedia("(hover: none)").matches) return;
    var texto = alvo.getAttribute("data-dica");
    if (!texto || (menuAberto && menuAberto.botao === alvo)) return;
    if (!dica) {
      dica = document.createElement("div");
      dica.className = "dica";
      dica.setAttribute("role", "tooltip");
      document.body.appendChild(dica);
    }
    dica.textContent = texto;
    var r = alvo.getBoundingClientRect();
    dica.style.left = Math.round(r.left + r.width / 2) + "px";
    dica.style.top = Math.round(r.bottom + 8) + "px";
    dica.classList.add("visivel");
    // Não deixa passar da borda da tela.
    var d = dica.getBoundingClientRect();
    var ajuste = d.right > window.innerWidth - 6 ? window.innerWidth - 6 - d.right : d.left < 6 ? 6 - d.left : 0;
    dica.style.setProperty("--ajuste", ajuste + "px");
  }
  function esconderDica() { if (dica) dica.classList.remove("visivel"); }
  document.addEventListener("mouseover", function (event) {
    var alvo = event.target.closest && event.target.closest("[data-dica]");
    if (alvo) mostrarDica(alvo); else esconderDica();
  });
  document.addEventListener("focusin", function (event) {
    var alvo = event.target.closest && event.target.closest("[data-dica]");
    if (alvo && alvo.matches(":focus-visible")) mostrarDica(alvo); else esconderDica();
  });
  document.addEventListener("mousedown", esconderDica);
  window.addEventListener("scroll", esconderDica, true);

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

  // ---- Botões de arquivo pelo teclado -------------------------------------------
  // "Importar projeto" e "Importar CSV" são <label> com o <input type=file>
  // escondido: o label recebe foco (tabindex) e Enter/Espaço abre o arquivo.
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var botao = event.target.closest && event.target.closest("[data-botao-arquivo]");
    if (!botao || event.target !== botao) return;
    var campo = botao.querySelector('input[type="file"]');
    if (!campo) return;
    event.preventDefault();
    campo.click();
  });

  // ---- Seções do menu lateral que abrem e fecham pelo título -------------------
  // As fechadas ficam guardadas neste navegador (só uma conveniência).
  var CHAVE_SECOES = "grafo-menu-fechado";
  var fechadas = [];
  try { fechadas = JSON.parse(localStorage.getItem(CHAVE_SECOES) || "[]") || []; } catch (e) {}
  document.querySelectorAll(".nav-section > .nav-label").forEach(function (titulo) {
    var secao = titulo.parentNode;
    var nome = titulo.textContent.trim();
    function definir(aberta, guardar) {
      secao.classList.toggle("fechada", !aberta);
      titulo.setAttribute("aria-expanded", aberta ? "true" : "false");
      if (!guardar) return;
      fechadas = fechadas.filter(function (n) { return n !== nome; });
      if (!aberta) fechadas.push(nome);
      try { localStorage.setItem(CHAVE_SECOES, JSON.stringify(fechadas)); } catch (e) {}
    }
    definir(fechadas.indexOf(nome) < 0, false);
    titulo.addEventListener("click", function () { definir(secao.classList.contains("fechada"), true); });
    // Um formulário aberto por outro caminho (ex.: atalho) reabre a seção.
    secao.addEventListener("focusin", function (event) {
      if (event.target !== titulo && secao.classList.contains("fechada")) definir(true, true);
    });
  });
})();
