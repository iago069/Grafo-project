  // ==== 16-verificador-e-ips.js: verificador do diagrama, endereços IP e "ir até" (parte de assets/js/editor/app.js; npm run montar) ====
  // Verificador: confere o projeto aberto (IP repetido, redes que se sobrepõem,
  // porta usada duas vezes, porta que o modelo não tem, VLAN inválida, nome
  // repetido, equipamento sem cabo) e leva até o problema com um clique.
  // Endereços IP: todas as redes do diagrama (ficha dos equipamentos e rede da
  // VLAN dos cabos), uso de cada uma e a próxima rede livre de um bloco.

  // ---- Endereços IPv4 como números (sem operações de bit: passam de 2^31) ----
  function vfNumeroDoIp(texto) {
    var m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(String(texto || ""));
    if (!m) return null;
    var n = 0;
    for (var i = 1; i <= 4; i++) { if (+m[i] > 255) return null; n = n * 256 + Number(m[i]); }
    return n;
  }
  function vfIpDoNumero(n) { return [16777216, 65536, 256, 1].map(function (d) { return Math.floor(n / d) % 256; }).join("."); }
  function vfTamanhoDoPrefixo(p) { return Math.pow(2, 32 - p); }
  // Faixa [inicio, fim] da rede de n com o prefixo p.
  function vfFaixa(n, p) { var t = vfTamanhoDoPrefixo(p), inicio = n - (n % t); return { inicio: inicio, fim: inicio + t - 1, prefixo: p }; }
  function vfCidr(f) { return vfIpDoNumero(f.inicio) + "/" + f.prefixo; }
  // "10.0.0.0/30", "10.0.0.1/30" ou "10.0.0.0 255.255.255.252" → faixa (null se não der).
  function vfLerRede(texto) {
    var m = /((?:\d{1,3}\.){3}\d{1,3})\s*(?:\/\s*(\d{1,2})|\s+((?:\d{1,3}\.){3}\d{1,3}))/.exec(String(texto || ""));
    if (!m) return null;
    var n = vfNumeroDoIp(m[1]), p = m[2] != null ? Number(m[2]) : prefixoDaMascara(m[3]);
    if (n == null || p == null || !(p >= 8 && p <= 32)) return null;
    return vfFaixa(n, p);
  }
  // Host e rede de um equipamento pela ficha (IP com /prefixo ou campo Máscara).
  // Sem máscara: rede desconhecida (prefixo null), só o host conta.
  function vfEnderecoDoEquipamento(eq) {
    var ip = String(eq.ip || "").trim();
    if (!ip) return null;
    var barra = ip.indexOf("/"), host = vfNumeroDoIp(barra >= 0 ? ip.slice(0, barra) : ip);
    if (host == null) return null;
    var manual = String(eq.mascara || "").trim();
    var p = manual ? prefixoDaMascara(manual) : barra >= 0 ? Number(ip.slice(barra + 1)) : null;
    if (p != null && !(p >= 8 && p <= 32)) p = null;
    var gw = vfNumeroDoIp(String(eq.gateway || "").replace(/\/.*$/, ""));
    return { host: host, prefixo: p, rede: p != null ? vfFaixa(host, p) : null, gateway: gw };
  }

  // ---- Portas -----------------------------------------------------------------
  function vfChaveDaPorta(p) { return portaCurtaNoEditor(p).toLowerCase().replace(/\s+/g, ""); }
  // Final numérico da porta ("XE1/1/9" → "1/1/9", "ether3" → "3").
  function vfNumeroDaPorta(p) { var m = /(\d+(?:\/\d+)*)$/.exec(String(p || "").trim()); return m ? m[1] : ""; }
  // A porta existe no modelo? Os nomes variam muito (XE1/1/1, ten-gigabit-ethernet-1/1/1,
  // 1/1/1): vale o nome igual ou o mesmo número no fim. Sem número para comparar, não acusa.
  function vfModeloTemPorta(modelo, porta) {
    var chave = vfChaveDaPorta(porta), numero = vfNumeroDaPorta(porta);
    if (!numero) return true;
    return modelo.portas.some(function (q) { return vfChaveDaPorta(q) === chave || vfNumeroDaPorta(q) === numero; });
  }

  // ---- Verificação --------------------------------------------------------------
  // Cada problema: { nivel: "erro"|"aviso"|"dica", titulo, detalhe, ids: [equipamentos], cabo: índice }.
  function verificarDiagrama(dados) {
    dados = dados || estado;
    var problemas = [];
    var porId = {};
    dados.equipamentos.forEach(function (eq) { porId[eq.id] = eq; });
    function nome(id) { var eq = porId[id]; return eq ? (eq.nome || eq.id) : id; }
    function nomeDoCabo(c) { return nome(c.de) + " ⇄ " + nome(c.para); }

    // IP repetido, IP que é o endereço da rede ou de broadcast, gateway fora da rede.
    var porHost = {};
    dados.equipamentos.forEach(function (eq) {
      var e = vfEnderecoDoEquipamento(eq);
      if (!e) {
        if (String(eq.ip || "").trim() && !/:/.test(eq.ip)) problemas.push({ nivel: "erro", titulo: "IP inválido em " + (eq.nome || eq.id), detalhe: "\"" + eq.ip + "\" não é um endereço IPv4.", ids: [eq.id] });
        return;
      }
      (porHost[e.host] = porHost[e.host] || []).push(eq.id);
      if (e.rede && e.prefixo <= 30) {
        if (e.host === e.rede.inicio) problemas.push({ nivel: "erro", titulo: "IP de " + (eq.nome || eq.id) + " é o endereço da rede", detalhe: vfIpDoNumero(e.host) + " é o primeiro endereço de " + vfCidr(e.rede) + " (não pode ser usado por um equipamento).", ids: [eq.id] });
        else if (e.host === e.rede.fim) problemas.push({ nivel: "erro", titulo: "IP de " + (eq.nome || eq.id) + " é o broadcast", detalhe: vfIpDoNumero(e.host) + " é o último endereço de " + vfCidr(e.rede) + ".", ids: [eq.id] });
      }
      if (e.rede && e.gateway != null && (e.gateway < e.rede.inicio || e.gateway > e.rede.fim)) {
        problemas.push({ nivel: "aviso", titulo: "Gateway fora da rede em " + (eq.nome || eq.id), detalhe: "Gateway " + vfIpDoNumero(e.gateway) + " não está em " + vfCidr(e.rede) + ".", ids: [eq.id] });
      }
      if (e.rede && e.gateway === e.host) problemas.push({ nivel: "aviso", titulo: "Gateway igual ao IP em " + (eq.nome || eq.id), detalhe: "O equipamento aponta para ele mesmo (" + vfIpDoNumero(e.host) + ").", ids: [eq.id] });
    });
    Object.keys(porHost).forEach(function (h) {
      var ids = porHost[h];
      if (ids.length > 1) problemas.push({ nivel: "erro", titulo: "IP " + vfIpDoNumero(Number(h)) + " repetido", detalhe: "Usado por " + ids.map(nome).join(", ") + ".", ids: ids });
    });

    // Redes que se sobrepõem sem ser iguais (ex.: 10.0.0.0/29 e 10.0.0.4/30).
    var redes = {};
    function somarRede(f, origem, ids, cabo) {
      if (!f || f.prefixo > 30) return;
      var k = vfCidr(f);
      var r = redes[k] || (redes[k] = { faixa: f, origens: [], ids: [], cabo: cabo });
      if (r.origens.indexOf(origem) < 0) r.origens.push(origem);
      ids.forEach(function (id) { if (r.ids.indexOf(id) < 0) r.ids.push(id); });
    }
    dados.equipamentos.forEach(function (eq) { var e = vfEnderecoDoEquipamento(eq); if (e) somarRede(e.rede, eq.nome || eq.id, [eq.id]); });
    dados.conexoes.forEach(function (c, i) { somarRede(vfLerRede(c.redeVlan), "cabo " + nomeDoCabo(c), [c.de, c.para], i); });
    var lista = Object.keys(redes).map(function (k) { return redes[k]; }).sort(function (a, b) { return a.faixa.inicio - b.faixa.inicio || a.faixa.prefixo - b.faixa.prefixo; });
    for (var i = 0; i < lista.length; i++) {
      for (var j = i + 1; j < lista.length && lista[j].faixa.inicio <= lista[i].faixa.fim; j++) {
        var a = lista[i], b = lista[j];
        problemas.push({ nivel: "aviso", titulo: "Redes " + vfCidr(a.faixa) + " e " + vfCidr(b.faixa) + " se sobrepõem",
          detalhe: vfCidr(a.faixa) + " (" + a.origens.slice(0, 3).join(", ") + ") e " + vfCidr(b.faixa) + " (" + b.origens.slice(0, 3).join(", ") + ") usam endereços em comum.",
          ids: a.ids.concat(b.ids).filter(function (id, k, l) { return l.indexOf(id) === k; }), cabo: a.cabo != null ? a.cabo : b.cabo });
      }
    }

    // Portas: usada duas vezes no mesmo equipamento; porta que o modelo não tem.
    var usadas = {};
    dados.conexoes.forEach(function (c, i) {
      [[c.de, c.saida], [c.para, c.chegada]].forEach(function (ponta) {
        var porta = String(ponta[1] || "").trim();
        if (!porta || !porId[ponta[0]]) return;
        var k = ponta[0] + "#" + vfChaveDaPorta(porta);
        (usadas[k] = usadas[k] || { id: ponta[0], porta: porta, cabos: [] }).cabos.push(i);
        var modelo = modeloDoEquipamento(porId[ponta[0]]);
        if (modelo && modelo.portas.length && !vfModeloTemPorta(modelo, porta)) {
          problemas.push({ nivel: "aviso", titulo: "Porta " + porta + " não existe no " + modelo.nome, detalhe: nome(ponta[0]) + " (" + modelo.nome + ") tem " + modelo.portas.length + " portas: " + modelo.portas.slice(0, 4).join(", ") + (modelo.portas.length > 4 ? "…" : "") + ". Cabo " + nomeDoCabo(c) + ".", ids: [ponta[0]], cabo: i });
        }
      });
    });
    Object.keys(usadas).forEach(function (k) {
      var u = usadas[k];
      if (u.cabos.length > 1) problemas.push({ nivel: "erro", titulo: "Porta " + u.porta + " de " + nome(u.id) + " usada " + u.cabos.length + " vezes",
        detalhe: "Cabos: " + u.cabos.map(function (i) { return nomeDoCabo(dados.conexoes[i]); }).join("; ") + ".", ids: [u.id], cabo: u.cabos[1] });
    });

    // VLAN fora de 1–4094.
    dados.conexoes.forEach(function (c, i) {
      var v = String(c.vlan || "").trim();
      if (!v) return;
      var ruins = (v.match(/\d+/g) || []).filter(function (n) { return +n < 1 || +n > 4094; });
      if (ruins.length) problemas.push({ nivel: "erro", titulo: "VLAN " + ruins[0] + " inválida", detalhe: "No cabo " + nomeDoCabo(c) + ": VLAN vai de 1 a 4094.", ids: [c.de, c.para], cabo: i });
    });

    // Nome repetido e equipamento sem cabo.
    var porNome = {};
    dados.equipamentos.forEach(function (eq) { var k = String(eq.nome || "").trim().toLowerCase(); if (k) (porNome[k] = porNome[k] || []).push(eq.id); });
    Object.keys(porNome).forEach(function (k) {
      if (porNome[k].length > 1) problemas.push({ nivel: "aviso", titulo: "Nome \"" + nome(porNome[k][0]) + "\" repetido", detalhe: porNome[k].length + " equipamentos com o mesmo nome: fica difícil achar o certo no campo.", ids: porNome[k] });
    });
    if (dados.equipamentos.length > 1) {
      var ligados = {};
      dados.conexoes.forEach(function (c) { ligados[c.de] = ligados[c.para] = true; });
      dados.equipamentos.forEach(function (eq) {
        if (!ligados[eq.id]) problemas.push({ nivel: "dica", titulo: (eq.nome || eq.id) + " sem cabo", detalhe: "Nenhum cabo liga este equipamento ao resto do diagrama.", ids: [eq.id] });
      });
    }

    var ordem = { erro: 0, aviso: 1, dica: 2 };
    return problemas.sort(function (a, b) { return ordem[a.nivel] - ordem[b.nivel]; });
  }

  // ---- Ir até um equipamento ou cabo ----------------------------------------------
  // Centraliza (com zoom de pelo menos 100%), seleciona e pisca o contorno.
  function centralizarElementoNaTela(el) {
    var svg = elCanvas.querySelector("svg");
    if (!svg || !el) return;
    var r = el.getBoundingClientRect(), s = svg.getBoundingClientRect(), area = elCanvas.getBoundingClientRect();
    var escala = Math.max(1, canvasView.scale);
    var px = (r.left + r.width / 2 - s.left) / canvasView.scale, py = (r.top + r.height / 2 - s.top) / canvasView.scale;
    var esquerda = s.left - canvasView.x, topo = s.top - canvasView.y;
    moverCameraPara(escala, area.left + area.width / 2 - esquerda - px * escala, area.top + area.height / 2 - topo - py * escala);
    el.classList.remove("piscar-foco");
    void el.getBBox();
    el.classList.add("piscar-foco");
    setTimeout(function () { el.classList.remove("piscar-foco"); }, 1800);
  }
  function focarEquipamento(id) {
    var no = obterNodePorId(elCanvas.querySelector("svg"), id);
    if (!no) return false;
    definirSelecao([id]);
    centralizarElementoNaTela(no);
    return true;
  }
  function focarCabo(indice) {
    var svg = elCanvas.querySelector("svg"), aresta = svg && svg.querySelector('g.edge[id="edge_' + indice + '"]');
    if (!aresta) return false;
    definirSelecao([]);
    selecionarCabo(indice);
    centralizarElementoNaTela(aresta);
    return true;
  }
  function irAteProblema(p) {
    if (p.cabo != null && (!p.ids || p.ids.length !== 1)) { if (focarCabo(p.cabo)) return; }
    if (p.ids && p.ids.length) {
      focarEquipamento(p.ids[0]);
      if (p.ids.length > 1) definirSelecao(p.ids.filter(function (id) { return estado.equipamentos.some(function (e) { return e.id === id; }); }));
    }
  }

  // ---- Janelas ---------------------------------------------------------------------
  function vfCriarJanela(id, titulo, classe) {
    var fundo = document.createElement("div");
    fundo.className = "modal-backdrop hidden";
    fundo.id = id;
    fundo.setAttribute("role", "dialog");
    fundo.setAttribute("aria-modal", "true");
    fundo.setAttribute("aria-labelledby", id + "Titulo");
    fundo.innerHTML = '<div class="modal-box ' + classe + '"><div class="modal-header"><h3 id="' + id + 'Titulo">' + escaparHtml(titulo) + '</h3>' +
      '<button type="button" class="ghost small" data-fechar aria-label="Fechar">×</button></div><div class="vf-corpo"></div></div>';
    document.body.appendChild(fundo);
    function fechar() { esconderModal(fundo); if (fundo.contains(document.activeElement)) document.activeElement.blur(); }
    fundo.querySelector("[data-fechar]").addEventListener("click", fechar);
    fundo.addEventListener("click", function (e) { if (e.target === fundo) fechar(); });
    fundo.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); fechar(); } });
    return { fundo: fundo, corpo: fundo.querySelector(".vf-corpo"), fechar: fechar, abrir: function () { mostrarModalBackdrop(fundo); } };
  }

  var NOMES_NIVEL = { erro: "Erro", aviso: "Aviso", dica: "Dica" };
  var janelaVerificar = vfCriarJanela("vfModal", "Verificar diagrama", "vf-card");
  var problemasMostrados = [];
  function desenharVerificacao() {
    var problemas = problemasMostrados = verificarDiagrama();
    var conta = { erro: 0, aviso: 0, dica: 0 };
    problemas.forEach(function (p) { conta[p.nivel]++; });
    var resumo = '<div class="vf-resumo">' + ["erro", "aviso", "dica"].map(function (n) {
      return '<span class="vf-contagem vf-' + n + '"><b>' + conta[n] + '</b> ' + (n === "erro" ? (conta[n] === 1 ? "erro" : "erros") : n === "aviso" ? (conta[n] === 1 ? "aviso" : "avisos") : (conta[n] === 1 ? "dica" : "dicas")) + '</span>';
    }).join("") + '<button type="button" class="ghost small" data-vf-refazer>Verificar de novo</button></div>';
    if (!estado.equipamentos.length) { janelaVerificar.corpo.innerHTML = '<p class="vf-vazio">O diagrama está vazio.</p>'; return; }
    if (!problemas.length) {
      janelaVerificar.corpo.innerHTML = resumo + '<p class="vf-vazio vf-tudo-certo">Tudo certo: nenhum IP repetido, porta duplicada ou rede sobreposta em ' + estado.equipamentos.length + ' equipamentos e ' + estado.conexoes.length + ' cabos.</p>';
      return;
    }
    janelaVerificar.corpo.innerHTML = resumo + '<ul class="vf-lista">' + problemas.map(function (p, i) {
      return '<li class="vf-item vf-' + p.nivel + '"><span class="vf-selo">' + NOMES_NIVEL[p.nivel] + '</span>' +
        '<div class="vf-textos"><strong>' + escaparHtml(p.titulo) + '</strong><span>' + escaparHtml(p.detalhe) + '</span></div>' +
        '<button type="button" class="ghost small" data-vf-ir="' + i + '">Mostrar</button></li>';
    }).join("") + '</ul>';
  }
  janelaVerificar.corpo.addEventListener("click", function (e) {
    var ir = e.target.closest("[data-vf-ir]");
    if (ir) { var p = problemasMostrados[Number(ir.getAttribute("data-vf-ir"))]; janelaVerificar.fechar(); if (p) setTimeout(function () { irAteProblema(p); }, 160); return; }
    if (e.target.closest("[data-vf-refazer]")) desenharVerificacao();
  });
  function abrirVerificador() { desenharVerificacao(); janelaVerificar.abrir(); var b = janelaVerificar.fundo.querySelector("[data-vf-ir], [data-vf-refazer]"); if (b) b.focus(); }

  // Selo no botão da barra lateral com erros + avisos, atualizado depois de cada mudança.
  var btnVerificar = document.getElementById("btnVerificar");
  var timerSeloVerificar = null;
  function atualizarSeloVerificar() {
    clearTimeout(timerSeloVerificar);
    timerSeloVerificar = setTimeout(function () {
      if (!btnVerificar) return;
      var n = 0, erros = 0;
      try { verificarDiagrama().forEach(function (p) { if (p.nivel !== "dica") n++; if (p.nivel === "erro") erros++; }); } catch (e) { return; }
      btnVerificar.setAttribute("data-selo", n ? String(n) : "");
      btnVerificar.classList.toggle("com-erro", erros > 0);
      btnVerificar.title = n ? n + (n === 1 ? " problema" : " problemas") + " no diagrama (IP, portas, redes)" : "Confere IPs repetidos, redes sobrepostas, portas duplicadas ou que o modelo não tem";
    }, 400);
  }
  window.addEventListener("grafo:render", atualizarSeloVerificar);
  if (btnVerificar) btnVerificar.addEventListener("click", abrirVerificador);

  // ---- Endereços IP -----------------------------------------------------------------
  var janelaIps = vfCriarJanela("ipModal", "Endereços IP", "vf-card ip-card");
  janelaIps.corpo.innerHTML =
    '<div class="ip-sugestao"><div class="ip-sugestao-campos">' +
      '<label>Bloco<input id="ipBloco" placeholder="10.20.0.0/24" spellcheck="false" autocomplete="off"></label>' +
      '<label>Tamanho<select id="ipTamanho"><option value="30">/30 (2 IPs)</option><option value="29">/29 (6 IPs)</option><option value="28">/28 (14 IPs)</option><option value="27">/27 (30 IPs)</option><option value="24">/24 (254 IPs)</option></select></label>' +
      '<label class="ip-todos"><input type="checkbox" id="ipTodos" checked> Conferir todos os projetos</label>' +
    '</div><div class="ip-resultado" id="ipResultado" aria-live="polite"></div></div>' +
    '<div class="ip-filtro"><input type="search" id="ipFiltro" placeholder="Filtrar por rede, IP ou equipamento" aria-label="Filtrar endereços"><span id="ipTotal"></span></div>' +
    '<div class="ip-tabela-area"><table class="ip-tabela"><thead><tr><th>Rede</th><th>Uso</th><th>Próximo livre</th><th>Equipamentos</th></tr></thead><tbody id="ipLinhas"></tbody></table></div>';
  function ipCampo(id) { return document.getElementById(id); }

  // Redes e hosts de um projeto: { redes: { cidr: {faixa, hosts: [{n, nome, id}], cabos} }, soltos: [...] }.
  function inventarioDeIps(dados) {
    var redes = {}, soltos = [];
    function rede(f) { var k = vfCidr(f); return redes[k] || (redes[k] = { faixa: f, hosts: [], cabos: [] }); }
    dados.equipamentos.forEach(function (eq) {
      var e = vfEnderecoDoEquipamento(eq);
      if (!e) return;
      var h = { n: e.host, nome: eq.nome || eq.id, id: eq.id };
      if (e.rede) rede(e.rede).hosts.push(h); else soltos.push(h);
    });
    dados.conexoes.forEach(function (c, i) { var f = vfLerRede(c.redeVlan); if (f) rede(f).cabos.push(i); });
    return { redes: redes, soltos: soltos };
  }
  function proximoHostLivre(r) {
    var usados = {};
    r.hosts.forEach(function (h) { usados[h.n] = true; });
    var primeiro = r.faixa.prefixo >= 31 ? r.faixa.inicio : r.faixa.inicio + 1, ultimo = r.faixa.prefixo >= 31 ? r.faixa.fim : r.faixa.fim - 1;
    for (var n = primeiro; n <= ultimo && n - primeiro < 70000; n++) if (!usados[n]) return n;
    return null;
  }

  // Faixas ocupadas (redes conhecidas e hosts soltos), do projeto aberto ou de todos.
  function faixasOcupadas(todos) {
    var lista = [];
    var projetosParaVer = [estado];
    if (todos) Object.keys(projetos).forEach(function (nome) { if (nome !== projetoAtual && projetos[nome]) projetosParaVer.push(projetos[nome]); });
    projetosParaVer.forEach(function (dados) {
      var inv = inventarioDeIps({ equipamentos: dados.equipamentos || [], conexoes: dados.conexoes || [] });
      Object.keys(inv.redes).forEach(function (k) { lista.push({ inicio: inv.redes[k].faixa.inicio, fim: inv.redes[k].faixa.fim }); });
      inv.soltos.forEach(function (h) { lista.push({ inicio: h.n, fim: h.n }); });
      Object.keys(inv.redes).forEach(function (k) { inv.redes[k].hosts.forEach(function (h) { lista.push({ inicio: h.n, fim: h.n }); }); });
    });
    return lista.sort(function (a, b) { return a.inicio - b.inicio; });
  }
  // Próximas redes livres do tamanho p dentro do bloco (até quantas).
  function redesLivres(bloco, p, ocupadas, quantas) {
    var t = vfTamanhoDoPrefixo(p), achadas = [], c = bloco.inicio, k = 0;
    while (c + t - 1 <= bloco.fim && achadas.length < quantas) {
      while (k < ocupadas.length && ocupadas[k].fim < c) k++;
      var choque = null;
      for (var j = k; j < ocupadas.length && ocupadas[j].inicio <= c + t - 1; j++) { if (ocupadas[j].fim >= c) { choque = ocupadas[j]; break; } }
      if (!choque) { achadas.push({ inicio: c, fim: c + t - 1, prefixo: p }); c += t; }
      else c = Math.ceil((choque.fim + 1) / t) * t;
    }
    return achadas;
  }
  // Bloco sugerido: o /24 que mais aparece no projeto.
  function blocoSugerido() {
    var conta = {};
    Object.keys(inventarioDeIps(estado).redes).forEach(function (k) { var f = vfLerRede(k); var b = vfCidr(vfFaixa(f.inicio, 24)); conta[b] = (conta[b] || 0) + 1; });
    var melhor = Object.keys(conta).sort(function (a, b) { return conta[b] - conta[a]; })[0];
    return melhor || "";
  }

  function desenharSugestao() {
    var saida = ipCampo("ipResultado"), bloco = vfLerRede(ipCampo("ipBloco").value), p = Number(ipCampo("ipTamanho").value);
    if (!ipCampo("ipBloco").value.trim()) { saida.innerHTML = '<span class="ip-dica">Escreva um bloco (ex.: 10.20.0.0/24) para ver a próxima rede livre.</span>'; return; }
    if (!bloco) { saida.innerHTML = '<span class="ip-erro">Bloco inválido. Use o formato 10.20.0.0/24.</span>'; return; }
    if (p < bloco.prefixo) { saida.innerHTML = '<span class="ip-erro">Uma /' + p + ' não cabe dentro de ' + vfCidr(bloco) + '.</span>'; return; }
    var livres = redesLivres(bloco, p, faixasOcupadas(ipCampo("ipTodos").checked), 6);
    if (!livres.length) { saida.innerHTML = '<span class="ip-erro">Nenhuma /' + p + ' livre em ' + vfCidr(bloco) + '.</span>'; return; }
    var a = livres[0], uteis = p <= 30 ? vfIpDoNumero(a.inicio + 1) + " – " + vfIpDoNumero(a.fim - 1) : vfIpDoNumero(a.inicio);
    saida.innerHTML = '<div class="ip-proxima"><span>Próxima /' + p + ' livre</span><strong>' + vfCidr(a) + '</strong><em>úteis ' + uteis + (p === 30 ? ' (gateway ' + vfIpDoNumero(a.inicio + 1) + ', RB ' + vfIpDoNumero(a.inicio + 2) + ')' : '') + '</em>' +
      '<button type="button" class="primary small" data-ip-copiar="' + vfCidr(a) + '">Copiar</button></div>' +
      (livres.length > 1 ? '<div class="ip-depois">Depois: ' + livres.slice(1).map(function (f) { return '<button type="button" class="ip-chip" data-ip-copiar="' + vfCidr(f) + '" title="Copiar">' + vfCidr(f) + '</button>'; }).join("") + '</div>' : "");
  }

  function desenharTabelaDeIps() {
    var inv = inventarioDeIps(estado), filtro = normalizarTextoEquipamento(ipCampo("ipFiltro").value);
    var linhas = Object.keys(inv.redes).map(function (k) { return inv.redes[k]; }).sort(function (a, b) { return a.faixa.inicio - b.faixa.inicio || a.faixa.prefixo - b.faixa.prefixo; });
    var procurado = vfNumeroDoIp(ipCampo("ipFiltro").value);
    var html = linhas.filter(function (r) {
      if (!filtro) return true;
      if (procurado != null && procurado >= r.faixa.inicio && procurado <= r.faixa.fim) return true;
      return normalizarTextoEquipamento(vfCidr(r.faixa) + " " + r.hosts.map(function (h) { return h.nome + " " + vfIpDoNumero(h.n); }).join(" ")).indexOf(filtro) >= 0;
    }).map(function (r) {
      var total = r.faixa.prefixo >= 31 ? vfTamanhoDoPrefixo(r.faixa.prefixo) : vfTamanhoDoPrefixo(r.faixa.prefixo) - 2;
      var usados = {};
      r.hosts.forEach(function (h) { usados[h.n] = true; });
      var nUsados = Object.keys(usados).length, livre = proximoHostLivre(r), pct = Math.min(100, Math.round(nUsados / Math.max(1, total) * 100));
      var equipamentos = r.hosts.sort(function (a, b) { return a.n - b.n; }).map(function (h) {
        return '<button type="button" class="ip-chip" data-ip-equip="' + escaparHtml(h.id) + '" title="Mostrar no diagrama">' + escaparHtml(h.nome) + ' <code>' + vfIpDoNumero(h.n) + '</code></button>';
      }).join("") + (r.cabos.length ? '<span class="ip-cabos">' + r.cabos.length + (r.cabos.length === 1 ? " cabo" : " cabos") + '</span>' : "");
      return '<tr><td><code>' + vfCidr(r.faixa) + '</code></td><td><div class="ip-uso"><span style="width:' + pct + '%"></span></div><small>' + nUsados + ' de ' + total + '</small></td>' +
        '<td>' + (livre != null ? '<button type="button" class="ip-chip" data-ip-copiar="' + vfIpDoNumero(livre) + '" title="Copiar">' + vfIpDoNumero(livre) + '</button>' : '<span class="ip-erro">cheia</span>') + '</td><td><div class="ip-equips">' + equipamentos + '</div></td></tr>';
    }).join("");
    var soltos = inv.soltos.filter(function (h) { return !filtro || normalizarTextoEquipamento(h.nome + " " + vfIpDoNumero(h.n)).indexOf(filtro) >= 0; });
    if (soltos.length) {
      html += '<tr class="ip-soltos"><td><em>Sem máscara</em></td><td colspan="2"><small>IP sem /prefixo nem máscara na ficha</small></td><td><div class="ip-equips">' + soltos.map(function (h) {
        return '<button type="button" class="ip-chip" data-ip-equip="' + escaparHtml(h.id) + '">' + escaparHtml(h.nome) + ' <code>' + vfIpDoNumero(h.n) + '</code></button>';
      }).join("") + '</div></td></tr>';
    }
    ipCampo("ipLinhas").innerHTML = html || '<tr><td colspan="4" class="vf-vazio">' + (filtro ? "Nada com esse filtro." : "Nenhum IP no diagrama ainda. Preencha o IP na ficha dos equipamentos.") + '</td></tr>';
    ipCampo("ipTotal").textContent = linhas.length + (linhas.length === 1 ? " rede" : " redes") + " · " + Object.keys(inv.redes).reduce(function (t, k) { return t + inv.redes[k].hosts.length; }, inv.soltos.length) + " IPs";
  }
  function abrirEnderecosIp(filtro) {
    if (!ipCampo("ipBloco").value) ipCampo("ipBloco").value = blocoSugerido();
    ipCampo("ipFiltro").value = filtro || "";
    desenharSugestao();
    desenharTabelaDeIps();
    janelaIps.abrir();
    (filtro ? ipCampo("ipFiltro") : ipCampo("ipBloco")).focus();
  }
  ipCampo("ipBloco").addEventListener("input", desenharSugestao);
  ipCampo("ipTamanho").addEventListener("change", desenharSugestao);
  ipCampo("ipTodos").addEventListener("change", desenharSugestao);
  ipCampo("ipFiltro").addEventListener("input", desenharTabelaDeIps);
  janelaIps.corpo.addEventListener("click", function (e) {
    var copiar = e.target.closest("[data-ip-copiar]");
    if (copiar) {
      var texto = copiar.getAttribute("data-ip-copiar");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(function () { avisar(texto + " copiado."); }, function () { avisar(texto); });
      else avisar(texto);
      return;
    }
    var equip = e.target.closest("[data-ip-equip]");
    if (equip) { var id = equip.getAttribute("data-ip-equip"); janelaIps.fechar(); setTimeout(function () { focarEquipamento(id); }, 160); }
  });
  var btnEnderecosIp = document.getElementById("btnEnderecosIp");
  if (btnEnderecosIp) btnEnderecosIp.addEventListener("click", function () { abrirEnderecosIp(""); });

  // Para a paleta de comandos (comandos.js) e outros módulos.
  Object.assign(window.GrafoApp, {
    focarEquipamento: function (id) { return focarEquipamento(id); },
    focarCabo: function (indice) { return focarCabo(indice); },
    verificar: function () { return verificarDiagrama(); },
    abrirVerificador: abrirVerificador,
    abrirEnderecosIp: abrirEnderecosIp,
    redesLivres: function (bloco, prefixo, todos, quantas) {
      var f = vfLerRede(bloco);
      return f ? redesLivres(f, prefixo, faixasOcupadas(!!todos), quantas || 1).map(vfCidr) : [];
    }
  });
