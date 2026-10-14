// Validação e normalização dos dados do Grafo (equipamentos, cabos e projetos).
// Fonte única das regras: os formulários, a importação de JSON/CSV e o
// carregamento do que está salvo no navegador passam todos por aqui.
// Usa o Zod (assets/vendor/zod-*.min.js), carregado antes deste arquivo.
(function (global) {
  "use strict";

  var z = global.Zod && global.Zod.z;
  if (!z) throw new Error("Zod não foi carregado (assets/vendor/zod-*.min.js).");

  // Limites de quantidade e tamanho. Os campos do HTML com data-limite="<chave>"
  // recebem o maxlength daqui (app.js), para tela e importação baterem.
  var LIMITES = {
    projetos: 100,
    nomeProjeto: 60,
    equipamentos: 35, // por diagrama; o app mostra o contador "n/35"
    anotacoes: 50,
    anotacaoTexto: 500,
    conexoes: 2000,
    id: 60,
    nome: 60,
    modelo: 60,
    tipo: 40,
    grupo: 40,
    ip: 45,
    rede: 40,
    icone: 300,
    imagem: 400000, // ~300 KB de imagem em base64 (as enviadas são reduzidas para 256 px)
    porta: 30,
    tipoCabo: 40,
    capacidade: 20,
    grossuraMin: 1,
    grossuraMax: 10,
    coordenada: 20000,
    canvas: { minX: -4200, maxX: 4200, minY: -3200, maxY: 3200 },
    // Bayface de Racks
    racks: 60,
    itensPorRack: 120,
    cabosRack: 3000,
    alturaRackMax: 60,
    portasPorItem: 144,
    textoRack: 60,
    obsRack: 500,
    fotoRack: 340000 // ~250 KB de foto em base64 (o editor reduz e comprime antes)
  };

  var COR_FONTE_PADRAO = "#16323D";
  var COR_CABO_PADRAO = "#5A7284";

  function semAcento(texto) {
    return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  // IPv4 (com máscara /0-32 opcional) ou IPv6 (com /0-128 opcional). Vazio é aceito.
  function ipValido(valor) {
    var ip = String(valor || "").trim();
    if (!ip) return true;
    var partes = ip.split("/");
    if (partes.length > 2) return false;
    var endereco = partes[0], mascara = partes[1];
    var octeto = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
    if (new RegExp("^" + octeto + "(\\." + octeto + "){3}$").test(endereco)) {
      return mascara === undefined || (/^\d{1,2}$/.test(mascara) && Number(mascara) <= 32);
    }
    var ehIpv6 = endereco.indexOf(":") >= 0 && /^[0-9a-fA-F:.]+$/.test(endereco) &&
      endereco.indexOf(":::") < 0 && (endereco.match(/::/g) || []).length <= 1 && endereco.split(":").every(function (g) { return g.length <= 4 || g.indexOf(".") >= 0; });
    return ehIpv6 && (mascara === undefined || (/^\d{1,3}$/.test(mascara) && Number(mascara) <= 128));
  }

  // Capacidade em texto livre, padronizada: "10 gbps" -> "10G", "2,5g" -> "2.5G",
  // "100 Mb" -> "100M", "xgs-pon" -> "XGS-PON".
  function normalizarCapacidade(valor) {
    var texto = String(valor == null ? "" : valor).trim().toUpperCase().replace(/\s+/g, "");
    var m = /^(\d+(?:[.,]\d+)?)([KMGT])(?:BPS|B|BIT\/S)?$/.exec(texto);
    if (m) return m[1].replace(",", ".") + m[2];
    return texto;
  }

  // ---- Campos (Zod) ----------------------------------------------------------
  // Números e booleanos viram texto (ex.: nome 123 -> "123"); null/ausente vira "".
  function paraTexto(v) {
    if (v == null) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return v;
  }

  function texto(max, obrigatorio) {
    var base = z.string({ invalid_type_error: "precisa ser texto" }).trim()
      .max(max, "máximo de " + max + " caracteres");
    if (obrigatorio) base = base.min(1, "obrigatório");
    return z.preprocess(paraTexto, base);
  }

  var ESQUEMA_IP = texto(LIMITES.ip).refine(ipValido, "IP inválido (ex.: 10.0.0.1, 10.0.0.0/24 ou 2001:db8::1)");

  function cor(padrao) {
    return z.preprocess(function (v) {
      if (v == null || v === "") return padrao;
      return typeof v === "string" ? v.trim() : v;
    }, z.string({ invalid_type_error: "precisa ser uma cor como #1A2B3C" })
      .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "cor inválida (use o formato #1A2B3C)")
      .transform(function (c) { return c.length === 4 ? "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c; }));
  }

  // Aceita variações comuns ("Manutenção", "OFFLINE") e grava sempre a forma interna.
  function enumTolerante(valores, apelidos, padrao, mensagem) {
    return z.preprocess(function (v) {
      if (v == null || v === "") return padrao;
      if (typeof v !== "string") return v;
      var chave = semAcento(v).toLowerCase().trim();
      return apelidos[chave] || chave;
    }, z.enum(valores, { errorMap: function () { return { message: mensagem }; } }));
  }

  var ESQUEMA_STATUS = enumTolerante(["ativo", "manutencao", "offline"],
    { "em manutencao": "manutencao", online: "ativo", "on-line": "ativo", "off-line": "offline" },
    "ativo", 'use "ativo", "manutencao" ou "offline"');

  // Modo do projeto: o que o diagrama destaca. Sem modo = topologia.
  // "racks": o projeto abre no Bayface de Racks (disposição física), não no diagrama.
  var MODOS = ["topologia", "redes", "monitoramento", "racks"];
  var ESQUEMA_MODO = enumTolerante(MODOS,
    { rede: "redes", "diagrama de redes": "redes", "diagrama de rede": "redes", "topologia de rede": "topologia",
      monitorar: "monitoramento", "diagrama de monitoramento": "monitoramento",
      rack: "racks", bayface: "racks", "bayface de racks": "racks" },
    "topologia", 'use "topologia", "redes", "monitoramento" ou "racks"');

  var ESQUEMA_ESTILO = enumTolerante(["solid", "dashed", "dotted"],
    { continuo: "solid", solido: "solid", tracejado: "dashed", pontilhado: "dotted" },
    "solid", 'use "solid" (contínuo), "dashed" (tracejado) ou "dotted" (pontilhado)');

  var ESQUEMA_GROSSURA = z.preprocess(function (v) {
    if (v == null || v === "") return 2;
    return typeof v === "string" ? v.trim().replace(",", ".") : v;
  }, z.coerce.number({ invalid_type_error: "precisa ser um número" })
    .finite("precisa ser um número")
    .min(LIMITES.grossuraMin, "mínimo " + LIMITES.grossuraMin)
    .max(LIMITES.grossuraMax, "máximo " + LIMITES.grossuraMax));

  var ESQUEMA_CAPACIDADE = z.preprocess(function (v) {
    return v == null || typeof v === "string" || typeof v === "number" ? normalizarCapacidade(v) : v;
  }, z.string({ invalid_type_error: "precisa ser texto" }).max(LIMITES.capacidade, "máximo de " + LIMITES.capacidade + " caracteres"));

  // Ícone: emoji/símbolo ou caminho de imagem; nunca "javascript:" e afins.
  var ESQUEMA_ICONE = texto(LIMITES.icone).refine(function (v) {
    return !/^[a-z][a-z0-9+.-]*:/i.test(v) || /^(data:image\/|https?:)/i.test(v);
  }, "ícone inválido");

  var ESQUEMA_IMAGEM = z.preprocess(function (v) { return v == null ? "" : v; },
    z.string({ invalid_type_error: "precisa ser texto" })
      .max(LIMITES.imagem, "imagem grande demais (máx. ~300 KB)")
      .refine(function (v) { return !v || /^data:image\/[a-z0-9.+-]+;base64,/i.test(v) || /^https?:\/\//i.test(v) || /^(\.\/)?assets\//i.test(v); },
        "use uma imagem enviada pelo app (data:image/…) ou um endereço http(s)"));

  // Posições são geradas pelo app: se vierem estragadas, só são descartadas
  // (o app recalcula), sem bloquear a importação.
  var ESQUEMA_PONTO = z.object({
    x: z.coerce.number().finite().min(-LIMITES.coordenada).max(LIMITES.coordenada),
    y: z.coerce.number().finite().min(-LIMITES.coordenada).max(LIMITES.coordenada)
  }).transform(function (p) { return { x: p.x, y: p.y }; });

  function truncar(max) {
    return function (v) { return typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : ""; };
  }
  function constante(valor) { return function () { return valor; }; }

  // rotulo: como o campo aparece na mensagem; reparar: valor usado no modo de reparo;
  // opcional: se ausente/inválido, o campo é só omitido (sem erro).
  var CAMPOS_EQUIPAMENTO = {
    id: { rotulo: "id", esquema: texto(LIMITES.id, true), reparar: null },
    nome: { rotulo: "Nome", esquema: texto(LIMITES.nome, true), reparar: function (v, obj) {
      var t = truncar(LIMITES.nome)(v) || truncar(LIMITES.nome)(obj.id);
      return t || null;
    } },
    tipo: { rotulo: "Tipo", esquema: texto(LIMITES.tipo), reparar: truncar(LIMITES.tipo) },
    modelo: { rotulo: "Modelo", esquema: texto(LIMITES.modelo), reparar: truncar(LIMITES.modelo) },
    ip: { rotulo: "IP", esquema: ESQUEMA_IP, reparar: constante("") },
    // VLAN / sub-rede (texto livre), destacada no modo "Diagrama de redes".
    rede: { rotulo: "VLAN / rede", esquema: texto(LIMITES.rede), opcional: true },
    grupo: { rotulo: "Grupo", esquema: texto(LIMITES.grupo), reparar: truncar(LIMITES.grupo) },
    status: { rotulo: "Status", esquema: ESQUEMA_STATUS, reparar: constante("ativo") },
    icone: { rotulo: "Ícone", esquema: ESQUEMA_ICONE, reparar: constante("") },
    imagem: { rotulo: "Imagem", esquema: ESQUEMA_IMAGEM, reparar: constante("") },
    corFonte: { rotulo: "Cor da fonte", esquema: cor(COR_FONTE_PADRAO), reparar: constante(COR_FONTE_PADRAO) },
    // Tom do ícone (ex.: switch verde). "" ou ausente: cores originais da imagem.
    corIcone: { rotulo: "Cor do ícone", esquema: z.string().trim().regex(/^(#[0-9a-f]{6})?$/i, "cor inválida (use o formato #1A2B3C)"), opcional: true },
    posicao: { rotulo: "Posição", esquema: ESQUEMA_PONTO, opcional: true },
    deslocamento: { rotulo: "Deslocamento", esquema: ESQUEMA_PONTO, opcional: true }
  };

  var CAMPOS_CONEXAO = {
    de: { rotulo: "Origem", esquema: texto(LIMITES.id, true), reparar: null },
    para: { rotulo: "Destino", esquema: texto(LIMITES.id, true), reparar: null },
    tipo: { rotulo: "Tipo de enlace", esquema: texto(LIMITES.tipoCabo), reparar: truncar(LIMITES.tipoCabo) },
    saida: { rotulo: "Porta de origem", esquema: texto(LIMITES.porta), reparar: truncar(LIMITES.porta) },
    chegada: { rotulo: "Porta de destino", esquema: texto(LIMITES.porta), reparar: truncar(LIMITES.porta) },
    potencia: { rotulo: "Capacidade", esquema: ESQUEMA_CAPACIDADE, reparar: truncar(LIMITES.capacidade) },
    cor: { rotulo: "Cor", esquema: cor(COR_CABO_PADRAO), reparar: constante(COR_CABO_PADRAO) },
    grossura: { rotulo: "Espessura", esquema: ESQUEMA_GROSSURA, reparar: constante(2) },
    estilo: { rotulo: "Estilo", esquema: ESQUEMA_ESTILO, reparar: constante("solid") },
    deslocamento: { rotulo: "Deslocamento", esquema: ESQUEMA_PONTO, opcional: true }
  };

  // Anotações livres no diagrama (caixas de texto). x/y: canto de cima à esquerda,
  // nas coordenadas do desenho (as mesmas de "posicao" dos equipamentos).
  var CORES_ANOTACAO = ["#FFF3B0", "#D6ECFF", "#DDF5D8", "#FFDDE4", "#ECEFF3"];
  var ESQUEMA_COORDENADA = z.coerce.number({ invalid_type_error: "precisa ser um número" }).finite("precisa ser um número")
    .min(-LIMITES.coordenada).max(LIMITES.coordenada);
  var CAMPOS_ANOTACAO = {
    id: { rotulo: "id", esquema: texto(LIMITES.id, true), reparar: null },
    texto: { rotulo: "Texto", esquema: texto(LIMITES.anotacaoTexto, true), reparar: function (v) {
      var t = typeof v === "string" ? v.trim().slice(0, LIMITES.anotacaoTexto) : "";
      return t || null;
    } },
    x: { rotulo: "x", esquema: ESQUEMA_COORDENADA, reparar: null },
    y: { rotulo: "y", esquema: ESQUEMA_COORDENADA, reparar: null },
    cor: { rotulo: "Cor", esquema: cor(CORES_ANOTACAO[0]), reparar: constante(CORES_ANOTACAO[0]) }
  };

  // Valida campo a campo. No modo "reparar", campo inválido recebe o valor de
  // reparo (e vira um ajuste); campo obrigatório sem reparo invalida o item.
  function validarCampos(obj, campos, modo, onde, relatorio) {
    var saida = {}, valido = true;
    Object.keys(campos).forEach(function (chave) {
      var campo = campos[chave];
      var bruto = obj[chave];
      if (campo.opcional && bruto == null) return;
      var r = campo.esquema.safeParse(bruto);
      if (r.success) { saida[chave] = r.data; return; }
      var mensagem = r.error.issues[0].message;
      if (campo.opcional) {
        relatorio.ajustes.push({ onde: onde + " › " + campo.rotulo, mensagem: "descartado (valor inválido)" });
        return;
      }
      var reparado = modo === "reparar" && campo.reparar ? campo.reparar(bruto, obj) : null;
      if (reparado != null) {
        saida[chave] = reparado;
        relatorio.ajustes.push({ onde: onde + " › " + campo.rotulo, mensagem: mensagem + " — corrigido" });
        return;
      }
      valido = false;
      (modo === "reparar" ? relatorio.ajustes : relatorio.erros).push({ onde: onde + " › " + campo.rotulo, mensagem: mensagem });
    });
    return valido ? saida : null;
  }

  function ehObjeto(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  // entrada: { equipamentos, conexoes } vindo de JSON, CSV ou do navegador.
  // modo "estrito": qualquer problema vai para erros (a importação é recusada).
  // modo "reparar": corrige/descarta e lista em ajustes (usado ao carregar o salvo).
  // opcoes.descreverEquipamento(i, bruto) / descreverConexao(i, bruto): texto do
  // "onde" (o CSV usa para apontar a linha do arquivo).
  // Retorna { ok, dados, erros: [{onde, mensagem}], ajustes: [{onde, mensagem}] }.
  function validarProjeto(entrada, modo, opcoes) {
    modo = modo === "reparar" ? "reparar" : "estrito";
    opcoes = opcoes || {};
    var relatorio = { erros: [], ajustes: [] };
    var falha = function (onde, mensagem) { (modo === "reparar" ? relatorio.ajustes : relatorio.erros).push({ onde: onde, mensagem: mensagem }); };

    if (!ehObjeto(entrada)) {
      falha("Arquivo", 'precisa ser um objeto com as listas "equipamentos" e "conexoes"');
      return concluir(relatorio, { equipamentos: [], conexoes: [] });
    }
    var equipamentosBrutos = entrada.equipamentos;
    var conexoesBrutas = entrada.conexoes == null ? [] : entrada.conexoes;
    if (!Array.isArray(equipamentosBrutos)) { falha("equipamentos", "precisa ser uma lista"); equipamentosBrutos = []; }
    if (!Array.isArray(conexoesBrutas)) { falha("conexoes", "precisa ser uma lista (pode ser vazia: [])"); conexoesBrutas = []; }

    // Importação acima do limite é recusada. Projeto já salvo (reparar) não perde
    // equipamentos ao abrir: só avisa, e o app bloqueia novas inclusões.
    if (equipamentosBrutos.length > LIMITES.equipamentos) {
      if (modo === "reparar") {
        relatorio.ajustes.push({ onde: "equipamentos", mensagem: "o diagrama tem " + equipamentosBrutos.length + " equipamentos, acima do limite de " +
          LIMITES.equipamentos + " — nada foi apagado, mas não é possível adicionar mais" });
      } else {
        falha("equipamentos", "máximo de " + LIMITES.equipamentos + " equipamentos por diagrama (o arquivo tem " + equipamentosBrutos.length + ")");
        equipamentosBrutos = equipamentosBrutos.slice(0, LIMITES.equipamentos);
      }
    }
    if (conexoesBrutas.length > LIMITES.conexoes) {
      falha("conexoes", "máximo de " + LIMITES.conexoes + " cabos (foram encontrados" + conexoesBrutas.length + ")" +
        (modo === "reparar" ? " — os excedentes foram descartados" : ""));
      conexoesBrutas = conexoesBrutas.slice(0, LIMITES.conexoes);
    }

    function descreverEquipamento(i, bruto) {
      if (opcoes.descreverEquipamento) return opcoes.descreverEquipamento(i, bruto);
      var nome = ehObjeto(bruto) && (typeof bruto.nome === "string" || typeof bruto.nome === "number") ? String(bruto.nome).trim() : "";
      return "Equipamento " + (i + 1) + (nome ? " (" + nome.slice(0, 30) + ")" : "");
    }

    var equipamentos = [], nomePorId = {}, posicaoPorId = {};
    equipamentosBrutos.forEach(function (bruto, i) {
      var onde = descreverEquipamento(i, bruto);
      if (!ehObjeto(bruto)) { falha(onde, "precisa ser um objeto { id, nome, … }" + (modo === "reparar" ? " — descartado" : "")); return; }
      var eq = validarCampos(bruto, CAMPOS_EQUIPAMENTO, modo, onde, relatorio);
      // Mesmo com erro em outro campo, um id válido evita erros em cascata nos cabos.
      var idBruto = CAMPOS_EQUIPAMENTO.id.esquema.safeParse(bruto.id);
      var id = eq ? eq.id : (idBruto.success ? idBruto.data : null);
      if (id != null && posicaoPorId[id] !== undefined) {
        falha(onde + " › id", '"' + id + '" repete o id do equipamento ' + (posicaoPorId[id] + 1) + (modo === "reparar" ? " — descartado" : ""));
        return;
      }
      if (id != null) { posicaoPorId[id] = i; nomePorId[id] = eq ? eq.nome : String(bruto.nome || id); }
      if (!eq) { if (modo === "reparar") relatorio.ajustes.push({ onde: onde, mensagem: "equipamento descartado" }); return; }
      equipamentos.push(eq);
    });
    // Estrito: basta o id existir (o erro do equipamento já foi listado, sem
    // repetir em cada cabo). Reparar: só valem os equipamentos que ficaram.
    var idsValidos = {};
    if (modo === "estrito") Object.keys(posicaoPorId).forEach(function (id) { idsValidos[id] = true; });
    else equipamentos.forEach(function (eq) { idsValidos[eq.id] = true; });

    function descreverConexao(i, bruto) {
      if (opcoes.descreverConexao) return opcoes.descreverConexao(i, bruto);
      var de = ehObjeto(bruto) ? nomePorId[String(bruto.de)] || bruto.de : null;
      var para = ehObjeto(bruto) ? nomePorId[String(bruto.para)] || bruto.para : null;
      return "Cabo " + (i + 1) + (de != null && para != null ? " (" + String(de).slice(0, 25) + " → " + String(para).slice(0, 25) + ")" : "");
    }

    var conexoes = [];
    conexoesBrutas.forEach(function (bruto, i) {
      var onde = descreverConexao(i, bruto);
      if (!ehObjeto(bruto)) { falha(onde, 'precisa ser um objeto { de, para, … }' + (modo === "reparar" ? " — descartado" : "")); return; }
      var c = validarCampos(bruto, CAMPOS_CONEXAO, modo, onde, relatorio);
      if (!c) { if (modo === "reparar") relatorio.ajustes.push({ onde: onde, mensagem: "cabo descartado" }); return; }
      // Conexão fantasma: aponta para equipamento que não existe (ou que foi
      // recusado). Uma conexão só existe com as duas pontas no diagrama, então
      // ela é ignorada e vira aviso — o resto do arquivo é importado normalmente.
      var soltas = [];
      if (!idsValidos[c.de]) soltas.push('origem "' + c.de + '"');
      if (!idsValidos[c.para]) soltas.push('destino "' + c.para + '"');
      if (soltas.length) {
        relatorio.ajustes.push({ onde: onde, mensagem: soltas.join(" e ") + (soltas.length > 1 ? " não existem" : " não existe") + " no diagrama — conexão ignorada" });
        return;
      }
      if (c.de === c.para) { relatorio.ajustes.push({ onde: onde, mensagem: "origem e destino são o mesmo equipamento — conexão ignorada" }); return; }
      conexoes.push(c);
    });

    var dados = { equipamentos: equipamentos, conexoes: conexoes };
    // Modo é opcional (projetos antigos não têm). Desconhecido não recusa o
    // arquivo: vira Topologia, com aviso.
    if (entrada.modo != null) {
      var modoProjeto = ESQUEMA_MODO.safeParse(entrada.modo);
      dados.modo = modoProjeto.success ? modoProjeto.data : "topologia";
      if (!modoProjeto.success) relatorio.ajustes.push({ onde: "modo", mensagem: modoProjeto.error.issues[0].message + " — usado Topologia" });
    }
    // Anotações são opcionais: projetos sem elas continuam só com as duas listas.
    if (entrada.anotacoes != null) {
      var anotacoesBrutas = entrada.anotacoes;
      if (!Array.isArray(anotacoesBrutas)) { falha("anotacoes", "precisa ser uma lista"); anotacoesBrutas = []; }
      if (anotacoesBrutas.length > LIMITES.anotacoes) {
        falha("anotacoes", "máximo de " + LIMITES.anotacoes + " anotações (o arquivo tem " + anotacoesBrutas.length + ")" + (modo === "reparar" ? " — as excedentes foram descartadas" : ""));
        anotacoesBrutas = anotacoesBrutas.slice(0, LIMITES.anotacoes);
      }
      var idsAnotacao = {};
      dados.anotacoes = [];
      anotacoesBrutas.forEach(function (bruto, i) {
        var onde = "Anotação " + (i + 1);
        if (!ehObjeto(bruto)) { falha(onde, "precisa ser um objeto { id, texto, x, y }" + (modo === "reparar" ? " — descartada" : "")); return; }
        var a = validarCampos(bruto, CAMPOS_ANOTACAO, modo, onde, relatorio);
        if (!a) { if (modo === "reparar") relatorio.ajustes.push({ onde: onde, mensagem: "anotação descartada" }); return; }
        if (idsAnotacao[a.id]) { falha(onde + " › id", '"' + a.id + '" repetido' + (modo === "reparar" ? " — descartada" : "")); return; }
        idsAnotacao[a.id] = true;
        dados.anotacoes.push(a);
      });
    }
    // Bayface de Racks (opcional): disposição física, independente do diagrama.
    if (entrada.racks != null || entrada.cabosRack != null) {
      var fisico = validarRacks(entrada.racks, entrada.cabosRack, modo, relatorio);
      dados.racks = fisico.racks;
      dados.cabosRack = fisico.cabos;
    }
    return concluir(relatorio, dados);
  }

  function concluir(relatorio, dados) {
    return { ok: relatorio.erros.length === 0, dados: dados, erros: relatorio.erros, ajustes: relatorio.ajustes };
  }

  // Um equipamento vindo de formulário. idsExistentes: para barrar id repetido.
  function validarEquipamento(obj) {
    var relatorio = { erros: [], ajustes: [] };
    var eq = validarCampos(obj || {}, CAMPOS_EQUIPAMENTO, "estrito", "Equipamento", relatorio);
    return { ok: !!eq && !relatorio.erros.length, dados: eq, erros: relatorio.erros };
  }

  // Um cabo vindo de formulário, conferindo que as pontas existem.
  function validarConexao(obj, idsExistentes) {
    var relatorio = { erros: [], ajustes: [] };
    var c = validarCampos(obj || {}, CAMPOS_CONEXAO, "estrito", "Cabo", relatorio);
    if (c) {
      var existe = function (id) { return (idsExistentes || []).indexOf(id) >= 0; };
      if (!existe(c.de) || !existe(c.para)) relatorio.erros.push({ onde: "Cabo", mensagem: "escolha equipamentos existentes para as duas pontas" });
      else if (c.de === c.para) relatorio.erros.push({ onde: "Cabo", mensagem: "origem e destino precisam ser diferentes" });
    }
    return { ok: !!c && !relatorio.erros.length, dados: c, erros: relatorio.erros };
  }

  // Nome de projeto: texto de 1 a LIMITES.nomeProjeto caracteres.
  var ESQUEMA_NOME_PROJETO = texto(LIMITES.nomeProjeto, true);
  function validarNomeProjeto(nome) {
    var r = ESQUEMA_NOME_PROJETO.safeParse(nome);
    return r.success ? { ok: true, dados: r.data } : { ok: false, mensagem: r.error.issues[0].message };
  }

  // ---- Modelos de equipamento e portas ----------------------------------------
  // Catálogo em data/equipamentos.json ("modelos"). As portas aceitam faixas:
  // "ether1-16" -> ether1…ether16; "gpon1/1/1-8" -> gpon1/1/1…gpon1/1/8;
  // "sfp-sfpplus1-2" -> sfp-sfpplus1, sfp-sfpplus2. Sem faixa, vale o nome como está.
  var MAX_PORTAS_MODELO = 256;

  function expandirPortas(lista) {
    var portas = [];
    var vistas = {};
    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      var texto = String(item == null ? "" : item).trim();
      if (!texto) return;
      var faixa = /^(.*?)(\d+)-(\d+)$/.exec(texto);
      var nomes = [];
      if (faixa && Number(faixa[3]) >= Number(faixa[2]) && Number(faixa[3]) - Number(faixa[2]) < MAX_PORTAS_MODELO) {
        for (var n = Number(faixa[2]); n <= Number(faixa[3]); n++) nomes.push(faixa[1] + n);
      } else {
        nomes.push(texto);
      }
      nomes.forEach(function (nome) {
        var porta = nome.slice(0, LIMITES.porta);
        var chave = porta.toLowerCase();
        if (vistas[chave] || portas.length >= MAX_PORTAS_MODELO) return;
        vistas[chave] = true;
        portas.push(porta);
      });
    });
    return portas;
  }

  // Modelos vindos do JSON: descarta o que não tiver nome ou portas, sem travar.
  function normalizarModelos(lista) {
    var modelos = [];
    var vistos = {};
    (Array.isArray(lista) ? lista : []).forEach(function (m) {
      if (!ehObjeto(m)) return;
      var nome = typeof m.nome === "string" || typeof m.nome === "number" ? String(m.nome).trim().slice(0, LIMITES.modelo) : "";
      var portas = expandirPortas(m.portas);
      if (!nome || !portas.length || vistos[nome.toLowerCase()]) return;
      vistos[nome.toLowerCase()] = true;
      modelos.push({
        nome: nome,
        fabricante: typeof m.fabricante === "string" ? m.fabricante.trim().slice(0, 40) : "",
        tipo: typeof m.tipo === "string" ? m.tipo.trim().slice(0, LIMITES.tipo) : "",
        portas: portas
      });
    });
    return modelos;
  }

  function chaveModelo(texto) {
    return semAcento(String(texto || "")).toLowerCase().replace(/[\s_]+/g, " ").trim();
  }

  // Modelo do catálogo para o texto do campo "Modelo" do equipamento. Aceita
  // o nome exato ("CRS326-24G-2S+"), com fabricante ("MikroTik CRS326-24G-2S+")
  // ou com texto a mais ("CRS326-24G-2S+ rack 2"): vence o nome mais longo contido.
  function buscarModelo(modelos, texto) {
    var alvo = chaveModelo(texto);
    if (!alvo || !Array.isArray(modelos)) return null;
    var melhor = null;
    modelos.forEach(function (m) {
      var nome = chaveModelo(m.nome);
      if (!nome) return;
      var comFabricante = chaveModelo(m.fabricante + " " + m.nome);
      if (alvo === nome || alvo === comFabricante) { melhor = { m: m, peso: Infinity }; return; }
      var contido = new RegExp("(^|[^a-z0-9])" + nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(alvo);
      if (contido && (!melhor || nome.length > melhor.peso)) melhor = { m: m, peso: nome.length };
    });
    if (melhor) return melhor.m;
    // Nome curto ("CRS326", "DM4610", "MikroTik CCR2004"): vale se um único
    // modelo começa com ele (seguido de "-", espaço ou fim).
    var palavras = alvo.split(" ");
    for (var i = 0; i < palavras.length; i++) {
      var inicio = palavras.slice(i).join(" ");
      if (inicio.length < 4) continue;
      var candidatos = modelos.filter(function (m) {
        var nome = chaveModelo(m.nome);
        return nome.indexOf(inicio) === 0 && /^([^a-z0-9]|$)/.test(nome.slice(inicio.length));
      });
      if (candidatos.length === 1) return candidatos[0];
      if (candidatos.length > 1) return null; // ambíguo: melhor não chutar
    }
    return null;
  }

  // Categoria de um tipo/modelo, para filtrar a lista de modelos pelo Tipo
  // escolhido. Os tipos do catálogo variam ("UPS", "Nobreak"; "MikroTik", "Roteador").
  var CATEGORIAS_EQUIPAMENTO = [
    ["switch", /switch/],
    ["olt", /(^|[^a-z])olt([^a-z]|$)/],
    ["onu", /(^|[^a-z])(onu|ont)([^a-z]|$)/],
    ["roteador", /roteador|router|mikrotik|(^|[^a-z])(rb|ccr)([^a-z]|$)/],
    ["servidor", /servidor|server/],
    ["nobreak", /nobreak|(^|[^a-z])ups([^a-z]|$)/],
    ["retificador", /retificador|(^|[^a-z])rps([^a-z]|$)/],
    ["camera", /camera/]
  ];
  function categoriaEquipamento(texto) {
    var t = chaveModelo(texto);
    for (var i = 0; i < CATEGORIAS_EQUIPAMENTO.length; i++) if (CATEGORIAS_EQUIPAMENTO[i][1].test(t)) return CATEGORIAS_EQUIPAMENTO[i][0];
    return "";
  }

  // Modelos que combinam com o Tipo do equipamento. O tipo pode ser um fabricante
  // ("MikroTik" -> todos os MikroTik) ou uma categoria ("Switch" -> só switches).
  // Tipo vazio ou desconhecido (ou nenhum modelo da categoria): lista inteira.
  function filtrarModelosPorTipo(modelos, tipo) {
    var lista = Array.isArray(modelos) ? modelos : [];
    var t = chaveModelo(tipo);
    if (!t) return lista.slice();
    var porFabricante = lista.filter(function (m) { return m.fabricante && chaveModelo(m.fabricante) === t; });
    if (porFabricante.length) return porFabricante;
    var categoria = categoriaEquipamento(t);
    if (!categoria) return lista.slice();
    var porCategoria = lista.filter(function (m) { return categoriaEquipamento(m.tipo) === categoria; });
    return porCategoria.length ? porCategoria : lista.slice();
  }

  // ---- Bayface de Racks --------------------------------------------------------
  // Rack com altura em U (U1 embaixo). Cada item ocupa de "u" até u + alturaU - 1.
  // Face: "ambas" (profundidade total), "frente" ou "tras" (meia profundidade):
  // um item de frente e outro de trás podem dividir a mesma U; o resto não.
  var CATEGORIAS_RACK = [
    { valor: "servidor", rotulo: "Servidor", sigla: "SRV", altura: 2, portas: 4, tipoPorta: "RJ45" },
    { valor: "switch", rotulo: "Switch", sigla: "SW", altura: 1, portas: 24, tipoPorta: "RJ45" },
    { valor: "roteador", rotulo: "Roteador", sigla: "RT", altura: 1, portas: 8, tipoPorta: "RJ45" },
    { valor: "storage", rotulo: "Storage", sigla: "STG", altura: 2, portas: 4, tipoPorta: "SAS" },
    { valor: "firewall", rotulo: "Firewall", sigla: "FW", altura: 1, portas: 8, tipoPorta: "RJ45" },
    { valor: "olt", rotulo: "OLT", sigla: "OLT", altura: 2, portas: 16, tipoPorta: "PON" },
    { valor: "dio", rotulo: "DIO / distribuidor óptico", sigla: "DIO", altura: 1, portas: 24, tipoPorta: "SC/APC" },
    { valor: "patch", rotulo: "Patch panel", sigla: "PP", altura: 1, portas: 24, tipoPorta: "RJ45" },
    { valor: "organizador", rotulo: "Organizador de cabos", sigla: "ORG", altura: 1, portas: 0 },
    { valor: "bandeja", rotulo: "Bandeja fixa", sigla: "BJ", altura: 1, portas: 0 },
    { valor: "bandeja-deslizante", rotulo: "Bandeja deslizante", sigla: "BJD", altura: 1, portas: 0 },
    { valor: "pdu", rotulo: "Régua de energia / PDU", sigla: "PDU", altura: 1, portas: 8, tipoPorta: "Tomada" },
    { valor: "nobreak", rotulo: "Nobreak", sigla: "UPS", altura: 2, portas: 6, tipoPorta: "Tomada" },
    { valor: "dwdm", rotulo: "DWDM", sigla: "DWDM", altura: 2, portas: 8, tipoPorta: "LC" },
    { valor: "telecom", rotulo: "Telecomunicações", sigla: "TEL", altura: 1, portas: 4, tipoPorta: "RJ45" },
    { valor: "cego", rotulo: "Painel cego", sigla: "PC", altura: 1, portas: 0 },
    { valor: "personalizado", rotulo: "Personalizado", sigla: "EQ", altura: 1, portas: 0 }
  ];
  // Modelos reais prontos para a biblioteca: fabricante, modelo, categoria, U, portas, tipo, foto do painel.
  var MODELOS_RACK = [["Lenovo","ThinkSystem SR650","servidor",2,4,"RJ45","assets/images/racks/lenovothinksystemsr650.jpg"],["HPE","ProLiant DL380 Gen10","servidor",2,4,"RJ45","assets/images/racks/hpeproliantdl380gen10.jpg"],["HPE","ProLiant DL560 Gen11","servidor",2,4,"RJ45","assets/images/racks/hpeproliantdl560gen11.jpg"],["HPE","ProLiant DL325 Gen10","servidor",1,4,"RJ45","assets/images/racks/hpeproliantdl325gen10.jpg"],["HP","ProLiant DL380p Gen8","servidor",2,4,"RJ45","assets/images/racks/hpproliantdl380pgen8.jpg"],["HP","ProLiant DL380 G7","servidor",2,4,"RJ45","assets/images/racks/hpproliantdl380g7.jpg"],["HP","ProLiant DL385 G7","servidor",2,4,"RJ45","assets/images/racks/hpproliantdl385g7.jpg"],["HP","ProLiant DL320 G6","servidor",1,2,"RJ45","assets/images/racks/hpproliantdl320g6.jpg"],["HP","ProLiant DL180 G6","servidor",2,2,"RJ45","assets/images/racks/hpproliantdl180g6.jpg"],["HP","ProLiant DL160 G6","servidor",1,2,"RJ45","assets/images/racks/hpproliantdl160g6.jpg"],["HP","ProLiant DL120 G6","servidor",1,2,"RJ45","assets/images/racks/hpproliantdl120g6.jpg"],["HP","ProLiant ML370 G5","servidor",5,2,"RJ45","assets/images/racks/hpproliantml370g5.jpg"],["HP","Compaq dc7700 (SFF)","personalizado",3,1,"RJ45","assets/images/racks/hpcompaqdc7700sff.jpg"],["Dell","PowerEdge R740","servidor",2,4,"RJ45","assets/images/racks/dellpoweredger740.jpg"],["Dell","PowerEdge R730","servidor",2,4,"RJ45","assets/images/racks/dellpoweredger730.jpg"],["Dell","PowerEdge R720","servidor",2,4,"RJ45","assets/images/racks/dellpoweredger720.jpg"],["Dell","PowerEdge R720xd","servidor",2,4,"RJ45","assets/images/racks/dellpoweredger720xd.jpg"],["Dell","PowerEdge R710","servidor",2,4,"RJ45","assets/images/racks/dellpoweredger710.jpg"],["Dell","PowerEdge R620","servidor",1,4,"RJ45","assets/images/racks/dellpoweredger620.jpg"],["Dell","PowerEdge R610","servidor",1,4,"RJ45","assets/images/racks/dellpoweredger610.jpg"],["Dell","PowerEdge R510","servidor",1,2,"RJ45","assets/images/racks/dellpoweredger510.jpg"],["Dell","PowerEdge R420","servidor",1,2,"RJ45","assets/images/racks/dellpoweredger420.jpg"],["Dell","PowerEdge R320","servidor",1,2,"RJ45","assets/images/racks/dellpoweredger320.jpg"],["Supermicro","SYS-6029P-TR","servidor",2,2,"RJ45","assets/images/racks/supermicrosys6029ptr.jpg"],["Supermicro","SuperWorkstation SYS-540A-TR","servidor",4,2,"RJ45","assets/images/racks/supermicrosuperworkstationsys540atr.jpg"],["Netflix","OCA (Open Connect)","servidor",2,4,"SFP+","assets/images/racks/netflixocaopenconnect.jpg"],["HPE","Alletra Storage Server 4140","storage",4,4,"SFP+","assets/images/racks/hpealletrastorageserver4140.jpg"],["HPE","MSA 2060","storage",2,8,"SFP+","assets/images/racks/hpemsa2060.jpg"],["HPE","StoreEasy 1450","storage",1,4,"RJ45","assets/images/racks/hpestoreeasy1450.jpg"],["HP","3PAR StoreServ 8000","storage",2,8,"FC","assets/images/racks/hp3parstoreserv8000.jpg"],["HP","StorageWorks MSL2024","storage",2,2,"SAS","assets/images/racks/hpstorageworksmsl2024.jpg"],["HP","StorageWorks P2000 G3","storage",2,4,"FC","assets/images/racks/hpstorageworksp2000g3.jpg"],["Dell","PowerVault MD3200","storage",2,4,"SAS","assets/images/racks/dellpowervaultmd3200.jpg"],["Dell","PowerVault MD1400","storage",2,4,"SAS","assets/images/racks/dellpowervaultmd1400.jpg"],["Sophos","XGS 2100","firewall",1,10,"RJ45","assets/images/racks/sophosxgs2100.jpg"],["Datacom","DM4100","switch",1,28,"RJ45","assets/images/racks/datacomdm4100.jpg"],["Datacom","DM4170 (24GX+4XS)","switch",1,28,"SFP+","assets/images/racks/datacomdm417024gx4xs.jpg"],["Datacom","DM4270-48X-6Q","switch",1,54,"SFP+","assets/images/racks/datacomdm427048x6q.jpg"],["Datacom","DM4270-48X-2Q","switch",1,50,"SFP+","assets/images/racks/datacomdm427048x2q.jpg"],["Datacom","DM4270-24XS+2CX","switch",1,26,"SFP+","assets/images/racks/datacomdm427024xs2cx.jpg"],["Datacom","DM4370","switch",2,32,"SFP28","assets/images/racks/datacomdm4370.jpg"],["Datacom","DM4001","switch",1,10,"RJ45","assets/images/racks/datacomdm4001.jpg"],["Datacom","DmSwitch 3000","switch",1,28,"RJ45","assets/images/racks/datacomdmswitch3000.jpg"],["Juniper","QFX5100-48S","switch",1,54,"SFP+","assets/images/racks/juniperqfx510048s.jpg"],["Juniper","QFX5110-48S","switch",1,52,"SFP+","assets/images/racks/juniperqfx511048s.jpg"],["Juniper","QFX5120-48Y","switch",1,56,"SFP28","assets/images/racks/juniperqfx512048y.jpg"],["Juniper","QFX5120-32C","switch",1,32,"QSFP28","assets/images/racks/juniperqfx512032c.jpg"],["Arista","DCS-7280CR3-32D","switch",1,32,"QSFP28","assets/images/racks/aristadcs7280cr332d.jpg"],["Arista","DCS-7160-32CQ-R","switch",1,32,"QSFP28","assets/images/racks/aristadcs716032cqr.jpg"],["Edgecore","ECS4120-28F","switch",1,28,"SFP","assets/images/racks/edgecoreecs412028f.jpg"],["Huawei","CloudEngine S5732","switch",1,52,"RJ45","assets/images/racks/huaweicloudengines5732.jpg"],["Cisco","ME 3600X-24CX-M","switch",2,28,"RJ45","assets/images/racks/ciscome3600x24cxm.jpg"],["D-Link","DES-1210-28","switch",1,28,"RJ45"],["Juniper","MX204","roteador",1,12,"QSFP28","assets/images/racks/junipermx204.jpg"],["MikroTik","CCR2116-12G-4S+","roteador",1,16,"RJ45","assets/images/racks/mikrotikccr211612g4s.jpg"],["MikroTik","CCR1036-12G-4S","roteador",1,16,"RJ45","assets/images/racks/mikrotikccr103612g4s.jpg"],["MikroTik","CCR1036-8G-2S+","roteador",1,10,"RJ45","assets/images/racks/mikrotikccr10368g2s.jpg"],["MikroTik","CCR1009-7G-1C-1S+PC","roteador",1,9,"RJ45"],["MikroTik","RB2011UiAS-RM","roteador",1,10,"RJ45","assets/images/racks/mikrotikrb2011uiasrm.jpg"],["MikroTik","RB1100AHx2","roteador",1,13,"RJ45","assets/images/racks/mikrotikrb1100ahx2.jpg"],["MikroTik","L009UiGS-RM","roteador",1,9,"RJ45","assets/images/racks/mikrotikl009uigsrm.jpg"],["Huawei","SmartAX MA5800-X2","olt",2,32,"PON","assets/images/racks/huaweismartaxma5800x2.jpg"],["Parks","Fiberlink 4004E","olt",1,4,"PON","assets/images/racks/parksfiberlink4004e.jpg"],["Parks","Fiberlink 10008S","olt",1,8,"PON","assets/images/racks/parksfiberlink10008s.jpg"],["Parks","Fiberlink 30028","olt",1,8,"PON","assets/images/racks/parksfiberlink30028.jpg"],["Fibracem","DIO FIT 24F","dio",1,24,"SC/APC","assets/images/racks/fibracemdiofit24f.jpg"],["Fibracem","DIO FIT AC 48F","dio",2,48,"SC/APC","assets/images/racks/fibracemdiofitac48f.jpg"],["Fibracem","DIO 24Fit X Plus","dio",1,24,"SC/APC","assets/images/racks/fibracemdio24fitxplus.jpg"],["Fibracem","DIO Articulado 96F","dio",2,96,"LC","assets/images/racks/fibracemdioarticulado96f.jpg"],["Fibracem","DIO Office 36F","dio",1,36,"SC/APC","assets/images/racks/fibracemdiooffice36f.jpg"],["Padtec","LightPad i1600G","dwdm",2,8,"LC","assets/images/racks/padteclightpadi1600g.jpg"],["Padtec","Subrack LightPad i6400G","dwdm",15,16,"LC","assets/images/racks/padtecsubracklightpadi6400g.jpg"],["Padtec","Muxponder TM800G Lite","dwdm",1,8,"LC","assets/images/racks/padtecmuxpondertm800glite.jpg"],["XPS","Retificador SR60A -48V","nobreak",3,6,"Disjuntor","assets/images/racks/xpsretificadorsr60a48v.jpg"],["XPS","Retificador SRF10A -48V","nobreak",1,4,"Disjuntor","assets/images/racks/xpsretificadorsrf10a48v.jpg"],["SVS","7016 R FT","nobreak",3,6,"Tomada","assets/images/racks/svs7016rft.jpg"],["iNVU","91128 M4 IAX FT","nobreak",2,6,"Tomada","assets/images/racks/invu91128m4iaxft.jpg"],["Dígitro","NGC VoIP Manager","telecom",2,4,"RJ45","assets/images/racks/digitrongcvoipmanager.jpg"],["Dígitro","NGC 80 Evolution","telecom",2,8,"E1","assets/images/racks/digitrongc80evolution.jpg"],["Intelbras","Impacta 300","telecom",16,16,"RJ11","assets/images/racks/intelbrasimpacta300.jpg"],["Aligera","AG500 E1","telecom",2,4,"E1","assets/images/racks/aligeraag500e1.jpg"]].map(function (m) {
    return { fabricante: m[0], modelo: m[1], categoria: m[2], altura: m[3], portas: m[4], tipoPorta: m[5], foto: m[6] || "" };
  });
  var STATUS_RACK = ["planejado", "montagem", "instalado", "desativado"];
  var ESTADOS_ITEM_RACK = ["instalado", "planejado", "remover"];
  var FACES_RACK = ["ambas", "frente", "tras"];
  var TIPOS_CABO_RACK = ["rede", "fibra", "cordao", "energia", "outro"];

  // padrao: valor usado quando o campo vem vazio ou ausente (sem padrão = obrigatório).
  function inteiro(min, max, padrao) {
    return z.preprocess(function (v) { return (v == null || v === "") && padrao !== undefined ? padrao : v; },
      z.coerce.number({ invalid_type_error: "precisa ser um número" }).int("precisa ser um número inteiro")
        .min(min, "mínimo " + min).max(max, "máximo " + max));
  }
  function corOpcional() {
    return z.preprocess(function (v) { return v == null ? "" : typeof v === "string" ? v.trim() : v; },
      z.string().regex(/^(#[0-9a-f]{6})?$/i, "cor inválida (use o formato #1A2B3C)"));
  }
  var ESQUEMA_CATEGORIA_RACK = enumTolerante(CATEGORIAS_RACK.map(function (c) { return c.valor; }),
    { servidores: "servidor", switches: "switch", roteadores: "roteador", "patch panel": "patch", "patch-panel": "patch",
      organizadores: "organizador", "bandeja fixa": "bandeja", regua: "pdu", "regua de energia": "pdu", ups: "nobreak",
      "painel cego": "cego", outro: "personalizado", storages: "storage", fw: "firewall" },
    "personalizado", "categoria desconhecida");

  function textoReparado(max) {
    return function (v, o) { return truncar(max)(v) || truncar(max)(o.id) || null; };
  }

  var CAMPOS_RACK = {
    id: { rotulo: "id", esquema: texto(LIMITES.id, true), reparar: null },
    nome: { rotulo: "Nome", esquema: texto(LIMITES.textoRack, true), reparar: textoReparado(LIMITES.textoRack) },
    patrimonio: { rotulo: "Patrimônio", esquema: texto(40), reparar: truncar(40) },
    local: { rotulo: "Local", esquema: texto(LIMITES.textoRack), reparar: truncar(LIMITES.textoRack) },
    fileira: { rotulo: "Fileira", esquema: texto(20), reparar: truncar(20) },
    fabricante: { rotulo: "Fabricante", esquema: texto(40), reparar: truncar(40) },
    modelo: { rotulo: "Modelo", esquema: texto(LIMITES.modelo), reparar: truncar(LIMITES.modelo) },
    alturaU: { rotulo: "Altura (U)", esquema: inteiro(1, LIMITES.alturaRackMax, 42), reparar: constante(42) },
    largura: { rotulo: "Largura", esquema: texto(20), reparar: truncar(20) },
    profundidade: { rotulo: "Profundidade", esquema: texto(20), reparar: truncar(20) },
    status: { rotulo: "Status", esquema: enumTolerante(STATUS_RACK, { "em montagem": "montagem" }, "planejado", "use planejado, montagem, instalado ou desativado"), reparar: constante("planejado") },
    obs: { rotulo: "Observações", esquema: texto(LIMITES.obsRack), reparar: truncar(LIMITES.obsRack) }
  };
  var CAMPOS_ITEM_RACK = {
    id: { rotulo: "id", esquema: texto(LIMITES.id, true), reparar: null },
    nome: { rotulo: "Nome", esquema: texto(LIMITES.textoRack, true), reparar: textoReparado(LIMITES.textoRack) },
    categoria: { rotulo: "Categoria", esquema: ESQUEMA_CATEGORIA_RACK, reparar: constante("personalizado") },
    fabricante: { rotulo: "Fabricante", esquema: texto(40), reparar: truncar(40) },
    modelo: { rotulo: "Modelo", esquema: texto(LIMITES.modelo), reparar: truncar(LIMITES.modelo) },
    u: { rotulo: "U inicial", esquema: inteiro(1, LIMITES.alturaRackMax), reparar: null },
    alturaU: { rotulo: "Altura (U)", esquema: inteiro(1, LIMITES.alturaRackMax, 1), reparar: constante(1) },
    face: { rotulo: "Face", esquema: enumTolerante(FACES_RACK, { traseira: "tras", frontal: "frente", total: "ambas" }, "ambas", "use ambas, frente ou tras"), reparar: constante("ambas") },
    cor: { rotulo: "Cor", esquema: corOpcional(), reparar: constante("") },
    patrimonio: { rotulo: "Patrimônio", esquema: texto(40), reparar: truncar(40) },
    portas: { rotulo: "Portas", esquema: inteiro(0, LIMITES.portasPorItem, 0), reparar: constante(0) },
    tipoPorta: { rotulo: "Tipo de porta", esquema: texto(30), reparar: truncar(30) },
    prefixoPorta: { rotulo: "Prefixo das portas", esquema: texto(15), reparar: truncar(15) },
    largura: { rotulo: "Largura", esquema: texto(20), reparar: truncar(20) },
    profundidade: { rotulo: "Profundidade", esquema: texto(20), reparar: truncar(20) },
    estado: { rotulo: "Estado", esquema: enumTolerante(ESTADOS_ITEM_RACK, { "a remover": "remover", removido: "remover" }, "instalado", "use instalado, planejado ou remover"), reparar: constante("instalado") },
    obs: { rotulo: "Observações", esquema: texto(LIMITES.obsRack), reparar: truncar(LIMITES.obsRack) },
    // Opcional: equipamento do diagrama lógico que este item representa.
    equipId: { rotulo: "Equipamento do diagrama", esquema: texto(LIMITES.id), opcional: true },
    // Opcional: foto real do painel frontal, já recortada e reduzida pelo editor.
    foto: { rotulo: "Foto", esquema: z.string().max(LIMITES.fotoRack, "foto grande demais (máx. ~250 KB)")
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "use uma foto enviada pelo app"), opcional: true }
  };
  var CAMPOS_CABO_RACK = {
    id: { rotulo: "id", esquema: texto(LIMITES.id, true), reparar: null },
    deItem: { rotulo: "Origem", esquema: texto(LIMITES.id, true), reparar: null },
    dePorta: { rotulo: "Porta de origem", esquema: inteiro(1, LIMITES.portasPorItem), reparar: null },
    paraItem: { rotulo: "Destino", esquema: texto(LIMITES.id, true), reparar: null },
    paraPorta: { rotulo: "Porta de destino", esquema: inteiro(1, LIMITES.portasPorItem), reparar: null },
    tipo: { rotulo: "Tipo de cabo", esquema: enumTolerante(TIPOS_CABO_RACK, { cabo: "rede", utp: "rede", "cabo de rede": "rede", "fibra optica": "fibra", "cordao optico": "cordao", eletrica: "energia" }, "rede", "use rede, fibra, cordao, energia ou outro"), reparar: constante("rede") },
    etiqueta: { rotulo: "Identificação", esquema: texto(40), reparar: truncar(40) },
    comprimento: { rotulo: "Comprimento", esquema: texto(20), reparar: truncar(20) },
    cor: { rotulo: "Cor", esquema: corOpcional(), reparar: constante("") },
    obs: { rotulo: "Observações", esquema: texto(LIMITES.obsRack), reparar: truncar(LIMITES.obsRack) }
  };

  function facesConflitam(a, b) {
    return !((a === "frente" && b === "tras") || (a === "tras" && b === "frente"));
  }
  // Regra física de uma posição. item: { u, alturaU, face }; ignorarId: o próprio
  // item ao mover. Retorna { ok, motivo, conflito } (conflito = item que já está lá).
  function verificarPosicaoRack(rack, item, ignorarId) {
    var u = Number(item.u), h = Number(item.alturaU), alturaRack = Number(rack.alturaU);
    if (!(h >= 1)) return { ok: false, motivo: "a altura precisa ser de pelo menos 1U" };
    if (!(u >= 1)) return { ok: false, motivo: "a posição mínima é U1" };
    if (u + h - 1 > alturaRack) return { ok: false, motivo: "passa do topo do rack (U" + (u + h - 1) + " num rack de " + alturaRack + "U)" };
    var face = item.face || "ambas";
    var lista = rack.itens || [];
    for (var i = 0; i < lista.length; i++) {
      var outro = lista[i];
      if (outro.id === ignorarId) continue;
      var inicio = Math.max(u, outro.u), fim = Math.min(u + h - 1, outro.u + outro.alturaU - 1);
      if (inicio <= fim && facesConflitam(face, outro.face || "ambas")) {
        return { ok: false, conflito: outro, motivo: "U" + inicio + (fim > inicio ? "–U" + fim : "") + " já está ocupada por \"" + outro.nome + "\"" };
      }
    }
    return { ok: true };
  }
  // Ocupação por U: { 1: [itens], ... } e totais (U com algo na frente ou atrás conta como ocupada).
  function ocupacaoRack(rack) {
    var porU = {}, ocupadas = 0;
    for (var u = 1; u <= rack.alturaU; u++) porU[u] = [];
    (rack.itens || []).forEach(function (it) {
      for (var k = it.u; k < it.u + it.alturaU && k <= rack.alturaU; k++) if (porU[k]) porU[k].push(it);
    });
    Object.keys(porU).forEach(function (k) { if (porU[k].length) ocupadas++; });
    return { porU: porU, ocupadas: ocupadas, livres: rack.alturaU - ocupadas, total: rack.alturaU };
  }

  function validarRacks(racksBrutos, cabosBrutos, modo, relatorio) {
    var falha = function (onde, mensagem) { (modo === "reparar" ? relatorio.ajustes : relatorio.erros).push({ onde: onde, mensagem: mensagem }); };
    if (racksBrutos == null) racksBrutos = [];
    if (cabosBrutos == null) cabosBrutos = [];
    if (!Array.isArray(racksBrutos)) { falha("racks", "precisa ser uma lista"); racksBrutos = []; }
    if (!Array.isArray(cabosBrutos)) { falha("cabosRack", "precisa ser uma lista"); cabosBrutos = []; }
    if (racksBrutos.length > LIMITES.racks) { falha("racks", "máximo de " + LIMITES.racks + " racks por projeto"); racksBrutos = racksBrutos.slice(0, LIMITES.racks); }
    var racks = [], idsRack = {}, itensPorId = {};
    racksBrutos.forEach(function (bruto, i) {
      var onde = "Rack " + (i + 1) + (ehObjeto(bruto) && bruto.nome ? " (" + String(bruto.nome).slice(0, 30) + ")" : "");
      if (!ehObjeto(bruto)) { falha(onde, "precisa ser um objeto"); return; }
      var r = validarCampos(bruto, CAMPOS_RACK, modo, onde, relatorio);
      if (!r) return;
      if (idsRack[r.id]) { falha(onde + " › id", '"' + r.id + '" repetido'); return; }
      idsRack[r.id] = true;
      var itensBrutos = Array.isArray(bruto.itens) ? bruto.itens : [];
      if (bruto.itens != null && !Array.isArray(bruto.itens)) falha(onde + " › itens", "precisa ser uma lista");
      if (itensBrutos.length > LIMITES.itensPorRack) { falha(onde + " › itens", "máximo de " + LIMITES.itensPorRack + " equipamentos por rack"); itensBrutos = itensBrutos.slice(0, LIMITES.itensPorRack); }
      r.itens = [];
      itensBrutos.forEach(function (itBruto, j) {
        var ondeItem = onde + " › equipamento " + (j + 1) + (ehObjeto(itBruto) && itBruto.nome ? " (" + String(itBruto.nome).slice(0, 30) + ")" : "");
        if (!ehObjeto(itBruto)) { falha(ondeItem, "precisa ser um objeto"); return; }
        var it = validarCampos(itBruto, CAMPOS_ITEM_RACK, modo, ondeItem, relatorio);
        if (!it) return;
        if (itensPorId[it.id]) { falha(ondeItem + " › id", '"' + it.id + '" repetido'); return; }
        var pos = verificarPosicaoRack(r, it);
        if (!pos.ok) { falha(ondeItem, pos.motivo + (modo === "reparar" ? " — retirado do rack" : "")); return; }
        itensPorId[it.id] = { item: it, rack: r };
        r.itens.push(it);
      });
      racks.push(r);
    });

    if (cabosBrutos.length > LIMITES.cabosRack) { falha("cabosRack", "máximo de " + LIMITES.cabosRack + " cabos físicos"); cabosBrutos = cabosBrutos.slice(0, LIMITES.cabosRack); }
    var cabos = [], idsCabo = {}, portasUsadas = {};
    cabosBrutos.forEach(function (bruto, i) {
      var onde = "Cabo físico " + (i + 1) + (ehObjeto(bruto) && bruto.etiqueta ? " (" + String(bruto.etiqueta).slice(0, 30) + ")" : "");
      if (!ehObjeto(bruto)) { falha(onde, "precisa ser um objeto"); return; }
      var c = validarCampos(bruto, CAMPOS_CABO_RACK, modo, onde, relatorio);
      if (!c) return;
      if (idsCabo[c.id]) { falha(onde + " › id", '"' + c.id + '" repetido'); return; }
      var problema = null;
      [["de", c.deItem, c.dePorta], ["para", c.paraItem, c.paraPorta]].some(function (ponta) {
        var ref = itensPorId[ponta[1]];
        if (!ref) { problema = (ponta[0] === "de" ? "origem" : "destino") + " não existe em nenhum rack"; return true; }
        if (ponta[2] > ref.item.portas) { problema = "\"" + ref.item.nome + "\" não tem a porta " + ponta[2] + " (tem " + ref.item.portas + ")"; return true; }
        if (portasUsadas[ponta[1] + "#" + ponta[2]]) { problema = "a porta " + ponta[2] + " de \"" + ref.item.nome + "\" já tem outro cabo"; return true; }
        return false;
      });
      if (!problema && c.deItem === c.paraItem && c.dePorta === c.paraPorta) problema = "origem e destino são a mesma porta";
      if (problema) { falha(onde, problema + (modo === "reparar" ? " — cabo descartado" : "")); return; }
      portasUsadas[c.deItem + "#" + c.dePorta] = true;
      portasUsadas[c.paraItem + "#" + c.paraPorta] = true;
      idsCabo[c.id] = true;
      cabos.push(c);
    });
    return { racks: racks, cabos: cabos };
  }

  // Só a parte física (usado pelo editor de racks antes de gravar).
  function validarRacksDoProjeto(racks, cabos) {
    var relatorio = { erros: [], ajustes: [] };
    var r = validarRacks(racks, cabos, "estrito", relatorio);
    return { ok: relatorio.erros.length === 0, dados: r, erros: relatorio.erros };
  }


  global.GrafoEsquema = {
    CATEGORIAS_RACK: CATEGORIAS_RACK,
    MODELOS_RACK: MODELOS_RACK,
    STATUS_RACK: STATUS_RACK,
    ESTADOS_ITEM_RACK: ESTADOS_ITEM_RACK,
    FACES_RACK: FACES_RACK,
    TIPOS_CABO_RACK: TIPOS_CABO_RACK,
    verificarPosicaoRack: verificarPosicaoRack,
    ocupacaoRack: ocupacaoRack,
    validarRacksDoProjeto: validarRacksDoProjeto,
    LIMITES: LIMITES,
    ipValido: ipValido,
    normalizarCapacidade: normalizarCapacidade,
    validarProjeto: validarProjeto,
    MODOS: MODOS,
    validarEquipamento: validarEquipamento,
    validarConexao: validarConexao,
    validarNomeProjeto: validarNomeProjeto,
    expandirPortas: expandirPortas,
    normalizarModelos: normalizarModelos,
    buscarModelo: buscarModelo,
    filtrarModelosPorTipo: filtrarModelosPorTipo,
    CORES_ANOTACAO: CORES_ANOTACAO
  };
})(window);
