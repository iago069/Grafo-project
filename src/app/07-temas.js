  // ==== 07-temas.js: temas de cores (parte de assets/js/editor/app.js; npm run montar) ====
  var themePresets = { "theme-fernando": { bg: "#B71C1C", bgPanel: "rgba(142, 22, 24, 0.92)", bgPanel2: "#8E1618", line: "rgba(255, 213, 79, 0.28)", lineSoft: "rgba(255, 205, 210, 0.2)", text: "#FFFFFF", textDim: "#F6C7C7", accent: "#FFD21F", accentInk: "#5A0A0B", teal: "#5CD65C", paper: "#FFF8F7", paperLine: "#F3D6D6", ink: "#4A0A0B", danger: "#FF5A5F", fieldBg: "rgba(255,255,255,0.06)", fieldText: "#FFFFFF", fieldBorder: "rgba(255,205,210,0.3)", ghostBg: "rgba(255,255,255,0.05)", ghostText: "#FFE9A8", ghostBorder: "rgba(255,213,79,0.3)", optionBg: "#FFF8F7", optionText: "#4A0A0B", optionActiveBg: "#FFD21F", optionActiveText: "#5A0A0B", shadowSoft: "0 10px 30px rgba(60, 0, 0, 0.35)", shadowCard: "0 12px 28px rgba(60, 0, 0, 0.3)" }, "theme-nord": { bg: "#2E3440", bgPanel: "rgba(32, 38, 48, 0.95)", bgPanel2: "#3B4252", line: "rgba(136, 192, 208, 0.22)", lineSoft: "rgba(129, 161, 193, 0.18)", text: "#ECEFF4", textDim: "#D8DEE9", accent: "#88C0D0", accentInk: "#2E3440", teal: "#8FBCBB", paper: "#F4F6FA", paperLine: "#D8DEE9", ink: "#2E3440", danger: "#FF7D6C", fieldBg: "rgba(236,239,244,0.05)", fieldText: "#ECEFF4", fieldBorder: "rgba(136,192,208,0.22)", ghostBg: "rgba(236,239,244,0.04)", ghostText: "#D8DEE9", ghostBorder: "rgba(136,192,208,0.22)", optionBg: "#F4F6FA", optionText: "#2E3440", optionActiveBg: "#88C0D0", optionActiveText: "#2E3440", shadowSoft: "0 10px 30px rgba(5, 12, 20, 0.25)", shadowCard: "0 12px 28px rgba(6, 15, 22, 0.22)" }, "theme-dark-modern": { bg: "#1F1F1F", bgPanel: "rgba(33, 33, 33, 0.94)", bgPanel2: "#2B2B2B", line: "rgba(124, 124, 124, 0.2)", lineSoft: "rgba(170, 170, 170, 0.14)", text: "#F3F3F3", textDim: "#C9C9C9", accent: "#5AA9FF", accentInk: "#0F172A", teal: "#7CE6D8", paper: "#F8F8F8", paperLine: "#E2E2E2", ink: "#1D1D1D", danger: "#FF7D6C", fieldBg: "rgba(255,255,255,0.03)", fieldText: "#F3F3F3", fieldBorder: "rgba(170,170,170,0.18)", ghostBg: "rgba(255,255,255,0.02)", ghostText: "#C9C9C9", ghostBorder: "rgba(170,170,170,0.18)", optionBg: "#F8F8F8", optionText: "#1D1D1D", optionActiveBg: "#5AA9FF", optionActiveText: "#0F172A", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.24)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.18)" }, "theme-dracula": { bg: "#282A36", bgPanel: "rgba(40, 42, 54, 0.95)", bgPanel2: "#1E2029", line: "rgba(255, 121, 198, 0.18)", lineSoft: "rgba(189, 147, 249, 0.18)", text: "#F8F8F2", textDim: "#BD93F9", accent: "#FF79C6", accentInk: "#282A36", teal: "#8BE9FD", paper: "#F7F7F7", paperLine: "#E5E5E5", ink: "#282A36", danger: "#FF5555", fieldBg: "rgba(248,248,242,0.04)", fieldText: "#F8F8F2", fieldBorder: "rgba(255,121,198,0.2)", ghostBg: "rgba(248,248,242,0.03)", ghostText: "#BD93F9", ghostBorder: "rgba(255,121,198,0.2)", optionBg: "#F7F7F7", optionText: "#282A36", optionActiveBg: "#FF79C6", optionActiveText: "#282A36", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.28)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.2)" }, "theme-dark-plus": { bg: "#0D1117", bgPanel: "rgba(13, 17, 23, 0.94)", bgPanel2: "#161B22", line: "rgba(110, 118, 129, 0.18)", lineSoft: "rgba(110, 118, 129, 0.14)", text: "#C9D1D9", textDim: "#8B949E", accent: "#58A6FF", accentInk: "#0D1117", teal: "#39D353", paper: "#F6F8FA", paperLine: "#D0D7DE", ink: "#0D1117", danger: "#F85149", fieldBg: "rgba(201,209,217,0.04)", fieldText: "#C9D1D9", fieldBorder: "rgba(110,118,129,0.22)", ghostBg: "rgba(201,209,217,0.03)", ghostText: "#8B949E", ghostBorder: "rgba(110,118,129,0.22)", optionBg: "#F6F8FA", optionText: "#0D1117", optionActiveBg: "#58A6FF", optionActiveText: "#0D1117", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.3)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.22)" }, "theme-catppuccin-mocha": { bg: "#1E1E2E", bgPanel: "rgba(30, 30, 46, 0.94)", bgPanel2: "#302D41", line: "rgba(203, 166, 247, 0.18)", lineSoft: "rgba(137, 180, 250, 0.16)", text: "#CDD6F4", textDim: "#BAC2DE", accent: "#F38BA8", accentInk: "#1E1E2E", teal: "#94E2D5", paper: "#F4F3F8", paperLine: "#D9E0EC", ink: "#1E1E2E", danger: "#F38BA8", fieldBg: "rgba(205,214,244,0.05)", fieldText: "#CDD6F4", fieldBorder: "rgba(203,166,247,0.22)", ghostBg: "rgba(205,214,244,0.04)", ghostText: "#BAC2DE", ghostBorder: "rgba(203,166,247,0.22)", optionBg: "#F4F3F8", optionText: "#1E1E2E", optionActiveBg: "#F38BA8", optionActiveText: "#1E1E2E", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.25)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.2)" }, "theme-github-light": { bg: "#F6F8FA", bgPanel: "rgba(255, 255, 255, 0.96)", bgPanel2: "#FFFFFF", line: "rgba(208, 215, 222, 0.65)", lineSoft: "rgba(208, 215, 222, 0.8)", text: "#24292F", textDim: "#57606A", accent: "#0969DA", accentInk: "#FFFFFF", teal: "#1A7F37", paper: "#FFFFFF", paperLine: "#D0D7DE", ink: "#24292F", danger: "#CF222E", fieldBg: "rgba(36,41,47,0.03)", fieldText: "#24292F", fieldBorder: "rgba(208,215,222,0.9)", ghostBg: "rgba(36,41,47,0.02)", ghostText: "#57606A", ghostBorder: "rgba(208,215,222,0.9)", optionBg: "#FFFFFF", optionText: "#24292F", optionActiveBg: "#0969DA", optionActiveText: "#FFFFFF", shadowSoft: "0 18px 36px rgba(16, 33, 46, 0.12)", shadowCard: "0 12px 24px rgba(16, 33, 46, 0.08)" }, "theme-solarized-light": { bg: "#FDF6E3", bgPanel: "rgba(255, 250, 240, 0.96)", bgPanel2: "#F5E6C5", line: "rgba(147, 161, 161, 0.4)", lineSoft: "rgba(147, 161, 161, 0.3)", text: "#002B36", textDim: "#586E75", accent: "#B58900", accentInk: "#002B36", teal: "#2AA198", paper: "#FFFDF7", paperLine: "#EEE8D5", ink: "#073642", danger: "#DC322F", fieldBg: "rgba(0,43,54,0.04)", fieldText: "#002B36", fieldBorder: "rgba(147,161,161,0.5)", ghostBg: "rgba(0,43,54,0.03)", ghostText: "#586E75", ghostBorder: "rgba(147,161,161,0.5)", optionBg: "#FFFDF7", optionText: "#073642", optionActiveBg: "#B58900", optionActiveText: "#FDF6E3", shadowSoft: "0 18px 36px rgba(7, 54, 66, 0.12)", shadowCard: "0 12px 24px rgba(7, 54, 66, 0.08)" }, "theme-light-plus": { bg: "#F3F3F3", bgPanel: "rgba(255, 255, 255, 0.96)", bgPanel2: "#F7F7F7", line: "rgba(201, 201, 201, 0.7)", lineSoft: "rgba(201, 201, 201, 0.55)", text: "#1F1F1F", textDim: "#5B5B5B", accent: "#2F80ED", accentInk: "#FFFFFF", teal: "#00A39D", paper: "#FFFFFF", paperLine: "#E5E5E5", ink: "#1F1F1F", danger: "#D64545", fieldBg: "rgba(31,31,31,0.04)", fieldText: "#1F1F1F", fieldBorder: "rgba(201,201,201,0.9)", ghostBg: "rgba(31,31,31,0.03)", ghostText: "#5B5B5B", ghostBorder: "rgba(201,201,201,0.9)", optionBg: "#FFFFFF", optionText: "#1F1F1F", optionActiveBg: "#2F80ED", optionActiveText: "#FFFFFF", shadowSoft: "0 18px 36px rgba(31, 31, 31, 0.08)", shadowCard: "0 12px 24px rgba(31, 31, 31, 0.06)" }, "theme-alto-contraste": { bg: "#000000", bgPanel: "rgba(0, 0, 0, 0.98)", bgPanel2: "#111111", line: "rgba(255, 255, 255, 0.46)", lineSoft: "rgba(255, 255, 255, 0.28)", text: "#FFFFFF", textDim: "#E6E6E6", accent: "#FFFF00", accentInk: "#000000", teal: "#00FFFF", paper: "#FFFFFF", paperLine: "#DADADA", ink: "#000000", danger: "#FF0000", fieldBg: "rgba(255,255,255,0.06)", fieldText: "#FFFFFF", fieldBorder: "rgba(255,255,255,0.5)", ghostBg: "rgba(255,255,255,0.04)", ghostText: "#E6E6E6", ghostBorder: "rgba(255,255,255,0.5)", optionBg: "#FFFFFF", optionText: "#000000", optionActiveBg: "#FFFF00", optionActiveText: "#000000", shadowSoft: "0 0 0 2px rgba(255,255,255,0.25)", shadowCard: "0 0 0 2px rgba(255,255,255,0.22)" } };

  var temaSelect = document.getElementById("temaSelect");

  function removerTemaCustomizado() {
    [
      "--bg", "--bg-panel", "--bg-panel-2", "--line", "--line-soft", "--text", "--text-dim", "--accent", "--accent-ink",
      "--teal", "--paper", "--paper-line", "--ink", "--danger", "--field-bg", "--field-text", "--field-border",
      "--ghost-bg", "--ghost-text", "--ghost-border", "--option-bg", "--option-text", "--option-active-bg",
      "--option-active-text", "--shadow-soft", "--shadow-card"
    ].forEach(function (prop) {
      document.documentElement.style.removeProperty(prop);
    });
  }

  function aplicarTemaPersonalizado(chave) {
    var preset = themePresets[chave];
    if (!preset) return;
    Object.keys(preset).forEach(function (key) {
      // Números também viram segmento: bgPanel2 -> --bg-panel-2 (o nome usado no CSS).
      var cssKey = key.replace(/[A-Z]|\d+/g, function (trecho) { return "-" + trecho.toLowerCase(); });
      document.documentElement.style.setProperty("--" + cssKey, preset[key]);
    });
    document.documentElement.setAttribute("data-theme", "custom");
  }

  function aplicarTemaSelecionado(valor) {
    if (valor === "auto") {
      document.documentElement.removeAttribute("data-theme");
      removerTemaCustomizado();
      btnTema.textContent = "Tema: Automático";
      salvarTema("");
      return;
    }

    if (valor === "light" || valor === "dark") {
      document.documentElement.setAttribute("data-theme", valor);
      removerTemaCustomizado();
      btnTema.textContent = "Tema: " + (valor === "dark" ? "Escuro" : "Claro");
      salvarTema(valor);
      return;
    }

    aplicarTemaPersonalizado(valor);
    var opcaoTema = temaSelect.querySelector('option[value="' + valor + '"]');
    btnTema.textContent = "Tema: " + (opcaoTema ? opcaoTema.textContent : "Personalizado");
    salvarTema(valor);
  }

  var temaSalvo = carregarTema();
  // Tema exclusivo (opção escondida): só vale depois que o banco confirmar que esta
  // conta tem o tema liberado (admin.js). Até lá fica o automático, sem apagar a escolha.
  var opcaoSalva = temaSalvo && temaSelect.querySelector('option[value="' + temaSalvo + '"]');
  if (opcaoSalva && opcaoSalva.hidden) {
    window.__temaExclusivoPendente = temaSalvo;
    temaSalvo = "";
  }
  if (temaSalvo && themePresets[temaSalvo]) {
    temaSelect.value = temaSalvo;
    aplicarTemaSelecionado(temaSalvo);
  } else if (temaSalvo === "dark" || temaSalvo === "light") {
    temaSelect.value = temaSalvo;
    document.documentElement.setAttribute("data-theme", temaSalvo);
    btnTema.textContent = "Tema: " + (temaSalvo === "dark" ? "Escuro" : "Claro");
  } else {
    temaSelect.value = "auto";
    btnTema.textContent = "Tema: Automático";
  }

  btnTema.addEventListener("click", function () {
    var atual = document.documentElement.getAttribute("data-theme");
    var temaAtual = temaSelect.value;

    if (temaAtual && themePresets[temaAtual]) {
      aplicarTemaSelecionado(temaAtual);
      return;
    }

    if (atual === "dark") {
      document.documentElement.setAttribute("data-theme", "light");
      temaSelect.value = "light";
      btnTema.textContent = "Tema: Claro";
      salvarTema("light");
    } else if (atual === "light") {
      document.documentElement.setAttribute("data-theme", "dark");
      temaSelect.value = "dark";
      btnTema.textContent = "Tema: Escuro";
      salvarTema("dark");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      temaSelect.value = "dark";
      btnTema.textContent = "Tema: Escuro";
      salvarTema("dark");
    }
  });

  temaSelect.addEventListener("change", function (event) {
    aplicarTemaSelecionado(event.target.value);
  });

