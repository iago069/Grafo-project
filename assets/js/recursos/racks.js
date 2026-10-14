/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Bayface de Racks: disposição FÍSICA dos equipamentos nos racks (U ocupadas e
// livres, frente e traseira, portas e cabos físicos). Não é topologia lógica:
// IP, VLAN e rotas continuam no diagrama.
// Dados: projeto.racks e projeto.cabosRack, gravados pelo editor (GrafoApp.salvarRacks),
// que valida com as regras do esquema (limites do rack e sobreposição) e salva
// como o resto do projeto: navegador, nuvem, histórico, desfazer e equipes.
(function () {
  "use strict";

  var app = window.GrafoApp;
  var E = window.GrafoEsquema;
  var raiz = document.getElementById("racksApp");
  if (!app || !app.salvarRacks || !E || !E.CATEGORIAS_RACK || !raiz) return;

  var CATEGORIAS = {};
  E.CATEGORIAS_RACK.forEach(function (c) { CATEGORIAS[c.valor] = c; });
  // Cor de fundo por categoria (discreta). A categoria também aparece em texto (sigla).
  var CORES = {
    servidor: "#3B4A5A", switch: "#2F5D8A", roteador: "#2E6E5E", olt: "#5B4B8A", dio: "#7A6A3A", patch: "#4A5560",
    organizador: "#2B2F33", bandeja: "#6B7177", "bandeja-deslizante": "#6B7177", pdu: "#8A3B3B", nobreak: "#3E4A3A",
    dwdm: "#285E73", telecom: "#55606B", storage: "#46506E", firewall: "#8A4B2E", cego: "#1F2328", personalizado: "#4D5966"
  };
  var CORES_CABO = { rede: "#2F80ED", fibra: "#F2C94C", cordao: "#F2994A", energia: "#D64545", outro: "#8E44AD" };
  var NOMES_CABO = { rede: "Cabo de rede", fibra: "Fibra óptica", cordao: "Cordão óptico", energia: "Energia", outro: "Outro" };
  var NOMES_STATUS = { planejado: "Planejado", montagem: "Em montagem", instalado: "Instalado", desativado: "Desativado" };
  var NOMES_ESTADO = { instalado: "Instalado", planejado: "Planejado", remover: "A remover" };
  var NOMES_FACE = { ambas: "Profundidade total", frente: "Só frente", tras: "Só traseira" };
  var ALTURAS_COMUNS = [12, 24, 36, 42, 44, 45, 48];

  var dados = { racks: [], cabos: [] };
  // Equipamento recém-instalado ou movido: chega com destaque no próximo desenho.
  var destaque = null, timerDestaque = null;
  function destacar(id) { destaque = id; clearTimeout(timerDestaque); timerDestaque = setTimeout(function () { destaque = null; }, 1500); }
  var sel = { rack: null, item: null, u: null };
  var vista = { face: "frente", inverter: false, zoom: 1, cabos: "todos", busca: "", fotos: true, nomes: false };
  try { Object.assign(vista, JSON.parse(localStorage.getItem("grafo-racks-vista") || "{}"), { busca: "" }); } catch (e) {}
  function guardarVista() { try { localStorage.setItem("grafo-racks-vista", JSON.stringify({ face: vista.face, inverter: vista.inverter, zoom: vista.zoom, cabos: vista.cabos, fotos: vista.fotos, nomes: vista.nomes })); } catch (e) {} }

  // ---- utilidades ------------------------------------------------------------
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function novoId(prefixo) { return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clonar(v) { return JSON.parse(JSON.stringify(v)); }
  function rackAtual() { return dados.racks.find(function (r) { return r.id === sel.rack; }) || null; }
  function itemPorId(id) {
    for (var i = 0; i < dados.racks.length; i++) {
      var it = (dados.racks[i].itens || []).find(function (x) { return x.id === id; });
      if (it) return { item: it, rack: dados.racks[i] };
    }
    return null;
  }
  function nomePorta(item, n) { return (item.prefixoPorta || "") + n; }
  function faixaU(it) { return it.alturaU > 1 ? "U" + it.u + "–U" + (it.u + it.alturaU - 1) : "U" + it.u; }
  function faixaUTexto(it) { return it.alturaU > 1 ? "U" + it.u + "-U" + (it.u + it.alturaU - 1) : "U" + it.u; }
  function visivelNaFace(it) { return vista.face === "frente" ? it.face !== "tras" : it.face !== "frente"; }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function nomeArquivo(base, ext) { return (String(base).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rack") + "-" + hoje() + "." + ext; }
  function livresDoRack(rack) {
    var oc = E.ocupacaoRack(rack), faixas = [], inicio = null;
    for (var u = 1; u <= rack.alturaU + 1; u++) {
      var livre = u <= rack.alturaU && !oc.porU[u].length;
      if (livre && inicio === null) inicio = u;
      if (!livre && inicio !== null) { faixas.push(inicio === u - 1 ? "U" + inicio : "U" + inicio + "-U" + (u - 1)); inicio = null; }
    }
    return { faixas: faixas, oc: oc };
  }
  function cabosDoItem(id) { return dados.cabos.filter(function (c) { return c.deItem === id || c.paraItem === id; }); }
  function portaOcupada(itemId, porta, ignorarCabo) {
    return dados.cabos.some(function (c) { return c.id !== ignorarCabo && ((c.deItem === itemId && c.dePorta === porta) || (c.paraItem === itemId && c.paraPorta === porta)); });
  }
  function confere(texto) { return !vista.busca || String(texto || "").toLowerCase().indexOf(vista.busca.toLowerCase()) >= 0; }
  function itemConfere(it) { return vista.busca && [it.nome, it.modelo, it.fabricante, it.patrimonio, (CATEGORIAS[it.categoria] || {}).rotulo].some(confere); }

  // ---- gravar (sempre pelo editor: valida, salva e entra no desfazer) ----------
  function gravar(racks, cabos, sucesso) {
    var r = app.salvarRacks(racks, cabos);
    if (!r.ok) {
      mensagem((r.erros || []).map(function (e) { return e.onde + ": " + e.mensagem; }).join(" · ") || "Não foi possível salvar.", true);
      render();
      return false;
    }
    if (sucesso) mensagem(sucesso);
    return true;
  }
  function comRack(id, fn) {
    var racks = clonar(dados.racks);
    var rack = racks.find(function (r) { return r.id === id; });
    if (!rack) return null;
    return fn(rack, racks);
  }

  var elMsg = null, timerMsg = null;
  function mensagem(texto, erro) {
    if (!elMsg) return;
    elMsg.textContent = texto;
    elMsg.className = "rk-msg" + (erro ? " erro" : " ok");
    elMsg.hidden = !texto;
    clearTimeout(timerMsg);
    if (!erro && texto) timerMsg = setTimeout(function () { elMsg.hidden = true; }, 4000);
  }

  // ---- desenho do rack (SVG; o mesmo para a tela e a exportação) ---------------
  var TRILHO = 30, LARGURA_19 = 380, BORDA = 16;
  function desenharRack(rack, opcoes) {
    opcoes = opcoes || {};
    var UH = Math.round(20 * (opcoes.zoom || 1) * 10) / 10;
    var face = opcoes.face || "frente";
    var inverter = !!opcoes.inverter;
    var exportar = !!opcoes.exportar;
    var MARGEM_NOMES = opcoes.nomesAoLado ? 200 : 0;
    var x0 = (opcoes.x || 0) + MARGEM_NOMES, y0 = opcoes.y || 0;
    var larguraRack = TRILHO * 2 + LARGURA_19;
    var altura = BORDA * 2 + UH * rack.alturaU;
    var canal = larguraRack + 10;   // cabos que voltam pela lateral direita
    var larguraTotal = larguraRack + (opcoes.semCanal ? 0 : 150) + MARGEM_NOMES;
    var alturaDesenho = altura;
    function topoU(u) { return y0 + BORDA + (inverter ? (u - 1) : (rack.alturaU - u)) * UH; }
    function topoItem(it) { return inverter ? topoU(it.u) : topoU(it.u + it.alturaU - 1); }
    var xi = x0 + TRILHO, wi = LARGURA_19;
    var p = [];
    p.push('<g class="rk-rack" font-family="Helvetica, Arial, sans-serif">');
    // Estrutura: laterais (trilhos) e topo/base.
    p.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + larguraRack + '" height="' + altura + '" rx="4" fill="#2B2F36" stroke="#1A1D22"/>');
    p.push('<rect class="rk-interior" x="' + xi + '" y="' + (y0 + BORDA) + '" width="' + wi + '" height="' + (UH * rack.alturaU) + '" fill="#E9EDF1"/>');
    // Unidades: numeração dos dois lados e linhas guia.
    var oc = E.ocupacaoRack(rack);
    for (var u = 1; u <= rack.alturaU; u++) {
      var y = topoU(u);
      var ocupadaAqui = oc.porU[u].some(function (it) { return face === "frente" ? it.face !== "tras" : it.face !== "frente"; });
      var fonte = Math.max(7, Math.min(10, UH * 0.48));
      p.push('<text x="' + (x0 + TRILHO / 2) + '" y="' + (y + UH / 2 + fonte * 0.35) + '" font-size="' + fonte + '" fill="#C9D1D9" text-anchor="middle">' + u + '</text>');
      p.push('<text x="' + (x0 + TRILHO + wi + TRILHO / 2) + '" y="' + (y + UH / 2 + fonte * 0.35) + '" font-size="' + fonte + '" fill="#C9D1D9" text-anchor="middle">' + u + '</text>');
      // Furos dos trilhos (3 por U).
      for (var f = 0; f < 3; f++) {
        var yf = y + UH * (0.2 + f * 0.3);
        p.push('<rect x="' + (x0 + TRILHO - 7) + '" y="' + (yf - 1.5) + '" width="4" height="3" fill="#5A626C"/><rect x="' + (xi + wi + 3) + '" y="' + (yf - 1.5) + '" width="4" height="3" fill="#5A626C"/>');
      }
      if (!ocupadaAqui) {
        p.push('<rect class="rk-u-livre' + (sel.u === u && !exportar && sel.rack === rack.id ? " rk-u-sel" : "") + '" data-u="' + u + '" x="' + (xi + 1) + '" y="' + (y + 1) + '" width="' + (wi - 2) + '" height="' + (UH - 2) + '" fill="' + (sel.u === u && !exportar && sel.rack === rack.id ? "#CDE8D6" : "#F6F8FA") + '" stroke="#C8D0D8" stroke-dasharray="3 3"/>');
      }
    }
    // Os cabos entram aqui (antes dos itens), para passarem por baixo dos
    // equipamentos e aparecerem saindo pela lateral, sem cruzar as outras portas.
    var posicaoDosCabos = p.length;
    // Itens da face pedida; os da outra face aparecem só como contorno (ocupação).
    var portasPos = {}, nomesLado = [];
    (rack.itens || []).slice().sort(function (a, b) { return a.u - b.u; }).forEach(function (it) {
      var cat = CATEGORIAS[it.categoria] || CATEGORIAS.personalizado;
      var y = topoItem(it), h = it.alturaU * UH;
      var visivel = face === "frente" ? it.face !== "tras" : it.face !== "frente";
      var selecionado = !exportar && sel.item === it.id;
      var destaque = !exportar && itemConfere(it);
      if (!visivel) {
        p.push('<g class="rk-item rk-item-outra-face" data-item="' + esc(it.id) + '"><rect x="' + (xi + 2) + '" y="' + (y + 1) + '" width="' + (wi - 4) + '" height="' + (h - 2) + '" fill="url(#rk-hachura)" stroke="#8A949E" stroke-dasharray="4 3"/>' +
          '<text x="' + (xi + wi / 2) + '" y="' + (y + h / 2 + 3.5) + '" font-size="9" fill="#5A626C" text-anchor="middle">' + esc((face === "frente" ? "Atrás: " : "Na frente: ") + it.nome) + '</text></g>');
        return;
      }
      nomesLado.push({ y: y + h / 2, texto: it.nome });
      var fundo = it.cor || CORES[it.categoria] || CORES.personalizado;
      var tracejado = it.estado === "planejado" ? ' stroke-dasharray="6 3"' : "";
      p.push('<g class="rk-item' + (!exportar && destaque === it.id ? " rk-novo" : "") + '" data-item="' + esc(it.id) + '">');
      p.push('<title>' + esc(it.nome + " · " + cat.rotulo + " · " + faixaUTexto(it) + (it.modelo ? " · " + it.modelo : "")) + '</title>');
      p.push('<rect class="rk-item-corpo" x="' + (xi + 1) + '" y="' + (y + 0.5) + '" width="' + (wi - 2) + '" height="' + (h - 1) + '" rx="2" fill="' + fundo + '" stroke="' + (selecionado ? "#E8A33D" : destaque ? "#F2C94C" : "#14171B") + '" stroke-width="' + (selecionado || destaque ? 2.5 : 1) + '"' + tracejado + '/>');
      // Orelhas de fixação.
      p.push('<rect x="' + (xi - 6) + '" y="' + (y + 1.5) + '" width="7" height="' + (h - 3) + '" fill="#9AA3AD"/><rect x="' + (xi + wi - 1) + '" y="' + (y + 1.5) + '" width="7" height="' + (h - 3) + '" fill="#9AA3AD"/>');
      // Foto real do painel frontal (opcional): cobre o corpo, com a borda por cima.
      var comFoto = !!it.foto && opcoes.fotos !== false;
      if (comFoto) {
        var idClip = "rkf-" + String(it.id).replace(/[^a-zA-Z0-9_-]/g, "") + (exportar ? "-x" : "");
        p.push('<clipPath id="' + idClip + '"><rect x="' + (xi + 1) + '" y="' + (y + 0.5) + '" width="' + (wi - 2) + '" height="' + (h - 1) + '" rx="2"/></clipPath>');
        p.push('<image class="rk-foto" href="' + esc(it.foto) + '" x="' + (xi + 1) + '" y="' + (y + 0.5) + '" width="' + (wi - 2) + '" height="' + (h - 1) + '" preserveAspectRatio="none" clip-path="url(#' + idClip + ')"/>');
        p.push('<rect x="' + (xi + 1) + '" y="' + (y + 0.5) + '" width="' + (wi - 2) + '" height="' + (h - 1) + '" rx="2" fill="none" stroke="' + (selecionado ? "#E8A33D" : destaque ? "#F2C94C" : "#14171B") + '" stroke-width="' + (selecionado || destaque ? 2.5 : 1) + '"' + tracejado + '/>');
      }
      // Sigla da categoria (identificação sem depender da cor).
      var fs = Math.max(7, Math.min(11, UH * 0.5));
      var larguraSigla = cat.sigla.length * fs * 0.62 + 8;
      p.push('<rect x="' + (xi + 6) + '" y="' + (y + h / 2 - fs * 0.75) + '" width="' + larguraSigla + '" height="' + (fs * 1.5) + '" rx="2" fill="#FFFFFF" fill-opacity="0.92"/>');
      p.push('<text x="' + (xi + 6 + larguraSigla / 2) + '" y="' + (y + h / 2 + fs * 0.36) + '" font-size="' + fs + '" font-weight="bold" fill="#1A1D22" text-anchor="middle">' + esc(cat.sigla) + '</text>');
      // Portas (se couberem) à direita; nome e modelo à esquerda.
      var temPortas = it.portas > 0 && h >= 12;
      var areaPortasX = xi + wi * 0.5, areaPortasW = wi * 0.5 - 10;
      var lado = Math.max(5, Math.min(9, UH * 0.36)), passo = lado + 2;
      var colunas = Math.max(1, Math.floor(areaPortasW / passo));
      var linhas = Math.ceil(it.portas / colunas);
      var cabem = temPortas && linhas * passo <= h - 4;
      if (temPortas && !cabem) { colunas = Math.ceil(it.portas / Math.max(1, Math.floor((h - 4) / passo))); cabem = colunas * passo <= areaPortasW && Math.floor((h - 4) / passo) >= 1; linhas = Math.ceil(it.portas / colunas); }
      if (comFoto) cabem = false; // a foto já mostra as portas de verdade
      var xTexto = xi + 6 + larguraSigla + 6;
      var limiteTexto = (cabem ? areaPortasX - 6 : xi + wi - 8) - xTexto;
      var maxChars = Math.max(4, Math.floor(limiteTexto / (fs * 0.56)));
      var nome = it.nome.length > maxChars ? it.nome.slice(0, maxChars - 2) + "..." : it.nome;
      var linhasTexto = !comFoto && h >= UH * 2 && it.modelo ? 2 : 1;
      var yNome = linhasTexto === 2 ? y + h / 2 - 2 : y + h / 2 + fs * 0.36;
      // Sobre a foto, o nome vai numa faixa escura para continuar legível.
      if (comFoto) p.push('<rect x="' + (xTexto - 4) + '" y="' + (y + h / 2 - fs * 0.75) + '" width="' + (Math.min(nome.length, maxChars) * fs * 0.6 + 8) + '" height="' + (fs * 1.5) + '" rx="2" fill="#0B1117" fill-opacity="0.72"/>');
      p.push('<text x="' + xTexto + '" y="' + yNome + '" font-size="' + fs + '" fill="#FFFFFF" font-weight="bold">' + esc(nome) + '</text>');
      if (linhasTexto === 2) p.push('<text x="' + xTexto + '" y="' + (yNome + fs + 2) + '" font-size="' + (fs - 1.5) + '" fill="#D9E1E8">' + esc([it.fabricante, it.modelo].filter(Boolean).join(" ").slice(0, maxChars + 4)) + '</text>');
      if (it.estado !== "instalado") {
        var etiqueta = it.estado === "planejado" ? "PLANEJADO" : "REMOVER";
        p.push('<text x="' + (xi + wi - 8) + '" y="' + (y + Math.min(h - 3, fs + 1)) + '" font-size="' + (fs - 2) + '" fill="' + (it.estado === "remover" ? "#FFB4B4" : "#FFE8A3") + '" text-anchor="end" font-weight="bold">' + etiqueta + '</text>');
      }
      if (cabem) {
        var altPortas = linhas * passo - 2;
        var y0p = y + (h - altPortas) / 2;
        for (var n = 1; n <= it.portas; n++) {
          var c = (n - 1) % colunas, l = Math.floor((n - 1) / colunas);
          var px = areaPortasX + c * passo, py = y0p + l * passo;
          var cabo = dados.cabos.find(function (cb) { return (cb.deItem === it.id && cb.dePorta === n) || (cb.paraItem === it.id && cb.paraPorta === n); });
          var corPorta = cabo ? (cabo.cor || CORES_CABO[cabo.tipo]) : "#11151A";
          portasPos[it.id + "#" + n] = { x: px + lado / 2, y: py + lado / 2 };
          p.push('<rect class="rk-porta" data-item="' + esc(it.id) + '" data-porta="' + n + '" x="' + px + '" y="' + py + '" width="' + lado + '" height="' + lado + '" fill="' + corPorta + '" stroke="#C9D1D9" stroke-width="0.6"><title>' + esc(nomePorta(it, n) + (it.tipoPorta ? " (" + it.tipoPorta + ")" : "") + (cabo ? " · " + (cabo.etiqueta || NOMES_CABO[cabo.tipo]) : " · livre")) + '</title></rect>');
        }
      } else if (temPortas) {
        // Portas sem desenho (não cabem): os cabos saem da lateral direita do equipamento.
        for (var k = 1; k <= it.portas; k++) portasPos[it.id + "#" + k] = { x: xi + wi - 4, y: y + h / 2 };
        if (!comFoto) p.push('<text x="' + (xi + wi - 8) + '" y="' + (y + h - 3) + '" font-size="' + (fs - 2) + '" fill="#D9E1E8" text-anchor="end">' + it.portas + "x " + esc(it.tipoPorta || "portas") + '</text>');
      }
      p.push('</g>');
    });
    // Cabos físicos: os do próprio rack voltam pela lateral direita (um trilho
    // por cabo). Os que vão para outro rack seguem cada um por seu trilho até uma
    // etiqueta própria, numa coluna à direita, uma embaixo da outra (sem sobrepor).
    if (opcoes.cabos !== "ocultos") {
      var PASSO_TRILHO = 6, ALTURA_ETIQUETA = 15;
      // Um trilho por cabo visível (até 14): com poucos cabos, as etiquetas ficam perto do rack.
      var TRILHOS = Math.max(1, Math.min(14, dados.cabos.filter(function (cb) { return portasPos[cb.deItem + "#" + cb.dePorta] || portasPos[cb.paraItem + "#" + cb.paraPorta]; }).length));
      var xEtiquetas = x0 + canal + TRILHOS * PASSO_TRILHO + 8;
      var indice = 0, saidas = [], linhas = [];
      dados.cabos.forEach(function (cb) {
        if (opcoes.cabos && opcoes.cabos !== "todos" && cb.tipo !== opcoes.cabos) return;
        var a = portasPos[cb.deItem + "#" + cb.dePorta], b = portasPos[cb.paraItem + "#" + cb.paraPorta];
        if (!a && !b) return;
        var cor = cb.cor || CORES_CABO[cb.tipo];
        var xc = x0 + canal + (indice++ % TRILHOS) * PASSO_TRILHO;
        var titulo = '<title>' + esc((cb.etiqueta ? cb.etiqueta + " · " : "") + NOMES_CABO[cb.tipo]) + '</title>';
        if (a && b) {
          linhas.push('<path d="M' + a.x + ' ' + a.y + ' H' + xc + ' V' + b.y + ' H' + b.x + '" fill="none" stroke="' + cor + '" stroke-width="1.6" stroke-opacity="0.85">' + titulo + '</path>');
        } else {
          var ponta = a || b;
          var outro = itemPorId(a ? cb.paraItem : cb.deItem);
          var portaOutro = a ? cb.paraPorta : cb.dePorta;
          var texto = outro ? outro.rack.nome + " / " + outro.item.nome + " " + nomePorta(outro.item, portaOutro) : "?";
          saidas.push({ ponta: ponta, xc: xc, cor: cor, texto: (cb.etiqueta ? cb.etiqueta + ": " : "") + texto, titulo: titulo });
        }
      });
      // Etiquetas na ordem da altura das portas, cada uma na primeira linha livre.
      saidas.sort(function (m, n) { return m.ponta.y - n.ponta.y || m.ponta.x - n.ponta.x; });
      var ultimaY = -Infinity;
      saidas.forEach(function (s) {
        var yEtiqueta = Math.max(s.ponta.y, ultimaY + ALTURA_ETIQUETA);
        ultimaY = yEtiqueta;
        linhas.push('<path d="M' + s.ponta.x + ' ' + s.ponta.y + ' H' + s.xc + ' V' + yEtiqueta + ' H' + (xEtiquetas - 3) + '" fill="none" stroke="' + s.cor + '" stroke-width="1.6" stroke-opacity="0.9">' + s.titulo + '</path>');
        p.push('<circle cx="' + (xEtiquetas - 3) + '" cy="' + yEtiqueta + '" r="2" fill="' + s.cor + '"/>');
        p.push('<text class="rk-cabo-rotulo" x="' + xEtiquetas + '" y="' + (yEtiqueta + 4) + '" font-size="11" fill="#3A4652">' + esc(s.texto.length > 34 ? s.texto.slice(0, 32) + "..." : s.texto) + s.titulo + '</text>');
      });
      if (saidas.length) larguraTotal = Math.max(larguraTotal, xEtiquetas - x0 + 215);
      p.splice.apply(p, [posicaoDosCabos, 0].concat(linhas));
      // Etiquetas que passam da base do rack aumentam a altura do desenho.
      if (saidas.length) alturaDesenho = Math.max(alturaDesenho, ultimaY + 10 - y0);
    }
    // Nomes ao lado (como nas plantas de datacenter): à esquerda, com seta até o equipamento.
    if (MARGEM_NOMES) {
      var ultimoNome = -Infinity;
      nomesLado.sort(function (m, n) { return m.y - n.y; }).forEach(function (n) {
        var yn = Math.max(n.y, ultimoNome + 12);
        ultimoNome = yn;
        var t = n.texto.length > 30 ? n.texto.slice(0, 28) + "..." : n.texto;
        p.push('<path class="rk-nome-seta" d="M' + (x0 - 12) + ' ' + yn + ' L' + (x0 - 4) + ' ' + yn + ' L' + (xi - 7) + ' ' + n.y + '" fill="none" stroke="#3A4652" stroke-width="1"/>');
        p.push('<path d="M' + (xi - 7) + ' ' + n.y + ' l-6 -3 v6 z" fill="#3A4652"/>');
        p.push('<text class="rk-nome-lado" x="' + (x0 - 15) + '" y="' + (yn + 3.5) + '" font-size="10" fill="#3A4652" text-anchor="end">' + esc(t) + '</text>');
      });
      if (nomesLado.length) alturaDesenho = Math.max(alturaDesenho, ultimoNome + 10 - y0);
    }
    p.push('</g>');
    return { svg: p.join(""), largura: larguraTotal, altura: alturaDesenho, UH: UH, topoU: topoU };
  }

  var DEFS = '<defs><pattern id="rk-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="rk-hachura-fundo" width="6" height="6" fill="#EEF1F4"/><line x1="0" y1="0" x2="0" y2="6" stroke="#C3CAD1" stroke-width="2"/></pattern></defs>';

  // ---- montagem da interface ---------------------------------------------------
  raiz.innerHTML =
    '<div class="rk">' +
      '<aside class="rk-lado" aria-label="Racks e biblioteca">' +
        '<div class="rk-bloco"><div class="rk-cabecalho"><strong>Racks</strong><button type="button" class="primary small" data-rk="novo-rack">+ Rack</button></div>' +
          '<input type="search" class="rk-busca" placeholder="Buscar rack ou equipamento" aria-label="Buscar rack ou equipamento" data-rk-busca>' +
          '<div class="rk-lista" data-rk-lista></div></div>' +
        '<div class="rk-bloco"><div class="rk-cabecalho"><strong>Biblioteca</strong></div>' +
          '<input type="search" class="rk-busca" placeholder="Buscar modelo (ex.: R720, MX204, DIO)" aria-label="Buscar modelo de equipamento" data-rk-busca-modelo>' +
          '<div class="rk-biblioteca rk-modelos" data-rk-modelos></div>' +
          '<div class="rk-biblioteca" data-rk-biblioteca></div>' +
          '<p class="rk-dica">Arraste para o rack, ou clique numa U livre e escolha o modelo ou a categoria.</p></div>' +
      '</aside>' +
      '<section class="rk-centro" aria-label="Rack">' +
        '<div class="rk-barra">' +
          '<div class="rk-titulo-rack" data-rk-titulo></div>' +
          '<div class="rk-grupo" role="group" aria-label="Face">' +
            '<button type="button" class="ghost small" data-rk-face="frente">Frente</button><button type="button" class="ghost small" data-rk-face="tras">Traseira</button></div>' +
          '<button type="button" class="ghost small" data-rk="inverter" title="Inverter a orientação na tela (U1 continua sendo a de baixo no rack)">U1 embaixo</button>' +
          '<button type="button" class="ghost small" data-rk="nomes" title="Nomes dos equipamentos ao lado do rack, com seta">Nomes ao lado</button>' +
          '<button type="button" class="ghost small" data-rk="fotos" title="Mostrar ou esconder as fotos reais dos equipamentos">Fotos</button>' +
          '<div class="rk-grupo" role="group" aria-label="Zoom"><button type="button" class="ghost small" data-rk="zoom-menos" aria-label="Reduzir">−</button><span data-rk-zoom>100%</span><button type="button" class="ghost small" data-rk="zoom-mais" aria-label="Ampliar">+</button></div>' +
          '<label class="rk-filtro">Cabos <select data-rk-cabos><option value="todos">Todos</option><option value="ocultos">Ocultos</option>' +
            E.TIPOS_CABO_RACK.map(function (t) { return '<option value="' + t + '">' + NOMES_CABO[t] + '</option>'; }).join("") + '</select></label>' +
          '<div class="rk-grupo rk-exportar" role="group" aria-label="Exportar">' +
            '<button type="button" class="ghost small" data-rk="png">PNG</button><button type="button" class="ghost small" data-rk="svg">SVG</button>' +
            '<button type="button" class="ghost small" data-rk="pdf">PDF</button><button type="button" class="ghost small" data-rk="pdf-todos" title="Um rack por página">PDF de todos</button>' +
            '<button type="button" class="ghost small" data-rk="relatorio" title="Planilha: racks, ocupação, U livres, inventário e cabos">Relatório</button></div>' +
        '</div>' +
        '<div class="rk-msg" role="status" aria-live="polite" hidden></div>' +
        '<div class="rk-palco" data-rk-palco tabindex="0" aria-label="Rack: clique numa U livre para adicionar, arraste um equipamento para mover"></div>' +
      '</section>' +
      '<aside class="rk-props" data-rk-props aria-label="Propriedades"></aside>' +
    '</div>';
  elMsg = raiz.querySelector(".rk-msg");
  var elLista = raiz.querySelector("[data-rk-lista]");
  var elBiblioteca = raiz.querySelector("[data-rk-biblioteca]");
  var elPalco = raiz.querySelector("[data-rk-palco]");
  var elProps = raiz.querySelector("[data-rk-props]");
  var elTitulo = raiz.querySelector("[data-rk-titulo]");
  var elBusca = raiz.querySelector("[data-rk-busca]");
  var elCabos = raiz.querySelector("[data-rk-cabos]");

  var elModelos = raiz.querySelector("[data-rk-modelos]");
  var MODELOS = E.MODELOS_RACK || [];
  function semAcento(t) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function renderModelos(termo) {
    var q = semAcento(termo || "").trim();
    if (!q) { elModelos.innerHTML = ""; elModelos.hidden = true; return; }
    var achados = [];
    MODELOS.forEach(function (m, i) { if (semAcento(m.fabricante + " " + m.modelo + " " + (CATEGORIAS[m.categoria] || {}).rotulo).indexOf(q) >= 0) achados.push(i); });
    elModelos.hidden = false;
    elModelos.innerHTML = achados.length ? achados.slice(0, 12).map(function (i) {
      var m = MODELOS[i], c = CATEGORIAS[m.categoria];
      return '<button type="button" class="rk-peca" draggable="true" data-modelo="' + i + '" title="' + esc(m.fabricante + " " + m.modelo + " · " + m.altura + "U · " + m.portas + "x " + m.tipoPorta) + '">' +
        (m.foto ? '<img class="rk-peca-foto" src="' + esc(m.foto) + '" alt="" loading="lazy">' : '<span class="rk-sigla" style="background:' + CORES[m.categoria] + '">' + esc(c.sigla) + '</span>') + '<span>' + esc(m.fabricante + " " + m.modelo) + '</span><small>' + m.altura + 'U</small></button>';
    }).join("") : '<p class="rk-dica">Nenhum modelo. Use uma categoria abaixo e preencha o modelo.</p>';
  }
  renderModelos("");
  raiz.querySelector("[data-rk-busca-modelo]").addEventListener("input", function (ev) { renderModelos(ev.target.value); });
  // Peça da biblioteca (categoria ou modelo) -> dados para instalar.
  function pecaPorChave(chave) {
    if (!chave) return null;
    if (chave.indexOf("m:") === 0) {
      var m = MODELOS[Number(chave.slice(2))];
      if (!m) return null;
      return { altura: m.altura, categoria: m.categoria, nome: m.modelo, foto: m.foto, base: { categoria: m.categoria, fabricante: m.fabricante, modelo: m.modelo, alturaU: m.altura, portas: m.portas, tipoPorta: m.tipoPorta } };
    }
    var c = CATEGORIAS[chave];
    return c ? { altura: c.altura, categoria: c.valor, nome: c.rotulo, base: { categoria: c.valor } } : null;
  }
  function chaveDaPeca(el) {
    var peca = el.closest("[data-categoria],[data-modelo]");
    if (!peca) return null;
    return peca.hasAttribute("data-modelo") ? "m:" + peca.getAttribute("data-modelo") : peca.getAttribute("data-categoria");
  }
  // Foto do catálogo (arquivo do site) vira data URL, para ficar salva no projeto e sair na exportação.
  function fotoDoCatalogo(url) {
    if (!url) return Promise.resolve("");
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }).then(function (b) {
      return new Promise(function (ok) { var leitor = new FileReader(); leitor.onload = function () { ok(String(leitor.result)); }; leitor.onerror = function () { ok(""); }; leitor.readAsDataURL(b); });
    }).catch(function () { return ""; });
  }
  function instalarPeca(rack, pc, u) {
    var n = (rack.itens || []).filter(function (x) { return pc.base.modelo ? x.modelo === pc.base.modelo : x.categoria === pc.categoria; }).length + 1;
    var base = Object.assign({}, pc.base, { u: u, nome: pc.nome + " " + n });
    if (!pc.foto) { adicionarItem(rack, base); return; }
    fotoDoCatalogo(pc.foto).then(function (foto) {
      if (foto && foto.length <= E.LIMITES.fotoRack) base.foto = foto;
      adicionarItem(rackAtual() && rackAtual().id === rack.id ? rackAtual() : rack, base);
    });
  }

  elBiblioteca.innerHTML = E.CATEGORIAS_RACK.map(function (c) {
    return '<button type="button" class="rk-peca" draggable="true" data-categoria="' + c.valor + '" title="' + esc(c.rotulo + " · " + c.altura + "U") + '">' +
      '<span class="rk-sigla" style="background:' + CORES[c.valor] + '">' + esc(c.sigla) + '</span><span>' + esc(c.rotulo) + '</span><small>' + c.altura + 'U</small></button>';
  }).join("");

  // ---- render ----------------------------------------------------------------
  function ativo() { return document.body.getAttribute("data-modo-diagrama") === "racks"; }
  var ultimoDesenho = null;

  function render() {
    raiz.hidden = !ativo();
    if (!ativo()) return;
    if (sel.rack && !rackAtual()) sel = { rack: null, item: null, u: null };
    if (!sel.rack && dados.racks.length) sel.rack = dados.racks[0].id;
    if (sel.item && !itemPorId(sel.item)) sel.item = null;
    renderLista();
    renderPalco();
    renderProps();
    raiz.querySelectorAll("[data-rk-face]").forEach(function (b) { b.classList.toggle("ativo", b.getAttribute("data-rk-face") === vista.face); b.setAttribute("aria-pressed", String(b.getAttribute("data-rk-face") === vista.face)); });
    raiz.querySelector('[data-rk="inverter"]').textContent = vista.inverter ? "U1 em cima" : "U1 embaixo";
    var botaoNomes = raiz.querySelector('[data-rk="nomes"]');
    botaoNomes.classList.toggle("ativo", vista.nomes);
    botaoNomes.setAttribute("aria-pressed", String(vista.nomes));
    var botaoFotos = raiz.querySelector('[data-rk="fotos"]');
    botaoFotos.classList.toggle("ativo", vista.fotos);
    botaoFotos.setAttribute("aria-pressed", String(vista.fotos));
    raiz.querySelector("[data-rk-zoom]").textContent = Math.round(vista.zoom * 100) + "%";
    elCabos.value = vista.cabos;
  }

  function renderLista() {
    if (!dados.racks.length) { elLista.innerHTML = '<p class="rk-vazio">Nenhum rack ainda.</p>'; return; }
    var grupos = {};
    dados.racks.forEach(function (r) {
      var achouItem = (r.itens || []).some(itemConfere);
      if (vista.busca && !achouItem && ![r.nome, r.local, r.patrimonio, r.modelo].some(confere)) return;
      (grupos[r.local || "Sem local"] = grupos[r.local || "Sem local"] || []).push(r);
    });
    var locais = Object.keys(grupos).sort(function (a, b) { return a.localeCompare(b); });
    if (!locais.length) { elLista.innerHTML = '<p class="rk-vazio">Nada encontrado.</p>'; return; }
    elLista.innerHTML = locais.map(function (local) {
      return '<div class="rk-local">' + esc(local) + '</div>' + grupos[local].map(function (r) {
        var oc = E.ocupacaoRack(r);
        var pct = Math.round(oc.ocupadas / r.alturaU * 100);
        var achados = vista.busca ? (r.itens || []).filter(itemConfere).length : 0;
        return '<button type="button" class="rk-rack-item' + (r.id === sel.rack ? " ativo" : "") + '" data-rack="' + esc(r.id) + '">' +
          '<span class="rk-rack-nome">' + esc(r.nome) + '</span>' +
          '<span class="rk-rack-info">' + oc.ocupadas + '/' + r.alturaU + 'U · ' + esc(NOMES_STATUS[r.status]) + (achados ? ' · ' + achados + ' encontrado' + (achados > 1 ? 's' : '') : '') + '</span>' +
          '<span class="rk-barra-ocupacao" aria-hidden="true"><span style="width:' + pct + '%"></span></span></button>';
      }).join("");
    }).join("");
  }

  function renderPalco() {
    var rack = rackAtual();
    if (!rack) {
      elTitulo.textContent = "";
      elPalco.innerHTML = '<div class="rk-palco-vazio"><p>Este projeto ainda não tem racks.</p><button type="button" class="primary" data-rk="novo-rack">Criar o primeiro rack</button></div>';
      return;
    }
    var oc = E.ocupacaoRack(rack);
    elTitulo.innerHTML = '<strong>' + esc(rack.nome) + '</strong> <span>' + oc.ocupadas + '/' + rack.alturaU + 'U ocupadas · ' + oc.livres + ' livres (' + Math.round(oc.ocupadas / rack.alturaU * 100) + '%)</span>';
    var d = desenharRack(rack, { zoom: vista.zoom, face: vista.face, inverter: vista.inverter, cabos: vista.cabos, fotos: vista.fotos, nomesAoLado: vista.nomes, x: 20, y: 24 });
    ultimoDesenho = d;
    var largura = d.largura + 40, altura = d.altura + 40;
    elPalco.innerHTML = '<svg class="rk-svg" xmlns="http://www.w3.org/2000/svg" width="' + largura + '" height="' + altura + '" viewBox="0 0 ' + largura + ' ' + altura + '">' + DEFS +
      '<text class="rk-legenda" x="20" y="16" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#4A5560">' + (vista.face === "frente" ? "Vista frontal" : "Vista traseira") + '</text>' +
      d.svg + '<rect class="rk-fantasma" x="0" y="0" width="0" height="0" visibility="hidden"/></svg>';
  }

  // ---- painel de propriedades ----------------------------------------------------
  function campo(rotulo, html, classe) { return '<label class="' + (classe || "") + '">' + rotulo + html + '</label>'; }
  function entrada(nome, valor, extra) { return '<input name="' + nome + '" value="' + esc(valor) + '" ' + (extra || "") + '>'; }
  function opcoes(lista, valor, nomes) { return lista.map(function (v) { return '<option value="' + esc(v) + '"' + (String(v) === String(valor) ? " selected" : "") + '>' + esc(nomes ? nomes[v] || v : v) + '</option>'; }).join(""); }
  function opcoesCategoria(valor) { return E.CATEGORIAS_RACK.map(function (c) { return '<option value="' + c.valor + '"' + (c.valor === valor ? " selected" : "") + '>' + esc(c.rotulo) + '</option>'; }).join(""); }

  function renderProps() {
    var rack = rackAtual();
    if (!rack) { elProps.innerHTML = '<div class="rk-props-vazio"><h3>Bayface de Racks</h3><p>Monte a disposição física dos equipamentos: altura em U, posições ocupadas e livres, frente e traseira, portas e cabos.</p><p>O diagrama lógico do projeto continua guardado; volte a ele pelo seletor de tipo.</p></div>'; return; }
    var achado = sel.item ? itemPorId(sel.item) : null;
    if (achado) { renderPropsItem(achado.item, achado.rack); return; }
    if (sel.u) { renderPropsNovo(rack, sel.u); return; }
    renderPropsRack(rack);
  }

  function renderPropsRack(rack) {
    var l = livresDoRack(rack);
    var alturaPadrao = ALTURAS_COMUNS.indexOf(rack.alturaU) >= 0;
    elProps.innerHTML =
      '<h3>Rack</h3>' +
      '<form class="nav-form rk-form" data-rk-form="rack">' +
        campo("Nome", entrada("nome", rack.nome, 'required maxlength="60"'), "full") +
        '<div class="nav-form-grid">' + campo("Patrimônio / código", entrada("patrimonio", rack.patrimonio, 'maxlength="40"')) + campo("Status", '<select name="status">' + opcoes(E.STATUS_RACK, rack.status, NOMES_STATUS) + '</select>') + '</div>' +
        campo("Local (unidade, sala, datacenter ou POP)", entrada("local", rack.local, 'maxlength="60" list="rk-locais"'), "full") +
        '<datalist id="rk-locais">' + Array.from(new Set(dados.racks.map(function (r) { return r.local; }).filter(Boolean))).map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + '</datalist>' +
        '<div class="nav-form-grid">' + campo("Fabricante", entrada("fabricante", rack.fabricante, 'maxlength="40"')) + campo("Modelo", entrada("modelo", rack.modelo, 'maxlength="60"')) + '</div>' +
        '<div class="nav-form-grid">' +
          campo("Altura", '<select name="alturaPadrao">' + ALTURAS_COMUNS.map(function (h) { return '<option value="' + h + '"' + (h === rack.alturaU ? " selected" : "") + '>' + h + 'U</option>'; }).join("") + '<option value="outra"' + (alturaPadrao ? "" : " selected") + '>Outra…</option></select>') +
          campo("Altura (U)", entrada("alturaU", rack.alturaU, 'type="number" min="1" max="' + E.LIMITES.alturaRackMax + '" required')) + '</div>' +
        '<div class="nav-form-grid">' + campo("Largura", entrada("largura", rack.largura, 'maxlength="20" placeholder="19&quot; / 600 mm"')) + campo("Profundidade", entrada("profundidade", rack.profundidade, 'maxlength="20" placeholder="1000 mm"')) + '</div>' +
        campo("Observações técnicas", '<textarea name="obs" maxlength="500" rows="3">' + esc(rack.obs) + '</textarea>', "full") +
        '<div class="nav-form-actions"><button type="submit" class="primary">Salvar rack</button></div>' +
      '</form>' +
      '<div class="rk-resumo"><strong>Ocupação</strong><p>' + l.oc.ocupadas + ' de ' + rack.alturaU + 'U ocupadas · ' + (rack.itens || []).length + ' equipamentos</p>' +
        '<p><strong>Livres:</strong> ' + (l.faixas.length ? esc(l.faixas.join(", ")) : "nenhuma") + '</p></div>' +
      '<div class="nav-form-actions rk-acoes"><button type="button" class="ghost" data-rk="duplicar-rack">Duplicar rack</button><button type="button" class="ghost danger-texto" data-rk="excluir-rack">Excluir rack</button></div>';
  }

  function renderPropsNovo(rack, u) {
    elProps.innerHTML =
      '<h3>Adicionar em U' + u + '</h3>' +
      '<form class="nav-form rk-form" data-rk-form="novo">' +
        campo("Modelo pronto", '<select name="modeloPronto"><option value="">— escolher depois —</option>' + E.CATEGORIAS_RACK.map(function (c) {
          var lista = MODELOS.map(function (m, i) { return m.categoria === c.valor ? '<option value="' + i + '">' + esc(m.fabricante + " " + m.modelo + " (" + m.altura + "U)") + '</option>' : ""; }).join("");
          return lista ? '<optgroup label="' + esc(c.rotulo) + '">' + lista + '</optgroup>' : "";
        }).join("") + '</select>', "full") +
        campo("Categoria", '<select name="categoria">' + opcoesCategoria("switch") + '</select>', "full") +
        campo("Nome", entrada("nome", "", 'required maxlength="60" placeholder="Ex.: SW-CORE-01"'), "full") +
        '<div class="nav-form-grid">' + campo("Altura (U)", entrada("alturaU", 1, 'type="number" min="1" max="' + rack.alturaU + '" required')) + campo("Face", '<select name="face">' + opcoes(E.FACES_RACK, "ambas", NOMES_FACE) + '</select>') + '</div>' +
        '<div class="nav-form-grid">' + campo("Fabricante", entrada("fabricante", "", 'maxlength="40"')) + campo("Modelo", entrada("modelo", "", 'maxlength="60"')) + '</div>' +
        '<p class="rk-dica">O equipamento ocupa de U' + u + ' para cima.</p>' +
        '<div class="nav-form-actions"><button type="button" class="ghost" data-rk="cancelar">Cancelar</button><button type="submit" class="primary">Adicionar</button></div>' +
      '</form>';
    var form = elProps.querySelector("form");
    form.categoria.addEventListener("change", function () { form.alturaU.value = CATEGORIAS[form.categoria.value].altura; });
    form.modeloPronto.addEventListener("change", function () {
      var m = MODELOS[Number(form.modeloPronto.value)];
      if (!form.modeloPronto.value || !m) return;
      form.categoria.value = m.categoria; form.alturaU.value = m.altura; form.fabricante.value = m.fabricante; form.modelo.value = m.modelo;
      if (!form.nome.value) form.nome.value = m.modelo;
    });
    form.nome.focus();
  }

  function renderPropsItem(it, rack) {
    var cat = CATEGORIAS[it.categoria] || CATEGORIAS.personalizado;
    var equips = app.equipamentosDoDiagrama ? app.equipamentosDoDiagrama() : [];
    var cabos = cabosDoItem(it.id);
    var livres = [];
    for (var n = 1; n <= it.portas; n++) if (!portaOcupada(it.id, n)) livres.push(n);
    elProps.innerHTML =
      '<h3>' + esc(cat.rotulo) + ' <small>' + esc(faixaU(it)) + ' · ' + esc(rack.nome) + '</small></h3>' +
      '<form class="nav-form rk-form" data-rk-form="item">' +
        campo("Nome / identificação", entrada("nome", it.nome, 'required maxlength="60"'), "full") +
        '<div class="nav-form-grid">' + campo("Categoria", '<select name="categoria">' + opcoesCategoria(it.categoria) + '</select>') + campo("Estado", '<select name="estado">' + opcoes(E.ESTADOS_ITEM_RACK, it.estado, NOMES_ESTADO) + '</select>') + '</div>' +
        '<div class="nav-form-grid">' + campo("Fabricante", entrada("fabricante", it.fabricante, 'maxlength="40"')) + campo("Modelo", entrada("modelo", it.modelo, 'maxlength="60"')) + '</div>' +
        '<div class="nav-form-grid rk-grid-3">' + campo("U inicial", entrada("u", it.u, 'type="number" min="1" max="' + rack.alturaU + '" required')) + campo("Altura (U)", entrada("alturaU", it.alturaU, 'type="number" min="1" max="' + rack.alturaU + '" required')) + campo("Face", '<select name="face">' + opcoes(E.FACES_RACK, it.face, NOMES_FACE) + '</select>') + '</div>' +
        '<div class="nav-form-grid">' + campo("Patrimônio / código", entrada("patrimonio", it.patrimonio, 'maxlength="40"')) +
          campo("Cor", '<span class="rk-cor"><input type="color" name="cor" value="' + esc(it.cor || CORES[it.categoria] || "#4D5966") + '"><label class="opcao-check"><input type="checkbox" name="corPadrao"' + (it.cor ? "" : " checked") + '> Padrão</label></span>') + '</div>' +
        '<div class="nav-form-grid rk-grid-3">' + campo("Portas", entrada("portas", it.portas, 'type="number" min="0" max="' + E.LIMITES.portasPorItem + '"')) + campo("Tipo de porta", entrada("tipoPorta", it.tipoPorta, 'maxlength="30" placeholder="RJ45, SFP+, LC…"')) + campo("Prefixo", entrada("prefixoPorta", it.prefixoPorta, 'maxlength="15" placeholder="ge1/"')) + '</div>' +
        '<div class="nav-form-grid">' + campo("Largura", entrada("largura", it.largura, 'maxlength="20" placeholder="19&quot;"')) + campo("Profundidade", entrada("profundidade", it.profundidade, 'maxlength="20" placeholder="600 mm"')) + '</div>' +
        campo("Equipamento do diagrama (opcional)", '<select name="equipId"><option value="">— nenhum —</option>' + equips.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === it.equipId ? " selected" : "") + '>' + esc(e.nome + (e.tipo ? " · " + e.tipo : "")) + '</option>'; }).join("") + '</select>', "full") +
        campo("Observações", '<textarea name="obs" maxlength="500" rows="2">' + esc(it.obs) + '</textarea>', "full") +
        '<div class="nav-form-actions"><button type="submit" class="primary">Salvar</button></div>' +
      '</form>' +
      '<div class="nav-form-actions rk-acoes">' +
        '<button type="button" class="ghost" data-rk="duplicar-item">Duplicar</button>' +
        '<button type="button" class="ghost" data-rk="mover-item">Mover para…</button>' +
        '<button type="button" class="ghost danger-texto" data-rk="remover-item">Remover</button></div>' +
      '<div class="rk-mover" data-rk-mover hidden><div class="nav-form-grid">' +
        campo("Rack", '<select data-rk-mover-rack>' + dados.racks.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === rack.id ? " selected" : "") + '>' + esc(r.nome) + '</option>'; }).join("") + '</select>') +
        campo("U inicial", '<input type="number" min="1" data-rk-mover-u value="' + it.u + '">') + '</div>' +
        '<div class="nav-form-actions"><button type="button" class="primary small" data-rk="confirmar-mover">Mover</button></div></div>' +
      renderSecaoFoto(it) +
      '<div class="rk-cabos"><h4>Portas e cabos físicos <small>' + cabos.length + ' cabo' + (cabos.length === 1 ? "" : "s") + ' · ' + livres.length + ' porta' + (livres.length === 1 ? "" : "s") + ' livre' + (livres.length === 1 ? "" : "s") + '</small></h4>' +
        (cabos.length ? '<ul class="rk-lista-cabos">' + cabos.map(function (c) {
          var daqui = c.deItem === it.id;
          var outro = itemPorId(daqui ? c.paraItem : c.deItem);
          var portaAqui = daqui ? c.dePorta : c.paraPorta, portaLa = daqui ? c.paraPorta : c.dePorta;
          return '<li><span class="rk-cabo-cor" style="background:' + esc(c.cor || CORES_CABO[c.tipo]) + '"></span><span><strong>' + esc(nomePorta(it, portaAqui)) + '</strong> → ' +
            esc(outro ? outro.rack.nome + " / " + outro.item.nome + " " + nomePorta(outro.item, portaLa) : "?") + '<small>' + esc([NOMES_CABO[c.tipo], c.etiqueta, c.comprimento].filter(Boolean).join(" · ")) + '</small></span>' +
            '<button type="button" class="ghost small" data-rk="remover-cabo" data-cabo="' + esc(c.id) + '" aria-label="Remover cabo">×</button></li>';
        }).join("") + '</ul>' : '') +
        (it.portas ? renderFormCabo(it, livres) : '<p class="rk-dica">Informe a quantidade de portas para ligar cabos.</p>') +
      '</div>';
    var form = elProps.querySelector('[data-rk-form="item"]');
    form.cor.addEventListener("input", function () { form.corPadrao.checked = false; });
  }

  // ---- fotos reais do painel frontal ------------------------------------------------
  // Proporção do painel: 19" (482,6 mm) de largura por 44,45 mm de altura a cada U.
  var LARGURA_FOTO = 960;
  function mesmoModelo(it) {
    if (!it.modelo) return [it];
    var chave = (it.fabricante + "|" + it.modelo).toLowerCase();
    var lista = [];
    dados.racks.forEach(function (r) { (r.itens || []).forEach(function (x) { if ((x.fabricante + "|" + x.modelo).toLowerCase() === chave && x.alturaU === it.alturaU) lista.push(x); }); });
    return lista;
  }
  function renderSecaoFoto(it) {
    var outros = it.modelo ? mesmoModelo(it).filter(function (x) { return x.id !== it.id && x.foto !== it.foto; }).length : 0;
    return '<div class="rk-foto-secao"><h4>Foto do painel frontal</h4>' +
      (it.foto ? '<img class="rk-foto-previa" src="' + esc(it.foto) + '" alt="Foto de ' + esc(it.nome) + '">' : '<p class="rk-dica">Tire uma foto de frente do equipamento instalado. O Grafo recorta no formato do painel (' + it.alturaU + 'U) e reduz para não pesar no projeto.</p>') +
      '<div class="nav-form-actions rk-acoes">' +
        '<label class="ghost botao-arquivo rk-botao-foto" tabindex="0" role="button">' + (it.foto ? "Trocar foto" : "Enviar foto") + '<input type="file" accept="image/*" data-rk-foto hidden></label>' +
        (it.foto ? '<button type="button" class="ghost small danger-texto" data-rk="remover-foto">Remover</button>' : '') +
        (it.foto && outros ? '<button type="button" class="ghost small" data-rk="foto-modelo" title="Mesma foto nos outros ' + esc(it.modelo) + ' com a mesma altura">Usar nos outros ' + outros + ' do modelo</button>' : '') +
      '</div></div>';
  }
  // Ajusta a altura do equipamento (em U) à proporção da foto e encaixa a imagem
  // inteira, sem cortar. Se a nova altura não couber no rack, mantém a atual.
  function prepararFoto(arquivo, alturaU, rack, item) {
    return new Promise(function (resolver, rejeitar) {
      if (!/^image\//.test(arquivo.type)) { rejeitar(new Error("o arquivo não é uma imagem")); return; }
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var uFoto = Math.max(1, Math.min(rack ? rack.alturaU : 60, Math.round(482.6 * img.naturalHeight / (img.naturalWidth * 44.45))));
        if (rack && item && uFoto !== alturaU && E.verificarPosicaoRack(rack, Object.assign({}, item, { alturaU: uFoto }), item.id).ok) alturaU = uFoto;
        var w = LARGURA_FOTO, h = Math.max(40, Math.round(LARGURA_FOTO * alturaU * 44.45 / 482.6));
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        var ctx = c.getContext("2d");
        var escala = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        var dw = img.naturalWidth * escala, dh = img.naturalHeight * escala;
        ctx.fillStyle = "#1A1D22"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        var qualidade = 0.82, dataUrl = c.toDataURL("image/jpeg", qualidade);
        while (dataUrl.length > E.LIMITES.fotoRack && qualidade > 0.4) { qualidade -= 0.1; dataUrl = c.toDataURL("image/jpeg", qualidade); }
        if (dataUrl.length > E.LIMITES.fotoRack) { rejeitar(new Error("a foto ficou grande demais mesmo comprimida")); return; }
        resolver({ foto: dataUrl, alturaU: alturaU });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rejeitar(new Error("não foi possível ler a imagem")); };
      img.src = url;
    });
  }
  function salvarFoto(ids, foto, sucesso, alturaU) {
    var racks = clonar(dados.racks);
    racks.forEach(function (r) { r.itens.forEach(function (x) { if (ids.indexOf(x.id) >= 0) { if (foto) x.foto = foto; else delete x.foto; if (alturaU) x.alturaU = alturaU; } }); });
    if (foto) destacar(ids[0]);
    gravar(racks, dados.cabos, sucesso);
  }

  function renderFormCabo(it, livres) {
    if (!livres.length) return '<p class="rk-dica">Todas as portas já têm cabo.</p>';
    return '<form class="nav-form rk-form" data-rk-form="cabo"><div class="nav-form-grid">' +
      campo("Porta daqui", '<select name="dePorta">' + livres.map(function (n) { return '<option value="' + n + '">' + esc(nomePorta(it, n)) + '</option>'; }).join("") + '</select>') +
      campo("Tipo", '<select name="tipo">' + opcoes(E.TIPOS_CABO_RACK, "rede", NOMES_CABO) + '</select>') + '</div>' +
      campo("Destino", '<select name="paraItem">' + dados.racks.map(function (r) {
        return '<optgroup label="' + esc(r.nome) + '">' + (r.itens || []).filter(function (x) { return x.portas > 0; }).map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === it.id ? "" : "") + '>' + esc(x.nome + " (" + faixaU(x) + ")") + '</option>'; }).join("") + '</optgroup>';
      }).join("") + '</select>', "full") +
      '<div class="nav-form-grid">' + campo("Porta de destino", '<select name="paraPorta"></select>') + campo("Identificação", '<input name="etiqueta" maxlength="40" placeholder="CB-001">') + '</div>' +
      '<div class="nav-form-grid">' + campo("Comprimento", '<input name="comprimento" maxlength="20" placeholder="2 m">') + campo("Cor", '<span class="rk-cor"><input type="color" name="cor" value="#2F80ED"><label class="opcao-check"><input type="checkbox" name="corPadrao" checked> Do tipo</label></span>') + '</div>' +
      campo("Observações", '<input name="obs" maxlength="500">', "full") +
      '<div class="nav-form-actions"><button type="submit" class="primary small">Adicionar cabo</button></div></form>';
  }

  function atualizarPortasDestino(form, itemOrigem) {
    var ref = itemPorId(form.paraItem.value);
    var dePorta = Number(form.dePorta.value);
    var html = "";
    if (ref) for (var n = 1; n <= ref.item.portas; n++) {
      if (portaOcupada(ref.item.id, n)) continue;
      if (ref.item.id === itemOrigem.id && n === dePorta) continue;
      html += '<option value="' + n + '">' + esc(nomePorta(ref.item, n)) + '</option>';
    }
    form.paraPorta.innerHTML = html || '<option value="">sem porta livre</option>';
  }

  // ---- ações -------------------------------------------------------------------
  function novoRack() {
    var n = dados.racks.length + 1;
    var nome = "RACK-" + String(n).padStart(2, "0");
    while (dados.racks.some(function (r) { return r.nome === nome; })) nome = "RACK-" + String(++n).padStart(2, "0");
    var anterior = rackAtual();
    var rack = { id: novoId("rk"), nome: nome, patrimonio: "", local: anterior ? anterior.local : "", fabricante: "", modelo: "", alturaU: 42, largura: "", profundidade: "", status: "planejado", obs: "", itens: [] };
    sel = { rack: rack.id, item: null, u: null };
    gravar(dados.racks.concat([rack]), dados.cabos, "Rack " + nome + " criado (42U).");
  }

  function adicionarItem(rack, base) {
    var cat = CATEGORIAS[base.categoria] || CATEGORIAS.personalizado;
    var item = Object.assign({ id: novoId("it"), nome: cat.rotulo, categoria: cat.valor, fabricante: "", modelo: "", u: 1, alturaU: cat.altura, face: "ambas", cor: "",
      patrimonio: "", portas: cat.portas || 0, tipoPorta: cat.tipoPorta || "", prefixoPorta: "", largura: "", profundidade: "", estado: "instalado", obs: "" }, base);
    item.u = Number(item.u); item.alturaU = Number(item.alturaU);
    var pos = E.verificarPosicaoRack(rack, item);
    if (!pos.ok) { mensagem("Não dá para instalar aí: " + pos.motivo + ".", true); return false; }
    destacar(item.id);
    var ok = comRack(rack.id, function (r, racks) { r.itens.push(item); sel = { rack: r.id, item: item.id, u: null }; return gravar(racks, dados.cabos, item.nome + " instalado em " + faixaU(item) + "."); });
    return ok;
  }

  function moverItem(itemId, rackDestinoId, novoU) {
    var origem = itemPorId(itemId);
    if (!origem) return false;
    var destino = dados.racks.find(function (r) { return r.id === rackDestinoId; });
    if (!destino) return false;
    var candidato = Object.assign({}, origem.item, { u: Number(novoU) });
    var pos = E.verificarPosicaoRack(destino, candidato, itemId);
    if (!pos.ok) { mensagem("Não dá para mover: " + pos.motivo + ".", true); render(); return false; }
    var racks = clonar(dados.racks);
    var rOrigem = racks.find(function (r) { return r.id === origem.rack.id; });
    var rDestino = racks.find(function (r) { return r.id === destino.id; });
    rOrigem.itens = rOrigem.itens.filter(function (x) { return x.id !== itemId; });
    rDestino.itens.push(candidato);
    sel = { rack: destino.id, item: itemId, u: null };
    destacar(itemId);
    return gravar(racks, dados.cabos, candidato.nome + " movido para " + faixaU(candidato) + (destino.id !== origem.rack.id ? " em " + destino.nome : "") + ".");
  }

  function primeiraPosicaoLivre(rack, alturaU, face, aPartirDe) {
    for (var u = aPartirDe || 1; u + alturaU - 1 <= rack.alturaU; u++) {
      if (E.verificarPosicaoRack(rack, { u: u, alturaU: alturaU, face: face }).ok) return u;
    }
    for (u = 1; u < (aPartirDe || 1); u++) if (E.verificarPosicaoRack(rack, { u: u, alturaU: alturaU, face: face }).ok) return u;
    return null;
  }

  function lerForm(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.type === "checkbox" ? el.checked : el.value; });
    return o;
  }

  raiz.addEventListener("submit", function (ev) {
    var form = ev.target.closest("[data-rk-form]");
    if (!form) return;
    ev.preventDefault();
    var tipo = form.getAttribute("data-rk-form");
    var v = lerForm(form);
    var rack = rackAtual();
    if (tipo === "rack" && rack) {
      var alturaU = Number(v.alturaU);
      var acima = (rack.itens || []).filter(function (it) { return it.u + it.alturaU - 1 > alturaU; });
      if (acima.length) { mensagem("Não dá para reduzir para " + alturaU + "U: " + acima.map(function (it) { return it.nome + " (" + faixaU(it) + ")"; }).join(", ") + " ficaria fora do rack. Mova ou remova antes.", true); return; }
      comRack(rack.id, function (r, racks) {
        Object.assign(r, { nome: v.nome, patrimonio: v.patrimonio, local: v.local, fabricante: v.fabricante, modelo: v.modelo, alturaU: alturaU, largura: v.largura, profundidade: v.profundidade, status: v.status, obs: v.obs });
        return gravar(racks, dados.cabos, "Rack salvo.");
      });
    } else if (tipo === "novo" && rack) {
      var pronto = v.modeloPronto ? MODELOS[Number(v.modeloPronto)] : null;
      var usaPronto = pronto && pronto.modelo === v.modelo;
      var novoItem = Object.assign(usaPronto ? { portas: pronto.portas, tipoPorta: pronto.tipoPorta } : {},
        { categoria: v.categoria, nome: v.nome, alturaU: v.alturaU, face: v.face, fabricante: v.fabricante, modelo: v.modelo, u: sel.u });
      if (usaPronto && pronto.foto && Number(v.alturaU) === pronto.altura) {
        fotoDoCatalogo(pronto.foto).then(function (foto) { if (foto && foto.length <= E.LIMITES.fotoRack) novoItem.foto = foto; adicionarItem(rackAtual() || rack, novoItem); });
      } else adicionarItem(rack, novoItem);
    } else if (tipo === "item") {
      var achado = itemPorId(sel.item);
      if (!achado) return;
      var novo = Object.assign({}, achado.item, {
        nome: v.nome, categoria: v.categoria, estado: v.estado, fabricante: v.fabricante, modelo: v.modelo, u: Number(v.u), alturaU: Number(v.alturaU), face: v.face,
        patrimonio: v.patrimonio, cor: v.corPadrao ? "" : v.cor, portas: Number(v.portas) || 0, tipoPorta: v.tipoPorta, prefixoPorta: v.prefixoPorta,
        largura: v.largura, profundidade: v.profundidade, obs: v.obs
      });
      if (v.equipId) novo.equipId = v.equipId; else delete novo.equipId;
      var pos = E.verificarPosicaoRack(achado.rack, novo, novo.id);
      if (!pos.ok) { mensagem("Não dá para salvar nessa posição: " + pos.motivo + ".", true); return; }
      // Portas reduzidas: cabos nas portas que deixam de existir seriam perdidos.
      var perdidos = dados.cabos.filter(function (c) { return (c.deItem === novo.id && c.dePorta > novo.portas) || (c.paraItem === novo.id && c.paraPorta > novo.portas); });
      if (perdidos.length && !window.confirm(perdidos.length + " cabo(s) estão em portas acima de " + novo.portas + " e serão removidos. Continuar?")) return;
      var racks = clonar(dados.racks);
      var r = racks.find(function (x) { return x.id === achado.rack.id; });
      r.itens = r.itens.map(function (x) { return x.id === novo.id ? novo : x; });
      gravar(racks, dados.cabos.filter(function (c) { return perdidos.indexOf(c) < 0; }), "Equipamento salvo.");
    } else if (tipo === "cabo") {
      var origemCabo = itemPorId(sel.item);
      if (!origemCabo || !v.paraPorta) { mensagem("Escolha a porta de destino.", true); return; }
      var cabo = { id: novoId("cb"), deItem: origemCabo.item.id, dePorta: Number(v.dePorta), paraItem: v.paraItem, paraPorta: Number(v.paraPorta), tipo: v.tipo,
        etiqueta: v.etiqueta, comprimento: v.comprimento, cor: v.corPadrao ? "" : v.cor, obs: v.obs };
      gravar(dados.racks, dados.cabos.concat([cabo]), "Cabo adicionado.");
    }
  });

  raiz.addEventListener("change", function (ev) {
    if (ev.target.matches("[data-rk-foto]")) {
      var achadoFoto = sel.item ? itemPorId(sel.item) : null;
      var arquivo = ev.target.files && ev.target.files[0];
      if (!achadoFoto || !arquivo) return;
      mensagem("Preparando a foto…");
      prepararFoto(arquivo, achadoFoto.item.alturaU, achadoFoto.rack, achadoFoto.item)
        .then(function (r) {
          var mudou = r.alturaU !== achadoFoto.item.alturaU;
          salvarFoto([achadoFoto.item.id], r.foto, "Foto de " + achadoFoto.item.nome + " salva" + (mudou ? " (altura ajustada para " + r.alturaU + "U)" : "") + ".", r.alturaU);
        })
        .catch(function (e) { mensagem("Não deu para usar a foto: " + e.message + ".", true); });
      return;
    }
    var form = ev.target.closest('[data-rk-form="cabo"]');
    if (form && (ev.target.name === "paraItem" || ev.target.name === "dePorta")) { var a = itemPorId(sel.item); if (a) atualizarPortasDestino(form, a.item); }
    if (form && ev.target.name === "cor") form.corPadrao.checked = false;
    if (ev.target.name === "alturaPadrao" && ev.target.value !== "outra") ev.target.form.alturaU.value = ev.target.value;
    if (ev.target.matches("[data-rk-cabos]")) { vista.cabos = ev.target.value; guardarVista(); renderPalco(); }
  });

  raiz.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-rk], [data-rk-face], [data-rack]");
    if (!b) return;
    if (b.hasAttribute("data-rack")) { sel = { rack: b.getAttribute("data-rack"), item: null, u: null }; render(); return; }
    if (b.hasAttribute("data-rk-face")) { vista.face = b.getAttribute("data-rk-face"); guardarVista(); render(); return; }
    var acao = b.getAttribute("data-rk");
    var rack = rackAtual();
    var achado = sel.item ? itemPorId(sel.item) : null;
    if (acao === "novo-rack") novoRack();
    else if (acao === "inverter") { vista.inverter = !vista.inverter; guardarVista(); render(); }
    else if (acao === "nomes") { vista.nomes = !vista.nomes; guardarVista(); render(); }
    else if (acao === "fotos") { vista.fotos = !vista.fotos; guardarVista(); render(); }
    else if (acao === "remover-foto" && achado) {
      if (!window.confirm('Remover a foto de "' + achado.item.nome + '"?')) return;
      salvarFoto([achado.item.id], null, "Foto removida.");
    } else if (acao === "foto-modelo" && achado && achado.item.foto) {
      var mesmos = mesmoModelo(achado.item);
      salvarFoto(mesmos.map(function (x) { return x.id; }), achado.item.foto, "Foto aplicada em " + mesmos.length + " equipamento" + (mesmos.length > 1 ? "s" : "") + " do modelo " + achado.item.modelo + ".");
    }
    else if (acao === "zoom-mais") { vista.zoom = Math.min(2.5, Math.round((vista.zoom + 0.2) * 10) / 10); guardarVista(); render(); }
    else if (acao === "zoom-menos") { vista.zoom = Math.max(0.5, Math.round((vista.zoom - 0.2) * 10) / 10); guardarVista(); render(); }
    else if (acao === "cancelar") { sel.u = null; render(); }
    else if (acao === "duplicar-rack" && rack) {
      if (dados.racks.length >= E.LIMITES.racks) { mensagem("Máximo de " + E.LIMITES.racks + " racks por projeto.", true); return; }
      var copia = clonar(rack);
      copia.id = novoId("rk");
      copia.nome = (rack.nome + " (cópia)").slice(0, 60);
      copia.itens.forEach(function (it) { it.id = novoId("it"); delete it.equipId; });
      sel = { rack: copia.id, item: null, u: null };
      gravar(dados.racks.concat([copia]), dados.cabos, "Rack duplicado (os cabos não são copiados).");
    } else if (acao === "excluir-rack" && rack) {
      var qtd = (rack.itens || []).length;
      if (!window.confirm('Excluir o rack "' + rack.nome + '"' + (qtd ? " e os " + qtd + " equipamentos dele" : "") + "? Dá para desfazer com Ctrl+Z.")) return;
      var ids = (rack.itens || []).map(function (x) { return x.id; });
      sel = { rack: null, item: null, u: null };
      gravar(dados.racks.filter(function (r) { return r.id !== rack.id; }), dados.cabos.filter(function (c) { return ids.indexOf(c.deItem) < 0 && ids.indexOf(c.paraItem) < 0; }), "Rack excluído.");
    } else if (acao === "duplicar-item" && achado) {
      var u = primeiraPosicaoLivre(achado.rack, achado.item.alturaU, achado.item.face, achado.item.u + achado.item.alturaU);
      if (u == null) { mensagem("Não há " + achado.item.alturaU + "U livres neste rack para a cópia.", true); return; }
      var dup = Object.assign(clonar(achado.item), { id: novoId("it"), nome: (achado.item.nome + " (cópia)").slice(0, 60), u: u });
      delete dup.equipId;
      adicionarItem(achado.rack, dup);
    } else if (acao === "mover-item" && achado) {
      var painel = elProps.querySelector("[data-rk-mover]"); painel.hidden = !painel.hidden;
    } else if (acao === "confirmar-mover" && achado) {
      moverItem(achado.item.id, elProps.querySelector("[data-rk-mover-rack]").value, elProps.querySelector("[data-rk-mover-u]").value);
    } else if (acao === "remover-item" && achado) {
      var cabosItem = cabosDoItem(achado.item.id);
      if (!window.confirm('Remover "' + achado.item.nome + '" (' + faixaU(achado.item) + ")" + (cabosItem.length ? " e os " + cabosItem.length + " cabos ligados a ele" : "") + "? Dá para desfazer com Ctrl+Z.")) return;
      var racks = clonar(dados.racks);
      var r = racks.find(function (x) { return x.id === achado.rack.id; });
      r.itens = r.itens.filter(function (x) { return x.id !== achado.item.id; });
      var nomeRemovido = achado.item.nome + " (" + faixaU(achado.item) + ")";
      sel = { rack: r.id, item: null, u: null };
      gravar(racks, dados.cabos.filter(function (c) { return cabosItem.indexOf(c) < 0; }), nomeRemovido + " removido; as unidades ficaram livres.");
    } else if (acao === "remover-cabo") {
      var id = b.getAttribute("data-cabo");
      gravar(dados.racks, dados.cabos.filter(function (c) { return c.id !== id; }), "Cabo removido.");
    } else if (acao === "png" || acao === "svg" || acao === "pdf") exportar(acao, rack ? [rack] : []);
    else if (acao === "pdf-todos") exportar("pdf", dados.racks);
    else if (acao === "relatorio") exportarRelatorio();
  });

  elBusca.addEventListener("input", function () { vista.busca = elBusca.value.trim(); renderLista(); renderPalco(); });

  // ---- palco: selecionar, U livre, arrastar para mover, soltar da biblioteca ----
  function uNoPonto(clientY) {
    var svg = elPalco.querySelector("svg");
    var rack = rackAtual();
    if (!svg || !rack || !ultimoDesenho) return null;
    var caixa = svg.getBoundingClientRect();
    var y = (clientY - caixa.top) * (svg.viewBox.baseVal.height / caixa.height);
    var linha = Math.floor((y - 24 - BORDA) / ultimoDesenho.UH);
    if (linha < 0 || linha >= rack.alturaU) return null;
    return vista.inverter ? linha + 1 : rack.alturaU - linha;
  }
  function mostrarFantasma(uBase, alturaU, ok) {
    var f = elPalco.querySelector(".rk-fantasma");
    var rack = rackAtual();
    if (!f || !rack || uBase == null) { if (f) f.setAttribute("visibility", "hidden"); return; }
    var topoU = vista.inverter ? uBase : uBase + alturaU - 1;
    var y = ultimoDesenho.topoU(Math.min(Math.max(topoU, 1), rack.alturaU));
    f.setAttribute("x", 20 + TRILHO); f.setAttribute("width", LARGURA_19);
    f.setAttribute("y", y); f.setAttribute("height", alturaU * ultimoDesenho.UH);
    f.setAttribute("fill", ok ? "#27AE60" : "#D64545"); f.setAttribute("fill-opacity", "0.35");
    f.setAttribute("stroke", ok ? "#1E8449" : "#B03A3A"); f.setAttribute("stroke-width", "2");
    f.setAttribute("visibility", "visible");
  }

  var arraste = null;
  elPalco.addEventListener("pointerdown", function (ev) {
    var g = ev.target.closest(".rk-item");
    var livre = ev.target.closest(".rk-u-livre");
    if (livre) { sel = { rack: sel.rack, item: null, u: Number(livre.getAttribute("data-u")) }; render(); return; }
    if (!g) { if (ev.target.closest("svg")) { sel = { rack: sel.rack, item: null, u: null }; render(); } return; }
    var achado = itemPorId(g.getAttribute("data-item"));
    if (!achado) return;
    if (sel.item !== achado.item.id) { sel = { rack: sel.rack, item: achado.item.id, u: null }; renderProps(); renderPalco(); }
    var uClique = uNoPonto(ev.clientY);
    arraste = { id: achado.item.id, inicioY: ev.clientY, deslocamento: uClique != null ? uClique - achado.item.u : 0, movendo: false, alvo: achado.item.u, pointerId: ev.pointerId };
    elPalco.setPointerCapture(ev.pointerId);
  });
  elPalco.addEventListener("pointermove", function (ev) {
    if (!arraste) return;
    if (!arraste.movendo && Math.abs(ev.clientY - arraste.inicioY) < 4) return;
    arraste.movendo = true;
    var achado = itemPorId(arraste.id), rack = rackAtual();
    var u = uNoPonto(ev.clientY);
    if (u == null || !achado) return;
    var alvo = Math.max(1, u - arraste.deslocamento);
    arraste.alvo = alvo;
    var pos = E.verificarPosicaoRack(rack, Object.assign({}, achado.item, { u: alvo }), achado.item.id);
    arraste.ok = pos.ok; arraste.motivo = pos.motivo;
    mostrarFantasma(alvo, achado.item.alturaU, pos.ok);
  });
  function fimArraste(ev) {
    if (!arraste) return;
    var a = arraste; arraste = null;
    try { elPalco.releasePointerCapture(a.pointerId); } catch (e) {}
    mostrarFantasma(null);
    if (!a.movendo) return;
    var achado = itemPorId(a.id);
    if (!achado || a.alvo === achado.item.u) return;
    if (!a.ok) { mensagem("Não dá para mover: " + a.motivo + ".", true); return; }
    moverItem(a.id, achado.rack.id, a.alvo);
  }
  elPalco.addEventListener("pointerup", fimArraste);
  elPalco.addEventListener("pointercancel", function () { arraste = null; mostrarFantasma(null); });

  // Arrastar da biblioteca (HTML5 drag and drop).
  var categoriaArrastada = null;
  [elBiblioteca, elModelos].forEach(function (lista) {
    lista.addEventListener("dragstart", function (ev) {
      var chave = chaveDaPeca(ev.target);
      if (!chave) return;
      categoriaArrastada = chave;
      ev.dataTransfer.setData("text/plain", chave);
      ev.dataTransfer.effectAllowed = "copy";
    });
    lista.addEventListener("dragend", function () { categoriaArrastada = null; mostrarFantasma(null); });
    lista.addEventListener("click", function (ev) {
      var pc = pecaPorChave(chaveDaPeca(ev.target));
      var rack = rackAtual();
      if (!pc || !rack) { if (pc) mensagem("Crie um rack primeiro.", true); return; }
      var u = sel.u && E.verificarPosicaoRack(rack, { u: sel.u, alturaU: pc.altura }).ok ? sel.u : primeiraPosicaoLivre(rack, pc.altura, "ambas", 1);
      if (u == null) { mensagem("Não há " + pc.altura + "U livres seguidas neste rack.", true); return; }
      instalarPeca(rack, pc, u);
    });
  });
  function posicaoDeSoltura(ev) {
    var pc = pecaPorChave(categoriaArrastada || ev.dataTransfer.getData("text/plain"));
    var u = uNoPonto(ev.clientY);
    if (!pc || u == null) return null;
    // O ponteiro marca o topo do equipamento.
    var base = vista.inverter ? u : u - pc.altura + 1;
    return { cat: pc, u: Math.max(1, base) };
  }
  elPalco.addEventListener("dragover", function (ev) {
    if (!rackAtual()) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
    var p = posicaoDeSoltura(ev);
    if (!p) { mostrarFantasma(null); return; }
    mostrarFantasma(p.u, p.cat.altura, E.verificarPosicaoRack(rackAtual(), { u: p.u, alturaU: p.cat.altura }).ok);
  });
  elPalco.addEventListener("dragleave", function (ev) { if (!elPalco.contains(ev.relatedTarget)) mostrarFantasma(null); });
  elPalco.addEventListener("drop", function (ev) {
    ev.preventDefault();
    var p = posicaoDeSoltura(ev);
    mostrarFantasma(null);
    categoriaArrastada = null;
    var rack = rackAtual();
    if (!p || !rack) return;
    instalarPeca(rack, p.cat, p.u);
  });

  // Teclado: setas movem 1U, Delete remove, Esc limpa a seleção.
  elPalco.addEventListener("keydown", function (ev) {
    var achado = sel.item ? itemPorId(sel.item) : null;
    if (ev.key === "Escape") { sel = { rack: sel.rack, item: null, u: null }; render(); return; }
    if (!achado) return;
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      ev.preventDefault();
      var passo = (ev.key === "ArrowUp") !== vista.inverter ? 1 : -1;
      moverItem(achado.item.id, achado.rack.id, achado.item.u + passo);
    } else if (ev.key === "Delete") {
      ev.preventDefault();
      var btn = elProps.querySelector('[data-rk="remover-item"]');
      if (btn) btn.click();
    }
  });

  // ---- exportação ------------------------------------------------------------------
  // Página técnica: cabeçalho (projeto, rack, local), o rack e o inventário ao lado.
  function svgDeDocumento(rack, face) {
    var d = desenharRack(rack, { zoom: 1, face: face || vista.face, inverter: vista.inverter, cabos: vista.cabos, fotos: vista.fotos, nomesAoLado: vista.nomes, x: 30, y: 96, exportar: true });
    var oc = E.ocupacaoRack(rack);
    var xTabela = 30 + d.largura + 30;
    var larguraTabela = 520;
    var itens = (rack.itens || []).slice().sort(function (a, b) { return b.u - a.u; });
    var alturaTabela = 40 + itens.length * 16 + 60;
    var largura = xTabela + larguraTabela + 30;
    var altura = Math.max(96 + d.altura + 40, 96 + alturaTabela);
    var t = [];
    function txt(x, y, s, tam, extra) {
      extra = extra || "";
      t.push('<text x="' + x + '" y="' + y + '" font-size="' + tam + '"' + (/\bfill=/.test(extra) ? "" : ' fill="#1A2733"') + " " + extra + '>' + esc(s) + '</text>');
    }
    t.push('<rect width="' + largura + '" height="' + altura + '" fill="#FFFFFF"/>');
    t.push('<g font-family="Helvetica, Arial, sans-serif">');
    txt(30, 34, rack.nome, 20, 'font-weight="bold"');
    txt(30, 54, [app.projetoAtual(), rack.local, rack.patrimonio ? "Patrimônio " + rack.patrimonio : "", NOMES_STATUS[rack.status]].filter(Boolean).join("  |  "), 11, 'fill="#4A5560"');
    txt(30, 72, rack.alturaU + "U  |  " + oc.ocupadas + "U ocupadas, " + oc.livres + "U livres (" + Math.round(oc.ocupadas / rack.alturaU * 100) + "%)  |  " +
      ((face || vista.face) === "frente" ? "Vista frontal" : "Vista traseira") + "  |  " + [rack.fabricante, rack.modelo].filter(Boolean).join(" ") + "  |  " + hoje(), 11, 'fill="#4A5560"');
    t.push('<line x1="30" y1="82" x2="' + (largura - 30) + '" y2="82" stroke="#D5DCE3"/>');
    txt(xTabela, 108, "Equipamentos instalados", 13, 'font-weight="bold"');
    var cols = [0, 70, 120, 290, 430];
    ["Posição", "Cat.", "Nome", "Fabricante / modelo", "Patrimônio"].forEach(function (c, i) { txt(xTabela + cols[i], 128, c, 9, 'fill="#5A6672" font-weight="bold"'); });
    itens.forEach(function (it, i) {
      var y = 146 + i * 16;
      if (i % 2 === 0) t.push('<rect x="' + (xTabela - 4) + '" y="' + (y - 11) + '" width="' + larguraTabela + '" height="16" fill="#F3F6F9"/>');
      var cat = CATEGORIAS[it.categoria] || CATEGORIAS.personalizado;
      txt(xTabela + cols[0], y, faixaUTexto(it) + (it.face !== "ambas" ? (it.face === "frente" ? " (F)" : " (T)") : ""), 9);
      txt(xTabela + cols[1], y, cat.sigla, 9, 'font-weight="bold"');
      txt(xTabela + cols[2], y, it.nome.slice(0, 30) + (it.estado !== "instalado" ? " [" + NOMES_ESTADO[it.estado] + "]" : ""), 9);
      txt(xTabela + cols[3], y, [it.fabricante, it.modelo].filter(Boolean).join(" ").slice(0, 26), 9);
      txt(xTabela + cols[4], y, (it.patrimonio || "").slice(0, 16), 9);
    });
    var yLivres = 146 + itens.length * 16 + 18;
    txt(xTabela, yLivres, "U livres: " + (livresDoRack(rack).faixas.join(", ") || "nenhuma"), 10, 'fill="#1E6B3A"');
    if (rack.obs) txt(xTabela, yLivres + 18, "Obs.: " + rack.obs.slice(0, 110), 9, 'fill="#4A5560"');
    t.push('</g>');
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + largura + '" height="' + altura + '" viewBox="0 0 ' + largura + ' ' + altura + '">' + DEFS + t.join("") + d.svg + '</svg>', largura: largura, altura: altura };
  }

  function svgParaPng(doc) {
    return new Promise(function (resolver, rejeitar) {
      var img = new Image();
      img.onload = function () {
        var escala = 2;
        var c = document.createElement("canvas");
        c.width = doc.largura * escala; c.height = doc.altura * escala;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? resolver(b) : rejeitar(new Error("Não foi possível gerar a imagem.")); }, "image/png");
      };
      img.onerror = function () { rejeitar(new Error("Não foi possível gerar a imagem.")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(doc.svg);
    });
  }

  async function exportar(formato, racks) {
    if (!racks.length) { mensagem("Crie um rack antes de exportar.", true); return; }
    try {
      if (formato === "svg") {
        app.baixarArquivo(new Blob([svgDeDocumento(racks[0]).svg], { type: "image/svg+xml" }), nomeArquivo(racks[0].nome, "svg"));
      } else if (formato === "png") {
        app.baixarArquivo(await svgParaPng(svgDeDocumento(racks[0])), nomeArquivo(racks[0].nome, "png"));
      } else {
        mensagem("Gerando PDF…");
        var JsPdf = await app.bibliotecasPdf();
        var pdf = null;
        var suporte = document.createElement("div");
        suporte.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
        document.body.appendChild(suporte);
        try {
          for (var i = 0; i < racks.length; i++) {
            var doc = svgDeDocumento(racks[i]);
            var paisagem = doc.largura > doc.altura;
            if (!pdf) pdf = new JsPdf({ orientation: paisagem ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
            else pdf.addPage("a4", paisagem ? "landscape" : "portrait");
            var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), margem = 8;
            var escala = Math.min((pw - margem * 2) / doc.largura, (ph - margem * 2) / doc.altura);
            suporte.innerHTML = doc.svg;
            await pdf.svg(suporte.firstChild, { x: (pw - doc.largura * escala) / 2, y: margem, width: doc.largura * escala, height: doc.altura * escala });
          }
          pdf.setProperties({ title: app.projetoAtual() + " - racks", creator: "Grafo" });
          app.baixarArquivo(pdf.output("blob"), nomeArquivo(racks.length > 1 ? app.projetoAtual() + "-racks" : racks[0].nome, "pdf"));
        } finally { suporte.remove(); }
      }
      mensagem(formato.toUpperCase() + " baixado.");
    } catch (e) {
      mensagem("Não foi possível exportar: " + e.message, true);
    }
  }

  function exportarRelatorio() {
    if (!window.GrafoPlanilha) { mensagem("O gerador de planilha não carregou. Recarregue a página.", true); return; }
    if (!dados.racks.length) { mensagem("Crie um rack antes de gerar o relatório.", true); return; }
    var abas = [
      { nome: "Racks", colunas: ["Rack", "Local", "Patrimônio", "Status", "Fabricante", "Modelo", "Altura (U)", "Ocupadas", "Livres", "Ocupação %", "Equipamentos", "U livres", "Observações"],
        linhas: dados.racks.map(function (r) { var l = livresDoRack(r); return [r.nome, r.local, r.patrimonio, NOMES_STATUS[r.status], r.fabricante, r.modelo, r.alturaU, l.oc.ocupadas, l.oc.livres, Math.round(l.oc.ocupadas / r.alturaU * 100), (r.itens || []).length, l.faixas.join(", "), r.obs]; }) },
      { nome: "Equipamentos", colunas: ["Rack", "Local", "U inicial", "U final", "Altura (U)", "Face", "Nome", "Categoria", "Fabricante", "Modelo", "Patrimônio", "Estado", "Portas", "Tipo de porta", "Largura", "Profundidade", "Observações"],
        linhas: [] },
      { nome: "Unidades U", colunas: ["Rack", "U", "Situação", "Frente", "Traseira"], linhas: [] },
      { nome: "Cabos físicos", colunas: ["Identificação", "Tipo", "Rack origem", "Origem", "Porta origem", "Rack destino", "Destino", "Porta destino", "Comprimento", "Observações"], linhas: [] }
    ];
    dados.racks.forEach(function (r) {
      (r.itens || []).slice().sort(function (a, b) { return b.u - a.u; }).forEach(function (it) {
        abas[1].linhas.push([r.nome, r.local, it.u, it.u + it.alturaU - 1, it.alturaU, NOMES_FACE[it.face], it.nome, (CATEGORIAS[it.categoria] || {}).rotulo, it.fabricante, it.modelo, it.patrimonio, NOMES_ESTADO[it.estado], it.portas, it.tipoPorta, it.largura, it.profundidade, it.obs]);
      });
      var oc = E.ocupacaoRack(r);
      for (var u = r.alturaU; u >= 1; u--) {
        var frente = oc.porU[u].filter(function (it) { return it.face !== "tras"; }).map(function (it) { return it.nome; }).join(", ");
        var tras = oc.porU[u].filter(function (it) { return it.face !== "frente"; }).map(function (it) { return it.nome; }).join(", ");
        abas[2].linhas.push([r.nome, u, oc.porU[u].length ? "Ocupada" : "Livre", frente, tras]);
      }
    });
    dados.cabos.forEach(function (c) {
      var a = itemPorId(c.deItem), b = itemPorId(c.paraItem);
      abas[3].linhas.push([c.etiqueta, NOMES_CABO[c.tipo], a ? a.rack.nome : "", a ? a.item.nome : "", a ? nomePorta(a.item, c.dePorta) : c.dePorta, b ? b.rack.nome : "", b ? b.item.nome : "", b ? nomePorta(b.item, c.paraPorta) : c.paraPorta, c.comprimento, c.obs]);
    });
    app.baixarArquivo(new Blob([window.GrafoPlanilha.gerarXlsx(abas)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeArquivo(app.projetoAtual() + "-racks", "xlsx"));
    mensagem("Relatório baixado.");
  }

  // ---- sincronia com o editor (abrir projeto, desfazer, colega da equipe) --------
  function recarregar() {
    var d = app.racksDoProjeto();
    dados = { racks: d.racks, cabos: d.cabos };
    render();
  }
  window.addEventListener("grafo:render", recarregar);
  recarregar();

  // Para testes e integrações: o estado atual do editor de racks.
  window.GrafoRacks = { selecionar: function (rackId, itemId) { sel = { rack: rackId, item: itemId || null, u: null }; render(); }, dados: function () { return clonar(dados); } };
})();
