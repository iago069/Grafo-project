// Gerar diagrama a partir de texto colado: tabela de interfaces do Grafana,
// tabela de interfaces do NetBox e saídas do Junos ("show interfaces
// descriptions" e "show lldp neighbors") e a lista de portas em blocos
// (porta / descrição / UP-DOWN, como no Datacom). Sem IA: só reconhece esses formatos.
//
// Regras (as mesmas usadas à mão):
// - porta com descrição "aeN" faz parte da LAG aeN; a descrição da LAG diz o destino;
// - Grafana e "show interfaces" mandam; NetBox e LLDP só completam o vizinho e a
//   porta do outro lado (porta que só existe no NetBox entra tracejada);
// - porta sem descrição e sem vizinho vira nota, não equipamento.
(function () {
  "use strict";

  var IMG = "./assets/images/equipamentos/";
  var RE_PORTA = /^((?:xe|et|ge|mge|xle|fte)-\d+\/\d+\/\d+(?::\d+)?|ae\d+|lag-?\d+|(?:(?:hundred|forty|twenty-five|ten)-)?gigabit-ethernet-\d+(?:\/\d+)+)$/i;
  var RE_LAG = /^(ae\d+|lag-?\d+)$/i;
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
    if (/^hundred-gigabit/.test(p)) return "100G";
    if (/^forty-gigabit/.test(p)) return "40G";
    if (/^twenty-five-gigabit/.test(p)) return "25G";
    if (/^ten-gigabit|^tengig|^xgig|^te\d|^xe\d/.test(p)) return "10G";
    if (/^gigabit|^gi\d|^ge\d/.test(p)) return "1G";
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
      // Depois do tipo: a coluna da LAG ("LAG-1", "ae7") e a descrição.
      var desc = "", lagCol = "";
      for (var c = iTipo + 1; c < (iCabo < 0 ? campos.length : iCabo); c++) {
        if (vazio(campos[c])) continue;
        if (!lagCol && !desc && RE_LAG.test(campos[c]) && c + 1 < campos.length) { lagCol = campos[c]; continue; }
        desc = campos[c]; break;
      }
      var reg = { porta: campos[0], velocidade: "", lag: lagCol.toLowerCase(), desc: desc, fonte: "netbox" };
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

  // Lista em blocos (Datacom e parecidos), uma informação por linha:
  //   ten-gigabit-ethernet-1/1/2 / OLT34_XE0/0 / UP
  // A descrição diz o vizinho e a porta dele: "ENLACE_POP-SXH03_DISTR-51_XE2" →
  // POP-SXH03_DISTR-51, porta XE2; "UPLINK_CORE_TPR_06_XE_0_0_34" → CORE_TPR_06, xe-0/0/34.
  // "Sem alias", ou porta DOWN, vira nota (não inventa equipamento de enlace parado).
  var RE_PORTA_BLOCO = /^((?:hundred|forty|twenty-five|ten)-)?gigabit-ethernet[-\s]?\d+(?:\/\d+)+$|^(?:tengigabitethernet|gigabitethernet|xgigabitethernet|ethernet|eth|gi|te|xe|ge)[-\s]?\d+(?:\/\d+)+$/i;
  function vizinhoDaDescricao(desc) {
    var d = limpar(desc).replace(/^(?:enlace|uplink|downlink|link|router)[_\s-]+/i, "");
    var m = /^(.+?)[_\s-]+((?:xe|ge|et|te|eth|gi|tge|hge|sfp|pon)(?:[-_]?\d+)(?:[\/_]\d+)*)$/i.exec(d);
    if (!m) return { vizinho: d };
    var porta = m[2];
    var partes = /^([a-z]+)[-_]?(\d+(?:[\/_]\d+)*)$/i.exec(porta);
    if (partes && partes[2].indexOf("_") >= 0) porta = partes[1].toLowerCase() + "-" + partes[2].replace(/_/g, "/");
    return { vizinho: m[1], portaVizinho: porta };
  }
  function lerBlocos(linhas) {
    var regs = [];
    var l = linhas.map(limpar).filter(Boolean);
    for (var i = 0; i < l.length; i++) {
      if (!RE_PORTA_BLOCO.test(l[i])) continue;
      var desc = "", status = "";
      var j = i + 1;
      if (l[j] && !/^(up|down)$/i.test(l[j]) && !RE_PORTA_BLOCO.test(l[j])) { desc = l[j]; j++; }
      if (l[j] && /^(up|down)$/i.test(l[j])) status = l[j].toLowerCase() === "down" ? "offline" : "online";
      var reg = { porta: l[i], velocidade: "", lag: "", desc: "", fonte: "blocos", status: status || "online" };
      if (desc && !/^sem\s+(alias|descri)/i.test(desc)) {
        if (reg.status === "offline") reg.notaDesc = desc;
        else { var v = vizinhoDaDescricao(desc); reg.desc = desc; reg.vizinho = v.vizinho; reg.vizinhoPalpite = true; if (v.portaVizinho) reg.portaVizinho = v.portaVizinho; }
      }
      regs.push(reg);
    }
    return regs;
  }

  // Lista com seta, uma porta por linha (a que o próprio Grafo/Claude escreve):
  //   XE1/1/1   UP    → POP-SXH03_DISTR-51   XE1/1/2
  //   XE1/1/12  UP    → core-tpr-06          xe-0/0/34   (LAG-1)
  //   XE1/1/16  DOWN  sem alias
  function lerSetas(linhas) {
    var regs = [];
    linhas.forEach(function (bruta) {
      var l = limpar(bruta);
      var m = /^(\S+)\s+(?:(up|down)\s+)?(?:→|->|=>)\s*(\S+)(?:\s+(\S+))?(?:\s+\((lag[-\s]?\d+|ae\d+)\))?\s*$/i.exec(l);
      if (m) {
        var reg = { porta: m[1], velocidade: "", lag: m[5] ? m[5].replace(/\s+/, "-").toLowerCase() : "", desc: "", fonte: "setas", status: /down/i.test(m[2] || "") ? "offline" : "online", vizinho: m[3] };
        if (m[4]) reg.portaVizinho = m[4];
        regs.push(reg);
        return;
      }
      var d = /^(\S+)\s+(up|down)\s+(.*)$/i.exec(l);
      if (d && /\d/.test(d[1]) && /\//.test(d[1])) {
        var resto = limpar(d[3]);
        var r2 = { porta: d[1], velocidade: "", lag: "", desc: "", fonte: "setas", status: /down/i.test(d[2]) ? "offline" : "online" };
        if (resto && !/^sem\s+(alias|descri)/i.test(resto)) r2.notaDesc = resto;
        regs.push(r2);
      }
    });
    return regs;
  }

  // Nome curto da porta no diagrama: "ten-gigabit-ethernet-1/1/1" → "XE1/1/1",
  // "10giga-ethernet0/0" → "XE0/0", "gigabit-ethernet-1/1/1" → "GE1/1/1".
  function portaCurta(porta) {
    var t = limpar(porta);
    var m = /^(?:ten-gigabit-ethernet|10giga-ethernet|tengigabitethernet)[-\s]?(\d+(?:\/\d+)*)$/i.exec(t);
    if (m) return "XE" + m[1];
    m = /^(?:gigabit-ethernet|gigabitethernet)[-\s]?(\d+(?:\/\d+)*)$/i.exec(t);
    if (m) return "GE" + m[1];
    return t;
  }

  // ---- Juntar e montar o projeto ----------------------------------------------

  function juntar(regs) {
    var porPorta = {}, ordem = [];
    var peso = { grafana: 3, junos: 3, blocos: 3, setas: 3, ia: 2, netbox: 1, lldp: 1 };
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
      if (r.vizinho && (!atual.vizinho || r.fonte === "lldp" || (atual.vizinhoPalpite && !r.vizinhoPalpite))) {
        atual.vizinho = r.vizinho; atual.portaVizinho = r.portaVizinho || atual.portaVizinho; atual.vizinhoPalpite = !!r.vizinhoPalpite;
      }
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

  // Portas lidas de uma imagem pela IA (api/ler-imagem.js), no formato do leitor.
  function registrosDaImagem(lista) {
    return (lista || []).map(function (x) {
      return { porta: limpar(x.porta), velocidade: limpar(x.velocidade).toUpperCase(), desc: limpar(x.descricao), lag: limpar(x.lag).toLowerCase(),
        vizinho: limpar(x.vizinho), portaVizinho: limpar(x.portaVizinho), status: x.status === "offline" ? "offline" : "online", fonte: "ia" };
    }).filter(function (x) { return x.porta && !/\.\d+$/.test(x.porta); })
      .map(function (x) { ["vizinho", "portaVizinho", "lag", "velocidade"].forEach(function (k) { if (!x[k]) delete x[k]; }); return x; });
  }

  // Lê o texto (e, se houver, as portas lidas da imagem) e devolve
  // { projeto, cabos (para a revisão), notas, formatos }.
  function ler(texto, nomeCentro, portasDaImagem) {
    var linhas = String(texto || "").replace(/\r/g, "").split("\n");
    var lidos = { grafana: lerGrafana(linhas), netbox: lerNetbox(linhas), junos: lerDescricoes(linhas), lldp: lerLldp(linhas), blocos: lerBlocos(linhas), setas: lerSetas(linhas), ia: registrosDaImagem(portasDaImagem) };
    var formatos = Object.keys(lidos).filter(function (k) { return lidos[k].length; });
    var portas = juntar([].concat(lidos.grafana, lidos.junos, lidos.blocos, lidos.setas, lidos.ia, lidos.netbox, lidos.lldp));
    var temPrincipal = lidos.grafana.length + lidos.junos.length + lidos.blocos.length + lidos.setas.length + lidos.ia.length > 0;

    // LAGs: membro tem descrição "aeN"; a descrição da LAG diz o destino.
    var lags = {};
    portas.forEach(function (p) { if (RE_LAG.test(p.porta)) lags[p.porta.toLowerCase()] = p; });
    portas.forEach(function (p) {
      if (RE_LAG.test(p.porta)) return;
      if (RE_LAG.test(p.desc || "")) { p.lag = p.desc.toLowerCase(); p.desc = ""; }
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
      if (RE_LAG.test(p.porta)) return;
      var lag = p.lag ? lags[p.lag.toLowerCase()] : null;
      var descDestino = (lag && lag.desc) || p.desc || "";
      var nomeViz = p.vizinho || (lag && lag.vizinho) || descDestino;
      var soNetbox = temPrincipal && p.fontes.indexOf("grafana") < 0 && p.fontes.indexOf("junos") < 0 && p.fontes.indexOf("blocos") < 0 && p.fontes.indexOf("setas") < 0 && p.fontes.indexOf("ia") < 0;
      if (p.notaDesc && !p.vizinho) { notas.push(portaCurta(p.porta) + ": " + p.notaDesc + " (DOWN)"); return; }
      if (!nomeViz) {
        if (lag) (semDestinoPorLag[lag.porta] = semDestinoPorLag[lag.porta] || []).push(portaCurta(p.porta));
        else notas.push(portaCurta(p.porta) + ": " + (p.status === "offline" ? "offline" : "online") + ", sem descrição e sem vizinho");
        return;
      }
      var v = vizinhoPara(nomeViz);
      var velocidade = p.velocidade || velocidadePorNome(p.porta);
      var rotulo = lag ? "LAG " + lag.porta + (descDestino ? " (" + descDestino + ")" : "") : (descDestino || "Enlace");
      cabos.push({
        de: idCentro, para: v.id, saida: portaCurta(p.porta), chegada: p.portaVizinho ? portaCurta(p.portaVizinho) : "?",
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

  // Compara o que foi lido com o diagrama aberto, pelas portas do equipamento
  // central (mesmo nome). Retorna { achou, iguais, diferentes, faltam, sobram }.
  function comparar(leitura, atual) {
    var res = { achou: false, iguais: [], diferentes: [], faltam: [], sobram: [] };
    var nomeDe = {}, centro = null;
    (atual.equipamentos || []).forEach(function (e) { nomeDe[e.id] = e.nome; if (limpar(e.nome).toLowerCase() === limpar(leitura.centro).toLowerCase()) centro = e; });
    if (!centro) return res;
    res.achou = true;
    var doCentro = {};
    (atual.conexoes || []).forEach(function (c) {
      if (c.de === centro.id && limpar(c.saida)) doCentro[limpar(c.saida).toLowerCase()] = { destino: nomeDe[c.para], porta: limpar(c.chegada) };
      else if (c.para === centro.id && limpar(c.chegada)) doCentro[limpar(c.chegada).toLowerCase()] = { destino: nomeDe[c.de], porta: limpar(c.saida) };
    });
    var vistos = {};
    leitura.cabos.forEach(function (c) {
      var k = limpar(c.saida).toLowerCase();
      vistos[k] = true;
      var noDiagrama = doCentro[k];
      var lido = { porta: c.saida, destino: c._vizinho, portaDestino: c.chegada };
      if (!noDiagrama) { res.faltam.push(lido); return; }
      var mesmoDestino = limpar(noDiagrama.destino).toLowerCase() === limpar(c._vizinho).toLowerCase();
      var mesmaPorta = c.chegada === "?" || !noDiagrama.porta || noDiagrama.porta === "?" || noDiagrama.porta.toLowerCase() === c.chegada.toLowerCase();
      if (mesmaPorta && (mesmoDestino || !c._confirmado)) res.iguais.push(lido);
      else res.diferentes.push(Object.assign(lido, { noDiagrama: noDiagrama }));
    });
    Object.keys(doCentro).forEach(function (k) { if (!vistos[k]) res.sobram.push({ porta: k, destino: doCentro[k].destino, portaDestino: doCentro[k].porta }); });
    return res;
  }

  window.GrafoLeitor = { ler: ler, mesclar: mesclar, comparar: comparar };

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
        '<div class="leitor-foto" data-leitor-foto tabindex="0" role="button" aria-label="Escolher foto ou print">' +
          '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-leitor-arquivo hidden>' +
          '<img data-leitor-previa alt="" hidden><span data-leitor-foto-texto><strong>Foto ou print (opcional)</strong> Clique para escolher, arraste aqui ou cole com Ctrl+V. É lido com IA.</span>' +
          '<button type="button" class="ghost small" data-leitor-tirar hidden>Tirar imagem</button></div>' +
        '<label>Texto colado<textarea data-leitor-texto spellcheck="false" placeholder="Cole aqui a tabela de interfaces do Grafana, a do NetBox, ou a saída de show interfaces descriptions / show lldp neighbors. Pode colar mais de uma: o Grafana manda e o NetBox completa."></textarea></label>' +
        '<p class="leitor-ajuda">Porta com descrição "aeN" entra na LAG aeN. Porta que só aparece no NetBox entra tracejada. Nada é aplicado antes da revisão.</p>' +
        '<div class="leitor-acoes"><button type="button" class="primary" data-leitor-ler>Ler texto</button></div>' +
      '</div>' +
      '<div class="leitor-passo" data-passo="revisar" hidden>' +
        '<p class="leitor-resumo" data-leitor-resumo></p>' +
        '<div class="leitor-comparacao" data-leitor-comparacao hidden></div>' +
        '<div class="leitor-lista" data-leitor-lista></div>' +
        '<div class="leitor-acoes">' +
          '<button type="button" class="ghost" data-leitor-voltar>Voltar</button>' +
          '<button type="button" class="ghost" data-leitor-comparar title="Mostra o que está diferente entre o texto e o diagrama aberto">Comparar com o diagrama aberto</button>' +
          '<button type="button" class="ghost" data-leitor-mesclar>Mesclar no diagrama aberto</button>' +
          '<label class="opcao-check leitor-mapa"><input type="checkbox" data-leitor-mapa checked> Montar sobre o mapa das cidades (IBGE)</label>' +
          '<button type="button" class="primary" data-leitor-novo>Criar diagrama novo</button>' +
        '</div>' +
      '</div>' +
    '</div></div>';
  document.body.appendChild(fundo);

  var elNome = fundo.querySelector("[data-leitor-nome]"), elTexto = fundo.querySelector("[data-leitor-texto]");
  var passoColar = fundo.querySelector('[data-passo="colar"]'), passoRevisar = fundo.querySelector('[data-passo="revisar"]');
  var leitura = null;

  function abrir() { fundo.hidden = false; passoColar.hidden = false; passoRevisar.hidden = true; elNome.focus(); }
  // Texto colado direto no diagrama (13-cadastro-automatico.js): abre já com o texto.
  window.GrafoLeitor.abrirComTexto = function (texto) { abrir(); elTexto.value = texto; elNome.focus(); };
  function fechar() { fundo.hidden = true; }
  botao.addEventListener("click", abrir);
  fundo.addEventListener("click", function (ev) { if (ev.target === fundo) fechar(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !fundo.hidden) fechar(); });

  var NOMES_FORMATO = { grafana: "Grafana", netbox: "NetBox", junos: "show interfaces descriptions", blocos: "lista de portas (porta / descrição / status)", setas: "lista porta → vizinho", lldp: "show lldp neighbors", ia: "imagem (lida com IA)" };

  // ---- Imagem (lida no servidor com IA) ----
  var imagem = null; // { tipo, base64, url }
  var elFoto = fundo.querySelector("[data-leitor-foto]"), elArquivo = fundo.querySelector("[data-leitor-arquivo]");
  var elPrevia = fundo.querySelector("[data-leitor-previa]"), elTirar = fundo.querySelector("[data-leitor-tirar]"), elFotoTexto = fundo.querySelector("[data-leitor-foto-texto]");

  // Reduz para no máximo 1800 px e JPEG: cabe no envio e lê bem.
  function prepararImagem(arquivo) {
    return new Promise(function (resolve, reject) {
      if (!arquivo || !/^image\//.test(arquivo.type)) { reject(new Error("Escolha uma imagem.")); return; }
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = function () {
        var escala = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * escala); c.height = Math.round(img.naturalHeight * escala);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL("image/jpeg", 0.88);
        URL.revokeObjectURL(url);
        resolve({ tipo: "image/jpeg", base64: dataUrl.split(",")[1], url: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Não deu para abrir a imagem.")); };
      img.src = url;
    });
  }
  function usarArquivo(arquivo) {
    prepararImagem(arquivo).then(function (pronta) {
      imagem = pronta;
      elPrevia.src = pronta.url; elPrevia.hidden = false; elTirar.hidden = false; elFotoTexto.hidden = true;
      elFoto.classList.add("com-imagem");
    }).catch(function (e) { app.avisar(e.message); });
  }
  function tirarImagem() {
    imagem = null; elPrevia.hidden = true; elPrevia.removeAttribute("src"); elTirar.hidden = true; elFotoTexto.hidden = false; elArquivo.value = "";
    elFoto.classList.remove("com-imagem");
  }
  elFoto.addEventListener("click", function (ev) { if (ev.target !== elTirar) elArquivo.click(); });
  elFoto.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); elArquivo.click(); } });
  elTirar.addEventListener("click", function (ev) { ev.stopPropagation(); tirarImagem(); });
  elArquivo.addEventListener("change", function () { if (elArquivo.files[0]) usarArquivo(elArquivo.files[0]); });
  elFoto.addEventListener("dragover", function (ev) { ev.preventDefault(); elFoto.classList.add("recebendo"); });
  elFoto.addEventListener("dragleave", function () { elFoto.classList.remove("recebendo"); });
  elFoto.addEventListener("drop", function (ev) { ev.preventDefault(); elFoto.classList.remove("recebendo"); if (ev.dataTransfer.files[0]) usarArquivo(ev.dataTransfer.files[0]); });
  fundo.addEventListener("paste", function (ev) {
    var itens = (ev.clipboardData && ev.clipboardData.items) || [];
    for (var i = 0; i < itens.length; i++) if (itens[i].type && itens[i].type.indexOf("image/") === 0) { ev.preventDefault(); usarArquivo(itens[i].getAsFile()); return; }
  });

  async function lerImagemComIa() {
    var auth = window.GrafoAuth;
    if (!auth || !auth.logado || !auth.logado()) { if (auth && auth.pedirLogin) auth.pedirLogin("ler imagens com IA"); throw new Error("Entre na sua conta para ler imagens."); }
    var sessao = await auth.client().auth.getSession();
    var token = sessao && sessao.data && sessao.data.session && sessao.data.session.access_token;
    var r = await fetch("/api/ler-imagem", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token || "") },
      body: JSON.stringify({ imagem: imagem.base64, tipo: imagem.tipo, nome: elNome.value, texto: elTexto.value })
    });
    var dados = {};
    try { dados = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(dados.error || "Não foi possível ler a imagem.");
    return dados;
  }

  var botaoLer = fundo.querySelector("[data-leitor-ler]");
  botaoLer.addEventListener("click", async function () {
    if (!limpar(elNome.value)) { app.avisar("Diga o nome do equipamento destas portas."); elNome.focus(); return; }
    var daImagem = null;
    if (imagem) {
      botaoLer.disabled = true;
      var textoBotao = botaoLer.textContent;
      botaoLer.textContent = "Lendo a imagem com IA...";
      try { daImagem = await lerImagemComIa(); }
      catch (e) { app.avisar(e.message); return; }
      finally { botaoLer.disabled = false; botaoLer.textContent = textoBotao; }
    }
    leitura = ler(elTexto.value, elNome.value, daImagem && daImagem.portas);
    if (daImagem && daImagem.notas) daImagem.notas.forEach(function (n) { if (limpar(n)) leitura.notas.push("IA: " + limpar(n)); });
    if (!leitura.cabos.length) { app.avisar(imagem ? "Não achei nenhuma porta com destino na imagem." : "Não reconheci nenhuma porta com destino nesse texto."); return; }
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
  fundo.querySelector("[data-leitor-voltar]").addEventListener("click", function () { passoColar.hidden = false; passoRevisar.hidden = true; fundo.querySelector("[data-leitor-comparacao]").hidden = true; });

  fundo.querySelector("[data-leitor-comparar]").addEventListener("click", function () {
    var caixa = fundo.querySelector("[data-leitor-comparacao]");
    var res = comparar(leitura, app.dadosProjeto(app.projetoAtual()) || {});
    caixa.hidden = false;
    if (!res.achou) { caixa.innerHTML = '<p>O diagrama aberto não tem um equipamento chamado <strong>' + esc(leitura.centro) + '</strong>. Use o mesmo nome para comparar.</p>'; return; }
    function linha(x, extra) { return '<li><code>' + esc(x.porta) + '</code> → ' + esc(x.destino || "?") + (x.portaDestino ? ' <code>' + esc(x.portaDestino) + '</code>' : "") + (extra || "") + "</li>"; }
    function bloco(classe, titulo, lista, fn) { return lista.length ? '<div class="cmp ' + classe + '"><strong>' + titulo + " (" + lista.length + ")</strong><ul>" + lista.map(fn).join("") + "</ul></div>" : ""; }
    caixa.innerHTML = '<p class="cmp-resumo">' + res.iguais.length + " iguais · " + res.diferentes.length + " diferentes · " + res.faltam.length + " faltam no diagrama · " + res.sobram.length + " só no diagrama</p>" +
      bloco("cmp-dif", "Diferentes", res.diferentes, function (x) { return linha(x, ' <em>no diagrama: ' + esc(x.noDiagrama.destino || "?") + (x.noDiagrama.porta ? " " + esc(x.noDiagrama.porta) : "") + "</em>"); }) +
      bloco("cmp-falta", "Faltam no diagrama", res.faltam, function (x) { return linha(x); }) +
      bloco("cmp-sobra", "Só no diagrama (não aparecem no texto)", res.sobram, function (x) { return linha(x); }) +
      (res.diferentes.length + res.faltam.length + res.sobram.length ? '<p class="cmp-dica">“Mesclar no diagrama aberto” acrescenta o que falta; o que está diferente você corrige no editor do cabo.</p>' : '<p class="cmp-ok">Tudo confere com o diagrama.</p>');
  });

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
      // As siglas dos POPs dizem as cidades: monta o diagrama sobre o mapa delas.
      var comMapa = fundo.querySelector("[data-leitor-mapa]");
      if (comMapa && comMapa.checked && window.GrafoMapa) window.GrafoMapa.montarDepoisDeCriar();
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
