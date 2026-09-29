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
    conexoes: 2000,
    id: 60,
    nome: 60,
    modelo: 60,
    tipo: 40,
    grupo: 40,
    ip: 45,
    icone: 300,
    imagem: 400000, // ~300 KB de imagem em base64 (as enviadas são reduzidas para 256 px)
    porta: 30,
    tipoCabo: 40,
    capacidade: 20,
    grossuraMin: 1,
    grossuraMax: 10,
    coordenada: 20000,
    canvas: { minX: -4200, maxX: 4200, minY: -3200, maxY: 3200 }
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
    grupo: { rotulo: "Grupo", esquema: texto(LIMITES.grupo), reparar: truncar(LIMITES.grupo) },
    status: { rotulo: "Status", esquema: ESQUEMA_STATUS, reparar: constante("ativo") },
    icone: { rotulo: "Ícone", esquema: ESQUEMA_ICONE, reparar: constante("") },
    imagem: { rotulo: "Imagem", esquema: ESQUEMA_IMAGEM, reparar: constante("") },
    corFonte: { rotulo: "Cor da fonte", esquema: cor(COR_FONTE_PADRAO), reparar: constante(COR_FONTE_PADRAO) },
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

    return concluir(relatorio, { equipamentos: equipamentos, conexoes: conexoes });
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
    return melhor ? melhor.m : null;
  }

  global.GrafoEsquema = {
    LIMITES: LIMITES,
    ipValido: ipValido,
    normalizarCapacidade: normalizarCapacidade,
    validarProjeto: validarProjeto,
    validarEquipamento: validarEquipamento,
    validarConexao: validarConexao,
    validarNomeProjeto: validarNomeProjeto,
    expandirPortas: expandirPortas,
    normalizarModelos: normalizarModelos,
    buscarModelo: buscarModelo
  };
})(window);
