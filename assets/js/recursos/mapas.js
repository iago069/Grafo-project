/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0. */
// Mapas: outra aplicação dentro do Grafo (aba "Mapas", ao lado de Diagrama e
// Biblioteca). Mapa geográfico de verdade (Web Mercator, mapa de fundo em tiles)
// com pontos (POPs, torres, clientes...) coloridos pelo status e traçados
// (backbone, fibras, rotas) em camadas.
// - Dados: { mapas: [{ id, nome, pontos, linhas, camadas }], atual }
//     ponto: { id, nome, codigo, lat, lon, status, cidade, endereco, obs, info: {chave: valor}, equipamentos: [{nome,tipo,ip}], origem }
//     linha: { id, nome, camada, c: [lon×1e5, lat×1e5, Δlon, Δlat, ...] }  (inteiros, compacto)
//     camada: { id, nome, cor, tracejado, visivel }
// - Vem de: KMZ/KML (Google Earth), GeoJSON, CSV ou JSON; ponto a ponto no mapa;
//   e os equipamentos do diagrama aberto que têm município (posição pelo IBGE).
// - Importar de novo com o mesmo código (ou nome) atualiza o ponto: é assim que o
//   status do monitoramento entra (exporta um CSV do Zabbix/NetBox e importa).
//   Traçados de uma camada que já existe substituem os antigos dessa camada.
// - Logado: tabela grafo_mapas (uma linha por pessoa) + cópia no navegador.
//   Sem login: só no navegador.
(function () {
  "use strict";
  var app = window.GrafoApp;
  if (!app || document.getElementById("telaMapas")) return;

  var STATUS = [
    { id: "falha", nome: "Fora do ar" },
    { id: "alerta", nome: "Alerta" },
    { id: "atencao", nome: "Atenção" },
    { id: "ok", nome: "Normal" },
    { id: "sem", nome: "Sem status" }
  ];
  var ORDEM_STATUS = { falha: 0, alerta: 1, atencao: 2, ok: 3, sem: 4 };
  var CORES_CAMADA = ["#0A8E9B", "#7656CC", "#E0622F", "#2F80ED", "#C2185B", "#3BA55C", "#B8860B", "#52606B"];
  var LIMITE_CARACTERES = 4000000; // mapas inteiros salvos (cabe na nuvem e no navegador)
  var CREDITO_OSM = "© colaboradores do OpenStreetMap";
  // Mapas de fundo sem chave de API. O credito vai no canto do mapa e na imagem exportada.
  var FUNDOS = {
    ruas: { nome: "Ruas", max: 19, credito: "Mapa © Esri, HERE, Garmin, " + CREDITO_OSM,
      url: function (z, x, y) { return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/" + z + "/" + y + "/" + x; } },
    osm: { nome: "OpenStreetMap", max: 19, credito: CREDITO_OSM,
      url: function (z, x, y) { return "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png"; } },
    satelite: { nome: "Satélite", max: 19, credito: "Imagens © Esri, Maxar, Earthstar Geographics",
      url: function (z, x, y) { return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x; } },
    nenhum: null
  };
  var URL_IBGE = "https://servicodados.ibge.gov.br/api/";

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function novoId(p) { return p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function avisar(t) { if (app.avisar) app.avisar(t); }
  function auth() { return window.GrafoAuth; }
  function cliente() { var a = auth(); return a && a.client ? a.client() : null; }
  function usuario() { var a = auth(); return a && a.userId ? a.userId() : null; }
  function limitar(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function numero(v) {
    if (typeof v === "number") return v;
    var t = String(v == null ? "" : v).trim().replace(/\s/g, "");
    if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
    return t === "" ? NaN : Number(t);
  }
  function coordValida(lat, lon) { return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0); }
  function perguntar(texto, padrao, titulo) {
    if (app.janela) return app.janela({ title: titulo || "Mapas", message: texto, defaultValue: padrao || "", kind: "prompt", confirmText: "Salvar" }).then(function (v) { return v ? String(v).trim() : null; });
    var v = window.prompt(texto, padrao || ""); return Promise.resolve(v === null ? null : v.trim());
  }
  function confirmar(texto, titulo, botao) {
    if (app.janela) return app.janela({ title: titulo || "Confirmar", message: texto, kind: "confirm", confirmText: botao || "Excluir" }).then(function (v) { return !!v; });
    return Promise.resolve(window.confirm(texto));
  }

  // Status escrito de vários jeitos (Zabbix, NetBox, planilhas) → um dos cinco.
  function lerStatus(v) {
    var t = semAcento(v);
    if (!t) return null;
    if (ORDEM_STATUS[t] !== undefined) return t;
    if (/^\d$/.test(t)) { var n = Number(t); return n >= 5 ? "falha" : n === 4 ? "alerta" : n >= 2 ? "atencao" : "ok"; }
    if (/fora|down|offline|off-line|falha|sem resposta|desastre|disaster|critic|parado|vermelho|indisponivel/.test(t)) return "falha";
    if (/alerta|alta|alto|high|major|laranja/.test(t)) return "alerta";
    if (/atencao|warning|aviso|media|medio|average|minor|amarelo|manutencao/.test(t)) return "atencao";
    if (/^(ok|up|online|on-line|normal|ativo|active|verde|operacional|funcionando)$/.test(t)) return "ok";
    return "sem";
  }
  function nomeStatus(id) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return STATUS[i].nome; return "Sem status"; }

  // ---- projeção (Web Mercator, mundo de 0 a 1) ------------------------------------
  function mx(lon) { return (lon + 180) / 360; }
  function my(lat) { var s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
  function lonDe(x) { return x * 360 - 180; }
  function latDe(y) { return (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * 180 / Math.PI; }

  // Traçado: lista de [lon, lat] → inteiros com deslocamento (bem menor no JSON) e de volta.
  function codificar(coords) {
    var c = [], ax = 0, ay = 0;
    coords.forEach(function (p, i) {
      var x = Math.round(p[0] * 1e5), y = Math.round(p[1] * 1e5);
      if (i && x === ax && y === ay) return;
      if (!c.length) c.push(x, y); else c.push(x - ax, y - ay);
      ax = x; ay = y;
    });
    return c;
  }
  function decodificar(c) {
    var r = [], x = 0, y = 0;
    for (var i = 0; i + 1 < c.length; i += 2) { x += c[i]; y += c[i + 1]; r.push([x / 1e5, y / 1e5]); }
    return r;
  }
  // Douglas-Peucker em graus: tira pontos que não mudam o desenho (~2 m).
  function simplificar(pts, tol) {
    if (pts.length < 3) return pts;
    var manter = new Uint8Array(pts.length), pilha = [[0, pts.length - 1]];
    manter[0] = manter[pts.length - 1] = 1;
    while (pilha.length) {
      var par = pilha.pop(), a = pts[par[0]], b = pts[par[1]], maior = 0, idx = -1;
      var dx = b[0] - a[0], dy = b[1] - a[1], d2 = dx * dx + dy * dy;
      for (var i = par[0] + 1; i < par[1]; i++) {
        var p = pts[i], t = d2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d2 : 0;
        t = limitar(t, 0, 1);
        var ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1], d = ex * ex + ey * ey;
        if (d > maior) { maior = d; idx = i; }
      }
      if (idx > 0 && maior > tol * tol) { manter[idx] = 1; pilha.push([par[0], idx], [idx, par[1]]); }
    }
    return pts.filter(function (_, i) { return manter[i]; });
  }

  // ---- dados e sincronização ------------------------------------------------------
  var dados = { mapas: [], atual: null };
  var chaveCache = "grafo-mapas:" + (usuario() || "convidado");
  var timerSalvar = null, salvandoNuvem = false;
  function normalizarMapa(m) {
    m = m && typeof m === "object" ? m : {};
    var camadas = (Array.isArray(m.camadas) ? m.camadas : []).filter(function (c) { return c && c.id; }).map(function (c, i) {
      return { id: String(c.id), nome: String(c.nome || "Camada"), cor: /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : CORES_CAMADA[i % CORES_CAMADA.length], tracejado: !!c.tracejado, visivel: c.visivel !== false };
    });
    var pontos = (Array.isArray(m.pontos) ? m.pontos : []).filter(function (p) { return p && coordValida(Number(p.lat), Number(p.lon)); }).map(function (p) {
      return { id: String(p.id || novoId("pt")), nome: String(p.nome || ""), codigo: String(p.codigo || ""), lat: Number(p.lat), lon: Number(p.lon),
        status: ORDEM_STATUS[p.status] !== undefined ? p.status : "sem", cidade: String(p.cidade || ""), endereco: String(p.endereco || ""), obs: String(p.obs || ""),
        info: p.info && typeof p.info === "object" ? p.info : {}, equipamentos: Array.isArray(p.equipamentos) ? p.equipamentos : [], origem: String(p.origem || "") };
    });
    var linhas = (Array.isArray(m.linhas) ? m.linhas : []).filter(function (l) { return l && Array.isArray(l.c) && l.c.length >= 4; }).map(function (l) {
      return { id: String(l.id || novoId("ln")), nome: String(l.nome || ""), camada: String(l.camada || ""), c: l.c };
    });
    return { id: String(m.id || novoId("mp")), nome: String(m.nome || "Mapa"), pontos: pontos, linhas: linhas, camadas: camadas };
  }
  function normalizar(d) {
    d = d && typeof d === "object" ? d : {};
    var mapas = (Array.isArray(d.mapas) ? d.mapas : []).map(normalizarMapa);
    return { mapas: mapas, atual: mapas.some(function (m) { return m.id === d.atual; }) ? d.atual : (mapas[0] ? mapas[0].id : null) };
  }
  try { dados = normalizar(JSON.parse(localStorage.getItem(chaveCache))); } catch (e) {}
  function salvar() {
    var texto = JSON.stringify(dados);
    try { localStorage.setItem(chaveCache, texto); } catch (e) { if (!usuario()) avisar("O mapa é grande demais para guardar neste navegador. Entre na conta para salvar na nuvem."); }
    var sb = cliente(), uid = usuario();
    if (!sb || !uid) return;
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () {
      timerSalvar = null;
      salvandoNuvem = true;
      sb.from("grafo_mapas").upsert({ user_id: uid, dados: dados, atualizado_em: new Date().toISOString() }).then(function (r) {
        salvandoNuvem = false;
        if (r.error) avisar("Os mapas ficaram salvos só neste navegador: " + r.error.message);
      });
    }, 800);
  }
  function carregarDaNuvem() {
    var sb = cliente(), uid = usuario();
    if (!sb || !uid) return Promise.resolve();
    return sb.from("grafo_mapas").select("dados").eq("user_id", uid).maybeSingle().then(function (r) {
      if (r.error || !r.data || !r.data.dados || salvandoNuvem || timerSalvar) return;
      dados = normalizar(r.data.dados);
      try { localStorage.setItem(chaveCache, JSON.stringify(dados)); } catch (e) {}
    });
  }
  function mapa() { for (var i = 0; i < dados.mapas.length; i++) if (dados.mapas[i].id === dados.atual) return dados.mapas[i]; return null; }
  function garantirMapa() {
    var m = mapa();
    if (m) return m;
    m = normalizarMapa({ nome: "Meu mapa" });
    dados.mapas.push(m);
    dados.atual = m.id;
    return m;
  }
  function camadaPorNome(m, nome, cor) {
    var chave = semAcento(nome);
    for (var i = 0; i < m.camadas.length; i++) if (semAcento(m.camadas[i].nome) === chave) return m.camadas[i];
    var c = { id: novoId("cm"), nome: nome || "Traçados", cor: cor || CORES_CAMADA[m.camadas.length % CORES_CAMADA.length], tracejado: false, visivel: true };
    m.camadas.push(c);
    return c;
  }
  function camada(m, id) { for (var i = 0; i < m.camadas.length; i++) if (m.camadas[i].id === id) return m.camadas[i]; return null; }
  function chavePonto(p) { return p.codigo ? "c:" + semAcento(p.codigo) : "n:" + semAcento(p.nome) + "|" + semAcento(p.origem); }

  // Junta o que veio de um arquivo no mapa atual. Devolve um resumo para o aviso.
  function juntar(lido, nomeArquivo) {
    var m = garantirMapa(), novos = 0, atualizados = 0, porChave = {};
    m.pontos.forEach(function (p) { porChave[chavePonto(p)] = p; });
    (lido.pontos || []).forEach(function (p) {
      var ex = porChave[chavePonto(p)];
      if (!ex) {
        if (!coordValida(p.lat, p.lon)) return;
        var novo = normalizarMapa({ pontos: [p] }).pontos[0];
        m.pontos.push(novo); porChave[chavePonto(novo)] = novo; novos++;
        return;
      }
      if (coordValida(p.lat, p.lon)) { ex.lat = p.lat; ex.lon = p.lon; }
      ["nome", "cidade", "endereco", "obs"].forEach(function (k) { if (p[k]) ex[k] = p[k]; });
      if (p.status) ex.status = p.status;
      if (p.info) Object.assign(ex.info, p.info);
      if (p.equipamentos) ex.equipamentos = p.equipamentos;
      atualizados++;
    });
    var substituidas = {};
    (lido.linhas || []).forEach(function (l) {
      var c = camadaPorNome(m, l.camada || nomeArquivo || "Traçados", l.cor);
      if (!substituidas[c.id]) { substituidas[c.id] = true; m.linhas = m.linhas.filter(function (x) { return x.camada !== c.id; }); }
      var pts = simplificar(l.coords, 0.00002);
      if (pts.length >= 2) m.linhas.push({ id: novoId("ln"), nome: l.nome || "", camada: c.id, c: codificar(pts) });
    });
    return { novos: novos, atualizados: atualizados, linhas: (lido.linhas || []).length };
  }

  // ---- leitura de arquivos ---------------------------------------------------------
  // ZIP (KMZ) sem biblioteca: diretório central + DecompressionStream("deflate-raw").
  function lerZip(buffer) {
    var dv = new DataView(buffer), u8 = new Uint8Array(buffer), fim = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error("O arquivo não é um KMZ (ZIP) válido.");
    var n = dv.getUint16(fim + 10, true), p = dv.getUint32(fim + 16, true), itens = [];
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var metodo = dv.getUint16(p + 10, true), tamanho = dv.getUint32(p + 20, true);
      var lenNome = dv.getUint16(p + 28, true), lenExtra = dv.getUint16(p + 30, true), lenComent = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
      var nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + lenNome));
      var inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      itens.push({ nome: nome, metodo: metodo, dados: u8.subarray(inicio, inicio + tamanho) });
      p += 46 + lenNome + lenExtra + lenComent;
    }
    return itens;
  }
  async function descompactar(item) {
    if (item.metodo === 0) return item.dados;
    if (item.metodo !== 8 || typeof DecompressionStream === "undefined") throw new Error("Este navegador não abre esse KMZ. Salve como KML no Google Earth.");
    var fluxo = new Blob([item.dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }
  function filho(el, nome) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === nome) return c; return null; }
  function textoDe(el, nome) { var f = el && filho(el, nome); return f ? f.textContent.trim() : ""; }
  function todos(el, nome) { return Array.prototype.slice.call(el.getElementsByTagNameNS("*", nome)); }
  function coordsKml(texto) {
    return String(texto || "").trim().split(/\s+/).map(function (t) { var a = t.split(","); return [Number(a[0]), Number(a[1])]; })
      .filter(function (c) { return coordValida(c[1], c[0]); });
  }
  function corKml(t) { t = String(t || "").trim(); return /^[0-9a-f]{8}$/i.test(t) ? "#" + t.slice(6, 8) + t.slice(4, 6) + t.slice(2, 4) : null; }
  // Descrição do KML (às vezes HTML) → texto. Tira as tags antes; o textarea só
  // traduz as entidades (&amp;...), sem criar elemento nenhum.
  function textoSimples(html) {
    var t = document.createElement("textarea");
    t.innerHTML = String(html || "").replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]*>/g, "");
    return t.value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
  }
  function lerKml(texto, nomeArquivo) {
    var doc = new DOMParser().parseFromString(texto, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("O KML está com defeito (XML inválido).");
    var cores = {};
    todos(doc, "Style").forEach(function (s) {
      var id = s.getAttribute("id"), ls = filho(s, "LineStyle") || filho(s, "PolyStyle");
      var cor = ls && corKml(textoDe(ls, "color"));
      if (id && cor) cores["#" + id] = cor;
    });
    todos(doc, "StyleMap").forEach(function (sm) {
      var id = sm.getAttribute("id");
      todos(sm, "Pair").forEach(function (par) { if (textoDe(par, "key") === "normal" && cores[textoDe(par, "styleUrl")]) cores["#" + id] = cores[textoDe(par, "styleUrl")]; });
    });
    var pontos = [], linhas = [];
    todos(doc, "Placemark").forEach(function (pm) {
      var nome = textoDe(pm, "name"), pasta = "", el = pm.parentNode;
      while (el && el.localName !== "kml") { if (el.localName === "Folder" && textoDe(el, "name")) { pasta = textoDe(el, "name"); break; } el = el.parentNode; }
      var estilo = filho(pm, "Style"), cor = cores[textoDe(pm, "styleUrl")] || (estilo && filho(estilo, "LineStyle") && corKml(textoDe(filho(estilo, "LineStyle"), "color")));
      var info = {};
      todos(pm, "Data").forEach(function (d) { var v = textoDe(d, "value"); if (d.getAttribute("name") && v) info[d.getAttribute("name")] = v; });
      todos(pm, "SimpleData").forEach(function (d) { if (d.getAttribute("name") && d.textContent.trim()) info[d.getAttribute("name")] = d.textContent.trim(); });
      var camadaNome = pasta || nomeArquivo;
      todos(pm, "Point").forEach(function (pt) {
        var c = coordsKml(textoDe(pt, "coordinates"))[0];
        if (!c) return;
        pontos.push({ nome: nome || "Ponto", codigo: info.codigo || info.code || "", lat: c[1], lon: c[0], status: lerStatus(info.status), cidade: info.cidade || info.municipio || "",
          obs: textoSimples(textoDe(pm, "description")), info: info });
      });
      todos(pm, "LineString").forEach(function (ls) { var c = coordsKml(textoDe(ls, "coordinates")); if (c.length >= 2) linhas.push({ nome: nome, camada: camadaNome, cor: cor, coords: c }); });
      todos(pm, "Polygon").forEach(function (pg) {
        var anel = filho(pg, "outerBoundaryIs"); anel = anel && todos(anel, "coordinates")[0];
        var c = anel ? coordsKml(anel.textContent) : [];
        if (c.length >= 2) linhas.push({ nome: nome, camada: camadaNome, cor: cor, coords: c });
      });
    });
    return { pontos: pontos, linhas: linhas };
  }
  function propriedade(props, nomes) {
    var chaves = Object.keys(props || {}), alvo = nomes.map(semAcento);
    for (var i = 0; i < chaves.length; i++) if (alvo.indexOf(semAcento(chaves[i])) >= 0 && props[chaves[i]] != null && String(props[chaves[i]]).trim()) return String(props[chaves[i]]).trim();
    return "";
  }
  var CAMPOS = {
    nome: ["nome", "name", "titulo", "title", "site", "pop", "host", "local", "descricao"],
    codigo: ["codigo", "code", "sigla", "id", "slug", "identificador"],
    lat: ["lat", "latitude", "y"],
    lon: ["lon", "lng", "long", "longitude", "x"],
    status: ["status", "estado", "situacao", "severidade", "severity"],
    cidade: ["cidade", "municipio", "city"],
    endereco: ["endereco", "address", "logradouro"],
    obs: ["obs", "observacao", "observacoes", "notas", "comentario"],
    camada: ["camada", "layer", "grupo", "categoria"]
  };
  var CONHECIDOS = Object.keys(CAMPOS).reduce(function (a, k) { return a.concat(CAMPOS[k]); }, []);
  function pontoDeProps(props, lat, lon) {
    var info = {};
    Object.keys(props || {}).forEach(function (k) { var v = props[k]; if (CONHECIDOS.indexOf(semAcento(k)) < 0 && v != null && typeof v !== "object" && String(v).trim()) info[k] = String(v).trim(); });
    return { nome: propriedade(props, CAMPOS.nome), codigo: propriedade(props, CAMPOS.codigo), lat: lat, lon: lon, status: lerStatus(propriedade(props, CAMPOS.status)),
      cidade: propriedade(props, CAMPOS.cidade), endereco: propriedade(props, CAMPOS.endereco), obs: propriedade(props, CAMPOS.obs), info: info };
  }
  function lerGeoJson(obj, nomeArquivo) {
    var feicoes = obj.type === "FeatureCollection" ? obj.features : obj.type === "Feature" ? [obj] : [];
    var pontos = [], linhas = [];
    (feicoes || []).forEach(function (f) {
      var g = f && f.geometry, props = (f && f.properties) || {};
      if (!g) return;
      var camadaNome = propriedade(props, CAMPOS.camada) || nomeArquivo, nome = propriedade(props, CAMPOS.nome);
      var cor = /^#[0-9a-f]{6}$/i.test(props.stroke || props.cor) ? (props.stroke || props.cor) : null;
      function linha(cs) { var c = (cs || []).filter(function (p) { return coordValida(p[1], p[0]); }); if (c.length >= 2) linhas.push({ nome: nome, camada: camadaNome, cor: cor, coords: c }); }
      if (g.type === "Point") pontos.push(pontoDeProps(props, Number(g.coordinates[1]), Number(g.coordinates[0])));
      else if (g.type === "MultiPoint") g.coordinates.forEach(function (c) { pontos.push(pontoDeProps(props, Number(c[1]), Number(c[0]))); });
      else if (g.type === "LineString") linha(g.coordinates);
      else if (g.type === "MultiLineString") g.coordinates.forEach(linha);
      else if (g.type === "Polygon") linha(g.coordinates[0]);
      else if (g.type === "MultiPolygon") g.coordinates.forEach(function (p) { linha(p[0]); });
    });
    return { pontos: pontos, linhas: linhas };
  }
  // CSV com ; , ou tab, aspas e vírgula decimal. Precisa de colunas de latitude e longitude
  // (ou uma "coordenadas" com "lat, lon"), a não ser que só atualize pontos que já existem.
  function lerCsv(texto) {
    texto = texto.replace(/^﻿/, "");
    var primeira = texto.split(/\r?\n/)[0] || "";
    var sep = [";", "\t", ","].sort(function (a, b) { return primeira.split(b).length - primeira.split(a).length; })[0];
    var linhas = [], campo = "", linha = [], aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (aspas) { if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch; continue; }
      if (ch === '"') aspas = true;
      else if (ch === sep) { linha.push(campo); campo = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && texto[i + 1] === "\n") i++; linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
      else campo += ch;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    linhas = linhas.filter(function (l) { return l.some(function (c) { return c.trim(); }); });
    if (linhas.length < 2) throw new Error("A planilha está vazia ou sem cabeçalho.");
    var cab = linhas[0].map(function (c) { return c.trim(); }), pontos = [];
    var colCoord = cab.findIndex(function (c) { return /^(coordenadas?|coords?|lat\s*[,/;]\s*lon(g|gitude)?)$/.test(semAcento(c)); });
    linhas.slice(1).forEach(function (l) {
      var props = {};
      cab.forEach(function (c, j) { props[c] = (l[j] || "").trim(); });
      var lat = numero(propriedade(props, CAMPOS.lat)), lon = numero(propriedade(props, CAMPOS.lon));
      if ((!isFinite(lat) || !isFinite(lon)) && colCoord >= 0) {
        var m = /(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/.exec(l[colCoord] || "");
        if (m) { lat = numero(m[1]); lon = numero(m[2]); }
      }
      if (colCoord >= 0) delete props[cab[colCoord]];
      pontos.push(pontoDeProps(props, lat, lon));
    });
    return { pontos: pontos.filter(function (p) { return p.nome || p.codigo; }) };
  }
  async function lerArquivo(arquivo) {
    var nomeBase = arquivo.name.replace(/\.[^.]+$/, ""), ext = (arquivo.name.split(".").pop() || "").toLowerCase();
    if (ext === "kmz") {
      var itens = lerZip(await arquivo.arrayBuffer());
      var kml = itens.find(function (i) { return /(^|\/)doc\.kml$/i.test(i.nome); }) || itens.find(function (i) { return /\.kml$/i.test(i.nome); });
      if (!kml) throw new Error("Não há nenhum KML dentro do KMZ.");
      return lerKml(new TextDecoder().decode(await descompactar(kml)), nomeBase);
    }
    var texto = await arquivo.text();
    if (ext === "kml" || /^\s*<\?xml|^\s*<kml/i.test(texto)) return lerKml(texto, nomeBase);
    if (ext === "geojson" || ext === "json" || /^\s*[[{]/.test(texto)) {
      var obj = JSON.parse(texto);
      if (obj && (obj.type === "FeatureCollection" || obj.type === "Feature")) return lerGeoJson(obj, nomeBase);
      if (obj && Array.isArray(obj.mapas)) return { mapas: obj.mapas };
      var lista = Array.isArray(obj) ? obj : obj && (obj.pontos || obj.pops || obj.sites || obj.results);
      if (!Array.isArray(lista)) throw new Error("O JSON precisa ser GeoJSON ou uma lista de pontos com latitude e longitude.");
      return { pontos: lista.map(function (o) { return pontoDeProps(o, numero(propriedade(o, CAMPOS.lat)), numero(propriedade(o, CAMPOS.lon))); }).filter(function (p) { return p.nome || p.codigo; }) };
    }
    return lerCsv(texto);
  }
  async function importar(arquivos) {
    var total = { novos: 0, atualizados: 0, linhas: 0 }, erros = [];
    for (var i = 0; i < arquivos.length; i++) {
      var a = arquivos[i];
      try {
        var lido = await lerArquivo(a);
        if (lido.mapas) { // backup dos mapas (Exportar → Todos os mapas)
          lido.mapas.map(normalizarMapa).forEach(function (m) { m.id = novoId("mp"); dados.mapas.push(m); dados.atual = m.id; });
          total.novos += lido.mapas.reduce(function (s, m) { return s + ((m.pontos || []).length); }, 0);
          continue;
        }
        var r = juntar(lido, a.name.replace(/\.[^.]+$/, ""));
        total.novos += r.novos; total.atualizados += r.atualizados; total.linhas += r.linhas;
      } catch (e) { erros.push(a.name + ": " + (e && e.message || e)); }
    }
    if (JSON.stringify(dados).length > LIMITE_CARACTERES) {
      try { dados = normalizar(JSON.parse(localStorage.getItem(chaveCache))); } catch (e) {}
      avisar("O mapa ficaria grande demais (mais de 4 MB). Importe só as camadas que precisa, ou simplifique o KMZ.");
      atualizarTudo();
      return;
    }
    salvar();
    precisaEnquadrar = true;
    atualizarTudo();
    var partes = [];
    if (total.novos) partes.push(total.novos + (total.novos === 1 ? " ponto novo" : " pontos novos"));
    if (total.atualizados) partes.push(total.atualizados + (total.atualizados === 1 ? " atualizado" : " atualizados"));
    if (total.linhas) partes.push(total.linhas + (total.linhas === 1 ? " traçado" : " traçados"));
    if (erros.length) avisar("Não foi possível ler " + erros.join("; "));
    else avisar(partes.length ? "Importado: " + partes.join(", ") + "." : "Nada com latitude e longitude nesse arquivo.");
  }

  // ---- equipamentos do diagrama (pelo município, posição do IBGE) -----------------
  var cacheIbge = {};
  try { cacheIbge = JSON.parse(localStorage.getItem("grafo-mapas-ibge")) || {}; } catch (e) {}
  function slugMunicipio(nome) { return semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  async function centroDoMunicipio(nome, ufPreferida) {
    var slug = slugMunicipio(nome);
    if (!slug) return null;
    if (cacheIbge[slug] && (!ufPreferida || cacheIbge[slug].uf === ufPreferida)) return cacheIbge[slug];
    var r = await fetch(URL_IBGE + "v1/localidades/municipios/" + slug + "?view=nivelado", { cache: "force-cache" });
    if (!r.ok) return null;
    var lista = await r.json();
    lista = Array.isArray(lista) ? lista : [lista];
    var m = lista.find(function (x) { return x && x["UF-sigla"] === ufPreferida; }) || lista[0];
    if (!m || !m["municipio-id"]) return null;
    var meta = await (await fetch(URL_IBGE + "v3/malhas/municipios/" + m["municipio-id"] + "/metadados", { cache: "force-cache" })).json();
    var c = meta && meta[0] && meta[0].centroide;
    if (!c) return null;
    var achado = { lat: c.latitude, lon: c.longitude, uf: m["UF-sigla"], nome: m["municipio-nome"], ambiguo: lista.length > 1 };
    cacheIbge[slug] = achado;
    try { localStorage.setItem("grafo-mapas-ibge", JSON.stringify(cacheIbge)); } catch (e) {}
    return achado;
  }
  async function trazerDoDiagrama() {
    var projeto = app.projetoAtual ? app.projetoAtual() : "";
    var eqs = (app.equipamentosDoDiagrama ? app.equipamentosDoDiagrama() : []).filter(function (e) { return e.municipio; });
    if (!eqs.length) { avisar("Nenhum equipamento do diagrama aberto tem município. Preencha o Município no equipamento (ou use Montar mapa no diagrama)."); return; }
    var grupos = {};
    eqs.forEach(function (e) { var k = slugMunicipio(e.municipio); (grupos[k] = grupos[k] || { nome: e.municipio, eqs: [] }).eqs.push(e); });
    var lista = Object.keys(grupos).map(function (k) { return grupos[k]; }), ufs = {}, falhas = [];
    botaoDiagrama.disabled = true;
    try {
      // Primeiro os nomes sem dúvida; a UF mais comum desempata os repetidos (Bom Jesus, São Pedro...).
      for (var i = 0; i < lista.length; i += 4) {
        await Promise.all(lista.slice(i, i + 4).map(async function (g) {
          try { g.centro = await centroDoMunicipio(g.nome); if (g.centro && !g.centro.ambiguo) ufs[g.centro.uf] = (ufs[g.centro.uf] || 0) + 1; } catch (e) { g.centro = null; }
        }));
      }
      var uf = Object.keys(ufs).sort(function (a, b) { return ufs[b] - ufs[a]; })[0];
      for (var j = 0; j < lista.length; j++) {
        var g = lista[j];
        if (g.centro && g.centro.ambiguo && uf && g.centro.uf !== uf) { try { g.centro = await centroDoMunicipio(g.nome, uf); } catch (e) {} }
        if (!g.centro) falhas.push(g.nome);
      }
    } finally { botaoDiagrama.disabled = false; }
    var pontos = lista.filter(function (g) { return g.centro; }).map(function (g) {
      var st = g.eqs.some(function (e) { return e.status === "offline"; }) ? "falha" : g.eqs.some(function (e) { return e.status === "manutencao"; }) ? "atencao" : "ok";
      return { nome: g.centro.nome, cidade: g.centro.nome + " / " + g.centro.uf, lat: g.centro.lat, lon: g.centro.lon, status: st, origem: projeto,
        info: { Diagrama: projeto, Equipamentos: String(g.eqs.length) },
        equipamentos: g.eqs.map(function (e) { return { nome: e.nome, tipo: e.tipo, ip: e.ip || "", status: e.status || "ativo" }; }) };
    });
    var r = juntar({ pontos: pontos }, projeto);
    salvar();
    precisaEnquadrar = true;
    atualizarTudo();
    avisar((r.novos + r.atualizados) + (r.novos + r.atualizados === 1 ? " cidade" : " cidades") + " do diagrama no mapa (posição no centro do município, pelo IBGE)" +
      (falhas.length ? ". Não achei: " + falhas.join(", ") : "."));
  }

  // ---- tela ------------------------------------------------------------------------
  var raiz = document.createElement("section");
  raiz.id = "telaMapas";
  raiz.className = "mapas";
  raiz.setAttribute("aria-label", "Mapas");
  raiz.innerHTML =
    '<div class="mp-topo">' +
      '<div class="mp-mapas"><select id="mpMapa" aria-label="Mapa aberto" title="Trocar de mapa"></select>' +
        '<button class="ghost ferramenta" type="button" data-mp="novo" data-icone="mais" data-dica="Novo mapa" aria-label="Novo mapa">+</button>' +
        '<button class="ghost ferramenta" type="button" data-mp="renomear" data-icone="renomear" data-dica="Renomear mapa" aria-label="Renomear mapa">✎</button>' +
        '<button class="ghost ferramenta" type="button" data-mp="excluir" data-icone="lixeira" data-dica="Excluir mapa" aria-label="Excluir mapa">×</button></div>' +
      '<input type="search" id="mpBusca" placeholder="Buscar ponto, código, cidade, equipamento…" autocomplete="off" aria-label="Buscar no mapa">' +
      '<div class="mp-acoes">' +
        '<button class="ghost small botao-com-icone" type="button" data-mp="importar" data-icone="enviar" title="KMZ ou KML (Google Earth), GeoJSON, CSV ou JSON. Importar de novo atualiza os pontos com o mesmo código ou nome.">Importar</button>' +
        '<input type="file" id="mpArquivo" accept=".kmz,.kml,.geojson,.json,.csv,.txt" multiple hidden>' +
        '<button class="ghost small botao-com-icone" type="button" data-mp="diagrama" data-icone="grade" title="Põe no mapa as cidades dos equipamentos do diagrama aberto (campo Município)">Do diagrama</button>' +
        '<button class="ghost small botao-com-icone" type="button" data-mp="ponto" data-icone="mais" aria-pressed="false" title="Clique no mapa para criar um ponto">Ponto</button>' +
        '<div class="menu-ancora"><button class="ghost small botao-com-icone" type="button" id="mpExportarBotao" data-icone="baixar" aria-haspopup="menu" aria-expanded="false">Exportar</button>' +
          '<div class="menu-flutuante mp-menu" id="mpExportarMenu" role="menu" hidden>' +
            '<button class="menu-item" type="button" role="menuitem" data-mp="png" data-icone="imagem">Imagem do mapa (.png)</button>' +
            '<button class="menu-item" type="button" role="menuitem" data-mp="geojson" data-icone="vetor">Mapa em GeoJSON (Google Earth, QGIS)</button>' +
            '<button class="menu-item" type="button" role="menuitem" data-mp="csv" data-icone="baixar">Pontos em planilha (.csv)</button>' +
            '<button class="menu-item" type="button" role="menuitem" data-mp="backup" data-icone="pacote">Todos os mapas (backup .json)</button>' +
          '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="mp-corpo">' +
      '<div class="mp-palco" id="mpPalco">' +
        '<canvas id="mpCanvas" tabindex="0" aria-label="Mapa. Arraste para mover, role ou use + e − para aproximar."></canvas>' +
        '<div class="mp-zoom"><button type="button" data-mp="mais" aria-label="Aproximar">+</button><button type="button" data-mp="menos" aria-label="Afastar">−</button><button type="button" data-mp="tudo" aria-label="Ver tudo" title="Ver tudo">⤢</button></div>' +
        '<div class="mp-legenda" id="mpLegenda"></div>' +
        '<div class="mp-escala" id="mpEscala"><span></span><i></i></div>' +
        '<div class="mp-credito" id="mpCredito"></div>' +
        '<div class="mp-dica" id="mpDica" hidden></div>' +
        '<div class="mp-vazio" id="mpVazio" hidden><strong>Comece um mapa</strong><p>Importe um <b>KMZ/KML</b> do Google Earth, um <b>GeoJSON</b> ou uma planilha <b>CSV</b> com latitude e longitude. ' +
          'Ou traga as cidades dos equipamentos do diagrama, ou clique em <b>Ponto</b> e marque no mapa.</p></div>' +
      '</div>' +
      '<aside class="mp-painel" aria-label="Pontos do mapa">' +
        '<div class="mp-chips" id="mpChips" role="group" aria-label="Filtrar por status"></div>' +
        '<div class="mp-abas" role="tablist">' +
          '<button type="button" role="tab" data-mp-aba="pontos" aria-selected="true">Pontos <span id="mpNPontos"></span></button>' +
          '<button type="button" role="tab" data-mp-aba="detalhe" aria-selected="false">Detalhe</button>' +
          '<button type="button" role="tab" data-mp-aba="camadas" aria-selected="false">Camadas <span id="mpNCamadas"></span></button>' +
        '</div>' +
        '<div class="mp-vistas" id="mpVistas"></div>' +
      '</aside>' +
    '</div>';
  var workspace = document.querySelector(".workspace");
  if (workspace && workspace.parentNode) workspace.parentNode.insertBefore(raiz, workspace);
  else document.body.appendChild(raiz);

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("mpCanvas"), palco = $("mpPalco"), ctx = canvas.getContext("2d");
  var selMapa = $("mpMapa"), busca = $("mpBusca"), vistas = $("mpVistas"), dica = $("mpDica");
  var botaoDiagrama = raiz.querySelector('[data-mp="diagrama"]'), botaoPonto = raiz.querySelector('[data-mp="ponto"]');

  var pref = { fundo: "ruas", filtro: {}, rotulos: true };
  try { Object.assign(pref, JSON.parse(localStorage.getItem("grafo-mapas-pref")) || {}); } catch (e) {}
  if (!(pref.fundo in FUNDOS)) pref.fundo = "ruas";
  function salvarPref() { try { localStorage.setItem("grafo-mapas-pref", JSON.stringify(pref)); } catch (e) {} }

  var vista = { escala: 0, x: 0, y: 0 }; // tela = mundo × escala + deslocamento
  var W = 0, H = 0, DPR = 1, aba = "pontos", selecionado = null, sobre = null, modo = null, precisaEnquadrar = true;
  var cores = {}, caminhos = null, origem = { x: 0, y: 0 }, visiveis = [];
  var LOCAL = 1e6; // traçados em unidades locais (precisão do Path2D)

  function lerCores() {
    var cs = getComputedStyle(raiz);
    ["--mp-fundo", "--mp-rotulo", "--mp-halo", "--mp-borda", "--mp-falha", "--mp-alerta", "--mp-atencao", "--mp-ok", "--mp-sem", "--mp-sel"].forEach(function (k) { cores[k] = cs.getPropertyValue(k).trim(); });
  }
  function corStatus(s) { return cores["--mp-" + s] || "#888"; }

  // Dados do mapa atual prontos para desenhar (projetados), refeitos quando mudam.
  function preparar() {
    var m = mapa(), minX = Infinity, minY = Infinity;
    caminhos = {};
    if (!m) return;
    m.pontos.forEach(function (p) {
      p._x = mx(p.lon); p._y = my(p.lat);
      p._busca = semAcento([p.nome, p.codigo, p.cidade, p.endereco, p.obs].concat(Object.keys(p.info).map(function (k) { return p.info[k]; }), p.equipamentos.map(function (e) { return e.nome + " " + (e.ip || ""); })).join(" "));
      if (p._x < minX) minX = p._x; if (p._y < minY) minY = p._y;
    });
    m.linhas.forEach(function (l) {
      l._p = decodificar(l.c).map(function (c) { return [mx(c[0]), my(c[1])]; });
      l._p.forEach(function (q) { if (q[0] < minX) minX = q[0]; if (q[1] < minY) minY = q[1]; });
    });
    origem = { x: isFinite(minX) ? minX : 0, y: isFinite(minY) ? minY : 0 };
    m.linhas.forEach(function (l) {
      var cam = caminhos[l.camada] = caminhos[l.camada] || new Path2D();
      l._p.forEach(function (q, i) { var x = (q[0] - origem.x) * LOCAL, y = (q[1] - origem.y) * LOCAL; if (i) cam.lineTo(x, y); else cam.moveTo(x, y); });
    });
  }
  function filtrados() {
    var m = mapa();
    if (!m) return [];
    var q = semAcento(busca.value), termos = q.split(/\s+/).filter(Boolean);
    return m.pontos.filter(function (p) {
      if (pref.filtro[p.status] === false) return false;
      for (var i = 0; i < termos.length; i++) if (p._busca.indexOf(termos[i]) < 0) return false;
      return true;
    });
  }
  function limites(lista, comLinhas) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function inc(x, y) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
    lista.forEach(function (p) { inc(p._x, p._y); });
    var m = mapa();
    if (comLinhas && m) m.linhas.forEach(function (l) { var c = camada(m, l.camada); if (c && c.visivel) l._p.forEach(function (q) { inc(q[0], q[1]); }); });
    return isFinite(b.x0) ? b : null;
  }
  function enquadrar(b) {
    if (!W || !H) return;
    // Sem nada: o Brasil.
    if (!b) b = { x0: mx(-74), x1: mx(-34), y0: my(5.5), y1: my(-34) };
    var margem = 48, lx = Math.max(b.x1 - b.x0, 1e-6), ly = Math.max(b.y1 - b.y0, 1e-6);
    var escala = Math.min((W - margem * 2) / lx, (H - margem * 2) / ly);
    vista.escala = limitar(escala, 256, 256 * Math.pow(2, 16));
    vista.x = W / 2 - (b.x0 + b.x1) / 2 * vista.escala;
    vista.y = H / 2 - (b.y0 + b.y1) / 2 * vista.escala;
    pedirDesenho();
  }
  function zoomEm(fator, sx, sy) {
    var nova = limitar(vista.escala * fator, 256, 256 * Math.pow(2, 20));
    vista.x = sx - (sx - vista.x) * (nova / vista.escala);
    vista.y = sy - (sy - vista.y) * (nova / vista.escala);
    vista.escala = nova;
    pedirDesenho();
  }
  function irAte(p, zoomMinimo) {
    var alvo = Math.max(vista.escala, zoomMinimo || 256 * Math.pow(2, 13)), de = { escala: vista.escala, x: vista.x, y: vista.y };
    var para = { escala: alvo, x: W / 2 - p._x * alvo, y: H / 2 - p._y * alvo }, t0 = performance.now();
    (function passo(agora) {
      var t = Math.min(1, (agora - t0) / 380), e = 1 - Math.pow(1 - t, 3);
      // Interpola no logaritmo da escala, com o ponto indo em linha reta para o centro.
      vista.escala = de.escala * Math.pow(para.escala / de.escala, e);
      var cx = (W / 2 - de.x) / de.escala + ((p._x) - (W / 2 - de.x) / de.escala) * e, cy = (H / 2 - de.y) / de.escala + ((p._y) - (H / 2 - de.y) / de.escala) * e;
      vista.x = W / 2 - cx * vista.escala; vista.y = H / 2 - cy * vista.escala;
      desenhar();
      if (t < 1) requestAnimationFrame(passo);
    })(t0);
  }

  // ---- tiles do mapa de fundo ----
  var tiles = new Map(), estatTiles = {};
  function tile(chave, z, x, y, carregar) {
    var id = chave + "/" + z + "/" + x + "/" + y, t = tiles.get(id);
    if (t || !carregar) return t;
    var st = estatTiles[chave] = estatTiles[chave] || { ok: 0, erro: 0 };
    t = { img: new Image(), ok: false };
    t.img.crossOrigin = "anonymous"; // para a imagem exportada (o servidor libera CORS)
    t.img.decoding = "async";
    t.img.onload = function () { t.ok = true; st.ok++; pedirDesenho(); };
    t.img.onerror = function () { st.erro++; atualizarCredito(); };
    t.img.src = FUNDOS[chave].url(z, x, y);
    tiles.set(id, t);
    if (tiles.size > 700) { var it = tiles.keys(); for (var i = 0; i < 250; i++) tiles.delete(it.next().value); }
    return t;
  }
  function fundoFunciona() { var st = estatTiles[pref.fundo]; return !!FUNDOS[pref.fundo] && !(st && st.erro >= 6 && st.ok === 0); }
  function desenharFundo() {
    var f = FUNDOS[pref.fundo];
    if (!f || !fundoFunciona()) return;
    var z = limitar(Math.round(Math.log2(vista.escala / 256)), 0, f.max), n = Math.pow(2, z), lado = vista.escala / n;
    var x0 = Math.max(0, Math.floor(-vista.x / lado)), x1 = Math.min(n - 1, Math.floor((W - vista.x) / lado));
    var y0 = Math.max(0, Math.floor(-vista.y / lado)), y1 = Math.min(n - 1, Math.floor((H - vista.y) / lado));
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      var dx = tx * lado + vista.x, dy = ty * lado + vista.y, t = tile(pref.fundo, z, tx, ty, true);
      if (t.ok) { ctx.drawImage(t.img, dx, dy, lado + 0.5, lado + 0.5); continue; }
      // Enquanto carrega: o pedaço do tile de um nível acima, ampliado.
      for (var d = 1; d <= 5 && z - d >= 0; d++) {
        var pai = tile(pref.fundo, z - d, tx >> d, ty >> d, false);
        if (pai && pai.ok) {
          var f2 = Math.pow(2, d), lw = pai.img.naturalWidth / f2, lh = pai.img.naturalHeight / f2;
          ctx.drawImage(pai.img, (tx - ((tx >> d) << d)) * lw, (ty - ((ty >> d) << d)) * lh, lw, lh, dx, dy, lado + 0.5, lado + 0.5);
          break;
        }
      }
    }
  }

  // ---- desenho ----
  var pedido = false;
  function pedirDesenho() { if (pedido) return; pedido = true; requestAnimationFrame(function () { pedido = false; desenhar(); }); }
  function medir() {
    var r = palco.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    if (W !== r.width || H !== r.height) {
      var cx = W ? (W / 2 - vista.x) / vista.escala : null, cy = H ? (H / 2 - vista.y) / vista.escala : null;
      W = r.width; H = r.height;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      if (cx !== null && vista.escala) { vista.x = W / 2 - cx * vista.escala; vista.y = H / 2 - cy * vista.escala; }
    }
    return true;
  }
  function desenhar(paraExportar) {
    if (document.body.getAttribute("data-vista") !== "mapas" && !paraExportar) return;
    if (!medir()) return;
    if (precisaEnquadrar) { precisaEnquadrar = false; enquadrar(limites(mapa() ? mapa().pontos : [], true)); }
    var m = mapa();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = cores["--mp-fundo"];
    ctx.fillRect(0, 0, W, H);
    desenharFundo();
    if (!m) { atualizarEscala(); return; }
    var s = vista.escala / LOCAL;
    // Traçados: Path2D em unidades locais, a transformação faz o zoom.
    m.camadas.forEach(function (c) {
      if (!c.visivel || !caminhos[c.id]) return;
      ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (origem.x * vista.escala + vista.x), DPR * (origem.y * vista.escala + vista.y));
      var largura = limitar(Math.log2(vista.escala / 256) / 4, 1.2, 3.2);
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.strokeStyle = cores["--mp-halo"]; ctx.lineWidth = (largura + 2) / s; ctx.setLineDash([]); ctx.globalAlpha = 0.55;
      ctx.stroke(caminhos[c.id]);
      ctx.globalAlpha = 1; ctx.strokeStyle = c.cor; ctx.lineWidth = largura / s;
      ctx.setLineDash(c.tracejado ? [6 / s, 4 / s] : []);
      ctx.stroke(caminhos[c.id]);
    });
    ctx.setLineDash([]);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Pontos: os piores por cima.
    var lista = filtrados().sort(function (a, b) { return ORDEM_STATUS[b.status] - ORDEM_STATUS[a.status]; });
    var raio = limitar(2.5 + Math.log2(vista.escala / 256) * 0.45, 3.5, 8);
    visiveis = [];
    lista.forEach(function (p) {
      var x = p._x * vista.escala + vista.x, y = p._y * vista.escala + vista.y;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return;
      visiveis.push({ p: p, x: x, y: y });
      if (p.status === "falha") { ctx.beginPath(); ctx.arc(x, y, raio + 4, 0, Math.PI * 2); ctx.strokeStyle = corStatus("falha"); ctx.lineWidth = 2; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y, raio, 0, Math.PI * 2);
      if (p.status === "sem") { ctx.fillStyle = cores["--mp-halo"]; ctx.fill(); ctx.strokeStyle = corStatus("sem"); ctx.lineWidth = 2.2; ctx.stroke(); }
      else { ctx.fillStyle = corStatus(p.status); ctx.fill(); ctx.strokeStyle = cores["--mp-borda"]; ctx.lineWidth = 1.2; ctx.stroke(); }
    });
    [sobre, selecionado].forEach(function (p, i) {
      if (!p || pref.filtro[p.status] === false) return;
      var x = p._x * vista.escala + vista.x, y = p._y * vista.escala + vista.y;
      ctx.beginPath(); ctx.arc(x, y, raio + (i ? 6 : 4), 0, Math.PI * 2);
      ctx.strokeStyle = cores["--mp-sel"]; ctx.lineWidth = i ? 3 : 2; ctx.stroke();
    });
    // Nomes: só os que cabem sem encostar (selecionado e piores primeiro).
    if (pref.rotulos && (visiveis.length <= 60 || vista.escala >= 256 * Math.pow(2, 9))) {
      ctx.font = "600 12px " + (getComputedStyle(raiz).getPropertyValue("--sans") || "sans-serif");
      ctx.textBaseline = "middle";
      var ocupados = [], ordem = visiveis.slice().sort(function (a, b) { return (b.p === selecionado) - (a.p === selecionado) || ORDEM_STATUS[a.p.status] - ORDEM_STATUS[b.p.status]; });
      ordem.slice(0, 400).forEach(function (v) {
        var texto = v.p.codigo || v.p.nome;
        if (!texto) return;
        var w = ctx.measureText(texto).width, cx = v.x + raio + 5, caixa = [cx - 2, v.y - 8, cx + w + 2, v.y + 8];
        if (cx + w > W) { cx = v.x - raio - 5 - w; caixa = [cx - 2, v.y - 8, cx + w + 2, v.y + 8]; }
        for (var i = 0; i < ocupados.length; i++) { var o = ocupados[i]; if (caixa[0] < o[2] && caixa[2] > o[0] && caixa[1] < o[3] && caixa[3] > o[1]) return; }
        ocupados.push(caixa);
        ctx.lineWidth = 3.5; ctx.strokeStyle = cores["--mp-halo"]; ctx.lineJoin = "round"; ctx.strokeText(texto, cx, v.y);
        ctx.fillStyle = cores["--mp-rotulo"]; ctx.fillText(texto, cx, v.y);
      });
    }
    atualizarEscala();
  }
  function atualizarEscala() {
    var el = $("mpEscala");
    if (!vista.escala || !H) return;
    var lat = latDe((H / 2 - vista.y) / vista.escala), mPorPx = 40075016.686 * Math.cos(lat * Math.PI / 180) / vista.escala;
    var alvo = mPorPx * 100, base = Math.pow(10, Math.floor(Math.log10(alvo))), passo = [1, 2, 5, 10].find(function (k) { return k * base >= alvo * 0.6; }) * base;
    el.firstChild.textContent = passo >= 1000 ? (passo / 1000).toLocaleString("pt-BR") + " km" : passo + " m";
    el.lastChild.style.width = Math.round(passo / mPorPx) + "px";
  }
  function atualizarCredito() {
    var f = FUNDOS[pref.fundo], el = $("mpCredito");
    el.hidden = !f;
    el.textContent = f ? (fundoFunciona() ? f.credito : "O mapa de fundo não carregou (sem internet ou bloqueado). Os pontos continuam aqui.") : "";
    el.classList.toggle("erro", !!f && !fundoFunciona());
  }

  // ---- interação no mapa ----
  var ponteiros = new Map(), gesto = null;
  function pontoMaisPerto(sx, sy, raioMax) {
    var melhor = null, d = raioMax * raioMax;
    visiveis.forEach(function (v) { var dx = v.x - sx, dy = v.y - sy, dd = dx * dx + dy * dy; if (dd <= d) { d = dd; melhor = v.p; } });
    return melhor;
  }
  function posicao(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    ponteiros.set(e.pointerId, posicao(e));
    esconderDica();
    if (ponteiros.size === 1) gesto = { tipo: "arrasto", inicio: posicao(e), ultimo: posicao(e), moveu: false };
    else if (ponteiros.size === 2) {
      var ps = Array.from(ponteiros.values());
      gesto = { tipo: "pinca", dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), centro: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }, moveu: true };
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    var p = posicao(e);
    if (!ponteiros.has(e.pointerId)) {
      var achado = pontoMaisPerto(p.x, p.y, 12);
      if (achado !== sobre) { sobre = achado; pedirDesenho(); }
      canvas.style.cursor = modo ? "crosshair" : achado ? "pointer" : "grab";
      if (achado && e.pointerType === "mouse") mostrarDica(achado, p); else esconderDica();
      return;
    }
    ponteiros.set(e.pointerId, p);
    if (gesto && gesto.tipo === "arrasto" && ponteiros.size === 1) {
      if (Math.hypot(p.x - gesto.inicio.x, p.y - gesto.inicio.y) > 4) gesto.moveu = true;
      if (!gesto.moveu) return;
      vista.x += p.x - gesto.ultimo.x; vista.y += p.y - gesto.ultimo.y;
      gesto.ultimo = p;
      canvas.style.cursor = "grabbing";
      pedirDesenho();
    } else if (gesto && gesto.tipo === "pinca" && ponteiros.size === 2) {
      var ps = Array.from(ponteiros.values()), dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      var centro = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      vista.x += centro.x - gesto.centro.x; vista.y += centro.y - gesto.centro.y;
      if (gesto.dist > 0) zoomEm(dist / gesto.dist, centro.x, centro.y);
      gesto.dist = dist; gesto.centro = centro;
      pedirDesenho();
    }
  });
  function soltar(e) {
    if (!ponteiros.has(e.pointerId)) return;
    var p = posicao(e), g = gesto;
    ponteiros.delete(e.pointerId);
    if (ponteiros.size === 0) gesto = null;
    else if (ponteiros.size === 1) { var resta = Array.from(ponteiros.values())[0]; gesto = { tipo: "arrasto", inicio: resta, ultimo: resta, moveu: true }; }
    canvas.style.cursor = modo ? "crosshair" : "grab";
    if (e.type === "pointerup" && g && g.tipo === "arrasto" && !g.moveu) clicar(p, e.pointerType);
  }
  canvas.addEventListener("pointerup", soltar);
  canvas.addEventListener("pointercancel", soltar);
  canvas.addEventListener("pointerleave", function () { if (sobre) { sobre = null; pedirDesenho(); } esconderDica(); });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = posicao(e);
    zoomEm(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p.x, p.y);
  }, { passive: false });
  canvas.addEventListener("dblclick", function (e) { var p = posicao(e); zoomEm(2, p.x, p.y); });
  canvas.addEventListener("keydown", function (e) {
    var passo = 80;
    if (e.key === "+" || e.key === "=") zoomEm(1.6, W / 2, H / 2);
    else if (e.key === "-" || e.key === "_") zoomEm(1 / 1.6, W / 2, H / 2);
    else if (e.key === "ArrowLeft") vista.x += passo; else if (e.key === "ArrowRight") vista.x -= passo;
    else if (e.key === "ArrowUp") vista.y += passo; else if (e.key === "ArrowDown") vista.y -= passo;
    else if (e.key === "Escape" && modo) { definirModo(null); return; }
    else return;
    e.preventDefault();
    pedirDesenho();
  });
  function clicar(p, tipo) {
    var lat = latDe((p.y - vista.y) / vista.escala), lon = lonDe((p.x - vista.x) / vista.escala);
    if (modo && modo.tipo === "novo") {
      definirModo(null);
      var m = garantirMapa(), novo = normalizarMapa({ pontos: [{ nome: "Ponto " + (m.pontos.length + 1), lat: lat, lon: lon }] }).pontos[0];
      m.pontos.push(novo);
      salvar(); preparar();
      selecionar(novo, false);
      setTimeout(function () { var campo = vistas.querySelector("[name=nome]"); if (campo) { campo.focus(); campo.select(); } }, 30);
      return;
    }
    if (modo && modo.tipo === "mover") {
      var alvo = modo.ponto;
      definirModo(null);
      alvo.lat = Number(lat.toFixed(6)); alvo.lon = Number(lon.toFixed(6));
      salvar(); preparar();
      selecionar(alvo, false);
      avisar("Ponto movido.");
      return;
    }
    var achado = pontoMaisPerto(p.x, p.y, tipo === "touch" ? 22 : 12);
    if (achado) selecionar(achado, false);
    else if (selecionado) { selecionado = null; renderPainel(); pedirDesenho(); }
  }
  function definirModo(m) {
    modo = m;
    botaoPonto.setAttribute("aria-pressed", String(!!(m && m.tipo === "novo")));
    raiz.classList.toggle("mp-marcando", !!m);
    canvas.style.cursor = m ? "crosshair" : "grab";
    if (m) avisar(m.tipo === "novo" ? "Clique no mapa onde fica o ponto (Esc cancela)." : "Clique no mapa no lugar novo de " + (m.ponto.codigo || m.ponto.nome) + " (Esc cancela).");
  }
  function mostrarDica(p, pos) {
    dica.innerHTML = '<div class="mp-dica-topo">' + bolinha(p.status) + '<strong>' + esc(p.codigo || p.nome) + '</strong></div>' +
      (p.codigo && p.nome ? '<div class="mp-dica-nome">' + esc(p.nome) + '</div>' : '') +
      '<div class="mp-dica-linha">' + esc(nomeStatus(p.status)) + (p.cidade ? " · " + esc(p.cidade) : "") + '</div>' +
      (p.equipamentos.length ? '<div class="mp-dica-linha">' + p.equipamentos.length + (p.equipamentos.length === 1 ? " equipamento" : " equipamentos") + '</div>' : '') +
      '<div class="mp-dica-rodape">Clique para ver os detalhes</div>';
    dica.hidden = false;
    var w = dica.offsetWidth, h = dica.offsetHeight;
    dica.style.left = Math.min(W - w - 8, pos.x + 14) + "px";
    dica.style.top = (pos.y + 14 + h > H ? pos.y - h - 10 : pos.y + 14) + "px";
  }
  function esconderDica() { dica.hidden = true; }

  // ---- painel ----
  function bolinha(s) { return '<span class="mp-bolinha mp-st-' + esc(s) + '" aria-hidden="true"></span>'; }
  function selecionar(p, voar) {
    selecionado = p;
    aba = "detalhe";
    renderPainel();
    if (voar) irAte(p); else pedirDesenho();
  }
  function renderChips() {
    var m = mapa(), contagem = {};
    (m ? m.pontos : []).forEach(function (p) { contagem[p.status] = (contagem[p.status] || 0) + 1; });
    $("mpChips").innerHTML = STATUS.map(function (s) {
      return '<button type="button" class="mp-chip" data-mp-filtro="' + s.id + '" aria-pressed="' + (pref.filtro[s.id] !== false) + '">' + bolinha(s.id) + esc(s.nome) + ' <b>' + (contagem[s.id] || 0) + '</b></button>';
    }).join("");
  }
  function renderLegenda() {
    var m = mapa();
    $("mpLegenda").innerHTML =
      '<div class="mp-fundos" role="radiogroup" aria-label="Mapa de fundo">' + Object.keys(FUNDOS).map(function (k) {
        return '<button type="button" role="radio" data-mp-fundo="' + k + '" aria-checked="' + (pref.fundo === k) + '">' + (FUNDOS[k] ? FUNDOS[k].nome : "Sem fundo") + '</button>';
      }).join("") + '</div>' +
      (m && m.camadas.length ? '<div class="mp-legenda-camadas">' + m.camadas.map(function (c) {
        return '<label><input type="checkbox" data-mp-camada-ver="' + esc(c.id) + '"' + (c.visivel ? " checked" : "") + '><span class="mp-traco' + (c.tracejado ? " tracejado" : "") + '" style="border-color:' + esc(c.cor) + '"></span>' + esc(c.nome) + '</label>';
      }).join("") + '</div>' : '') +
      '<label class="mp-legenda-rotulos"><input type="checkbox" data-mp-rotulos' + (pref.rotulos ? " checked" : "") + '> Nomes dos pontos</label>';
  }
  function renderLista() {
    var lista = filtrados().sort(function (a, b) { return ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status] || (a.codigo || a.nome).localeCompare(b.codigo || b.nome, "pt-BR"); });
    $("mpNPontos").textContent = lista.length;
    if (!lista.length) return '<p class="mp-nada">' + (mapa() && mapa().pontos.length ? "Nenhum ponto com esse filtro." : "Ainda não há pontos neste mapa.") + '</p>';
    return '<ul class="mp-lista">' + lista.slice(0, 600).map(function (p) {
      var sub = [p.cidade, p.equipamentos.length ? p.equipamentos.length + " equip." : "", p.endereco].filter(Boolean).join(" · ");
      return '<li><button type="button" class="mp-item' + (p === selecionado ? " sel" : "") + '" data-mp-ponto="' + esc(p.id) + '">' + bolinha(p.status) +
        '<span class="mp-item-l1">' + (p.codigo ? '<b>' + esc(p.codigo) + '</b>' : '') + '<span>' + esc(p.nome) + '</span></span>' +
        (sub ? '<span class="mp-item-l2">' + esc(sub) + '</span>' : '') + '</button></li>';
    }).join("") + '</ul>' + (lista.length > 600 ? '<p class="mp-nada">Mostrando 600 de ' + lista.length + '. Use a busca.</p>' : '');
  }
  function renderDetalhe() {
    var p = selecionado;
    if (!p) return '<p class="mp-nada">Clique num ponto do mapa ou da lista.</p>';
    var info = Object.keys(p.info);
    return '<form class="mp-detalhe" data-mp-form>' +
      '<div class="mp-det-topo">' + bolinha(p.status) + '<h2>' + esc(p.codigo || p.nome || "Ponto") + '</h2></div>' +
      '<div class="mp-det-acoes">' +
        '<button type="button" class="ghost small" data-mp="centralizar">Centralizar</button>' +
        '<button type="button" class="ghost small" data-mp="mover">Mover no mapa</button>' +
        '<button type="button" class="ghost small" data-mp="google">Google Maps</button>' +
      '</div>' +
      '<div class="mp-campos">' +
        '<label>Nome<input name="nome" value="' + esc(p.nome) + '" maxlength="120"></label>' +
        '<label>Código<input name="codigo" value="' + esc(p.codigo) + '" maxlength="60" placeholder="Ex.: POP-CENTRO"></label>' +
        '<label>Status<select name="status">' + STATUS.map(function (s) { return '<option value="' + s.id + '"' + (p.status === s.id ? " selected" : "") + '>' + esc(s.nome) + '</option>'; }).join("") + '</select></label>' +
        '<label>Cidade<input name="cidade" value="' + esc(p.cidade) + '" maxlength="120"></label>' +
        '<label class="mp-largo">Endereço<input name="endereco" value="' + esc(p.endereco) + '" maxlength="200"></label>' +
        '<label>Latitude<input name="lat" value="' + p.lat + '" inputmode="decimal"></label>' +
        '<label>Longitude<input name="lon" value="' + p.lon + '" inputmode="decimal"></label>' +
        '<label class="mp-largo">Observações<textarea name="obs" rows="3" maxlength="2000">' + esc(p.obs) + '</textarea></label>' +
      '</div>' +
      (p.equipamentos.length ? '<div class="mp-bloco"><h3>Equipamentos' + (p.origem ? " do diagrama " + esc(p.origem) : "") + '</h3><ul class="mp-equips">' + p.equipamentos.map(function (e) {
        return '<li><span>' + esc(e.nome) + '</span><em>' + esc([e.tipo, e.ip].filter(Boolean).join(" · ")) + '</em></li>';
      }).join("") + '</ul></div>' : '') +
      (info.length ? '<div class="mp-bloco"><h3>Dados importados</h3><dl class="mp-info">' + info.map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(p.info[k]) + '</dd>'; }).join("") + '</dl></div>' : '') +
      '<div class="mp-det-rodape"><button type="submit" class="primary small">Salvar</button><button type="button" class="ghost small perigo" data-mp="excluir-ponto">Excluir ponto</button></div>' +
    '</form>';
  }
  function renderCamadas() {
    var m = mapa();
    $("mpNCamadas").textContent = m && m.camadas.length ? m.camadas.length : "";
    if (!m || !m.camadas.length) return '<p class="mp-nada">Os traçados (linhas) de um KMZ, KML ou GeoJSON aparecem aqui, uma camada por pasta do arquivo.</p>';
    return '<ul class="mp-camadas">' + m.camadas.map(function (c) {
      var n = m.linhas.filter(function (l) { return l.camada === c.id; }).length;
      return '<li data-mp-camada="' + esc(c.id) + '"><input type="checkbox" data-mp-camada-ver="' + esc(c.id) + '"' + (c.visivel ? " checked" : "") + ' aria-label="Mostrar ' + esc(c.nome) + '"><input type="color" value="' + esc(c.cor) + '" data-mp-cor aria-label="Cor de ' + esc(c.nome) + '">' +
        '<span class="mp-camada-nome"><strong>' + esc(c.nome) + '</strong><em>' + n + (n === 1 ? " traçado" : " traçados") + '</em></span>' +
        '<label title="Linha tracejada"><input type="checkbox" data-mp-tracejado' + (c.tracejado ? " checked" : "") + '> tracejada</label>' +
        '<button type="button" class="ghost ferramenta" data-mp="renomear-camada" data-icone="renomear" aria-label="Renomear camada">✎</button>' +
        '<button type="button" class="ghost ferramenta" data-mp="excluir-camada" data-icone="lixeira" aria-label="Excluir camada">×</button></li>';
    }).join("") + '</ul>';
  }
  function renderPainel() {
    raiz.querySelectorAll("[data-mp-aba]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-mp-aba") === aba)); });
    var html = aba === "detalhe" ? renderDetalhe() : aba === "camadas" ? renderCamadas() : renderLista();
    if (aba !== "pontos") renderLista();
    if (aba !== "camadas") renderCamadas();
    vistas.innerHTML = html;
  }
  function renderMapas() {
    selMapa.innerHTML = dados.mapas.length ? dados.mapas.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === dados.atual ? " selected" : "") + '>' + esc(m.nome) + '</option>'; }).join("") : '<option value="">Nenhum mapa</option>';
    raiz.querySelector('[data-mp="renomear"]').disabled = raiz.querySelector('[data-mp="excluir"]').disabled = !dados.mapas.length;
  }
  function atualizarTudo() {
    if (selecionado && (!mapa() || mapa().pontos.indexOf(selecionado) < 0)) selecionado = null;
    preparar();
    renderMapas(); renderChips(); renderLegenda(); renderPainel(); atualizarCredito();
    var m = mapa();
    $("mpVazio").hidden = !!(m && (m.pontos.length || m.linhas.length));
    pedirDesenho();
  }

  // ---- eventos da tela ----
  raiz.addEventListener("click", async function (e) {
    var alvo = e.target.closest("[data-mp],[data-mp-aba],[data-mp-filtro],[data-mp-ponto],[data-mp-fundo]");
    if (!alvo) return;
    if (alvo.hasAttribute("data-mp-aba")) { aba = alvo.getAttribute("data-mp-aba"); renderPainel(); return; }
    if (alvo.hasAttribute("data-mp-filtro")) {
      var s = alvo.getAttribute("data-mp-filtro");
      pref.filtro[s] = pref.filtro[s] === false; salvarPref();
      renderChips(); renderPainel(); pedirDesenho();
      return;
    }
    if (alvo.hasAttribute("data-mp-ponto")) { var m0 = mapa(), id = alvo.getAttribute("data-mp-ponto"); selecionar(m0.pontos.find(function (p) { return p.id === id; }), true); return; }
    if (alvo.hasAttribute("data-mp-fundo")) { pref.fundo = alvo.getAttribute("data-mp-fundo"); salvarPref(); renderLegenda(); atualizarCredito(); pedirDesenho(); return; }
    var acao = alvo.getAttribute("data-mp"), m = mapa(), nome;
    if (acao === "mais") zoomEm(1.6, W / 2, H / 2);
    else if (acao === "menos") zoomEm(1 / 1.6, W / 2, H / 2);
    else if (acao === "tudo") enquadrar(limites(filtrados(), true));
    else if (acao === "novo") {
      nome = await perguntar("Nome do mapa novo:", "Mapa " + (dados.mapas.length + 1), "Novo mapa");
      if (!nome) return;
      var novo = normalizarMapa({ nome: nome });
      dados.mapas.push(novo); dados.atual = novo.id; selecionado = null; precisaEnquadrar = true;
      salvar(); atualizarTudo();
    } else if (acao === "renomear" && m) {
      nome = await perguntar("Novo nome do mapa:", m.nome, "Renomear mapa");
      if (!nome) return;
      m.nome = nome; salvar(); renderMapas();
    } else if (acao === "excluir" && m) {
      if (!await confirmar("Excluir o mapa \"" + m.nome + "\" com " + m.pontos.length + " pontos e " + m.linhas.length + " traçados?", "Excluir mapa")) return;
      dados.mapas = dados.mapas.filter(function (x) { return x !== m; });
      dados.atual = dados.mapas[0] ? dados.mapas[0].id : null; selecionado = null; precisaEnquadrar = true;
      salvar(); atualizarTudo();
    } else if (acao === "importar") $("mpArquivo").click();
    else if (acao === "google" && selecionado) window.open("https://www.google.com/maps/search/?api=1&query=" + selecionado.lat + "," + selecionado.lon, "_blank", "noopener");
    else if (acao === "diagrama") trazerDoDiagrama();
    else if (acao === "ponto") definirModo(modo && modo.tipo === "novo" ? null : { tipo: "novo" });
    else if (acao === "centralizar" && selecionado) irAte(selecionado);
    else if (acao === "mover" && selecionado) definirModo({ tipo: "mover", ponto: selecionado });
    else if (acao === "excluir-ponto" && selecionado) {
      if (!await confirmar("Excluir o ponto \"" + (selecionado.codigo || selecionado.nome) + "\"?", "Excluir ponto")) return;
      m.pontos = m.pontos.filter(function (p) { return p !== selecionado; });
      selecionado = null; aba = "pontos"; salvar(); atualizarTudo();
    } else if (acao === "renomear-camada" || acao === "excluir-camada") {
      var c = camada(m, alvo.closest("[data-mp-camada]").getAttribute("data-mp-camada"));
      if (!c) return;
      if (acao === "renomear-camada") { nome = await perguntar("Nome da camada:", c.nome, "Renomear camada"); if (!nome) return; c.nome = nome; }
      else {
        if (!await confirmar("Excluir a camada \"" + c.nome + "\" e os traçados dela?", "Excluir camada")) return;
        m.camadas = m.camadas.filter(function (x) { return x !== c; });
        m.linhas = m.linhas.filter(function (l) { return l.camada !== c.id; });
      }
      salvar(); atualizarTudo();
    } else if (acao === "png") exportarPng();
    else if (acao === "geojson") exportarGeoJson();
    else if (acao === "csv") exportarCsv();
    else if (acao === "backup") baixar(new Blob([JSON.stringify({ grafo: "mapas", versao: 1, mapas: dados.mapas }, null, 1)], { type: "application/json" }), "grafo-mapas.json");
    if (alvo.closest("#mpExportarMenu")) fecharMenuExportar();
  });
  raiz.addEventListener("change", function (e) {
    var t = e.target, m = mapa();
    if (t === selMapa) { dados.atual = selMapa.value; selecionado = null; precisaEnquadrar = true; salvar(); atualizarTudo(); return; }
    if (t.id === "mpArquivo") { var arqs = Array.prototype.slice.call(t.files || []); t.value = ""; if (arqs.length) importar(arqs); return; }
    if (t.hasAttribute("data-mp-rotulos")) { pref.rotulos = t.checked; salvarPref(); pedirDesenho(); return; }
    var c = null;
    if (t.hasAttribute("data-mp-camada-ver")) c = camada(m, t.getAttribute("data-mp-camada-ver"));
    else if (t.closest("[data-mp-camada]")) c = camada(m, t.closest("[data-mp-camada]").getAttribute("data-mp-camada"));
    if (!c) return;
    if (t.hasAttribute("data-mp-camada-ver")) c.visivel = t.checked;
    if (t.hasAttribute("data-mp-cor")) c.cor = t.value;
    if (t.hasAttribute("data-mp-tracejado")) c.tracejado = t.checked;
    salvar(); renderLegenda(); if (aba === "camadas" && !t.hasAttribute("data-mp-cor")) renderPainel(); pedirDesenho();
  });
  raiz.addEventListener("submit", function (e) {
    if (!e.target.hasAttribute("data-mp-form") || !selecionado) return;
    e.preventDefault();
    var f = e.target, p = selecionado, lat = numero(f.lat.value), lon = numero(f.lon.value);
    if (!coordValida(lat, lon)) { avisar("Latitude e longitude inválidas (ex.: -29,6462 e -52,4072)."); f.lat.focus(); return; }
    p.nome = f.nome.value.trim(); p.codigo = f.codigo.value.trim(); p.status = f.status.value; p.cidade = f.cidade.value.trim();
    p.endereco = f.endereco.value.trim(); p.obs = f.obs.value.trim(); p.lat = lat; p.lon = lon;
    salvar(); preparar(); renderChips(); renderPainel(); pedirDesenho();
    avisar("Ponto salvo.");
  });
  // Arrastar arquivos para cima do mapa também importa.
  palco.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { e.preventDefault(); palco.classList.add("soltando"); } });
  palco.addEventListener("dragleave", function () { palco.classList.remove("soltando"); });
  palco.addEventListener("drop", function (e) { e.preventDefault(); palco.classList.remove("soltando"); var arqs = Array.prototype.slice.call(e.dataTransfer.files || []); if (arqs.length) importar(arqs); });
  var timerBusca = null;
  busca.addEventListener("input", function () {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(function () {
      if (aba !== "pontos") aba = "pontos";
      renderPainel(); pedirDesenho();
      var lista = filtrados();
      if (busca.value.trim() && lista.length && lista.length <= 30) enquadrar(limites(lista, false));
    }, 160);
  });
  busca.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var primeiro = filtrados()[0];
    if (primeiro) selecionar(primeiro, true);
  });
  var botaoExportar = $("mpExportarBotao"), menuExportar = $("mpExportarMenu");
  function fecharMenuExportar() { menuExportar.hidden = true; botaoExportar.setAttribute("aria-expanded", "false"); }
  botaoExportar.addEventListener("click", function (e) { e.stopPropagation(); var abrir = menuExportar.hidden; menuExportar.hidden = !abrir; botaoExportar.setAttribute("aria-expanded", String(abrir)); });
  document.addEventListener("click", function (e) { if (!menuExportar.hidden && !e.target.closest("#mpExportarMenu")) fecharMenuExportar(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (!menuExportar.hidden) fecharMenuExportar(); else if (modo) definirModo(null); } });

  // ---- exportar ----
  function baixar(blob, nome) { if (app.baixarArquivo) app.baixarArquivo(blob, nome); }
  function nomeArquivo(ext) { var m = mapa(); return (semAcento(m ? m.nome : "mapa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapa") + "." + ext; }
  function exportarPng() {
    desenhar(true);
    var f = FUNDOS[pref.fundo];
    if (f && fundoFunciona()) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.font = "11px sans-serif";
      var w = ctx.measureText(f.credito).width + 12;
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(W - w, H - 16, w, 16);
      ctx.fillStyle = "#333"; ctx.textBaseline = "middle"; ctx.fillText(f.credito, W - w + 6, H - 8);
    }
    try {
      canvas.toBlob(function (b) { if (b) baixar(b, nomeArquivo("png")); pedirDesenho(); }, "image/png");
    } catch (e) {
      // O servidor do mapa de fundo não liberou a imagem: exporta só a rede.
      var antes = pref.fundo; pref.fundo = "nenhum"; desenhar(true); pref.fundo = antes;
      canvas.toBlob(function (b) { if (b) baixar(b, nomeArquivo("png")); pedirDesenho(); }, "image/png");
      avisar("O mapa de fundo não pôde ir para a imagem; exportei só os pontos e traçados.");
    }
  }
  function exportarGeoJson() {
    var m = mapa();
    if (!m) return;
    var feicoes = m.pontos.map(function (p) {
      return { type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: Object.assign({}, p.info, { nome: p.nome, codigo: p.codigo, status: p.status, cidade: p.cidade, endereco: p.endereco, obs: p.obs }) };
    }).concat(m.linhas.map(function (l) {
      var c = camada(m, l.camada) || {};
      return { type: "Feature", geometry: { type: "LineString", coordinates: decodificar(l.c) }, properties: { nome: l.nome, camada: c.nome || "", stroke: c.cor || "" } };
    }));
    baixar(new Blob([JSON.stringify({ type: "FeatureCollection", name: m.nome, features: feicoes })], { type: "application/geo+json" }), nomeArquivo("geojson"));
  }
  function exportarCsv() {
    var m = mapa();
    if (!m) return;
    var extras = [];
    m.pontos.forEach(function (p) { Object.keys(p.info).forEach(function (k) { if (extras.indexOf(k) < 0) extras.push(k); }); });
    function cel(v) { v = String(v == null ? "" : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var cab = ["codigo", "nome", "status", "latitude", "longitude", "cidade", "endereco", "obs"].concat(extras);
    var linhas = [cab.join(";")].concat(m.pontos.map(function (p) {
      return [p.codigo, p.nome, p.status, String(p.lat).replace(".", ","), String(p.lon).replace(".", ","), p.cidade, p.endereco, p.obs].concat(extras.map(function (k) { return p.info[k]; })).map(cel).join(";");
    }));
    baixar(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }), nomeArquivo("csv"));
  }

  // ---- mostrar / esconder ----
  function ajustarAltura() {
    if (document.body.getAttribute("data-vista") !== "mapas") return;
    var topo = raiz.getBoundingClientRect().top + window.scrollY;
    raiz.style.setProperty("--mp-altura", Math.max(420, window.innerHeight - topo - 12) + "px");
  }
  function mostrar() {
    lerCores();
    ajustarAltura();
    atualizarTudo();
    requestAnimationFrame(function () { ajustarAltura(); desenhar(); });
  }
  window.addEventListener("resize", function () { ajustarAltura(); pedirDesenho(); });
  // Tema do Grafo mudou: as cores do mapa vêm do CSS.
  new MutationObserver(function () { lerCores(); pedirDesenho(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  if (window.ResizeObserver) new ResizeObserver(function () { pedirDesenho(); }).observe(palco);

  window.GrafoMapas = {
    mostrar: mostrar,
    // Para a paleta de comandos (Ctrl+K).
    candidatos: function () {
      var lista = [];
      dados.mapas.forEach(function (m) {
        lista.push({ titulo: m.nome, sub: "Mapa · " + m.pontos.length + " pontos", grupo: "Mapas", icone: "lista", fazer: function () { dados.atual = m.id; precisaEnquadrar = true; abrirAba(); } });
        m.pontos.forEach(function (p) {
          lista.push({ titulo: p.codigo || p.nome, sub: "Ponto · " + m.nome + (p.cidade ? " · " + p.cidade : ""), grupo: "Mapas", icone: "lista", soBuscando: true, termos: [p.nome, p.cidade, p.endereco].join(" "),
            fazer: function () { dados.atual = m.id; abrirAba(); setTimeout(function () { selecionar(p, true); }, 60); } });
        });
      });
      return lista;
    }
  };
  function abrirAba() { var b = document.querySelector('[data-vista-ir="mapas"]'); if (b) b.click(); else { document.body.setAttribute("data-vista", "mapas"); mostrar(); } }

  if (document.body.getAttribute("data-vista") === "mapas") mostrar();
  carregarDaNuvem().then(function () { if (document.body.getAttribute("data-vista") === "mapas") { precisaEnquadrar = true; atualizarTudo(); } });
})();
