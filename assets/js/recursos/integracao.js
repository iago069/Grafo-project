/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Painel "NetBox e status online": conversa com o agente (agente/grafo-agente.js),
// que roda dentro da rede. Escolhe um POP (site do NetBox) e gera o diagrama a
// partir do cabeamento documentado; e dá ping nos IPs do projeto aberto.
(function () {
  "use strict";

  var app = window.GrafoApp;
  if (!app || !app.importarProjetoExterno) return;

  var elUrl = document.getElementById("agenteUrl");
  var elChave = document.getElementById("agenteChave");
  var elPop = document.getElementById("netboxPop");
  var btnListar = document.getElementById("btnListarPops");
  var btnGerar = document.getElementById("btnGerarPop");
  var btnVerificar = document.getElementById("btnVerificarOnline");
  var elAuto = document.getElementById("verificarAuto");
  var elStatus = document.getElementById("integracaoStatus");
  if (!elUrl || !elPop) return;

  var PADRAO = "http://localhost:8787";
  try { elUrl.value = localStorage.getItem("grafo-agente-url") || PADRAO; } catch (e) { elUrl.value = PADRAO; }
  elUrl.addEventListener("change", function () { try { localStorage.setItem("grafo-agente-url", elUrl.value.trim()); } catch (e) {} });

  function status(texto) { elStatus.textContent = texto; }

  async function agente(caminho, opcoes) {
    var base = (elUrl.value.trim() || PADRAO).replace(/\/+$/, "");
    var cabecalhos = { "Content-Type": "application/json" };
    if (elChave.value) cabecalhos["X-Agente-Chave"] = elChave.value;
    var resp;
    try {
      resp = await fetch(base + caminho, Object.assign({ headers: cabecalhos }, opcoes || {}));
    } catch (e) {
      throw new Error("Agente não respondeu em " + base + ". Ele está rodando (node agente/grafo-agente.js)?");
    }
    var json = await resp.json().catch(function () { return {}; });
    if (!resp.ok) throw new Error(json.erro || ("Agente respondeu " + resp.status));
    return json;
  }

  btnListar.addEventListener("click", async function () {
    status("Buscando POPs…");
    try {
      var sites = await agente("/netbox/sites");
      elPop.innerHTML = "";
      sites.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); }).forEach(function (s) {
        var op = document.createElement("option");
        op.value = s.slug;
        op.textContent = s.nome;
        elPop.appendChild(op);
      });
      elPop.disabled = btnGerar.disabled = !sites.length;
      status(sites.length + " POPs encontrados.");
    } catch (e) { status(e.message); }
  });

  btnGerar.addEventListener("click", async function () {
    if (!elPop.value) return;
    var nomePop = elPop.options[elPop.selectedIndex].textContent;
    status("Lendo cabeamento de " + nomePop + "…");
    try {
      var dados = await agente("/netbox/projeto?site=" + encodeURIComponent(elPop.value) + "&nome=" + encodeURIComponent(nomePop));
      var avisos = dados.avisos || [];
      delete dados.avisos;
      if (!dados.equipamentos.length) { status("O POP " + nomePop + " não tem equipamentos no NetBox."); return; }
      var nome = app.importarProjetoExterno(dados, "o POP " + nomePop);
      if (!nome) { status("Importação recusada; veja o aviso."); return; }
      status(dados.equipamentos.length + " equipamentos e " + dados.conexoes.length + " cabos. " + avisos.join(" "));
      app.avisar("Diagrama do POP \"" + nome + "\" gerado.");
    } catch (e) { status(e.message); }
  });

  var verificando = false;
  async function verificar(silencioso) {
    if (verificando) return;
    var ips = app.ipsDoProjeto();
    if (!ips.length) { if (!silencioso) status("Nenhum equipamento deste projeto tem IP."); return; }
    verificando = true;
    if (!silencioso) status("Verificando " + ips.length + " IPs…");
    try {
      var mapa = await agente("/status", { method: "POST", body: JSON.stringify({ ips: ips }) });
      var online = Object.keys(mapa).filter(function (ip) { return mapa[ip].online; }).length;
      var mudou = app.atualizarStatusOnline(mapa);
      status(online + " de " + Object.keys(mapa).length + " online · " + new Date().toLocaleTimeString() +
        (mudou ? " · " + mudou + " mudaram de status" : ""));
    } catch (e) { status(e.message); }
    finally { verificando = false; }
  }

  btnVerificar.addEventListener("click", function () { verificar(false); });
  var timer = null;
  elAuto.addEventListener("change", function () {
    clearInterval(timer);
    timer = elAuto.checked ? setInterval(function () { verificar(true); }, 60000) : null;
    if (elAuto.checked) verificar(false);
  });
})();
