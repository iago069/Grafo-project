// Gerar diagrama a partir de texto colado: tabela de interfaces do Grafana,
// tabela de interfaces do NetBox e saídas do Junos ("show interfaces
// descriptions" e "show lldp neighbors"). Sem IA: só reconhece esses formatos.
//
// Regras (as mesmas usadas à mão):
// - porta com descrição "aeN" faz parte da LAG aeN; a descrição da LAG diz o destino;
// - Grafana e "show interfaces" mandam; NetBox e LLDP só completam o vizinho e a
//   porta do outro lado (porta que só existe no NetBox entra tracejada);
// - porta sem descrição e sem vizinho vira nota, não equipamento.
(function () {
  "use strict";

  var IMG = "./assets/images/equipamentos/";
  var RE_PORTA = /^((?:xe|et|ge|mge|xle|fte)-\d+\/\d+\/\d+(?::\d+)?|ae\d+)$/i;
  var RE_TAXA = /^([\d.,]+)\s*([kmgt]?)bps$/i;

  function limpar(t) { return String(t == null ? "" : t).replace(/ /g, " ").trim(); }
  function vazio(t) { t = limpar(t); return !t || t === "—" || t === "-" || t === "–"; }
  function corta(t, n) { t = limpar(t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function bps(t) {
    var m = RE_TAXA.exec(limpar(t));
    if (!m) return null;
    return parseFloat(m[1].replace(",", ".")) * ({ "": 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12 })[m[2].toLowerCase()];
  }
  function velocidadePorNome(porta) {
    var p = porta.toLowerCase();
    if (p.indexOf("et-") === 0) return "100G";
    if (p.indexOf("xe-") === 0) return "10G";
    if (p.indexOf("ge-") === 0) return "1G";
    return "";
  }

  // ---- Leitores (cada um devolve registros por porta) --------------------------

  // Grafana: "xe-0/0/21XE10G" / descrição / Online / entrada / saída / "% ..."
  // (sem descrição, "Online" vem na mesma linha do nome).
  function lerGrafana(linhas) {
    var regs = [];
    var re = /^((?:xe|et|ge|mge)-\d+\/\d+\/\d+(?::\d+)?|ae\d+)(XE|ET|GE|MGE|LAG)(\d+(?:\.\d+)?G)\b\s*(.*)$/i;
    for (var i = 0; i < linhas.length; i++) {
      var m = re.exec(limpar(linhas[i]));
      if (!m) continue;
      var reg = { porta: m[1], velocidade: m[3].toUpperCase(), lag: "", desc: "", fonte: "grafana", taxas: [] };
      var resto = limpar(m[4]);
      var j = i + 1;
      if (!/^(online|offline|down|up)\b/i.test(resto)) {
        var prox = limpar(linhas[j] || "");
        if (prox && !/^(online|offline|down|up)\b/i.test(prox) && !re.test(prox)) { reg.desc = prox; j++; }
      }
      reg.status = /offline|down/i.test(resto + " " + limpar(linhas[j] || "")) ? "offline" : "online";
      for (var k = j; k < Math.min(linhas.length, j + 6) && reg.taxas.length < 2; k++) {
        var linha = limpar(linhas[k]);
        if (re.test(linha)) break;
        linha.split(/\t+/).forEach(function (pedaco) { var v = bps(pedaco); if (v != null && reg.taxas.length < 2) reg.taxas.push(v); });
      }
      regs.push(reg);
    }
    return regs;
  }

  // NetBox: colunas separadas por TAB; o vizinho vem como "nome (série)  porta".
  function lerNetbox(linhas) {
    var regs = [];
    linhas.forEach(function (bruta) {
      if (bruta.indexOf("\t") < 0) return;
      var campos = bruta.split("\t").map(limpar);
      while (campos.length && !campos[0]) campos.shift();
      if (!campos.length || !RE_PORTA.test(campos[0])) return;
      var iTipo = -1;
      for (var a = 1; a < campos.length; a++) if (/qsfp|sfp|link aggregation|base-|virtual|ethernet|\(\d+ge\)/i.test(campos[a])) { iTipo = a; break; }
      if (iTipo < 0) return;
      if (/virtual/i.test(campos[iTipo])) return; // subinterface (.1766): não é cabo
      var iCabo = -1;
      for (var b = iTipo + 1; b < campos.length; b++) if (/^#\d+$/.test(campos[b])) { iCabo = b; break; }
      var desc = "";
      for (var c = iTipo + 1; c < (iCabo < 0 ? campos.length : iCabo); c++) if (!vazio(campos[c])) { desc = campos[c]; break; }
      var reg = { porta: campos[0], velocidade: "", lag: "", desc: desc, fonte: "netbox" };
      var mv = /\((\d+)GE\)/i.exec(campos[iTipo]);
      if (mv) reg.velocidade = mv[1] + "G";
      if (iCabo >= 0) {
        var viz = limpar(campos[iCabo + 1] || "");
        var partes = viz.split(/\s{2,}/);
        if (partes.length >= 2) {
          reg.vizinho = limpar(partes[0].replace(/\s*\([^)]*\)\s*$/, ""));
          reg.portaVizinho = limpar(partes.slice(1).join(" "));
        } else if (!vazio(viz)) reg.vizinho = viz.replace(/\s*\([^)]*\)\s*$/, "");
      }
      regs.push(reg);
    });
    return regs;
  }

  // Junos: "show interfaces descriptions" (Interface Admin Link Description).
  function lerDescricoes(linhas) {
    var regs = [], dentro = false;
    linhas.forEach(function (bruta) {
      var l = limpar(bruta);
      if (/^interface\s+admin\s+link\s+description/i.test(l)) { dentro = true; return; }
      if (!dentro) return;
      var m = /^(\S+)\s+(up|down)\s+(up|down)\s+(.*)$/i.exec(l);
      if (!m || !RE_PORTA.test(m[1])) return;
      regs.push({ porta: m[1], velocidade: "", lag: "", desc: limpar(m[4]), fonte: "junos", status: /down/i.test(m[3]) ? "offline" : "online" });
    });
    return regs;
  }

  // Junos: "show lldp neighbors" (Local Interface, Parent, Chassis Id, Port info, System Name).
  function lerLldp(linhas) {
    var regs = [], dentro = false;
    linhas.forEach(function (bruta) {
      var l = limpar(bruta);
      if (/^local interface\s+parent interface/i.test(l)) { dentro = true; return; }
      if (!dentro) return;
      var c = l.split(/\s{2,}/);
      if (c.length < 5 || !RE_PORTA.test(c[0])) return;
      regs.push({ porta: c[0], lag: vazio(c[1]) ? "" : c[1], vizinho: c[c.length - 1], portaVizinho: c[c.length - 2], fonte: "lldp" });
    });
    return regs;
  }

  // ---- Juntar e montar o projeto ----------------------------------------------

  function juntar(regs) {
    var porPorta = {}, ordem = [];
    var peso = { grafana: 3, junos: 3, netbox: 1, lldp: 1 };
    regs.forEach(function (r) {
      var chave = r.porta.toLowerCase();
      var atual = porPorta[chave];
      if (!atual) { porPorta[chave] = Object.assign({ fontes: [r.fonte] }, r); ordem.push(chave); return; }
      atual.fontes.push(r.fonte);
      var manda = (peso[r.fonte] || 0) > (peso[atual.fonte] || 0);
      ["desc", "velocidade", "lag", "status"].forEach(function (k) {
        if (r[k] && (manda || !atual[k])) atual[k] = r[k];
      });
      if (r.taxas && r.taxas.length) atual.taxas = r.taxas;
      // Vizinho: LLDP é o próprio equipamento dizendo; vale mais que o NetBox.
      if (r.vizinho && (!atual.vizinho || r.fonte === "lldp")) { atual.vizinho = r.vizinho; atual.portaVizinho = r.portaVizinho || atual.portaVizinho; }
      if (manda) atual.fonte = r.fonte;
    });
    return ordem.map(function (k) { return porPorta[k]; });
  }

  function iconePorNome(nome) {
    var n = nome.toLowerCase();
    if (/netflix|facebook|google|cache|cdn|cgnat|a10|servidor|server/.test(n)) return { tipo: "Servidor", icone: IMG + "SERVIDOR.svg" };
    if (/olt/.test(n) && !/distr/.test(n)) return { tipo: "OLT", icone: IMG + "OLT.png" };
    if (/dwdm|padtec/.test(n)) return { tipo: "DWDM", icone: IMG + "DWDM.png" };
    if (/transito|trânsito|operadora|transporte|equinix|eletronet|mhnet|ix\b/.test(n)) return { tipo: "Operadora", icone: IMG + "NUVEM-VPLS.png" };
    return { tipo: "Switch", icone: IMG + "SWITCH.png" };
  }

  function idDe(nome, usados) {
    var base = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "eq";
    var id = base, n = 2;
    while (usados[id]) id = base + "-" + (n++);
    usados[id] = true;
    return id;
  }

  // Lê o texto e devolve { projeto, cabos (para a revisão), notas, formatos }.
  function ler(texto, nomeCentro) {
    var linhas = String(texto || "").replace(/\r/g, "").split("\n");
    var lidos = { grafana: lerGrafana(linhas), netbox: lerNetbox(linhas), junos: lerDescricoes(linhas), lldp: lerLldp(linhas) };
    var formatos = Object.keys(lidos).filter(function (k) { return lidos[k].length; });
    var portas = juntar([].concat(lidos.grafana, lidos.junos, lidos.netbox, lidos.lldp));
    var temPrincipal = lidos.grafana.length + lidos.junos.length > 0;

    // LAGs: membro tem descrição "aeN"; a descrição da LAG diz o destino.
    var lags = {};
    portas.forEach(function (p) { if (/^ae\d+$/i.test(p.porta)) lags[p.porta.toLowerCase()] = p; });
    portas.forEach(function (p) {
      if (/^ae\d+$/i.test(p.porta)) return;
      if (/^ae\d+$/i.test(p.desc || "")) { p.lag = p.desc.toLowerCase(); p.desc = ""; }
      if (p.lag && !lags[p.lag.toLowerCase()]) lags[p.lag.toLowerCase()] = { porta: p.lag, desc: "", fontes: [] };
    });

    var centro = limpar(nomeCentro) || "Equipamento central";
    var usados = {}, idCentro = idDe(centro, usados);
    var vizinhos = {}, ordemViz = [], cabos = [], notas = [], semDestinoPorLag = {};

    function vizinhoPara(nome) {
      var chave = nome.toLowerCase();
      if (!vizinhos[chave]) { vizinhos[chave] = { id: idDe(nome, usados), nome: corta(nome, 60) }; ordemViz.push(chave); }
      return vizinhos[chave];
    }

    portas.forEach(function (p) {
      if (/^ae\d+$/i.test(p.porta)) return;
      var lag = p.lag ? lags[p.lag.toLowerCase()] : null;
      var descDestino = (lag && lag.desc) || p.desc || "";
      var nomeViz = p.vizinho || (lag && lag.vizinho) || descDestino;
      var soNetbox = temPrincipal && p.fontes.indexOf("grafana") < 0 && p.fontes.indexOf("junos") < 0;
      if (!nomeViz) {
        if (lag) (semDestinoPorLag[lag.porta] = semDestinoPorLag[lag.porta] || []).push(p.porta);
        else notas.push(p.porta + ": " + (p.status === "offline" ? "offline" : "online") + ", sem descrição e sem vizinho");
        return;
      }
      var v = vizinhoPara(nomeViz);
      var velocidade = p.velocidade || velocidadePorNome(p.porta);
      var rotulo = lag ? "LAG " + lag.porta + (descDestino ? " (" + descDestino + ")" : "") : (descDestino || "Enlace");
      cabos.push({
        de: idCentro, para: v.id, saida: p.porta, chegada: p.portaVizinho || "?",
        tipo: soNetbox ? corta(rotulo, 28) + " · só NetBox" : corta(rotulo, 40), potencia: velocidade || "1G",
        grossura: /100G/.test(velocidade) ? 6 : /40G/.test(velocidade) ? 4 : 3, cor: "#5A7284",
        estilo: soNetbox ? "dashed" : "solid",
        _vizinho: v.nome, _confirmado: !!p.portaVizinho, _soNetbox: soNetbox
      });
    });
    Object.keys(semDestinoPorLag).forEach(function (l) { notas.push(l + " = " + semDestinoPorLag[l].join(", ") + " (LAG sem descrição e sem vizinho)"); });

    // Layout: central no meio, vizinhos em duas colunas.
    var lista = ordemViz.map(function (k) { return vizinhos[k]; });
    var esq = lista.filter(function (_, i) { return i % 2 === 0; }), dir = lista.filter(function (_, i) { return i % 2 === 1; });
    var equipamentos = [Object.assign({ id: idCentro, nome: corta(centro, 60), modelo: "", grupo: "", status: "ativo", ip: "", imagem: "", corFonte: "#16323D", posicao: { x: 0, y: 0 }, deslocamento: { x: 0, y: 0 } }, { tipo: "Switch", icone: IMG + "SWITCH.png" })];
    [[esq, -700], [dir, 700]].forEach(function (par) {
      par[0].forEach(function (v, i) {
        var t = iconePorNome(v.nome);
        equipamentos.push({ id: v.id, nome: v.nome, tipo: t.tipo, modelo: "", grupo: "", status: "ativo", icone: t.icone, ip: "", imagem: "", corFonte: "#16323D",
          posicao: { x: par[1], y: Math.round((i - (par[0].length - 1) / 2) * 190) }, deslocamento: { x: 0, y: 0 } });
      });
    });
    var base = Math.max(esq.length, dir.length) * 95 + 120;
    var anotacoes = notas.slice(0, 20).map(function (t, i) { return { id: "n" + (i + 1), texto: corta(t, 500), x: -150, y: base + i * 60, cor: "#FFF3B0" }; });

    return {
      formatos: formatos,
      centro: centro,
      cabos: cabos,
      notas: notas,
      projeto: function (selecionados) {
        var usar = cabos.filter(function (_, i) { return !selecionados || selecionados[i]; });
        var ids = {}; ids[idCentro] = true;
        usar.forEach(function (c) { ids[c.para] = true; });
        return {
          equipamentos: equipamentos.filter(function (e) { return ids[e.id]; }),
          conexoes: usar.map(function (c) { var o = {}; Object.keys(c).forEach(function (k) { if (k[0] !== "_") o[k] = c[k]; }); return o; }),
          anotacoes: anotacoes
        };
      }
    };
  }

  // Junta um projeto lido num projeto existente: equipamento de mesmo nome é o
  // mesmo (mantém posição e id); cabo que já existe (mesmo equipamento e porta) fica.
  function mesclar(atual, novo) {
    var r = JSON.parse(JSON.stringify(atual || { equipamentos: [], conexoes: [] }));
    r.equipamentos = r.equipamentos || []; r.conexoes = r.conexoes || []; r.anotacoes = r.anotacoes || [];
    var porNome = {}, ids = {}, mapa = {};
    r.equipamentos.forEach(function (e) { porNome[limpar(e.nome).toLowerCase()] = e; ids[e.id] = true; });
    var maxX = r.equipamentos.reduce(function (m, e) { return Math.max(m, e.posicao ? e.posicao.x : 0); }, 0);
    novo.equipamentos.forEach(function (e) {
      var existe = porNome[limpar(e.nome).toLowerCase()];
      if (existe) { mapa[e.id] = existe.id; return; }
      var id = e.id, n = 2;
      while (ids[id]) id = e.id + "-" + (n++);
      ids[id] = true; mapa[e.id] = id;
      var copia = JSON.parse(JSON.stringify(e)); copia.id = id;
      if (r.equipamentos.length && copia.posicao) copia.posicao = { x: copia.posicao.x + maxX + 900, y: copia.posicao.y };
      r.equipamentos.push(copia);
    });
    var tem = {};
    r.conexoes.forEach(function (c) { tem[c.de + "|" + limpar(c.saida).toLowerCase()] = true; tem[c.para + "|" + limpar(c.chegada).toLowerCase()] = true; });
    novo.conexoes.forEach(function (c) {
      var de = mapa[c.de], para = mapa[c.para];
      if (!de || !para || tem[de + "|" + limpar(c.saida).toLowerCase()]) return;
      r.conexoes.push(Object.assign({}, c, { de: de, para: para }));
      tem[de + "|" + limpar(c.saida).toLowerCase()] = true;
    });
    var nAnot = r.anotacoes.length;
    (novo.anotacoes || []).forEach(function (a, i) {
      if (r.anotacoes.some(function (b) { return b.texto === a.texto; })) return;
      r.anotacoes.push(Object.assign({}, a, { id: "leitor-" + (nAnot + i + 1) }));
    });
    return r;
  }

  window.GrafoLeitor = { ler: ler, mesclar: mesclar };

  // ---- Interface ----------------------------------------------------------------
  if (typeof document === "undefined" || !document.getElementById("navJsonCsv")) return;
  var app = window.GrafoApp;
  if (!app) return;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var botao = document.createElement("button");
  botao.className = "nav-item"; botao.type = "button"; botao.id = "btnGerarTexto";
  botao.setAttribute("data-icon", "codigo");
  botao.title = "Cola a tabela de interfaces do Grafana, do NetBox ou a saída do Junos e o Grafo monta o diagrama";
  botao.textContent = "Gerar a partir de texto";
  var ancora = document.querySelector('[data-nav-panel="navJsonCsv"]');
  ancora.parentNode.insertBefore(botao, ancora);

  var fundo = document.createElement("div");
  fundo.className = "paleta-fundo leitor-fundo"; fundo.hidden = true;
  fundo.innerHTML = '<div class="paleta leitor" role="dialog" aria-modal="true" aria-label="Gerar diagrama a partir de texto">' +
    '<div class="folha-topo"><strong>Gerar diagrama a partir de texto</strong><kbd>Esc</kbd></div>' +
    '<div class="leitor-corpo">' +
      '<div class="leitor-passo" data-passo="colar">' +
        '<label>Nome do equipamento destas portas<input type="text" data-leitor-nome maxlength="60" placeholder="ex.: core-l2-pf"></label>' +
        '<label>Texto colado<textarea data-leitor-texto spellcheck="false" placeholder="Cole aqui a tabela de interfaces do Grafana, a do NetBox, ou a saída de show interfaces descriptions / show lldp neighbors. Pode colar mais de uma: o Grafana manda e o NetBox completa."></textarea></label>' +
        '<p class="leitor-ajuda">Porta com descrição "aeN" entra na LAG aeN. Porta que só aparece no NetBox entra tracejada. Nada é aplicado antes da revisão.</p>' +
        '<div class="leitor-acoes"><button type="button" class="primary" data-leitor-ler>Ler texto</button></div>' +
      '</div>' +
      '<div class="leitor-passo" data-passo="revisar" hidden>' +
        '<p class="leitor-resumo" data-leitor-resumo></p>' +
        '<div class="leitor-lista" data-leitor-lista></div>' +
        '<div class="leitor-acoes">' +
          '<button type="button" class="ghost" data-leitor-voltar>Voltar</button>' +
          '<button type="button" class="ghost" data-leitor-mesclar>Mesclar no diagrama aberto</button>' +
          '<button type="button" class="primary" data-leitor-novo>Criar diagrama novo</button>' +
        '</div>' +
      '</div>' +
    '</div></div>';
  document.body.appendChild(fundo);

  var elNome = fundo.querySelector("[data-leitor-nome]"), elTexto = fundo.querySelector("[data-leitor-texto]");
  var passoColar = fundo.querySelector('[data-passo="colar"]'), passoRevisar = fundo.querySelector('[data-passo="revisar"]');
  var leitura = null;

  function abrir() { fundo.hidden = false; passoColar.hidden = false; passoRevisar.hidden = true; elNome.focus(); }
  function fechar() { fundo.hidden = true; }
  botao.addEventListener("click", abrir);
  fundo.addEventListener("click", function (ev) { if (ev.target === fundo) fechar(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !fundo.hidden) fechar(); });

  var NOMES_FORMATO = { grafana: "Grafana", netbox: "NetBox", junos: "show interfaces descriptions", lldp: "show lldp neighbors" };

  fundo.querySelector("[data-leitor-ler]").addEventListener("click", function () {
    if (!limpar(elNome.value)) { app.avisar("Diga o nome do equipamento destas portas."); elNome.focus(); return; }
    leitura = ler(elTexto.value, elNome.value);
    if (!leitura.cabos.length) { app.avisar("Não reconheci nenhuma porta com destino nesse texto."); return; }
    var porViz = {};
    leitura.cabos.forEach(function (c, i) { (porViz[c._vizinho] = porViz[c._vizinho] || []).push(i); });
    var confirmadas = leitura.cabos.filter(function (c) { return c._confirmado; }).length;
    fundo.querySelector("[data-leitor-resumo]").innerHTML = "Lido de: <strong>" + leitura.formatos.map(function (f) { return esc(NOMES_FORMATO[f]); }).join(", ") + "</strong> · " +
      leitura.cabos.length + " cabos para " + Object.keys(porViz).length + " equipamentos · " + confirmadas + " com a porta do outro lado" +
      (leitura.notas.length ? " · " + leitura.notas.length + " notas" : "");
    fundo.querySelector("[data-leitor-lista]").innerHTML = Object.keys(porViz).map(function (nome) {
      return '<div class="leitor-grupo"><strong>' + esc(nome) + '</strong>' + porViz[nome].map(function (i) {
        var c = leitura.cabos[i];
        return '<label class="leitor-cabo' + (c._soNetbox ? " so-netbox" : "") + (c._confirmado ? "" : " sem-ponta") + '"><input type="checkbox" checked data-leitor-cabo="' + i + '">' +
          '<code>' + esc(c.saida) + '</code><span>→</span><code>' + esc(c.chegada) + '</code><em>' + esc(c.tipo) + ' · ' + esc(c.potencia) + '</em></label>';
      }).join("") + '</div>';
    }).join("") + (leitura.notas.length ? '<div class="leitor-grupo leitor-notas"><strong>Notas</strong>' + leitura.notas.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join("") + '</div>' : "");
    passoColar.hidden = true; passoRevisar.hidden = false;
  });
  fundo.querySelector("[data-leitor-voltar]").addEventListener("click", function () { passoColar.hidden = false; passoRevisar.hidden = true; });

  function projetoEscolhido() {
    var sel = {};
    fundo.querySelectorAll("[data-leitor-cabo]").forEach(function (cb) { sel[cb.getAttribute("data-leitor-cabo")] = cb.checked; });
    return leitura.projeto(sel);
  }

  // Criar: passa pelo mesmo caminho de "importar arquivo .json" (validação, nome único, ícones).
  fundo.querySelector("[data-leitor-novo]").addEventListener("click", function () {
    var input = document.getElementById("arquivoProjeto");
    var dados = projetoEscolhido();
    try {
      var dt = new DataTransfer();
      dt.items.add(new File([JSON.stringify(dados)], leitura.centro.replace(/[\\/:*?"<>|]/g, "-") + ".json", { type: "application/json" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      fechar();
    } catch (e) { app.avisar("Não foi possível criar o diagrama neste navegador."); }
  });

  // Mesclar: junta no diagrama aberto e aplica pelo "Aplicar JSON" (validação e desfazer).
  fundo.querySelector("[data-leitor-mesclar]").addEventListener("click", function () {
    var atual = app.dadosProjeto(app.projetoAtual());
    var junto = mesclar(atual, projetoEscolhido());
    document.getElementById("jsonAvancado").value = JSON.stringify(junto, null, 2);
    document.getElementById("btnAplicarJson").click();
    fechar();
  });
})();
