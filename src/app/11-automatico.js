  // ---- Cadastro automático: equipamentos e cabos -----------------------------------
  // O que dá para deduzir, o Grafo preenche sozinho (sempre editável):
  // - Equipamento: tipo pelo nome (OLT-34 → OLT, DISTR-51 → Switch) e o próximo
  //   IP livre da rede que o diagrama já usa.
  // - Cabo: a próxima porta livre de cada ponta (pelo modelo do catálogo ou pela
  //   sequência das portas já usadas), capacidade pela porta (XE → 10G) e o nome
  //   curto da porta (ten-gigabit-ethernet-1/1/1 → XE1/1/1).
  // - Colar uma lista de portas em qualquer lugar do diagrama abre o "Gerar a partir de texto".

  var TIPO_PELO_NOME = [
    [/\bolt\b|^olt|[-_]olt/i, "OLT"],
    [/\bonu\b|^onu|[-_]onu|\bont\b/i, "ONU"],
    [/\bcto\b|^cto|[-_]cto/i, "CTO"],
    [/splitter|\bspl\b/i, "Splitter"],
    [/\bdwdm\b|padtec/i, "DWDM"],
    [/router|roteador|\bcore\b|^core|[-_]core|\bmx\d|\brb\d|\bbng\b|\bccr\d/i, "Roteador"],
    [/distr|switch|\bsw\b|^sw[-_\d]|[-_]sw[-_\d]|\bqfx|\bcrs\d|dm4\d{3}/i, "Switch"],
    [/servidor|server|\bsrv\b|cache|netflix|cgnat|\ba10\b/i, "Servidor"],
    [/radio|rádio|ptp|\bap\b|antena/i, "Rádio"],
    [/nobreak|ups\b/i, "Nobreak"],
    [/firewall|\bfw\b|fortigate|pfsense/i, "Firewall"]
  ];
  function tipoPeloNome(nome) {
    var n = String(nome || "");
    for (var i = 0; i < TIPO_PELO_NOME.length; i++) if (TIPO_PELO_NOME[i][0].test(n)) return TIPO_PELO_NOME[i][1];
    return "";
  }

  // Próximo IP livre na rede mais usada do diagrama (mesmos 3 primeiros octetos).
  function proximoIpLivre() {
    var porRede = {}, usados = {};
    estado.equipamentos.forEach(function (eq) {
      var m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})(\/\d+)?$/.exec(String(eq.ip || "").trim());
      if (!m) return;
      var r = porRede[m[1]] = porRede[m[1]] || { n: 0, max: 0, prefixo: m[3] || "" };
      r.n++; r.max = Math.max(r.max, Number(m[2]));
      usados[m[1] + "." + Number(m[2])] = true;
    });
    var redes = Object.keys(porRede).sort(function (a, b) { return porRede[b].n - porRede[a].n; });
    if (!redes.length) return "";
    var rede = redes[0];
    for (var h = porRede[rede].max + 1; h < 255; h++) if (!usados[rede + "." + h]) return rede + "." + h + porRede[rede].prefixo;
    for (var k = 2; k < 255; k++) if (!usados[rede + "." + k]) return rede + "." + k + porRede[rede].prefixo;
    return "";
  }

  // Nome curto da porta (o mesmo do leitor de texto).
  function portaCurtaNoEditor(porta) {
    var t = String(porta || "").trim();
    var m = /^(?:ten-gigabit-ethernet|10giga-ethernet|tengigabitethernet)[-\s]?(\d+(?:\/\d+)*)$/i.exec(t);
    if (m) return "XE" + m[1];
    m = /^(?:gigabit-ethernet|gigabitethernet)[-\s]?(\d+(?:\/\d+)*)$/i.exec(t);
    if (m) return "GE" + m[1];
    m = /^(?:hundred-gigabit-ethernet|hundredgige)[-\s]?(\d+(?:\/\d+)*)$/i.exec(t);
    if (m) return "HU" + m[1];
    m = /^(?:forty-gigabit-ethernet|fortygige)[-\s]?(\d+(?:\/\d+)*)$/i.exec(t);
    if (m) return "XL" + m[1];
    return t;
  }
  function capacidadePelaPorta(porta) {
    var p = String(porta || "").trim().toLowerCase();
    if (/^(et-|hu|hundred|100g)/.test(p)) return "100G";
    if (/^(xl|forty|40g)/.test(p)) return "40G";
    if (/^(25g|twenty-five)/.test(p)) return "25G";
    if (/^(xe|te|ten|10g|sfp\+|sfpplus)/.test(p)) return "10G";
    if (/^(ge|gi|gigabit|ether|eth|1g)/.test(p)) return "1G";
    return "";
  }

  // Próxima porta livre do equipamento: pelo modelo do catálogo; sem modelo, a
  // seguinte da última porta usada com o mesmo prefixo (XE1/1/3 → XE1/1/4).
  function proximaPortaLivre(idEquipamento) {
    var eq = estado.equipamentos.find(function (e) { return e.id === idEquipamento; });
    if (!eq) return "";
    var usadas = portasEmUso(eq.id, null);
    var modelo = modeloDoEquipamento(eq);
    if (modelo && modelo.portas.length) {
      var livre = modelo.portas.find(function (p) { return !usadas[p.toLowerCase()]; });
      return livre || "";
    }
    var nomes = Object.keys(usadas);
    estado.conexoes.forEach(function (c) {
      if (c.de === eq.id && c.saida) nomes.push(c.saida);
      if (c.para === eq.id && c.chegada) nomes.push(c.chegada);
    });
    var melhor = null;
    nomes.forEach(function (n) {
      var m = /^(.*?)(\d+)$/.exec(String(n).trim());
      if (!m) return;
      if (!melhor || (m[1].toLowerCase() === melhor.prefixo.toLowerCase() && Number(m[2]) > melhor.num) || (!melhor.prefixo && m[1])) melhor = { prefixo: m[1], num: Number(m[2]), original: n };
    });
    if (!melhor) return "";
    for (var i = melhor.num + 1; i < melhor.num + 200; i++) {
      var candidata = melhor.prefixo + i;
      if (!usadas[candidata.toLowerCase()]) return candidata;
    }
    return "";
  }

  // Modelo do catálogo citado no nome ("POP-X_DM4270-48XS" → DM4270-48XS+6CX).
  // Procura o nome inteiro do modelo; senão, a família (parte antes do primeiro "-",
  // com 5+ caracteres e um número). Na dúvida entre vários, fica o primeiro do catálogo.
  function modeloPeloNome(nome) {
    var n = String(nome || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    if (n.length < 4 || !catalogoModelos.length) return null;
    var limpo = function (t) { return String(t || "").toUpperCase().replace(/[^A-Z0-9]+/g, ""); };
    var inteiro = catalogoModelos.filter(function (m) { var k = limpo(m.nome); return k.length >= 5 && n.indexOf(k) >= 0; })
      .sort(function (a, b) { return limpo(b.nome).length - limpo(a.nome).length; })[0];
    if (inteiro) return inteiro;
    return catalogoModelos.find(function (m) {
      var familia = limpo(String(m.nome).split(/[-\s]/)[0]);
      return familia.length >= 5 && /\d/.test(familia) && n.indexOf(familia) >= 0;
    }) || null;
  }

  // "Ligar a" do formulário de equipamento: cria o cabo junto, com as portas
  // livres sugeridas, a capacidade pela porta e uma cor nova.
  function ligarEquipamentoNovo(eq) {
    var campo = document.getElementById("navEquipLigarA");
    var alvo = campo && campo.value;
    if (!alvo || alvo === eq.id || !estado.equipamentos.some(function (e) { return e.id === alvo; })) return;
    if (estado.conexoes.length >= LIMITES.conexoes) return;
    var saida = proximaPortaLivre(alvo), chegada = proximaPortaLivre(eq.id);
    var v = Esquema.validarConexao({
      de: alvo, para: eq.id, tipo: "Fibra", saida: saida, chegada: chegada,
      potencia: capacidadePelaPorta(saida) || capacidadePelaPorta(chegada) || "1G", cor: "#5A7284", grossura: 2, estilo: "solid"
    }, estado.equipamentos.map(function (e) { return e.id; }));
    if (!v.ok) return;
    v.dados.cor = corParaNovoCabo(v.dados);
    estado.conexoes.push(v.dados);
    var nomeAlvo = (estado.equipamentos.find(function (e) { return e.id === alvo; }) || {}).nome || alvo;
    avisar("Cabo criado: " + nomeAlvo + (saida ? " " + saida : "") + " → " + (eq.nome || eq.id) + (chegada ? " " + chegada : "") + ".");
  }

  // ---- Formulário de equipamento ----
  (function () {
    var nome = document.getElementById("navEquipNome"), tipo = document.getElementById("navEquipTipo"), ip = document.getElementById("navEquipIp");
    var modelo = document.getElementById("navEquipModelo"), ligarA = document.getElementById("navEquipLigarA");
    var painel = document.getElementById("navAddEquip");
    if (!nome || !tipo || !ip || !painel) return;
    var tipoAutomatico = true, ipAutomatico = true, modeloAutomatico = true;
    tipo.addEventListener("input", function () { tipoAutomatico = !tipo.value.trim(); });
    ip.addEventListener("input", function () { ipAutomatico = !ip.value.trim(); });
    if (modelo) modelo.addEventListener("input", function () { modeloAutomatico = !modelo.value.trim(); });
    nome.addEventListener("input", function () {
      var m = modeloAutomatico && modelo ? modeloPeloNome(nome.value) : null;
      if (modelo && modeloAutomatico) { modelo.value = m ? m.nome : ""; modelo.classList.toggle("campo-automatico", !!m); }
      if (!tipoAutomatico) return;
      var t = (m && m.tipo) || tipoPeloNome(nome.value);
      tipo.value = t;
      tipo.classList.toggle("campo-automatico", !!t);
    });
    // Lista do "Ligar a": os equipamentos do diagrama, o último cadastrado primeiro.
    function preencherLigarA() {
      if (!ligarA) return;
      var atual = ligarA.value;
      ligarA.innerHTML = '<option value="">— não ligar agora —</option>' + estado.equipamentos.slice().reverse().map(function (e) {
        return '<option value="' + escaparHtml(e.id) + '">' + escaparHtml(e.nome || e.id) + (e.tipo ? " · " + escaparHtml(e.tipo) : "") + "</option>";
      }).join("");
      if (atual && estado.equipamentos.some(function (e) { return e.id === atual; })) ligarA.value = atual;
    }
    function preencherIp() {
      if (!ipAutomatico || ip.value.trim()) return;
      var sugestao = proximoIpLivre();
      if (sugestao) { ip.value = sugestao; ip.classList.add("campo-automatico"); ip.title = "Próximo IP livre da rede do diagrama (pode trocar)"; }
    }
    new MutationObserver(function () {
      if (painel.classList.contains("open")) { tipoAutomatico = !tipo.value.trim(); modeloAutomatico = !modelo || !modelo.value.trim(); ipAutomatico = true; preencherIp(); preencherLigarA(); }
    }).observe(painel, { attributes: true, attributeFilter: ["class"] });
    // Depois de salvar (o formulário é limpo), o próximo já vem com o IP seguinte.
    document.getElementById("navEquipForm").addEventListener("reset", function () {
      setTimeout(function () {
        tipoAutomatico = true; ipAutomatico = true; modeloAutomatico = true;
        [tipo, ip, modelo].forEach(function (c) { if (c) c.classList.remove("campo-automatico"); });
      }, 0);
    });
  })();

  // ---- Formulários de cabo (barra lateral e janela) ----
  [["navCableDe", "navCablePara", "navCableSaida", "navCableChegada", "navCablePotencia", "navCableTipo"],
   ["novoCabDe", "novoCabPara", "novoCabSaida", "novoCabChegada", "novoCabPotencia", "novoCabTipo"]].forEach(function (ids) {
    var de = document.getElementById(ids[0]), para = document.getElementById(ids[1]);
    var saida = document.getElementById(ids[2]), chegada = document.getElementById(ids[3]);
    var capacidade = document.getElementById(ids[4]), tipoCabo = document.getElementById(ids[5]);
    if (!de || !para || !saida || !chegada) return;
    var mexeu = { saida: false, chegada: false, capacidade: false };
    saida.addEventListener("input", function () { mexeu.saida = !!saida.value.trim(); });
    chegada.addEventListener("input", function () { mexeu.chegada = !!chegada.value.trim(); });
    if (capacidade) capacidade.addEventListener("input", function () { mexeu.capacidade = true; });
    function marcar(campo, auto) { campo.classList.toggle("campo-automatico", !!auto); }
    function sugerirPortas() {
      if (!mexeu.saida) { saida.value = proximaPortaLivre(de.value); marcar(saida, saida.value); }
      if (!mexeu.chegada) { chegada.value = proximaPortaLivre(para.value); marcar(chegada, chegada.value); }
      sugerirCapacidade();
    }
    function sugerirCapacidade() {
      if (!capacidade || mexeu.capacidade) return;
      var c = capacidadePelaPorta(saida.value) || capacidadePelaPorta(chegada.value);
      if (c) { capacidade.value = c; marcar(capacidade, true); }
    }
    function encurtar(campo) {
      var curto = portaCurtaNoEditor(campo.value);
      if (curto !== campo.value) campo.value = curto;
      sugerirCapacidade();
    }
    de.addEventListener("change", sugerirPortas);
    para.addEventListener("change", sugerirPortas);
    saida.addEventListener("change", function () { encurtar(saida); });
    chegada.addEventListener("change", function () { encurtar(chegada); });
    // Abrir o formulário já sugere as portas das pontas escolhidas.
    var painel = saida.closest(".nav-panel, .modal-backdrop");
    if (painel) new MutationObserver(function () {
      var aberto = painel.classList.contains("open") || (painel.classList.contains("modal-backdrop") && !painel.classList.contains("hidden"));
      if (aberto) { mexeu = { saida: !!saida.value.trim() && !saida.classList.contains("campo-automatico"), chegada: !!chegada.value.trim() && !chegada.classList.contains("campo-automatico"), capacidade: false }; sugerirPortas(); }
    }).observe(painel, { attributes: true, attributeFilter: ["class"] });
    // Tipo de enlace vazio: "Fibra" (o mais comum), sem travar o salvar.
    if (tipoCabo) {
      tipoCabo.removeAttribute("required");
      tipoCabo.form && tipoCabo.form.addEventListener("submit", function () { if (!tipoCabo.value.trim()) tipoCabo.value = "Fibra"; }, true);
      tipoCabo.form && tipoCabo.form.addEventListener("reset", function () { setTimeout(function () { mexeu = { saida: false, chegada: false, capacidade: false }; }, 0); });
    }
  });

  // Portas digitadas na lista de cabos e no editor também ficam no nome curto.
  document.addEventListener("change", function (event) {
    var alvo = event.target;
    if (!alvo || alvo.tagName !== "INPUT") return;
    var ehPorta = alvo.id === "editCaboSaida" || alvo.id === "editCaboChegada" || ((alvo.getAttribute("data-field") === "saida" || alvo.getAttribute("data-field") === "chegada") && alvo.closest("#listaConex"));
    if (!ehPorta) return;
    var curto = portaCurtaNoEditor(alvo.value);
    if (curto !== alvo.value) { alvo.value = curto; alvo.dispatchEvent(new Event("input", { bubbles: true })); }
  }, true);

  // ---- Colar uma lista de portas no diagrama: abre o leitor já com o texto ----
  document.addEventListener("paste", function (event) {
    var alvo = event.target;
    if (alvo && (alvo.closest && alvo.closest("input, textarea, [contenteditable], .modal-backdrop, .leitor-fundo"))) return;
    if (!document.body || document.body.getAttribute("data-vista") === "inicio") return;
    var texto = event.clipboardData && event.clipboardData.getData("text/plain");
    if (!texto || texto.length < 20 || !window.GrafoLeitor || !window.GrafoLeitor.abrirComTexto) return;
    var linhasComPorta = texto.split(/\r?\n/).filter(function (l) { return /(?:ethernet|^\s*(?:xe|ge|et|te|gi|eth)[-\s]?\d+\/|\b(?:xe|ge|et)-\d+\/\d+\/\d+)/i.test(l); }).length;
    if (linhasComPorta < 2) return;
    event.preventDefault();
    window.GrafoLeitor.abrirComTexto(texto);
  });

  window.GrafoAutomatico = { modeloPeloNome: function (n) { var m = modeloPeloNome(n); return m ? m.nome : ""; }, tipoPeloNome: tipoPeloNome, proximoIpLivre: proximoIpLivre, proximaPortaLivre: proximaPortaLivre, portaCurta: portaCurtaNoEditor, capacidadePelaPorta: capacidadePelaPorta };

