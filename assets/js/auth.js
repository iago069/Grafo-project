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
    submit.textContent = next === "signup" ? "Cadastrar" : next === "recover" ? "Enviar link" : next === "reset" ? "Salvar nova senha" : "Entrar";
    toggle.hidden = next !== "login";
    recover.hidden = next !== "login";
    back.hidden = next === "login" || next === "reset";
  }

  function storageKey(key) {
    if (!user) throw new Error("É necessário entrar na conta antes de acessar os projetos.");
    return key + ":" + user.id;
  }

  function prepareLocal(row) {
    var projects = row && row.projects && typeof row.projects === "object" && !Array.isArray(row.projects) ? row.projects : null;
    if (projects && Object.keys(projects).length) {
      localStorage.setItem(storageKey("grafo-projetos"), JSON.stringify(projects));
      localStorage.setItem(storageKey("grafo-projeto-atual"), row.current_project || Object.keys(projects)[0]);
      lastSaved = JSON.stringify({ projects: projects, current_project: row.current_project || Object.keys(projects)[0] });
    } else {
      localStorage.removeItem(storageKey("grafo-projetos"));
      localStorage.removeItem(storageKey("grafo-projeto-atual"));
      lastSaved = null;
    }
  }

  async function loadProjects() {
    var response = await client.from("grafo_user_data")
      .select("projects,current_project")
      .eq("user_id", user.id).maybeSingle();
    if (response.error) throw response.error;
    var row = response.data;
    // Os projetos antigos não são associados automaticamente à primeira conta
    // que entrar no computador. A pessoa decide se quer importá-los.
    if (!row) {
      var legacy = localStorage.getItem("grafo-projetos");
      var parsed = null;
      try { parsed = JSON.parse(legacy); } catch (_) {}
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length &&
          window.confirm("Há projetos antigos salvos neste navegador. Deseja copiá-los para esta conta?")) {
        row = { projects: parsed, current_project: localStorage.getItem("grafo-projeto-atual") || Object.keys(parsed)[0] };
        var migrated = await client.from("grafo_user_data").upsert({
          user_id: user.id, projects: row.projects, current_project: row.current_project
        }, { onConflict: "user_id" });
        if (migrated.error) throw migrated.error;
        localStorage.removeItem("grafo-projetos");
        localStorage.removeItem("grafo-projeto-atual");
        localStorage.removeItem("diagrama-estado");
      }
    }
    prepareLocal(row);
  }

  async function loadApp() {
    if (appLoaded) return;
    await new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "./assets/js/app.js";
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Não foi possível carregar o editor.")); };
      document.body.appendChild(script);
    });
    appLoaded = true;
  }

  async function activate(session) {
    if (!session || !session.user) return;
    if (activation) return activation;
    activation = (async function () {
      user = session.user;
      notice("Carregando seus projetos...");
      try {
        await loadProjects();
        await loadApp();
        document.getElementById("accountEmail").textContent = user.email || "Minha conta";
        account.hidden = false;
        document.body.classList.remove("auth-locked");
        notice("");
      } catch (error) {
        user = null;
        notice("Não foi possível carregar os projetos. Verifique a conexão e tente novamente. " + (error.message || ""), true);
      } finally {
        activation = null;
      }
    })();
    return activation;
  }

  async function flush() {
    if (!client || !user) return false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) { await inFlight; if (!pending) return true; }
    if (!pending) return true;
    inFlight = (async function () {
      while (pending) {
        var snapshot = pending;
        pending = null;
        status.textContent = "Salvando...";
        var response = await client.from("grafo_user_data").upsert({
          user_id: user.id, projects: snapshot.projects, current_project: snapshot.current_project
        }, { onConflict: "user_id" });
        if (response.error) {
          pending = pending || snapshot;
          status.textContent = "Erro ao salvar";
          retry.hidden = false;
          throw response.error;
        }
        lastSaved = JSON.stringify(snapshot);
        status.textContent = "Salvo na nuvem";
        retry.hidden = true;
      }
    })();
    try { await inFlight; return true; }
    finally { inFlight = null; }
  }

  window.GrafoAuth = {
    storageKey: storageKey,
    scheduleSave: function (projects, currentProject) {
      if (!user) return;
      var snapshot = { projects: JSON.parse(JSON.stringify(projects)), current_project: currentProject };
      var serialized = JSON.stringify(snapshot);
      if (serialized === lastSaved && !pending) return;
      pending = snapshot;
      status.textContent = "Alterações pendentes";
      retry.hidden = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { flush().catch(function (error) { console.error("Falha ao salvar projeto:", error); }); }, 800);
    },
    flush: flush
  };

  retry.addEventListener("click", function () {
    if (pending) flush().catch(function (error) { console.error("Falha ao salvar projeto:", error); });
  });

  document.getElementById("accountLogout").addEventListener("click", async function () {
    try {
      await flush();
      var leavingUserId = user.id;
      var result = await client.auth.signOut();
      if (result.error) throw result.error;
      ["grafo-projetos", "grafo-projeto-atual", "diagrama-estado", "grafo-backup"].forEach(function (key) {
        localStorage.removeItem(key + ":" + leavingUserId);
      });
      location.reload();
    } catch (error) {
      status.textContent = "Falha ao salvar ou sair. Exporte o projeto e tente novamente.";
    }
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
      if (mode === "signup") {
        result = await client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: location.origin + location.pathname } });
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

  (async function bootstrap() {
    notice("Preparando o login...");
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
          if (appLoaded) location.reload();
        } else if (event === "SIGNED_IN" && mode !== "reset" && session && !appLoaded) {
          // Evita chamadas Supabase dentro do callback de mudança de sessão.
          setTimeout(function () { activate(session); }, 0);
        }
      });
      var initial = await client.auth.getSession();
      if (initial.error) throw initial.error;
      if (erroLink) {
        notice("O link expirou ou já foi usado. Digite seu e-mail para receber um novo.", true);
      } else if (mode === "reset") {
        notice(initial.data.session ? "" : "Link inválido ou expirado. Volte ao login e peça um novo em \"Esqueci minha senha\".", !initial.data.session);
        back.hidden = !!initial.data.session;
      } else if (initial.data.session) {
        await activate(initial.data.session);
      } else {
        notice("");
      }
    } catch (error) {
      notice(error.message || "Não foi possível preparar o login.", true);
      submit.disabled = true;
    }
  })();
})();
