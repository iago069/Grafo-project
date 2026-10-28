  // ==== 15-script-mikrotik.js: gerador de script de monitoramento para MikroTik (Winbox) (parte de assets/js/editor/app.js; npm run montar) ====
  // Segue o procedimento de monitoramento: VLAN do local (tabela sigla → VLAN,
  // ex.: PFU → 216) na porta de uplink, IP /30 da RB nessa VLAN com a rota pelo
  // gateway, e a rede dos equipamentos (VOLT, XPS, nobreak, ar): /30 direto na
  // porta; /29 numa bridge (bridge-monitoramento; câmeras em bridge-cameras).
  // Tudo vem preenchido pelo diagrama (RB, cabos e ficha de cada equipamento) e
  // pode ser ajustado à mão. O script é colado no New Terminal do Winbox ou
  // importado como arquivo .rsc.
  var MK_VLANS_PADRAO = "IBR=212\nPFU=216\nSCR=215";
  var MK_CHAVE_VLANS = "grafo-mikrotik-vlans";
  var mk = {
    modal: document.getElementById("mkModal"),
    campo: function (id) { return document.getElementById(id); }
  };

  function mkTabelaVlans() {
    var texto = MK_VLANS_PADRAO;
    try { texto = localStorage.getItem(MK_CHAVE_VLANS) || MK_VLANS_PADRAO; } catch (e) {}
    var tabela = [];
    texto.split(/\r?\n/).forEach(function (linha) {
      var m = /^\s*([A-Za-z]{2,6})\s*[=:;,\s]\s*(\d{1,4})\s*$/.exec(linha);
      if (m && +m[2] >= 1 && +m[2] <= 4094) tabela.push({ sigla: m[1].toUpperCase(), vlan: +m[2] });
    });
    return tabela;
  }

  // Endereço → número e volta (IPv4).
  function mkNumero(ip) { return ip.split(".").reduce(function (a, o) { return a * 256 + Number(o); }, 0); }
  function mkTexto(n) { return [24, 16, 8, 0].map(function (d) { return Math.floor(n / Math.pow(2, d)) % 256; }).join("."); }
  // "10.0.0.2/30" → { host, prefixo } (null se inválido).
  function mkLerEndereco(texto) {
    var m = /^\s*((?:\d{1,3}\.){3}\d{1,3})\s*\/\s*(\d{1,2})\s*$/.exec(String(texto || ""));
    if (!m || +m[2] > 32 || m[1].split(".").some(function (o) { return +o > 255; })) return null;
    return { host: m[1], prefixo: +m[2] };
  }
  // Host, prefixo e gateway de um equipamento pela ficha (IP, máscara e gateway;
  // sem gateway: o primeiro endereço útil, ou o último se o .1 é ele mesmo).
  function mkRedeDoEquipamento(eq, prefixoPadrao) {
    var ip = String(eq.ip || "").trim(), barra = ip.indexOf("/");
    var host = barra >= 0 ? ip.slice(0, barra) : ip;
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null;
    var manual = String(eq.mascara || "").trim();
    var prefixo = manual ? prefixoDaMascara(manual) : barra >= 0 ? Number(ip.slice(barra + 1)) : prefixoPadrao;
    if (prefixo == null || !(prefixo >= 8 && prefixo <= 32)) return null;
    var gateway = String(eq.gateway || "").replace(/\/.*$/, "").trim();
    if (!gateway && prefixo < 31) {
      var n = mkNumero(host), tamanho = Math.pow(2, 32 - prefixo), rede = n - (n % tamanho), gw = rede + 1;
      if (gw === n) gw = rede + tamanho - 2;
      gateway = mkTexto(gw);
    }
    return { host: host, prefixo: prefixo, gateway: gateway };
  }

  function mkEhMikrotik(eq) {
    var modelo = modeloDoEquipamento(eq);
    return /mikrotik/i.test(eq.tipo || "") || (modelo && /mikrotik/i.test(modelo.fabricante || "")) || /^(rb|ccr|crs|hex|hap|l009)/i.test(String(eq.modelo || eq.nome || ""));
  }
  function mkEhMonitorado(eq) { return /volt|rps|xps|retificador|ups|nobreak|hvac|ar-?cond|^ar$|camera|câmera/i.test(eq.tipo || ""); }
  function mkEhCamera(eq) { return /camera|câmera/i.test(eq.tipo || ""); }

  // Sigla do local da RB: um pedaço do nome que está na tabela (POP-PFU01, RB PFU)
  // ou a abreviação do município dela (Passo Fundo → PFU).
  function mkSiglaDaRb(eq, tabela) {
    var partes = String(eq.nome || "").toUpperCase().split(/[^A-Z0-9]+/).map(function (p) { return p.replace(/\d+$/, ""); });
    var direto = tabela.find(function (t) { return partes.indexOf(t.sigla) >= 0; });
    if (direto) return direto;
    if (eq.municipio) return tabela.find(function (t) { return municipioPorAbreviacao(t.sigla, [eq.municipio]); }) || null;
    return null;
  }
  // Porta da RB no cabo c ("" se o cabo não diz).
  function mkPortaDaRb(c, idRb) { return String((c.de === idRb ? c.saida : c.chegada) || "").trim(); }

  // Preenche o formulário a partir da RB escolhida no diagrama.
  function mkPreencherPelaRb(id) {
    var eq = estado.equipamentos.find(function (e) { return e.id === id; });
    var c = mk.campo;
    if (!eq) return;
    var tabela = mkTabelaVlans(), local = mkSiglaDaRb(eq, tabela);
    c("mkLocal").value = local ? local.sigla : "";
    c("mkVlan").value = local ? local.vlan : "";
    var rede = mkRedeDoEquipamento(eq, 30);
    c("mkIp").value = rede ? rede.host + "/" + rede.prefixo : "";
    c("mkGateway").value = rede ? rede.gateway : "";
    // Uplink: o cabo até um equipamento que não é de monitoramento (switch, OLT...).
    var cabos = estado.conexoes.filter(function (cb) { return cb.de === id || cb.para === id; });
    var outro = function (cb) { var oid = cb.de === id ? cb.para : cb.de; return estado.equipamentos.find(function (e) { return e.id === oid; }); };
    var uplink = cabos.find(function (cb) { var o = outro(cb); return o && !mkEhMonitorado(o) && mkPortaDaRb(cb, id); });
    c("mkUplink").value = uplink ? mkPortaDaRb(uplink, id) : "ether1";
    // Redes dos equipamentos: pela ficha de cada monitorado ligado na RB (o gateway
    // dele é o endereço da RB naquela rede); mesma rede = uma linha com as portas.
    var redes = [];
    cabos.forEach(function (cb) {
      var o = outro(cb);
      if (!o || !mkEhMonitorado(o)) return;
      var r = mkRedeDoEquipamento(o, 29);
      if (!r || !r.gateway) return;
      var endereco = r.gateway + "/" + r.prefixo, uso = mkEhCamera(o) ? "cameras" : "equipamentos";
      var linha = redes.find(function (x) { return x.endereco === endereco && x.uso === uso; });
      if (!linha) { linha = { endereco: endereco, uso: uso, portas: [] }; redes.push(linha); }
      var porta = mkPortaDaRb(cb, id);
      if (porta && linha.portas.indexOf(porta) < 0) linha.portas.push(porta);
    });
    mkDesenharRedes(redes.length ? redes : [{ endereco: "", uso: "equipamentos", portas: [] }]);
  }

  function mkDesenharRedes(redes) {
    var lista = mk.campo("mkRedes");
    lista.innerHTML = "";
    redes.forEach(mkAdicionarLinha);
  }
  function mkAdicionarLinha(r) {
    r = r || { endereco: "", uso: "equipamentos", portas: [] };
    var linha = document.createElement("div");
    linha.className = "mk-rede";
    linha.innerHTML =
      '<label>Uso<select data-mk="uso"><option value="equipamentos" title="VOLT, XPS, nobreak, ar-condicionado">Equipamentos</option><option value="cameras">Câmeras</option></select></label>' +
      '<label>Endereço da RB na rede<input data-mk="endereco" placeholder="10.20.0.1/29" spellcheck="false" autocomplete="off"></label>' +
      '<label>Porta(s) da RB<input data-mk="portas" placeholder="ether2 ou ether3, ether4" spellcheck="false" autocomplete="off"></label>' +
      '<button type="button" class="ghost small" data-mk-remover aria-label="Remover esta rede" title="Remover esta rede">×</button>';
    linha.querySelector('[data-mk="uso"]').value = r.uso;
    linha.querySelector('[data-mk="endereco"]').value = r.endereco;
    linha.querySelector('[data-mk="portas"]').value = r.portas.join(", ");
    linha.querySelector("[data-mk-remover]").addEventListener("click", function () { linha.remove(); mkAtualizar(); });
    mk.campo("mkRedes").appendChild(linha);
  }

  // Nome da VLAN pelo procedimento: vlan216-eth01 (ether1), vlan216-sfp (fibra).
  function mkNomeDaVlan(vlan, uplink) {
    var m = /^ether(\d+)$/i.exec(uplink);
    var sufixo = m ? "eth" + ("0" + m[1]).slice(-2) : /^sfp/i.test(uplink) ? "sfp" : uplink.replace(/[^A-Za-z0-9-]/g, "");
    return "vlan" + vlan + "-" + sufixo;
  }
  var MK_PORTA_VALIDA = /^[A-Za-z][A-Za-z0-9\-_.\/]{0,30}$/;
  // Texto seguro dentro de comment="..." do RouterOS.
  function mkComentario(t) { return String(t || "").replace(/["\\$\r\n]/g, "").slice(0, 60); }

  // Lê o formulário, confere e monta o script (ou a lista do que falta).
  function mkGerar() {
    var c = mk.campo, erros = [], avisos = [];
    var idRb = c("mkRb").value, rb = estado.equipamentos.find(function (e) { return e.id === idRb; });
    var sigla = String(c("mkLocal").value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    var vlan = Number(c("mkVlan").value);
    var uplink = String(c("mkUplink").value || "").trim();
    var ip = mkLerEndereco(c("mkIp").value), gateway = String(c("mkGateway").value || "").trim();
    if (!(vlan >= 1 && vlan <= 4094)) erros.push("Informe a VLAN do local (1 a 4094) — no NetBox, Região da cidade, campo L3.");
    if (!MK_PORTA_VALIDA.test(uplink)) erros.push("Informe a porta de uplink (ex.: ether1 ou sfp1).");
    if (!ip) erros.push("Informe o IP da RB com a máscara (ex.: 10.0.0.2/30) — no NetBox, \"Monitoramento\" + cidade.");
    else if (ip.prefixo !== 30) avisos.push("O IP da RB costuma ser /30 (está /" + ip.prefixo + ").");
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(gateway)) erros.push("Informe o gateway da RB.");
    else if (ip) {
      var tam = Math.pow(2, 32 - ip.prefixo), redeRb = mkNumero(ip.host) - (mkNumero(ip.host) % tam);
      if (mkNumero(gateway) - (mkNumero(gateway) % tam) !== redeRb) avisos.push("O gateway " + gateway + " não está na mesma rede do IP da RB.");
      if (gateway === ip.host) erros.push("O gateway não pode ser o próprio IP da RB.");
    }
    var portasUsadas = {}, redes = [];
    mk.campo("mkRedes").querySelectorAll(".mk-rede").forEach(function (linha, i) {
      var uso = linha.querySelector('[data-mk="uso"]').value;
      var textoEnd = linha.querySelector('[data-mk="endereco"]').value.trim();
      var portas = linha.querySelector('[data-mk="portas"]').value.split(/[\s,;]+/).filter(Boolean);
      if (!textoEnd && !portas.length) return; // linha vazia: ignora
      var end = mkLerEndereco(textoEnd), n = "Rede " + (i + 1);
      if (!end) { erros.push(n + ": endereço inválido (ex.: 10.20.0.1/29)."); return; }
      if (end.prefixo < 24 || end.prefixo > 30) avisos.push(n + ": /" + end.prefixo + " — o procedimento usa /30 ou /29.");
      if (!portas.length) { erros.push(n + ": informe a porta da RB onde os equipamentos estão ligados."); return; }
      portas.forEach(function (p) {
        if (!MK_PORTA_VALIDA.test(p)) erros.push(n + ": porta \"" + p + "\" inválida.");
        else if (p.toLowerCase() === uplink.toLowerCase()) erros.push(n + ": a porta " + p + " é a de uplink.");
        else if (portasUsadas[p.toLowerCase()]) erros.push(n + ": a porta " + p + " já está em outra rede.");
        portasUsadas[p.toLowerCase()] = true;
      });
      if (end.prefixo >= 30 && portas.length > 1) erros.push(n + ": /30 vai direto numa porta só; para várias portas, use /29 (bridge).");
      redes.push({ uso: uso, endereco: end.host + "/" + end.prefixo, prefixo: end.prefixo, portas: portas });
    });
    if (erros.length) return { erros: erros, avisos: avisos, script: "" };

    var nomeVlan = mkNomeDaVlan(vlan, uplink), rotulo = sigla || ("VLAN " + vlan);
    var agora = new Date(), data = agora.toLocaleDateString("pt-BR") + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    var s = [
      "# Script de monitoramento gerado pelo Grafo em " + data,
      "# RB: " + mkComentario(rb ? rb.nome || rb.id : "(não informada)") + " | Local: " + rotulo + " | VLAN " + vlan,
      "# Winbox: New Terminal > cole tudo. Ou Files > arraste o .rsc e rode /import file-name=<arquivo>.rsc",
      "",
      "# 1. VLAN do local na porta de uplink",
      "/interface vlan",
      'add name=' + nomeVlan + ' interface=' + uplink + ' vlan-id=' + vlan + ' comment="Monitoramento ' + mkComentario(rotulo) + '"',
      "",
      "# 2. IP da RB e rota pelo gateway",
      "/ip address",
      'add address=' + ip.host + '/' + ip.prefixo + ' interface=' + nomeVlan + ' comment="RB monitoramento"',
      "/ip route",
      'add dst-address=0.0.0.0/0 gateway=' + gateway + ' comment="Gateway monitoramento"'
    ];
    // 3. Redes dos equipamentos: /30 direto na porta; /29 numa bridge por uso.
    var bridges = {};
    redes.forEach(function (r) {
      var nomeUso = r.uso === "cameras" ? "Câmeras" : "Equipamentos (VOLT/XPS/nobreak/ar)";
      s.push("", "# 3. Rede " + nomeUso + " (/" + r.prefixo + ")");
      if (r.prefixo >= 30) {
        s.push("/ip address", 'add address=' + r.endereco + ' interface=' + r.portas[0] + ' comment="' + (r.uso === "cameras" ? "Cameras" : "Equipamentos monitoramento") + '"');
        return;
      }
      var base = r.uso === "cameras" ? "bridge-cameras" : "bridge-monitoramento";
      bridges[base] = (bridges[base] || 0) + 1;
      var bridge = bridges[base] > 1 ? base + "-" + bridges[base] : base;
      s.push("/interface bridge", 'add name=' + bridge + ' comment="' + (r.uso === "cameras" ? "Cameras" : "Monitoramento") + '"');
      s.push("/interface bridge port");
      r.portas.forEach(function (p) { s.push("add bridge=" + bridge + " interface=" + p); });
      s.push("/ip address", 'add address=' + r.endereco + ' interface=' + bridge + ' comment="' + (r.uso === "cameras" ? "Cameras" : "Equipamentos monitoramento") + '"');
    });
    if (!redes.length) avisos.push("Nenhuma rede de equipamentos: o script só cria a VLAN, o IP e a rota da RB.");
    return { erros: [], avisos: avisos, script: s.join("\n") + "\n", nomeVlan: nomeVlan, rb: rb, sigla: sigla, vlan: vlan };
  }

  var mkUltimo = null;
  function mkAtualizar() {
    var c = mk.campo, r = mkGerar();
    mkUltimo = r;
    var tabela = mkTabelaVlans(), sigla = String(c("mkLocal").value || "").trim().toUpperCase();
    var daTabela = tabela.find(function (t) { return t.sigla === sigla; });
    c("mkVlanNome").textContent = r.nomeVlan ? "Nome da VLAN: " + r.nomeVlan : (daTabela ? "" : "");
    c("mkScript").value = r.script || "# Falta preencher:\n" + r.erros.map(function (e) { return "# - " + e; }).join("\n");
    var avisos = c("mkAvisos");
    avisos.innerHTML = r.avisos.map(function (a) { return "<li>" + escaparHtml(a) + "</li>"; }).join("");
    avisos.hidden = !r.avisos.length;
    c("mkCopiar").disabled = c("mkBaixar").disabled = !r.script;
  }

  function mkAbrir(idRb) {
    var c = mk.campo;
    var lista = estado.equipamentos.filter(mkEhMikrotik);
    var opcoes = (lista.length ? lista : estado.equipamentos).map(function (e) {
      return '<option value="' + escaparHtml(e.id) + '">' + escaparHtml(e.nome || e.id) + (e.ip ? " — " + escaparHtml(e.ip) : "") + "</option>";
    }).join("");
    c("mkRb").innerHTML = '<option value="">— Preencher à mão —</option>' + opcoes;
    c("mkLocais").innerHTML = mkTabelaVlans().map(function (t) { return '<option value="' + t.sigla + '">VLAN ' + t.vlan + "</option>"; }).join("");
    try { c("mkTabela").value = localStorage.getItem(MK_CHAVE_VLANS) || MK_VLANS_PADRAO; } catch (e) { c("mkTabela").value = MK_VLANS_PADRAO; }
    var escolhida = idRb && estado.equipamentos.some(function (e) { return e.id === idRb; }) ? idRb : (lista.length === 1 ? lista[0].id : "");
    c("mkRb").value = escolhida;
    if (escolhida) mkPreencherPelaRb(escolhida);
    else {
      ["mkLocal", "mkVlan", "mkIp", "mkGateway"].forEach(function (k) { c(k).value = ""; });
      c("mkUplink").value = "ether1";
      mkDesenharRedes([{ endereco: "", uso: "equipamentos", portas: [] }]);
    }
    mkAtualizar();
    mostrarModalBackdrop(mk.modal);
    c("mkRb").focus();
  }
  function mkFechar() {
    esconderModal(mk.modal);
    if (mk.modal.contains(document.activeElement)) document.activeElement.blur();
  }

  if (mk.modal) {
    var mc = mk.campo;
    document.getElementById("btnScriptMikrotik").addEventListener("click", function () { mkAbrir(""); });
    var botaoEditor = document.getElementById("editEquipScript");
    if (botaoEditor) botaoEditor.addEventListener("click", function () { if (editor.equipamento) mkAbrir(editor.equipamento.id); });
    mk.modal.querySelectorAll("[data-mk-fechar]").forEach(function (b) { b.addEventListener("click", mkFechar); });
    mk.modal.addEventListener("click", function (e) { if (e.target === mk.modal) mkFechar(); });
    mk.modal.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); mkFechar(); } });
    mc("mkRb").addEventListener("change", function () { if (mc("mkRb").value) mkPreencherPelaRb(mc("mkRb").value); mkAtualizar(); });
    // Sigla escolhida: a VLAN vem da tabela.
    mc("mkLocal").addEventListener("input", function () {
      var t = mkTabelaVlans().find(function (x) { return x.sigla === mc("mkLocal").value.trim().toUpperCase(); });
      if (t) mc("mkVlan").value = t.vlan;
      mkAtualizar();
    });
    // IP da RB /30: o gateway é o outro endereço útil (se ainda vazio).
    mc("mkIp").addEventListener("change", function () {
      var ip = mkLerEndereco(mc("mkIp").value);
      if (ip && ip.prefixo === 30 && !mc("mkGateway").value.trim()) {
        var n = mkNumero(ip.host), rede = n - (n % 4);
        mc("mkGateway").value = mkTexto(n === rede + 1 ? rede + 2 : rede + 1);
      }
      mkAtualizar();
    });
    mk.modal.querySelector(".mk-form").addEventListener("submit", function (e) { e.preventDefault(); });
    mk.modal.querySelector(".mk-form").addEventListener("input", mkAtualizar);
    mk.modal.querySelector(".mk-form").addEventListener("change", mkAtualizar);
    mc("mkMaisRede").addEventListener("click", function () { mkAdicionarLinha(); mkAtualizar(); });
    mc("mkSalvarTabela").addEventListener("click", function () {
      try { localStorage.setItem(MK_CHAVE_VLANS, mc("mkTabela").value); } catch (e) {}
      mc("mkLocais").innerHTML = mkTabelaVlans().map(function (t) { return '<option value="' + t.sigla + '">VLAN ' + t.vlan + "</option>"; }).join("");
      avisar("Tabela de VLANs salva neste navegador (" + mkTabelaVlans().length + " locais).");
      if (mc("mkRb").value) mkPreencherPelaRb(mc("mkRb").value);
      mkAtualizar();
    });
    mc("mkCopiar").addEventListener("click", function () {
      var campo = mc("mkScript");
      function copiado() { avisar("Script copiado. No Winbox: New Terminal e cole (Ctrl+V)."); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(campo.value).then(copiado, function () { campo.select(); document.execCommand("copy"); copiado(); });
      else { campo.select(); document.execCommand("copy"); copiado(); }
    });
    mc("mkBaixar").addEventListener("click", function () {
      if (!mkUltimo || !mkUltimo.script) return;
      var base = (mkUltimo.rb ? mkUltimo.rb.nome || mkUltimo.rb.id : "rb") + "-monitoramento";
      var nome = base.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + ".rsc";
      baixarBlob(new Blob([mkUltimo.script.replace(/\n/g, "\r\n")], { type: "text/plain" }), nome);
      avisar("Arquivo " + nome + " baixado. No Winbox: Files, arraste o arquivo e rode /import file-name=" + nome);
    });
  }
  window.GrafoMikrotik = { gerar: mkGerar, nomeDaVlan: mkNomeDaVlan };

