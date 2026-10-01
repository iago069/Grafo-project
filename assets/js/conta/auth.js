/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
(function () {
  "use strict";

  var form = document.getElementById("authForm");
  var emailInput = document.getElementById("authEmail");
  var passwordInput = document.getElementById("authPassword");
  var passwordLabel = document.getElementById("authPasswordLabel");
  var title = document.getElementById("authTitle");
  var intro = document.getElementById("authIntro");
  var message = document.getElementById("authMessage");
  var submit = document.getElementById("authSubmit");
  var toggle = document.getElementById("authToggle");
  var recover = document.getElementById("authRecover");
  var back = document.getElementById("authBack");
  var account = document.getElementById("accountTools");
  var status = document.getElementById("cloudStatus");
  var retry = document.getElementById("cloudRetry");
  var client = null;
  var user = null;
  var mode = "login";
  var activation = null;
  var pending = null;
  var inFlight = null;
  var timer = null;
  var lastSaved = null;
  var appLoaded = false;
  // Controle de concorrência: updated_at da linha que esta aba conhece. Cada
  // gravação só passa se o servidor ainda estiver nessa versão; senão outra aba
  // ou computador salvou antes e a pessoa escolhe qual versão fica.
  var serverVersion = null;
  var localState = null;
  var conflict = false;
  var lastCheck = 0;
  var conflictModal = document.getElementById("conflitoModal");
  var conflictText = document.getElementById("conflitoTexto");
  var deleting = false;
  // Editor aberto sem internet, com a cópia deste aparelho (activateOffline).
  var offline = false;
  // Uso sem login (activateGuest): projetos só neste navegador, sem nuvem.
  // Exportar funciona; compartilhar, histórico e equipe pedem login.
  var convidado = false;
  var CHAVE_MODO = "grafo-modo";
  var nameInput = document.getElementById("authNome");
  var nameLabel = document.getElementById("authNomeLabel");
  var repeatInput = document.getElementById("authRepetir");
  var repeatLabel = document.getElementById("authRepetirLabel");

  // Nome guardado na conta (Supabase: user_metadata), ou "" se a pessoa não informou.
  function nomeDoUsuario(u) {
    var m = u && u.user_metadata || {};
    return String(m.nome || m.full_name || m.name || "").trim();
  }

  function notice(text, error) {
    message.textContent = text || "";
    message.classList.toggle("error", !!error);
  }

  // O Supabase responde em inglês; as mensagens mais comuns vão em português.
  var ERROS_CONHECIDOS = [
    [/invalid login credentials/i, "E-mail ou senha incorretos."],
    [/email not confirmed/i, "Confirme seu e-mail antes de entrar. Procure a mensagem do Grafo na caixa de entrada (e no spam)."],
    [/user already registered/i, "Já existe uma conta com esse e-mail. Use \"Esqueci minha senha\" se não lembrar a senha."],
    [/password should be at least/i, "A senha precisa ter pelo menos 6 caracteres."],
    [/new password should be different/i, "A nova senha precisa ser diferente da atual."],
    [/unable to validate email|invalid email/i, "E-mail inválido."],
    [/rate limit|too many requests|for security purposes/i, "Muitas tentativas seguidas. Aguarde um minuto e tente de novo."],
    [/failed to fetch|network/i, "Sem conexão com o servidor de login. Verifique a internet."]
  ];
  function traduzirErro(error) {
    var texto = (error && error.message) || "";
    for (var i = 0; i < ERROS_CONHECIDOS.length; i++) {
      if (ERROS_CONHECIDOS[i][0].test(texto)) return ERROS_CONHECIDOS[i][1];
    }
    return texto || "Não foi possível entrar. Tente novamente.";
  }

  function setMode(next) {
    mode = next;
    notice("");
    title.textContent = next === "signup" ? "Crie sua conta" : next === "recover" ? "Recuperar acesso" : next === "reset" ? "Defina uma nova senha" : "Entre no Grafo";
    intro.textContent = next === "recover" ? "Enviaremos um link para o seu e-mail." : next === "reset" ? "Escolha a senha que usará daqui para frente." : "Seus projetos ficam disponíveis na sua conta.";
    emailInput.parentElement.querySelector('label[for="authEmail"]').hidden = next === "reset";
    emailInput.hidden = next === "reset";
    emailInput.required = next !== "reset";
    passwordInput.hidden = next === "recover";
    passwordLabel.hidden = next === "recover";
    passwordInput.required = next !== "recover";
    passwordInput.autocomplete = next === "login" ? "current-password" : "new-password";
    // Cadastro: nome e senha repetida. Nova senha (reset): só a repetição.
    var pedeNome = next === "signup", pedeRepetir = next === "signup" || next === "reset";
    nameInput.hidden = nameLabel.hidden = !pedeNome;
    nameInput.required = pedeNome;
    repeatInput.hidden = repeatLabel.hidden = !pedeRepetir;
    repeatInput.required = pedeRepetir;
    repeatInput.value = "";
    submit.textContent = next === "signup" ? "Cadastrar" : next === "recover" ? "Enviar link" : next === "reset" ? "Salvar nova senha" : "Entrar";
    toggle.hidden = next !== "login";
    recover.hidden = next !== "login";
    back.hidden = next === "login" || next === "reset";
  }

  function storageKey(key) {
    if (convidado) return key + ":convidado";
    if (!user) throw new Error("É necessário entrar na conta antes de acessar os projetos.");
    return key + ":" + user.id;
  }

  // Projetos feitos sem login neste navegador (ou null).
  function projetosSemLogin() {
    try {
      var p = JSON.parse(localStorage.getItem("grafo-projetos:convidado") || "null");
      return p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length ? p : null;
    } catch (e) { return null; }
  }
  function apagarProjetosSemLogin() {
    ["grafo-projetos", "grafo-projeto-atual", "diagrama-estado", "grafo-backup", "grafo-pagina"].forEach(function (k) {
      localStorage.removeItem(k + ":convidado");
    });
  }

  // Projetos de equipe (equipe.js): ficam no mesmo mapa do editor, mas cada um
  // é gravado na própria linha. Sem o módulo, tudo é pessoal, como antes.
  var equipe = window.GrafoEquipe || null;
  // O que vai para grafo_user_data: só os projetos pessoais.
  function personalSnapshot(snapshot) {
    return { projects: equipe ? equipe.separar(snapshot.projects) : snapshot.projects, current_project: snapshot.current_project };
  }

  // ---- Sem internet ----------------------------------------------------------
  // grafo-sincronia:<usuário> guarda as versões do servidor que este aparelho
  // conhece e se há alteração ainda não enviada. Com isso o editor abre sem
  // internet (com a cópia local, que app.js grava a cada alteração) e, quando a
  // conexão volta, envia o que ficou pendente com a mesma proteção contra
  // conflito de sempre. Também cobre a aba fechada antes de terminar de salvar.
  function readSync() {
    try { return JSON.parse(localStorage.getItem(storageKey("grafo-sincronia")) || "null"); } catch (e) { return null; }
  }
  function writeSync(unsent) {
    try {
      localStorage.setItem(storageKey("grafo-sincronia"), JSON.stringify({
        versao: serverVersion, pendente: !!unsent, equipe: equipe ? equipe.versoesConhecidas() : {}
      }));
    } catch (e) {}
  }
  function readLocalCopy() {
    try {
      var projects = JSON.parse(localStorage.getItem(storageKey("grafo-projetos")) || "null");
      if (!projects || typeof projects !== "object" || Array.isArray(projects) || !Object.keys(projects).length) return null;
      var current = localStorage.getItem(storageKey("grafo-projeto-atual"));
      return { projects: projects, current_project: projects[current] ? current : Object.keys(projects)[0] };
    } catch (e) { return null; }
  }
  function isNetworkError(error) {
    return navigator.onLine === false || /failed to fetch|networkerror|network request failed|load failed|fetch failed|AuthRetryableFetchError/i.test(
      (error && (error.name + " " + error.message)) || "");
  }

  // Alterações que não chegaram ao servidor (feitas sem internet ou com a aba
  // fechada antes de salvar) voltam como pendentes, comparadas com a versão que
  // o aparelho conhecia: se alguém salvou depois disso, a gravação falha e
  // aparece o aviso de conflito, em vez de uma versão apagar a outra.
  function resumePending(copy, sync) {
    var projects = Object.assign({}, copy.projects);
    var savedTeam = sync.equipe || {};
    if (equipe) {
      // Projeto pessoal criado aqui com o nome de um projeto de equipe novo: renomeia.
      Object.keys(projects).forEach(function (key) {
        if (!savedTeam[key] && equipe.ehEquipe(key)) {
          var name = key + " (este aparelho)";
          for (var n = 2; projects[name] || equipe.ehEquipe(name); n++) name = key + " (este aparelho " + n + ")";
          projects[name] = projects[key];
          delete projects[key];
        }
      });
      // Projetos de equipe: acompanha renomeações e tira os de equipes que a pessoa deixou.
      // (Duas passadas: apagar todas antes de recolocar, para nomes trocados não se sobreporem.)
      var keys = equipe.usarVersoesBase(savedTeam, copy.projects);
      Object.keys(keys).forEach(function (old) { delete projects[old]; });
      Object.keys(keys).forEach(function (old) {
        if (keys[old] && copy.projects[old]) projects[keys[old]] = copy.projects[old];
      });
      // Equipes em que a pessoa entrou por outro aparelho: vêm do servidor.
      Object.keys(localState ? localState.projects : {}).forEach(function (key) {
        if (equipe.ehEquipe(key) && !projects[key]) projects[key] = localState.projects[key];
      });
    }
    if (!Object.keys(projects).length) return;
    var current = projects[copy.current_project] ? copy.current_project : Object.keys(projects)[0];
    var snapshot = { projects: projects, current_project: current };
    // Só volta à versão antiga se os projetos pessoais mudaram aqui; senão o
    // servidor já tem o que importa e a versão atual dele vale.
    if (JSON.stringify(personalSnapshot(snapshot)) !== lastSaved) serverVersion = sync.versao || null;
    localStorage.setItem(storageKey("grafo-projetos"), JSON.stringify(projects));
    localStorage.setItem(storageKey("grafo-projeto-atual"), current);
    localState = snapshot;
    pending = snapshot;
    writeSync(true);
  }

  // team: { projetos: {chave: dados}, abrir: chave|null } vindo de equipe.carregar().
  function prepareLocal(row, team) {
    var personal = row && row.projects && typeof row.projects === "object" && !Array.isArray(row.projects) ? row.projects : {};
    var teamProjects = team && team.projetos || {};
    var projects = Object.assign({}, personal, teamProjects);
    serverVersion = row && row.updated_at || null;
    if (Object.keys(projects).length) {
      var current = team && team.abrir || row && row.current_project;
      if (!projects[current]) current = Object.keys(projects)[0];
      localStorage.setItem(storageKey("grafo-projetos"), JSON.stringify(projects));
      localStorage.setItem(storageKey("grafo-projeto-atual"), current);
      localState = { projects: projects, current_project: current };
      lastSaved = Object.keys(personal).length ? JSON.stringify({ projects: personal, current_project: row.current_project || Object.keys(personal)[0] }) : null;
    } else {
      localStorage.removeItem(storageKey("grafo-projetos"));
      localStorage.removeItem(storageKey("grafo-projeto-atual"));
      localState = null;
      lastSaved = null;
    }
    writeSync(false);
  }

  // Sempre maior que a versão atual, mesmo com o relógio deste computador atrasado.
  function nextVersion() {
    var time = Date.now();
    if (serverVersion) time = Math.max(time, Date.parse(serverVersion) + 1);
    return new Date(time).toISOString();
  }

  // Grava só se ninguém salvou desde a última leitura. Retorna false no conflito.
  async function write(snapshot) {
    var response;
    var fields = { projects: snapshot.projects, current_project: snapshot.current_project, updated_at: nextVersion() };
    if (serverVersion) {
      response = await client.from("grafo_user_data").update(fields)
        .eq("user_id", user.id).eq("updated_at", serverVersion)
        .select("updated_at");
      if (!response.error && !response.data.length) return false;
    } else {
      fields.user_id = user.id;
      response = await client.from("grafo_user_data").insert(fields).select("updated_at");
      // 23505: a linha já existe, criada por outra aba desde a leitura.
      if (response.error && response.error.code === "23505") return false;
    }
    if (response.error) throw response.error;
    serverVersion = response.data[0].updated_at;
    return true;
  }

  // resume: { copy, sync } com alterações deste aparelho ainda não enviadas.
  async function loadProjects(resume) {
    var response = await client.from("grafo_user_data")
      .select("projects,current_project,updated_at")
      .eq("user_id", user.id).maybeSingle();
    if (response.error) throw response.error;
    var row = response.data;
    serverVersion = row && row.updated_at || null;
    // Os projetos antigos não são associados automaticamente à primeira conta
    // que entrar no computador. A pessoa decide se quer importá-los.
    if (!row) {
      var legacy = localStorage.getItem("grafo-projetos");
      var parsed = null;
      try { parsed = JSON.parse(legacy); } catch (_) {}
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length &&
          window.confirm("Há projetos antigos salvos neste navegador. Deseja copiá-los para esta conta?")) {
        row = { projects: parsed, current_project: localStorage.getItem("grafo-projeto-atual") || Object.keys(parsed)[0] };
        if (!(await write(row))) throw new Error("Os projetos desta conta foram criados em outra aba. Recarregue a página.");
        row.updated_at = serverVersion;
        localStorage.removeItem("grafo-projetos");
        localStorage.removeItem("grafo-projeto-atual");
        localStorage.removeItem("diagrama-estado");
      }
    }
    // Projetos feitos sem login neste navegador: a pessoa decide se vão para a
    // conta. Nomes repetidos ganham "(2)". A cópia local só sai depois que a
    // gravação na nuvem deu certo.
    var semLogin = projetosSemLogin();
    if (semLogin) {
      var qtd = Object.keys(semLogin).length;
      if (window.confirm((qtd === 1 ? "Há 1 projeto feito" : "Há " + qtd + " projetos feitos") + " sem login neste navegador. Deseja copiar para esta conta?")) {
        var destino = Object.assign({}, row && row.projects || {});
        var primeiro = null;
        Object.keys(semLogin).forEach(function (nome) {
          var final = nome;
          for (var n = 2; destino[final]; n++) final = String(nome).slice(0, 50) + " (" + n + ")";
          destino[final] = semLogin[nome];
          if (!primeiro) primeiro = final;
        });
        var juntos = { projects: destino, current_project: primeiro };
        if (!(await write(juntos))) throw new Error("Os projetos desta conta foram alterados em outra aba. Recarregue a página.");
        row = { projects: destino, current_project: primeiro, updated_at: serverVersion };
        apagarProjetosSemLogin();
      }
    }
    var occupied = {};
    if (row && row.projects && typeof row.projects === "object") Object.keys(row.projects).forEach(function (k) { occupied[k] = true; });
    var team = equipe ? await equipe.carregar(client, user, occupied) : null;
    // Há alteração de projeto de equipe por enviar, mas as equipes não carregaram:
    // segue com a cópia deste aparelho (activate) em vez de substituí-la.
    if (resume && team && team.falhou && Object.keys(resume.sync.equipe || {}).length) {
      var keep = new Error("Projetos de equipe indisponíveis.");
      keep.keepLocal = true;
      throw keep;
    }
    prepareLocal(row, team);
    if (resume) resumePending(resume.copy, resume.sync);
  }

  function loadScript(src, integrity) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      if (integrity) { script.integrity = integrity; script.crossOrigin = "anonymous"; }
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Não foi possível carregar o editor.")); };
      document.body.appendChild(script);
    });
  }

  // O que só o editor usa carrega depois do login: a página inicial fica leve.
  // (sessao.js já começa a baixar estes arquivos para quem tem sessão salva.)
  var EDITOR_SCRIPTS = [
    ["https://cdn.jsdelivr.net/npm/@viz-js/viz@3.31.0/dist/viz-global.js", "sha384-iX6VK6ib27dxYB4T470zbHOsDDoLewuYvrIgv2B3XXe8kgfKsGMf8QIleFy6VPi4"],
    ["./assets/vendor/zod-3.25.76.min.js"],
    ["./assets/js/comum/esquema.js"],
    ["./assets/js/recursos/planilha.js"],
    ["./assets/js/editor/app.js"]
  ];

  async function loadApp() {
    if (appLoaded) return;
    for (var i = 0; i < EDITOR_SCRIPTS.length; i++) await loadScript(EDITOR_SCRIPTS[i][0], EDITOR_SCRIPTS[i][1]);
    appLoaded = true;
    loadScript("./assets/js/recursos/primeiros-passos.js").catch(function (error) { console.error(error); });
    // Etiquetas exportam um PDF: valem também sem login.
    loadScript("./assets/js/recursos/etiquetas.js").catch(function (error) { console.error(error); });
    if (convidado) { prepararBotoesQuePedemLogin(); return; }
    if (equipe) equipe.iniciarInterface();
    // Opcional: sem ele o editor funciona, só não há o botão "Compartilhar".
    loadScript("./assets/js/recursos/compartilhar.js").catch(function (error) { console.error(error); });
    // Opcional: sem ele não há o botão "Histórico".
    loadScript("./assets/js/recursos/historico.js").catch(function (error) { console.error(error); });
  }

  // ---- Sem login -------------------------------------------------------------
  // O editor abre com os projetos guardados só neste navegador. Compartilhar,
  // Histórico e Equipe aparecem, mas pedem login (os módulos nem carregam).
  var RECURSOS_COM_LOGIN = {
    btnCompartilhar: "compartilhar um link do diagrama",
    btnHistorico: "guardar e restaurar versões anteriores",
    btnEquipe: "editar em equipe"
  };
  function prepararBotoesQuePedemLogin() {
    Object.keys(RECURSOS_COM_LOGIN).forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.hidden = false;
      b.classList.add("requer-login");
      b.setAttribute("aria-haspopup", "dialog");
      b.title = "Entre na sua conta para " + RECURSOS_COM_LOGIN[id];
      b.addEventListener("click", function () { pedirLogin(RECURSOS_COM_LOGIN[id]); });
    });
  }

  var loginModal = document.getElementById("loginNecessarioModal");
  function pedirLogin(oQue) {
    document.getElementById("loginNecessarioTexto").textContent =
      "Para " + oQue + ", entre na sua conta ou crie uma (é grátis). Os projetos que você fez sem login podem ser copiados para a conta.";
    loginModal.classList.remove("hidden", "saindo");
    document.getElementById("loginNecessarioEntrar").focus();
  }
  function fecharPedidoLogin() { loginModal.classList.add("hidden"); }
  // Vai para a página inicial, com o formulário aberto (o editor sem login fica para trás).
  function irParaLogin(modo) {
    location.href = location.pathname + "?" + (modo === "signup" ? "criar-conta" : "entrar") + "=1";
  }
  loginModal.querySelectorAll("[data-login-fechar]").forEach(function (b) { b.addEventListener("click", fecharPedidoLogin); });
  loginModal.addEventListener("click", function (event) { if (event.target === loginModal) fecharPedidoLogin(); });
  loginModal.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fecharPedidoLogin(); } });
  document.getElementById("loginNecessarioEntrar").addEventListener("click", function () { irParaLogin("login"); });
  document.getElementById("loginNecessarioCriar").addEventListener("click", function () { irParaLogin("signup"); });

  async function activateGuest() {
    if (appLoaded || activation) return;
    convidado = true;
    try { localStorage.setItem(CHAVE_MODO, "convidado"); } catch (e) {}
    try {
      await loadApp();
    } catch (error) {
      convidado = false;
      notice("Não foi possível abrir o editor. Verifique a conexão e tente novamente.", true);
      return;
    }
    document.body.classList.add("modo-convidado");
    document.getElementById("btnEntrarConvidado").hidden = false;
    atualizarUsuarioNaBarra();
    document.body.classList.remove("auth-locked");
    notice("");
  }

  // Pé da barra lateral: só o nome de quem está usando (ou "Sem login").
  function atualizarUsuarioNaBarra() {
    var caixa = document.getElementById("sidebarUsuario");
    if (!caixa) return;
    var nome = convidado ? "" : nomeDoUsuario(user);
    var email = !convidado && user && user.email || "";
    // O primeiro nome (ou o começo do e-mail, para quem ainda não tem nome).
    document.getElementById("sidebarUsuarioNome").textContent = convidado ? "Sem login" : (nome ? nome.split(" ")[0] : email.split("@")[0]);
    caixa.title = convidado ? "Usando sem login" : (nome || "Adicione seu nome em Minha conta");
    caixa.classList.toggle("convidado", convidado);
    caixa.hidden = false;
  }
  document.getElementById("btnEntrarConvidado").addEventListener("click", function () { irParaLogin("login"); });
  document.querySelectorAll("[data-usar-sem-login]").forEach(function (b) {
    b.addEventListener("click", function () { activateGuest(); });
  });

  async function activate(session) {
    if (!session || !session.user) return;
    if (activation) return activation;
    activation = (async function () {
      user = session.user;
      notice("Carregando seus projetos...");
      try {
        var sync = readSync();
        var copy = sync && sync.pendente ? readLocalCopy() : null;
        await loadProjects(copy && { copy: copy, sync: sync });
        await loadApp();
        showEditor();
        // Alterações deste aparelho que ficaram por enviar.
        if (pending) {
          status.textContent = "Enviando alterações feitas neste aparelho...";
          flush().catch(logSaveError);
        }
      } catch (error) {
        if ((isNetworkError(error) || error.keepLocal) && await activateOffline(session.user)) return;
        user = null;
        notice("Não foi possível carregar os projetos. Verifique a conexão e tente novamente. " + (error.message || ""), true);
      } finally {
        activation = null;
      }
    })();
    return activation;
  }

  function showEditor() {
    document.getElementById("accountEmail").textContent = user.email || "Minha conta";
    try { localStorage.removeItem(CHAVE_MODO); } catch (e) {}
    atualizarUsuarioNaBarra();
    account.hidden = false;
    document.body.classList.remove("auth-locked");
    notice("");
    keepEditorOffline();
  }

  // Sem internet: abre o editor com a cópia deste aparelho. As alterações ficam
  // guardadas aqui (grafo-sincronia marca o que falta enviar) e, quando a
  // conexão volta, a página recarrega e activate() as envia.
  async function activateOffline(sessionUser) {
    if (!sessionUser || !sessionUser.id) return false;
    user = sessionUser;
    var copy = readLocalCopy();
    if (!copy) { user = null; return false; }
    var sync = readSync() || { pendente: true };
    offline = true;
    serverVersion = sync.versao || null;
    if (equipe) equipe.restaurarOffline(sync.equipe || {}, copy.projects, !sync.pendente, client, user);
    localState = copy;
    lastSaved = sync.pendente ? null : JSON.stringify(personalSnapshot(copy));
    try {
      await loadApp();
    } catch (error) {
      offline = false;
      user = null;
      return false;
    }
    showEditor();
    status.textContent = "Sem internet: as alterações ficam neste aparelho";
    // Sem recarregar sozinho: se o servidor estiver fora do ar com a internet
    // funcionando, a página ficaria recarregando sem parar. O botão tenta de novo.
    retry.hidden = false;
    return true;
  }

  // Conexão de volta com o editor aberto sem internet: recarrega para enviar as
  // alterações (sem atrapalhar quem está no meio de um formulário).
  var reloading = false;
  function reloadWhenIdle() {
    if (reloading) return;
    reloading = true;
    status.textContent = "Conexão de volta. Sincronizando...";
    var field = document.activeElement;
    if (field && /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName) && field.closest("form, .modal-backdrop")) {
      field.addEventListener("blur", function () { location.reload(); }, { once: true });
      return;
    }
    location.reload();
  }
  window.addEventListener("online", function () {
    if (offline) { setTimeout(reloadWhenIdle, 1500); return; }
    if (pending && !conflict && user) flush().catch(logSaveError);
  });
  window.addEventListener("offline", function () {
    if (user && !offline) status.textContent = "Sem internet: as alterações ficam neste aparelho";
  });

  // Guarda neste aparelho o que o editor carrega depois do login (sw.js), para
  // abrir e exportar sem internet.
  function keepEditorOffline() {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    var urls = EDITOR_SCRIPTS.map(function (script) { return script[0]; })
      .concat(["./assets/js/recursos/primeiros-passos.js", "./assets/js/recursos/compartilhar.js", "./assets/js/recursos/historico.js", "./assets/js/recursos/etiquetas.js"]);
    if (window.GrafoApp && window.GrafoApp.arquivosParaGuardar) urls = urls.concat(window.GrafoApp.arquivosParaGuardar());
    navigator.serviceWorker.controller.postMessage({ tipo: "guardar", urls: urls });
  }
  // Primeira visita: o service worker só assume a página depois de instalado.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", function () { if (appLoaded && user) keepEditorOffline(); });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function (error) { console.error("Falha ao registrar o service worker:", error); });
    });
  }

  function showConflict(unsaved) {
    conflict = true;
    conflictText.textContent = unsaved
      ? "Seus projetos foram salvos em outra aba ou computador depois que esta aba foi aberta. As alterações desta aba ainda não foram salvas. Escolha qual versão fica."
      : "Seus projetos foram salvos em outra aba ou computador depois que esta aba foi aberta. Carregue a versão mais recente antes de continuar editando.";
    status.textContent = "Alterado em outro lugar";
    retry.hidden = true;
    conflictModal.classList.remove("hidden");
    document.getElementById(unsaved ? "conflitoBaixar" : "conflitoRecarregar").focus();
  }

  async function flush() {
    if (!client || !user) return false;
    // Sem internet, as alterações ficam no aparelho até a página recarregar online.
    if (offline) return !pending;
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) { await inFlight; if (!pending) return true; }
    if (!pending) return true;
    if (conflict) throw new Error("Projeto alterado em outro lugar.");
    inFlight = (async function () {
      while (pending) {
        var snapshot = pending;
        pending = null;
        status.textContent = "Salvando...";
        var personal = personalSnapshot(snapshot);
        var personalJson = JSON.stringify(personal);
        var saved = true;
        try {
          if (personalJson !== lastSaved) {
            saved = await write(personal);
            if (saved) lastSaved = personalJson;
          }
          if (saved && equipe) saved = (await equipe.gravar(snapshot.projects)) === "ok";
        } catch (error) {
          pending = pending || snapshot;
          status.textContent = "Erro ao salvar";
          retry.hidden = false;
          throw error;
        }
        if (!saved) {
          pending = pending || snapshot;
          showConflict(true);
          throw new Error("Projeto alterado em outro lugar.");
        }
        status.textContent = "Salvo na nuvem";
        retry.hidden = true;
      }
      writeSync(false);
    })();
    try { await inFlight; return true; }
    finally { inFlight = null; }
  }

  function logSaveError(error) {
    if (!conflict) console.error("Falha ao salvar projeto:", error);
  }

  window.GrafoAuth = {
    storageKey: storageKey,
    scheduleSave: function (projects, currentProject) {
      if (convidado) return; // sem login: o app.js já guardou neste navegador
      if (!user || deleting) return;
      var snapshot = { projects: JSON.parse(JSON.stringify(projects)), current_project: currentProject };
      var unchanged = JSON.stringify(personalSnapshot(snapshot)) === lastSaved && !(equipe && equipe.temAlteracao(snapshot.projects));
      localState = snapshot;
      if (unchanged && !pending) return;
      pending = snapshot;
      writeSync(true);
      if (offline) { status.textContent = "Sem internet: alteração guardada neste aparelho"; return; }
      // Com o conflito aberto, guarda a alteração e espera a escolha da pessoa.
      if (conflict) return;
      status.textContent = "Alterações pendentes";
      retry.hidden = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { flush().catch(logSaveError); }, 800);
    },
    flush: flush,
    // Para módulos que falam com o Supabase por conta própria (compartilhar.js).
    client: function () { return client; },
    userId: function () { return user && user.id; },
    // Sem login: projetos só neste navegador; recursos da nuvem pedem login.
    logado: function () { return !!user && !convidado; },
    pedirLogin: function (oQue) { pedirLogin(oQue || "usar este recurso"); },
    nome: function () { return convidado ? "" : nomeDoUsuario(user); }
  };

  retry.addEventListener("click", function () {
    if (offline) { reloadWhenIdle(); return; }
    if (pending) flush().catch(logSaveError);
  });

  // Ao voltar para a aba, confere se outra aba ou computador salvou nesse meio-tempo,
  // para avisar antes de a pessoa editar uma versão desatualizada.
  async function checkRemote() {
    if (!client || !user || offline || conflict || pending || inFlight || Date.now() - lastCheck < 5000) return;
    lastCheck = Date.now();
    var known = serverVersion;
    var response = await client.from("grafo_user_data").select("updated_at").eq("user_id", user.id).maybeSingle();
    if (response.error || conflict || pending || inFlight || serverVersion !== known) return;
    var remote = response.data && response.data.updated_at || null;
    if (remote && remote !== known) showConflict(false);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkRemote().catch(function () {});
  });
  window.addEventListener("focus", function () { checkRemote().catch(function () {}); });

  document.getElementById("conflitoRecarregar").addEventListener("click", function () {
    // Ao recarregar, loadProjects busca a versão do servidor e substitui a local.
    pending = null;
    writeSync(false);
    location.reload();
  });

  document.getElementById("conflitoManter").addEventListener("click", async function () {
    var button = this;
    button.disabled = true;
    try {
      var response = await client.from("grafo_user_data").select("updated_at").eq("user_id", user.id).maybeSingle();
      if (response.error) throw response.error;
      serverVersion = response.data && response.data.updated_at || null;
      if (equipe) await equipe.assumirVersoesAtuais();
      conflict = false;
      conflictModal.classList.add("hidden");
      pending = pending || localState;
      lastSaved = null;
      await flush();
    } catch (error) {
      if (!conflict) {
        status.textContent = "Erro ao salvar";
        retry.hidden = false;
      }
    } finally {
      button.disabled = false;
    }
  });

  // Baixa o projeto aberto no mesmo formato de "Exportar projeto", para importar depois.
  document.getElementById("conflitoBaixar").addEventListener("click", function () {
    var state = pending || localState;
    if (!state || !state.projects) return;
    var name = state.current_project;
    var project = state.projects[name] || {};
    var content = JSON.stringify({ projeto: name, equipamentos: project.equipamentos || [], conexoes: project.conexoes || [] }, null, 2);
    var file = String(name).replace(/[^\wÀ-ſ-]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
    var url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = "grafo-" + file + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  document.getElementById("accountLogout").addEventListener("click", async function () {
    try {
      await flush();
      // Sair apaga a cópia deste aparelho: nada pode ficar sem enviar.
      if (pending || offline) throw new Error("Alterações ainda não enviadas.");
      var leavingUserId = user.id;
      var result = await client.auth.signOut();
      if (result.error) throw result.error;
      ["grafo-projetos", "grafo-projeto-atual", "diagrama-estado", "grafo-backup", "grafo-sincronia"].forEach(function (key) {
        localStorage.removeItem(key + ":" + leavingUserId);
      });
      location.reload();
    } catch (error) {
      status.textContent = "Falha ao salvar ou sair. Exporte o projeto e tente novamente.";
    }
  });

  // ---- Minha conta (LGPD): cópia dos projetos e exclusão da conta ----------
  var accountModal = document.getElementById("contaModal");
  var accountConfirm = document.getElementById("contaConfirmar");
  var accountDelete = document.getElementById("contaExcluir");
  var accountMessage = document.getElementById("contaMensagem");
  var accountReturnFocus = null;

  function accountNotice(text, error) {
    accountMessage.textContent = text || "";
    accountMessage.classList.toggle("erro", !!error);
  }
  function openAccount() {
    if (!user || convidado) return;
    accountReturnFocus = document.activeElement;
    document.getElementById("contaEmail").textContent = user && user.email || "";
    document.getElementById("contaNome").value = nomeDoUsuario(user);
    document.getElementById("contaNomeMensagem").textContent = "";
    accountConfirm.value = "";
    accountDelete.disabled = true;
    accountNotice("");
    accountModal.classList.remove("hidden");
    document.getElementById("contaBaixar").focus();
  }
  function closeAccount() {
    if (deleting) return;
    accountModal.classList.add("hidden");
    if (accountReturnFocus && accountReturnFocus.focus) accountReturnFocus.focus();
  }
  function confirmationMatches() {
    return !!user && !!user.email && accountConfirm.value.trim().toLowerCase() === user.email.toLowerCase();
  }

  // Nome da conta: aparece na barra lateral e no menu da conta.
  document.getElementById("contaNomeForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var campo = document.getElementById("contaNome");
    var aviso = document.getElementById("contaNomeMensagem");
    var nome = campo.value.trim().replace(/\s+/g, " ").slice(0, 60);
    if (nome.length < 2) { aviso.textContent = "Digite seu nome."; aviso.classList.add("erro"); campo.focus(); return; }
    var botaoSalvar = this.querySelector("button[type=submit]");
    botaoSalvar.disabled = true;
    aviso.classList.remove("erro");
    aviso.textContent = "Salvando...";
    try {
      var r = await client.auth.updateUser({ data: { nome: nome, full_name: nome } });
      if (r.error) throw r.error;
      user = r.data.user || user;
      atualizarUsuarioNaBarra();
      aviso.textContent = "Nome salvo.";
    } catch (error) {
      aviso.classList.add("erro");
      aviso.textContent = "Não foi possível salvar o nome. " + traduzirErro(error);
    } finally {
      botaoSalvar.disabled = false;
    }
  });

  document.getElementById("accountOpen").addEventListener("click", openAccount);
  accountModal.querySelectorAll("[data-conta-fechar]").forEach(function (b) { b.addEventListener("click", closeAccount); });
  accountModal.addEventListener("click", function (event) { if (event.target === accountModal) closeAccount(); });
  accountModal.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); closeAccount(); } });
  // O botão da barra lateral (app.js) monta o arquivo com todos os projetos.
  document.getElementById("contaBaixar").addEventListener("click", function () { document.getElementById("btnExportarTodos").click(); });
  accountConfirm.addEventListener("input", function () { accountDelete.disabled = !confirmationMatches(); });

  document.getElementById("contaExcluirForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!client || !user || deleting || !confirmationMatches()) return;
    deleting = true;
    accountDelete.disabled = true;
    accountNotice("Excluindo a conta...");
    // Nada mais é salvo: uma gravação atrasada recriaria os dados apagados.
    if (timer) { clearTimeout(timer); timer = null; }
    pending = null;
    try {
      if (inFlight) await inFlight.catch(function () {});
      var result = await client.rpc("excluir_minha_conta");
      if (result.error) throw result.error;
      var leavingUserId = user.id;
      ["grafo-projetos", "grafo-projeto-atual", "diagrama-estado", "grafo-backup", "grafo-pagina", "grafo-sincronia"].forEach(function (key) {
        localStorage.removeItem(key + ":" + leavingUserId);
      });
      // A sessão pertence a um usuário que não existe mais; sair só limpa o navegador.
      await client.auth.signOut({ scope: "local" }).catch(function () {});
      location.replace(location.pathname + "?conta-excluida=1");
    } catch (error) {
      deleting = false;
      accountDelete.disabled = !confirmationMatches();
      var missing = error && (error.code === "PGRST202" || /could not find the function|excluir_minha_conta/i.test(error.message || ""));
      accountNotice(missing
        ? "A exclusão de conta ainda não está ativada no servidor. Entre em contato com o responsável pelo Grafo."
        : "Não foi possível excluir a conta. Verifique a conexão e tente de novo. " + traduzirErro(error), true);
    }
  });

  // ---- Página inicial ------------------------------------------------------
  var authCard = document.getElementById("authCard");
  // A sessão salva não valeu (ou não havia): mostra a página inicial.
  function showLanding() { document.documentElement.classList.remove("com-sessao"); }
  function goToCard() {
    var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    authCard.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "center" });
  }
  // Botões "Criar conta" / "Entrar" da página: abrem o formulário no modo certo.
  document.querySelectorAll("[data-ir-para]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      var cadastro = botao.getAttribute("data-ir-para") === "signup";
      setMode(cadastro ? "signup" : "login");
      goToCard();
      setTimeout(function () { (cadastro ? nameInput : emailInput).focus({ preventScroll: true }); }, 350);
    });
  });

  toggle.addEventListener("click", function () { setMode("signup"); });
  recover.addEventListener("click", function () { setMode("recover"); });
  back.addEventListener("click", function () { setMode("login"); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!client) return;
    submit.disabled = true;
    notice("");
    try {
      var email = emailInput.value.trim();
      var password = passwordInput.value;
      var result;
      if ((mode === "signup" || mode === "reset") && password !== repeatInput.value) {
        notice("As senhas não são iguais. Digite a mesma senha nos dois campos.", true);
        repeatInput.focus();
        return;
      }
      if (mode === "signup") {
        var nome = nameInput.value.trim().replace(/\s+/g, " ");
        if (nome.length < 2) { notice("Digite seu nome.", true); nameInput.focus(); return; }
        // O nome fica na conta (user_metadata): aparece na barra lateral e no menu.
        result = await client.auth.signUp({ email: email, password: password, options: {
          emailRedirectTo: location.origin + location.pathname, data: { nome: nome.slice(0, 60), full_name: nome.slice(0, 60) }
        } });
        if (result.error) throw result.error;
        notice(result.data.session ? "Conta criada. Carregando..." : "Cadastro recebido. Confirme o e-mail para entrar.");
        if (result.data.session) await activate(result.data.session);
      } else if (mode === "recover") {
        // ?recuperar=1 marca a volta do e-mail: o bootstrap abre direto a tela de
        // nova senha, sem depender do evento PASSWORD_RECOVERY (que chega tarde).
        result = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "?recuperar=1" });
        if (result.error) throw result.error;
        notice("Se houver uma conta para esse e-mail, você receberá um link de recuperação.");
      } else if (mode === "reset") {
        result = await client.auth.updateUser({ password: password });
        if (result.error) throw result.error;
        history.replaceState(null, "", location.pathname);
        setMode("login");
        notice("Senha alterada. Seus projetos estão sendo carregados.");
        var sessionResult = await client.auth.getSession();
        if (sessionResult.data.session) await activate(sessionResult.data.session);
      } else {
        result = await client.auth.signInWithPassword({ email: email, password: password });
        if (result.error) throw result.error;
        await activate(result.data.session);
      }
    } catch (error) {
      notice(traduzirErro(error), true);
    } finally {
      submit.disabled = false;
    }
  });

  // Usuário da sessão guardada pelo Supabase (sb-<projeto>-auth-token), para abrir
  // sem internet quando ela não pode ser renovada.
  function storedUser(url) {
    try {
      var ref = new URL(url).hostname.split(".")[0];
      var saved = JSON.parse(localStorage.getItem("sb-" + ref + "-auth-token") || "null");
      var found = saved && (saved.user || (saved.currentSession && saved.currentSession.user));
      return found && found.id ? found : null;
    } catch (e) { return null; }
  }

  // Link de recuperação de senha. O Supabase abre a sessão ao processar o link
  // e só depois dispara PASSWORD_RECOVERY; sem olhar a URL antes, o app via a
  // sessão e entrava direto no editor, sem pedir a senha nova.
  // Reconhece: ?recuperar=1 (nosso marcador) e #...type=recovery (fluxo implícito).
  function linkDeRecuperacao() {
    return /[?&]recuperar=1(&|$)/.test(location.search) || /(^#|&)type=recovery(&|$)/.test(location.hash);
  }
  // Link vencido ou já usado: o Supabase volta com #error=...&error_code=...
  function erroNoLink() {
    var hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    return hash.get("error_code") || hash.get("error") || "";
  }

  // Quem escolheu "usar sem login" neste navegador (e não pediu para entrar).
  function querUsarSemLogin(irPara) {
    var salvo = null;
    try { salvo = localStorage.getItem(CHAVE_MODO); } catch (e) {}
    return salvo === "convidado" && !irPara && !(equipe && equipe.conviteNaUrl());
  }

  (async function bootstrap() {
    notice("Preparando o login...");
    var accountDeleted = /[?&]conta-excluida=1(&|$)/.test(location.search);
    if (accountDeleted) history.replaceState(null, "", location.pathname);
    // Vindo do editor sem login ("Entrar" / "Criar conta"): abre o formulário.
    var irPara = /[?&]criar-conta=1(&|$)/.test(location.search) ? "signup" : /[?&]entrar=1(&|$)/.test(location.search) ? "login" : null;
    if (irPara) { history.replaceState(null, "", location.pathname); setMode(irPara); }
    var erroLink = erroNoLink();
    if (erroLink) {
      history.replaceState(null, "", location.pathname);
      setMode(/recover|otp_expired|access_denied/.test(erroLink) ? "recover" : "login");
    } else if (linkDeRecuperacao()) {
      setMode("reset");
    }
    try {
      var response = await fetch("/api/auth-config", { cache: "no-store" });
      if (!response.ok) throw new Error("Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no servidor.");
      var config = await response.json();
      if (!config.url || !config.key || !window.supabase) throw new Error("Configuração de autenticação incompleta ou biblioteca indisponível.");
      client = window.supabase.createClient(config.url, config.key);
      client.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset");
          document.body.classList.add("auth-locked");
        } else if (event === "SIGNED_OUT") {
          document.body.classList.add("auth-locked");
          user = null;
          // Sessão encerrada com o editor aberto (expirou, saiu em outra aba):
          // recarrega para não sobrar na memória o projeto da conta anterior,
          // que seria salvo na próxima conta a entrar.
          // Na exclusão da conta, quem navega é o próprio fluxo de exclusão.
          if (appLoaded && !deleting) location.reload();
        } else if (event === "SIGNED_IN" && mode !== "reset" && session && !appLoaded) {
          // Evita chamadas Supabase dentro do callback de mudança de sessão.
          setTimeout(function () { activate(session); }, 0);
        }
      });
      var initial = await client.auth.getSession();
      // Sem internet com o login vencido (dura 1 hora): o Supabase não consegue
      // renovar, mas a sessão continua guardada. Abre a cópia deste aparelho.
      if (initial.error && isNetworkError(initial.error) && !erroLink && mode !== "reset" &&
          await activateOffline(storedUser(config.url))) {
        initial = { data: { session: null }, error: null };
      }
      if (initial.error) throw initial.error;
      if (appLoaded) {
        // Já aberto sem internet.
      } else if (erroLink) {
        notice("O link expirou ou já foi usado. Digite seu e-mail para receber um novo.", true);
      } else if (mode === "reset") {
        notice(initial.data.session ? "" : "Link inválido ou expirado. Volte ao login e peça um novo em \"Esqueci minha senha\".", !initial.data.session);
        back.hidden = !!initial.data.session;
      } else if (initial.data.session) {
        await activate(initial.data.session);
      } else if (querUsarSemLogin(irPara) && !accountDeleted) {
        await activateGuest();
      } else {
        var invited = equipe && equipe.conviteNaUrl();
        notice(accountDeleted ? "Sua conta e todos os projetos foram excluídos."
          : invited ? "Você recebeu um convite para editar um projeto em equipe. Entre ou crie sua conta para participar." : "");
      }
    } catch (error) {
      // "Failed to fetch" etc. viram mensagem em português (ERROS_CONHECIDOS).
      notice(traduzirErro(error), true);
      submit.disabled = true;
      // Sem login não depende do servidor: abre mesmo sem internet.
      if (querUsarSemLogin(irPara)) await activateGuest();
    }
    // Sem editor aberto (sem sessão, sessão vencida ou erro): mostra a página
    // inicial; se a pessoa veio de um link de e-mail, leva direto ao formulário.
    if (!appLoaded) {
      showLanding();
      if (mode !== "login" || irPara || erroLink || accountDeleted || (equipe && equipe.conviteNaUrl())) goToCard();
      if (irPara) setTimeout(function () { (irPara === "signup" ? nameInput : emailInput).focus({ preventScroll: true }); }, 350);
    }
  })();
})();
