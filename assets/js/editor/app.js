/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
(function () {
  "use strict";

  // Regras de validação/normalização (assets/js/comum/esquema.js): as mesmas para
  // formulários, importação de JSON/CSV e o que está salvo no navegador.
  var Esquema = window.GrafoEsquema;
  var LIMITES = Esquema.LIMITES;
  var ipValido = Esquema.ipValido;
  var normalizarCapacidade = Esquema.normalizarCapacidade;

  var ICONES = [""];
  var EQUIPAMENTOS_API_URL = (window.EQUIPAMENTOS_API_URL && window.EQUIPAMENTOS_API_URL.trim()) || "/api/equipamentos";

  function resolverUrlRelativa(origem) {
    if (!origem) return origem;
    if (/^(data:|blob:|https?:|\/\/)/i.test(origem)) return origem;
    var arquivo = String(origem).trim();
    if (!arquivo) return origem;
    var caminho = arquivo.replace(/\\/g, "/");
    try {
      if (!caminho.startsWith("/")) {
        return new URL("./" + caminho, document.baseURI || window.location.href).href;
      }
      return new URL(caminho, document.baseURI || window.location.href).href;
    } catch (e) {
      return arquivo;
    }
  }

  function normalizarNomeArquivoImagem(valor) {
    return String(valor || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  }

  var ASSET_BASE = "./assets/images/equipamentos/";
  var ASSET_FALLBACK_BASE = "./";

  function caminhoImagem(nomeArquivo) {
    if (!nomeArquivo) return "";
    var nome = String(nomeArquivo).trim();
    if (!nome) return "";
    if (/^(data:|blob:|https?:|\/\/)/i.test(nome)) return nome;
    var caminhoPadrao = nome.replace(/\\/g, "/");
    var semPrefixo = caminhoPadrao.replace(/^\.\//, "");
    var candidatos = [
      ASSET_BASE + semPrefixo,
      ASSET_FALLBACK_BASE + semPrefixo,
      semPrefixo,
      ASSET_BASE + nome,
      ASSET_FALLBACK_BASE + nome
    ];
    return candidatos.find(function (caminho) {
      return Boolean(caminho) && !caminho.includes("undefined");
    }) || caminhoPadrao;
  }

  // Quadro de símbolos para diagramas: [tipo sugerido, arquivo em assets/images,
  // nome do ícone na lista "Ícone"]. A ordem é a da lista de tipos.
  var SIMBOLOS = [
    ["Volt POP Protect", "VOLT.png", "Volt POP Protect"],
    ["RB / CCR", "MIKROTIK.png", "RB / CCR (MikroTik)"],
    ["Switch", "SWITCH.png", "Switch"],
    ["Retificador", "RETIFICADOR.png", "Retificador / RPS"],
    ["Câmera", "CAMERA.png", "Câmera"],
    ["Nobreak", "NOBREAK.png", "Nobreak"],
    ["Conversor de fibra", "CONVERSOR-FIBRA.png", "Conversor de fibra"],
    ["Concentrador Hotspot", "CONCENTRADOR-HOTSPOT.png", "Concentrador Hotspot"],
    ["CX", "CX.png", "CX"],
    ["Decoder", "DECODER.png", "Decoder"],
    ["DIO", "DIO.png", "DIO (Distribuidor Interno Óptico)"],
    ["AP WiFi", "AP-WIFI.png", "AP WiFi"],
    ["OLT", "OLT.png", "OLT"],
    ["Splitter", "DEMUX.png", "Splitter óptico (1:2 a 1:64)"],
    ["CTO", "CX.png", "CTO (caixa de atendimento)"],
    ["ONU", "ONU.svg", "ONU / ONT"],
    ["POE", "POE.png", "POE"],
    ["UniFi", "UNIFI.png", "UniFi"],
    ["NVR", "NVR.png", "NVR"],
    ["Servidor", "SERVIDOR.svg", "Servidor"],
    ["DWDM", "DWDM.png", "DWDM"],
    ["MUX", "MUX.png", "MUX"],
    ["DEMUX", "DEMUX.png", "DEMUX"],
    ["Ar condicionado", "AR.png", "Ar condicionado"],
    ["Bateria", "BATERIA.png", "Bateria"],
    ["Switch POE", "SWITCH-POE.png", "Switch POE"],
    ["Conversor de mídia", "CONVERSOR-MIDIA.png", "Conversor de mídia"],
    ["Controle de acesso", "CONTROLE-ACESSO.png", "Controle de acesso"],
    ["Aligera", "ALIGERA.png", "Aligera"],
    ["Dream Machine", "DREAM-MACHINE.png", "Dream Machine"],
    ["Nuvem VPLS", "NUVEM-VPLS.png", "Nuvem VPLS"]
  ];
  // Outros nomes para o mesmo equipamento (VOLT = Volt POP Protect, UPS =
  // Nobreak...), que projetos já salvos usam: reconhecidos, mas fora da lista.
  var TIPOS_ANTIGOS = [["MikroTik", "MIKROTIK.png"], ["VOLT", "VOLT.png"], ["UPS", "NOBREAK.png"], ["AR", "AR.png"], ["RPS", "RETIFICADOR.png"], ["XPS", "RETIFICADOR.png"], ["Camera IP", "CAMERA.png"]];
  var TIPOS_BASE = SIMBOLOS.map(function (s) { return { nome: s[0], icone: caminhoImagem(s[1]) }; })
    .concat(TIPOS_ANTIGOS.map(function (s) { return { nome: s[0], icone: caminhoImagem(s[1]), apelido: true }; }));
  var ICONES_DOS_SIMBOLOS = SIMBOLOS.map(function (s) { return caminhoImagem(s[1]); });
  var CATALOGO_ICONES = SIMBOLOS.map(function (s) { return { valor: caminhoImagem(s[1]), nome: s[2], arquivo: caminhoImagem(s[1]) }; });
  var catalogoTiposEquipamentos = TIPOS_BASE.slice();

  function normalizarTextoEquipamento(valor) {
    return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  function extrairNomeTipo(item) {
    if (!item) return "";
    return item.nome || item.tipo || item.tipoequipamento || item.label || item.value || "";
  }

  function extrairIconeTipo(item) {
    if (!item) return "";
    return item.icone || item.arquivo || item.imagem || item.iconeArquivo || item.icon || "";
  }

  // Caminhos antigos dos ícones, que projetos salvos ainda usam: os .jpeg com
  // fundo branco viraram .png sem fundo, e os ícones saíram de assets/images/
  // para assets/images/equipamentos/.
  function nomeAtualDaImagem(valor) {
    if (typeof valor !== "string" || /^data:/i.test(valor)) return valor;
    return valor
      .replace(/(^|\/)(AR|CAMERA|NOBREAK|OLT|RETIFICADOR|SWITCH|VOLT)\.jpe?g$/i, function (_, antes, nome) { return antes + nome.toUpperCase() + ".png"; })
      .replace(/(^|\/)assets\/images\/([^/]+\.(png|svg))$/i, "$1assets/images/equipamentos/$2");
  }

  function imagemDoIcone(valor) {
    valor = nomeAtualDaImagem(valor);
    if (!valor) return "";
    var valorNormalizado = normalizarNomeArquivoImagem(valor);
    var item = CATALOGO_ICONES.find(function (icone) {
      var alvo = normalizarNomeArquivoImagem(icone.valor || icone.arquivo || icone.nome || "");
      return alvo === valorNormalizado || normalizarNomeArquivoImagem(icone.arquivo || "") === valorNormalizado;
    });
    if (item) return item.arquivo || "";

    var valorEmTexto = String(valor || "").toLowerCase();
    if (valorEmTexto.indexOf("mikrotik") >= 0 || valorEmTexto.indexOf("rb/") >= 0 || valorEmTexto.indexOf("roteador") >= 0) return caminhoImagem("MIKROTIK.png");
    if (valorEmTexto.indexOf("switch") >= 0) return caminhoImagem("SWITCH.png");
    if (valorEmTexto.indexOf("olt") >= 0) return caminhoImagem("OLT.png");
    if (/(^|[^a-z])ar([^a-z]|$)/.test(valorEmTexto) || valorEmTexto.indexOf("hvac") >= 0 || valorEmTexto.indexOf("climatiz") >= 0) return caminhoImagem("AR.png");
    if (/c[aâ]mera/.test(valorEmTexto)) return caminhoImagem("CAMERA.png");
    if (/(^|[^a-z])on[ut]([^a-z]|$)/.test(valorEmTexto)) return caminhoImagem("ONU.svg");
    if (valorEmTexto.indexOf("servidor") >= 0 || valorEmTexto.indexOf("server") >= 0) return caminhoImagem("SERVIDOR.svg");
    if (valorEmTexto.indexOf("retificador") >= 0 || valorEmTexto.indexOf("rps") >= 0) return caminhoImagem("RETIFICADOR.png");
    if (valorEmTexto.indexOf("nobreak") >= 0 || valorEmTexto.indexOf("nobreack") >= 0) return caminhoImagem("NOBREAK.png");
    if (valorEmTexto.indexOf("volt") >= 0) return caminhoImagem("VOLT.png");
    return "";
  }

  // Tipos que aparecem primeiro na lista, conforme o modo do projeto; os demais vêm depois.
  var TIPOS_PRIMEIRO_POR_MODO = {
    redes: ["RB / CCR", "Switch", "OLT", "ONU", "Switch POE", "Conversor de fibra", "Conversor de mídia", "DIO", "DWDM", "MUX", "DEMUX",
      "Servidor", "Concentrador Hotspot", "AP WiFi", "UniFi", "Dream Machine", "Nuvem VPLS"],
    monitoramento: ["Câmera", "NVR", "Decoder", "Controle de acesso", "Switch POE", "POE", "Nobreak", "Bateria", "Retificador",
      "Volt POP Protect", "Ar condicionado", "Aligera", "Servidor"]
  };

  function renderizarTiposSugeridos() {
    var datalist = document.getElementById("tipos-sugeridos");
    if (!datalist) return;
    var primeiro = TIPOS_PRIMEIRO_POR_MODO[modoAtual()] || [];
    var posicao = function (item) { var i = primeiro.indexOf(extrairNomeTipo(item)); return i < 0 ? primeiro.length : i; };
    var itens = [];
    catalogoTiposEquipamentos.forEach(function (tipo) {
      var nome = extrairNomeTipo(tipo);
      if (!nome || tipo.apelido) return;
      var chave = normalizarTextoEquipamento(nome);
      if (!itens.some(function (entry) { return normalizarTextoEquipamento(entry.nome) === chave; })) {
        itens.push({ nome: nome, icone: extrairIconeTipo(tipo), ordem: posicao(tipo) * 1000 + itens.length });
      }
    });
    itens.sort(function (a, b) { return a.ordem - b.ordem; });
    datalist.innerHTML = itens.map(function (tipo) {
      return '<option value="' + escaparHtml(tipo.nome) + '"></option>';
    }).join("");
  }

  // Tipo do catálogo para o texto digitado: o nome igual; senão, o nome mais
  // longo que aparece no texto como palavra inteira ("Switch POE 24p" -> Switch
  // POE, e não Switch); senão, o mais curto que contém o texto ("conversor").
  // Palavra inteira para "DIO" não pegar "Rádio" nem "MUX" pegar "DEMUX".
  function buscarTipoNoCatalogo(tipo) {
    var chave = palavrasDoTipo(tipo);
    if (!chave) return null;
    var melhor = null, pontos = 0;
    catalogoTiposEquipamentos.forEach(function (item) {
      var nome = palavrasDoTipo(extrairNomeTipo(item));
      if (!nome) return;
      var p = nome === chave ? 3000
        : (" " + chave + " ").indexOf(" " + nome + " ") >= 0 ? 2000 + nome.length
        : (" " + nome + " ").indexOf(" " + chave + " ") >= 0 ? 1000 - nome.length : 0;
      if (p > pontos) { melhor = item; pontos = p; }
    });
    return melhor;
  }
  function palavrasDoTipo(valor) {
    return normalizarTextoEquipamento(valor).replace(/[^a-z0-9]+/g, " ").trim();
  }

  function registrarTipoEquipamento(nome, opcoes) {
    var nomeTipo = String(nome || "").trim();
    if (!nomeTipo) return false;
    var item = {
      nome: nomeTipo,
      icone: opcoes && opcoes.icone ? opcoes.icone : ""
    };
    var existente = buscarTipoNoCatalogo(nomeTipo);
    if (existente) {
      if (opcoes && opcoes.icone && !existente.icone) existente.icone = opcoes.icone;
      return true;
    }
    catalogoTiposEquipamentos.push(item);
    renderizarTiposSugeridos();
    return true;
  }

  function aplicarCatalogoExterno(lista) {
    var tipos = Array.isArray(lista) ? lista : [];
    var merge = TIPOS_BASE.slice();
    tipos.forEach(function (item) {
      if (!item) return;
      var nome = String(extrairNomeTipo(item) || "").trim();
      if (!nome) return;
      var icone = extrairIconeTipo(item) || "";
      // A API manda só o nome do arquivo ("OLT.png"); emojis passam direto.
      if (/^[\w.-]+\.(png|jpe?g|gif|svg|webp)$/i.test(icone)) icone = caminhoImagem(icone);
      // Com o ícone de um símbolo do quadro, é outro nome para ele ("HVAC" = Ar condicionado).
      merge.push({ nome: nome, icone: icone, apelido: ICONES_DOS_SIMBOLOS.indexOf(icone) >= 0 });
    });
    catalogoTiposEquipamentos = merge.filter(function (item, index, array) {
      var nome = String(extrairNomeTipo(item) || "").trim();
      if (!nome) return false;
      return array.findIndex(function (entry) {
        return normalizarTextoEquipamento(extrairNomeTipo(entry)) === normalizarTextoEquipamento(nome);
      }) === index;
    });
    renderizarTiposSugeridos();
  }

  function carregarTiposDeEquipamento() {
    var urls = [EQUIPAMENTOS_API_URL, "/api/equipamentos", "./data/equipamentos.json", "/data/equipamentos.json"];
    var indiceAtual = 0;

    function tentarProximo() {
      if (indiceAtual >= urls.length) {
        catalogoTiposEquipamentos = TIPOS_BASE.slice();
        renderizarTiposSugeridos();
        return;
      }

      var urlAtual = urls[indiceAtual++];
      fetch(urlAtual, { cache: "no-store" })
        .then(function (resposta) {
          if (!resposta.ok) throw new Error("HTTP " + resposta.status);
          return resposta.json();
        })
        .then(function (dados) {
          if (dados && !Array.isArray(dados)) aplicarModelos(dados.modelos);
          var lista = Array.isArray(dados) ? dados : (Array.isArray(dados.tipos) ? dados.tipos : []);
          if (lista.length) {
            aplicarCatalogoExterno(lista);
          } else {
            catalogoTiposEquipamentos = TIPOS_BASE.slice();
            renderizarTiposSugeridos();
          }
        })
        .catch(function () {
          tentarProximo();
        });
    }

    tentarProximo();
  }

  function iconePorTipo(tipo) {
    var itemCatalogo = buscarTipoNoCatalogo(tipo);
    if (itemCatalogo && itemCatalogo.icone) return itemCatalogo.icone;

    var chave = normalizarTextoEquipamento(tipo);
    if (chave.indexOf("olt") >= 0) return ASSET_BASE + "OLT.png";
    if (chave.indexOf("switch") >= 0) return ASSET_BASE + "SWITCH.png";
    if (chave.indexOf("roteador") >= 0 || chave.indexOf("mikrotik") >= 0 || chave.indexOf("rb/") >= 0) return ASSET_BASE + "MIKROTIK.png";
    if (chave.indexOf("retificador") >= 0 || chave.indexOf("rps") >= 0) return ASSET_BASE + "RETIFICADOR.png";
    if (chave.indexOf("nobreak") >= 0 || chave.indexOf("nobreack") >= 0) return ASSET_BASE + "NOBREAK.png";
    if (chave.indexOf("conversor") >= 0 || chave.indexOf("modulo") >= 0 || chave.indexOf("volt") >= 0) return ASSET_BASE + "VOLT.png";
    return "";
  }

  window.apiEquipamentos = {
    listar: function () { return catalogoTiposEquipamentos.slice(); },
    registrar: registrarTipoEquipamento,
    recarregar: carregarTiposDeEquipamento,
    url: EQUIPAMENTOS_API_URL
  };

  // ---- Modelos de equipamento e portas ------------------------------------------
  // Catálogo em data/equipamentos.json ("modelos"). Com o Modelo do equipamento
  // preenchido com um modelo conhecido, os campos de porta dos cabos sugerem as
  // portas dele — livres primeiro, as ocupadas com o equipamento do outro lado.
  // Digitar outra porta continua valendo (a lista é só sugestão).
  var catalogoModelos = [];

  function aplicarModelos(lista) {
    catalogoModelos = Esquema.normalizarModelos(lista);
    renderizarModelosSugeridos();
  }

  // lista: os modelos a mostrar (padrão: o catálogo inteiro).
  function renderizarModelosSugeridos(lista) {
    var datalist = document.getElementById("modelos-sugeridos");
    if (!datalist) return;
    datalist.innerHTML = (lista || catalogoModelos).map(function (m) {
      var detalhe = [m.fabricante, m.tipo, m.portas.length + (m.portas.length === 1 ? " porta" : " portas")].filter(Boolean).join(" · ");
      return '<option value="' + escaparHtml(m.nome) + '" label="' + escaparHtml(detalhe) + '"></option>';
    }).join("");
  }

  function modeloDoEquipamento(eq) {
    return eq ? Esquema.buscarModelo(catalogoModelos, eq.modelo) : null;
  }

  // Portas do equipamento já usadas por outros cabos: { "ether2": "SW-CORE" } (chave em minúsculas).
  function portasEmUso(idEquipamento, conexaoIgnorada) {
    var nomePorId = {};
    estado.equipamentos.forEach(function (eq) { nomePorId[eq.id] = eq.nome || eq.id; });
    var usadas = {};
    estado.conexoes.forEach(function (c) {
      if (c === conexaoIgnorada) return;
      if (c.de === idEquipamento && c.saida) usadas[String(c.saida).toLowerCase()] = nomePorId[c.para] || c.para;
      if (c.para === idEquipamento && c.chegada) usadas[String(c.chegada).toLowerCase()] = nomePorId[c.de] || c.de;
    });
    return usadas;
  }

  // Campo de porta -> select do equipamento daquela ponta.
  var CAMPOS_PORTA = {
    navCableSaida: "navCableDe", navCableChegada: "navCablePara",
    novoCabSaida: "novoCabDe", novoCabChegada: "novoCabPara",
    editCaboSaida: "editCaboDe", editCaboChegada: "editCaboPara"
  };

  // { idEquipamento, conexao (a que está sendo editada, para não contar a própria porta) } ou null.
  function contextoDoCampoPorta(campo) {
    if (!campo || campo.tagName !== "INPUT") return null;
    var idSelect = CAMPOS_PORTA[campo.id];
    if (idSelect) {
      var select = document.getElementById(idSelect);
      return { idEquipamento: select ? select.value : "", conexao: campo.id.indexOf("editCabo") === 0 ? editor.conexao : null };
    }
    var campoLista = campo.getAttribute("data-field");
    var linha = (campoLista === "saida" || campoLista === "chegada") && campo.closest(".conex-row");
    if (!linha) return null;
    var c = estado.conexoes[parseInt(linha.getAttribute("data-idx"), 10)];
    return c ? { idEquipamento: campoLista === "saida" ? c.de : c.para, conexao: c } : null;
  }

  function prepararSugestoesDePorta(campo) {
    var ctx = contextoDoCampoPorta(campo);
    var datalist = document.getElementById("portas-sugeridas");
    if (!ctx || !datalist) return;
    if (!campo.hasAttribute("data-placeholder-original")) campo.setAttribute("data-placeholder-original", campo.placeholder || "");
    campo.setAttribute("list", "portas-sugeridas");
    campo.setAttribute("autocomplete", "off");
    var eq = estado.equipamentos.find(function (item) { return item.id === ctx.idEquipamento; });
    var modelo = modeloDoEquipamento(eq);
    if (!modelo) {
      datalist.innerHTML = "";
      campo.placeholder = campo.getAttribute("data-placeholder-original");
      campo.title = eq ? "Preencha o Modelo de " + (eq.nome || eq.id) + " com um modelo do catálogo para escolher a porta numa lista." : "";
      return;
    }
    var usadas = portasEmUso(eq.id, ctx.conexao);
    var livres = [], ocupadas = [];
    modelo.portas.forEach(function (p) { (usadas[p.toLowerCase()] ? ocupadas : livres).push(p); });
    function opcao(p, rotulo) { return '<option value="' + escaparHtml(p) + '" label="' + escaparHtml(rotulo) + '"></option>'; }
    datalist.innerHTML = livres.map(function (p) { return opcao(p, "livre"); })
      .concat(ocupadas.map(function (p) { return opcao(p, "em uso · " + usadas[p.toLowerCase()]); })).join("");
    campo.placeholder = livres.length ? "Livre: " + livres[0] : "Todas as portas em uso";
    campo.title = modelo.nome + ": " + livres.length + " de " + modelo.portas.length + " portas livres";
  }

  document.addEventListener("focusin", function (event) { prepararSugestoesDePorta(event.target); });
  // Trocar o equipamento da ponta com o campo de porta já aberto atualiza a lista.
  document.addEventListener("change", function (event) {
    var id = event.target && event.target.id;
    Object.keys(CAMPOS_PORTA).forEach(function (campoId) {
      if (CAMPOS_PORTA[campoId] === id) {
        var campo = document.getElementById(campoId);
        if (campo) prepararSugestoesDePorta(campo);
      }
    });
  });

  // Escolheu um modelo do catálogo com o Tipo vazio: preenche o tipo do modelo.
  var CAMPOS_MODELO = { navEquipModelo: "navEquipTipo", novoEquipModelo: "novoEquipTipo", editEquipModelo: "editEquipTipo" };

  // Campo Tipo que acompanha um campo Modelo (formulários e "Editar em lista").
  function campoTipoDoModelo(campo) {
    if (!campo || campo.tagName !== "INPUT") return null;
    if (CAMPOS_MODELO[campo.id]) return document.getElementById(CAMPOS_MODELO[campo.id]);
    if (campo.getAttribute("data-field") !== "modelo") return null;
    var cartao = campo.closest(".equip-card");
    return cartao ? cartao.querySelector('input[data-field="tipo"]') : null;
  }

  // Ao abrir o campo Modelo, a lista mostra só os modelos do Tipo escolhido
  // ("Switch" -> switches; "MikroTik" -> todos os MikroTik; vazio -> todos).
  document.addEventListener("focusin", function (event) {
    var campoTipo = campoTipoDoModelo(event.target);
    if (!campoTipo && !(event.target && (CAMPOS_MODELO[event.target.id] || event.target.getAttribute && event.target.getAttribute("data-field") === "modelo"))) return;
    var lista = Esquema.filtrarModelosPorTipo(catalogoModelos, campoTipo ? campoTipo.value : "");
    renderizarModelosSugeridos(lista);
    event.target.title = campoTipo && campoTipo.value.trim() && lista.length < catalogoModelos.length
      ? "Mostrando " + lista.length + " modelo(s) do tipo " + campoTipo.value.trim() + ". Apague o Tipo para ver todos."
      : "";
  });
  document.addEventListener("input", function (event) {
    var campoTipo = event.target && CAMPOS_MODELO[event.target.id] && document.getElementById(CAMPOS_MODELO[event.target.id]);
    if (!campoTipo || campoTipo.value.trim()) return;
    var modelo = Esquema.buscarModelo(catalogoModelos, event.target.value);
    if (modelo && modelo.tipo) campoTipo.value = modelo.tipo;
  });

  // Depois de salvar um cabo: avisa (sem bloquear) se alguma ponta usa porta que outro cabo já usa.
  function avisarPortaEmUso(conexao) {
    if (!conexao) return;
    [["de", "saida"], ["para", "chegada"]].forEach(function (par) {
      var porta = String(conexao[par[1]] || "").trim();
      if (!porta) return;
      var outro = portasEmUso(conexao[par[0]], conexao)[porta.toLowerCase()];
      if (!outro) return;
      var eq = estado.equipamentos.find(function (item) { return item.id === conexao[par[0]]; });
      avisar("Atenção: a porta " + porta + " de " + (eq ? eq.nome || eq.id : "") + " já estava ligada a " + outro + ".");
    });
  }

  // Tamanho padrão no desenho: equipamentos de apoio/monitoramento (Volt, RB/CCR,
  // retificador/RPS, ar-condicionado, nobreak) começam com 2/3 do tamanho normal.
  var TAMANHO_REDUZIDO = 67;
  var TIPOS_REDUZIDOS = /volt|\brb\b|rb ?\/ ?ccr|\bccr\b|mikrotik|retificador|\brps\b|\bxps\b|ar condicionado|^ar$|hvac|nobreak|\bups\b/i;
  function tamanhoPadraoDoTipo(tipo) { return TIPOS_REDUZIDOS.test(String(tipo || "")) ? TAMANHO_REDUZIDO : 100; }
  // Tamanho efetivo (%): o escolhido no equipamento ou o padrão do tipo.
  function tamanhoDoEquipamento(eq) { return Number(eq && eq.tamanho) || tamanhoPadraoDoTipo(eq && eq.tipo); }

  renderizarTiposSugeridos();
  carregarTiposDeEquipamento();

  // ==== 01-estado-e-vista.js: estado do editor, elementos da página, zoom/arraste da vista e viewBox (parte de assets/js/editor/app.js; npm run montar) ====
  var contadorId = 1;
  function novoId() { return "eq" + (contadorId++) + "_" + Math.random().toString(36).slice(2, 6); }

  var estado = { equipamentos: [], conexoes: [] };

  var elListaEquip = document.getElementById("listaEquip");
  var elListaConex = document.getElementById("listaConex");
  var elFiltroEquip = document.getElementById("filtroEquip");
  var elFiltroConex = document.getElementById("filtroConex");
  var elFormEquip = document.getElementById("formEquipamento");
  var elFormCab = document.getElementById("formCabemamento");
  var elErro = document.getElementById("erro");
  var elCanvas = document.getElementById("canvas");
  var elZoomValue = document.getElementById("zoomValue");
  var elWorkspace = document.getElementById("workspace");
  var elPainelDados = document.getElementById("painelDados");
  var elProjetoSelect = document.getElementById("projetoSelect");
  var elLegenda = document.getElementById("legenda");
  var elDotCode = document.getElementById("dot-code");
  var elJsonAvancado = document.getElementById("jsonAvancado");
  var btnGerar = document.getElementById("btnGerar");
  var btnOrganizar = document.getElementById("btnOrganizarDiagrama");
  var btnCopiar = document.getElementById("btnCopiarDot");
  var btnBaixar = document.getElementById("btnBaixar");
  var btnBaixarPng = document.getElementById("btnBaixarPng");
  var btnDesfazer = document.getElementById("btnDesfazer");
  var btnRefazer = document.getElementById("btnRefazer");
  var selDirecao = document.getElementById("direcao");
  var btnTema = document.getElementById("btnTema");
  var btnModoAvancado = document.getElementById("btnModoAvancado");
  var btnSidebarCollapse = document.getElementById("btnSidebarCollapse");
  var elSidebar = document.querySelector(".sidebar");

  document.querySelectorAll(".nav-item").forEach(function (item) {
    if (!item.title) item.title = item.textContent.trim();
  });

  var ultimoDot = "";
  var downloadsCap = null;
  var projetos = {};
  var projetoAtual = "Projeto principal";
  var historicoDesfazer = [];
  var historicoRefazer = [];
  var ultimoEstadoHistorico = null;
  var aplicandoHistorico = false;
  var atualizacaoDiagramaPendente = null;
  var canvasView = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
  var LIMITE_CANVAS = LIMITES.canvas;
  Object.defineProperty(window, 'LIMITE_CANVAS', { value: LIMITE_CANVAS, configurable: true, writable: true, enumerable: true });
  Object.defineProperty(globalThis, 'LIMITE_CANVAS', { value: LIMITE_CANVAS, configurable: true, writable: true, enumerable: true });

  // Sem arredondar: a animação do zoom dá passos pequenos que o arredondamento
  // "comia" (em 12%, 0.1212 virava 0.12 e o zoom travava). A tela mostra o valor redondo.
  function limitarZoom(valor) { return Math.min(3, Math.max(0.08, Number(valor) || 1)); }

  function limitarPosicaoNoCanvas(valor, min, max) {
    var numero = Number(valor) || 0;
    if (!Number.isFinite(numero)) return min;
    return Math.min(max, Math.max(min, numero));
  }

  function normalizarEquipamentoDentroDoCanvas(equipamento) {
    if (!equipamento || !equipamento.deslocamento) return equipamento;
    equipamento.deslocamento.x = limitarPosicaoNoCanvas(equipamento.deslocamento.x, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
    equipamento.deslocamento.y = limitarPosicaoNoCanvas(equipamento.deslocamento.y, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
    return equipamento;
  }

  // Largura/altura do SVG em px sem zoom (o Graphviz usa "pt": 1pt = 4/3 px).
  function comprimentoEmPx(valor) {
    var n = parseFloat(valor) || 0;
    return /pt$/i.test(String(valor || "")) ? n * 4 / 3 : n;
  }
  function tamanhoNaturalSvg(svg) {
    return { largura: comprimentoEmPx(svg.getAttribute("width")), altura: comprimentoEmPx(svg.getAttribute("height")) };
  }

  // Medidas que não mudam durante um arraste (formato dos equipamentos, das
  // portas e dos rótulos: só a posição muda). Guardadas enquanto o arraste dura:
  // medir (getBBox) logo depois de mover algo obriga o navegador a recalcular o
  // layout, e o redesenho dos cabos media várias vezes por quadro.
  var cacheMedidas = null;
  function medir(el) {
    if (!cacheMedidas) return el.getBBox();
    var b = cacheMedidas.get(el);
    if (!b) { b = el.getBBox(); cacheMedidas.set(el, b); }
    return b;
  }
  function iniciarCacheDeMedidas() { cacheMedidas = new WeakMap(); }
  function encerrarCacheDeMedidas() { cacheMedidas = null; }
  // Caixa de um grupo: ajustarCaixasDosGrupos grava as medidas que acabou de
  // desenhar (el.__caixa), e quem vem depois lê sem medir de novo.
  function caixaDoGrupo(forma) {
    if (forma && forma.__caixa) return forma.__caixa;
    return forma ? forma.getBBox() : null;
  }

  // Tamanho da área do diagrama, guardado: ler clientWidth logo depois de mover
  // o SVG obriga o navegador a recalcular o layout da página a cada quadro.
  // O ResizeObserver (05-zoom…) atualiza quando a área muda de tamanho.
  var tamanhoAreaCanvas = null;
  function tamanhoDaArea() {
    if (!tamanhoAreaCanvas || !tamanhoAreaCanvas.w) tamanhoAreaCanvas = { w: elCanvas.clientWidth, h: elCanvas.clientHeight };
    return tamanhoAreaCanvas;
  }

  // Pan livre, mas sempre deixando ao menos MARGEM px do diagrama visíveis.
  function limitarPan(svg) {
    var MARGEM = 80;
    var tamanho = tamanhoNaturalSvg(svg);
    var largura = tamanho.largura * canvasView.scale;
    var altura = tamanho.altura * canvasView.scale;
    var area = tamanhoDaArea();
    var larguraCanvas = area.w;
    var alturaCanvas = area.h;
    if (!larguraCanvas || !alturaCanvas || !largura || !altura) return;
    canvasView.x = Math.min(larguraCanvas - MARGEM, Math.max(MARGEM - largura, canvasView.x));
    canvasView.y = Math.min(alturaCanvas - MARGEM, Math.max(MARGEM - altura, canvasView.y));
  }

  var textoZoomAtual = "";
  function aplicarCanvasView() {
    var svg = elCanvas.querySelector("svg");
    if (svg) {
      limitarPan(svg);
      // translate3d: fica na GPU; com .interagindo (will-change) o movimento nem repinta.
      svg.style.transform = "translate3d(" + canvasView.x + "px, " + canvasView.y + "px, 0) scale(" + canvasView.scale + ")";
    }
    var texto = Math.round(canvasView.scale * 100) + "%";
    if (texto !== textoZoomAtual) { elZoomValue.textContent = texto; textoZoomAtual = texto; }
  }

  // ---- Câmera suave -------------------------------------------------------------
  // Zoom e "ajustar à tela" deslizam até o alvo a cada quadro (requestAnimationFrame),
  // com desaceleração exponencial independente da taxa de quadros. Antes era uma
  // transição CSS que recomeçava a cada giro da roda e "engasgava". O arrastar
  // (pan) segue o ponteiro sem atraso, agrupado por quadro.
  // Durante o movimento o SVG vira camada da GPU (.interagindo -> will-change):
  // mover e ampliar não repinta nada; ao parar, ele é redesenhado nítido.
  var reduzirMovimentoCamera = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var camera = { alvo: null, ancora: null, suavidade: 0.2, quadro: 0, ultimo: 0 };
  var timerInteracao = null;
  var panAgendado = false;

  function marcarInteracao() {
    elCanvas.classList.add("interagindo");
    clearTimeout(timerInteracao);
    timerInteracao = setTimeout(function () {
      if (!camera.quadro && !canvasView.dragging) elCanvas.classList.remove("interagindo");
    }, 160);
  }

  function passoCamera(agora) {
    camera.quadro = 0;
    var alvo = camera.alvo;
    if (!alvo) return;
    var dt = camera.ultimo ? Math.min(64, agora - camera.ultimo) : 16.7;
    camera.ultimo = agora;
    var k = 1 - Math.pow(1 - camera.suavidade, dt / 16.7);
    var s0 = canvasView.scale;
    var s1 = Math.exp(Math.log(s0) + (Math.log(alvo.scale) - Math.log(s0)) * k);
    var fim;
    if (camera.ancora) {
      // Zoom em torno de um ponto (cursor ou centro): o ponto fica parado na tela.
      if (Math.abs(Math.log(alvo.scale / s1)) < 0.0015) s1 = alvo.scale;
      var px = camera.ancora.x, py = camera.ancora.y;
      canvasView.x = px - (px - canvasView.x) * s1 / s0;
      canvasView.y = py - (py - canvasView.y) * s1 / s0;
      canvasView.scale = s1;
      fim = s1 === alvo.scale;
    } else {
      canvasView.x += (alvo.x - canvasView.x) * k;
      canvasView.y += (alvo.y - canvasView.y) * k;
      canvasView.scale = s1;
      fim = Math.abs(Math.log(alvo.scale / s1)) < 0.0015 && Math.abs(alvo.x - canvasView.x) < 0.4 && Math.abs(alvo.y - canvasView.y) < 0.4;
      if (fim) { canvasView.x = alvo.x; canvasView.y = alvo.y; canvasView.scale = alvo.scale; }
    }
    aplicarCanvasView();
    if (fim) { camera.alvo = null; camera.ultimo = 0; marcarInteracao(); return; }
    camera.quadro = requestAnimationFrame(passoCamera);
  }

  function iniciarCamera() {
    marcarInteracao();
    if (reduzirMovimentoCamera && reduzirMovimentoCamera.matches) camera.suavidade = 1;
    if (!camera.quadro) { camera.ultimo = 0; camera.quadro = requestAnimationFrame(passoCamera); }
  }

  function pararCamera() {
    if (camera.quadro) cancelAnimationFrame(camera.quadro);
    camera.quadro = 0; camera.alvo = null; camera.ultimo = 0;
  }

  // Zoom animado por um fator, em torno de (px, py) do canvas (centro, se omitido).
  // Giros seguidos acumulam no alvo, então a roda rápida não perde passos.
  // suavidade: fração do caminho por quadro (0.2 = deslize; 0.5 = quase imediato).
  function zoomSuave(fator, px, py, suavidade) {
    if (px == null || py == null) { px = elCanvas.clientWidth / 2; py = elCanvas.clientHeight / 2; }
    var base = camera.alvo && camera.ancora ? camera.alvo.scale : canvasView.scale;
    camera.alvo = { scale: limitarZoom(base * fator) };
    camera.ancora = { x: px, y: py };
    camera.suavidade = suavidade || 0.2;
    iniciarCamera();
  }

  function moverCameraPara(scale, x, y) {
    camera.alvo = { scale: limitarZoom(scale), x: x, y: y };
    camera.ancora = null;
    camera.suavidade = 0.16;
    iniciarCamera();
  }

  // Pan: grava a posição e desenha uma vez por quadro, por mais eventos que cheguem.
  function agendarPan() {
    marcarInteracao();
    if (panAgendado) return;
    panAgendado = true;
    requestAnimationFrame(function () { panAgendado = false; aplicarCanvasView(); });
  }

  // Centraliza o diagrama e escolhe um zoom (até 100%) em que ele caiba inteiro.
  // animar: desliza até lá (botão ↺); sem animar, vai direto (primeira renderização).
  function ajustarATela(animar) {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var tamanho = tamanhoNaturalSvg(svg);
    var larguraCanvas = elCanvas.clientWidth;
    var alturaCanvas = elCanvas.clientHeight;
    if (!tamanho.largura || !tamanho.altura || !larguraCanvas || !alturaCanvas) return;
    var folga = 32;
    // Área livre de verdade: sem a caixa de ferramentas presa à esquerda do
    // quadro e só a parte do quadro que cabe na tela (no celular ele é mais
    // alto que a tela e o desenho ia parar lá embaixo).
    var quadro = elCanvas.getBoundingClientRect();
    var esquerda = 0;
    var caixa = document.getElementById("caixaFerramentas");
    if (caixa && caixa.offsetParent) {
      var rc = caixa.getBoundingClientRect();
      if (rc.left < quadro.left + quadro.width / 3 && rc.height > rc.width) esquerda = Math.max(0, rc.right - quadro.left + 8);
    }
    var alturaVisivel = Math.max(160, Math.min(alturaCanvas, window.innerHeight - Math.max(0, quadro.top)));
    var larguraLivre = larguraCanvas - esquerda;
    var escala = limitarZoom(Math.min(1, (larguraLivre - folga) / tamanho.largura, (alturaVisivel - folga) / tamanho.altura));
    var x = esquerda + (larguraLivre - tamanho.largura * escala) / 2;
    var y = Math.max(folga / 2, (alturaVisivel - tamanho.altura * escala) / 2);
    if (animar === true) { moverCameraPara(escala, x, y); return; }
    pararCamera();
    canvasView.scale = escala;
    canvasView.x = x;
    canvasView.y = y;
    aplicarCanvasView();
  }

  function translateDoElemento(el) {
    var m = /translate\(\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*[, ]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i.exec(el.getAttribute("transform") || "");
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
  }

  // Equipamentos arrastados/organizados podem sair da área original que o
  // Graphviz calculou. Recalcula o viewBox para envolver todo o conteúdo, senão
  // o que fica fora é cortado (inclusive na exportação SVG/PNG).
  // manterPosicao: compensa o pan para o diagrama não "pular" na tela.
  function ajustarViewBoxAoConteudo(manterPosicao) {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Array.prototype.forEach.call(grafo.children, function (el) {
      if (!el.classList || !(el.classList.contains("node") || el.classList.contains("edge") || el.classList.contains("cluster") || el.classList.contains("anotacao") || el.classList.contains("legenda-cabos") || el.classList.contains("camada-mapa"))) return;
      var b;
      try { b = el.getBBox(); } catch (e) { return; }
      if (!b || (!b.width && !b.height)) return;
      var t = translateDoElemento(el);
      minX = Math.min(minX, b.x + t.x);
      minY = Math.min(minY, b.y + t.y);
      maxX = Math.max(maxX, b.x + t.x + b.width);
      maxY = Math.max(maxY, b.y + t.y + b.height);
    });
    if (!Number.isFinite(minX)) return;

    // Coordenadas do grupo g.graph -> coordenadas do viewBox (o Graphviz usa translate/scale).
    var matriz = grafo.transform && grafo.transform.baseVal.consolidate();
    var m = matriz ? matriz.matrix : { a: 1, d: 1, e: 0, f: 0 };
    var margem = 24;
    var x1 = Math.min(m.a * minX, m.a * maxX) + m.e - margem;
    var y1 = Math.min(m.d * minY, m.d * maxY) + m.f - margem;
    var largura = Math.abs(m.a * (maxX - minX)) + margem * 2;
    var altura = Math.abs(m.d * (maxY - minY)) + margem * 2;

    var vbAntigo = svg.viewBox.baseVal;
    var pxPorUnidade = vbAntigo && vbAntigo.width ? tamanhoNaturalSvg(svg).largura / vbAntigo.width : 4 / 3;
    if (manterPosicao && vbAntigo && vbAntigo.width) {
      canvasView.x += (x1 - vbAntigo.x) * pxPorUnidade * canvasView.scale;
      canvasView.y += (y1 - vbAntigo.y) * pxPorUnidade * canvasView.scale;
    }
    svg.setAttribute("viewBox", [x1, y1, largura, altura].map(function (v) { return v.toFixed(2); }).join(" "));
    svg.setAttribute("width", (largura * pxPorUnidade).toFixed(2) + "px");
    svg.setAttribute("height", (altura * pxPorUnidade).toFixed(2) + "px");
    aplicarCanvasView();
  }

  // Depois de mover equipamentos: recalcula cabos e área do diagrama na hora.
  function finalizarMovimento() {
    if (roteamentoCabosFrame) { cancelAnimationFrame(roteamentoCabosFrame); roteamentoCabosFrame = null; }
    ajustarCaixasDosGrupos();
    rotearCabosOrtogonalmente();
    ajustarViewBoxAoConteudo(true);
  }

  // Cada nó/aresta do SVG recebe id="equip_N"/"edge_N" no DOT (N = posição na
  // renderização). Estas listas guardam o que foi renderizado, para não depender
  // do texto do <title>, que o Graphviz pode alterar.
  var idsEquipRenderizados = [];
  var conexoesRenderizadas = [];

  function idEquipamentoDoNode(node) {
    var m = /^equip_(\d+)$/.exec(node && node.id || "");
    return m ? idsEquipRenderizados[Number(m[1])] || null : null;
  }

  function conexaoDaAresta(aresta) {
    var m = /^edge_(\d+)$/.exec(aresta && aresta.id || "");
    return m ? conexoesRenderizadas[Number(m[1])] || null : null;
  }

  function aplicarPosicoesEquipamentos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.node").forEach(function (node) {
      var idNode = idEquipamentoDoNode(node);
      if (!idNode) return;
      var equipamento = estado.equipamentos.find(function (eq) { return eq.id === idNode; });
      if (!equipamento || !equipamento.deslocamento) return;
      normalizarEquipamentoDentroDoCanvas(equipamento);
      atualizarPosicaoAbsoluta(equipamento);
      node.setAttribute("transform", "translate(" + equipamento.deslocamento.x + "," + equipamento.deslocamento.y + ")");
    });
  }

  window.limitarPosicaoNoCanvas = limitarPosicaoNoCanvas;
  window.normalizarEquipamentoDentroDoCanvas = normalizarEquipamentoDentroDoCanvas;
  window.LIMITE_CANVAS = LIMITE_CANVAS;
  globalThis.limitarPosicaoNoCanvas = limitarPosicaoNoCanvas;
  globalThis.normalizarEquipamentoDentroDoCanvas = normalizarEquipamentoDentroDoCanvas;
  globalThis.LIMITE_CANVAS = LIMITE_CANVAS;

  function numeroSvg(valor) {
    var n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function obterNodePorId(svg, id) {
    var encontrado = null;
    svg.querySelectorAll("g.node").forEach(function (node) {
      if (!encontrado && idEquipamentoDoNode(node) === id) encontrado = node;
    });
    return encontrado;
  }

  // ==== 02-posicoes-e-portas.js: posições absolutas dos equipamentos e lado das portas (parte de assets/js/editor/app.js; npm run montar) ====
  // ---- Posições absolutas ---------------------------------------------------
  // eq.posicao guarda o centro do equipamento nas coordenadas do grupo g.graph,
  // que não dependem do layout do Graphviz. O transform de cada nó
  // (eq.deslocamento) é recalculado a cada renderização a partir dela, então o
  // equipamento não "pula" quando as portas mudam de lado e o Graphviz refaz o layout.
  var centrosBase = {};

  function registrarCentrosBase(svg) {
    centrosBase = {};
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      if (!id) return;
      try {
        var b = node.getBBox();
        centrosBase[id] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      } catch (e) {}
    });
  }

  function posicaoValida(p) { return !!p && Number.isFinite(p.x) && Number.isFinite(p.y); }

  // Retorna true se algum equipamento ainda não tinha posição absoluta
  // (equipamento novo ou projeto salvo antes desta versão).
  function sincronizarPosicoes() {
    var novos = false;
    estado.equipamentos.forEach(function (eq) {
      var base = centrosBase[eq.id];
      if (!base) return;
      if (posicaoValida(eq.posicao)) {
        eq.deslocamento = { x: eq.posicao.x - base.x, y: eq.posicao.y - base.y };
      } else {
        var d = eq.deslocamento || { x: 0, y: 0 };
        eq.posicao = { x: base.x + (Number(d.x) || 0), y: base.y + (Number(d.y) || 0) };
        novos = true;
      }
    });
    return novos;
  }

  function atualizarPosicaoAbsoluta(eq) {
    var base = centrosBase[eq.id];
    var d = eq.deslocamento || { x: 0, y: 0 };
    if (base) eq.posicao = { x: base.x + d.x, y: base.y + d.y };
  }

  // ---- Portas ---------------------------------------------------------------
  // A porta fica no lado do equipamento voltado para o equipamento do outro
  // lado do cabo. Sem posição conhecida, usa o padrão do layout.
  // Prefere o eixo do layout (esquerda/direita em "LR", cima/baixo em "TB"):
  // só usa o outro eixo quando os dois estão quase alinhados nele. Sem isso,
  // no LR os filhos empilhados numa coluna ganhavam porta em cima e os cabos
  // desciam pela coluna, por cima dos outros equipamentos.
  var DISTANCIA_MINIMA_NO_EIXO = 40;
  function ladoVoltadoPara(origem, destino, padrao, direcao) {
    if (!origem || !destino || !posicaoValida(origem.posicao) || !posicaoValida(destino.posicao)) return padrao;
    var dx = destino.posicao.x - origem.posicao.x;
    var dy = destino.posicao.y - origem.posicao.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return padrao;
    // Na grade não há eixo principal: vale o lado para onde o outro está mais longe.
    // Grade e grupos lado a lado: a porta vai para o lado de onde o vizinho está de fato.
    var horizontal = direcao === "GRADE" || direcao === "LADO" ? Math.abs(dx) >= Math.abs(dy) : direcao === "TB"
      ? Math.abs(dy) < DISTANCIA_MINIMA_NO_EIXO && Math.abs(dx) > Math.abs(dy)
      : Math.abs(dx) >= DISTANCIA_MINIMA_NO_EIXO || Math.abs(dx) >= Math.abs(dy);
    if (horizontal) return dx > 0 ? "direita" : "esquerda";
    return dy > 0 ? "baixo" : "cima";
  }

  // Preenchido por gerarDot: por equipamento, as portas na ordem em que o
  // Graphviz desenha as caixas (cima, esquerda, direita, baixo).
  var portasRenderizadas = {};
  var VETOR_LADO = { esquerda: { x: -1, y: 0 }, direita: { x: 1, y: 0 }, cima: { x: 0, y: -1 }, baixo: { x: 0, y: 1 } };

  // Ponto onde cada ponta de cabo encosta na porta, com a direção de saída:
  // { "3:inicio": { x, y, dx, dy } }. As caixas das portas são os únicos
  // polígonos com borda dentro do nó.
  function obterPontosDasPortas(svg) {
    var pontos = {};
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      var info = id && portasRenderizadas[id];
      if (!info) return;
      var caixas = Array.prototype.filter.call(node.querySelectorAll("polygon"), function (p) {
        var s = String(p.getAttribute("stroke") || "").toLowerCase();
        return s && s !== "none" && s !== "transparent";
      });
      var t = translateDoElemento(node);
      info.ordem.forEach(function (porta, i) {
        var b;
        try { b = caixas[i] && medir(caixas[i]); } catch (e) { b = null; }
        if (!b) return;
        var v = VETOR_LADO[porta.lado];
        pontos[porta.indice + ":" + porta.ponta] = {
          x: b.x + b.width / 2 + t.x + v.x * b.width / 2,
          y: b.y + b.height / 2 + t.y + v.y * b.height / 2,
          dx: v.x,
          dy: v.y
        };
      });
    });
    return pontos;
  }

  // ==== 03-cabos-grupos-e-arraste.js: rota dos cabos, caixas dos grupos e arrastar equipamentos/cabos (parte de assets/js/editor/app.js; npm run montar) ====
  // ---- Cabos ----------------------------------------------------------------
  var CONFIG_ROTEAMENTO_CABOS = {
    espaco: 12,     // distância mínima entre trilhas paralelas
    saida: 18,      // trecho reto saindo da porta antes da primeira curva
    raioCurva: 10
  };
  var roteamentoCabosFrame = null;
  var arrastandoEquipamento = false;

  // Caminho ortogonal com as quinas arredondadas (curva quadrática em cada canto).
  // O raio encolhe em trechos curtos para a curva não passar do segmento.
  function caminhoOrtogonalArredondado(pontos) {
    var p = pontos.filter(function (ponto, i) {
      var anterior = pontos[i - 1];
      return !anterior || Math.abs(anterior.x - ponto.x) > 0.01 || Math.abs(anterior.y - ponto.y) > 0.01;
    });
    function fmt(n) { return n.toFixed(2); }
    var d = "M" + fmt(p[0].x) + "," + fmt(p[0].y);
    for (var i = 1; i < p.length - 1; i++) {
      var a = p[i - 1], b = p[i], c = p[i + 1];
      var lenAntes = Math.hypot(b.x - a.x, b.y - a.y);
      var lenDepois = Math.hypot(c.x - b.x, c.y - b.y);
      var r = Math.min(CONFIG_ROTEAMENTO_CABOS.raioCurva, lenAntes / 2, lenDepois / 2);
      if (r < 0.5) { d += " L" + fmt(b.x) + "," + fmt(b.y); continue; }
      var entrada = { x: b.x - (b.x - a.x) / lenAntes * r, y: b.y - (b.y - a.y) / lenAntes * r };
      var saida = { x: b.x + (c.x - b.x) / lenDepois * r, y: b.y + (c.y - b.y) / lenDepois * r };
      d += " L" + fmt(entrada.x) + "," + fmt(entrada.y) + " Q" + fmt(b.x) + "," + fmt(b.y) + " " + fmt(saida.x) + "," + fmt(saida.y);
    }
    var ultimo = p[p.length - 1];
    if (p.length > 1) d += " L" + fmt(ultimo.x) + "," + fmt(ultimo.y);
    return d;
  }

  function segmentosDaRota(pontos) {
    var segmentos = [];
    for (var i = 1; i < pontos.length; i++) {
      var p = pontos[i - 1], q = pontos[i];
      if (Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01) continue;
      segmentos.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, horizontal: Math.abs(p.y - q.y) < 0.5 });
    }
    return segmentos;
  }

  function intervalosSobrepoem(a1, a2, b1, b2) {
    return Math.max(a1, a2) > Math.min(b1, b2) + 0.5 && Math.max(b1, b2) > Math.min(a1, a2) + 0.5;
  }

  // Trecho reto (horizontal ou vertical) passando por dentro do retângulo.
  function segmentoAtravessaRetangulo(seg, r) {
    if (seg.horizontal) {
      return seg.y1 > r.y1 && seg.y1 < r.y2 && Math.max(seg.x1, seg.x2) > r.x1 && Math.min(seg.x1, seg.x2) < r.x2;
    }
    return seg.x1 > r.x1 && seg.x1 < r.x2 && Math.max(seg.y1, seg.y2) > r.y1 && Math.min(seg.y1, seg.y2) < r.y2;
  }

  // Custo de uma rota contra os cabos já desenhados: cabo colado/por cima de
  // outro é o pior caso, cruzamento vem logo depois. Obstáculos (equipamentos
  // e caixas de outros grupos, de rotearCabosOrtogonalmente): passar por cima
  // de um equipamento é pior que tudo; atravessar um grupo alheio, quase.
  function custoDaRota(pontos, existentes, obstaculos) {
    var espaco = CONFIG_ROTEAMENTO_CABOS.espaco;
    var custo = 0;
    var segmentos = segmentosDaRota(pontos);
    (obstaculos || []).forEach(function (r) {
      segmentos.forEach(function (seg) { if (segmentoAtravessaRetangulo(seg, r)) custo += r.custo; });
    });
    segmentos.forEach(function (a) {
      existentes.forEach(function (b) {
        if (a.horizontal !== b.horizontal) {
          var h = a.horizontal ? a : b, v = a.horizontal ? b : a;
          var cruza = v.x1 > Math.min(h.x1, h.x2) + 1 && v.x1 < Math.max(h.x1, h.x2) - 1 &&
            h.y1 > Math.min(v.y1, v.y2) + 1 && h.y1 < Math.max(v.y1, v.y2) - 1;
          if (cruza) custo += 1000;
        } else if (a.horizontal) {
          if (Math.abs(a.y1 - b.y1) < espaco && intervalosSobrepoem(a.x1, a.x2, b.x1, b.x2)) custo += 2000;
        } else if (Math.abs(a.x1 - b.x1) < espaco && intervalosSobrepoem(a.y1, a.y2, b.y1, b.y2)) {
          custo += 2000;
        }
      });
    });
    return custo;
  }

  // Testa a trilha do meio da rota (x de um trecho vertical ou y de um
  // horizontal) em passos de "espaco" ao redor de "preferido" e fica com a de
  // menor custo. Afastar-se do ideal custa pouco perto de evitar um cruzamento.
  function melhorVariante(construir, preferido, existentes, obstaculos, limite1, limite2) {
    var espaco = CONFIG_ROTEAMENTO_CABOS.espaco;
    var temLimite = limite1 != null && limite2 != null;
    var limMin = temLimite ? Math.min(limite1, limite2) : -Infinity;
    var limMax = temLimite ? Math.max(limite1, limite2) : Infinity;
    var melhor = null, melhorCusto = Infinity;
    // Arrastando: roteia a cada quadro, então testa menos trilhas (±12 em vez
    // de ±40). Ao soltar, gerar() refaz tudo com a busca completa.
    var tentativas = arrastandoEquipamento ? 25 : 81;
    for (var i = 0; i < tentativas; i++) {
      var v = preferido + Math.ceil(i / 2) * espaco * (i % 2 ? 1 : -1);
      if (v < limMin || v > limMax) continue;
      var pontos = construir(v);
      var custo = custoDaRota(pontos, existentes, obstaculos) + Math.abs(v - preferido) * 0.5;
      if (custo < melhorCusto) { melhor = pontos; melhorCusto = custo; }
      if (melhorCusto < 1) break;
    }
    return melhor || construir(temLimite ? (limMin + limMax) / 2 : preferido);
  }

  // Pontos de um cabo ortogonal de s até e (cada um com a direção de saída da porta).
  function tracarRota(s, e, existentes, obstaculos) {
    var saida = CONFIG_ROTEAMENTO_CABOS.saida;
    var a = { x: s.x + s.dx * saida, y: s.y + s.dy * saida };
    var b = { x: e.x + e.dx * saida, y: e.y + e.dy * saida };
    var horizS = s.dx !== 0, horizE = e.dx !== 0;

    function trechoVertical(x) { return [s, { x: x, y: s.y }, { x: x, y: e.y }, e]; }
    function trechoHorizontal(y) { return [s, { x: s.x, y: y }, { x: e.x, y: y }, e]; }
    // Contornos com um trecho a mais: sai da porta, desce/sobe (ou vai para o
    // lado) até uma trilha livre, atravessa e entra na outra porta.
    function contornoHorizontal(y) { return [s, a, { x: a.x, y: y }, { x: b.x, y: y }, b, e]; }
    function contornoVertical(x) { return [s, a, { x: x, y: a.y }, { x: x, y: b.y }, b, e]; }

    // Fica com a rota mais barata entre as candidatas (a primeira ganha empates).
    function maisBarata() {
      var melhor = null, melhorCusto = Infinity;
      Array.prototype.forEach.call(arguments, function (pts) {
        var c = custoDaRota(pts, existentes, obstaculos) + pts.length;
        if (c < melhorCusto) { melhor = pts; melhorCusto = c; }
      });
      return melhor;
    }

    if (horizS && horizE) {
      if (s.dx === -e.dx && (b.x - a.x) * s.dx >= 0) {
        // "Z": portas uma de frente para a outra, trecho vertical no meio.
        // Se o Z bater num equipamento/grupo, tenta contornar por cima ou por baixo.
        return maisBarata(
          melhorVariante(trechoVertical, (a.x + b.x) / 2, existentes, obstaculos, a.x, b.x),
          melhorVariante(contornoHorizontal, (s.y + e.y) / 2, existentes, obstaculos)
        );
      }
      if (s.dx === e.dx) {
        // "U": as duas portas do mesmo lado; contorna por fora.
        return melhorVariante(trechoVertical, s.dx > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x), existentes, obstaculos);
      }
      // Portas de costas uma para a outra: sai, cruza pelo meio na horizontal e volta.
      return melhorVariante(contornoHorizontal, (s.y + e.y) / 2, existentes, obstaculos);
    }

    if (!horizS && !horizE) {
      if (s.dy === -e.dy && (b.y - a.y) * s.dy >= 0) {
        return maisBarata(
          melhorVariante(trechoHorizontal, (a.y + b.y) / 2, existentes, obstaculos, a.y, b.y),
          melhorVariante(contornoVertical, (s.x + e.x) / 2, existentes, obstaculos)
        );
      }
      if (s.dy === e.dy) {
        return melhorVariante(trechoHorizontal, s.dy > 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y), existentes, obstaculos);
      }
      return melhorVariante(contornoVertical, (s.x + e.x) / 2, existentes, obstaculos);
    }

    // Uma porta na lateral e a outra em cima/embaixo: um "L" quando dá.
    if (horizS) {
      if ((e.x - s.x) * s.dx > 0 && (s.y - e.y) * e.dy > 0) return maisBarata([s, { x: e.x, y: s.y }, e], [s, a, { x: a.x, y: b.y }, b, e]);
      return [s, a, { x: a.x, y: b.y }, b, e];
    }
    if ((e.y - s.y) * s.dy > 0 && (s.x - e.x) * e.dx > 0) return maisBarata([s, { x: s.x, y: e.y }, e], [s, a, { x: b.x, y: a.y }, b, e]);
    return [s, a, { x: b.x, y: a.y }, b, e];
  }

  // Retângulos que os cabos devem evitar: todos os equipamentos e as caixas
  // dos grupos. Cada rota ignora os próprios equipamentos e os grupos deles
  // (o cabo precisa sair/entrar ali).
  var FOLGA_OBSTACULO = 6;
  var FOLGA_GRUPO = 16;
  function coletarObstaculos(svg) {
    var lista = [];
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node);
      var b, t = translateDoElemento(node);
      try { b = medir(node); } catch (e) { return; }
      if (!id || !b || !b.width) return;
      lista.push({ equipamento: id, custo: 5000,
        x1: b.x + t.x - FOLGA_OBSTACULO, y1: b.y + t.y - FOLGA_OBSTACULO,
        x2: b.x + t.x + b.width + FOLGA_OBSTACULO, y2: b.y + t.y + b.height + FOLGA_OBSTACULO });
    });
    nomesDosGrupos(estado).forEach(function (nome, indice) {
      var forma = svg.querySelector('g.cluster[id="grupo_' + indice + '"] path, g.cluster[id="grupo_' + indice + '"] polygon');
      var b;
      try { b = caixaDoGrupo(forma); } catch (e) { b = null; }
      if (!b || !b.width) return;
      // Folga maior que a dos equipamentos: o cabo não corre colado na borda
      // e o rótulo dele (5 px acima do trecho) não cai dentro da caixa.
      lista.push({ grupo: nome, custo: 1500,
        x1: b.x - FOLGA_GRUPO, y1: b.y - FOLGA_GRUPO, x2: b.x + b.width + FOLGA_GRUPO, y2: b.y + b.height + FOLGA_GRUPO });
    });
    return lista;
  }

  // Só os obstáculos ao alcance das variantes de rota (melhorVariante testa
  // até ~480 px para cada lado); o resto nem entra na conta.
  var ALCANCE_DESVIO = 520;
  function obstaculosDoCabo(todos, conexao, s, e) {
    var ids = [conexao.de, conexao.para];
    var grupos = estado.equipamentos.filter(function (eq) { return ids.indexOf(eq.id) >= 0; })
      .map(function (eq) { return String(eq.grupo || "").trim(); }).filter(Boolean);
    var x1 = Math.min(s.x, e.x) - ALCANCE_DESVIO, x2 = Math.max(s.x, e.x) + ALCANCE_DESVIO;
    var y1 = Math.min(s.y, e.y) - ALCANCE_DESVIO, y2 = Math.max(s.y, e.y) + ALCANCE_DESVIO;
    return todos.filter(function (o) {
      if (o.x2 < x1 || o.x1 > x2 || o.y2 < y1 || o.y1 > y2) return false;
      if (o.equipamento) return ids.indexOf(o.equipamento) < 0;
      return grupos.indexOf(o.grupo) < 0;
    });
  }

  // Rótulo do cabo: procura um lugar livre ao longo dos trechos (do mais longo
  // para o mais curto), dos dois lados da linha, sem cair em cima de equipamento,
  // porta ou outro rótulo ("ocupados" já começa com as caixas dos equipamentos).
  // A caixa escolhida entra em "ocupados". Sem lugar livre: meio do trecho mais longo.
  function posicionarRotuloDaAresta(aresta, pontos, ocupados) {
    var texto = aresta.querySelector("text");
    if (!texto) return;
    var trechos = [];
    for (var i = 1; i < pontos.length; i++) {
      var comp = Math.abs(pontos[i].x - pontos[i - 1].x) + Math.abs(pontos[i].y - pontos[i - 1].y);
      if (comp > 0) trechos.push({ a: pontos[i - 1], b: pontos[i], comp: comp });
    }
    if (!trechos.length) return;
    trechos.sort(function (p, q) { return q.comp - p.comp; });
    texto.removeAttribute("transform");
    if (texto.hasAttribute("data-sem-espaco")) { texto.removeAttribute("data-sem-espaco"); texto.style.display = ""; }
    function colocar(trecho, t, lado) {
      var horizontal = Math.abs(trecho.a.y - trecho.b.y) < 0.5;
      if (horizontal) {
        texto.setAttribute("x", (trecho.a.x + (trecho.b.x - trecho.a.x) * t).toFixed(2));
        texto.setAttribute("y", (trecho.a.y + (lado > 0 ? 18 : -10)).toFixed(2));
        texto.setAttribute("text-anchor", "middle");
      } else {
        texto.setAttribute("x", (trecho.a.x + (lado > 0 ? -12 : 26)).toFixed(2));
        texto.setAttribute("y", (trecho.a.y + (trecho.b.y - trecho.a.y) * t + 3).toFixed(2));
        texto.setAttribute("text-anchor", lado > 0 ? "end" : "start");
      }
    }
    colocar(trechos[0], 0.5, -1);
    if (!ocupados || !texto.textContent.trim()) return;
    function caixa() {
      try { var b = texto.getBBox(); return { x1: b.x - 18, y1: b.y - 4, x2: b.x + b.width + 8, y2: b.y + b.height + 4 }; } catch (e) { return null; }
    }
    // Quanto a caixa encosta no que já está ocupado. Em cima de equipamento ou
    // porta pesa muito mais que em cima de outro rótulo.
    function sobreposicao(c) {
      if (!c) return Infinity;
      return ocupados.reduce(function (soma, o) {
        var w = Math.min(c.x2, o.x2) - Math.max(c.x1, o.x1), h = Math.min(c.y2, o.y2) - Math.max(c.y1, o.y1);
        return w > 0 && h > 0 ? soma + w * h * (o.equipamento ? 20 : 1) : soma;
      }, 0);
    }
    function livre(c) { return sobreposicao(c) === 0; }
    var primeira = caixa();
    if (!primeira) return;
    if (livre(primeira)) { ocupados.push(primeira); return; }
    var fracoes = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
    var melhor = { custo: sobreposicao(primeira), k: 0, f: 0.5, lado: -1, caixa: primeira };
    for (var k = 0; k < trechos.length; k++) {
      if (trechos[k].comp < 24) continue;
      for (var f = 0; f < fracoes.length; f++) {
        for (var lado = -1; lado <= 1; lado += 2) {
          colocar(trechos[k], fracoes[f], lado);
          var c = caixa(), custo = sobreposicao(c);
          if (custo === 0) { ocupados.push(c); return; }
          if (custo < melhor.custo) melhor = { custo: custo, k: k, f: fracoes[f], lado: lado, caixa: c };
        }
      }
    }
    // Nenhum lugar 100% livre: o nome nunca some. Fica no lugar que menos encosta
    // (cair em cima de equipamento pesa 20 vezes mais que encostar em outro nome).
    colocar(trechos[melhor.k], melhor.f, melhor.lado);
    ocupados.push(caixa() || melhor.caixa);
  }

  function rotearCabosOrtogonalmente() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var pontos = obterPontosDasPortas(svg);
    var rotas = [];
    estado.conexoes.forEach(function (conexao, indice) {
      var aresta = svg.querySelector('g.edge[id="edge_' + indice + '"]');
      var path = aresta && aresta.querySelector("path");
      var s = pontos[indice + ":inicio"], e = pontos[indice + ":fim"];
      if (!path || !s || !e) return;
      aresta.removeAttribute("transform");
      rotas.push({ aresta: aresta, path: path, s: s, e: e, conexao: conexao });
    });
    var obstaculos = coletarObstaculos(svg);
    tamanhoDasLags = contarLags();
    var maisGrosso = estado.conexoes.reduce(function (m, c) { return Math.max(m, Number(c.grossura) || 2); }, 2);
    CONFIG_ROTEAMENTO_CABOS.espaco = Math.max(14, Math.round(maisGrosso * 2.2 + 8));
    // Cabos curtos primeiro ficam com a trilha ideal; os longos desviam deles.
    function comprimento(r) { return Math.abs(r.s.x - r.e.x) + Math.abs(r.s.y - r.e.y); }
    rotas.sort(function (a, b) { return comprimento(a) - comprimento(b); });
    var existentes = [];
    // Rótulos não caem em cima de equipamentos nem das caixinhas de porta.
    var rotulos = obstaculos.filter(function (o) { return o.equipamento; }).map(function (o) {
      return { equipamento: true, x1: o.x1 + FOLGA_OBSTACULO - 2, y1: o.y1 + FOLGA_OBSTACULO - 2, x2: o.x2 - FOLGA_OBSTACULO + 2, y2: o.y2 - FOLGA_OBSTACULO + 2 };
    });
    rotasDesenhadas = {};
    rotas.forEach(function (rota) {
      // Rota feita à mão (10-desenho-e-ferramentas.js) passa pelas dobras escolhidas.
      var pts = rotaManualDoCabo(rota.s, rota.e, rota.conexao.rota)
        || tracarRota(rota.s, rota.e, existentes, obstaculosDoCabo(obstaculos, rota.conexao, rota.s, rota.e));
      pts = endireitarDegraus(pts);
      existentes.push.apply(existentes, segmentosDaRota(pts));
      rota.path.setAttribute("d", caminhoOrtogonalArredondado(pts));
      prepararRotuloCurto(rota.aresta, rota.conexao);
      rota.pts = pts;
      rotasDesenhadas[estado.conexoes.indexOf(rota.conexao)] = pts;
      desenharExtrasDoCabo(rota.aresta, pts, rota.conexao);
    });
    juntarCabosDeLag(rotas);
    // Rótulos por último: desviam dos equipamentos, de todos os cabos e dos outros rótulos.
    rotas.forEach(function (rota) {
      var linha = rotasDesenhadas[estado.conexoes.indexOf(rota.conexao)] || rota.pts;
      for (var i = 1; i < linha.length; i++) {
        var a = linha[i - 1], b = linha[i];
        rotulos.push({ x1: Math.min(a.x, b.x) - 3, y1: Math.min(a.y, b.y) - 3, x2: Math.max(a.x, b.x) + 3, y2: Math.max(a.y, b.y) + 3 });
      }
    });
    rotas.forEach(function (rota) {
      var texto = rota.aresta.querySelector("text");
      if (texto && texto.style.display === "none" && !texto.hasAttribute("data-sem-espaco")) return; // membro de LAG
      posicionarRotuloDaAresta(rota.aresta, rotasDesenhadas[estado.conexoes.indexOf(rota.conexao)] || rota.pts, rotulos);
    });
    rotas.forEach(function (rota) { desenharSeloDoRotulo(rota.aresta); });
    avisarNomesSemEspaco(svg); // some o aviso antigo, se ainda estiver na tela
  }

  // Membros da mesma LAG (mesmos equipamentos, tipo "LAG aeN…") seguem o mesmo
  // caminho no meio: viram um tronco só, que se abre perto de cada porta. O rótulo
  // fica só no primeiro, com a contagem (ex.: "LAG ae7 (Netflix) · 2×10G").
  // Aviso no quadro quando há nomes de cabo escondidos por falta de espaço.
  function avisarNomesSemEspaco(svg) {
    var n = svg.querySelectorAll("g.edge > text[data-sem-espaco]").length;
    var aviso = document.getElementById("avisoSemEspaco");
    if (!n) { if (aviso) aviso.hidden = true; return; }
    if (!aviso) {
      aviso = document.createElement("div");
      aviso.id = "avisoSemEspaco";
      aviso.className = "aviso-sem-espaco";
      aviso.innerHTML = '<span></span><button type="button" class="small primary">Organizar</button><button type="button" class="ghost small" aria-label="Fechar aviso">×</button>';
      elCanvas.parentNode.appendChild(aviso);
      aviso.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      aviso.querySelector(".primary").addEventListener("click", function () { aviso.hidden = true; organizarDiagramaAutomaticamente(); });
      aviso.querySelector(".ghost").addEventListener("click", function () { aviso.hidden = true; aviso.dispensado = true; });
    }
    if (aviso.dispensado) return;
    aviso.querySelector("span").textContent = n + (n === 1 ? " nome de cabo não coube e ficou escondido (passe o mouse no cabo)." : " nomes de cabo não couberam e ficaram escondidos (passe o mouse no cabo).");
    aviso.hidden = false;
    var quadro = elCanvas.getBoundingClientRect(), pai = elCanvas.parentNode.getBoundingClientRect();
    aviso.style.left = Math.round(quadro.left - pai.left + quadro.width / 2) + "px";
    aviso.style.top = Math.round(quadro.bottom - pai.top - 54) + "px";
  }

  function juntarCabosDeLag(rotas) {
    var grupos = {};
    rotas.forEach(function (rota) {
      var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(rota.conexao.tipo || "");
      if (!m || !rota.pts) return;
      var par = [rota.conexao.de, rota.conexao.para].sort().join("|");
      (grupos[par + "|" + m[1].toLowerCase()] = grupos[par + "|" + m[1].toLowerCase()] || []).push(rota);
    });
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      if (g.length < 2) return;
      g.sort(function (a, b) { return compararPortas(a.conexao.saida || "", b.conexao.saida || ""); });
      var lider = g[0], L = lider.pts;
      g.slice(1).forEach(function (rota) {
        var t0 = rota.aresta.querySelector("text:not(.cabo-extra)");
        if (t0) t0.style.display = "none";
        // Cada porta segue no seu próprio caminho, lado a lado (nunca um cabo por cima do outro).
        rota.aresta.querySelectorAll(".cabo-etiqueta").forEach(function (e) { e.remove(); });
      });
      lider.aresta.classList.add("lag-tronco");
    });
  }

  // Degrau de poucos pixels (portas quase alinhadas) vira linha reta.
  function endireitarDegraus(pts) {
    if (pts.length === 4) {
      var s = pts[0], e = pts[3];
      if (Math.abs(s.y - e.y) <= 6 && Math.abs(pts[1].y - s.y) < 0.5) return [s, { x: e.x, y: s.y }];
      if (Math.abs(s.x - e.x) <= 6 && Math.abs(pts[1].x - s.x) < 0.5) return [s, { x: s.x, y: e.y }];
    }
    return pts;
  }

  function solicitarRoteamentoCabos() {
    if (roteamentoCabosFrame) cancelAnimationFrame(roteamentoCabosFrame);
    roteamentoCabosFrame = requestAnimationFrame(function () {
      roteamentoCabosFrame = null;
      ajustarCaixasDosGrupos();
      rotearCabosOrtogonalmente();
    });
  }

  // Nomes dos grupos na mesma ordem que gerarDot numera os clusters (grupo_N).
  function nomesDosGrupos(dados) {
    var grupos = {};
    dados.equipamentos.forEach(function (eq) { var g = String(eq.grupo || "").trim(); if (g) grupos[g] = true; });
    return Object.keys(grupos);
  }

  // O Graphviz desenha a caixa de cada grupo onde ELE posicionou os equipamentos,
  // mas eles ficam na posição salva (arrastada/organizada). Redesenha cada caixa
  // em volta dos membros, com o rótulo no topo, na mesma distância de antes.
  function ajustarCaixasDosGrupos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var nomes = nomesDosGrupos(estado);
    var nosPorId = {};
    svg.querySelectorAll("g.node").forEach(function (node) { var id = idEquipamentoDoNode(node); if (id) nosPorId[id] = node; });
    nomes.forEach(function (nome, indice) {
      var caixa = svg.querySelector('g.cluster[id="grupo_' + indice + '"]');
      var forma = caixa && caixa.querySelector("path, polygon");
      if (!forma) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      estado.equipamentos.forEach(function (eq) {
        var node = String(eq.grupo || "").trim() === nome && nosPorId[eq.id];
        if (!node) return;
        var b, t = translateDoElemento(node);
        try { b = medir(node); } catch (e) { return; }
        minX = Math.min(minX, b.x + t.x); minY = Math.min(minY, b.y + t.y);
        maxX = Math.max(maxX, b.x + t.x + b.width); maxY = Math.max(maxY, b.y + t.y + b.height);
      });
      if (!Number.isFinite(minX)) return;

      // Espaço do rótulo: guardado na primeira vez, a partir do desenho do Graphviz.
      var rotulo = caixa.querySelector("text");
      if (!caixa.hasAttribute("data-topo-rotulo")) {
        var original = forma.getBBox();
        var br = rotulo ? rotulo.getBBox() : null;
        caixa.setAttribute("data-topo-rotulo", br ? (br.y + br.height - original.y + 6).toFixed(2) : "10");
        caixa.setAttribute("data-base-rotulo", rotulo ? (numeroSvg(rotulo.getAttribute("y")) - original.y).toFixed(2) : "0");
      }
      var MARGEM = 10;
      var topoRotulo = Number(caixa.getAttribute("data-topo-rotulo"));
      var larguraRotulo = rotulo ? medir(rotulo).width + 16 : 0;
      var x = minX - MARGEM, y = minY - topoRotulo, w = maxX - minX + 2 * MARGEM, h = maxY - y + MARGEM;
      if (w < larguraRotulo) { x -= (larguraRotulo - w) / 2; w = larguraRotulo; }
      var r = 6;
      if (forma.tagName.toLowerCase() === "polygon") {
        forma.setAttribute("points", [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(function (p) { return p.join(","); }).join(" "));
      } else {
        forma.setAttribute("d", "M" + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
          "V" + (y + h - r) + "Q" + (x + w) + "," + (y + h) + " " + (x + w - r) + "," + (y + h) +
          "H" + (x + r) + "Q" + x + "," + (y + h) + " " + x + "," + (y + h - r) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "Z");
      }
      forma.__caixa = { x: x, y: y, width: w, height: h }; // lido por caixaDoGrupo (sem medir de novo)
      if (rotulo) {
        rotulo.setAttribute("x", (x + w / 2).toFixed(2));
        rotulo.setAttribute("y", (y + Number(caixa.getAttribute("data-base-rotulo"))).toFixed(2));
      }
    });
  }

  // Caixas de grupos (racks/salas) não podem se sobrepor: quando duas se
  // encostam, o grupo inteiro é empurrado para fora pelo eixo de menor
  // sobreposição. O grupo do equipamento recém-arrastado (fixoId) fica parado.
  // Retorna true se moveu algo (aí as caixas precisam ser redesenhadas).
  var ESPACO_ENTRE_GRUPOS = 24;

  // Para onde empurrar "movel" para sair de cima de "outro": testa as 4 direções
  // e fica com a que menos sobrepõe os demais grupos; empate vai para a menor
  // distância. Só olhar o eixo de menor sobreposição deixava um grupo espremido
  // entre dois vizinhos indo e voltando entre eles.
  // pesoLateral > 1: empurrar para os lados custa mais (equipamentos em coluna
  // continuam alinhados; preferem descer ou subir).
  function melhorEmpurrao(movel, outro, grupos, pesoLateral) {
    var e = ESPACO_ENTRE_GRUPOS, lateral = pesoLateral || 1;
    var candidatos = [
      { dx: outro.x2 + e - movel.x1, dy: 0 },
      { dx: outro.x1 - e - movel.x2, dy: 0 },
      { dx: 0, dy: outro.y2 + e - movel.y1 },
      { dx: 0, dy: outro.y1 - e - movel.y2 }
    ];
    var melhor = null;
    candidatos.forEach(function (c) {
      var area = 0;
      grupos.forEach(function (g) {
        if (g === movel || g === outro) return;
        var ox = Math.min(movel.x2 + c.dx, g.x2) - Math.max(movel.x1 + c.dx, g.x1) + e;
        var oy = Math.min(movel.y2 + c.dy, g.y2) - Math.max(movel.y1 + c.dy, g.y1) + e;
        if (ox > 0 && oy > 0) area += ox * oy;
      });
      var custo = area * 1000 + Math.abs(c.dx) * lateral + Math.abs(c.dy);
      if (!melhor || custo < melhor.custo) melhor = { dx: c.dx, dy: c.dy, custo: custo };
    });
    return melhor;
  }

  function separarGruposSobrepostos(fixoId) {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return false;
    var nosPorId = {};
    svg.querySelectorAll("g.node").forEach(function (node) { var id = idEquipamentoDoNode(node); if (id) nosPorId[id] = node; });
    var grupos = [];
    nomesDosGrupos(estado).forEach(function (nome, indice) {
      var forma = svg.querySelector('g.cluster[id="grupo_' + indice + '"] path, g.cluster[id="grupo_' + indice + '"] polygon');
      var b;
      try { b = caixaDoGrupo(forma); } catch (e) { b = null; }
      if (!b || !b.width) return;
      var membros = estado.equipamentos.filter(function (eq) { return String(eq.grupo || "").trim() === nome && nosPorId[eq.id]; });
      if (!membros.length) return;
      grupos.push({
        x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height, membros: membros,
        fixo: membros.some(function (eq) { return eq.id === fixoId; })
      });
    });
    if (grupos.length < 2) return false;

    function mover(g, dx, dy) {
      g.x1 += dx; g.x2 += dx; g.y1 += dy; g.y2 += dy;
      g.membros.forEach(function (eq) {
        var d = eq.deslocamento || { x: 0, y: 0 };
        eq.deslocamento = {
          x: limitarPosicaoNoCanvas(d.x + dx, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX),
          y: limitarPosicaoNoCanvas(d.y + dy, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY)
        };
        atualizarPosicaoAbsoluta(eq);
        nosPorId[eq.id].setAttribute("transform", "translate(" + eq.deslocamento.x + "," + eq.deslocamento.y + ")");
      });
    }

    var moveu = false;
    for (var passada = 0; passada < 30; passada++) {
      var houveSobreposicao = false;
      for (var i = 0; i < grupos.length; i++) {
        for (var j = i + 1; j < grupos.length; j++) {
          var a = grupos[i], b = grupos[j];
          var sobreX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + ESPACO_ENTRE_GRUPOS;
          var sobreY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + ESPACO_ENTRE_GRUPOS;
          if (sobreX <= 0 || sobreY <= 0) continue;
          houveSobreposicao = true;
          // Move quem não está fixo; se nenhum estiver, o segundo.
          var movel = b.fixo && !a.fixo ? a : b, outro = movel === a ? b : a;
          var passo = melhorEmpurrao(movel, outro, grupos);
          mover(movel, passo.dx, passo.dy);
          moveu = true;
        }
      }
      if (!houveSobreposicao) break;
    }
    return moveu;
  }

  // Dois equipamentos nunca um em cima do outro: quem encosta é empurrado para
  // o lado de menor distância (o recém-arrastado fica parado). Retorna true se moveu.
  var ESPACO_ENTRE_EQUIPAMENTOS = 16;
  function separarEquipamentosSobrepostos(fixoId) {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return false;
    var porId = {};
    estado.equipamentos.forEach(function (eq) { porId[eq.id] = eq; });
    var caixas = [];
    svg.querySelectorAll("g.node").forEach(function (node) {
      var id = idEquipamentoDoNode(node), eq = porId[id];
      if (!eq) return;
      var c = caixaDoNo(node);
      if (c) { c.eq = eq; c.node = node; c.fixo = id === fixoId; caixas.push(c); }
    });
    var e = ESPACO_ENTRE_EQUIPAMENTOS, moveu = false;
    function mover(c, dx, dy) {
      c.x1 += dx; c.x2 += dx; c.y1 += dy; c.y2 += dy;
      var d = c.eq.deslocamento || { x: 0, y: 0 };
      c.eq.deslocamento = {
        x: limitarPosicaoNoCanvas(d.x + dx, LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX),
        y: limitarPosicaoNoCanvas(d.y + dy, LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY)
      };
      atualizarPosicaoAbsoluta(c.eq);
      c.node.setAttribute("transform", "translate(" + c.eq.deslocamento.x + "," + c.eq.deslocamento.y + ")");
    }
    for (var passada = 0; passada < 30; passada++) {
      var houve = false;
      for (var i = 0; i < caixas.length; i++) {
        for (var j = i + 1; j < caixas.length; j++) {
          var a = caixas[i], b = caixas[j];
          if (Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + e <= 0 || Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + e <= 0) continue;
          houve = true;
          var movel = b.fixo && !a.fixo ? a : b, outro = movel === a ? b : a;
          var passo = melhorEmpurrao(movel, outro, caixas, 6);
          mover(movel, passo.dx, passo.dy);
          moveu = true;
        }
      }
      if (!houve) break;
    }
    return moveu;
  }

  // Caixa do nó no desenho (coordenadas do g.graph), com o translate aplicado.
  function caixaDoNo(node, t) {
    var b;
    try { b = node.getBBox(); } catch (e) { return null; }
    t = t || translateDoElemento(node);
    return { x1: b.x + t.x, y1: b.y + t.y, x2: b.x + t.x + b.width, y2: b.y + t.y + b.height };
  }

  // ---- Guias de alinhamento ------------------------------------------------------
  // Ao arrastar, o nó "gruda" quando a borda ou o centro dele chega perto da
  // borda ou do centro de outro equipamento, e uma linha tracejada mostra o
  // alinhamento. Alt desliga (movimento livre).
  function desenharGuias(svg, guias) {
    var grafo = svg.querySelector("g.graph");
    if (!grafo) return;
    var g = grafo.querySelector("g.guias-alinhamento");
    if (!g) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "guias-alinhamento");
      grafo.appendChild(g);
    }
    var html = guias.map(function (l) {
      return '<line x1="' + l.x1 + '" y1="' + l.y1 + '" x2="' + l.x2 + '" y2="' + l.y2 + '" vector-effect="non-scaling-stroke"/>';
    }).join("");
    if (g.getAttribute("data-html") !== html) { g.innerHTML = html; g.setAttribute("data-html", html); }
  }
  function apagarGuias(svg) {
    var g = svg && svg.querySelector("g.guias-alinhamento");
    if (g) g.remove();
  }

  // Ajusta (dx, dy) para alinhar a caixa "base" com alguma das "outras".
  // limite: distância máxima (unidades do desenho) para grudar.
  function encaixarNasGuias(base, outras, dx, dy, limite) {
    function candidatos(c) { return [c.x1, (c.x1 + c.x2) / 2, c.x2]; }
    function candidatosY(c) { return [c.y1, (c.y1 + c.y2) / 2, c.y2]; }
    var melhorX = null, melhorY = null;
    var movida = { x1: base.x1 + dx, x2: base.x2 + dx, y1: base.y1 + dy, y2: base.y2 + dy };
    outras.forEach(function (o) {
      candidatos(movida).forEach(function (v) {
        candidatos(o).forEach(function (alvo) {
          var d = alvo - v;
          if (Math.abs(d) <= limite && (!melhorX || Math.abs(d) < Math.abs(melhorX.d))) melhorX = { d: d, x: alvo, o: o };
        });
      });
      candidatosY(movida).forEach(function (v) {
        candidatosY(o).forEach(function (alvo) {
          var d = alvo - v;
          if (Math.abs(d) <= limite && (!melhorY || Math.abs(d) < Math.abs(melhorY.d))) melhorY = { d: d, y: alvo, o: o };
        });
      });
    });
    var guias = [];
    if (melhorX) dx += melhorX.d;
    if (melhorY) dy += melhorY.d;
    var final = { x1: base.x1 + dx, x2: base.x2 + dx, y1: base.y1 + dy, y2: base.y2 + dy };
    if (melhorX) guias.push({ x1: melhorX.x, x2: melhorX.x, y1: Math.min(final.y1, melhorX.o.y1) - 12, y2: Math.max(final.y2, melhorX.o.y2) + 12 });
    if (melhorY) guias.push({ y1: melhorY.y, y2: melhorY.y, x1: Math.min(final.x1, melhorY.o.x1) - 12, x2: Math.max(final.x2, melhorY.o.x2) + 12 });
    return { dx: dx, dy: dy, guias: guias };
  }

  function ativarArrasteDosEquipamentos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var viewBox = svg.viewBox && svg.viewBox.baseVal;
    svg.querySelectorAll("g.node").forEach(function (node) {
      var idNode = idEquipamentoDoNode(node);
      var equipamento = idNode && estado.equipamentos.find(function (eq) { return eq.id === idNode; });
      if (!equipamento) return;
      // O miolo do equipamento (tabela do Graphviz) não tem fundo: um clique ali
      // atravessava e virava arraste do diagrama. Um retângulo transparente do
      // tamanho do nó faz o equipamento inteiro responder ao clique.
      if (!node.querySelector("rect.area-clique")) {
        var caixa;
        try { caixa = node.getBBox(); } catch (e) { caixa = null; }
        if (caixa && caixa.width) {
          var area = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          area.setAttribute("class", "area-clique");
          area.setAttribute("x", caixa.x); area.setAttribute("y", caixa.y);
          area.setAttribute("width", caixa.width); area.setAttribute("height", caixa.height);
          area.setAttribute("fill", "transparent");
          node.insertBefore(area, node.firstChild);
        }
      }
      node.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        // Shift/Ctrl + clique: soma ou tira da seleção, sem arrastar. O foco que
        // o clique dá ao nó não pode refazer a seleção (ver o "focus" abaixo).
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          focoPorCliqueComModificador = true;
          setTimeout(function () { focoPorCliqueComModificador = false; }, 0);
          alternarSelecao(idNode);
          return;
        }
        var jaSelecionado = !!selecao[idNode];
        if (!jaSelecionado) definirSelecao([idNode]);
        node.setPointerCapture(event.pointerId);
        // rect já inclui o zoom (transform CSS), então não divide por canvasView.scale de novo.
        var rect = svg.getBoundingClientRect();
        var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
        var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
        var inicioX = event.clientX;
        var inicioY = event.clientY;
        // Todos os selecionados andam juntos. Lido a cada arraste: "Organizar"
        // troca o objeto de posição.
        var grupoArraste = idsSelecionados().map(function (id) {
          var eq = estado.equipamentos.find(function (item) { return item.id === id; });
          var el = obterNodePorId(svg, id);
          if (!eq || !el) return null;
          var d = eq.deslocamento || { x: 0, y: 0 };
          return { eq: eq, node: el, ox: d.x, oy: d.y, x: d.x, y: d.y };
        }).filter(Boolean);
        // Quanto o conjunto pode andar sem ninguém sair da área de desenho.
        var limites = grupoArraste.reduce(function (l, m) {
          return { dxMin: Math.max(l.dxMin, LIMITE_CANVAS.minX - m.ox), dxMax: Math.min(l.dxMax, LIMITE_CANVAS.maxX - m.ox),
            dyMin: Math.max(l.dyMin, LIMITE_CANVAS.minY - m.oy), dyMax: Math.min(l.dyMax, LIMITE_CANVAS.maxY - m.oy) };
        }, { dxMin: -Infinity, dxMax: Infinity, dyMin: -Infinity, dyMax: Infinity });
        // Guias: caixa do nó pego x caixas dos equipamentos que ficam parados.
        var principal = grupoArraste.find(function (m) { return m.eq === equipamento; }) || grupoArraste[0];
        var basePrincipal = caixaDoNo(node, { x: principal.ox, y: principal.oy });
        var parados = [];
        svg.querySelectorAll("g.node").forEach(function (outro) {
          var id = idEquipamentoDoNode(outro);
          if (id && !selecao[id]) { var c = caixaDoNo(outro); if (c) parados.push(c); }
        });
        var moveu = false;
        arrastandoEquipamento = true;
        iniciarCacheDeMedidas(); // formato das peças não muda até soltar
        grupoArraste.forEach(function (m) { m.node.classList.add("arrastando"); });
        elCanvas.classList.add("arrastando-no");
        // Mouses de alta taxa mandam vários movimentos por quadro: a posição é
        // gravada em cada um, mas os nós e os cabos são desenhados uma vez por quadro.
        var quadroMover = 0, guiasAtuais = [];
        function desenharPosicao() {
          quadroMover = 0;
          grupoArraste.forEach(function (m) { m.node.setAttribute("transform", "translate(" + m.x + "," + m.y + ")"); });
          desenharGuias(svg, guiasAtuais);
        }
        function mover(movimento) {
          var dx = (movimento.clientX - inicioX) * escalaX;
          var dy = (movimento.clientY - inicioY) * escalaY;
          if (!moveu && Math.abs(movimento.clientX - inicioX) + Math.abs(movimento.clientY - inicioY) < 3) return;
          moveu = true;
          guiasAtuais = [];
          if (!movimento.altKey && basePrincipal && parados.length) {
            var encaixe = encaixarNasGuias(basePrincipal, parados, dx, dy, 7 * escalaX);
            dx = encaixe.dx; dy = encaixe.dy; guiasAtuais = encaixe.guias;
          }
          // Limita já durante o arraste: o conjunto para na borda da área de
          // desenho em vez de "pular" de volta ao soltar.
          dx = Math.min(limites.dxMax, Math.max(limites.dxMin, dx));
          dy = Math.min(limites.dyMax, Math.max(limites.dyMin, dy));
          grupoArraste.forEach(function (m) { m.x = m.ox + dx; m.y = m.oy + dy; });
          if (!quadroMover) quadroMover = requestAnimationFrame(desenharPosicao); // antes do roteamento, no mesmo quadro
          solicitarRoteamentoCabos();
        }
        function soltar() {
          arrastandoEquipamento = false;
          if (quadroMover) { cancelAnimationFrame(quadroMover); desenharPosicao(); }
          encerrarCacheDeMedidas();
          apagarGuias(svg);
          grupoArraste.forEach(function (m) { m.node.classList.remove("arrastando"); });
          elCanvas.classList.remove("arrastando-no");
          node.removeEventListener("pointermove", mover);
          node.removeEventListener("pointerup", soltar);
          node.removeEventListener("pointercancel", soltar);
          // Clique sem arrastar num equipamento de uma seleção maior: fica só ele.
          if (!moveu) {
            if (jaSelecionado && grupoArraste.length > 1) definirSelecao([idNode]);
            return; // não redesenha (manteria o duplo clique funcionando)
          }
          grupoArraste.forEach(function (m) {
            m.eq.deslocamento = { x: m.x, y: m.y };
            atualizarPosicaoAbsoluta(m.eq);
          });
          // Redesenha para as portas irem para o lado voltado aos vizinhos.
          // O grupo do equipamento pego fica parado; os outros é que abrem espaço.
          // Espera o quadro do "soltar" aparecer: o redesenho completo é o
          // trabalho mais pesado e travaria a mão bem no momento de soltar.
          equipamentoFixoNaSeparacao = equipamento.id;
          requestAnimationFrame(function () { setTimeout(function () { gerar(); atualizarJsonAvancado(); }, 0); });
        }
        node.addEventListener("pointermove", mover);
        node.addEventListener("pointerup", soltar);
        node.addEventListener("pointercancel", soltar);
      });
      node.addEventListener("dblclick", function (event) {
        event.stopPropagation();
        abrirEditorEquipamento(equipamento);
      });

      // Teclado: Tab foca o equipamento, setas movem a seleção (Shift = passo
      // maior), Enter/F2 abre o editor.
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", "Equipamento " + (equipamento.nome || equipamento.id) + ". Use as setas para mover e Enter para editar.");
      node.addEventListener("focus", function () {
        if (!focoPorCliqueComModificador && !selecao[idNode]) definirSelecao([idNode]);
      });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
          return;
        }
        var passo = event.shiftKey ? 50 : 10;
        var setas = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
        var delta = setas[event.key];
        if (!delta) return;
        event.preventDefault();
        var ids = selecao[idNode] ? idsSelecionados() : [idNode];
        ids.forEach(function (id) {
          var eq = estado.equipamentos.find(function (item) { return item.id === id; });
          var el = obterNodePorId(svg, id);
          if (!eq) return;
          var atual = eq.deslocamento || { x: 0, y: 0 };
          var x = limitarPosicaoNoCanvas(atual.x + delta[0], LIMITE_CANVAS.minX, LIMITE_CANVAS.maxX);
          var y = limitarPosicaoNoCanvas(atual.y + delta[1], LIMITE_CANVAS.minY, LIMITE_CANVAS.maxY);
          eq.deslocamento = { x: x, y: y };
          atualizarPosicaoAbsoluta(eq);
          if (el) el.setAttribute("transform", "translate(" + x + "," + y + ")");
        });
        finalizarMovimento();
        salvarLocal();
        atualizarJsonAvancado();
        // Troca as portas de lado quando o usuário para de apertar as setas.
        solicitarAtualizacaoDiagrama();
      });
    });
    aplicarSelecaoNoSvg();
  }

  // ---- Seleção de vários equipamentos ------------------------------------------------
  // Clique seleciona; Shift/Ctrl + clique soma ou tira; Shift + arrastar numa área
  // vazia desenha um retângulo de seleção; Ctrl+A seleciona tudo; Esc limpa.
  // A seleção sobrevive aos redesenhos (é por id) e some com equipamentos excluídos.
  var selecao = {};
  var focoPorCliqueComModificador = false;
  function idsSelecionados() {
    return estado.equipamentos.filter(function (eq) { return selecao[eq.id]; }).map(function (eq) { return eq.id; });
  }
  function aplicarSelecaoNoSvg() {
    var svg = elCanvas.querySelector("svg");
    if (svg) svg.querySelectorAll("g.node").forEach(function (node) {
      node.classList.toggle("selecionado", !!selecao[idEquipamentoDoNode(node)]);
    });
    atualizarBarraSelecao();
  }
  function definirSelecao(ids) {
    selecao = {};
    ids.forEach(function (id) { selecao[id] = true; });
    aplicarSelecaoNoSvg();
  }
  function alternarSelecao(id) {
    if (selecao[id]) delete selecao[id]; else selecao[id] = true;
    aplicarSelecaoNoSvg();
  }
  function limparSelecao() {
    if (!Object.keys(selecao).length) return;
    definirSelecao([]);
  }

  // Barra flutuante sobre o diagrama quando há 2 ou mais selecionados.
  var elBarraSelecao = document.getElementById("barraSelecao");
  // Agrupar: os selecionados ganham o mesmo grupo (caixa com nome: POP, rack, sala).
  async function agruparSelecao() {
    var ids = idsSelecionados();
    if (ids.length < 2) return;
    var atuais = estado.equipamentos.filter(function (eq) { return selecao[eq.id] && eq.grupo; }).map(function (eq) { return eq.grupo; });
    var nome = await abrirModal({ title: "Agrupar " + ids.length + " equipamentos", message: "Nome do grupo (POP, rack, sala…):", kind: "prompt", defaultValue: atuais[0] || "", confirmText: "Agrupar" });
    if (nome == null) return;
    nome = String(nome).trim().slice(0, LIMITES.grupo);
    if (!nome) { avisar("Dê um nome ao grupo."); return; }
    estado.equipamentos.forEach(function (eq) { if (selecao[eq.id]) eq.grupo = nome; });
    renderTudo();
    avisar("Grupo “" + nome + "” criado com " + ids.length + " equipamentos.");
  }
  function desagruparSelecao() {
    var mudou = false;
    estado.equipamentos.forEach(function (eq) { if (selecao[eq.id] && eq.grupo) { eq.grupo = ""; mudou = true; } });
    if (!mudou) { avisar("Os selecionados não estão em grupo."); return; }
    renderTudo();
    avisar("Grupo desfeito.");
  }

  // Aumenta ou diminui os equipamentos selecionados (passo de 10%, de 50% a 250%).
  function redimensionarSelecao(passo) {
    var ids = idsSelecionados();
    if (!ids.length) return;
    var mudou = false;
    estado.equipamentos.forEach(function (eq) {
      if (!selecao[eq.id]) return;
      var atual = tamanhoDoEquipamento(eq);
      var novo = Math.max(50, Math.min(250, atual + passo));
      if (novo === atual) return;
      if (novo === tamanhoPadraoDoTipo(eq.tipo)) delete eq.tamanho; else eq.tamanho = novo;
      mudou = true;
    });
    if (!mudou) { avisar(passo > 0 ? "Já está no tamanho máximo (250%)." : "Já está no tamanho mínimo (50%)."); return; }
    renderTudo();
    var exemplo = estado.equipamentos.find(function (eq) { return selecao[eq.id]; });
    avisar("Tamanho: " + tamanhoDoEquipamento(exemplo) + "%");
  }

  function atualizarBarraSelecao() {
    if (!elBarraSelecao) return;
    var n = idsSelecionados().length;
    elBarraSelecao.hidden = n < 2;
    if (n < 2) return;
    elBarraSelecao.querySelector("[data-selecao-contagem]").textContent = n + " selecionados";
    elBarraSelecao.style.top = (elCanvas.offsetTop + 12) + "px";
  }

  // Retângulo de seleção: Shift + arrastar numa parte vazia do diagrama.
  // Registrado antes do pan (05-zoom…): com Shift, o pan nem começa.
  var inicioCliqueVazio = null;
  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || !elCanvas.querySelector("svg")) return;
    if (!event.shiftKey) { inicioCliqueVazio = { x: event.clientX, y: event.clientY }; return; }
    event.stopImmediatePropagation();
    event.preventDefault();
    var area = elCanvas.getBoundingClientRect();
    var ret = document.createElement("div");
    ret.className = "retangulo-selecao";
    elCanvas.appendChild(ret);
    var x0 = event.clientX, y0 = event.clientY;
    var somar = Object.assign({}, selecao);
    function desenhar(x, y) {
      var l = Math.min(x0, x), t = Math.min(y0, y);
      ret.style.transform = "translate(" + (l - area.left) + "px," + (t - area.top) + "px)";
      ret.style.width = Math.abs(x - x0) + "px";
      ret.style.height = Math.abs(y - y0) + "px";
      return { l: l, t: t, r: Math.max(x0, x), b: Math.max(y0, y) };
    }
    desenhar(x0, y0);
    elCanvas.setPointerCapture(event.pointerId);
    function mover(e) {
      var r = desenhar(e.clientX, e.clientY);
      var nova = Object.assign({}, somar);
      elCanvas.querySelectorAll("svg g.node").forEach(function (node) {
        var b = node.getBoundingClientRect();
        if (b.right >= r.l && b.left <= r.r && b.bottom >= r.t && b.top <= r.b) nova[idEquipamentoDoNode(node)] = true;
      });
      selecao = nova;
      aplicarSelecaoNoSvg();
    }
    function soltar(e) {
      ret.remove();
      elCanvas.removeEventListener("pointermove", mover);
      elCanvas.removeEventListener("pointerup", soltar);
      elCanvas.removeEventListener("pointercancel", soltar);
      if (elCanvas.hasPointerCapture(e.pointerId)) elCanvas.releasePointerCapture(e.pointerId);
    }
    elCanvas.addEventListener("pointermove", mover);
    elCanvas.addEventListener("pointerup", soltar);
    elCanvas.addEventListener("pointercancel", soltar);
  });
  // Clique (sem arrastar) numa parte vazia: limpa a seleção.
  elCanvas.addEventListener("pointerup", function (event) {
    var inicio = inicioCliqueVazio;
    inicioCliqueVazio = null;
    if (inicio && Math.abs(event.clientX - inicio.x) + Math.abs(event.clientY - inicio.y) < 4) limparSelecao();
  });

  // ---- Copiar, colar, duplicar, excluir e atalhos ---------------------------------
  // A cópia fica guardada neste navegador (dá para colar em outro projeto ou aba).
  var CHAVE_COPIA = "grafo-copia";

  function copiarSelecao() {
    var ids = idsSelecionados();
    if (!ids.length) return null;
    var conjunto = {};
    ids.forEach(function (id) { conjunto[id] = true; });
    var copia = {
      equipamentos: clonarDados(estado.equipamentos.filter(function (eq) { return conjunto[eq.id]; })),
      conexoes: clonarDados(estado.conexoes.filter(function (c) { return conjunto[c.de] && conjunto[c.para]; }))
    };
    try { localStorage.setItem(CHAVE_COPIA, JSON.stringify(copia)); } catch (e) {}
    return copia;
  }

  function nomeDeCopia(nome) {
    var usados = {};
    estado.equipamentos.forEach(function (eq) { usados[String(eq.nome || "").toLowerCase()] = true; });
    var base = String(nome || "Equipamento").replace(/ \(cópia(?: \d+)?\)$/, "");
    // Colando em outro diagrama, sem nome repetido: fica com o nome original.
    if (!usados[String(nome || "").toLowerCase()]) return String(nome || base).slice(0, LIMITES.nome);
    var candidato = (base + " (cópia)").slice(0, LIMITES.nome);
    for (var n = 2; usados[candidato.toLowerCase()]; n++) candidato = (base.slice(0, LIMITES.nome - 12) + " (cópia " + n + ")");
    return candidato;
  }

  // Cola a cópia com ids e nomes novos, 48 px para baixo e para a direita.
  function colar(copia) {
    if (!copia || !Array.isArray(copia.equipamentos) || !copia.equipamentos.length) { avisar("Nada copiado ainda. Selecione equipamentos e use Ctrl+C."); return; }
    var cabe = LIMITES.equipamentos - estado.equipamentos.length;
    if (cabe <= 0) { avisar("Limite de " + LIMITES.equipamentos + " equipamentos atingido: não há espaço para colar."); return; }
    var origem = copia.equipamentos.slice(0, cabe);
    var novoIdDe = {}, novos = [];
    origem.forEach(function (eq) {
      var r = Esquema.validarEquipamento(Object.assign({}, eq, { id: novoId(), nome: nomeDeCopia(eq.nome) }));
      if (!r.ok) return;
      var novo = r.dados;
      delete novo.deslocamento;
      if (posicaoValida(eq.posicao)) novo.posicao = { x: eq.posicao.x + 48, y: eq.posicao.y + 48 };
      else delete novo.posicao;
      novoIdDe[eq.id] = novo.id;
      estado.equipamentos.push(novo);
      novos.push(novo.id);
    });
    (copia.conexoes || []).forEach(function (c) {
      if (!novoIdDe[c.de] || !novoIdDe[c.para]) return;
      var r = Esquema.validarConexao(Object.assign({}, c, { de: novoIdDe[c.de], para: novoIdDe[c.para] }), estado.equipamentos.map(function (eq) { return eq.id; }));
      if (r.ok) { delete r.dados.deslocamento; estado.conexoes.push(r.dados); }
    });
    if (!novos.length) return;
    definirSelecao(novos);
    renderTudo();
    var cortados = copia.equipamentos.length - origem.length;
    avisar(plural(novos.length, "equipamento colado", "equipamentos colados") + (cortados ? " (" + cortados + " ficaram de fora pelo limite de " + LIMITES.equipamentos + ")" : "") + ".");
  }

  function lerCopia() {
    try { return JSON.parse(localStorage.getItem(CHAVE_COPIA) || "null"); } catch (e) { return null; }
  }

  function excluirSelecao() {
    var ids = idsSelecionados();
    if (!ids.length) return;
    var sai = {};
    ids.forEach(function (id) { sai[id] = true; });
    estado.equipamentos = estado.equipamentos.filter(function (eq) { return !sai[eq.id]; });
    estado.conexoes = estado.conexoes.filter(function (c) { return !sai[c.de] && !sai[c.para]; });
    selecao = {};
    renderTudo();
    avisar(plural(ids.length, "equipamento excluído", "equipamentos excluídos") + ".", { desfazer: true });
  }

  function digitandoEmCampo(alvo) {
    return !!alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable);
  }
  function algumaJanelaAberta() {
    return !!document.querySelector(".modal-backdrop:not(.hidden)");
  }

  document.addEventListener("keydown", function (event) {
    if (document.body.classList.contains("auth-locked") || digitandoEmCampo(event.target) || algumaJanelaAberta()) return;
    var ctrl = event.ctrlKey || event.metaKey;
    var tecla = String(event.key).toLowerCase();
    if (ctrl && !event.altKey && tecla === "z") { event.preventDefault(); (event.shiftKey ? btnRefazer : btnDesfazer).click(); return; }
    if (ctrl && !event.altKey && tecla === "y") { event.preventDefault(); btnRefazer.click(); return; }
    if (ctrl && tecla === "a" && elCanvas.querySelector("svg")) { event.preventDefault(); definirSelecao(estado.equipamentos.map(function (eq) { return eq.id; })); return; }
    if (ctrl && tecla === "c" && idsSelecionados().length) {
      event.preventDefault();
      var n = copiarSelecao().equipamentos.length;
      avisar(plural(n, "equipamento copiado", "equipamentos copiados") + ". Ctrl+V cola.");
      return;
    }
    if (ctrl && tecla === "v") { event.preventDefault(); colar(lerCopia()); return; }
    if (ctrl && tecla === "d" && idsSelecionados().length) { event.preventDefault(); colar(copiarSelecao()); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && idsSelecionados().length) { event.preventDefault(); excluirSelecao(); return; }
    if (!ctrl && (event.key === "+" || event.key === "=") && idsSelecionados().length) { event.preventDefault(); redimensionarSelecao(10); return; }
    if (!ctrl && (event.key === "-" || event.key === "_") && idsSelecionados().length) { event.preventDefault(); redimensionarSelecao(-10); return; }
    if (event.key === "Escape") limparSelecao();
  });

  if (elBarraSelecao) {
    elBarraSelecao.addEventListener("click", function (event) {
      var acao = event.target.closest("[data-selecao]");
      if (!acao) return;
      var qual = acao.getAttribute("data-selecao");
      if (qual === "duplicar") colar(copiarSelecao());
      else if (qual === "maior") redimensionarSelecao(10);
      else if (qual === "menor") redimensionarSelecao(-10);
      else if (qual === "copiar") { var n = copiarSelecao().equipamentos.length; avisar(plural(n, "equipamento copiado", "equipamentos copiados") + ". Ctrl+V cola."); }
      else if (qual === "excluir") excluirSelecao();
      else if (qual === "limpar") limparSelecao();
      else if (qual === "agrupar") agruparSelecao();
      else if (qual === "desagrupar") desagruparSelecao();
    });
    // Não deixa o clique na barra virar pan no canvas.
    elBarraSelecao.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
  }

  // ---- Anotações livres ------------------------------------------------------------
  // Caixas de texto ("aguardando instalação", "cliente X") desenhadas por cima do
  // diagrama, dentro do SVG: saem no SVG, PNG, PDF e no link de visualização.
  // Botão "Anotação" cria no centro da tela; duplo clique edita; arrastar move.
  var NS_SVG = "http://www.w3.org/2000/svg";
  var ANOTACAO = { fonte: 11, linha: 15, padding: 10, maxCaracteres: 34 };

  function listaAnotacoes() { return Array.isArray(estado.anotacoes) ? estado.anotacoes : []; }

  // Quebra o texto nas linhas digitadas e, dentro delas, por palavras.
  function linhasDaAnotacao(texto) {
    var linhas = [];
    String(texto || "").split(/\r?\n/).forEach(function (paragrafo) {
      var atual = "";
      paragrafo.split(/\s+/).forEach(function (palavra) {
        while (palavra.length > ANOTACAO.maxCaracteres) { // palavra enorme: corta
          if (atual) { linhas.push(atual); atual = ""; }
          linhas.push(palavra.slice(0, ANOTACAO.maxCaracteres));
          palavra = palavra.slice(ANOTACAO.maxCaracteres);
        }
        if (!palavra) return;
        if (atual && (atual + " " + palavra).length > ANOTACAO.maxCaracteres) { linhas.push(atual); atual = palavra; }
        else atual = atual ? atual + " " + palavra : palavra;
      });
      linhas.push(atual);
    });
    while (linhas.length > 1 && !linhas[linhas.length - 1]) linhas.pop();
    return linhas;
  }

  function corDaBorda(cor) {
    return { "#FFF3B0": "#D9B64A", "#D6ECFF": "#6D9CC9", "#DDF5D8": "#6DAF68", "#FFDDE4": "#D07A8E", "#ECEFF3": "#8C99A6" }[String(cor).toUpperCase()] || "#8C99A6";
  }

  function desenharAnotacoes() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    grafo.querySelectorAll("g.anotacao").forEach(function (g) { g.remove(); });
    listaAnotacoes().forEach(function (a) {
      var g = document.createElementNS(NS_SVG, "g");
      g.setAttribute("class", "anotacao");
      g.setAttribute("data-anotacao", a.id);
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", "Anotação: " + a.texto + ". Enter para editar.");
      var rect = document.createElementNS(NS_SVG, "rect");
      rect.setAttribute("x", a.x); rect.setAttribute("y", a.y);
      rect.setAttribute("rx", 6);
      rect.setAttribute("fill", a.cor || Esquema.CORES_ANOTACAO[0]);
      rect.setAttribute("stroke", corDaBorda(a.cor));
      rect.setAttribute("stroke-width", 1);
      var texto = document.createElementNS(NS_SVG, "text");
      texto.setAttribute("font-family", "Helvetica, Arial, sans-serif");
      texto.setAttribute("font-size", ANOTACAO.fonte);
      texto.setAttribute("fill", "#14212B");
      var linhas = linhasDaAnotacao(a.texto);
      linhas.forEach(function (linha, i) {
        var tspan = document.createElementNS(NS_SVG, "tspan");
        tspan.setAttribute("x", a.x + ANOTACAO.padding);
        tspan.setAttribute("y", a.y + ANOTACAO.padding + ANOTACAO.fonte + i * ANOTACAO.linha);
        tspan.textContent = linha || " ";
        texto.appendChild(tspan);
      });
      g.appendChild(rect);
      g.appendChild(texto);
      grafo.appendChild(g); // por último: fica por cima dos equipamentos e cabos
      var larguraTexto = 60;
      try { larguraTexto = Math.max(60, texto.getBBox().width); } catch (e) {}
      rect.setAttribute("width", (larguraTexto + 2 * ANOTACAO.padding).toFixed(1));
      rect.setAttribute("height", (linhas.length * ANOTACAO.linha + 2 * ANOTACAO.padding - (ANOTACAO.linha - ANOTACAO.fonte) + 4).toFixed(1));
      ligarAnotacao(svg, g, a);
    });
  }

  function ligarAnotacao(svg, g, a) {
    g.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      event.stopPropagation();
      var viewBox = svg.viewBox && svg.viewBox.baseVal;
      var rect = svg.getBoundingClientRect();
      var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
      var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
      var inicio = { x: event.clientX, y: event.clientY }, dx = 0, dy = 0, quadro = 0;
      g.setPointerCapture(event.pointerId);
      g.classList.add("arrastando");
      function mover(e) {
        dx = (e.clientX - inicio.x) * escalaX;
        dy = (e.clientY - inicio.y) * escalaY;
        if (!quadro) quadro = requestAnimationFrame(function () { quadro = 0; g.setAttribute("transform", "translate(" + dx + "," + dy + ")"); });
      }
      function soltar() {
        if (quadro) cancelAnimationFrame(quadro);
        g.classList.remove("arrastando");
        g.removeEventListener("pointermove", mover);
        g.removeEventListener("pointerup", soltar);
        g.removeEventListener("pointercancel", soltar);
        if (Math.abs(dx) + Math.abs(dy) < 0.5) { g.removeAttribute("transform"); return; }
        a.x = limitarPosicaoNoCanvas(a.x + dx, -LIMITES.coordenada, LIMITES.coordenada);
        a.y = limitarPosicaoNoCanvas(a.y + dy, -LIMITES.coordenada, LIMITES.coordenada);
        desenharAnotacoes();
        ajustarViewBoxAoConteudo(true);
        salvarLocal();
        atualizarJsonAvancado();
      }
      g.addEventListener("pointermove", mover);
      g.addEventListener("pointerup", soltar);
      g.addEventListener("pointercancel", soltar);
    });
    g.addEventListener("dblclick", function (event) { event.stopPropagation(); abrirEditorAnotacao(a); });
    g.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); abrirEditorAnotacao(a); }
    });
  }

  // Ponto do centro da área visível, nas coordenadas do desenho.
  function centroVisivelNoDesenho() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return { x: 0, y: 0 };
    var area = elCanvas.getBoundingClientRect();
    var p = svg.createSVGPoint();
    p.x = area.left + area.width / 2;
    p.y = area.top + area.height / 2;
    var m = grafo.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  var editorAnotacao = {
    backdrop: document.getElementById("anotacaoModal"),
    texto: document.getElementById("anotacaoTexto"),
    cores: document.getElementById("anotacaoCores"),
    atual: null,
    nova: false
  };

  function abrirEditorAnotacao(a, nova) {
    if (!editorAnotacao.backdrop) return;
    editorAnotacao.atual = a;
    editorAnotacao.nova = !!nova;
    editorAnotacao.texto.value = a.texto || "";
    editorAnotacao.cores.querySelectorAll("input").forEach(function (r) { r.checked = r.value.toUpperCase() === String(a.cor || Esquema.CORES_ANOTACAO[0]).toUpperCase(); });
    editorAnotacao.backdrop.querySelector("[data-anotacao-excluir]").hidden = !!nova;
    document.getElementById("anotacaoTitulo").textContent = nova ? "Nova anotação" : "Editar anotação";
    mostrarModalBackdrop(editorAnotacao.backdrop);
    // Foco na hora (a janela já está visível): com atraso, o que a pessoa
    // digitasse nos primeiros instantes era selecionado e apagado pela próxima tecla.
    editorAnotacao.texto.focus();
    if (!nova) editorAnotacao.texto.select(); // editar: começa com o texto todo marcado
  }

  function fecharEditorAnotacao() {
    esconderModal(editorAnotacao.backdrop);
    editorAnotacao.atual = null;
  }

  function salvarAnotacao() {
    var a = editorAnotacao.atual;
    if (!a) return;
    var escolhida = editorAnotacao.cores.querySelector("input:checked");
    var r = Esquema.validarProjeto({ equipamentos: [], conexoes: [], anotacoes: [Object.assign({}, a, { texto: editorAnotacao.texto.value, cor: escolhida ? escolhida.value : a.cor })] }, "estrito");
    if (!r.ok) { editorAnotacao.texto.focus(); editorAnotacao.texto.setCustomValidity(r.erros[0].mensagem); editorAnotacao.texto.reportValidity(); return; }
    if (!Array.isArray(estado.anotacoes)) estado.anotacoes = [];
    var salva = r.dados.anotacoes[0];
    if (editorAnotacao.nova) estado.anotacoes.push(salva);
    else Object.assign(a, salva);
    fecharEditorAnotacao();
    renderTudo();
  }

  function excluirAnotacao() {
    var a = editorAnotacao.atual;
    if (!a) return;
    estado.anotacoes = listaAnotacoes().filter(function (item) { return item !== a; });
    fecharEditorAnotacao();
    renderTudo();
    avisar("Anotação excluída.", { desfazer: true });
  }

  function criarAnotacao() {
    if (!elCanvas.querySelector("svg")) { avisar("Adicione equipamentos antes de criar anotações."); return; }
    if (listaAnotacoes().length >= LIMITES.anotacoes) { avisar("Limite de " + LIMITES.anotacoes + " anotações por diagrama atingido."); return; }
    var centro = centroVisivelNoDesenho();
    abrirEditorAnotacao({ id: "nota_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), texto: "", x: Math.round(centro.x - 90), y: Math.round(centro.y - 20), cor: Esquema.CORES_ANOTACAO[0] }, true);
  }

  if (editorAnotacao.backdrop) {
    document.getElementById("btnAnotacao").addEventListener("click", criarAnotacao);
    editorAnotacao.backdrop.querySelector("[data-anotacao-salvar]").addEventListener("click", salvarAnotacao);
    editorAnotacao.backdrop.querySelector("[data-anotacao-excluir]").addEventListener("click", excluirAnotacao);
    editorAnotacao.backdrop.querySelectorAll("[data-anotacao-fechar]").forEach(function (b) { b.addEventListener("click", fecharEditorAnotacao); });
    editorAnotacao.texto.addEventListener("input", function () { editorAnotacao.texto.setCustomValidity(""); });
    editorAnotacao.backdrop.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); fecharEditorAnotacao(); }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); salvarAnotacao(); }
    });
    editorAnotacao.backdrop.addEventListener("click", function (event) { if (event.target === editorAnotacao.backdrop) fecharEditorAnotacao(); });
  }

  function ativarArrasteDosCabos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var viewBox = svg.viewBox && svg.viewBox.baseVal;
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var conexao = conexaoDaAresta(aresta);
      if (!conexao) return;
      var deslocamento = conexao.deslocamento || { x: 0, y: 0 };
      aresta.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        aresta.classList.add("selecionado");
        aresta.setPointerCapture(event.pointerId);
        var rect = svg.getBoundingClientRect();
        var escalaX = viewBox && viewBox.width ? viewBox.width / rect.width : 1;
        var escalaY = viewBox && viewBox.height ? viewBox.height / rect.height : 1;
        var inicioX = event.clientX;
        var inicioY = event.clientY;
        var originalX = deslocamento.x;
        var originalY = deslocamento.y;
        function mover(movimento) {
          deslocamento.x = originalX + (movimento.clientX - inicioX) * escalaX / canvasView.scale;
          deslocamento.y = originalY + (movimento.clientY - inicioY) * escalaY / canvasView.scale;
          aresta.setAttribute("transform", "translate(" + deslocamento.x + "," + deslocamento.y + ")");
        }
        function soltar() {
          conexao.deslocamento = { x: deslocamento.x, y: deslocamento.y };
          salvarLocal();
          atualizarJsonAvancado();
          solicitarAtualizacaoDiagrama();
          aresta.classList.remove("selecionado");
          aresta.removeEventListener("pointermove", mover);
          aresta.removeEventListener("pointerup", soltar);
          aresta.removeEventListener("pointercancel", soltar);
        }
        aresta.addEventListener("pointermove", mover);
        aresta.addEventListener("pointerup", soltar);
        aresta.addEventListener("pointercancel", soltar);
      });
    });
  }

  // ==== 04-busca-caminho-e-limpar.js: busca, rastrear caminho e limpar diagrama (parte de assets/js/editor/app.js; npm run montar) ====
  // Busca por nome, IP ou modelo: destaca quem bate, apaga o resto.
  // Reaplicada a cada renderização, porque o SVG é recriado.
  var elBusca = document.getElementById("buscaEquip");
  var elBuscaResultado = document.getElementById("buscaResultado");
  var busca = { encontrados: [], atual: -1 };

  function equipamentoBateComBusca(eq, termo) {
    return [eq.nome, eq.ip, eq.modelo].some(function (valor) {
      return normalizarTextoEquipamento(valor).indexOf(termo) >= 0;
    });
  }

  function aplicarBusca() {
    var svg = elCanvas.querySelector("svg");
    var termo = normalizarTextoEquipamento(elBusca.value);
    busca.encontrados = [];
    if (svg) {
      svg.querySelectorAll("g.node, g.edge, g.cluster").forEach(function (el) {
        el.classList.remove("apagado", "encontrado", "encontrado-atual");
      });
    }
    elBuscaResultado.classList.remove("sem-resultado");
    if (!termo) { busca.atual = -1; elBuscaResultado.textContent = ""; return; }
    var ids = {};
    estado.equipamentos.forEach(function (eq) { if (equipamentoBateComBusca(eq, termo)) ids[eq.id] = true; });
    if (svg) {
      svg.querySelectorAll("g.node").forEach(function (node) {
        var id = idEquipamentoDoNode(node);
        if (!id) return;
        if (ids[id]) { node.classList.add("encontrado"); busca.encontrados.push(node); }
        else node.classList.add("apagado");
      });
      svg.querySelectorAll("g.edge").forEach(function (aresta) {
        var c = conexaoDaAresta(aresta);
        if (!c || !(ids[c.de] || ids[c.para])) aresta.classList.add("apagado");
      });
    }
    if (busca.atual >= busca.encontrados.length) busca.atual = -1;
    if (busca.atual >= 0) busca.encontrados[busca.atual].classList.add("encontrado-atual");
    if (!busca.encontrados.length) {
      elBuscaResultado.textContent = "nada encontrado";
      elBuscaResultado.classList.add("sem-resultado");
    } else {
      elBuscaResultado.textContent = (busca.atual >= 0 ? (busca.atual + 1) + " de " : "") + busca.encontrados.length + (busca.atual >= 0 ? "" : busca.encontrados.length === 1 ? " encontrado" : " encontrados");
    }
  }

  // Centraliza o resultado seguinte (passo 1) ou anterior (passo -1).
  function irParaResultado(passo) {
    if (!busca.encontrados.length) return;
    busca.atual = (busca.atual + passo + busca.encontrados.length) % busca.encontrados.length;
    aplicarBusca();
    if (canvasView.scale < 0.8) { canvasView.scale = 1; aplicarCanvasView(); }
    var alvo = busca.encontrados[busca.atual].getBoundingClientRect();
    var area = elCanvas.getBoundingClientRect();
    canvasView.x += (area.left + area.width / 2) - (alvo.left + alvo.width / 2);
    canvasView.y += (area.top + area.height / 2) - (alvo.top + alvo.height / 2);
    aplicarCanvasView();
  }

  // Rastrear caminho: menor sequência de cabos entre dois equipamentos (busca em
  // largura, ignorando o sentido do cabo). Usa as mesmas classes da busca, por
  // isso abrir um fecha o outro.
  var elCaminhoBar = document.getElementById("caminhoBar");
  var elCaminhoDe = document.getElementById("caminhoDe");
  var elCaminhoPara = document.getElementById("caminhoPara");
  var elCaminhoResultado = document.getElementById("caminhoResultado");
  var btnCaminho = document.getElementById("btnCaminho");

  function caminhoAberto() { return !elCaminhoBar.classList.contains("hidden"); }

  function preencherSelectsCaminho() {
    [elCaminhoDe, elCaminhoPara].forEach(function (select) {
      var atual = select.value;
      select.innerHTML = '<option value="">— escolha —</option>' + estado.equipamentos.map(function (eq) {
        return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
      }).join("");
      if (estado.equipamentos.some(function (eq) { return eq.id === atual; })) select.value = atual;
    });
  }

  function menorCaminho(origem, destino) {
    var vizinhos = {};
    estado.conexoes.forEach(function (c) {
      (vizinhos[c.de] = vizinhos[c.de] || []).push(c.para);
      (vizinhos[c.para] = vizinhos[c.para] || []).push(c.de);
    });
    var anterior = {};
    anterior[origem] = null;
    var fila = [origem];
    while (fila.length) {
      var atual = fila.shift();
      if (atual === destino) break;
      (vizinhos[atual] || []).forEach(function (v) {
        if (!(v in anterior)) { anterior[v] = atual; fila.push(v); }
      });
    }
    if (!(destino in anterior)) return null;
    var caminho = [];
    for (var no = destino; no !== null; no = anterior[no]) caminho.unshift(no);
    return caminho;
  }

  function aplicarCaminho() {
    if (!caminhoAberto()) return;
    var svg = elCanvas.querySelector("svg");
    var de = elCaminhoDe.value, para = elCaminhoPara.value;
    elCaminhoResultado.classList.remove("sem-resultado");
    if (svg) svg.querySelectorAll("g.node, g.edge").forEach(function (el) { el.classList.remove("apagado", "encontrado", "encontrado-atual", "caminho"); });
    if (!de || !para) { elCaminhoResultado.textContent = "Escolha os dois equipamentos."; return; }
    if (de === para) { elCaminhoResultado.textContent = "Escolha equipamentos diferentes."; return; }
    var caminho = menorCaminho(de, para);
    if (!caminho) {
      elCaminhoResultado.textContent = "Não há ligação entre eles.";
      elCaminhoResultado.classList.add("sem-resultado");
      return;
    }
    var nosNoCaminho = {}, trechos = {};
    caminho.forEach(function (id, i) {
      nosNoCaminho[id] = true;
      if (i) { trechos[caminho[i - 1] + "|" + id] = true; trechos[id + "|" + caminho[i - 1]] = true; }
    });
    var nomes = caminho.map(function (id) {
      var eq = estado.equipamentos.find(function (e) { return e.id === id; });
      return eq ? (eq.nome || eq.id) : id;
    });
    var saltos = caminho.length - 1;
    elCaminhoResultado.textContent = saltos + (saltos === 1 ? " cabo: " : " cabos: ") + nomes.join(" → ");
    if (!svg) return;
    svg.querySelectorAll("g.node").forEach(function (node) {
      node.classList.add(nosNoCaminho[idEquipamentoDoNode(node)] ? "encontrado" : "apagado");
    });
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var c = conexaoDaAresta(aresta);
      aresta.classList.add(c && trechos[c.de + "|" + c.para] ? "caminho" : "apagado");
    });
  }

  function abrirCaminho() {
    elBusca.value = "";
    busca.atual = -1;
    aplicarBusca();
    preencherSelectsCaminho();
    elCaminhoBar.classList.remove("hidden");
    btnCaminho.classList.add("active");
    btnCaminho.setAttribute("aria-expanded", "true");
    aplicarCaminho();
    elCaminhoDe.focus();
  }

  function fecharCaminho() {
    if (!caminhoAberto()) return;
    elCaminhoBar.classList.add("hidden");
    btnCaminho.classList.remove("active");
    btnCaminho.setAttribute("aria-expanded", "false");
    var svg = elCanvas.querySelector("svg");
    if (svg) svg.querySelectorAll("g.edge.caminho").forEach(function (el) { el.classList.remove("caminho"); });
    aplicarBusca();
  }

  // ---- Limpar diagrama -------------------------------------------------------
  // Remove tudo, só os cabos, ou os equipamentos de um tipo/grupo/status (com os
  // cabos ligados a eles). Vira um passo do desfazer, como qualquer edição.
  var limpar = {
    backdrop: document.getElementById("limparModal"),
    form: document.getElementById("limparForm"),
    tipo: document.getElementById("limparTipo"),
    grupo: document.getElementById("limparGrupo"),
    status: document.getElementById("limparStatus"),
    resumo: document.getElementById("limparResumo"),
    confirmar: document.getElementById("limparConfirmar")
  };

  function valoresDistintos(campo, vazio) {
    var vistos = {};
    estado.equipamentos.forEach(function (eq) { vistos[String(eq[campo] || "").trim() || vazio] = true; });
    return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  function preencherSelectLimpar(select, valores) {
    var atual = select.value;
    select.innerHTML = valores.map(function (v) { return '<option value="' + escaparHtml(v) + '">' + escaparHtml(v) + '</option>'; }).join("");
    select.disabled = !valores.length;
    if (valores.indexOf(atual) >= 0) select.value = atual;
  }

  var SEM_TIPO = "(sem tipo)", SEM_GRUPO = "(sem grupo)";

  // Quais equipamentos e cabos a opção escolhida remove.
  function selecaoParaLimpar() {
    var modo = (limpar.form.querySelector('input[name="limparModo"]:checked') || {}).value;
    if (modo === "tudo") return { equipamentos: estado.equipamentos.slice(), conexoes: estado.conexoes.slice() };
    if (modo === "cabos") return { equipamentos: [], conexoes: estado.conexoes.slice() };
    var filtro = {
      tipo: function (eq) { return (String(eq.tipo || "").trim() || SEM_TIPO) === limpar.tipo.value; },
      grupo: function (eq) { return (String(eq.grupo || "").trim() || SEM_GRUPO) === limpar.grupo.value; },
      status: function (eq) { return (eq.status || "ativo") === limpar.status.value; }
    }[modo];
    var equipamentos = filtro ? estado.equipamentos.filter(filtro) : [];
    var ids = {};
    equipamentos.forEach(function (eq) { ids[eq.id] = true; });
    return { equipamentos: equipamentos, conexoes: estado.conexoes.filter(function (c) { return ids[c.de] || ids[c.para]; }) };
  }

  function atualizarResumoLimpar() {
    var s = selecaoParaLimpar();
    var total = s.equipamentos.length + s.conexoes.length;
    limpar.resumo.innerHTML = total
      ? "Vai remover <strong>" + escaparHtml(plural(s.equipamentos.length, "equipamento", "equipamentos")) + "</strong> e <strong>" +
        escaparHtml(plural(s.conexoes.length, "cabo", "cabos")) + "</strong>. Dá para desfazer com ↶."
      : "Nada para remover com essa opção.";
    limpar.confirmar.disabled = !total;
  }

  function abrirLimpar() {
    preencherSelectLimpar(limpar.tipo, valoresDistintos("tipo", SEM_TIPO));
    preencherSelectLimpar(limpar.grupo, valoresDistintos("grupo", SEM_GRUPO));
    atualizarResumoLimpar();
    mostrarModalBackdrop(limpar.backdrop);
    var marcado = limpar.form.querySelector('input[name="limparModo"]:checked');
    if (marcado) marcado.focus();
  }

  // Modais: a saída anima (.saindo) antes de virar .hidden. Se reabrir no
  // meio da saída, mostrarModalBackdrop cancela e o timer não esconde mais.
  var reduzirMovimento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function mostrarModalBackdrop(backdrop) {
    backdrop.classList.remove("saindo", "hidden");
  }
  function esconderModal(backdrop) {
    if (backdrop.classList.contains("hidden")) return;
    if (reduzirMovimento && reduzirMovimento.matches) { backdrop.classList.add("hidden"); return; }
    backdrop.classList.add("saindo");
    setTimeout(function () {
      if (!backdrop.classList.contains("saindo")) return;
      backdrop.classList.remove("saindo");
      backdrop.classList.add("hidden");
    }, 150);
  }

  function fecharLimpar() { esconderModal(limpar.backdrop); }

  document.getElementById("btnLimpar").addEventListener("click", abrirLimpar);
  limpar.backdrop.querySelectorAll("[data-limpar-fechar]").forEach(function (b) { b.addEventListener("click", fecharLimpar); });
  limpar.backdrop.addEventListener("click", function (event) { if (event.target === limpar.backdrop) fecharLimpar(); });
  limpar.backdrop.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fecharLimpar(); } });
  limpar.form.addEventListener("change", function (event) {
    // Escolher no select marca a opção dele.
    var label = event.target.closest("label");
    var radio = label && label.querySelector('input[type="radio"]');
    if (event.target.tagName === "SELECT" && radio) radio.checked = true;
    atualizarResumoLimpar();
  });
  limpar.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var s = selecaoParaLimpar();
    var removerEq = {}, removerCabo = new Set(s.conexoes);
    s.equipamentos.forEach(function (eq) { removerEq[eq.id] = true; });
    estado.equipamentos = estado.equipamentos.filter(function (eq) { return !removerEq[eq.id]; });
    estado.conexoes = estado.conexoes.filter(function (c) { return !removerCabo.has(c); });
    fecharLimpar();
    fecharCaminho();
    renderTudo();
  });

  btnCaminho.addEventListener("click", function () { if (caminhoAberto()) fecharCaminho(); else abrirCaminho(); });
  document.getElementById("btnFecharCaminho").addEventListener("click", fecharCaminho);
  elCaminhoDe.addEventListener("change", aplicarCaminho);
  elCaminhoPara.addEventListener("change", aplicarCaminho);

  elBusca.addEventListener("input", function () { fecharCaminho(); busca.atual = -1; aplicarBusca(); });
  elBusca.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); irParaResultado(event.shiftKey ? -1 : 1); }
    if (event.key === "Escape") { elBusca.value = ""; busca.atual = -1; aplicarBusca(); }
  });

  // ==== 05-zoom-modais-e-editor.js: zoom, toque, barra lateral, modais e editor de equipamento/cabo (parte de assets/js/editor/app.js; npm run montar) ====
  // Duplo clique (ou Enter com o cabo focado) abre o editor do cabo.
  function ativarEdicaoDosCabos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var conexao = conexaoDaAresta(aresta);
      if (!conexao) return;
      aresta.setAttribute("tabindex", "0");
      aresta.setAttribute("role", "button");
      aresta.setAttribute("aria-label", "Cabo " + (conexao.tipo || "") + ". Enter para editar.");
      // Sem isto o canvas captura o ponteiro para o pan e o dblclick vai para ele.
      aresta.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      aresta.addEventListener("dblclick", function (event) {
        event.stopPropagation();
        abrirEditorCabo(conexao);
      });
      aresta.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== "F2") return;
        event.preventDefault();
        abrirEditorCabo(conexao);
      });
    });
  }

  // Zoom mantendo fixo o ponto (px, py) do canvas — o cursor, ou o centro se omitido.
  function definirZoom(novoZoom, px, py) {
    var zoomAnterior = canvasView.scale;
    var zoomAtual = limitarZoom(novoZoom);
    if (zoomAnterior === zoomAtual) return;
    if (px == null || py == null) { px = elCanvas.clientWidth / 2; py = elCanvas.clientHeight / 2; }
    canvasView.x = px - (px - canvasView.x) * zoomAtual / zoomAnterior;
    canvasView.y = py - (py - canvasView.y) * zoomAtual / zoomAnterior;
    canvasView.scale = zoomAtual;
    aplicarCanvasView();
  }

  // Roda do mouse: zoom em passos (~16%) que deslizam até o alvo, em torno do
  // cursor; giros rápidos acumulam. Pinça no touchpad (chega como ctrl+roda):
  // zoom contínuo quase imediato. Dois dedos no touchpad (deltas pequenos ou
  // horizontais, sem ctrl): move o diagrama, como nos editores de desenho.
  elCanvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    var escalaDelta = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    var dx = event.deltaX * escalaDelta, dy = event.deltaY * escalaDelta;
    var rect = elCanvas.getBoundingClientRect();
    var px = event.clientX - rect.left, py = event.clientY - rect.top;
    if (event.ctrlKey) {
      zoomSuave(Math.exp(-dy * 0.012), px, py, 0.55);
      return;
    }
    var rodaDeMouse = event.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(event.deltaY));
    if (rodaDeMouse) {
      zoomSuave(Math.min(1.6, Math.max(1 / 1.6, Math.exp(-dy * 0.0015))), px, py, 0.2);
      return;
    }
    pararCamera();
    canvasView.x -= dx;
    canvasView.y -= dy;
    agendarPan();
  }, { passive: false });

  // Pinça com dois dedos (tela de toque): zoom no ponto médio + arrasto.
  var toques = {};
  var pinca = null;
  function pontoMedio() {
    var ids = Object.keys(toques);
    var a = toques[ids[0]], b = toques[ids[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.pointerType !== "touch") return;
    toques[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (Object.keys(toques).length === 2) {
      canvasView.dragging = false; // a pinça assume no lugar do pan de um dedo
      elCanvas.classList.remove("panning");
      pararCamera();
      pinca = pontoMedio();
    }
  }, true);
  elCanvas.addEventListener("pointermove", function (event) {
    if (!toques[event.pointerId]) return;
    toques[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (!pinca || Object.keys(toques).length !== 2) return;
    var atual = pontoMedio();
    var rect = elCanvas.getBoundingClientRect();
    canvasView.x += atual.x - pinca.x;
    canvasView.y += atual.y - pinca.y;
    if (pinca.dist > 0) definirZoom(canvasView.scale * atual.dist / pinca.dist, atual.x - rect.left, atual.y - rect.top);
    agendarPan(); // o arrasto vale mesmo quando o zoom já está no limite
    pinca = atual;
  }, true);
  function fimDoToque(event) {
    delete toques[event.pointerId];
    if (Object.keys(toques).length < 2) pinca = null;
  }
  elCanvas.addEventListener("pointerup", fimDoToque, true);
  elCanvas.addEventListener("pointercancel", fimDoToque, true);

  // Área do canvas mudou de tamanho (painel da direita, lista, janela): mantém
  // o centro do diagrama no centro da área, em vez de ele escapar pela borda.
  if (window.ResizeObserver) {
    var tamanhoCanvasAnterior = null;
    new ResizeObserver(function () {
      var w = elCanvas.clientWidth, h = elCanvas.clientHeight;
      tamanhoAreaCanvas = { w: w, h: h };
      if (tamanhoCanvasAnterior && elCanvas.querySelector("svg") && (w !== tamanhoCanvasAnterior.w || h !== tamanhoCanvasAnterior.h)) {
        canvasView.x += (w - tamanhoCanvasAnterior.w) / 2;
        canvasView.y += (h - tamanhoCanvasAnterior.h) / 2;
        aplicarCanvasView();
      }
      tamanhoCanvasAnterior = { w: w, h: h };
    }).observe(elCanvas);
  }

  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    if (Object.keys(toques).length >= 2) return; // segundo dedo: é pinça, não pan
    canvasView.dragging = true;
    canvasView.startX = event.clientX;
    canvasView.startY = event.clientY;
    // Pegar o diagrama no meio de um zoom animado: para onde está e segue a mão.
    pararCamera();
    canvasView.originX = canvasView.x;
    canvasView.originY = canvasView.y;
    elCanvas.classList.add("panning");
    marcarInteracao();
    elCanvas.setPointerCapture(event.pointerId);
  });

  elCanvas.addEventListener("pointermove", function (event) {
    if (!canvasView.dragging) return;
    canvasView.x = canvasView.originX + event.clientX - canvasView.startX;
    canvasView.y = canvasView.originY + event.clientY - canvasView.startY;
    agendarPan();
  });

  function terminarPan(event) {
    if (!canvasView.dragging) return;
    canvasView.dragging = false;
    elCanvas.classList.remove("panning");
    marcarInteracao(); // tira a camada da GPU logo depois, para redesenhar nítido
    if (event && elCanvas.hasPointerCapture(event.pointerId)) elCanvas.releasePointerCapture(event.pointerId);
  }

  elCanvas.addEventListener("pointerup", terminarPan);
  elCanvas.addEventListener("pointercancel", terminarPan);
  document.getElementById("btnZoomIn").addEventListener("click", function () { zoomSuave(1.25); });
  document.getElementById("btnZoomOut").addEventListener("click", function () { zoomSuave(1 / 1.25); });
  document.getElementById("btnZoomReset").addEventListener("click", function () { ajustarATela(true); });

  // No celular a barra lateral vira um menu no topo: começa recolhida (só a
  // marca e o botão ☰), para o diagrama aparecer logo na primeira tela.
  var telaCelular = window.matchMedia("(max-width: 700px)");
  function definirSidebarRecolhida(recolhida) {
    elSidebar.classList.toggle("collapsed", recolhida);
    btnSidebarCollapse.textContent = telaCelular.matches ? (recolhida ? "☰" : "×") : (recolhida ? "›" : "‹");
    var rotulo = telaCelular.matches ? (recolhida ? "Abrir menu" : "Fechar menu") : (recolhida ? "Expandir barra lateral" : "Recolher barra lateral");
    btnSidebarCollapse.setAttribute("aria-label", rotulo);
    btnSidebarCollapse.setAttribute("aria-expanded", recolhida ? "false" : "true");
    btnSidebarCollapse.title = rotulo;
  }
  btnSidebarCollapse.addEventListener("click", function () {
    var recolher = !elSidebar.classList.contains("collapsed");
    if (recolher) fecharPaineisLaterais(); // recolhida não deixa formulário aberto
    definirSidebarRecolhida(recolher);
  });
  if (telaCelular.matches) definirSidebarRecolhida(true);
  var ouvirTela = function () { definirSidebarRecolhida(elSidebar.classList.contains("collapsed")); };
  if (telaCelular.addEventListener) telaCelular.addEventListener("change", ouvirTela);

  btnModoAvancado.addEventListener("click", function () {
    var fechado = elPainelDados.classList.toggle("painel-dados-oculto");
    elWorkspace.classList.toggle("modo-avancado-fechado", fechado);
    btnModoAvancado.classList.toggle("active", !fechado);
    btnModoAvancado.textContent = fechado ? "Editar em lista" : "Fechar lista";
    // O quadro muda de largura: reenquadra o diagrama depois da animação.
    setTimeout(function () { ajustarATela(true); }, 320);
  });

  var modalRef = {
    backdrop: document.getElementById("appModal"),
    title: document.getElementById("modalTitle"),
    message: document.getElementById("modalMessage"),
    fieldWrap: document.getElementById("modalFieldWrap"),
    input: document.getElementById("modalInput"),
    cancel: document.querySelector("[data-modal-cancel]"),
    confirm: document.querySelector("[data-modal-confirm]"),
    close: document.querySelector("[data-modal-close]"),
    resolver: null,
    mode: "confirm"
  };

  function abrirModal(opcoes) {
    var config = Object.assign({
      title: "Atenção",
      message: "",
      defaultValue: "",
      confirmText: "OK",
      cancelText: "Cancelar",
      kind: "confirm"
    }, opcoes || {});

    modalRef.title.textContent = config.title;
    modalRef.message.textContent = config.message;
    modalRef.input.value = config.defaultValue || "";
    modalRef.confirm.textContent = config.confirmText;
    modalRef.cancel.textContent = config.cancelText;
    modalRef.mode = config.kind;

    if (config.kind === "prompt") {
      modalRef.fieldWrap.classList.remove("hidden");
      modalRef.input.focus();
      modalRef.input.select && modalRef.input.select();
    } else {
      modalRef.fieldWrap.classList.add("hidden");
    }

    mostrarModalBackdrop(modalRef.backdrop);

    return new Promise(function (resolver) {
      modalRef.resolver = resolver;
    });
  }

  function fecharModal(valor) {
    esconderModal(modalRef.backdrop);
    // O foco não pode ficar no campo escondido: os atalhos do teclado parariam.
    if (modalRef.backdrop.contains(document.activeElement)) document.activeElement.blur();
    if (modalRef.resolver) {
      var resposta = valor;
      // Pergunta com texto: Cancelar (ou Esc) responde null, não o que foi digitado.
      if (modalRef.mode === "prompt") {
        resposta = valor === false || valor == null ? null : modalRef.input.value.trim();
      }
      modalRef.resolver(resposta);
      modalRef.resolver = null;
    }
  }

  modalRef.cancel.addEventListener("click", function () { fecharModal(null); });
  modalRef.close.addEventListener("click", function () { fecharModal(null); });
  modalRef.confirm.addEventListener("click", function () {
    if (modalRef.mode === "prompt") {
      fecharModal(modalRef.input.value);
    } else {
      fecharModal(true);
    }
  });
  modalRef.backdrop.addEventListener("click", function (event) {
    if (event.target === modalRef.backdrop) fecharModal(null);
  });
  modalRef.input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      fecharModal(modalRef.input.value);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      fecharModal(null);
    }
  });

  // Editor de equipamento/cabo aberto pelo diagrama (duplo clique ou Enter).
  var editor = {
    backdrop: document.getElementById("editorModal"),
    titulo: document.getElementById("editorTitulo"),
    formEquip: document.getElementById("editorEquipForm"),
    formCabo: document.getElementById("editorCaboForm"),
    equipamento: null,
    conexao: null
  };

  function campoEditor(id) { return document.getElementById(id); }

  // Garante que o select tenha a opção (ex.: capacidade "2.5G" vinda de CSV),
  // senão o valor some ao salvar.
  function selecionarOpcao(select, valor) {
    if (valor && !Array.prototype.some.call(select.options, function (o) { return o.value === valor; })) {
      select.appendChild(new Option(valor, valor));
    }
    select.value = valor || select.options[0].value;
  }

  function mostrarEditor(titulo, form) {
    editor.titulo.textContent = titulo;
    editor.formEquip.classList.toggle("hidden", form !== editor.formEquip);
    editor.formCabo.classList.toggle("hidden", form !== editor.formCabo);
    mostrarModalBackdrop(editor.backdrop);
    var primeiro = form.querySelector("input, select");
    if (primeiro) { primeiro.focus(); if (primeiro.select) primeiro.select(); }
  }

  function fecharEditor() {
    esconderModal(editor.backdrop);
    editor.equipamento = null;
    editor.conexao = null;
  }

  function abrirEditorEquipamento(eq) {
    editor.equipamento = eq;
    editor.conexao = null;
    campoEditor("editEquipNome").value = eq.nome || "";
    campoEditor("editEquipTipo").value = eq.tipo || "";
    campoEditor("editEquipModelo").value = eq.modelo || "";
    campoEditor("editEquipIp").value = eq.ip || "";
    campoEditor("editEquipIp").setCustomValidity("");
    campoEditor("editEquipMensagem").textContent = "";
    campoEditor("editEquipGrupo").value = eq.grupo || "";
    campoEditor("editEquipRede").value = eq.rede || "";
    campoEditor("editEquipGateway").value = eq.gateway || "";
    campoEditor("editEquipMascara").value = eq.mascara || "";
    selecionarOpcao(campoEditor("editEquipStatus"), eq.status || "ativo");
    campoEditor("editEquipIcone").innerHTML = '<option value="">— sem ícone —</option>' + CATALOGO_ICONES.map(function (icone) {
      return '<option value="' + escaparHtml(icone.valor) + '">' + escaparHtml(icone.nome) + '</option>';
    }).join("");
    selecionarOpcao(campoEditor("editEquipIcone"), eq.icone || "");
    campoEditor("editEquipCor").value = corValida(eq.corFonte, "#16323D");
    campoEditor("editEquipCorIconeOriginal").checked = !eq.corIcone;
    campoEditor("editEquipCorIcone").value = eq.corIcone || "#2E9E5B";
    // Outro diagrama que abre pelo selo ↗ do equipamento.
    var outros = Object.keys(projetos).filter(function (n) { return n !== projetoAtual; }).sort();
    if (eq.diagrama && outros.indexOf(eq.diagrama) < 0) outros.unshift(eq.diagrama);
    campoEditor("editEquipDiagrama").innerHTML = '<option value="">— nenhum —</option>' + outros.map(function (n) { return '<option value="' + escaparHtml(n) + '">' + escaparHtml(n) + "</option>"; }).join("");
    campoEditor("editEquipDiagrama").value = eq.diagrama || "";
    preencherCampoMunicipio(campoEditor("editEquipMunicipio"), eq.municipio || "");
    campoEditor("editEquipFixo").checked = !!eq.fixo;
    campoEditor("editEquipPotenciaDbm").value = eq.potenciaDbm != null ? eq.potenciaDbm : "";
    campoEditor("editEquipTamanho").value = tamanhoDoEquipamento(eq);
    campoEditor("editEquipTamanhoValor").textContent = tamanhoDoEquipamento(eq) + "%";
    mostrarEditor("Editar equipamento", editor.formEquip);
  }

  // ---- Ficha do equipamento ---------------------------------------------------
  // Texto pronto para colar (configuração, chamado, planilha):
  //   nome / Host / gateway / mask. A máscara sai do /24 do IP quando não foi
  //   preenchida; "/24" vira 255.255.255.0.
  function mascaraDoPrefixo(prefixo) {
    var n = Number(prefixo);
    if (!(n >= 0 && n <= 32)) return "";
    var partes = [];
    for (var i = 0; i < 4; i++) { var bits = Math.max(0, Math.min(8, n - i * 8)); partes.push(256 - Math.pow(2, 8 - bits)); }
    return partes.join(".");
  }
  // Tudo automático a partir do IP: sem /prefixo vale /24; o gateway é o primeiro
  // endereço útil da rede (ex.: 10.0.0.25/24 → 10.0.0.1). Gateway e máscara
  // preenchidos à mão no equipamento têm prioridade.
  function prefixoDaMascara(m) {
    if (/^\/?\d{1,2}$/.test(m)) return Number(m.replace("/", ""));
    var partes = m.split(".").map(Number), bits = 0;
    partes.forEach(function (o) { while (o & 128) { bits++; o = (o << 1) & 255; } });
    return partes.length === 4 ? bits : null;
  }
  function fichaDoEquipamento(eq) {
    var ip = String(eq.ip || "").trim(), barra = ip.indexOf("/");
    var host = barra >= 0 ? ip.slice(0, barra) : ip;
    var ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    var manual = String(eq.mascara || "").trim();
    var prefixo = manual ? prefixoDaMascara(manual) : barra >= 0 ? Number(ip.slice(barra + 1)) : 24;
    var mascara = ipv4 && prefixo != null ? mascaraDoPrefixo(prefixo) : manual;
    var gateway = String(eq.gateway || "").replace(/\/.*$/, "");
    if (!gateway && ipv4 && prefixo != null && prefixo < 31) {
      var n = host.split(".").reduce(function (a, o) { return a * 256 + Number(o); }, 0);
      var tamanho = Math.pow(2, 32 - prefixo), rede = n - (n % tamanho), gw = rede + 1;
      if (gw === n) gw = rede + tamanho - 2; // o próprio equipamento é o .1: usa o último útil
      gateway = [24, 16, 8, 0].map(function (d) { return Math.floor(gw / Math.pow(2, d)) % 256; }).join(".");
    }
    return "nome: " + (eq.nome || eq.id || "") + "\nHost: " + host + "\ngateway: " + gateway + "\nmask: " + mascara;
  }
  var fichaModal = document.getElementById("fichaModal");
  function abrirFicha(eq) {
    var campo = document.getElementById("fichaTexto");
    var lista = Array.isArray(eq) ? eq : [eq];
    campo.value = lista.map(fichaDoEquipamento).join("\n\n");
    campo.rows = Math.min(18, lista.length * 5);
    document.getElementById("fichaTitulo").textContent = lista.length > 1 ? "Fichas dos equipamentos (" + lista.length + ")" : "Ficha: " + (lista[0].nome || lista[0].id);
    mostrarModalBackdrop(fichaModal);
    campo.focus();
    campo.select();
  }
  function fecharFicha() {
    esconderModal(fichaModal);
    if (fichaModal.contains(document.activeElement)) document.activeElement.blur();
  }
  fichaModal.querySelectorAll("[data-ficha-fechar]").forEach(function (b) { b.addEventListener("click", fecharFicha); });
  fichaModal.addEventListener("click", function (e) { if (e.target === fichaModal) fecharFicha(); });
  fichaModal.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); fecharFicha(); } });
  fichaModal.querySelector("[data-ficha-copiar]").addEventListener("click", function () {
    var campo = document.getElementById("fichaTexto");
    function copiado() { avisar("Ficha copiada."); fecharFicha(); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(campo.value).then(copiado, function () { campo.select(); document.execCommand("copy"); copiado(); });
    } else { campo.select(); document.execCommand("copy"); copiado(); }
  });
  // Todos os equipamentos do diagrama de uma vez, para copiar e mandar.
  document.getElementById("btnFichas").addEventListener("click", function () {
    if (!estado.equipamentos.length) { avisar("Adicione equipamentos primeiro."); return; }
    abrirFicha(estado.equipamentos);
  });
  campoEditor("editEquipFicha").addEventListener("click", function () {
    var eq = editor.equipamento;
    if (!eq) return;
    // Mostra o que está nos campos agora, mesmo antes de salvar.
    abrirFicha(Object.assign({}, eq, { nome: campoEditor("editEquipNome").value, ip: campoEditor("editEquipIp").value,
      gateway: campoEditor("editEquipGateway").value, mascara: campoEditor("editEquipMascara").value }));
  });

  function abrirEditorCabo(c) {
    editor.conexao = c;
    editor.equipamento = null;
    var options = estado.equipamentos.map(function (eq) {
      return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
    }).join("");
    campoEditor("editCaboDe").innerHTML = options;
    campoEditor("editCaboPara").innerHTML = options;
    campoEditor("editCaboDe").value = c.de;
    campoEditor("editCaboPara").value = c.para;
    campoEditor("editCaboSaida").value = c.saida || "";
    campoEditor("editCaboChegada").value = c.chegada || "";
    campoEditor("editCaboTipo").value = c.tipo || "";
    campoEditor("editCaboPotencia").value = c.potencia || "";
    campoEditor("editCaboCor").value = corValida(c.cor, "#5A7284");
    campoEditor("editCaboGrossura").value = Number(c.grossura) || 2;
    selecionarOpcao(campoEditor("editCaboEstilo"), c.estilo || "solid");
    campoEditor("editCaboVlan").value = c.vlan || "";
    campoEditor("editCaboDistancia").value = c.distanciaKm != null ? c.distanciaKm : "";
    campoEditor("editCaboTrafegoEntrada").value = c.trafegoEntrada || "";
    campoEditor("editCaboTrafegoSaida").value = c.trafegoSaida || "";
    campoEditor("editCaboRedeVlan").value = c.redeVlan || "";
    campoEditor("editCaboNumSaida").value = c.numSaida || "";
    campoEditor("editCaboNumChegada").value = c.numChegada || "";
    campoEditor("editCaboMensagem").textContent = "";
    var de = estado.equipamentos.find(function (eq) { return eq.id === c.de; });
    var para = estado.equipamentos.find(function (eq) { return eq.id === c.para; });
    mostrarEditor("Editar cabo" + (de && para ? ": " + (de.nome || de.id) + " → " + (para.nome || para.id) : ""), editor.formCabo);
  }

  campoEditor("editEquipIp").addEventListener("input", function (event) { event.target.setCustomValidity(""); });
  // Tamanho: o número ao lado acompanha o controle; − e + andam de 10 em 10.
  campoEditor("editEquipTamanho").addEventListener("input", function (event) { campoEditor("editEquipTamanhoValor").textContent = event.target.value + "%"; });
  editor.formEquip.querySelectorAll("[data-tamanho-passo]").forEach(function (b) {
    b.addEventListener("click", function () {
      var campo = campoEditor("editEquipTamanho");
      campo.value = Math.max(50, Math.min(250, Math.round((Number(campo.value) + Number(b.getAttribute("data-tamanho-passo"))) / 10) * 10 || 50));
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  // Escolher uma cor já desmarca "Original".
  campoEditor("editEquipCorIcone").addEventListener("input", function () { campoEditor("editEquipCorIconeOriginal").checked = false; });

  editor.formEquip.addEventListener("submit", function (event) {
    event.preventDefault();
    var eq = editor.equipamento;
    if (!eq) return;
    var tipo = campoEditor("editEquipTipo").value.trim();
    // Tipo trocado com o ícone ainda no padrão do tipo antigo: segue o novo tipo.
    var icone = campoEditor("editEquipIcone").value;
    if (tipo !== (eq.tipo || "") && icone === (eq.icone || "") && icone === iconePorTipo(eq.tipo)) icone = iconePorTipo(tipo);
    var validacao = Esquema.validarEquipamento(Object.assign({}, eq, {
      nome: campoEditor("editEquipNome").value, tipo: tipo, icone: icone,
      modelo: campoEditor("editEquipModelo").value, ip: campoEditor("editEquipIp").value,
      grupo: campoEditor("editEquipGrupo").value, status: campoEditor("editEquipStatus").value,
      rede: campoEditor("editEquipRede").value,
      gateway: campoEditor("editEquipGateway").value, mascara: campoEditor("editEquipMascara").value,
      corFonte: campoEditor("editEquipCor").value,
      corIcone: campoEditor("editEquipCorIconeOriginal").checked ? "" : campoEditor("editEquipCorIcone").value,
      diagrama: campoEditor("editEquipDiagrama").value,
      municipio: campoEditor("editEquipMunicipio").value, fixo: campoEditor("editEquipFixo").checked,
      potenciaDbm: campoEditor("editEquipPotenciaDbm").value === "" ? null : campoEditor("editEquipPotenciaDbm").value,
      tamanho: Number(campoEditor("editEquipTamanho").value) || tamanhoPadraoDoTipo(tipo)
    }));
    if (!validacao.ok) { campoEditor("editEquipMensagem").textContent = textoDosErros(validacao.erros); return; }
    if (!validacao.dados.diagrama) { delete validacao.dados.diagrama; delete eq.diagrama; }
    var municipioNovo = validacao.dados.municipio && validacao.dados.municipio !== eq.municipio;
    if (!validacao.dados.municipio) { delete validacao.dados.municipio; delete eq.municipio; }
    if (!validacao.dados.fixo) { delete validacao.dados.fixo; delete eq.fixo; }
    if (validacao.dados.potenciaDbm == null) { delete validacao.dados.potenciaDbm; delete eq.potenciaDbm; }
    ["gateway", "mascara"].forEach(function (k) { if (!validacao.dados[k]) { delete validacao.dados[k]; delete eq[k]; } });
    if (validacao.dados.tamanho === tamanhoPadraoDoTipo(validacao.dados.tipo)) { delete validacao.dados.tamanho; delete eq.tamanho; } // padrão do tipo: não grava
    Object.assign(eq, validacao.dados);
    if (municipioNovo && !eq.fixo) { var ponto = pontoNoMunicipio(eq.municipio, 0); if (ponto) { eq.posicao = ponto; delete eq.deslocamento; } }
    fecharEditor();
    renderTudo();
  });

  editor.formCabo.addEventListener("submit", function (event) {
    event.preventDefault();
    var c = editor.conexao;
    if (!c) return;
    var de = campoEditor("editCaboDe").value;
    var para = campoEditor("editCaboPara").value;
    var validacao = Esquema.validarConexao(Object.assign({}, c, {
      de: de, para: para, saida: campoEditor("editCaboSaida").value, chegada: campoEditor("editCaboChegada").value,
      tipo: campoEditor("editCaboTipo").value, potencia: campoEditor("editCaboPotencia").value, cor: campoEditor("editCaboCor").value,
      grossura: campoEditor("editCaboGrossura").value, estilo: campoEditor("editCaboEstilo").value,
      vlan: campoEditor("editCaboVlan").value, redeVlan: campoEditor("editCaboRedeVlan").value,
      numSaida: campoEditor("editCaboNumSaida").value, numChegada: campoEditor("editCaboNumChegada").value,
      distanciaKm: campoEditor("editCaboDistancia").value === "" ? null : campoEditor("editCaboDistancia").value,
      trafegoEntrada: campoEditor("editCaboTrafegoEntrada").value, trafegoSaida: campoEditor("editCaboTrafegoSaida").value
    }), estado.equipamentos.map(function (eq) { return eq.id; }));
    if (!validacao.ok) { campoEditor("editCaboMensagem").textContent = textoDosErros(validacao.erros); return; }
    // Trocou as pontas: o arraste manual do cabo antigo não vale mais.
    if (de !== c.de || para !== c.para) { delete c.deslocamento; delete validacao.dados.deslocamento; delete c.rota; delete validacao.dados.rota; }
    // Campo da etiqueta apagado: não guarda texto vazio.
    ["vlan", "redeVlan", "numSaida", "numChegada", "trafegoEntrada", "trafegoSaida"].forEach(function (k) { if (!validacao.dados[k]) { delete validacao.dados[k]; delete c[k]; } });
    if (validacao.dados.distanciaKm == null) { delete validacao.dados.distanciaKm; delete c.distanciaKm; }
    Object.assign(c, validacao.dados);
    fecharEditor();
    renderTudo();
    avisarPortaEmUso(c);
  });

  editor.backdrop.querySelectorAll("[data-editor-fechar]").forEach(function (botao) {
    botao.addEventListener("click", fecharEditor);
  });
  editor.backdrop.querySelectorAll("[data-editor-excluir]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      var eq = editor.equipamento;
      var c = editor.conexao;
      var nome = eq ? (eq.nome || eq.id) : "este cabo";
      fecharEditor();
      // Exclui na hora; o aviso traz "Desfazer" (o histórico do Ctrl+Z guarda o antes).
      if (eq) {
        estado.equipamentos = estado.equipamentos.filter(function (item) { return item !== eq; });
        estado.conexoes = estado.conexoes.filter(function (item) { return item.de !== eq.id && item.para !== eq.id; });
      } else if (c) {
        estado.conexoes = estado.conexoes.filter(function (item) { return item !== c; });
      }
      renderTudo();
      avisar((eq ? nome + " excluído" : "Cabo excluído") + ".", { desfazer: true });
    });
  });
  editor.backdrop.addEventListener("click", function (event) {
    if (event.target === editor.backdrop) fecharEditor();
  });
  editor.backdrop.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.preventDefault(); fecharEditor(); }
  });

  // ==== 06-projetos-historico-e-backup.js: projetos, desfazer/refazer, exportar/importar e lembrete de backup (parte de assets/js/editor/app.js; npm run montar) ====
  function clonarDados(dados) { return JSON.parse(JSON.stringify(dados)); }
  function projetoVazio() { return { equipamentos: [], conexoes: [] }; }

  // O que foi corrigido ao carregar os dados salvos (mostrado depois da 1ª renderização).
  var ajustesAoCarregar = [];

  function carregarProjetos() {
    ajustesAoCarregar = [];
    try {
      var salvo = JSON.parse(localStorage.getItem(window.GrafoAuth.storageKey("grafo-projetos")) || "null");
      if (salvo && typeof salvo === "object" && !Array.isArray(salvo) && Object.keys(salvo).length) {
        var projetosSanitizados = {};
        var nomes = Object.keys(salvo);
        if (nomes.length > LIMITES.projetos) {
          ajustesAoCarregar.push({ onde: "Projetos", mensagem: "máximo de " + LIMITES.projetos + " projetos — os excedentes não foram carregados" });
          nomes = nomes.slice(0, LIMITES.projetos);
        }
        // Os dados salvos passam pelas mesmas regras da importação, no modo que
        // corrige em vez de recusar: um dado estragado não trava o app.
        nomes.forEach(function (nomeBruto) {
          var nomeValido = Esquema.validarNomeProjeto(nomeBruto);
          var nome = nomeValido.ok ? nomeValido.dados : String(nomeBruto).trim().slice(0, LIMITES.nomeProjeto) || "Projeto sem nome";
          var baseNome = nome.slice(0, LIMITES.nomeProjeto - 5);
          for (var n = 2; projetosSanitizados[nome]; n++) nome = baseNome + " (" + n + ")";
          if (!nomeValido.ok) ajustesAoCarregar.push({ onde: 'Projeto "' + nome + '"', mensagem: "nome: " + nomeValido.mensagem + " — corrigido" });
          var projeto = salvo[nomeBruto];
          if (projeto && typeof projeto === "object" && Array.isArray(projeto.equipamentos)) projeto.equipamentos.forEach(migrarImagensAntigas);
          var r = Esquema.validarProjeto(projeto, "reparar");
          r.ajustes.forEach(function (a) { ajustesAoCarregar.push({ onde: (nomes.length > 1 ? nome + " › " : "") + a.onde, mensagem: a.mensagem }); });
          projetosSanitizados[nome] = r.dados;
        });
        if (Object.keys(projetosSanitizados).length) {
          // "diagrama-estado" é o formato antigo (um projeto só), já migrado para
          // "grafo-projetos"; apagar libera espaço no localStorage.
          localStorage.removeItem(window.GrafoAuth.storageKey("diagrama-estado"));
          return projetosSanitizados;
        }
      }
    } catch (e) {}
    var legado = carregarLocal();
    if (legado && Array.isArray(legado.equipamentos) && legado.equipamentos.length) {
      legado.equipamentos.forEach(migrarImagensAntigas);
      var r = Esquema.validarProjeto(legado, "reparar");
      ajustesAoCarregar = ajustesAoCarregar.concat(r.ajustes);
      return { "Projeto principal": r.dados };
    }
    return { "Projeto principal": projetoVazio() };
  }
  // semHistorico: salva sem criar entrada no desfazer (para dados que o próprio
  // app recalcula, como as posições depois de renderizar).
  function salvarLocal(semHistorico) {
    try {
      var estadoAtual = JSON.stringify(estado);
      // Mudança feita pelo usuário (não só posições recalculadas ao redesenhar).
      if (!semHistorico && ultimoEstadoHistorico && ultimoEstadoHistorico !== estadoAtual) {
        registrarAlteracao(projetoAtual);
        atualizarLembreteBackup();
      }
      if (!semHistorico && !aplicandoHistorico && ultimoEstadoHistorico && ultimoEstadoHistorico !== estadoAtual) {
        historicoDesfazer.push(JSON.parse(ultimoEstadoHistorico));
        if (historicoDesfazer.length > 50) historicoDesfazer.shift();
        historicoRefazer = [];
      }
      ultimoEstadoHistorico = estadoAtual;
      btnDesfazer.disabled = historicoDesfazer.length === 0;
      btnRefazer.disabled = historicoRefazer.length === 0;
      projetos[projetoAtual] = clonarDados(estado);
      localStorage.setItem(window.GrafoAuth.storageKey("grafo-projetos"), JSON.stringify(projetos));
      localStorage.setItem(window.GrafoAuth.storageKey("grafo-projeto-atual"), projetoAtual);
    } catch (e) {
      var cheio = e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
      if (cheio) {
        mostrarErro("Não foi possível salvar: o espaço do navegador para projetos está cheio.\n" +
          "Remova imagens enviadas ou projetos antigos e use \"Exportar projeto (.json)\" para guardar uma cópia local.");
      }
    }
    window.GrafoAuth.scheduleSave(projetos, projetoAtual);
    // Avisa outros módulos (compartilhar.js) que o projeto pode ter mudado.
    document.dispatchEvent(new CustomEvent("grafo:alterado"));
  }
  // Projetos salvos antes da correção dos nomes das imagens (MIROTIK/RTIFICADOR)
  // e de os ícones .jpeg virarem .png sem fundo.
  function migrarImagensAntigas(eq) {
    if (!eq || typeof eq !== "object") return eq;
    ["icone", "imagem"].forEach(function (campo) {
      if (typeof eq[campo] !== "string" || /^data:/i.test(eq[campo])) return;
      eq[campo] = nomeAtualDaImagem(eq[campo].replace(/MIROTIK\.(png|jpeg)$/i, "MIKROTIK.png").replace(/RTIFICADOR\.jpeg$/i, "RETIFICADOR.jpeg"));
    });
    return eq;
  }
  function carregarLocal() { try { var s = localStorage.getItem(window.GrafoAuth.storageKey("diagrama-estado")); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function salvarTema(t) { try { localStorage.setItem("diagrama-tema", t); } catch (e) {} }
  function carregarTema() { try { return localStorage.getItem("diagrama-tema"); } catch (e) { return null; } }

  // Projetos de equipe (equipe.js) aparecem com 👥 na lista.
  function ehProjetoDeEquipe(nome) { return !!(window.GrafoEquipe && window.GrafoEquipe.ehEquipe(nome)); }

  function renderProjetos() {
    elProjetoSelect.innerHTML = Object.keys(projetos).map(function (nome) {
      var rotulo = (ehProjetoDeEquipe(nome) ? "👥 " : "") + nome;
      return '<option value="' + escaparHtml(nome) + '"' + (nome === projetoAtual ? " selected" : "") + '>' + escaparHtml(rotulo) + '</option>';
    }).join("");
    atualizarLembreteBackup();
  }

  // Projeto de exemplo da tela vazia: um POP pequeno com as situações mais comuns.
  var PROJETO_EXEMPLO = {
    equipamentos: [
      { id: "ex_borda", nome: "RB-BORDA", tipo: "Roteador", modelo: "CCR2004", ip: "10.0.0.1", grupo: "POP Centro" },
      { id: "ex_core", nome: "SW-CORE", tipo: "Switch", modelo: "CRS326", ip: "10.0.0.2", grupo: "POP Centro" },
      { id: "ex_olt", nome: "OLT-01", tipo: "OLT", modelo: "DM4610", ip: "10.0.0.10", grupo: "POP Centro" },
      { id: "ex_nobreak", nome: "NOBREAK-01", tipo: "Nobreak", grupo: "POP Centro" },
      { id: "ex_acesso", nome: "SW-BAIRRO", tipo: "Switch", ip: "10.0.1.2", grupo: "Armário Bairro", status: "manutencao" }
    ],
    conexoes: [
      { de: "ex_borda", para: "ex_core", tipo: "Fibra", potencia: "10G", saida: "sfp+1", chegada: "sfp1" },
      { de: "ex_core", para: "ex_olt", tipo: "Fibra", potencia: "10G", saida: "sfp2", chegada: "xe1/1/1" },
      { de: "ex_core", para: "ex_acesso", tipo: "Fibra", potencia: "1G", saida: "sfp3", chegada: "ge1" },
      { de: "ex_nobreak", para: "ex_core", tipo: "Energia", estilo: "dashed", cor: "#D99A22" }
    ]
  };

  function carregarExemplo() {
    var exemplo = clonarDados(PROJETO_EXEMPLO);
    exemplo.equipamentos.forEach(function (eq) { eq.icone = iconePorTipo(eq.tipo); eq.imagem = ""; eq.status = eq.status || "ativo"; });
    if (estado.modo) exemplo.modo = estado.modo;
    estado = exemplo;
    ajustarNaProximaRenderizacao = true;
    renderTudo();
  }

  function mostrarEstadoVazio() {
    elCanvas.innerHTML =
      '<div class="estado-vazio">' +
        // Ilustração: três equipamentos se ligando (cabos desenhando, LEDs piscando).
        '<svg class="vazio-ilustra" viewBox="0 0 220 120" aria-hidden="true">' +
          '<path class="vi-cabo" d="M58 60 C85 60 85 30 110 30"/><path class="vi-cabo vi-c2" d="M58 60 C85 60 85 90 110 90"/><path class="vi-cabo vi-c3" d="M150 30 C170 30 170 60 180 60"/>' +
          '<rect class="vi-eq" x="14" y="44" width="44" height="32" rx="7"/><rect class="vi-eq vi-e2" x="110" y="16" width="40" height="28" rx="7"/>' +
          '<rect class="vi-eq vi-e3" x="110" y="76" width="40" height="28" rx="7"/><rect class="vi-eq vi-e4 vi-tracejado" x="180" y="46" width="30" height="28" rx="7"/>' +
          '<circle class="vi-led" cx="26" cy="60" r="2.5"/><circle class="vi-led vi-l2" cx="120" cy="30" r="2.5"/><circle class="vi-led vi-l3" cx="120" cy="90" r="2.5"/>' +
          '<path class="vi-mais" d="M195 54v12M189 60h12"/>' +
        '</svg>' +
        '<strong>Nenhum equipamento ainda</strong>' +
        '<span>Adicione equipamentos pela barra lateral ou veja um exemplo pronto.</span>' +
        '<button type="button" class="primary" data-carregar-exemplo>Carregar exemplo</button>' +
      '</div>';
    var botao = elCanvas.querySelector("[data-carregar-exemplo]");
    // O canvas captura o ponteiro para o pan; sem isto o clique não chega ao botão.
    botao.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    botao.addEventListener("click", carregarExemplo);
  }

  function limparDiagrama() {
    ultimoDot = "";
    elCanvas.classList.add("vazio");
    mostrarEstadoVazio();
    elLegenda.innerHTML = "";
    elDotCode.textContent = "";
    btnCopiar.disabled = true;
    btnBaixar.disabled = true;
    btnBaixarPng.disabled = true;
    solicitarPrevia();
  }

  function atualizarBotoesHistorico() {
    btnDesfazer.disabled = historicoDesfazer.length === 0;
    btnRefazer.disabled = historicoRefazer.length === 0;
  }

  function restaurarHistorico(origem, destino) {
    if (!origem.length) return;
    destino.push(clonarDados(estado));
    estado = clonarDados(origem.pop());
    aplicandoHistorico = true;
    renderTudo();
    if (estado.equipamentos.length) gerar(); else limparDiagrama();
    aplicandoHistorico = false;
    atualizarBotoesHistorico();
  }

  btnDesfazer.addEventListener("click", function () { restaurarHistorico(historicoDesfazer, historicoRefazer); });
  btnRefazer.addEventListener("click", function () { restaurarHistorico(historicoRefazer, historicoDesfazer); });

  function abrirProjeto(nome) {
    if (!projetos[nome]) return;
    salvarLocal();
    projetoAtual = nome;
    contagemAnterior = null; // trocar de projeto não é "chegar ao limite"
    estado = clonarDados(projetos[nome]);
    historicoDesfazer = [];
    historicoRefazer = [];
    ultimoEstadoHistorico = JSON.stringify(estado);
    ajustarNaProximaRenderizacao = true;
    renderProjetos();
    renderTudo();
    if (estado.equipamentos.length) gerar(); else limparDiagrama();
  }

  elProjetoSelect.addEventListener("change", function (event) { abrirProjeto(event.target.value); });

  // ---- Modo do projeto (tipo de diagrama) ------------------------------------
  // Muda o que os equipamentos mostram (gerarDot), a legenda, a ordem dos tipos
  // sugeridos e o título da exportação. Projeto sem "modo" é Topologia.
  var MODOS_DIAGRAMA = {
    topologia: { titulo: "Topologia", exportacao: "Topologia de rede" },
    redes: { titulo: "Diagrama de redes", exportacao: "Diagrama de redes" },
    monitoramento: { titulo: "Monitoramento", exportacao: "Diagrama de monitoramento" },
    // Disposição física dos racks (recursos/racks.js); o diagrama lógico fica guardado.
    racks: { titulo: "Bayface de Racks", exportacao: "Bayface de racks" },
    // Rede óptica: sinal estimado em cada splitter, CTO e ONU (perdas de splitter, fibra e conectores).
    ftth: { titulo: "FTTH (rede óptica)", exportacao: "Rede FTTH" }
  };

  // Modelos prontos para começar um projeto (o Organizar arruma na primeira abertura).
  function eqModelo(id, nome, tipo, extra) { return Object.assign({ id: id, nome: nome, tipo: tipo, icone: iconePorTipo(tipo), status: "ativo" }, extra || {}); }
  function caboModelo(de, para, saida, chegada, tipo, potencia, extra) { return Object.assign({ de: de, para: para, saida: saida, chegada: chegada, tipo: tipo, potencia: potencia }, extra || {}); }
  var MODELOS_PRONTOS = {
    pop: { modo: "topologia", dados: function () { return {
      equipamentos: [eqModelo("rb", "RB-BORDA", "RB / CCR", { ip: "10.0.0.1" }), eqModelo("sw", "SW-CORE", "Switch", { ip: "10.0.0.2" }),
        eqModelo("olt", "OLT-01", "OLT", { ip: "10.0.0.10" }), eqModelo("dio", "DIO-48F", "DIO"), eqModelo("nb", "NOBREAK", "Nobreak"), eqModelo("ret", "RETIFICADOR", "Retificador")],
      conexoes: [caboModelo("rb", "sw", "sfp1", "sfp-sfpplus1", "Fibra", "10G"), caboModelo("sw", "olt", "sfp-sfpplus2", "uplink1", "Fibra", "10G"),
        caboModelo("olt", "dio", "pon1", "f1", "Fibra", "GPON"), caboModelo("ret", "olt", "48V", "PWR", "Energia", ""), caboModelo("nb", "sw", "saída 1", "PWR", "Energia", "")] }; } },
    datacenter: { modo: "topologia", dados: function () { return {
      equipamentos: [eqModelo("evpn", "CORE-EVPN", "Switch", { modelo: "Juniper QFX5120" }), eqModelo("l2", "CORE-L2", "Switch", { modelo: "Juniper" }),
        eqModelo("l3", "CORE-L3", "Switch", { modelo: "Juniper" }), eqModelo("bng", "BNG", "RB / CCR", { modelo: "Juniper MX204" }),
        eqModelo("cgnat", "CGNAT", "Servidor"), eqModelo("cdn", "CACHE CDN", "Servidor"), eqModelo("ix", "TRÂNSITO / IX", "Nuvem VPLS")],
      conexoes: [caboModelo("evpn", "l2", "et-0/0/30", "et-0/0/48", "LAG ae14 (CORE-L2)", "100G"), caboModelo("evpn", "l3", "et-0/0/6", "et-0/0/48", "CORE-L3", "100G"),
        caboModelo("evpn", "bng", "et-0/0/4", "et-0/0/0", "WAN BNG", "100G"), caboModelo("evpn", "cgnat", "et-0/0/14", "port 1", "LAG ae10 (CGNAT)", "40G"),
        caboModelo("evpn", "cgnat", "et-0/0/15", "port 2", "LAG ae10 (CGNAT)", "40G"), caboModelo("l2", "cdn", "xe-0/0/33", "eth0", "Cache CDN", "10G"),
        caboModelo("evpn", "ix", "et-0/0/11", "", "Trânsito IP", "100G")] }; } },
    ftth: { modo: "ftth", dados: function () {
      var eqs = [eqModelo("olt", "OLT-01", "OLT", { potenciaDbm: 5 }), eqModelo("sp1", "SPLITTER 1:8", "Splitter")], cabos = [caboModelo("olt", "sp1", "PON 1/1", "IN", "Fibra", "GPON", { distanciaKm: 2 })];
      ["A", "B", "C"].forEach(function (l, i) {
        eqs.push(eqModelo("cto" + l, "CTO-" + l + " 1:8", "CTO"));
        cabos.push(caboModelo("sp1", "cto" + l, "S" + (i + 1), "IN", "Fibra", "", { distanciaKm: 1 + i * 0.8 }));
        eqs.push(eqModelo("onu" + l, "CLIENTE " + l, "ONU"));
        cabos.push(caboModelo("cto" + l, "onu" + l, "P1", "PON", "Drop", "", { distanciaKm: 0.2 }));
      });
      return { equipamentos: eqs, conexoes: cabos }; } },
    // Rota 100G do PDF "ROTA FINAL 100G MAPA": nomes, IP, modelos, portas,
    // capacidades e distâncias como aparecem no PDF. Posições na mesma
    // distribuição do PDF; o mapa (malha municipal) é importado pelo usuário.
    // Pendências de revisão na nota do diagrama.
    rota100g: { modo: "topologia", dados: function () {
      var k = 2.4; // escala das posições (pixels do PDF → desenho)
      function eq(id, nome, municipio, modelo, x, y, extra) {
        return eqModelo(id, nome, "Switch", Object.assign({ modelo: modelo, municipio: municipio, posicao: { x: Math.round(x * k), y: Math.round(y * k) } }, extra || {}));
      }
      function cabo(de, para, saida, chegada, capacidade, km) {
        return caboModelo(de, para, saida, chegada, "Fibra", capacidade, { distanciaKm: km, grossura: capacidade === "100G" ? 4 : 2 });
      }
      return {
        subtitulo: "Rota final 100G · Ibirubá → Boqueirão do Leão",
        equipamentos: [
          eq("ibr", "POP-IBR01_DISTR-14 | Ibirubá - Coprel", "Ibirubá", "DM4270 48XS+4CX", 470, 230, { ip: "10.200.200.14" }),
          eq("qzn", "POP-QZN01_DISTR-13 | Quinze de Novembro - Cidade", "Quinze de Novembro", "NOVO DM4270-48XS-6CS", 512, 330),
          eq("fvz", "DISTRIBUICAO_FVZ_017", "Fortaleza dos Valos", "NOVO DM4270-48X-6C", 432, 378),
          eq("esq", "ESQ_GAUCHA_FV_101 | Fortaleza dos Valos - Esquina Gaúcha", "Fortaleza dos Valos", "NOVO DM4270 24X4C", 343, 460),
          eq("stj", "DISTRIBUICAO_STJ_121 | Salto do Jacuí - Sindicato", "Salto do Jacuí", "NOVO DM4270-48XS-6CS", 432, 572),
          eq("jacz", "POP-JACZ01_DISTR-136 | Jacuizinho - Cidade", "Jacuizinho", "NOVO DM4270-48XS-6CS", 548, 535),
          eq("ths03", "POP-THS03_DISTR-220 | Tunas - Sindicato", "Tunas", "DM4270 48XS+6CX", 632, 612),
          eq("ths01", "POP-THS01_DISTR-137 | Tunas - Cidade", "Tunas", "DM4370 4GT+4GX+4XS", 696, 570),
          eq("laa", "POP-LAA01_DISTR-221 | Lagoão - Torre", "Lagoão", "DM4270 48XS+6CX", 722, 682),
          eq("grxa", "POP-GRXA01_DISTR-232 | Gramado Xavier - Torre", "Gramado Xavier", "DM4270 48XS+6CX", 868, 720),
          eq("bql", "POP-BQL01_DISTR-3 | Boqueirão do Leão - Cidade", "Boqueirão do Leão", "DM4270 48XS+6CX", 982, 722)
        ],
        conexoes: [
          cabo("ibr", "qzn", "HE1/4", "HE1/2", "100G", 20),
          cabo("qzn", "fvz", "HE1/1", "HE1/2", "100G", 30),
          cabo("fvz", "esq", "HE1/1", "HE1/2", "100G", 16),
          cabo("esq", "stj", "HE1/1", "HE1/2", "100G", 26),
          cabo("stj", "jacz", "HE1/1", "HE1/2", "100G", 20),
          cabo("jacz", "ths03", "HE1/1", "HE1/2", "100G", 16),
          cabo("ths03", "ths01", "HE1/4", "GE1/4", "1G", 1),
          cabo("ths03", "laa", "HE1/3", "HE1/2", "100G", 15),
          cabo("laa", "grxa", "HE1/1", "HE1/2", "100G", 52),
          cabo("grxa", "bql", "HE1/1", "HE1/2", "100G", 20)
        ],
        anotacoes: [{ id: "revisar", x: Math.round(250 * k), y: Math.round(820 * k), cor: "#FFF3B0", texto:
          "Exemplo montado a partir do PDF ROTA FINAL 100G MAPA. REVISAR: modelos, a ordem das portas HE1/x em cada ponta e qual distância vai em cada trecho " +
          "(lidas na ordem do PDF). Mapa: Mapa de regiões → importe a malha municipal do RS (IBGE, pelo mapshaper) → Só com equipamentos → Pôr nos municípios." }]
      }; } }
  };
  var elModoDiagrama = document.getElementById("modoDiagrama");
  var modoNaTela = null, modoJaMostrado = false;
  // (Seguro mesmo antes de estas variáveis existirem: 00-catalogo chama cedo.)
  function modoAtual() { return MODOS_DIAGRAMA && estado && MODOS_DIAGRAMA[estado.modo] ? estado.modo : "topologia"; }
  // Chamado a cada renderTudo: só refaz o que depende do modo quando ele muda.
  function aplicarModoNaTela() {
    var modo = modoAtual();
    if (modo === modoNaTela) return;
    modoNaTela = modo;
    if (elModoDiagrama) elModoDiagrama.value = modo;
    document.body.setAttribute("data-modo-diagrama", modo);
    // Troca de tipo com transição (o painel entra de novo, suave). Não anima na abertura.
    var painel = document.querySelector(".render-panel");
    if (painel && modoJaMostrado) { painel.classList.remove("trocando-modo"); void painel.offsetWidth; painel.classList.add("trocando-modo"); clearTimeout(aplicarModoNaTela.t); aplicarModoNaTela.t = setTimeout(function () { painel.classList.remove("trocando-modo"); }, 600); }
    modoJaMostrado = true;
    ajustarLarguraDoSeletorDeModo();
    renderizarTiposSugeridos();
  }
  // O seletor tem a largura do texto escolhido. Chrome/Edge fazem isso pelo CSS
  // (field-sizing); no Firefox e no Safari ele teria a largura da opção mais
  // longa, com um vão antes da seta. Lá, mede o texto e ajusta.
  function ajustarLarguraDoSeletorDeModo() {
    if (!elModoDiagrama || (window.CSS && CSS.supports && CSS.supports("field-sizing", "content"))) return;
    var estilo = getComputedStyle(elModoDiagrama);
    var medida = document.createElement("span");
    medida.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" + estilo.font + ";letter-spacing:" + estilo.letterSpacing;
    medida.textContent = elModoDiagrama.options[elModoDiagrama.selectedIndex].text;
    document.body.appendChild(medida);
    var largura = medida.getBoundingClientRect().width + parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight) +
      parseFloat(estilo.borderLeftWidth) + parseFloat(estilo.borderRightWidth) + 2 +
      // Lista personalizável (base-select): a seta e o espaço antes dela ficam por dentro.
      (window.CSS && CSS.supports && CSS.supports("appearance", "base-select") ? 14 + (parseFloat(estilo.columnGap) || 0) : 0);
    medida.remove();
    elModoDiagrama.style.width = Math.ceil(largura) + "px";
  }
  // A fonte da página pode chegar depois: mede de novo quando ela carregar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarLarguraDoSeletorDeModo);
  if (elModoDiagrama) elModoDiagrama.addEventListener("change", function () {
    var modo = elModoDiagrama.value;
    if (!MODOS_DIAGRAMA[modo] || modo === modoAtual()) return;
    estado.modo = modo;
    renderTudo();
    avisar("Tipo de diagrama: " + MODOS_DIAGRAMA[modo].titulo + ".");
  });

  var novoProjeto = {
    backdrop: document.getElementById("novoProjetoModal"),
    form: document.getElementById("novoProjetoForm"),
    nome: document.getElementById("novoProjetoNome"),
    mensagem: document.getElementById("novoProjetoMensagem")
  };
  function fecharNovoProjeto() { esconderModal(novoProjeto.backdrop); }
  // Escolher um modelo já marca o tipo de diagrama dele.
  novoProjeto.form.addEventListener("change", function (event) {
    if (event.target.name !== "modeloProjeto" || !MODELOS_PRONTOS[event.target.value]) return;
    var radio = novoProjeto.form.querySelector('input[name="modoProjeto"][value="' + MODELOS_PRONTOS[event.target.value].modo + '"]');
    if (radio) radio.checked = true;
  });
  document.getElementById("btnNovoProjeto").addEventListener("click", function () {
    novoProjeto.form.reset();
    novoProjeto.mensagem.textContent = "";
    mostrarModalBackdrop(novoProjeto.backdrop);
    novoProjeto.nome.focus();
  });
  novoProjeto.backdrop.querySelectorAll("[data-novo-projeto-fechar]").forEach(function (b) { b.addEventListener("click", fecharNovoProjeto); });
  novoProjeto.backdrop.addEventListener("click", function (event) { if (event.target === novoProjeto.backdrop) fecharNovoProjeto(); });
  novoProjeto.backdrop.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fecharNovoProjeto(); } });
  novoProjeto.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var validacaoNome = Esquema.validarNomeProjeto(novoProjeto.nome.value);
    var erro = !validacaoNome.ok ? "Nome inválido: " + validacaoNome.mensagem + "."
      : projetos[validacaoNome.dados] ? "Já existe um projeto com esse nome."
      : Object.keys(projetos).length >= LIMITES.projetos ? "Limite de " + LIMITES.projetos + " projetos atingido. Exclua algum antes." : "";
    if (erro) { novoProjeto.mensagem.textContent = erro; novoProjeto.nome.focus(); return; }
    var nome = validacaoNome.dados;
    var escolhido = novoProjeto.form.querySelector('input[name="modoProjeto"]:checked');
    var modo = escolhido && MODOS_DIAGRAMA[escolhido.value] ? escolhido.value : "topologia";
    var modeloEscolhido = novoProjeto.form.querySelector('input[name="modeloProjeto"]:checked');
    var modelo = modeloEscolhido && MODELOS_PRONTOS[modeloEscolhido.value];
    fecharNovoProjeto();
    salvarLocal();
    projetos[nome] = modelo ? Object.assign(Esquema.validarProjeto(modelo.dados(), "reparar").dados, { modo: modelo.modo }) : { equipamentos: [], conexoes: [], modo: modo };
    if (modelo) modo = modelo.modo;
    projetoAtual = nome;
    estado = clonarDados(projetos[nome]);
    historicoDesfazer = [];
    historicoRefazer = [];
    ultimoEstadoHistorico = JSON.stringify(estado);
    salvarLocal();
    renderProjetos();
    if (modelo) { ajustarNaProximaRenderizacao = true; renderTudo(); }
    else { renderTudo(); limparDiagrama(); }
    avisar("Projeto \"" + nome + "\" criado (" + MODOS_DIAGRAMA[modo].titulo + (modelo ? ", a partir de um modelo" : "") + ").");
  });

  // ---- Renomear o projeto aberto ------------------------------------------------
  // Leva junto: links "Abre o diagrama" dos outros projetos, camadas escolhidas,
  // o livro da Biblioteca ligado a ele e, se for de equipe, o nome no servidor.
  async function renomearProjetoAtual() {
    var antigo = projetoAtual;
    var valor = await abrirModal({ title: "Renomear projeto", message: "Novo nome do projeto:", kind: "prompt", defaultValue: antigo, confirmText: "Renomear" });
    if (valor == null) return;
    var validacao = Esquema.validarNomeProjeto(valor);
    if (!validacao.ok) { avisar("Nome inválido: " + validacao.mensagem + "."); return; }
    var novo = validacao.dados;
    if (novo === antigo) return;
    if (projetos[novo]) { avisar("Já existe um projeto chamado “" + novo + "”."); return; }
    var equipe = window.GrafoEquipe;
    if (equipe && equipe.ehEquipe && equipe.ehEquipe(antigo)) {
      try { await equipe.renomear(antigo, novo); }
      catch (e) { avisar("Não foi possível renomear no servidor: " + (e.message || e)); return; }
    }
    salvarLocal(true);
    projetos[novo] = projetos[antigo];
    delete projetos[antigo];
    projetoAtual = novo;
    Object.keys(projetos).forEach(function (nome) {
      (projetos[nome].equipamentos || []).forEach(function (eq) { if (eq.diagrama === antigo) eq.diagrama = novo; });
    });
    estado.equipamentos.forEach(function (eq) { if (eq.diagrama === antigo) eq.diagrama = novo; });
    try {
      var camadas = localStorage.getItem("grafo-camadas:" + antigo);
      if (camadas) { localStorage.setItem("grafo-camadas:" + novo, camadas); localStorage.removeItem("grafo-camadas:" + antigo); }
    } catch (e) {}
    salvarLocal(true);
    renderProjetos();
    renderTudo();
    window.dispatchEvent(new CustomEvent("grafo:projeto-renomeado", { detail: { antigo: antigo, novo: novo } }));
    avisar("Projeto renomeado para “" + novo + "”.");
  }
  document.getElementById("btnRenomearProjeto").addEventListener("click", renomearProjetoAtual);

  // Tira um projeto da lista (excluído, ou a pessoa saiu da equipe) e abre outro.
  function removerProjetoDaLista(nome) {
    if (!projetos[nome]) return;
    delete projetos[nome];
    if (!Object.keys(projetos).length) projetos["Projeto principal"] = projetoVazio();
    if (projetoAtual === nome) {
      projetoAtual = Object.keys(projetos)[0];
      estado = clonarDados(projetos[projetoAtual]);
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      ajustarNaProximaRenderizacao = true;
      renderTudo();
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
    }
    salvarLocal(true);
    renderProjetos();
  }

  document.getElementById("btnExcluirProjeto").addEventListener("click", function () {
    // Projeto de equipe: o dono exclui para todos; os membros saem (equipe.js).
    if (ehProjetoDeEquipe(projetoAtual)) { window.GrafoEquipe.excluirOuSair(projetoAtual); return; }
    var nomes = Object.keys(projetos);
    if (nomes.length <= 1) { mostrarErro("Mantenha ao menos um projeto salvo."); return; }
    abrirModal({
      title: "Excluir projeto",
      message: "Deseja excluir o projeto \"" + projetoAtual + "\"?",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      kind: "confirm"
    }).then(function (confirmado) {
      if (!confirmado) return;
      var excluido = projetoAtual;
      delete projetos[projetoAtual];
      projetoAtual = Object.keys(projetos)[0];
      estado = clonarDados(projetos[projetoAtual]);
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      salvarLocal();
      renderProjetos();
      renderTudo();
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
      avisar("Projeto \"" + excluido + "\" excluído.");
    });
  });

  function exportarProjeto() {
    salvarLocal();
    var arquivoJson = { projeto: projetoAtual, equipamentos: estado.equipamentos, conexoes: estado.conexoes };
    if (estado.modo) arquivoJson.modo = estado.modo;
    // Sem isto o backup perdia as caixas de texto (Importar projeto já as aceita).
    if (estado.anotacoes && estado.anotacoes.length) arquivoJson.anotacoes = estado.anotacoes;
    var conteudo = JSON.stringify(arquivoJson, null, 2);
    var arquivo = projetoAtual.replace(/[^\wÀ-ſ-]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
    baixarBlob(new Blob([conteudo], { type: "application/json" }), "grafo-" + arquivo + ".json");
    registrarBackup(projetoAtual);
    avisar("Projeto exportado: grafo-" + arquivo + ".json");
  }

  document.getElementById("btnExportarProjeto").addEventListener("click", exportarProjeto);

  // Cópia de todos os projetos da conta num arquivo (LGPD: portabilidade).
  // "Importar projeto" reconhece o formato e traz todos de volta.
  var FORMATO_BACKUP = "grafo-backup";
  function exportarTodosProjetos() {
    salvarLocal();
    var hoje = new Date();
    var data = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
    var conteudo = JSON.stringify({ formato: FORMATO_BACKUP, versao: 1, exportadoEm: hoje.toISOString(), projetoAtual: projetoAtual, projetos: projetos }, null, 2);
    var nome = "grafo-todos-os-projetos-" + data + ".json";
    baixarBlob(new Blob([conteudo], { type: "application/json" }), nome);
    Object.keys(projetos).forEach(registrarBackup);
    avisar(plural(Object.keys(projetos).length, "projeto exportado", "projetos exportados") + ": " + nome);
  }
  document.getElementById("btnExportarTodos").addEventListener("click", exportarTodosProjetos);

  // Backup completo: valida todos antes de importar qualquer um.
  function importarBackupCompleto(bruto, nomeArquivo) {
    var origem = bruto.projetos && typeof bruto.projetos === "object" && !Array.isArray(bruto.projetos) ? bruto.projetos : null;
    var nomes = origem ? Object.keys(origem) : [];
    if (!nomes.length) { mostrarErro('Não foi possível importar "' + nomeArquivo + '": o backup não tem projetos.'); return; }
    var livres = LIMITES.projetos - Object.keys(projetos).length;
    if (nomes.length > livres) {
      mostrarErro("Não foi possível importar: o backup tem " + plural(nomes.length, "projeto", "projetos") + " e cabem só mais " + Math.max(0, livres) +
        " (limite de " + LIMITES.projetos + "). Exclua alguns antes.");
      return;
    }
    var validados = [], erros = [], ajustes = [];
    nomes.forEach(function (nomeBruto) {
      var projeto = origem[nomeBruto];
      if (projeto && Array.isArray(projeto.equipamentos)) projeto.equipamentos.forEach(migrarImagensAntigas);
      var r = Esquema.validarProjeto(projeto, "estrito");
      var nomeValido = Esquema.validarNomeProjeto(nomeBruto);
      var rotulo = nomeValido.ok ? nomeValido.dados : "Projeto importado";
      r.erros.forEach(function (e) { erros.push({ onde: rotulo + " › " + e.onde, mensagem: e.mensagem }); });
      r.ajustes.forEach(function (a) { ajustes.push({ onde: rotulo + " › " + a.onde, mensagem: a.mensagem }); });
      validados.push({ base: rotulo, dados: r.dados });
    });
    if (erros.length) { mostrarErrosDeValidacao('"' + nomeArquivo + '"', { ok: false, erros: erros, ajustes: ajustes }); return; }

    salvarLocal();
    var importados = [];
    validados.forEach(function (v) {
      var nome = v.base;
      for (var i = 2; projetos[nome]; i++) nome = v.base.slice(0, LIMITES.nomeProjeto - 5) + " (" + i + ")";
      projetos[nome] = v.dados;
      importados.push(nome);
    });
    abrirProjeto(importados[0]);
    salvarLocal();
    importados.forEach(registrarBackup);
    mostrarAvisosDaImportacao('"' + nomeArquivo + '"', { ok: true, erros: [], ajustes: ajustes });
    avisar(plural(importados.length, "projeto importado", "projetos importados") + ".");
  }

  // Ctrl+S (Cmd+S no Mac) exporta o projeto aberto em vez de "salvar a página".
  document.addEventListener("keydown", function (event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || String(event.key).toLowerCase() !== "s") return;
    event.preventDefault();
    exportarProjeto();
  });

  // ---- Lembrete de backup ---------------------------------------------------
  // A conta sincroniza os projetos. Esta informação local registra quando foi
  // feita uma exportação de backup independente da sincronização.
  var LEMBRETE_DIAS_ENTRE_BACKUPS = 7;
  var LEMBRETE_DIAS_SEM_BACKUP = 1;
  var DIA_MS = 24 * 60 * 60 * 1000;
  var elLembrete = document.getElementById("lembreteBackup");

  function lerInfoBackup() {
    try { return JSON.parse(localStorage.getItem(window.GrafoAuth.storageKey("grafo-backup")) || "{}") || {}; } catch (e) { return {}; }
  }
  function gravarInfoBackup(info) {
    try { localStorage.setItem(window.GrafoAuth.storageKey("grafo-backup"), JSON.stringify(info)); } catch (e) {}
  }

  function registrarBackup(nome) {
    var info = lerInfoBackup();
    info[nome] = { ultimo: Date.now(), pendenteDesde: null, adiadoAte: null };
    gravarInfoBackup(info);
    atualizarLembreteBackup();
  }

  function registrarAlteracao(nome) {
    var info = lerInfoBackup();
    var item = info[nome] || { ultimo: null, pendenteDesde: null, adiadoAte: null };
    if (item.pendenteDesde) return;
    item.pendenteDesde = Date.now();
    info[nome] = item;
    gravarInfoBackup(info);
  }

  function descreverDias(ms) {
    var dias = Math.floor(ms / DIA_MS);
    return dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : "há " + dias + " dias";
  }

  function atualizarLembreteBackup() {
    if (!elLembrete) return;
    var item = lerInfoBackup()[projetoAtual];
    var agora = Date.now();
    var mostrar = false, texto = "";
    if (item && item.pendenteDesde && estado.equipamentos.length && !(item.adiadoAte && item.adiadoAte > agora)) {
      if (item.ultimo && agora - item.ultimo >= LEMBRETE_DIAS_ENTRE_BACKUPS * DIA_MS) {
        mostrar = true;
        texto = "Último backup deste projeto: " + descreverDias(agora - item.ultimo) + ".";
      } else if (!item.ultimo && agora - item.pendenteDesde >= LEMBRETE_DIAS_SEM_BACKUP * DIA_MS) {
        mostrar = true;
        texto = "Este projeto ainda não tem backup.";
      }
    }
    elLembrete.classList.toggle("hidden", !mostrar);
    if (mostrar) elLembrete.querySelector("[data-lembrete-texto]").textContent = texto + " Os dados ficam só neste navegador.";
  }

  if (elLembrete) {
    elLembrete.querySelector("[data-lembrete-exportar]").addEventListener("click", exportarProjeto);
    elLembrete.querySelector("[data-lembrete-adiar]").addEventListener("click", function () {
      var info = lerInfoBackup();
      if (info[projetoAtual]) { info[projetoAtual].adiadoAte = Date.now() + DIA_MS; gravarInfoBackup(info); }
      atualizarLembreteBackup();
    });
  }

  document.getElementById("arquivoProjeto").addEventListener("change", function (event) {
    var arquivo = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var bruto;
      try { bruto = JSON.parse(leitor.result); }
      catch (e) { mostrarErro('Não foi possível importar "' + arquivo.name + '": o arquivo não é um JSON válido.', [{ onde: "JSON", mensagem: e.message }]); return; }
      if (bruto && bruto.formato === FORMATO_BACKUP) { importarBackupCompleto(bruto, arquivo.name); return; }
      if (bruto && Array.isArray(bruto.equipamentos)) bruto.equipamentos.forEach(migrarImagensAntigas);
      var resultado = Esquema.validarProjeto(bruto, "estrito");
      if (!resultado.ok) { mostrarErrosDeValidacao('"' + arquivo.name + '"', resultado); return; }
      if (Object.keys(projetos).length >= LIMITES.projetos) {
        mostrarErro("Não foi possível importar: o limite é de " + LIMITES.projetos + " projetos. Exclua algum antes.");
        return;
      }

      var nomeArquivo = bruto.projeto != null ? bruto.projeto : arquivo.name.replace(/\.json$/i, "");
      var nomeValido = Esquema.validarNomeProjeto(nomeArquivo);
      var base = nomeValido.ok ? nomeValido.dados : "Projeto importado";
      var nome = base;
      for (var i = 2; projetos[nome]; i++) nome = base.slice(0, LIMITES.nomeProjeto - 5) + " (" + i + ")";

      salvarLocal();
      // Sem ícone no arquivo: usa a foto do tipo (Switch, OLT, Servidor…), como no CSV.
      resultado.dados.equipamentos.forEach(function (eq) { if (!eq.icone && !eq.imagem) eq.icone = iconePorTipo(eq.tipo || eq.nome); });
      projetos[nome] = resultado.dados;
      abrirProjeto(nome);
      salvarLocal();
      // Veio de um arquivo: esse arquivo já é um backup do projeto.
      registrarBackup(nome);
      mostrarAvisosDaImportacao('"' + arquivo.name + '"', resultado);
      avisar("Projeto \"" + nome + "\" importado.");
    };
    leitor.readAsText(arquivo, "UTF-8");
  });

  // ==== 07-temas.js: temas de cores (parte de assets/js/editor/app.js; npm run montar) ====
  var themePresets = { "theme-bolsonaro": { bg: "#007A33", bgPanel: "rgba(0, 92, 40, 0.94)", bgPanel2: "#005C28", line: "rgba(255, 223, 0, 0.3)", lineSoft: "rgba(255, 255, 255, 0.16)", text: "#FFFFFF", textDim: "#D6F0DD", accent: "#FFDF00", accentInk: "#002776", teal: "#7FD3FF", paper: "#F7FBF8", paperLine: "#D7EBDD", ink: "#002776", danger: "#FF6B6B", fieldBg: "rgba(255,255,255,0.07)", fieldText: "#FFFFFF", fieldBorder: "rgba(255,223,0,0.3)", ghostBg: "rgba(255,255,255,0.05)", ghostText: "#FFF3A0", ghostBorder: "rgba(255,223,0,0.3)", optionBg: "#F7FBF8", optionText: "#002776", optionActiveBg: "#FFDF00", optionActiveText: "#002776", shadowSoft: "0 10px 30px rgba(0, 30, 10, 0.35)", shadowCard: "0 12px 28px rgba(0, 30, 10, 0.3)" }, "theme-fernando": { bg: "#B71C1C", bgPanel: "rgba(142, 22, 24, 0.92)", bgPanel2: "#8E1618", line: "rgba(255, 213, 79, 0.28)", lineSoft: "rgba(255, 205, 210, 0.2)", text: "#FFFFFF", textDim: "#F6C7C7", accent: "#FFD21F", accentInk: "#5A0A0B", teal: "#5CD65C", paper: "#FFF8F7", paperLine: "#F3D6D6", ink: "#4A0A0B", danger: "#FF5A5F", fieldBg: "rgba(255,255,255,0.06)", fieldText: "#FFFFFF", fieldBorder: "rgba(255,205,210,0.3)", ghostBg: "rgba(255,255,255,0.05)", ghostText: "#FFE9A8", ghostBorder: "rgba(255,213,79,0.3)", optionBg: "#FFF8F7", optionText: "#4A0A0B", optionActiveBg: "#FFD21F", optionActiveText: "#5A0A0B", shadowSoft: "0 10px 30px rgba(60, 0, 0, 0.35)", shadowCard: "0 12px 28px rgba(60, 0, 0, 0.3)" }, "theme-nord": { bg: "#2E3440", bgPanel: "rgba(32, 38, 48, 0.95)", bgPanel2: "#3B4252", line: "rgba(136, 192, 208, 0.22)", lineSoft: "rgba(129, 161, 193, 0.18)", text: "#ECEFF4", textDim: "#D8DEE9", accent: "#88C0D0", accentInk: "#2E3440", teal: "#8FBCBB", paper: "#F4F6FA", paperLine: "#D8DEE9", ink: "#2E3440", danger: "#FF7D6C", fieldBg: "rgba(236,239,244,0.05)", fieldText: "#ECEFF4", fieldBorder: "rgba(136,192,208,0.22)", ghostBg: "rgba(236,239,244,0.04)", ghostText: "#D8DEE9", ghostBorder: "rgba(136,192,208,0.22)", optionBg: "#F4F6FA", optionText: "#2E3440", optionActiveBg: "#88C0D0", optionActiveText: "#2E3440", shadowSoft: "0 10px 30px rgba(5, 12, 20, 0.25)", shadowCard: "0 12px 28px rgba(6, 15, 22, 0.22)" }, "theme-dark-modern": { bg: "#1F1F1F", bgPanel: "rgba(33, 33, 33, 0.94)", bgPanel2: "#2B2B2B", line: "rgba(124, 124, 124, 0.2)", lineSoft: "rgba(170, 170, 170, 0.14)", text: "#F3F3F3", textDim: "#C9C9C9", accent: "#5AA9FF", accentInk: "#0F172A", teal: "#7CE6D8", paper: "#F8F8F8", paperLine: "#E2E2E2", ink: "#1D1D1D", danger: "#FF7D6C", fieldBg: "rgba(255,255,255,0.03)", fieldText: "#F3F3F3", fieldBorder: "rgba(170,170,170,0.18)", ghostBg: "rgba(255,255,255,0.02)", ghostText: "#C9C9C9", ghostBorder: "rgba(170,170,170,0.18)", optionBg: "#F8F8F8", optionText: "#1D1D1D", optionActiveBg: "#5AA9FF", optionActiveText: "#0F172A", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.24)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.18)" }, "theme-dracula": { bg: "#282A36", bgPanel: "rgba(40, 42, 54, 0.95)", bgPanel2: "#1E2029", line: "rgba(255, 121, 198, 0.18)", lineSoft: "rgba(189, 147, 249, 0.18)", text: "#F8F8F2", textDim: "#BD93F9", accent: "#FF79C6", accentInk: "#282A36", teal: "#8BE9FD", paper: "#F7F7F7", paperLine: "#E5E5E5", ink: "#282A36", danger: "#FF5555", fieldBg: "rgba(248,248,242,0.04)", fieldText: "#F8F8F2", fieldBorder: "rgba(255,121,198,0.2)", ghostBg: "rgba(248,248,242,0.03)", ghostText: "#BD93F9", ghostBorder: "rgba(255,121,198,0.2)", optionBg: "#F7F7F7", optionText: "#282A36", optionActiveBg: "#FF79C6", optionActiveText: "#282A36", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.28)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.2)" }, "theme-dark-plus": { bg: "#0D1117", bgPanel: "rgba(13, 17, 23, 0.94)", bgPanel2: "#161B22", line: "rgba(110, 118, 129, 0.18)", lineSoft: "rgba(110, 118, 129, 0.14)", text: "#C9D1D9", textDim: "#8B949E", accent: "#58A6FF", accentInk: "#0D1117", teal: "#39D353", paper: "#F6F8FA", paperLine: "#D0D7DE", ink: "#0D1117", danger: "#F85149", fieldBg: "rgba(201,209,217,0.04)", fieldText: "#C9D1D9", fieldBorder: "rgba(110,118,129,0.22)", ghostBg: "rgba(201,209,217,0.03)", ghostText: "#8B949E", ghostBorder: "rgba(110,118,129,0.22)", optionBg: "#F6F8FA", optionText: "#0D1117", optionActiveBg: "#58A6FF", optionActiveText: "#0D1117", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.3)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.22)" }, "theme-catppuccin-mocha": { bg: "#1E1E2E", bgPanel: "rgba(30, 30, 46, 0.94)", bgPanel2: "#302D41", line: "rgba(203, 166, 247, 0.18)", lineSoft: "rgba(137, 180, 250, 0.16)", text: "#CDD6F4", textDim: "#BAC2DE", accent: "#F38BA8", accentInk: "#1E1E2E", teal: "#94E2D5", paper: "#F4F3F8", paperLine: "#D9E0EC", ink: "#1E1E2E", danger: "#F38BA8", fieldBg: "rgba(205,214,244,0.05)", fieldText: "#CDD6F4", fieldBorder: "rgba(203,166,247,0.22)", ghostBg: "rgba(205,214,244,0.04)", ghostText: "#BAC2DE", ghostBorder: "rgba(203,166,247,0.22)", optionBg: "#F4F3F8", optionText: "#1E1E2E", optionActiveBg: "#F38BA8", optionActiveText: "#1E1E2E", shadowSoft: "0 10px 30px rgba(0, 0, 0, 0.25)", shadowCard: "0 12px 28px rgba(0, 0, 0, 0.2)" }, "theme-github-light": { bg: "#F6F8FA", bgPanel: "rgba(255, 255, 255, 0.96)", bgPanel2: "#FFFFFF", line: "rgba(208, 215, 222, 0.65)", lineSoft: "rgba(208, 215, 222, 0.8)", text: "#24292F", textDim: "#57606A", accent: "#0969DA", accentInk: "#FFFFFF", teal: "#1A7F37", paper: "#FFFFFF", paperLine: "#D0D7DE", ink: "#24292F", danger: "#CF222E", fieldBg: "rgba(36,41,47,0.03)", fieldText: "#24292F", fieldBorder: "rgba(208,215,222,0.9)", ghostBg: "rgba(36,41,47,0.02)", ghostText: "#57606A", ghostBorder: "rgba(208,215,222,0.9)", optionBg: "#FFFFFF", optionText: "#24292F", optionActiveBg: "#0969DA", optionActiveText: "#FFFFFF", shadowSoft: "0 18px 36px rgba(16, 33, 46, 0.12)", shadowCard: "0 12px 24px rgba(16, 33, 46, 0.08)" }, "theme-solarized-light": { bg: "#FDF6E3", bgPanel: "rgba(255, 250, 240, 0.96)", bgPanel2: "#F5E6C5", line: "rgba(147, 161, 161, 0.4)", lineSoft: "rgba(147, 161, 161, 0.3)", text: "#002B36", textDim: "#586E75", accent: "#B58900", accentInk: "#002B36", teal: "#2AA198", paper: "#FFFDF7", paperLine: "#EEE8D5", ink: "#073642", danger: "#DC322F", fieldBg: "rgba(0,43,54,0.04)", fieldText: "#002B36", fieldBorder: "rgba(147,161,161,0.5)", ghostBg: "rgba(0,43,54,0.03)", ghostText: "#586E75", ghostBorder: "rgba(147,161,161,0.5)", optionBg: "#FFFDF7", optionText: "#073642", optionActiveBg: "#B58900", optionActiveText: "#FDF6E3", shadowSoft: "0 18px 36px rgba(7, 54, 66, 0.12)", shadowCard: "0 12px 24px rgba(7, 54, 66, 0.08)" }, "theme-light-plus": { bg: "#F3F3F3", bgPanel: "rgba(255, 255, 255, 0.96)", bgPanel2: "#F7F7F7", line: "rgba(201, 201, 201, 0.7)", lineSoft: "rgba(201, 201, 201, 0.55)", text: "#1F1F1F", textDim: "#5B5B5B", accent: "#2F80ED", accentInk: "#FFFFFF", teal: "#00A39D", paper: "#FFFFFF", paperLine: "#E5E5E5", ink: "#1F1F1F", danger: "#D64545", fieldBg: "rgba(31,31,31,0.04)", fieldText: "#1F1F1F", fieldBorder: "rgba(201,201,201,0.9)", ghostBg: "rgba(31,31,31,0.03)", ghostText: "#5B5B5B", ghostBorder: "rgba(201,201,201,0.9)", optionBg: "#FFFFFF", optionText: "#1F1F1F", optionActiveBg: "#2F80ED", optionActiveText: "#FFFFFF", shadowSoft: "0 18px 36px rgba(31, 31, 31, 0.08)", shadowCard: "0 12px 24px rgba(31, 31, 31, 0.06)" }, "theme-alto-contraste": { bg: "#000000", bgPanel: "rgba(0, 0, 0, 0.98)", bgPanel2: "#111111", line: "rgba(255, 255, 255, 0.46)", lineSoft: "rgba(255, 255, 255, 0.28)", text: "#FFFFFF", textDim: "#E6E6E6", accent: "#FFFF00", accentInk: "#000000", teal: "#00FFFF", paper: "#FFFFFF", paperLine: "#DADADA", ink: "#000000", danger: "#FF0000", fieldBg: "rgba(255,255,255,0.06)", fieldText: "#FFFFFF", fieldBorder: "rgba(255,255,255,0.5)", ghostBg: "rgba(255,255,255,0.04)", ghostText: "#E6E6E6", ghostBorder: "rgba(255,255,255,0.5)", optionBg: "#FFFFFF", optionText: "#000000", optionActiveBg: "#FFFF00", optionActiveText: "#000000", shadowSoft: "0 0 0 2px rgba(255,255,255,0.25)", shadowCard: "0 0 0 2px rgba(255,255,255,0.22)" } };

  var temaSelect = document.getElementById("temaSelect");

  // Símbolo próprio de um tema no lugar da logo do Grafo (tema Fernando).
  var LOGO_PADRAO = "./assets/images/app/grafo-160.png";
  var LOGO_DO_TEMA = { "theme-fernando": "./assets/images/app/simbolo-fernando.png", "theme-bolsonaro": "./assets/images/app/bandeira-brasil.svg" };
  function trocarLogo(chave) {
    var src = LOGO_DO_TEMA[chave] || LOGO_PADRAO;
    document.querySelectorAll("img.brand-mark").forEach(function (img) { if (img.getAttribute("src") !== src) img.setAttribute("src", src); });
  }

  function removerTemaCustomizado() {
    trocarLogo(null);
    [
      "--bg", "--bg-panel", "--bg-panel-2", "--line", "--line-soft", "--text", "--text-dim", "--accent", "--accent-ink",
      "--teal", "--paper", "--paper-line", "--ink", "--danger", "--field-bg", "--field-text", "--field-border",
      "--ghost-bg", "--ghost-text", "--ghost-border", "--option-bg", "--option-text", "--option-active-bg",
      "--option-active-text", "--shadow-soft", "--shadow-card"
    ].forEach(function (prop) {
      document.documentElement.style.removeProperty(prop);
    });
  }

  function aplicarTemaPersonalizado(chave) {
    var preset = themePresets[chave];
    if (!preset) return;
    Object.keys(preset).forEach(function (key) {
      // Números também viram segmento: bgPanel2 -> --bg-panel-2 (o nome usado no CSS).
      var cssKey = key.replace(/[A-Z]|\d+/g, function (trecho) { return "-" + trecho.toLowerCase(); });
      document.documentElement.style.setProperty("--" + cssKey, preset[key]);
    });
    document.documentElement.setAttribute("data-theme", "custom");
    trocarLogo(chave);
  }

  function aplicarTemaSelecionado(valor) {
    if (valor === "auto") {
      document.documentElement.removeAttribute("data-theme");
      removerTemaCustomizado();
      btnTema.textContent = "Tema: Automático";
      salvarTema("");
      return;
    }

    if (valor === "light" || valor === "dark") {
      document.documentElement.setAttribute("data-theme", valor);
      removerTemaCustomizado();
      btnTema.textContent = "Tema: " + (valor === "dark" ? "Escuro" : "Claro");
      salvarTema(valor);
      return;
    }

    aplicarTemaPersonalizado(valor);
    var opcaoTema = temaSelect.querySelector('option[value="' + valor + '"]');
    btnTema.textContent = "Tema: " + (opcaoTema ? opcaoTema.textContent : "Personalizado");
    salvarTema(valor);
  }

  var temaSalvo = carregarTema();
  // Tema exclusivo (opção escondida): só vale depois que o banco confirmar que esta
  // conta tem o tema liberado (admin.js). Até lá fica o automático, sem apagar a escolha.
  var opcaoSalva = temaSalvo && temaSelect.querySelector('option[value="' + temaSalvo + '"]');
  if (opcaoSalva && opcaoSalva.hidden) {
    window.__temaExclusivoPendente = temaSalvo;
    temaSalvo = "";
  }
  if (temaSalvo && themePresets[temaSalvo]) {
    temaSelect.value = temaSalvo;
    aplicarTemaSelecionado(temaSalvo);
  } else if (temaSalvo === "dark" || temaSalvo === "light") {
    temaSelect.value = temaSalvo;
    document.documentElement.setAttribute("data-theme", temaSalvo);
    btnTema.textContent = "Tema: " + (temaSalvo === "dark" ? "Escuro" : "Claro");
  } else {
    temaSelect.value = "auto";
    btnTema.textContent = "Tema: Automático";
  }

  btnTema.addEventListener("click", function () {
    var atual = document.documentElement.getAttribute("data-theme");
    var temaAtual = temaSelect.value;

    if (temaAtual && themePresets[temaAtual]) {
      aplicarTemaSelecionado(temaAtual);
      return;
    }

    if (atual === "dark") {
      document.documentElement.setAttribute("data-theme", "light");
      temaSelect.value = "light";
      btnTema.textContent = "Tema: Claro";
      salvarTema("light");
    } else if (atual === "light") {
      document.documentElement.setAttribute("data-theme", "dark");
      temaSelect.value = "dark";
      btnTema.textContent = "Tema: Escuro";
      salvarTema("dark");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      temaSelect.value = "dark";
      btnTema.textContent = "Tema: Escuro";
      salvarTema("dark");
    }
  });

  temaSelect.addEventListener("change", function (event) {
    aplicarTemaSelecionado(event.target.value);
  });

  // ==== 08-listas-e-formularios.js: listas de equipamentos/cabos, formulários e painéis da barra lateral (parte de assets/js/editor/app.js; npm run montar) ====
  function escapar(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n"); }
  function escaparHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escaparHtmlDot(s) {
    return escaparHtml(s).replace(/'/g, "&apos;");
  }
  // Dados podem vir de JSON/CSV importado: só aceita cores #rgb/#rrggbb.
  function corValida(cor, padrao) {
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(cor || "")) ? cor : padrao;
  }
  // Aceita data:image/ e caminhos http(s)/relativos; bloqueia javascript: e afins.
  function imagemSegura(url) {
    var s = String(url || "").trim();
    if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
    return s;
  }
  // Tipos comuns têm cor própria (nunca repetem); os outros saem da paleta pelo nome.
  var CORES_TIPO_FIXAS = { olt: "#7DB4FF", onu: "#5EEAD4", switch: "#A8E06B", roteador: "#FF8FB8", router: "#FF8FB8", radio: "#FFC163",
    dio: "#B69CFF", servidor: "#67D3F5", server: "#67D3F5", dwdm: "#F7A26B", nobreak: "#E8E36B", ups: "#E8E36B", firewall: "#FF6B6B",
    storage: "#9AA8FF", mikrotik: "#FF8FB8", ap: "#7CE0B0", camera: "#C8A2F0", concentrador: "#F0B3E6" };
  function corPorTipo(tipo) {
    var chave = String(tipo || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (CORES_TIPO_FIXAS[chave]) return CORES_TIPO_FIXAS[chave];
    var paleta = ["#5EEAD4", "#7DB4FF", "#FFC163", "#FF8FB8", "#B69CFF", "#67D3F5", "#A8E06B"];
    var str = String(tipo || "outro"); var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff; }
    return paleta[Math.abs(hash) % paleta.length];
  }
  function corPorStatus(status) { return status === "manutencao" ? "#D99A22" : status === "offline" ? "#D94B5B" : "#2EAD68"; }
  function marcadorStatus(status) { return status === "manutencao" ? "⚙" : status === "offline" ? "×" : "●"; }
  // Rótulo exibido no diagrama; o valor salvo continua sem acento ("manutencao").
  function rotuloStatus(status) { return status === "manutencao" ? "MANUTENÇÃO" : status === "offline" ? "OFFLINE" : "ATIVO"; }

  function renderEquipamentos() {
    elListaEquip.innerHTML = estado.equipamentos.map(function (eq, i) {
      var opcoesEmoji = ICONES.map(function (ic) {
        return '<option value="' + escaparHtml(ic) + '"' + (ic === eq.icone ? " selected" : "") + '>' + (ic ? escaparHtml(ic) : "— sem ícone —") + '</option>';
      }).join("");
      var opcoesImagem = CATALOGO_ICONES.map(function (icone) {
        return '<option value="' + escaparHtml(icone.valor) + '"' + (icone.valor === eq.icone ? " selected" : "") + '>' + escaparHtml(icone.nome) + '</option>';
      }).join("");
      return (
        '<div class="equip-card" data-idx="' + i + '">' +
          // Linha enxuta: marca na cor do tipo, nome inteiro com tipo/IP embaixo, status
          // em ponto; detalhes e remover são ícones (aparecem ao passar o mouse).
          '<div class="equip-row1">' +
            '<span class="equip-marca" style="--cor-tipo:' + corPorTipo(eq.tipo || "outro") + '" aria-hidden="true">' + escaparHtml(String(eq.tipo || "?").trim().charAt(0).toUpperCase() || "?") + '</span>' +
            '<div class="equip-titulo">' +
              '<input type="text" data-field="nome" data-limite="nome" value="' + escaparHtml(eq.nome) + '" placeholder="Nome do equipamento" aria-label="Nome do equipamento" title="' + escaparHtml(eq.nome) + '">' +
              '<span class="equip-sub">' + escaparHtml([eq.tipo || "Sem tipo", eq.modelo, eq.ip].filter(Boolean).join(" · ")) + '</span>' +
            '</div>' +
            '<span class="equip-status equip-status-' + (eq.status || "ativo") + '" title="' + (eq.status === "manutencao" ? "Manutenção" : eq.status === "offline" ? "Offline" : "Ativo") + '"><i class="equip-status-dot ' + (eq.status || "ativo") + '"></i><span>' + (eq.status === "manutencao" ? "Manutenção" : eq.status === "offline" ? "Offline" : "Ativo") + '</span></span>' +
            '<button type="button" class="ghost small equip-advanced-toggle" data-action="toggle-avancado" aria-expanded="false" title="Detalhes" aria-label="Detalhes"></button>' +
            '<button type="button" class="ghost small" data-action="remover-equip" title="Remover" aria-label="Remover equipamento">×</button>' +
          '</div>' +
          '<div class="equip-advanced" data-advanced-panel>' +
            '<div class="equip-row2"><label class="equip-campo-icone">Ícone <select data-field="icone" aria-label="Ícone"><optgroup label="Símbolos">' + opcoesImagem + '</optgroup><optgroup label="Emojis">' + opcoesEmoji + '</optgroup></select></label></div>' +
            '<div class="equip-row2">' +
              '<input type="text" data-field="modelo" data-limite="modelo" list="modelos-sugeridos" autocomplete="off" value="' + escaparHtml(eq.modelo) + '" placeholder="Modelo (fabricante)" aria-label="Modelo (fabricante)">' +
              '<input type="text" data-field="tipo" data-limite="tipo" value="' + escaparHtml(eq.tipo) + '" placeholder="Tipo" aria-label="Tipo" list="tipos-sugeridos">' +
              '<input type="text" data-field="ip" data-limite="ip" value="' + escaparHtml(eq.ip || "") + '" placeholder="IP (ex.: 10.0.0.1)" aria-label="IP" aria-invalid="' + (ipValido(eq.ip) ? "false" : "true") + '" inputmode="decimal" autocomplete="off" spellcheck="false">' +
              '<input type="text" data-field="grupo" data-limite="grupo" value="' + escaparHtml(eq.grupo || "") + '" placeholder="Grupo / rack / sala" aria-label="Grupo / rack / sala">' +
            '</div>' +
            '<div class="equip-row2">' +
              '<input type="text" data-field="rede" data-limite="rede" value="' + escaparHtml(eq.rede || "") + '" placeholder="VLAN / rede (ex.: VLAN 10 · 10.0.0.0/24)" aria-label="VLAN / rede" autocomplete="off" spellcheck="false">' +
            '</div>' +
            '<div class="equip-row3">' +
              '<label class="color-picker">Fonte <input type="color" data-field="corFonte" value="' + corValida(eq.corFonte, "#16323D") + '"></label>' +
              '<label class="color-picker">Status <select data-field="status"><option value="ativo"' + ((eq.status || "ativo") === "ativo" ? " selected" : "") + '>Ativo</option><option value="manutencao"' + (eq.status === "manutencao" ? " selected" : "") + '>Manutenção</option><option value="offline"' + (eq.status === "offline" ? " selected" : "") + '>Offline</option></select></label>' +
              '<label class="upload-label">Imagem/logo (opcional) <input type="file" accept="image/*" data-action="upload-imagem"></label>' +
              (imagemSegura(eq.imagem) ? '<img class="thumb" src="' + escaparHtml(imagemSegura(eq.imagem)) + '" alt=""><button type="button" class="ghost small" data-action="remover-imagem">remover imagem</button>' : '') +
            '</div>' +
            '<div class="equip-id">id: ' + escaparHtml(eq.id) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
    aplicarLimitesNosCampos(elListaEquip);
    filtrarListas();
  }

  // maxlength dos campos marcados com data-limite="<chave de LIMITES>": a tela
  // usa os mesmos limites da validação (esquema.js).
  function aplicarLimitesNosCampos(raiz) {
    (raiz || document).querySelectorAll("[data-limite]").forEach(function (campo) {
      var limite = LIMITES[campo.getAttribute("data-limite")];
      if (typeof limite === "number") campo.maxLength = limite;
    });
  }

  // Filtro e contagem das seções da lista. Esconde (sem apagar) os itens que não
  // batem; a contagem mostra "3 de 40" enquanto há filtro.
  function filtrarLista(lista, seletor, itens, filtro, contagem, textos) {
    var termo = normalizarTextoEquipamento(filtro.value);
    var visiveis = 0;
    lista.querySelectorAll(seletor).forEach(function (el) {
      var item = itens[parseInt(el.getAttribute("data-idx"), 10)];
      if (!item) return; // linha de uma renderização anterior, prestes a ser refeita
      var bate = !termo || textos(item).some(function (t) { return normalizarTextoEquipamento(t).indexOf(termo) >= 0; });
      el.hidden = !bate;
      if (bate) visiveis++;
    });
    contagem.textContent = termo ? visiveis + " de " + itens.length : String(itens.length);
    var aviso = lista.querySelector(".lista-vazia-filtro");
    if (termo && !visiveis && itens.length) {
      if (!aviso) { aviso = document.createElement("div"); aviso.className = "lista-vazia-filtro"; lista.appendChild(aviso); }
      aviso.textContent = 'Nada encontrado para "' + filtro.value.trim() + '".';
    } else if (aviso) aviso.remove();
  }

  function filtrarListas() {
    var nomePorId = {};
    estado.equipamentos.forEach(function (eq) { nomePorId[eq.id] = eq.nome; });
    filtrarLista(elListaEquip, ".equip-card", estado.equipamentos, elFiltroEquip, document.getElementById("contagemEquip"),
      function (eq) { return [eq.nome, eq.ip, eq.tipo, eq.grupo, eq.modelo]; });
    filtrarLista(elListaConex, ".conex-row", estado.conexoes, elFiltroConex, document.getElementById("contagemConex"),
      function (c) { return [nomePorId[c.de], nomePorId[c.para], c.tipo, c.saida, c.chegada, c.potencia]; });
  }
  elFiltroEquip.addEventListener("input", filtrarListas);
  elFiltroConex.addEventListener("input", filtrarListas);

  function renderConexoes() {
    prepararCoresDosCabos(estado.conexoes); // a marca de cada cabo com a mesma cor do desenho
    var opcoesEquip = estado.equipamentos.map(function (eq) { return { id: eq.id, nome: eq.nome || eq.id }; });
    elListaConex.innerHTML = estado.conexoes.map(function (c, j) {
      function opcoes(selecionado) {
        return opcoesEquip.map(function (o) {
          return '<option value="' + escaparHtml(o.id) + '"' + (o.id === selecionado ? " selected" : "") + '>' + escaparHtml(o.nome) + '</option>';
        }).join("");
      }
      // Mesmo modelo da lista de equipamentos: linha enxuta (cor do cabo, origem → destino,
      // portas e capacidade embaixo) e os campos ficam em "Detalhes".
      var nomeDe = (opcoesEquip.find(function (o) { return o.id === c.de; }) || {}).nome || c.de;
      var nomePara = (opcoesEquip.find(function (o) { return o.id === c.para; }) || {}).nome || c.para;
      var portas = (c.saida || c.chegada) ? (c.saida || "?") + " → " + (c.chegada || "?") : "";
      var titulo = nomeDe + " → " + nomePara;
      return (
        '<div class="equip-card conex-row conex-card" data-idx="' + j + '">' +
          '<div class="equip-row1">' +
            '<span class="equip-marca conex-marca" style="--cor-tipo:' + corValida(corDoCaboNoDesenho(c, null, j), "#5A7284") + '" aria-hidden="true"></span>' +
            '<div class="equip-titulo">' +
              '<strong class="conex-titulo" title="' + escaparHtml(titulo) + '">' + escaparHtml(titulo) + '</strong>' +
              '<span class="equip-sub">' + escaparHtml([portas, c.potencia, c.tipo].filter(Boolean).join(" · ") || "Sem portas") + '</span>' +
            '</div>' +
            '<button type="button" class="ghost small equip-advanced-toggle" data-action="toggle-avancado" aria-expanded="false" title="Detalhes" aria-label="Detalhes"></button>' +
            '<button type="button" class="ghost small" data-action="remover-conex" title="Remover" aria-label="Remover conexão">×</button>' +
          '</div>' +
          '<div class="equip-advanced" data-advanced-panel>' +
            '<div class="equip-row2 conex-pontas">' +
              '<select data-field="de" aria-label="Origem">' + opcoes(c.de) + '</select>' +
              '<span class="conex-arrow">→</span>' +
              '<select data-field="para" aria-label="Destino">' + opcoes(c.para) + '</select>' +
            '</div>' +
            '<div class="equip-row2">' +
              '<input type="text" data-field="saida" data-limite="porta" value="' + escaparHtml(c.saida || "") + '" placeholder="Porta origem" aria-label="Porta origem">' +
              '<input type="text" data-field="chegada" data-limite="porta" value="' + escaparHtml(c.chegada || "") + '" placeholder="Porta destino" aria-label="Porta destino">' +
              '<input type="text" data-field="potencia" data-limite="capacidade" value="' + escaparHtml(c.potencia || "") + '" list="capacidades-sugeridas" placeholder="Capacidade" title="Capacidade do cabo" aria-label="Capacidade do cabo" autocomplete="off">' +
              '<input type="text" data-field="tipo" data-limite="tipoCabo" value="' + escaparHtml(c.tipo) + '" placeholder="Tipo de enlace" aria-label="Tipo de enlace">' +
            '</div>' +
            '<div class="equip-row3">' +
              '<label class="color-picker">Cor da linha <input type="color" data-field="cor" value="' + corValida(c.cor, "#5A7284") + '"></label>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
    aplicarLimitesNosCampos(elListaConex);
    filtrarListas();
  }

  function renderSidebarPanels() {
    preencherSelectsCaminho();
    var options = estado.equipamentos.map(function (eq) {
      return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>';
    }).join("");
    var de = document.getElementById("navCableDe");
    var para = document.getElementById("navCablePara");
    var deAtual = de.value;
    var paraAtual = para.value;
    de.innerHTML = options;
    para.innerHTML = options;
    if (estado.equipamentos.some(function (eq) { return eq.id === deAtual; })) de.value = deAtual;
    if (estado.equipamentos.some(function (eq) { return eq.id === paraAtual; })) para.value = paraAtual;
    if (estado.equipamentos.length > 1 && de.value === para.value) para.value = estado.equipamentos[1].id;

    // Sugere os grupos já usados, para não criar "Rack 01" e "rack 01" separados.
    var gruposUsados = {};
    estado.equipamentos.forEach(function (eq) { var g = String(eq.grupo || "").trim(); if (g) gruposUsados[g] = true; });
    document.getElementById("grupos-sugeridos").innerHTML = Object.keys(gruposUsados).sort().map(function (g) {
      return '<option value="' + escaparHtml(g) + '"></option>';
    }).join("");
  }

  function solicitarAtualizacaoDiagrama() {
    window.clearTimeout(atualizacaoDiagramaPendente);
    atualizacaoDiagramaPendente = window.setTimeout(function () {
      // No Bayface o diagrama está escondido: redesenha ao voltar para ele.
      if (modoAtual() === "racks") return;
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
    }, 120);
  }

  function renderTudo() { aplicarModoNaTela(); renderEquipamentos(); renderConexoes(); renderSidebarPanels(); atualizarJsonAvancado(); atualizarContadorEquipamentos(); salvarLocal(); solicitarAtualizacaoDiagrama(); avisarIpsNovos(); window.dispatchEvent(new CustomEvent("grafo:render")); }

  // IP colocado ou trocado em algum equipamento (formulário, editor, CSV, JSON…):
  // avisa integracao.js, que dá ping na hora. Ao trocar de projeto, só memoriza.
  var ipsConhecidos = null, projetoDosIps = null;
  function avisarIpsNovos() {
    var atuais = {};
    estado.equipamentos.forEach(function (eq) { var ip = (eq.ip || "").split("/")[0]; if (ip) atuais[ip] = true; });
    var novos = projetoDosIps === projetoAtual && ipsConhecidos ? Object.keys(atuais).filter(function (ip) { return !ipsConhecidos[ip]; }) : [];
    ipsConhecidos = atuais;
    projetoDosIps = projetoAtual;
    if (novos.length) window.dispatchEvent(new CustomEvent("grafo:ips-novos", { detail: novos }));
  }

  // Contador "n/35" na barra do diagrama. Perto do limite fica em alerta; no
  // limite, os botões de adicionar são bloqueados e aparece um aviso (uma vez).
  var elContadorEquip = document.getElementById("contadorEquip");
  var contagemAnterior = null;
  function atualizarContadorEquipamentos() {
    var n = estado.equipamentos.length, max = LIMITES.equipamentos;
    var cheio = n >= max;
    elContadorEquip.textContent = n + "/" + max;
    elContadorEquip.classList.toggle("perto", !cheio && n >= max - 5);
    elContadorEquip.classList.toggle("cheio", cheio);
    elContadorEquip.title = cheio ? "Limite de " + max + " equipamentos atingido. Exclua algum para adicionar outro."
      : "Equipamentos no diagrama: " + n + " de " + max;
    ["btnAddEquip"].forEach(function (id) { var b = document.getElementById(id); if (b) b.disabled = cheio; });
    var navAdd = document.querySelector('.nav-item[data-nav-panel="navAddEquip"]');
    if (navAdd) navAdd.classList.toggle("no-limite", cheio);
    // Aviso só quando a contagem sobe até o limite (não ao abrir um projeto já cheio).
    if (cheio && contagemAnterior !== null && contagemAnterior < max && n > contagemAnterior) {
      avisar("Limite de " + max + " equipamentos atingido neste diagrama.");
    }
    contagemAnterior = n;
  }

  function atualizarJsonAvancado() {
    elJsonAvancado.value = JSON.stringify(estado, null, 2);
  }

  // Edição direta na lista: o campo só é gravado se o item continuar válido
  // pelas regras do esquema. Enquanto inválido, o campo fica marcado e o valor
  // anterior continua salvo; ao sair do campo (change), ele volta ao salvo.
  function validarCampoDaLista(tipo, item, campo, valor) {
    var candidato = Object.assign({}, item);
    candidato[campo] = valor;
    var r = tipo === "equipamento" ? Esquema.validarEquipamento(candidato)
      : Esquema.validarConexao(candidato, estado.equipamentos.map(function (eq) { return eq.id; }));
    return r.ok ? { ok: true, valor: r.dados[campo] } : { ok: false, mensagem: textoDosErros(r.erros) };
  }

  function marcarCampo(input, mensagem) {
    input.setAttribute("aria-invalid", mensagem ? "true" : "false");
    input.title = mensagem || "";
  }

  elListaEquip.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo || e.target.tagName === "SELECT") return;
    var card = e.target.closest(".equip-card");
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("equipamento", estado.equipamentos[idx], campo, e.target.value);
    marcarCampo(e.target, r.ok ? "" : r.mensagem);
    if (!r.ok) return;
    estado.equipamentos[idx][campo] = r.valor;
    if (campo === "nome") renderConexoes();
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  // Imagens enviadas ficam dentro do projeto no localStorage (~5 MB no total),
  // então são reduzidas para no máximo 256 px antes de salvar.
  var LADO_MAXIMO_IMAGEM = 256;
  function lerImagemReduzida(arquivo, concluir) {
    var leitor = new FileReader();
    leitor.onload = function () {
      var original = leitor.result;
      if (/^data:image\/svg/i.test(original)) { concluir(original); return; }
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, LADO_MAXIMO_IMAGEM / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        var reduzida = canvas.toDataURL("image/webp", 0.85);
        concluir(reduzida.length < original.length ? reduzida : original);
      };
      img.onerror = function () { concluir(original); };
      img.src = original;
    };
    leitor.readAsDataURL(arquivo);
  }

  elListaEquip.addEventListener("change", function (e) {
    if (e.target.getAttribute("data-action") === "upload-imagem") {
      var card = e.target.closest(".equip-card");
      var idx = parseInt(card.getAttribute("data-idx"), 10);
      var arquivo = e.target.files && e.target.files[0];
      if (!arquivo) return;
      lerImagemReduzida(arquivo, function (imagem) {
        var r = validarCampoDaLista("equipamento", estado.equipamentos[idx], "imagem", imagem);
        if (!r.ok) { mostrarErro("Não foi possível usar essa imagem.", [{ onde: arquivo.name, mensagem: r.mensagem }]); return; }
        estado.equipamentos[idx].imagem = r.valor;
        renderEquipamentos();
        atualizarJsonAvancado();
        salvarLocal();
        solicitarAtualizacaoDiagrama();
      });
      return;
    }
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var card = e.target.closest(".equip-card");
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("equipamento", estado.equipamentos[idx], campo, e.target.value);
    if (!r.ok) mostrarErro("Valor não aceito em " + (estado.equipamentos[idx].nome || "equipamento") + "; o anterior foi mantido.", [{ onde: campo, mensagem: r.mensagem }]);
    else estado.equipamentos[idx][campo] = r.valor;
    renderEquipamentos();
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  elListaEquip.addEventListener("click", function (e) {
    var acao = e.target.getAttribute("data-action");
    if (!acao) return;
    var card = e.target.closest(".equip-card");
    if (acao === "toggle-avancado") {
      var painelAvancado = card.querySelector("[data-advanced-panel]");
      var aberto = painelAvancado.classList.toggle("open");
      card.classList.toggle("aberto", aberto);
      e.target.setAttribute("aria-expanded", aberto ? "true" : "false");
      e.target.title = aberto ? "Ocultar detalhes" : "Detalhes";
      return;
    }
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    if (acao === "remover-equip") {
      var idRemovido = estado.equipamentos[idx].id;
      estado.equipamentos.splice(idx, 1);
      estado.conexoes = estado.conexoes.filter(function (c) { return c.de !== idRemovido && c.para !== idRemovido; });
      renderTudo();
      avisar("Equipamento excluído.", { desfazer: true });
    } else if (acao === "remover-imagem") {
      estado.equipamentos[idx].imagem = "";
      renderEquipamentos();
      atualizarJsonAvancado();
      salvarLocal();
    }
  });

  document.getElementById("btnAddEquip").addEventListener("click", function () {
    abrirFormularioEquipamento();
  });

  function abrirFormularioEquipamento() {
    elFormEquip.classList.remove("hidden");
    elFormCab.classList.add("hidden");
    setTimeout(function () {
      var input = document.getElementById("novoEquipNome");
      if (input) input.focus();
    }, 20);
  }

  function fecharFormularioEquipamento() {
    elFormEquip.classList.add("hidden");
    document.getElementById("novoEquipNome").value = "";
    document.getElementById("novoEquipTipo").value = "";
    document.getElementById("novoEquipModelo").value = "";
    document.getElementById("novoEquipIp").value = "";
    document.getElementById("novoEquipCor").value = "#16323D";
  }

  function abrirFormularioCabemamento() {
    elFormCab.classList.remove("hidden");
    elFormEquip.classList.add("hidden");
    var de = document.getElementById("novoCabDe");
    var para = document.getElementById("novoCabPara");
    var options = estado.equipamentos.map(function (eq) { return '<option value="' + escaparHtml(eq.id) + '">' + escaparHtml(eq.nome || eq.id) + '</option>'; }).join("");
    de.innerHTML = options;
    para.innerHTML = options;
    if (estado.equipamentos.length > 1) {
      de.value = estado.equipamentos[0].id;
      para.value = estado.equipamentos[1].id;
    }
    setTimeout(function () { var input = document.getElementById("novoCabNome"); if (input) input.focus(); }, 20);
  }

  function fecharFormularioCabemamento() {
    elFormCab.classList.add("hidden");
    document.getElementById("novoCabNome").value = "";
    document.getElementById("novoCabCor").value = "#5A7284";
    document.getElementById("novoCabGrossura").value = "2";
    document.getElementById("novoCabSaida").value = "";
    document.getElementById("novoCabChegada").value = "";
    document.getElementById("novoCabPotencia").value = "1G";
    document.getElementById("novoCabEstilo").value = "solid";
  }

  function fecharPaineisLaterais() {
    document.querySelectorAll(".nav-panel.open").forEach(function (panel) { panel.classList.remove("open"); });
    document.querySelectorAll(".nav-item[data-nav-panel].active").forEach(function (item) { item.classList.remove("active"); });
  }

  document.querySelectorAll(".nav-item[data-nav-panel]").forEach(function (item) {
    item.addEventListener("click", function () {
      var panel = document.getElementById(item.getAttribute("data-nav-panel"));
      var estavaAberto = panel.classList.contains("open");
      fecharPaineisLaterais();
      if (!estavaAberto) {
        panel.classList.add("open");
        item.classList.add("active");
        if (panel.id === "navAddCable") renderSidebarPanels();
      }
    });
  });

  document.querySelectorAll("[data-nav-close]").forEach(function (button) {
    button.addEventListener("click", fecharPaineisLaterais);
  });

  document.getElementById("navEquipIp").addEventListener("input", function (event) {
    event.target.setCustomValidity("");
  });

  // Erros de GrafoEsquema.validarEquipamento/validarConexao em texto para o formulário
  // ("IP: IP inválido…"), sem o prefixo "Equipamento ›"/"Cabo ›".
  function textoDosErros(erros) {
    return erros.map(function (e) {
      var campo = e.onde.replace(/^(Equipamento|Cabo)( › )?/, "");
      return (campo ? campo + ": " : "") + e.mensagem;
    }).join("\n");
  }

  // Mensagem quando já se chegou ao limite; null se ainda cabe.
  function limiteAtingido(tipo) {
    if (tipo === "equipamento" && estado.equipamentos.length >= LIMITES.equipamentos) return "Limite de " + LIMITES.equipamentos + " equipamentos por projeto atingido.";
    if (tipo === "cabo" && estado.conexoes.length >= LIMITES.conexoes) return "Limite de " + LIMITES.conexoes + " cabos por projeto atingido.";
    return null;
  }

  document.getElementById("navEquipForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var mensagem = document.getElementById("navEquipMessage");
    mensagem.textContent = limiteAtingido("equipamento") || "";
    if (mensagem.textContent) return;
    var arquivo = document.getElementById("navEquipImagem").files[0];
    var tipo = document.getElementById("navEquipTipo").value.trim();
    var iconeInformado = document.getElementById("navEquipIcone").value.trim();
    var validacao = Esquema.validarEquipamento({ id: novoId(), nome: document.getElementById("navEquipNome").value, modelo: document.getElementById("navEquipModelo").value,
      ip: document.getElementById("navEquipIp").value, tipo: tipo, icone: iconeInformado || iconePorTipo(tipo), imagem: "", corFonte: "#16323D",
      grupo: document.getElementById("navEquipGrupo").value, status: document.getElementById("navEquipStatus").value,
      rede: document.getElementById("navEquipRede").value, municipio: document.getElementById("navEquipMunicipio").value });
    if (!validacao.ok) { mensagem.textContent = textoDosErros(validacao.erros); return; }
    var novoEquipamento = validacao.dados;
    if (!novoEquipamento.municipio) delete novoEquipamento.municipio;
    else {
      var jaNoMunicipio = estado.equipamentos.filter(function (e) { return normalizarTextoEquipamento(e.municipio) === normalizarTextoEquipamento(novoEquipamento.municipio); }).length;
      var ponto = pontoNoMunicipio(novoEquipamento.municipio, jaNoMunicipio);
      if (ponto) novoEquipamento.posicao = ponto;
    }
    function concluir(imagem) {
      var comImagem = Esquema.validarEquipamento(Object.assign({}, novoEquipamento, { imagem: imagem || "" }));
      if (!comImagem.ok) { mensagem.textContent = textoDosErros(comImagem.erros); return; }
      novoEquipamento = comImagem.dados;
      mensagem.textContent = "";
      estado.equipamentos.push(novoEquipamento);
      ligarEquipamentoNovo(novoEquipamento); // "Ligar a": já cria o cabo (13-cadastro-automatico.js)
      renderTudo();
      renderSidebarPanels();
      event.target.reset();
      fecharPaineisLaterais();
      esconderErro();
      abrirFicha(novoEquipamento); // ficha pronta para copiar (nome / Host / gateway / mask)
    }
    if (!arquivo) { concluir(""); return; }
    lerImagemReduzida(arquivo, concluir);
  });

  document.getElementById("navCableForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var de = document.getElementById("navCableDe").value;
    var para = document.getElementById("navCablePara").value;
    var mensagem = document.getElementById("navCableMessage");
    if (!de || !para) { mensagem.textContent = "Cadastre dois equipamentos primeiro."; return; }
    mensagem.textContent = limiteAtingido("cabo") || "";
    if (mensagem.textContent) return;
    var validacao = Esquema.validarConexao({
      de: de, para: para, tipo: document.getElementById("navCableTipo").value,
      cor: document.getElementById("navCableCor").value, grossura: document.getElementById("navCableGrossura").value,
      estilo: document.getElementById("navCableEstilo").value, saida: document.getElementById("navCableSaida").value, chegada: document.getElementById("navCableChegada").value, potencia: document.getElementById("navCablePotencia").value
    }, estado.equipamentos.map(function (eq) { return eq.id; }));
    if (!validacao.ok) { mensagem.textContent = textoDosErros(validacao.erros); return; }
    validacao.dados.cor = corParaNovoCabo(validacao.dados); // cada cabo novo com uma cor diferente
    estado.conexoes.push(validacao.dados);
    renderTudo();
    avisarPortaEmUso(validacao.dados);
    event.target.reset();
    document.getElementById("navCableCor").value = "#5A7284";
    document.getElementById("navCableGrossura").value = "2";
    mensagem.textContent = "";
    fecharPaineisLaterais();
    esconderErro();
  });

  document.addEventListener("click", function (event) {
    var navAction = event.target.getAttribute("data-nav-action");
    if (navAction === "export-diagram") btnBaixar.click();
  });

  document.addEventListener("click", function (event) {
    var action = event.target.getAttribute("data-action");
    if (!action) return;

    if (action === "cancelar-equip" || action === "fechar-form-equip") {
      fecharFormularioEquipamento();
    }

    if (action === "cancelar-cab" || action === "fechar-form-cab") {
      fecharFormularioCabemamento();
    }

    if (action === "salvar-equip") {
      var nome = document.getElementById("novoEquipNome").value.trim();
      var tipo = document.getElementById("novoEquipTipo").value.trim();
      var modelo = document.getElementById("novoEquipModelo").value.trim();
      var ip = document.getElementById("novoEquipIp").value.trim();
      var cor = document.getElementById("novoEquipCor").value || "#16323D";
      if (limiteAtingido("equipamento")) { mostrarErro(limiteAtingido("equipamento")); return; }
      var validacaoEquip = Esquema.validarEquipamento({ id: novoId(), nome: nome, modelo: modelo, ip: ip, tipo: tipo, icone: iconePorTipo(tipo), imagem: "", corFonte: cor });
      if (!validacaoEquip.ok) { mostrarErro("Não foi possível adicionar o equipamento.", validacaoEquip.erros); return; }
      estado.equipamentos.push(validacaoEquip.dados);
      renderTudo();
      fecharFormularioEquipamento();
      esconderErro();
    }

    if (action === "salvar-cab") {
      var cabNome = document.getElementById("novoCabNome").value.trim();
      var de = document.getElementById("novoCabDe").value;
      var para = document.getElementById("novoCabPara").value;
      var cor = document.getElementById("novoCabCor").value || "#5A7284";
      var grossura = document.getElementById("novoCabGrossura").value;
      if (!de || !para || !cabNome) {
        mostrarErro("Informe nome, origem e destino do cabeamento.");
        return;
      }
      if (limiteAtingido("cabo")) { mostrarErro(limiteAtingido("cabo")); return; }
      var validacaoCabo = Esquema.validarConexao({
        de: de, para: para, tipo: cabNome, cor: cor, grossura: grossura,
        saida: document.getElementById("novoCabSaida").value,
        chegada: document.getElementById("novoCabChegada").value,
        potencia: document.getElementById("novoCabPotencia").value,
        estilo: document.getElementById("novoCabEstilo").value
      }, estado.equipamentos.map(function (eq) { return eq.id; }));
      if (!validacaoCabo.ok) { mostrarErro("Não foi possível adicionar o cabeamento.", validacaoCabo.erros); return; }
      validacaoCabo.dados.cor = corParaNovoCabo(validacaoCabo.dados);
      estado.conexoes.push(validacaoCabo.dados);
      renderTudo();
      fecharFormularioCabemamento();
      esconderErro();
      avisarPortaEmUso(validacaoCabo.dados);
    }
  });

  elListaConex.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo || e.target.tagName === "SELECT") return;
    var idx = parseInt(e.target.closest(".conex-row").getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("cabo", estado.conexoes[idx], campo, e.target.value);
    marcarCampo(e.target, r.ok ? "" : r.mensagem);
    if (!r.ok) return;
    estado.conexoes[idx][campo] = r.valor;
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  // Ao sair do campo (ou trocar origem/destino): grava o valor já padronizado
  // (ex.: capacidade "10 gbps" -> "10G") ou, se inválido, volta ao anterior.
  elListaConex.addEventListener("change", function (e) {
    var campo = e.target.getAttribute("data-field");
    if (!campo) return;
    var idx = parseInt(e.target.closest(".conex-row").getAttribute("data-idx"), 10);
    var r = validarCampoDaLista("cabo", estado.conexoes[idx], campo, e.target.value);
    if (!r.ok) {
      mostrarErro("Valor não aceito no cabo " + (idx + 1) + "; o anterior foi mantido.", [{ onde: campo, mensagem: r.mensagem }]);
      renderConexoes();
      return;
    }
    estado.conexoes[idx][campo] = r.valor;
    if (e.target.tagName !== "SELECT") e.target.value = r.valor;
    salvarLocal();
    atualizarJsonAvancado();
    solicitarAtualizacaoDiagrama();
  });

  elListaConex.addEventListener("click", function (e) {
    if (e.target.getAttribute("data-action") === "toggle-avancado") {
      var card = e.target.closest(".conex-card");
      var aberto = card.querySelector("[data-advanced-panel]").classList.toggle("open");
      card.classList.toggle("aberto", aberto);
      e.target.setAttribute("aria-expanded", aberto ? "true" : "false");
      e.target.title = aberto ? "Ocultar detalhes" : "Detalhes";
      return;
    }
    if (e.target.getAttribute("data-action") === "remover-conex") {
      var row = e.target.closest(".conex-row");
      var idx = parseInt(row.getAttribute("data-idx"), 10);
      estado.conexoes.splice(idx, 1);
      renderTudo();
    }
  });

  document.getElementById("btnAddConex").addEventListener("click", function () {
    if (estado.equipamentos.length < 2) {
      mostrarErro("Adicione ao menos dois equipamentos antes de criar uma conexão.");
      return;
    }
    abrirFormularioCabemamento();
  });

  // ==== 09-csv-e-mensagens.js: importação CSV, JSON avançado, avisos e mensagens de erro (parte de assets/js/editor/app.js; npm run montar) ====
  // ---- Importação CSV --------------------------------------------------------
  // Uma linha por cabo; os equipamentos são criados a partir dos nomes em
  // origem/destino. Linha sem destino cadastra só o equipamento. Cada campo
  // aceita alguns nomes de coluna (sem diferenciar maiúsculas/acentos).
  var COLUNAS_CSV = {
    origem: ["origem", "de", "equipamento", "equipamento_origem", "nome"],
    destino: ["destino", "para", "equipamento_destino"],
    porta_origem: ["porta_origem", "saida", "porta_saida", "porta_de"],
    porta_destino: ["porta_destino", "chegada", "porta_chegada", "porta_para"],
    tipo: ["tipo", "tipo_enlace", "enlace", "cabo", "tipo_cabo"],
    capacidade: ["capacidade", "potencia", "velocidade"],
    ip_origem: ["ip_origem", "ip", "ip_de"],
    ip_destino: ["ip_destino", "ip_para"],
    vlan_origem: ["vlan_origem", "vlan", "rede_origem", "rede"],
    vlan_destino: ["vlan_destino", "rede_destino"],
    modelo_origem: ["modelo_origem", "modelo"],
    modelo_destino: ["modelo_destino"],
    tipo_origem: ["tipo_origem", "tipo_equipamento"],
    tipo_destino: ["tipo_destino"]
  };
  var MODELO_CSV =
    "origem;ip_origem;vlan_origem;modelo_origem;porta_origem;destino;ip_destino;vlan_destino;modelo_destino;porta_destino;tipo;capacidade\r\n" +
    "OLT-01;10.0.0.2;VLAN 20;Huawei MA5800;xe1/1/1;SW-CORE;10.0.0.1;VLAN 10;DM4270;ge1/1;Fibra;10G\r\n" +
    "RB-BORDA;10.0.0.254;VLAN 10;MikroTik CCR;eth1;SW-CORE;10.0.0.1;VLAN 10;DM4270;ge1/2;Cobre;1G\r\n" +
    "NOBREAK-01;;;;;;;;;;;\r\n";

  function normalizarCabecalhoCsv(texto) { return normalizarTextoEquipamento(texto).replace(/[\s-]+/g, "_"); }

  // O separador mais frequente na primeira linha (fora de aspas): ";", "," ou tab.
  function detectarSeparadorCsv(primeiraLinha) {
    var contagem = { ";": 0, ",": 0, "\t": 0 };
    var dentroDeAspas = false;
    for (var i = 0; i < primeiraLinha.length; i++) {
      var ch = primeiraLinha[i];
      if (ch === '"') dentroDeAspas = !dentroDeAspas;
      else if (!dentroDeAspas && contagem[ch] !== undefined) contagem[ch]++;
    }
    return Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; })[0];
  }

  // Linhas e campos do CSV, respeitando aspas (separador e "" dentro de aspas).
  function lerLinhasCsv(texto) {
    texto = String(texto || "").replace(/^﻿/, "");
    var separador = detectarSeparadorCsv(texto.split(/\r?\n/)[0] || "");
    var linhas = [], linha = [], campo = "", dentroDeAspas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (dentroDeAspas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') dentroDeAspas = false;
        else campo += ch;
      } else if (ch === '"') {
        dentroDeAspas = true;
      } else if (ch === separador) {
        linha.push(campo); campo = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && texto[i + 1] === "\n") i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = "";
      } else {
        campo += ch;
      }
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas.filter(function (l) { return l.some(function (c) { return c.trim(); }); });
  }

  // Monta { equipamentos, conexoes } a partir do CSV e valida com as mesmas regras
  // do JSON. Retorna { ok, dados, erros: [{onde, mensagem}] }; o "onde" aponta a
  // linha do arquivo (ex.: "Linha 7 (OLT-01) › IP").
  function importarCsv(texto) {
    var linhas = lerLinhasCsv(texto);
    if (linhas.length < 2) throw new Error("O CSV precisa de uma linha de cabeçalho e ao menos uma linha de dados.");
    var cabecalho = linhas[0].map(normalizarCabecalhoCsv);
    var coluna = {};
    Object.keys(COLUNAS_CSV).forEach(function (campo) {
      for (var i = 0; i < COLUNAS_CSV[campo].length; i++) {
        var posicao = cabecalho.indexOf(COLUNAS_CSV[campo][i]);
        if (posicao >= 0) { coluna[campo] = posicao; break; }
      }
    });
    if (coluna.origem === undefined) throw new Error('Coluna "origem" não encontrada. Use "Baixar modelo CSV" para ver o formato.');
    function valor(linha, campo) { return coluna[campo] === undefined ? "" : String(linha[coluna[campo]] || "").trim(); }

    var dados = { equipamentos: [], conexoes: [] };
    var erros = [];
    var porNome = {};
    var linhaDoEquipamento = [], linhaDoCabo = [];
    function obterEquipamento(nome, ip, modelo, tipo, rede, numeroLinha) {
      var chave = normalizarTextoEquipamento(nome);
      var eq = porNome[chave];
      if (!eq) {
        eq = { id: novoId(), nome: nome, modelo: "", ip: "", tipo: "", icone: "", imagem: "", corFonte: "#16323D" };
        porNome[chave] = eq;
        linhaDoEquipamento.push(numeroLinha);
        dados.equipamentos.push(eq);
      }
      if (ip) {
        if (!eq.ip) eq.ip = ip;
        else if (eq.ip !== ip) erros.push({ onde: "Linha " + numeroLinha + " (" + nome + ")", mensagem: 'IP "' + ip + '" diferente do informado antes (' + eq.ip + ")" });
      }
      if (modelo && !eq.modelo) eq.modelo = modelo;
      if (tipo && !eq.tipo) eq.tipo = tipo;
      if (rede && !eq.rede) eq.rede = rede;
      return eq;
    }

    for (var n = 1; n < linhas.length; n++) {
      var linha = linhas[n], numeroLinha = n + 1;
      var nomeOrigem = valor(linha, "origem"), nomeDestino = valor(linha, "destino");
      if (!nomeOrigem) { erros.push({ onde: "Linha " + numeroLinha, mensagem: 'coluna "origem" vazia' }); continue; }
      var de = obterEquipamento(nomeOrigem, valor(linha, "ip_origem"), valor(linha, "modelo_origem"), valor(linha, "tipo_origem"), valor(linha, "vlan_origem"), numeroLinha);
      if (!nomeDestino) continue;
      var para = obterEquipamento(nomeDestino, valor(linha, "ip_destino"), valor(linha, "modelo_destino"), valor(linha, "tipo_destino"), valor(linha, "vlan_destino"), numeroLinha);
      if (de === para) { erros.push({ onde: "Linha " + numeroLinha + " (" + nomeOrigem + ")", mensagem: "origem e destino são o mesmo equipamento" }); continue; }
      linhaDoCabo.push(numeroLinha);
      dados.conexoes.push({
        de: de.id, para: para.id, tipo: valor(linha, "tipo") || "Cabo", potencia: valor(linha, "capacidade") || "1G",
        saida: valor(linha, "porta_origem"), chegada: valor(linha, "porta_destino"),
        cor: "#5A7284", grossura: 2, estilo: "solid"
      });
    }
    if (!dados.equipamentos.length && !erros.length) erros.push({ onde: "Arquivo", mensagem: "nenhum equipamento encontrado" });
    // Ícone pelo tipo ou, sem tipo, pelo nome (ex.: "OLT-01" -> ícone de OLT).
    dados.equipamentos.forEach(function (eq) { eq.icone = iconePorTipo(eq.tipo || eq.nome); });

    var nomePorId = {};
    dados.equipamentos.forEach(function (eq) { nomePorId[eq.id] = eq.nome; });
    var resultado = Esquema.validarProjeto(dados, "estrito", {
      descreverEquipamento: function (i, eq) { return "Linha " + linhaDoEquipamento[i] + " (" + String(eq.nome).slice(0, 30) + ")"; },
      descreverConexao: function (i, c) { return "Linha " + linhaDoCabo[i] + " (cabo " + String(nomePorId[c.de]).slice(0, 25) + " → " + String(nomePorId[c.para]).slice(0, 25) + ")"; }
    });
    resultado.erros = erros.concat(resultado.erros);
    resultado.ok = !resultado.erros.length;
    return resultado;
  }

  document.getElementById("arquivoCsv").addEventListener("change", function (event) {
    var arquivo = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      // O Excel em português costuma salvar CSV em Windows-1252, não UTF-8.
      var texto;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(leitor.result); }
      catch (erroUtf8) { texto = new TextDecoder("windows-1252").decode(leitor.result); }
      var resultado;
      try { resultado = importarCsv(texto); }
      catch (erroCsv) { mostrarErro('Não foi possível importar "' + arquivo.name + '".', [{ onde: "CSV", mensagem: erroCsv.message }]); return; }
      if (!resultado.ok) { mostrarErrosDeValidacao('"' + arquivo.name + '"', resultado); return; }
      function aplicar() {
        // O CSV só traz equipamentos e cabos: o tipo de diagrama continua o do projeto.
        if (estado.modo) resultado.dados.modo = estado.modo;
        estado = resultado.dados;
        ajustarNaProximaRenderizacao = true;
        mostrarAvisosDaImportacao('"' + arquivo.name + '"', resultado);
        renderTudo();
        avisar("CSV importado: " + plural(estado.equipamentos.length, "equipamento", "equipamentos") + ", " + plural(estado.conexoes.length, "cabo", "cabos") + ".");
      }
      // Projeto com conteúdo: pergunta antes de substituir (as anotações também saem).
      var anotacoes = (estado.anotacoes || []).length;
      if (!estado.equipamentos.length && !anotacoes) { aplicar(); return; }
      var perde = [plural(estado.equipamentos.length, "equipamento", "equipamentos"), plural(estado.conexoes.length, "cabo", "cabos")]
        .concat(anotacoes ? [plural(anotacoes, "anotação", "anotações")] : []);
      abrirModal({
        title: "Importar CSV",
        message: 'O CSV substitui o projeto aberto "' + projetoAtual + '" (' + perde.join(", ") + "). Dá para voltar com o ↶ (desfazer). Para criar outro projeto, cancele e use o + antes.",
        confirmText: "Substituir",
        cancelText: "Cancelar",
        kind: "confirm"
      }).then(function (ok) { if (ok) aplicar(); });
    };
    leitor.readAsArrayBuffer(arquivo);
  });

  document.getElementById("btnModeloCsv").addEventListener("click", function () {
    // BOM para o Excel abrir os acentos certos.
    baixarBlob(new Blob(["﻿" + MODELO_CSV], { type: "text/csv;charset=utf-8" }), "modelo-grafo.csv");
  });

  document.getElementById("btnAplicarJson").addEventListener("click", function () {
    var novo;
    try { novo = JSON.parse(elJsonAvancado.value); }
    catch (e) { mostrarErro("O texto não é um JSON válido.", [{ onde: "JSON", mensagem: e.message }]); return; }
    if (novo && Array.isArray(novo.equipamentos)) novo.equipamentos.forEach(migrarImagensAntigas);
    var resultado = Esquema.validarProjeto(novo, "estrito");
    if (!resultado.ok) { mostrarErrosDeValidacao("o JSON", resultado); return; }
    estado = resultado.dados;
    ajustarNaProximaRenderizacao = true;
    mostrarAvisosDaImportacao("o JSON", resultado);
    renderTudo();
    avisar("JSON aplicado.");
  });

  // Importação aceita, mas com itens ignorados (ex.: conexão para um equipamento
  // que não existe): lista cada um num aviso que fica até a pessoa fechar.
  function mostrarAvisosDaImportacao(origem, resultado) {
    if (!resultado.ajustes || !resultado.ajustes.length) { esconderErro(); return; }
    mostrarErro("Importado " + origem + ", com " + plural(resultado.ajustes.length, "item ignorado", "itens ignorados") +
      ". O restante entrou normalmente.", resultado.ajustes, { aviso: true });
  }
  document.getElementById("btnAtualizarJson").addEventListener("click", atualizarJsonAvancado);

  function esconderErro() { elErro.style.display = "none"; elErro.textContent = ""; elErro.classList.remove("aviso"); }

  // Aviso rápido no canto (sucesso de exportar, importar, copiar…). Some sozinho;
  // erros continuam no #erro, que fica até a pessoa fechar.
  var elToasts = document.getElementById("toasts");
  function avisar(msg, opcoes) {
    if (!elToasts) return;
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = msg;
    // Ação desfeita direto no aviso (no lugar de perguntar "tem certeza?" antes).
    if (opcoes && opcoes.desfazer) {
      toast.classList.add("com-acao");
      var botao = document.createElement("button");
      botao.type = "button"; botao.className = "toast-acao"; botao.textContent = "Desfazer";
      botao.addEventListener("click", function () { btnDesfazer.click(); toast.remove(); });
      toast.appendChild(botao);
    }
    elToasts.appendChild(toast);
    while (elToasts.children.length > 3) elToasts.removeChild(elToasts.firstChild);
    setTimeout(function () {
      toast.classList.add("saindo");
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 200);
    }, opcoes && opcoes.desfazer ? 6000 : 2800);
  }

  // msg: texto principal. itens (opcional): [{ onde, mensagem }] da validação,
  // listados um por linha para a pessoa achar o problema no arquivo.
  // opcoes.aviso: estilo de aviso (algo foi feito, mas com ressalvas) em vez de erro.
  function mostrarErro(msg, itens, opcoes) {
    var MAX_ITENS = 40;
    elErro.textContent = "";
    elErro.classList.toggle("aviso", !!(opcoes && opcoes.aviso));
    var titulo = document.createElement("div");
    titulo.className = "erro-titulo";
    titulo.textContent = msg;
    elErro.appendChild(titulo);
    if (itens && itens.length) {
      var lista = document.createElement("ul");
      itens.slice(0, MAX_ITENS).forEach(function (item) {
        var li = document.createElement("li");
        var onde = document.createElement("strong");
        onde.textContent = item.onde;
        li.appendChild(onde);
        li.appendChild(document.createTextNode(": " + item.mensagem));
        lista.appendChild(li);
      });
      if (itens.length > MAX_ITENS) {
        var mais = document.createElement("li");
        mais.textContent = "… e mais " + (itens.length - MAX_ITENS) + " problema(s).";
        lista.appendChild(mais);
      }
      elErro.appendChild(lista);
    }
    var fechar = document.createElement("button");
    fechar.type = "button";
    fechar.className = "ghost small erro-fechar";
    fechar.setAttribute("aria-label", "Fechar mensagem");
    fechar.textContent = "×";
    fechar.addEventListener("click", esconderErro);
    elErro.appendChild(fechar);
    elErro.style.display = "block";
  }

  function plural(n, singular, pluralTexto) { return n + " " + (n === 1 ? singular : pluralTexto); }

  // Resultado de GrafoEsquema.validarProjeto recusado: mostra tudo o que está errado.
  function mostrarErrosDeValidacao(origem, resultado) {
    mostrarErro("Não foi possível importar " + origem + ": " + plural(resultado.erros.length, "problema encontrado", "problemas encontrados") +
      ". Nada foi alterado. Corrija o arquivo e tente de novo.", resultado.erros);
  }

  function validarDados(dados) {
    if (!dados || typeof dados !== "object") throw new Error('O JSON precisa ser um objeto com "equipamentos" e "conexoes".');
    if (!Array.isArray(dados.equipamentos) || dados.equipamentos.length === 0) throw new Error('Inclua ao menos um item em "equipamentos".');
    if (!Array.isArray(dados.conexoes)) throw new Error('Inclua a chave "conexoes" como lista (pode ser vazia: []).');
    var ids = {};
    dados.equipamentos.forEach(function (eq, i) {
      if (!eq.id) throw new Error('O equipamento na posição ' + i + ' está sem "id".');
      if (ids[eq.id]) throw new Error('O id "' + eq.id + '" está duplicado.');
      ids[eq.id] = true;
    });
    dados.conexoes.forEach(function (c, i) {
      if (!c.de || !c.para) throw new Error('A conexão na posição ' + i + ' precisa de "de" e "para".');
      if (!ids[c.de] || !ids[c.para]) throw new Error('A conexão na posição ' + i + ' referencia um id inexistente.');
    });
  }

  // ---- Relatório de inventário (.xlsx) ------------------------------------------
  // Abas Resumo, Equipamentos, Cabos e Portas (assets/js/recursos/planilha.js). As portas
  // livres vêm do catálogo de modelos: equipamento sem modelo conhecido lista só
  // as portas que os cabos usam.
  function exportarInventario() {
    if (!window.GrafoPlanilha) { mostrarErro("O gerador de planilha não carregou. Recarregue a página e tente de novo."); return; }
    if (!estado.equipamentos.length) { mostrarErro("Adicione equipamentos antes de gerar o inventário."); return; }
    try {
      var data = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      var abas = window.GrafoPlanilha.montarInventario(projetoAtual, estado, {
        data: data, buscarModelo: function (texto) { return Esquema.buscarModelo(catalogoModelos, texto); }
      });
      var nome = nomeArquivoExportacao("xlsx").replace(/\.xlsx$/, "-inventario.xlsx");
      baixarBlob(new Blob([window.GrafoPlanilha.gerarXlsx(abas)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome);
      avisar("Inventário baixado: " + nome);
    } catch (e) {
      mostrarErro("Não foi possível gerar o inventário.\nDetalhe: " + e.message);
    }
  }
  document.getElementById("btnInventario").addEventListener("click", exportarInventario);

  // ==== 10-desenho-e-ferramentas.js: ferramentas no estilo draw.io (parte de assets/js/editor/app.js; npm run montar) ====
  // - Formas e texto livres (retângulo, elipse, seta, linha, texto) e caneta, por
  //   cima do diagrama, dentro do SVG (saem no PNG, SVG e PDF): estado.desenhos.
  // - Etiqueta de VLAN presa ao cabo e números nas pontas: conexao.vlan, redeVlan,
  //   numSaida, numChegada, etiqueta (deslocamento da etiqueta).
  // - Rota do cabo à mão: clique no cabo e arraste os quadradinhos dos trechos:
  //   conexao.rota (dobras, nas coordenadas do desenho).
  var DESENHO = {
    cores: ["#E5484D", "#3B82F6", "#22C55E", "#F59E0B", "#A855F7", "#111827", "#FFFFFF"],
    espessuras: [2, 4, 7],
    grade: 5
  };
  var ferramentaAtual = "selecionar";
  var estiloDesenho = { cor: DESENHO.cores[0], espessura: 2, tracejado: false, preencher: false, tamanho: 16 };
  var desenhoSelecionado = null;   // id
  var caboSelecionado = null;      // índice em estado.conexoes
  var rotasDesenhadas = {};        // índice do cabo -> pontos da rota desenhada

  function listaDesenhos() { return Array.isArray(estado.desenhos) ? estado.desenhos : []; }
  function novoIdDesenho() { return "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function arred(n) { return Math.round(n * 10) / 10; }
  function naGrade(n) { return Math.round(n / DESENHO.grade) * DESENHO.grade; }

  // Ponto do mouse nas coordenadas do desenho (as mesmas das posições dos equipamentos).
  function pontoNoDesenho(event) {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return null;
    var p = svg.createSVGPoint();
    p.x = event.clientX; p.y = event.clientY;
    var m = grafo.getScreenCTM();
    if (!m) return null;
    var q = p.matrixTransform(m.inverse());
    return { x: arred(q.x), y: arred(q.y) };
  }

  function el(nome, atributos, pai) {
    var e = document.createElementNS(NS_SVG, nome);
    Object.keys(atributos || {}).forEach(function (k) { if (atributos[k] != null) e.setAttribute(k, atributos[k]); });
    if (pai) pai.appendChild(e);
    return e;
  }

  // Salva uma mudança feita pelas ferramentas (vira um passo do desfazer) sem
  // redesenhar o diagrama inteiro: só desenhos, cabos e o que depende deles.
  function confirmarMudanca(cabos) {
    if (!elCanvas.querySelector("svg g.graph")) { renderTudo(); return; }
    if (cabos) { rotearCabosOrtogonalmente(); desenharAlcasDaRota(); }
    desenharDesenhos();
    aplicarCamadas();
    ajustarViewBoxAoConteudo(true);
    salvarLocal();
    atualizarJsonAvancado();
    window.dispatchEvent(new CustomEvent("grafo:render"));
  }

  // Troca só um desenho na tela (durante o arraste), mantendo a ordem.
  function redesenharUm(d) {
    var svg = elCanvas.querySelector("svg");
    var antigo = svg && svg.querySelector('g.desenho[data-desenho="' + d.id + '"]');
    var grupo = antigo ? antigo.parentNode : svg && svg.querySelector("g.camada-desenhos");
    if (!grupo) { desenharDesenhos(); return; }
    var marcador = antigo ? antigo.nextSibling : null;
    if (antigo) antigo.remove();
    desenharUm(grupo, d);
    var novo = grupo.lastChild;
    if (marcador && novo !== marcador) grupo.insertBefore(novo, marcador);
  }

  // ---- Desenhos (formas, texto, caneta) -----------------------------------------
  function caminhoDaCaneta(pontos) {
    if (!pontos || !pontos.length) return "";
    var d = "M" + pontos[0].x + "," + pontos[0].y;
    for (var i = 1; i < pontos.length - 1; i++) {
      var meio = { x: (pontos[i].x + pontos[i + 1].x) / 2, y: (pontos[i].y + pontos[i + 1].y) / 2 };
      d += " Q" + pontos[i].x + "," + pontos[i].y + " " + arred(meio.x) + "," + arred(meio.y);
    }
    var u = pontos[pontos.length - 1];
    return d + " L" + u.x + "," + u.y;
  }

  // Ponta da seta como triângulo próprio (marcadores herdam mal a cor ao exportar).
  function pontaDaSeta(d) {
    var ang = Math.atan2(d.y2 - d.y, d.x2 - d.x), tam = 8 + d.espessura * 2;
    var p1 = { x: d.x2 - tam * Math.cos(ang - 0.45), y: d.y2 - tam * Math.sin(ang - 0.45) };
    var p2 = { x: d.x2 - tam * Math.cos(ang + 0.45), y: d.y2 - tam * Math.sin(ang + 0.45) };
    return [d.x2 + "," + d.y2, arred(p1.x) + "," + arred(p1.y), arred(p2.x) + "," + arred(p2.y)].join(" ");
  }

  function caixaDoDesenho(d) {
    if (d.tipo === "caneta") {
      var xs = (d.pontos || []).map(function (p) { return p.x; }), ys = (d.pontos || []).map(function (p) { return p.y; });
      return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), x2: Math.max.apply(null, xs), y2: Math.max.apply(null, ys) };
    }
    return { x: Math.min(d.x, d.x2 == null ? d.x : d.x2), y: Math.min(d.y, d.y2 == null ? d.y : d.y2), x2: Math.max(d.x, d.x2 == null ? d.x : d.x2), y2: Math.max(d.y, d.y2 == null ? d.y : d.y2) };
  }

  function desenharUm(grupo, d) {
    var g = el("g", { "class": "desenho desenho-" + d.tipo + (d.id === desenhoSelecionado ? " selecionado" : ""), "data-desenho": d.id }, grupo);
    var traco = { stroke: d.cor, "stroke-width": d.espessura, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-dasharray": d.tracejado ? (d.espessura * 3) + " " + (d.espessura * 2.2) : null };
    var c = caixaDoDesenho(d);
    if (d.tipo === "retangulo") el("rect", Object.assign({}, traco, { x: c.x, y: c.y, width: c.x2 - c.x, height: c.y2 - c.y, rx: 4, fill: d.fundo || "none", "fill-opacity": d.fundo ? 0.25 : null }), g);
    else if (d.tipo === "elipse") el("ellipse", Object.assign({}, traco, { cx: (c.x + c.x2) / 2, cy: (c.y + c.y2) / 2, rx: Math.max(1, (c.x2 - c.x) / 2), ry: Math.max(1, (c.y2 - c.y) / 2), fill: d.fundo || "none", "fill-opacity": d.fundo ? 0.25 : null }), g);
    else if (d.tipo === "linha" || d.tipo === "seta") {
      el("line", Object.assign({}, traco, { x1: d.x, y1: d.y, x2: d.x2, y2: d.y2 }), g);
      if (d.tipo === "seta") el("polygon", { points: pontaDaSeta(d), fill: d.cor, stroke: d.cor, "stroke-width": 1, "stroke-linejoin": "round" }, g);
    } else if (d.tipo === "caneta") el("path", Object.assign({}, traco, { d: caminhoDaCaneta(d.pontos) }), g);
    else if (d.tipo === "texto") {
      var tamanho = d.tamanho || 16;
      var t = el("text", { x: d.x, y: d.y + tamanho, fill: d.cor, "font-family": "Helvetica, Arial, sans-serif", "font-size": tamanho, "font-weight": 700 }, g);
      String(d.texto || "").split(/\r?\n/).forEach(function (linha, i) {
        var ts = el("tspan", { x: d.x, dy: i ? tamanho * 1.25 : 0 }, t);
        ts.textContent = linha || " ";
      });
    }
    // Área de toque larga para traços finos.
    if (d.tipo === "linha" || d.tipo === "seta") el("line", { x1: d.x, y1: d.y, x2: d.x2, y2: d.y2, stroke: "transparent", "stroke-width": 14, "class": "desenho-toque" }, g);
    if (d.tipo === "caneta") el("path", { d: caminhoDaCaneta(d.pontos), stroke: "transparent", "stroke-width": 14, fill: "none", "class": "desenho-toque" }, g);
    // Forma sem preenchimento: pega pela borda larga (o miolo continua clicável por baixo).
    if (d.tipo === "retangulo") el("rect", { x: c.x, y: c.y, width: c.x2 - c.x, height: c.y2 - c.y, rx: 4, fill: d.fundo ? "transparent" : "none", stroke: "transparent", "stroke-width": 14, "class": "desenho-toque" }, g);
    if (d.tipo === "elipse") el("ellipse", { cx: (c.x + c.x2) / 2, cy: (c.y + c.y2) / 2, rx: Math.max(1, (c.x2 - c.x) / 2), ry: Math.max(1, (c.y2 - c.y) / 2), fill: d.fundo ? "transparent" : "none", stroke: "transparent", "stroke-width": 14, "class": "desenho-toque" }, g);
    if (d.id === desenhoSelecionado) desenharAlcasDoDesenho(g, d);
    ligarDesenho(g, d);
  }

  function desenharDesenhos() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var antigo = grafo.querySelector("g.camada-desenhos");
    if (antigo) antigo.remove();
    if (desenhoSelecionado && !listaDesenhos().some(function (d) { return d.id === desenhoSelecionado; })) desenhoSelecionado = null;
    var grupo = el("g", { "class": "camada-desenhos" });
    // Abaixo das anotações (que ficam sempre por cima), acima de cabos e equipamentos.
    var primeiraAnotacao = grafo.querySelector("g.anotacao");
    grafo.insertBefore(grupo, primeiraAnotacao || null);
    listaDesenhos().forEach(function (d) { desenharUm(grupo, d); });
    atualizarBarraDeEstilo();
  }

  function desenharAlcasDoDesenho(g, d) {
    var pontos;
    if (d.tipo === "linha" || d.tipo === "seta") pontos = [{ k: "a", x: d.x, y: d.y }, { k: "b", x: d.x2, y: d.y2 }];
    else if (d.tipo === "retangulo" || d.tipo === "elipse") {
      var c = caixaDoDesenho(d);
      pontos = [{ k: "nw", x: c.x, y: c.y }, { k: "ne", x: c.x2, y: c.y }, { k: "sw", x: c.x, y: c.y2 }, { k: "se", x: c.x2, y: c.y2 }];
    } else {
      var cx = caixaDoDesenho(d.tipo === "texto" ? caixaDeTexto(g, d) : d);
      el("rect", { x: cx.x - 4, y: cx.y - 4, width: cx.x2 - cx.x + 8, height: cx.y2 - cx.y + 8, fill: "none", stroke: "#3B82F6", "stroke-width": 1, "stroke-dasharray": "4 3", "class": "desenho-moldura" }, g);
      return;
    }
    pontos.forEach(function (p) {
      var a = el("rect", { x: p.x - 5, y: p.y - 5, width: 10, height: 10, rx: 2, fill: "#FFFFFF", stroke: "#3B82F6", "stroke-width": 1.5, "class": "desenho-alca", "data-alca": p.k }, g);
      a.addEventListener("pointerdown", function (event) { iniciarArrasteDeAlca(event, d, p.k); });
    });
  }

  function caixaDeTexto(g, d) {
    var t = g.querySelector("text");
    try { var b = t.getBBox(); return { tipo: "x", x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height }; } catch (e) { return { tipo: "x", x: d.x, y: d.y, x2: d.x + 60, y2: d.y + 20 }; }
  }

  // Ouvintes na janela (não no elemento): o desenho pode ser recriado durante o
  // arraste sem soltar do mouse. Um quadro por vez (requestAnimationFrame).
  function arrastar(event, mover, soltar) {
    var id = event.pointerId, quadro = 0, ultimo = null;
    document.body.classList.add("arrastando-desenho");
    function aoMover(e) {
      if (e.pointerId !== id) return;
      e.preventDefault();
      ultimo = e;
      if (!quadro) quadro = requestAnimationFrame(function () { quadro = 0; if (ultimo) mover(ultimo); });
    }
    function aoSoltar(e) {
      if (e.pointerId !== id) return;
      if (quadro) { cancelAnimationFrame(quadro); quadro = 0; if (ultimo) mover(ultimo); }
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
      document.body.classList.remove("arrastando-desenho");
      soltar(e);
    }
    window.addEventListener("pointermove", aoMover, { passive: false });
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
  }

  function iniciarArrasteDeAlca(event, d, alca) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      p = { x: naGrade(p.x), y: naGrade(p.y) };
      if (alca === "a") { d.x = p.x; d.y = p.y; }
      else if (alca === "b") { d.x2 = p.x; d.y2 = p.y; }
      else {
        var c = caixaDoDesenho(d);
        if (alca.indexOf("n") >= 0) c.y = p.y; else c.y2 = p.y;
        if (alca.indexOf("w") >= 0) c.x = p.x; else c.x2 = p.x;
        d.x = c.x; d.y = c.y; d.x2 = c.x2; d.y2 = c.y2;
      }
      redesenharUm(d);
    }, function () {
      var c = caixaDoDesenho(d);
      if (d.tipo !== "linha" && d.tipo !== "seta") { d.x = c.x; d.y = c.y; d.x2 = c.x2; d.y2 = c.y2; }
      confirmarMudanca();
    });
  }

  function moverDesenho(d, dx, dy) {
    if (d.tipo === "caneta") d.pontos = d.pontos.map(function (p) { return { x: arred(p.x + dx), y: arred(p.y + dy) }; });
    else { d.x = arred(d.x + dx); d.y = arred(d.y + dy); if (d.x2 != null) { d.x2 = arred(d.x2 + dx); d.y2 = arred(d.y2 + dy); } }
  }

  function ligarDesenho(g, d) {
    g.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      if (ferramentaAtual === "borracha") { event.stopPropagation(); apagarDesenho(d.id); return; }
      if (ferramentaAtual !== "selecionar") return; // desenhando por cima
      if (event.target.classList && event.target.classList.contains("desenho-alca")) return;
      event.stopPropagation();
      var inicio = pontoNoDesenho(event);
      if (!inicio) return;
      var original = JSON.stringify(d), moveu = false;
      selecionarDesenho(d.id);
      arrastar(event, function (e) {
        var p = pontoNoDesenho(e);
        if (!p) return;
        var copia = JSON.parse(original);
        Object.assign(d, copia);
        var dx = naGrade(p.x - inicio.x), dy = naGrade(p.y - inicio.y);
        if (Math.abs(dx) + Math.abs(dy) > 0) moveu = true;
        moverDesenho(d, dx, dy);
        redesenharUm(d);
      }, function () { if (moveu) confirmarMudanca(); });
    });
    g.addEventListener("dblclick", function (event) {
      event.stopPropagation();
      if (d.tipo === "texto") editarTextoDoDesenho(d);
    });
  }

  function selecionarDesenho(id) {
    if (desenhoSelecionado === id) return;
    var anterior = listaDesenhos().find(function (d) { return d.id === desenhoSelecionado; });
    desenhoSelecionado = id;
    if (id && caboSelecionado != null) selecionarCabo(null);
    if (anterior) redesenharUm(anterior);
    var atual = listaDesenhos().find(function (d) { return d.id === id; });
    if (atual) redesenharUm(atual);
    atualizarBarraDeEstilo();
  }

  function apagarDesenho(id) {
    estado.desenhos = listaDesenhos().filter(function (d) { return d.id !== id; });
    if (desenhoSelecionado === id) desenhoSelecionado = null;
    confirmarMudanca();
  }

  async function editarTextoDoDesenho(d, novo) {
    var valor = await abrirModal({ title: novo ? "Novo texto" : "Editar texto", message: "Texto que aparece no diagrama:", kind: "prompt", defaultValue: d.texto || "", confirmText: "Salvar" });
    if (valor == null) { if (novo) apagarDesenho(d.id); return; }
    valor = String(valor).slice(0, LIMITES.textoDesenho || 300);
    if (!valor.trim()) { apagarDesenho(d.id); return; }
    d.texto = valor;
    if (novo && listaDesenhos().indexOf(d) < 0) estado.desenhos = listaDesenhos().concat([d]);
    desenhoSelecionado = d.id;
    confirmarMudanca();
  }

  // ---- Desenhar com as ferramentas ----------------------------------------------
  function limiteDeDesenhos() {
    if (listaDesenhos().length >= (LIMITES.desenhos || 300)) { avisar("Limite de " + (LIMITES.desenhos || 300) + " desenhos por diagrama atingido."); return true; }
    return false;
  }

  function comecarDesenho(event) {
    var inicio = pontoNoDesenho(event);
    if (!inicio) return;
    if (limiteDeDesenhos()) return;
    var base = { id: novoIdDesenho(), cor: estiloDesenho.cor, espessura: estiloDesenho.espessura };
    if (estiloDesenho.tracejado) base.tracejado = true;
    if (ferramentaAtual === "texto") {
      var t = Object.assign(base, { tipo: "texto", x: naGrade(inicio.x), y: naGrade(inicio.y), texto: "", tamanho: estiloDesenho.tamanho });
      editarTextoDoDesenho(t, true);
      return;
    }
    if (ferramentaAtual === "caneta") {
      var traco = Object.assign(base, { tipo: "caneta", x: inicio.x, y: inicio.y, pontos: [inicio] });
      estado.desenhos = listaDesenhos().concat([traco]);
      desenharDesenhos();
      arrastar(event, function (e) {
        var p = pontoNoDesenho(e);
        var u = traco.pontos[traco.pontos.length - 1];
        if (!p || Math.hypot(p.x - u.x, p.y - u.y) < 3 || traco.pontos.length >= (LIMITES.pontosCaneta || 600)) return;
        traco.pontos.push(p);
        redesenharUm(traco);
      }, function () {
        if (traco.pontos.length < 2) traco.pontos.push({ x: inicio.x + 0.5, y: inicio.y + 0.5 });
        confirmarMudanca();
      });
      return;
    }
    var p0 = { x: naGrade(inicio.x), y: naGrade(inicio.y) };
    var forma = Object.assign(base, { tipo: ferramentaAtual, x: p0.x, y: p0.y, x2: p0.x, y2: p0.y });
    if ((ferramentaAtual === "retangulo" || ferramentaAtual === "elipse") && estiloDesenho.preencher) forma.fundo = estiloDesenho.cor;
    estado.desenhos = listaDesenhos().concat([forma]);
    desenharDesenhos();
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      forma.x2 = naGrade(p.x); forma.y2 = naGrade(p.y);
      // Shift: linha reta (0/45/90°) ou forma quadrada.
      if (e.shiftKey) {
        var dx = forma.x2 - forma.x, dy = forma.y2 - forma.y;
        if (forma.tipo === "linha" || forma.tipo === "seta") {
          if (Math.abs(dx) > Math.abs(dy) * 2) forma.y2 = forma.y; else if (Math.abs(dy) > Math.abs(dx) * 2) forma.x2 = forma.x;
          else { var m = Math.max(Math.abs(dx), Math.abs(dy)); forma.x2 = forma.x + Math.sign(dx) * m; forma.y2 = forma.y + Math.sign(dy) * m; }
        } else { var l = Math.max(Math.abs(dx), Math.abs(dy)); forma.x2 = forma.x + Math.sign(dx || 1) * l; forma.y2 = forma.y + Math.sign(dy || 1) * l; }
      }
      redesenharUm(forma);
    }, function () {
      // Clique sem arrastar: tamanho padrão.
      if (Math.abs(forma.x2 - forma.x) < 4 && Math.abs(forma.y2 - forma.y) < 4) {
        forma.x2 = forma.x + (forma.tipo === "linha" || forma.tipo === "seta" ? 80 : 120);
        forma.y2 = forma.y + (forma.tipo === "linha" || forma.tipo === "seta" ? 0 : 60);
      }
      if (forma.tipo !== "linha" && forma.tipo !== "seta") { var c = caixaDoDesenho(forma); forma.x = c.x; forma.y = c.y; forma.x2 = c.x2; forma.y2 = c.y2; }
      desenhoSelecionado = forma.id;
      confirmarMudanca();
      escolherFerramenta("selecionar");
    });
  }

  // Com uma ferramenta de desenho ativa, o clique no canvas desenha em vez de mover a tela.
  elCanvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || event.pointerType === "touch" && event.isPrimary === false) return;
    if (ferramentaAtual === "selecionar") {
      // Clique no vazio tira a seleção do desenho e do cabo.
      if (!event.target.closest || (!event.target.closest("g.desenho") && !event.target.closest("g.edge") && !event.target.closest(".rota-alca"))) {
        if (desenhoSelecionado) { desenhoSelecionado = null; desenharDesenhos(); }
        if (caboSelecionado != null) selecionarCabo(null);
      }
      return;
    }
    if (ferramentaAtual === "borracha") {
      var alvo = event.target.closest && event.target.closest("g.desenho");
      if (alvo) { event.stopPropagation(); apagarDesenho(alvo.getAttribute("data-desenho")); }
      else event.stopPropagation();
      return;
    }
    if (!elCanvas.querySelector("svg g.graph")) { avisar("Adicione equipamentos antes de desenhar."); return; }
    event.stopPropagation();
    event.preventDefault();
    comecarDesenho(event);
  }, true);

  // Borracha arrastando: apaga o que passar por baixo.
  elCanvas.addEventListener("pointermove", function (event) {
    if (ferramentaAtual !== "borracha" || !(event.buttons & 1)) return;
    var alvo = document.elementFromPoint(event.clientX, event.clientY);
    var g = alvo && alvo.closest && alvo.closest("g.desenho");
    if (g) apagarDesenho(g.getAttribute("data-desenho"));
  });

  document.addEventListener("keydown", function (event) {
    var alvo = event.target;
    if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
    if (document.querySelector(".modal-backdrop:not(.hidden)")) return;
    if ((event.key === "Delete" || event.key === "Backspace") && desenhoSelecionado) {
      event.preventDefault(); event.stopImmediatePropagation();
      apagarDesenho(desenhoSelecionado);
      return;
    }
    if (event.key === "Escape" && (ferramentaAtual !== "selecionar" || desenhoSelecionado || caboSelecionado != null)) {
      escolherFerramenta("selecionar");
      desenhoSelecionado = null;
      selecionarCabo(null);
      desenharDesenhos();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var atalho = { v: "selecionar", t: "texto", r: "retangulo", e: "elipse", a: "seta", l: "linha", p: "caneta", b: "borracha" }[event.key.toLowerCase()];
    if (atalho && document.body.getAttribute("data-vista") !== "inicio" && caixaFerramentas && !caixaFerramentas.hidden) {
      event.preventDefault();
      escolherFerramenta(atalho);
    }
  }, true);

  // ---- Caixa de ferramentas e barra de estilo -----------------------------------
  var FERRAMENTAS = [
    ["selecionar", "Selecionar e mover (V)", '<path d="M5 3l14 8-6 1.5L10 19z"/>'],
    ["texto", "Texto (T)", '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
    ["retangulo", "Retângulo (R)", '<rect x="4" y="6" width="16" height="12" rx="2"/>'],
    ["elipse", "Elipse (E)", '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>'],
    ["seta", "Seta (A)", '<path d="M5 19L19 5M10 5h9v9"/>'],
    ["linha", "Linha (L)", '<path d="M5 19L19 5"/>'],
    ["caneta", "Caneta (P)", '<path d="M4 20c3-1 4-4 7-7l5-5 3 3-5 5c-3 3-6 4-7 7z"/><path d="M14 7l3 3"/>'],
    ["borracha", "Borracha (B): clique ou arraste sobre o desenho", '<path d="M7 20h11M5 15l8-8 6 6-5 5H9z"/>']
  ];
  var caixaFerramentas = null, barraEstilo = null;

  function svgIcone(conteudo) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + conteudo + "</svg>";
  }

  function criarCaixaDeFerramentas() {
    var area = elCanvas.parentNode;
    if (!area || document.getElementById("caixaFerramentas")) return;
    caixaFerramentas = document.createElement("div");
    caixaFerramentas.id = "caixaFerramentas";
    caixaFerramentas.className = "caixa-ferramentas";
    caixaFerramentas.setAttribute("role", "toolbar");
    caixaFerramentas.setAttribute("aria-label", "Ferramentas de desenho");
    caixaFerramentas.innerHTML = FERRAMENTAS.map(function (f) {
      return '<button type="button" class="ferramenta-desenho" data-ferramenta="' + f[0] + '" title="' + f[1] + '" aria-label="' + f[1] + '" aria-pressed="' + (f[0] === ferramentaAtual) + '">' + svgIcone(f[2]) + "</button>";
    }).join("");
    area.appendChild(caixaFerramentas);
    caixaFerramentas.addEventListener("click", function (event) {
      var b = event.target.closest("[data-ferramenta]");
      if (b) escolherFerramenta(b.getAttribute("data-ferramenta"));
    });
    caixaFerramentas.addEventListener("pointerdown", function (event) { event.stopPropagation(); });

    barraEstilo = document.createElement("div");
    barraEstilo.className = "barra-estilo-desenho";
    barraEstilo.hidden = true;
    barraEstilo.innerHTML =
      '<div class="be-grupo" data-be="cores">' + DESENHO.cores.map(function (c) { return '<button type="button" class="be-cor" data-cor="' + c + '" style="--c:' + c + '" title="Cor ' + c + '" aria-label="Cor ' + c + '"></button>'; }).join("") + "</div>" +
      '<div class="be-grupo" data-be="espessura">' + DESENHO.espessuras.map(function (e, i) { return '<button type="button" class="be-esp" data-esp="' + e + '" title="' + ["Fina", "Média", "Grossa"][i] + '"><span style="height:' + e + 'px"></span></button>'; }).join("") + "</div>" +
      '<div class="be-grupo"><button type="button" class="be-alt" data-be-alt="tracejado" title="Tracejado">┄</button><button type="button" class="be-alt" data-be-alt="preencher" title="Preencher a forma">◼</button></div>' +
      '<div class="be-grupo" data-be="texto"><button type="button" class="be-alt" data-be-tam="-2" title="Texto menor">A−</button><button type="button" class="be-alt" data-be-tam="2" title="Texto maior">A+</button></div>' +
      '<div class="be-grupo" data-be="cabo"><span class="be-dica">Arraste os quadradinhos para mudar o caminho</span><button type="button" class="be-alt be-texto" data-be-acao="rota-auto">Rota automática</button></div>' +
      '<div class="be-grupo"><button type="button" class="be-alt be-perigo" data-be-acao="excluir" title="Excluir (Delete)">Excluir</button></div>';
    area.appendChild(barraEstilo);
    barraEstilo.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    barraEstilo.addEventListener("click", aoClicarNaBarraDeEstilo);
    atualizarBarraDeEstilo();
  }

  function escolherFerramenta(nome) {
    ferramentaAtual = nome;
    document.body.setAttribute("data-ferramenta-ativa", nome);
    if (caixaFerramentas) caixaFerramentas.querySelectorAll("[data-ferramenta]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-ferramenta") === nome)); });
    if (nome !== "selecionar") { selecionarCabo(null); }
    atualizarBarraDeEstilo();
  }

  function desenhoAtual() { return listaDesenhos().find(function (d) { return d.id === desenhoSelecionado; }) || null; }

  function atualizarBarraDeEstilo() {
    if (!barraEstilo) return;
    var d = desenhoAtual();
    var desenhando = ["texto", "retangulo", "elipse", "seta", "linha", "caneta"].indexOf(ferramentaAtual) >= 0;
    var cabo = caboSelecionado != null && estado.conexoes[caboSelecionado];
    barraEstilo.hidden = !(d || desenhando || cabo);
    if (barraEstilo.hidden) return;
    var tipo = d ? d.tipo : ferramentaAtual;
    var mostrar = function (qual, sim) { var g = barraEstilo.querySelector('[data-be="' + qual + '"]'); if (g) g.hidden = !sim; };
    var deDesenho = !!(d || desenhando);
    barraEstilo.querySelectorAll(".be-grupo").forEach(function (g) { g.hidden = false; });
    mostrar("cores", deDesenho);
    mostrar("espessura", deDesenho && tipo !== "texto");
    mostrar("texto", deDesenho && tipo === "texto");
    mostrar("cabo", !!cabo && !deDesenho);
    var alt = barraEstilo.querySelector('[data-be-alt="tracejado"]').parentNode;
    alt.hidden = !deDesenho || tipo === "texto";
    barraEstilo.querySelector('[data-be-alt="preencher"]').hidden = !(tipo === "retangulo" || tipo === "elipse");
    barraEstilo.querySelector('[data-be-acao="excluir"]').parentNode.hidden = !d;
    var cor = d ? d.cor : estiloDesenho.cor, esp = d ? d.espessura : estiloDesenho.espessura;
    barraEstilo.querySelectorAll("[data-cor]").forEach(function (b) { b.classList.toggle("ativo", b.getAttribute("data-cor").toUpperCase() === String(cor).toUpperCase()); });
    barraEstilo.querySelectorAll("[data-esp]").forEach(function (b) { b.classList.toggle("ativo", Number(b.getAttribute("data-esp")) === Number(esp)); });
    barraEstilo.querySelector('[data-be-alt="tracejado"]').classList.toggle("ativo", d ? !!d.tracejado : estiloDesenho.tracejado);
    barraEstilo.querySelector('[data-be-alt="preencher"]').classList.toggle("ativo", d ? !!d.fundo : estiloDesenho.preencher);
  }

  function aoClicarNaBarraDeEstilo(event) {
    var b = event.target.closest("button");
    if (!b) return;
    var d = desenhoAtual();
    if (b.hasAttribute("data-cor")) {
      estiloDesenho.cor = b.getAttribute("data-cor");
      if (d) { d.cor = estiloDesenho.cor; if (d.fundo) d.fundo = d.cor; confirmarMudanca(); }
    } else if (b.hasAttribute("data-esp")) {
      estiloDesenho.espessura = Number(b.getAttribute("data-esp"));
      if (d) { d.espessura = estiloDesenho.espessura; confirmarMudanca(); }
    } else if (b.getAttribute("data-be-alt") === "tracejado") {
      estiloDesenho.tracejado = d ? !d.tracejado : !estiloDesenho.tracejado;
      if (d) { if (estiloDesenho.tracejado) d.tracejado = true; else delete d.tracejado; confirmarMudanca(); }
    } else if (b.getAttribute("data-be-alt") === "preencher") {
      estiloDesenho.preencher = d ? !d.fundo : !estiloDesenho.preencher;
      if (d) { if (estiloDesenho.preencher) d.fundo = d.cor; else delete d.fundo; confirmarMudanca(); }
    } else if (b.hasAttribute("data-be-tam")) {
      var novo = Math.max(8, Math.min(72, ((d && d.tamanho) || estiloDesenho.tamanho) + Number(b.getAttribute("data-be-tam"))));
      estiloDesenho.tamanho = novo;
      if (d) { d.tamanho = novo; confirmarMudanca(); }
    } else if (b.getAttribute("data-be-acao") === "excluir" && d) apagarDesenho(d.id);
    else if (b.getAttribute("data-be-acao") === "rota-auto" && caboSelecionado != null) {
      var c = estado.conexoes[caboSelecionado];
      if (c) { delete c.rota; confirmarMudanca(true); avisar("O cabo voltou para a rota automática."); }
    }
    atualizarBarraDeEstilo();
  }

  // ---- Etiqueta de VLAN e números nas pontas do cabo ---------------------------
  function pontoAoLongo(pts, distancia, doFim) {
    var lista = doFim ? pts.slice().reverse() : pts;
    var resto = distancia;
    for (var i = 1; i < lista.length; i++) {
      var a = lista[i - 1], b = lista[i], comp = Math.hypot(b.x - a.x, b.y - a.y);
      if (comp >= resto || i === lista.length - 1) {
        var t = comp ? Math.min(1, resto / comp) : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, horizontal: Math.abs(a.y - b.y) < 0.5 };
      }
      resto -= comp;
    }
    return { x: lista[0].x, y: lista[0].y, horizontal: true };
  }

  function meioDaRota(pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return pontoAoLongo(pts, total / 2);
  }

  function desenharExtrasDoCabo(aresta, pts, conexao) {
    aresta.querySelectorAll(".cabo-extra").forEach(function (e) { e.remove(); });
    if (!pts || pts.length < 2) return;
    [["numSaida", false], ["numChegada", true]].forEach(function (par) {
      var valor = String(conexao[par[0]] || "").trim();
      if (!valor) return;
      var p = pontoAoLongo(pts, 26, par[1]);
      var t = el("text", { "class": "cabo-extra cabo-num", x: arred(p.x + (p.horizontal ? 0 : 6)), y: arred(p.y + (p.horizontal ? -5 : 4)), "text-anchor": p.horizontal ? "middle" : "start",
        "font-family": "Helvetica, Arial, sans-serif", "font-size": 10, "font-weight": 700, fill: "#14212B", stroke: "#FFFFFF", "stroke-width": 3, "paint-order": "stroke" }, aresta);
      t.textContent = valor;
    });
    var vlan = String(conexao.vlan || "").trim(), rede = String(conexao.redeVlan || "").trim();
    if (!vlan && !rede) return;
    var meio = meioDaRota(pts);
    var desloc = conexao.etiqueta || { x: meio.horizontal ? 0 : 46, y: meio.horizontal ? -32 : 0 };
    var cx = meio.x + desloc.x, cy = meio.y + desloc.y;
    var g = el("g", { "class": "cabo-extra cabo-etiqueta" }, aresta);
    el("line", { x1: arred(meio.x), y1: arred(meio.y), x2: arred(cx), y2: arred(cy), stroke: "#D6336C", "stroke-width": 1, "stroke-dasharray": "3 2", "class": "cabo-etiqueta-guia" }, g);
    var linhas = [vlan ? "VLAN " + vlan.replace(/^vlan\s*/i, "") : "", rede].filter(Boolean);
    var rect = el("rect", { rx: 3, fill: "#F8C9D4", stroke: "#D6336C", "stroke-width": 1 }, g);
    var texto = el("text", { "font-family": "Helvetica, Arial, sans-serif", "font-size": 9.5, fill: "#3A0E1C", "text-anchor": "middle" }, g);
    linhas.forEach(function (l, i) { var ts = el("tspan", { x: arred(cx), y: arred(cy + 3.5 + (i - (linhas.length - 1) / 2) * 12) }, texto); ts.textContent = l; });
    var largura = 90;
    try { largura = Math.max(60, texto.getBBox().width + 14); } catch (e) {}
    var altura = linhas.length * 12 + 8;
    rect.setAttribute("x", arred(cx - largura / 2)); rect.setAttribute("y", arred(cy - altura / 2));
    rect.setAttribute("width", arred(largura)); rect.setAttribute("height", altura);
    // Arrastar a etiqueta: ela continua presa ao cabo (a guia tracejada mostra a qual).
    g.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || ferramentaAtual !== "selecionar") return;
      event.stopPropagation();
      var inicio = pontoNoDesenho(event), base = { x: desloc.x, y: desloc.y }, moveu = false;
      if (!inicio) return;
      arrastar(event, function (e) {
        var p = pontoNoDesenho(e);
        if (!p) return;
        conexao.etiqueta = { x: arred(base.x + p.x - inicio.x), y: arred(base.y + p.y - inicio.y) };
        moveu = true;
        desenharExtrasDoCabo(aresta, pts, conexao);
      }, function () { if (moveu) confirmarMudanca(true); });
    });
    g.addEventListener("dblclick", function (event) { event.stopPropagation(); abrirEditorCabo(conexao); });
  }

  // ---- Rota do cabo à mão -------------------------------------------------------
  // Liga os pontos com trechos retos (horizontal ou vertical), dobrando onde precisa.
  function ortogonalizar(pontos) {
    var saida = [pontos[0]];
    for (var i = 1; i < pontos.length; i++) {
      var a = saida[saida.length - 1], b = pontos[i];
      if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
        // Dobra que mantém a direção do trecho anterior.
        var anterior = saida[saida.length - 2];
        var vinhaHorizontal = anterior ? Math.abs(anterior.y - a.y) < 0.5 : true;
        saida.push(vinhaHorizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      }
      saida.push(b);
    }
    return saida;
  }

  function limparPontos(pontos) {
    var p = pontos.filter(function (q, i) { var a = pontos[i - 1]; return !a || Math.abs(a.x - q.x) > 0.5 || Math.abs(a.y - q.y) > 0.5; });
    // Tira pontos no meio de um trecho reto.
    return p.filter(function (q, i) {
      if (i === 0 || i === p.length - 1) return true;
      var a = p[i - 1], b = p[i + 1];
      return !((Math.abs(a.x - q.x) < 0.5 && Math.abs(q.x - b.x) < 0.5) || (Math.abs(a.y - q.y) < 0.5 && Math.abs(q.y - b.y) < 0.5));
    });
  }

  // A rota guarda as duas pontas de quando foi feita. Se um equipamento mudou de
  // lugar (arrastar, Organizar), ela não vale mais: o cabo volta para a rota
  // automática em vez de dar voltas pelo desenho. Retorna null nesse caso.
  var TOLERANCIA_PONTA = 30;
  function rotaManualDoCabo(s, e, rota) {
    if (!Array.isArray(rota) || rota.length < 3) return null;
    var a = rota[0], b = rota[rota.length - 1];
    if (Math.hypot(a.x - s.x, a.y - s.y) > TOLERANCIA_PONTA || Math.hypot(b.x - e.x, b.y - e.y) > TOLERANCIA_PONTA) return null;
    var meio = rota.slice(1, -1).map(function (p) { return { x: p.x, y: p.y }; });
    return limparPontos(ortogonalizar([s].concat(meio, [e])));
  }

  // Depois de Organizar: rotas à mão saem, e notas e desenhos vêm para logo
  // abaixo dos equipamentos (senão ficam longe e o zoom vai lá embaixo).
  function arrumarDepoisDeOrganizar() {
    estado.conexoes.forEach(function (c) { delete c.rota; delete c.etiqueta; });
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    var m = grafo && grafo.getScreenCTM();
    if (!m) return false;
    var inv = m.inverse(), caixa = null;
    svg.querySelectorAll("g.node").forEach(function (no) {
      var r = no.getBoundingClientRect();
      [[r.left, r.top], [r.right, r.bottom]].forEach(function (c) {
        var q = svg.createSVGPoint(); q.x = c[0]; q.y = c[1];
        var t = q.matrixTransform(inv);
        if (!caixa) caixa = { x: t.x, y: t.y, x2: t.x, y2: t.y };
        caixa.x = Math.min(caixa.x, t.x); caixa.y = Math.min(caixa.y, t.y);
        caixa.x2 = Math.max(caixa.x2, t.x); caixa.y2 = Math.max(caixa.y2, t.y);
      });
    });
    if (!caixa) return false;
    var mudou = false, y = caixa.y2 + 50;
    var longe = function (b) { return b.x2 < caixa.x - 200 || b.x > caixa.x2 + 200 || b.y2 < caixa.y - 200 || b.y > caixa.y2 + 200; };
    (estado.anotacoes || []).forEach(function (a) {
      if (!longe({ x: a.x, y: a.y, x2: a.x + 200, y2: a.y + 40 })) return;
      a.x = Math.round(caixa.x); a.y = Math.round(y); y += 60; mudou = true;
    });
    var desenhos = listaDesenhos();
    if (desenhos.length) {
      var bd = null;
      desenhos.forEach(function (d) { var b = caixaDoDesenho(d); bd = bd ? { x: Math.min(bd.x, b.x), y: Math.min(bd.y, b.y), x2: Math.max(bd.x2, b.x2), y2: Math.max(bd.y2, b.y2) } : b; });
      if (bd && longe(bd)) {
        var dx = caixa.x - bd.x, dy = y + 10 - bd.y;
        desenhos.forEach(function (d) { moverDesenho(d, dx, dy); });
        mudou = true;
      }
    }
    return mudou;
  }

  function selecionarCabo(indice) {
    caboSelecionado = indice;
    var svg = elCanvas.querySelector("svg");
    if (svg) {
      svg.querySelectorAll("g.edge.cabo-selecionado").forEach(function (a) { a.classList.remove("cabo-selecionado"); });
      if (indice != null) { var a = svg.querySelector('g.edge[id="edge_' + indice + '"]'); if (a) a.classList.add("cabo-selecionado"); }
    }
    if (indice != null && desenhoSelecionado) { desenhoSelecionado = null; desenharDesenhos(); }
    desenharAlcasDaRota();
    atualizarBarraDeEstilo();
  }

  function desenharAlcasDaRota() {
    var svg = elCanvas.querySelector("svg");
    var grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    grafo.querySelectorAll("g.rota-alcas").forEach(function (g) { g.remove(); });
    var pts = caboSelecionado != null ? rotasDesenhadas[caboSelecionado] : null;
    if (!pts) return;
    var g = el("g", { "class": "rota-alcas" }, grafo);
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 16) continue;
      var horizontal = Math.abs(a.y - b.y) < 0.5;
      var alca = el("rect", { x: arred((a.x + b.x) / 2 - 6), y: arred((a.y + b.y) / 2 - 6), width: 12, height: 12, rx: 3,
        "class": "rota-alca " + (horizontal ? "rota-h" : "rota-v"), "data-trecho": i }, g);
      alca.addEventListener("pointerdown", iniciarArrasteDeTrecho);
      alca.addEventListener("dblclick", function (event) { event.stopPropagation(); var c = estado.conexoes[caboSelecionado]; if (c) abrirEditorCabo(c); });
    }
  }

  // Arrastar o trecho k do cabo para os lados (como no draw.io). Trecho preso a
  // uma porta ganha uma dobra perto dela para continuar saindo reto.
  function iniciarArrasteDeTrecho(event) {
    if (event.button !== 0 || caboSelecionado == null) return;
    event.stopPropagation();
    event.preventDefault();
    var indice = caboSelecionado, conexao = estado.conexoes[indice];
    var P = (rotasDesenhadas[indice] || []).map(function (p) { return { x: p.x, y: p.y }; });
    var k = Number(event.currentTarget.getAttribute("data-trecho"));
    if (!conexao || P.length < 2 || !(k >= 0)) return;
    var horizontal = Math.abs(P[k].y - P[k + 1].y) < 0.5;
    function toco(de, para) {
      var comp = Math.hypot(para.x - de.x, para.y - de.y) || 1, d = Math.min(20, comp / 3);
      return { x: arred(de.x + (para.x - de.x) / comp * d), y: arred(de.y + (para.y - de.y) / comp * d) };
    }
    if (k + 1 === P.length - 1) { var m2 = toco(P[k + 1], P[k]); P.splice(k + 1, 0, { x: m2.x, y: m2.y }, { x: m2.x, y: m2.y }); }
    if (k === 0) { var m1 = toco(P[0], P[1]); P.splice(1, 0, { x: m1.x, y: m1.y }, { x: m1.x, y: m1.y }); k += 2; }
    var moveu = false;
    var svg = elCanvas.querySelector("svg");
    var aresta = svg && svg.querySelector('g.edge[id="edge_' + indice + '"]');
    var caminho = aresta && aresta.querySelector("path");
    var alcaArrastada = event.currentTarget;
    // Só a alça arrastada fica visível; o cabo é redesenhado sozinho (sem rotear os outros).
    if (svg) svg.querySelectorAll(".rota-alca").forEach(function (a) { if (a !== alcaArrastada) a.style.display = "none"; });
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      if (horizontal) { P[k].y = naGrade(p.y); P[k + 1].y = naGrade(p.y); }
      else { P[k].x = naGrade(p.x); P[k + 1].x = naGrade(p.x); }
      moveu = true;
      var pts = limparPontos(P.map(function (q) { return { x: q.x, y: q.y }; }));
      if (caminho) caminho.setAttribute("d", caminhoOrtogonalArredondado(pts));
      if (aresta) desenharExtrasDoCabo(aresta, pts, conexao);
      alcaArrastada.setAttribute("x", arred((P[k].x + P[k + 1].x) / 2 - 6));
      alcaArrastada.setAttribute("y", arred((P[k].y + P[k + 1].y) / 2 - 6));
    }, function () {
      if (!moveu) { desenharAlcasDaRota(); return; }
      var limpa = limparPontos(P.map(function (q) { return { x: q.x, y: q.y }; }));
      conexao.rota = limpa.slice(0, LIMITES.pontosRota || 40);
      confirmarMudanca(true);
    });
  }

  // Clique no cabo seleciona (alças da rota e barra com "Rota automática").
  function ativarSelecaoDosCabos() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var m = /^edge_(\d+)$/.exec(aresta.id || "");
      if (!m) return;
      aresta.addEventListener("click", function (event) {
        if (ferramentaAtual !== "selecionar") return;
        if (event.target.closest && event.target.closest(".cabo-etiqueta")) return;
        event.stopPropagation();
        selecionarCabo(Number(m[1]));
      });
    });
    if (caboSelecionado != null && !estado.conexoes[caboSelecionado]) caboSelecionado = null;
    selecionarCabo(caboSelecionado);
  }

  // ---- Biblioteca de equipamentos (como as formas do draw.io) -------------------
  // Clique num item: entra no centro da tela. Arrastar: entra onde soltar.
  var bibliotecaEquip = null, entradasSeguidas = 0;

  function nomeLivre(tipo) {
    var usados = {};
    estado.equipamentos.forEach(function (eq) { usados[String(eq.nome || "").toLowerCase()] = true; });
    for (var n = 1; ; n++) { var nome = (tipo || "Equipamento") + " " + n; if (!usados[nome.toLowerCase()]) return nome.slice(0, 60); }
  }

  function adicionarEquipamentoEm(tipo, icone, ponto) {
    var limite = limiteAtingido("equipamento");
    if (limite) { avisar(limite); return null; }
    var v = Esquema.validarEquipamento({ id: novoId(), nome: nomeLivre(tipo), tipo: tipo, icone: icone || iconePorTipo(tipo), imagem: "", corFonte: "#16323D", status: "ativo" });
    if (!v.ok) { avisar(textoDosErros(v.erros)); return null; }
    var eq = v.dados;
    if (ponto) eq.posicao = { x: Math.round(ponto.x), y: Math.round(ponto.y) };
    estado.equipamentos.push(eq);
    renderTudo();
    if (typeof renderSidebarPanels === "function") renderSidebarPanels();
    avisar(eq.nome + " adicionado. Duplo clique nele para editar o nome, IP e portas.");
    return eq;
  }

  function pontoParaNovo() {
    var c = centroVisivelNoDesenho();
    var passo = (entradasSeguidas++ % 6) * 40;
    return { x: c.x + passo, y: c.y + passo };
  }

  function tiposParaBiblioteca() {
    var lista = (typeof catalogoTiposEquipamentos !== "undefined" ? catalogoTiposEquipamentos : []).filter(function (t) { return t && t.nome; });
    var vistos = {}, icones = {};
    return lista.filter(function (t) {
      if (t.apelido) return false; // outro nome para um símbolo que já está na lista
      var k = normalizarTextoEquipamento(t.nome), ic = String(t.icone || "");
      if (vistos[k] || (ic && icones[ic] && !/CX\.png$/i.test(ic))) return false; // CTO e CX usam o mesmo desenho, de propósito
      vistos[k] = true; if (ic) icones[ic] = true;
      return true;
    });
  }

  function criarBibliotecaDeEquipamentos() {
    if (!caixaFerramentas || document.getElementById("bibliotecaEquip")) return;
    var botao = document.createElement("button");
    botao.type = "button";
    botao.className = "ferramenta-desenho ferramenta-equip";
    botao.id = "btnBibliotecaEquip";
    botao.title = "Equipamentos: clique para adicionar, ou arraste para o diagrama";
    botao.setAttribute("aria-label", botao.title);
    botao.setAttribute("aria-expanded", "false");
    botao.innerHTML = svgIcone('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10M12 16v4M9 10h6M12 7v6"/>');
    caixaFerramentas.insertBefore(botao, caixaFerramentas.firstChild);
    var sep = document.createElement("span");
    sep.className = "ferramentas-sep";
    caixaFerramentas.insertBefore(sep, botao.nextSibling);

    bibliotecaEquip = document.createElement("div");
    bibliotecaEquip.id = "bibliotecaEquip";
    bibliotecaEquip.className = "biblioteca-equip painel-flutuante";
    bibliotecaEquip.hidden = true;
    bibliotecaEquip.setAttribute("role", "dialog");
    bibliotecaEquip.setAttribute("aria-label", "Equipamentos");
    bibliotecaEquip.innerHTML = '<div class="be-topo"><strong>Equipamentos</strong><span>clique ou arraste</span></div>' +
      '<input type="search" class="be-busca" placeholder="Buscar (OLT, switch...)" aria-label="Buscar equipamento">' +
      '<div class="be-grade"></div>';
    document.body.appendChild(bibliotecaEquip);
    bibliotecaEquip.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    var busca = bibliotecaEquip.querySelector(".be-busca"), grade = bibliotecaEquip.querySelector(".be-grade");

    function montar() {
      var termo = busca.value.trim().toLowerCase();
      var tipos = tiposParaBiblioteca().filter(function (t) { return !termo || t.nome.toLowerCase().indexOf(termo) >= 0; });
      // O que começa com o termo vem primeiro ("olt" acha OLT antes de Volt).
      if (termo) tipos.sort(function (x, y) { return x.nome.toLowerCase().indexOf(termo) - y.nome.toLowerCase().indexOf(termo) || x.nome.localeCompare(y.nome); });
      grade.innerHTML = tipos.map(function (t) {
        var icone = t.icone || iconePorTipo(t.nome);
        return '<button type="button" class="be-item" draggable="true" data-tipo="' + escaparHtml(t.nome) + '" data-icone="' + escaparHtml(icone || "") + '" title="' + escaparHtml(t.nome) + '">' +
          '<span class="be-icone">' + (icone ? '<img src="' + escaparHtml(icone) + '" alt="" draggable="false">' : "") + '</span><span class="be-nome">' + escaparHtml(t.nome) + "</span></button>";
      }).join("") || '<p class="be-vazio">Nada encontrado.</p>';
    }
    function abrir(sim) {
      if (!sim && bibliotecaEquip.contains(document.activeElement)) document.activeElement.blur();
      bibliotecaEquip.hidden = !sim;
      botao.setAttribute("aria-pressed", String(sim));
      botao.setAttribute("aria-expanded", String(sim));
      if (sim) {
        busca.value = ""; montar();
        if (window.innerWidth > 760) posicionarAoLado(bibliotecaEquip, caixaFerramentas, elCanvas.getBoundingClientRect());
        busca.focus();
      }
    }
    botao.addEventListener("click", function (event) { event.stopPropagation(); abrir(bibliotecaEquip.hidden); });
    busca.addEventListener("input", montar);
    busca.addEventListener("keydown", function (event) {
      if (event.key === "Escape") abrir(false);
      if (event.key === "Enter") { var primeiro = grade.querySelector(".be-item"); if (primeiro) primeiro.click(); }
    });
    grade.addEventListener("click", function (event) {
      var item = event.target.closest(".be-item");
      if (!item) return;
      if (!elCanvas.querySelector("svg g.graph") && estado.equipamentos.length) return;
      adicionarEquipamentoEm(item.getAttribute("data-tipo"), item.getAttribute("data-icone"), estado.equipamentos.length ? pontoParaNovo() : null);
    });
    grade.addEventListener("dragstart", function (event) {
      var item = event.target.closest(".be-item");
      if (!item) return;
      event.dataTransfer.setData("application/x-grafo-equip", JSON.stringify({ tipo: item.getAttribute("data-tipo"), icone: item.getAttribute("data-icone") }));
      event.dataTransfer.setData("text/plain", item.getAttribute("data-tipo"));
      event.dataTransfer.effectAllowed = "copy";
    });
    elCanvas.addEventListener("dragover", function (event) {
      if (Array.prototype.indexOf.call(event.dataTransfer.types || [], "application/x-grafo-equip") < 0) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      elCanvas.classList.add("recebendo-equip");
    });
    elCanvas.addEventListener("dragleave", function () { elCanvas.classList.remove("recebendo-equip"); });
    elCanvas.addEventListener("drop", function (event) {
      var bruto = event.dataTransfer.getData("application/x-grafo-equip");
      elCanvas.classList.remove("recebendo-equip");
      if (!bruto) return;
      event.preventDefault();
      var dado = JSON.parse(bruto);
      adicionarEquipamentoEm(dado.tipo, dado.icone, pontoNoDesenho(event));
    });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !bibliotecaEquip.hidden) abrir(false); });
    document.addEventListener("pointerdown", function (event) {
      if (!bibliotecaEquip.hidden && !bibliotecaEquip.contains(event.target) && event.target !== botao && !botao.contains(event.target)) abrir(false);
    });
  }

  // ---- Ligar dois equipamentos com o mouse (como no draw.io) ---------------------
  // Passar o mouse num equipamento mostra 4 bolinhas; arrastar de uma até outro
  // equipamento cria o cabo e abre o editor para preencher as portas.
  var ligacao = { no: null, timer: 0 };

  function caixaNoDesenho(elemento) {
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    var m = grafo && grafo.getScreenCTM();
    if (!m) return null;
    var inv = m.inverse(), r = elemento.getBoundingClientRect(), pts = [[r.left, r.top], [r.right, r.bottom]].map(function (c) {
      var q = svg.createSVGPoint(); q.x = c[0]; q.y = c[1]; return q.matrixTransform(inv);
    });
    return { x: pts[0].x, y: pts[0].y, x2: pts[1].x, y2: pts[1].y };
  }

  function esconderBolinhas() {
    var g = elCanvas.querySelector("g.ligar-alcas");
    if (g) g.remove();
    ligacao.no = null;
  }

  function mostrarBolinhas(no) {
    if (ferramentaAtual !== "selecionar" || arrastandoEquipamento || document.body.classList.contains("arrastando-desenho")) return;
    if (ligacao.no === no) return;
    esconderBolinhas();
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    var c = caixaNoDesenho(no);
    if (!grafo || !c) return;
    ligacao.no = no;
    var g = el("g", { "class": "ligar-alcas" }, grafo);
    var cx = (c.x + c.x2) / 2, cy = (c.y + c.y2) / 2, folga = 12;
    [[cx, c.y - folga], [c.x2 + folga, cy], [cx, c.y2 + folga], [c.x - folga, cy]].forEach(function (p) {
      var b = el("g", { "class": "ligar-bolinha", transform: "translate(" + arred(p[0]) + "," + arred(p[1]) + ")" }, g);
      el("circle", { r: 7 }, b);
      el("path", { d: "M-3.5 0H3.5M0 -3.5V3.5" }, b);
      b.addEventListener("pointerdown", function (event) { iniciarLigacao(event, no, { x: p[0], y: p[1] }); });
    });
    g.addEventListener("pointerenter", function () { clearTimeout(ligacao.timer); });
    g.addEventListener("pointerleave", function () { agendarEsconder(); });
  }

  function agendarEsconder() {
    clearTimeout(ligacao.timer);
    ligacao.timer = setTimeout(esconderBolinhas, 350);
  }

  function iniciarLigacao(event, noOrigem, inicio) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    clearTimeout(ligacao.timer);
    var origem = idEquipamentoDoNode(noOrigem);
    var svg = elCanvas.querySelector("svg"), grafo = svg.querySelector("g.graph");
    var linha = el("path", { "class": "ligar-linha", d: "" }, grafo);
    var alvo = null;
    function marcarAlvo(no) {
      if (alvo === no) return;
      if (alvo) alvo.classList.remove("ligar-alvo");
      alvo = no;
      if (alvo) alvo.classList.add("ligar-alvo");
    }
    arrastar(event, function (e) {
      var p = pontoNoDesenho(e);
      if (!p) return;
      var meioX = arred((inicio.x + p.x) / 2);
      linha.setAttribute("d", "M" + arred(inicio.x) + "," + arred(inicio.y) + " H" + meioX + " V" + p.y + " H" + p.x);
      var sob = document.elementFromPoint(e.clientX, e.clientY);
      var no = sob && sob.closest && sob.closest("#canvas g.node");
      marcarAlvo(no && no !== noOrigem ? no : null);
    }, function () {
      linha.remove();
      var destino = alvo && idEquipamentoDoNode(alvo);
      marcarAlvo(null);
      esconderBolinhas();
      if (!destino || destino === origem) return;
      var limite = limiteAtingido("cabo");
      if (limite) { avisar(limite); return; }
      var v = Esquema.validarConexao({ de: origem, para: destino, tipo: "", saida: "", chegada: "", potencia: "1G", cor: corParaNovoCabo({ de: origem, para: destino, tipo: "" }), grossura: 2, estilo: "solid" },
        estado.equipamentos.map(function (eq) { return eq.id; }));
      if (!v.ok) { avisar(textoDosErros(v.erros)); return; }
      estado.conexoes.push(v.dados);
      renderTudo();
      // Já abre o editor do cabo novo para preencher portas, tipo e VLAN.
      abrirEditorCabo(v.dados);
    });
  }

  function ativarLigacaoPeloMouse() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    ligacao.no = null;
    svg.querySelectorAll("g.node").forEach(function (no) {
      if (!idEquipamentoDoNode(no)) return;
      no.addEventListener("pointerenter", function () { clearTimeout(ligacao.timer); mostrarBolinhas(no); });
      no.addEventListener("pointerleave", agendarEsconder);
      no.addEventListener("pointerdown", function () { esconderBolinhas(); });
    });
  }

  // ---- Link entre diagramas ---------------------------------------------------------
  // Equipamento com "Abre o diagrama" ganha um selo ↗; clicar abre o outro
  // diagrama, e aparece "← Voltar para ..." para voltar.
  var voltarPara = null;

  function abrirDiagramaLigado(nome) {
    if (!projetos[nome]) { avisar("O diagrama “" + nome + "” não existe mais."); return; }
    voltarPara = projetoAtual;
    var sel = document.getElementById("projetoSelect");
    sel.value = nome;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    mostrarVoltar();
  }

  function mostrarVoltar() {
    var chip = document.getElementById("voltarDiagrama");
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button";
      chip.id = "voltarDiagrama";
      chip.className = "voltar-diagrama";
      elCanvas.parentNode.appendChild(chip);
      chip.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      chip.addEventListener("click", function () {
        var destino = voltarPara;
        chip.hidden = true;
        voltarPara = null;
        if (destino && projetos[destino]) {
          var sel = document.getElementById("projetoSelect");
          sel.value = destino;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }
    chip.textContent = "← Voltar para " + voltarPara;
    chip.hidden = !voltarPara;
    posicionarFerramentas();
  }

  function desenharLinksDeDiagrama() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var chip = document.getElementById("voltarDiagrama");
    if (chip && voltarPara && (voltarPara === projetoAtual || !projetos[voltarPara])) { chip.hidden = true; voltarPara = null; }
    svg.querySelectorAll("g.selo-diagrama").forEach(function (g) { g.remove(); });
    estado.equipamentos.forEach(function (eq) {
      if (!eq.diagrama) return;
      var no = obterNodePorId(svg, eq.id);
      if (!no) return;
      var b;
      try { b = no.getBBox(); } catch (e) { return; }
      var g = el("g", { "class": "selo-diagrama", tabindex: "0", role: "link", "aria-label": "Abrir o diagrama " + eq.diagrama }, no);
      var x = b.x + b.width - 4, y = b.y + 4;
      var titulo = el("title", {}, g); titulo.textContent = "Abrir o diagrama “" + eq.diagrama + "”";
      el("rect", { x: arred(x - 22), y: arred(y - 2), width: 24, height: 18, rx: 5 }, g);
      var t = el("text", { x: arred(x - 10), y: arred(y + 11.5), "text-anchor": "middle" }, g);
      t.textContent = "↗";
      g.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      g.addEventListener("click", function (event) { event.stopPropagation(); abrirDiagramaLigado(eq.diagrama); });
      g.addEventListener("dblclick", function (event) { event.stopPropagation(); });
      g.addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); abrirDiagramaLigado(eq.diagrama); } });
    });
  }

  // ---- Camadas: mostrar ou esconder partes do desenho ----------------------------
  // Vale na tela e na exportação (o estilo vai junto no SVG copiado). Fica guardado
  // neste navegador, por diagrama.
  var CAMADAS = [
    ["vlan", "Etiquetas de VLAN", "g.cabo-etiqueta"],
    ["numeros", "Números nas pontas", "text.cabo-num"],
    ["rotulos", "Nome dos cabos", "g.edge > text:not(.cabo-extra), g.edge > g > text:not(.cabo-extra)"],
    ["desenhos", "Desenhos e formas", "g.camada-desenhos"],
    ["notas", "Notas", "g.anotacao"],
    ["grupos", "Caixas dos grupos", "g.cluster"],
    ["mapa", "Mapa (municípios e imagem)", null],
    ["cidades", "Nome das cidades", null],
    ["legenda", "Legenda dos cabos", "g.legenda-cabos"],
    ["tipos", "Legenda dos tipos (embaixo)", null],
    ["cores", "Cor diferente em cada cabo", null]
  ];
  function chaveCamadas() { return "grafo-camadas:" + projetoAtual; }
  function camadasOcultas() {
    try { return JSON.parse(localStorage.getItem(chaveCamadas()) || "{}") || {}; } catch (e) { return {}; }
  }
  function aplicarCamadas() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var ocultas = camadasOcultas();
    CAMADAS.forEach(function (c) {
      if (!c[2]) return;
      svg.querySelectorAll(c[2]).forEach(function (e) {
        // Só mostra de volta o que a própria camada escondeu (a LAG esconde rótulos repetidos).
        if (ocultas[c[0]]) { if (e.style.display !== "none") { e.style.display = "none"; e.setAttribute("data-camada-oculta", ""); } }
        else if (e.hasAttribute("data-camada-oculta")) { e.style.display = ""; e.removeAttribute("data-camada-oculta"); }
      });
    });
    // Legenda dos tipos, embaixo do quadro (fora do desenho).
    elLegenda.hidden = !!ocultas.tipos;
    var botao = document.getElementById("btnCamadas");
    if (botao) botao.classList.toggle("com-ocultas", Object.keys(ocultas).some(function (k) { return ocultas[k]; }));
  }
  // Esconde uma camada pelo "×" da própria legenda (volta em Camadas).
  function ocultarCamada(k) {
    var ocultas = camadasOcultas();
    ocultas[k] = true;
    try { localStorage.setItem(chaveCamadas(), JSON.stringify(ocultas)); } catch (e) {}
    if (k === "legenda") gerar(); else aplicarCamadas();
    avisar("Legenda removida. Para mostrar de novo: Camadas.");
  }

  function criarMenuDeCamadas() {
    if (!caixaFerramentas || document.getElementById("btnCamadas")) return;
    var sep = document.createElement("span"); sep.className = "ferramentas-sep";
    var botao = document.createElement("button");
    botao.type = "button"; botao.id = "btnCamadas"; botao.className = "ferramenta-desenho";
    botao.title = "Camadas: mostrar ou esconder VLANs, números, desenhos, notas…";
    botao.setAttribute("aria-label", botao.title);
    botao.setAttribute("aria-expanded", "false");
    botao.innerHTML = svgIcone('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>');
    caixaFerramentas.appendChild(sep);
    caixaFerramentas.appendChild(botao);
    var ajudaBtn = document.createElement("button");
    ajudaBtn.type = "button"; ajudaBtn.id = "btnComoFazer"; ajudaBtn.className = "ferramenta-desenho";
    ajudaBtn.title = "Como fazer: passo a passo das ferramentas";
    ajudaBtn.setAttribute("aria-label", ajudaBtn.title);
    ajudaBtn.innerHTML = svgIcone('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.5h.01"/>');
    caixaFerramentas.appendChild(ajudaBtn);
    ajudaBtn.addEventListener("click", function () { if (window.GrafoAjuda) window.GrafoAjuda.abrir(); });
    var menu = document.createElement("div");
    menu.id = "menuCamadas"; menu.className = "menu-camadas painel-flutuante"; menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    function montar() {
      var ocultas = camadasOcultas();
      menu.innerHTML = '<strong>Mostrar no diagrama</strong>' + CAMADAS.map(function (c) {
        return '<label><input type="checkbox" data-camada="' + c[0] + '"' + (ocultas[c[0]] ? "" : " checked") + "> " + c[1] + "</label>";
      }).join("") + '<p>Vale também para o PDF, PNG e SVG.</p>';
    }
    function abrir(sim) {
      if (!sim && menu.contains(document.activeElement)) document.activeElement.blur();
      menu.hidden = !sim;
      botao.setAttribute("aria-expanded", String(sim));
      botao.setAttribute("aria-pressed", String(sim));
      if (sim) { montar(); posicionarAoLado(menu, botao); }
    }
    botao.addEventListener("click", function (event) { event.stopPropagation(); abrir(menu.hidden); });
    menu.addEventListener("change", function (event) {
      var k = event.target.getAttribute("data-camada");
      if (!k) return;
      var ocultas = camadasOcultas();
      if (event.target.checked) delete ocultas[k]; else ocultas[k] = true;
      try { localStorage.setItem(chaveCamadas(), JSON.stringify(ocultas)); } catch (e) {}
      if (k === "cores" || k === "legenda" || k === "mapa" || k === "cidades") { gerar(); return; } // muda o desenho: redesenha
      aplicarCamadas();
    });
    document.addEventListener("pointerdown", function (event) { if (!menu.hidden && !menu.contains(event.target) && !botao.contains(event.target)) abrir(false); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !menu.hidden) abrir(false); });
  }

  // Coloca um painel flutuante ao lado do botão, sempre inteiro dentro da tela.
  // limite: retângulo (do quadro) em que o painel deve caber, se houver.
  function posicionarAoLado(painel, botao, limite) {
    var b = botao.getBoundingClientRect();
    painel.style.position = "fixed";
    painel.style.transform = "none";
    var alturaMax = limite ? Math.min(560, limite.height - 16) : window.innerHeight - 24;
    painel.style.maxHeight = Math.max(220, alturaMax) + "px";
    if (limite) b = { top: Math.max(b.top, limite.top + 8), left: b.left, right: b.right };
    var w = painel.offsetWidth, h = painel.offsetHeight;
    var esquerda = b.right + 10;
    if (esquerda + w > window.innerWidth - 12) esquerda = Math.max(12, b.left - w - 10);
    var topo = Math.min(b.top, window.innerHeight - h - 12);
    painel.style.left = Math.round(esquerda) + "px";
    painel.style.top = Math.round(Math.max(12, topo)) + "px";
  }

  // A caixa de ferramentas, a barra de estilo e o "Voltar" ficam presos ao quadro
  // (não por cima da barra de cima nem do seletor de modo).
  function posicionarFerramentas() {
    if (!caixaFerramentas) return;
    var quadro = elCanvas.getBoundingClientRect(), pai = elCanvas.parentNode.getBoundingClientRect();
    if (!quadro.width || window.innerWidth <= 760) {
      caixaFerramentas.style.top = caixaFerramentas.style.left = caixaFerramentas.style.maxHeight = "";
      if (barraEstilo) barraEstilo.style.top = barraEstilo.style.left = barraEstilo.style.bottom = "";
      return;
    }
    var topo = quadro.top - pai.top + 12, esquerda = quadro.left - pai.left + 12;
    caixaFerramentas.style.top = Math.round(topo) + "px";
    caixaFerramentas.style.left = Math.round(esquerda) + "px";
    caixaFerramentas.style.maxHeight = Math.round(quadro.height - 24) + "px";
    if (barraEstilo) {
      barraEstilo.style.left = Math.round(quadro.left - pai.left + quadro.width / 2) + "px";
      barraEstilo.style.top = "auto";
      barraEstilo.style.bottom = Math.round(pai.bottom - quadro.bottom + 12) + "px";
    }
    var voltar = document.getElementById("voltarDiagrama");
    if (voltar) { voltar.style.top = Math.round(topo) + "px"; voltar.style.left = Math.round(esquerda + caixaFerramentas.offsetWidth + 10) + "px"; }
  }

  // ---- Estilo de diagrama de operadora (como o PDF de interligação do core) -------
  // Cor pela categoria da ligação (só em cabo com a cor padrão), rótulo curto num
  // selo ("ae7 · 20G", descrição completa ao passar o mouse) e legenda no desenho.
  var COR_CABO_PADRAO_APP = "#5A7284";
  // Cada ligação ganha uma cor diferente (as portas da mesma LAG ficam com a mesma).
  var PALETA_CABOS = ["#1E6FD9", "#D32F2F", "#1B7F2A", "#8E24AA", "#E08A00", "#00897B", "#C2185B", "#5D4037",
    "#3949AB", "#7CB342", "#F4511E", "#00ACC1", "#6D4C41", "#AD1457", "#546E7A", "#9E9D24"];
  function chaveDaLigacao(c, i) {
    var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(c.tipo || "");
    return m ? [c.de, c.para].sort().join("|") + "|" + m[1].toLowerCase() : "cabo" + i;
  }
  function ehCorPadrao(cor) { return !cor || String(cor).toUpperCase() === COR_CABO_PADRAO_APP; }
  // Cor para um cabo novo: a mesma das outras portas da LAG, ou a da paleta menos usada.
  function corParaNovoCabo(c) {
    if (!ehCorPadrao(c.cor)) return c.cor;
    var chave = chaveDaLigacao(c, -1);
    var irmao = estado.conexoes.find(function (o, i) { return o !== c && !ehCorPadrao(o.cor) && chaveDaLigacao(o, i) === chave; });
    if (irmao) return irmao.cor;
    var uso = {};
    PALETA_CABOS.forEach(function (cor) { uso[cor] = 0; });
    var vistas = {};
    estado.conexoes.forEach(function (o, i) {
      var k = chaveDaLigacao(o, i), cor = String(o.cor || "").toUpperCase();
      if (vistas[k] || !(cor in uso)) return;
      vistas[k] = true;
      uso[cor]++;
    });
    return PALETA_CABOS.slice().sort(function (a, b) { return uso[a] - uso[b] || PALETA_CABOS.indexOf(a) - PALETA_CABOS.indexOf(b); })[0];
  }
  function corAutomaticaLigada() { return !camadasOcultas().cores; }
  // Cabos antigos ainda com a cor padrão: cor da paleta pela ordem das ligações.
  var corDasLigacoes = {};
  function prepararCoresDosCabos(conexoes) {
    corDasLigacoes = {};
    var n = 0;
    conexoes.forEach(function (c, i) {
      var k = chaveDaLigacao(c, i);
      if (corDasLigacoes[k] == null) corDasLigacoes[k] = PALETA_CABOS[n++ % PALETA_CABOS.length];
    });
  }
  function corDoCaboNoDesenho(c, porId, indice) {
    if (estado.mapa && estado.mapa.cabosPretos && ehCorPadrao(c.cor)) return "#111111"; // estilo mapa
    if (!corAutomaticaLigada() || !ehCorPadrao(c.cor)) return c.cor || COR_CABO_PADRAO_APP;
    return corDasLigacoes[chaveDaLigacao(c, indice)] || COR_CABO_PADRAO_APP;
  }

  // "10G" × 2 = "20G"; "40G" × 2 = "80G".
  function somaVelocidade(potencia, vezes) {
    var m = /^(\d+(?:[.,]\d+)?)\s*([MGT])$/i.exec(String(potencia || "").trim());
    if (!m || vezes < 2) return potencia || "";
    var n = parseFloat(m[1].replace(",", ".")) * vezes;
    return String(Math.round(n * 10) / 10).replace(".", ",") + m[2].toUpperCase();
  }
  // Tamanho de cada LAG (mesmos equipamentos e mesmo aeN), para o rótulo somar.
  function contarLags() {
    var n = {};
    estado.conexoes.forEach(function (c) {
      var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(c.tipo || "");
      if (!m) return;
      var k = [c.de, c.para].sort().join("|") + "|" + m[1].toLowerCase();
      n[k] = (n[k] || 0) + 1;
    });
    return n;
  }
  var tamanhoDasLags = {};
  function rotuloCurto(c) {
    var m = /^LAG\s+(ae\d+|lag-?\d+)/i.exec(c.tipo || "");
    var trafego = (c.trafegoEntrada ? " ↓" + c.trafegoEntrada : "") + (c.trafegoSaida ? " ↑" + c.trafegoSaida : "") +
      (c.distanciaKm != null && c.distanciaKm !== "" ? " · " + String(c.distanciaKm).replace(".", ",") + " km" : "");
    if (m) {
      var k = [c.de, c.para].sort().join("|") + "|" + m[1].toLowerCase();
      return m[1] + " · " + somaVelocidade(c.potencia, tamanhoDasLags[k] || 1) + trafego;
    }
    return (c.potencia || (c.tipo ? String(c.tipo).slice(0, 18) : "")) + trafego;
  }
  // Legenda automática no desenho (sai no PNG/SVG/PDF): uma linha por ligação
  // (a LAG conta uma vez), com a cor do cabo, as pontas e o selo curto.
  var LEGENDA_MAX = 30;
  function desenharLegendaCabos() {
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var antiga = grafo.querySelector("g.legenda-cabos");
    if (antiga) antiga.remove();
    if (!estado.conexoes.length || camadasOcultas().legenda) return; // removida: nem ocupa espaço
    var nomePorId = {};
    estado.equipamentos.forEach(function (eq) { nomePorId[eq.id] = eq.nome || eq.id; });
    tamanhoDasLags = contarLags();
    var vistas = {}, itens = [];
    estado.conexoes.forEach(function (c, i) {
      var k = chaveDaLigacao(c, i);
      if (vistas[k]) return;
      vistas[k] = true;
      itens.push({ cor: corValida(corDoCaboNoDesenho(c, null, i), "#5A7284"), nome: (nomePorId[c.de] || c.de) + " ↔ " + (nomePorId[c.para] || c.para), selo: rotuloCurto(c), estilo: c.estilo });
    });
    var sobra = itens.length - LEGENDA_MAX;
    if (sobra > 0) itens = itens.slice(0, LEGENDA_MAX);
    var maxX = -Infinity, minY = Infinity;
    grafo.querySelectorAll("g.node, g.cluster").forEach(function (n) {
      try { var bb = n.getBBox(), t = translateDoElemento(n); maxX = Math.max(maxX, bb.x + t.x + bb.width); minY = Math.min(minY, bb.y + t.y); } catch (e) {}
    });
    if (!isFinite(maxX)) return;
    var maiorTexto = itens.reduce(function (m, it) { return Math.max(m, it.nome.length * 5.6 + (it.selo ? it.selo.length * 5.2 + 14 : 0)); }, 60);
    var linha = 18, largura = Math.min(520, Math.max(200, 58 + maiorTexto)), altura = 34 + itens.length * linha + (sobra > 0 ? linha : 0);
    var x = maxX + 60, y = minY;
    var g = el("g", { "class": "legenda-cabos" }, grafo);
    el("rect", { x: x, y: y, width: largura, height: altura, rx: 10, fill: "#FFFFFF", stroke: "#D3DCE3", "stroke-width": 1 }, g);
    var titulo = el("text", { x: x + 14, y: y + 20, "font-family": "Helvetica, Arial, sans-serif", "font-size": 10, "font-weight": 700, "letter-spacing": "0.08em", fill: "#14212B" }, g);
    var fechar = el("g", { "class": "legenda-fechar", transform: "translate(" + (x + largura - 22) + "," + (y + 8) + ")" }, g);
    el("title", null, fechar).textContent = "Remover a legenda (volta em Camadas)";
    el("rect", { width: 16, height: 16, rx: 5, fill: "#EEF2F5" }, fechar);
    el("path", { d: "M5 5l6 6M11 5l-6 6", stroke: "#4B5F6E", "stroke-width": 1.6, "stroke-linecap": "round" }, fechar);
    fechar.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    fechar.addEventListener("click", function (ev) { ev.stopPropagation(); ocultarCamada("legenda"); });
    titulo.textContent = "LEGENDA · " + (itens.length + Math.max(0, sobra)) + (itens.length + Math.max(0, sobra) === 1 ? " LIGAÇÃO" : " LIGAÇÕES");
    itens.forEach(function (it, i) {
      var yy = y + 40 + i * linha;
      el("line", { x1: x + 14, y1: yy - 3.5, x2: x + 40, y2: yy - 3.5, stroke: it.cor, "stroke-width": 3.5, "stroke-linecap": "round", "stroke-dasharray": it.estilo === "dashed" ? "5 4" : it.estilo === "dotted" ? "1 4" : null }, g);
      var t = el("text", { x: x + 50, y: yy, "font-family": "Helvetica, Arial, sans-serif", "font-size": 10, fill: "#14212B" }, g);
      t.textContent = it.nome;
      if (it.selo) {
        var s2 = el("tspan", { dx: 8, fill: "#5B6F7E", "font-family": "Menlo, Consolas, monospace", "font-size": 9 }, t);
        s2.textContent = it.selo;
      }
    });
    if (sobra > 0) {
      var mais = el("text", { x: x + 50, y: y + 40 + itens.length * linha, "font-family": "Helvetica, Arial, sans-serif", "font-size": 9.5, "font-style": "italic", fill: "#5B6F7E" }, g);
      mais.textContent = "+ " + sobra + " ligações (veja a lista de cabos)";
    }
  }

  // Troca o texto do Graphviz pelo rótulo curto; o texto completo vira dica.
  function prepararRotuloCurto(aresta, c) {
    var texto = aresta.querySelector("text");
    if (!texto) return;
    var completo = [c.tipo, c.potencia].filter(Boolean).join(" · ");
    texto.textContent = rotuloCurto(c) || completo;
    var dica = aresta.querySelector("title.dica-completa") || document.createElementNS(NS_SVG, "title");
    dica.setAttribute("class", "dica-completa");
    dica.textContent = completo + (c.saida || c.chegada ? "\n" + (c.saida || "?") + " → " + (c.chegada || "?") : "");
    aresta.insertBefore(dica, aresta.firstChild);
  }
  // Selo arredondado atrás do rótulo, com a borda na cor do cabo e o ponto de status.
  function desenharSeloDoRotulo(aresta) {
    aresta.querySelectorAll(".selo-cabo").forEach(function (e) { e.remove(); });
    var texto = aresta.querySelector("text");
    if (!texto || texto.style.display === "none" || !texto.textContent.trim()) return;
    var b;
    try { b = texto.getBBox(); } catch (e) { return; }
    if (!b.width) return;
    var caminho = aresta.querySelector("path");
    var cor = (caminho && caminho.getAttribute("stroke")) || COR_CABO_PADRAO_APP;
    var g = el("g", { "class": "selo-cabo" });
    el("rect", { x: arred(b.x - 16), y: arred(b.y - 3), width: arred(b.width + 22), height: arred(b.height + 6), rx: arred((b.height + 6) / 2), fill: "#FFFFFF", stroke: cor, "stroke-width": 1.2 }, g);
    el("circle", { cx: arred(b.x - 8), cy: arred(b.y + b.height / 2), r: 2.6, fill: "#22A447" }, g);
    aresta.insertBefore(g, texto);
    texto.setAttribute("fill", "#14212B");
    texto.setAttribute("font-weight", "700");
  }

  // Monta a interface quando o editor carrega.
  criarCaixaDeFerramentas();
  criarBibliotecaDeEquipamentos();
  criarMenuDeCamadas();
  posicionarFerramentas();
  window.addEventListener("resize", posicionarFerramentas);
  if (window.ResizeObserver) new ResizeObserver(posicionarFerramentas).observe(elCanvas);
  window.addEventListener("grafo:render", posicionarFerramentas);
  document.body.setAttribute("data-ferramenta-ativa", ferramentaAtual);
  // ==== 11-diagrama-e-layout.js: geração do DOT, imagens no SVG, organizar/grade e renderização (parte de assets/js/editor/app.js; npm run montar) ====
  // Linhas de texto do cabeçalho do equipamento (acima do ícone), conforme o
  // modo do projeto. aplicarImagensNoSvg usa a quantidade para achar o ícone.
  //   Topologia: nome, modelo, tipo, IP.
  //   Redes: nome, IP (em destaque), VLAN / rede, tipo.
  //   Monitoramento: nome, tipo, IP.
  // ---- FTTH: sinal estimado em cada ponto da rede óptica ----------------------
  // Parte de cada OLT (potência de saída, padrão +5 dBm) e desce pelos cabos:
  // 0,35 dB/km de fibra, 0,5 dB por ligação (conectores/fusões) e a perda do
  // splitter na saída dele (1:2 3,7 · 1:4 7,3 · 1:8 10,5 · 1:16 13,7 · 1:32 17,1 · 1:64 20,5 dB).
  var PERDA_SPLITTER = { 2: 3.7, 4: 7.3, 8: 10.5, 16: 13.7, 32: 17.1, 64: 20.5 };
  var sinaisFtth = {};
  function razaoDoSplitter(eq) {
    var texto = [eq.tipo, eq.nome, eq.modelo].join(" ");
    if (!/split|divisor|cto|caixa/i.test(texto)) return 0;
    var m = /1\s*[:x\/]\s*(\d+)/i.exec(texto);
    return m && PERDA_SPLITTER[Number(m[1])] ? Number(m[1]) : 0;
  }
  function calcularSinaisFtth(dados) {
    var porId = {}, vizinhos = {}, sinal = {}, fila = [];
    dados.equipamentos.forEach(function (eq) { porId[eq.id] = eq; vizinhos[eq.id] = []; });
    dados.conexoes.forEach(function (c) {
      if (!vizinhos[c.de] || !vizinhos[c.para]) return;
      vizinhos[c.de].push({ id: c.para, km: Number(c.distanciaKm) || 0 });
      vizinhos[c.para].push({ id: c.de, km: Number(c.distanciaKm) || 0 });
    });
    dados.equipamentos.forEach(function (eq) {
      if (!/\bolt\b/i.test([eq.tipo, eq.nome].join(" "))) return;
      sinal[eq.id] = eq.potenciaDbm != null ? Number(eq.potenciaDbm) : 5;
      fila.push(eq.id);
    });
    var olts = {};
    fila.forEach(function (id) { olts[id] = true; });
    while (fila.length) {
      var u = fila.shift(), saida = sinal[u] - (olts[u] ? 0 : (PERDA_SPLITTER[razaoDoSplitter(porId[u])] || 0));
      vizinhos[u].forEach(function (v) {
        if (sinal[v.id] != null) return;
        sinal[v.id] = saida - v.km * 0.35 - 0.5;
        fila.push(v.id);
      });
    }
    var resultado = {};
    Object.keys(sinal).forEach(function (id) { if (!olts[id]) resultado[id] = Math.sign(sinal[id]) * Math.round(Math.abs(sinal[id]) * 10) / 10; });
    return resultado;
  }
  function corDoSinal(dbm) { return dbm >= -25 ? "#1E8E4E" : dbm >= -27 ? "#B7791F" : "#C53030"; }

  function linhasDoCabecalho(eq, modo) {
    function fonte(tamanho, cor, texto, opcoes) {
      opcoes = opcoes || {};
      var conteudo = escaparHtmlDot(texto);
      if (opcoes.negrito) conteudo = "<B>" + conteudo + "</B>";
      return '<FONT FACE="' + (opcoes.mono ? "Courier" : "Helvetica") + '" POINT-SIZE="' + tamanho + '" COLOR="' + cor + '">' + conteudo + '</FONT>';
    }
    var nome = fonte(11, "#14212B", eq.nome || eq.id, { negrito: true });
    var modelo = String(eq.modelo || "").trim();
    var tipo = fonte(8, "#405363", eq.tipo || "Equipamento");
    var ip = String(eq.ip || "").trim();
    var rede = String(eq.rede || "").trim();
    if (modo === "redes") {
      return [nome]
        .concat(ip ? [fonte(10, "#1F5F8B", ip, { mono: true, negrito: true })] : [])
        .concat(rede ? [fonte(9, "#6A3FB5", rede, { negrito: true })] : [])
        .concat([tipo]);
    }
    if (modo === "monitoramento") {
      return [nome, tipo].concat(ip ? [fonte(8, "#1F5F8B", ip, { mono: true })] : []);
    }
    if (modo === "ftth") {
      var dbm = sinaisFtth[eq.id];
      var linhaSinal = dbm != null ? [fonte(10, corDoSinal(dbm), (razaoDoSplitter(eq) ? "entrada " : "") + String(dbm).replace(".", ",") + " dBm", { negrito: true, mono: true })]
        : eq.potenciaDbm != null ? [fonte(9, "#1F5F8B", "saída +" + String(eq.potenciaDbm).replace(".", ",") + " dBm", { mono: true })] : [];
      return [nome, tipo].concat(linhaSinal);
    }
    return [nome]
      .concat(modelo ? [fonte(9, "#14212B", modelo)] : [])
      .concat([tipo])
      .concat(ip ? [fonte(8, "#1F5F8B", ip, { mono: true })] : []);
  }

  // Monitoramento: fundo claro na cor do status, atrás do "● ATIVO".
  var FUNDO_STATUS = { ativo: "#E3F5EA", manutencao: "#FBEFD5", offline: "#FBE1E4" };

  function gerarDot(dados, direcao) {
    var modo = modoAtual();
    sinaisFtth = modo === "ftth" ? calcularSinaisFtth(dados) : {};
    prepararCoresDosCabos(dados.conexoes);
    var contagemPortas = {};
    dados.equipamentos.forEach(function (eq) { contagemPortas[eq.id] = 0; });
    dados.conexoes.forEach(function (c) {
      if (contagemPortas[c.de] != null) contagemPortas[c.de]++;
      if (contagemPortas[c.para] != null) contagemPortas[c.para]++;
    });
    var maiorQtdPortas = Math.max.apply(null, [1].concat(Object.keys(contagemPortas).map(function (id) { return contagemPortas[id]; })));
    var ranksepAuto = Math.max(1.15, Math.min(4.5, 0.95 + maiorQtdPortas * 0.16), (larguraDoMaiorRotulo() + 80) / 72);
    // A grade parte do layout "LR" do Graphviz e depois reposiciona (posicionarEmGrade).
    var linhas = ["digraph G {", '  rankdir=' + (direcao === "TB" ? "TB" : "LR") + ';', '  splines=ortho;', '  concentrate=false;', '  overlap=false;', '  nodesep=0.7;', '  ranksep=' + ranksepAuto.toFixed(2) + ';', '  pad=0;', '  margin=0;', '  bgcolor="transparent";',
      '  node [shape=box, style="filled", fontname="Helvetica", fontsize=10, margin="0.02,0.02", color="#547184", penwidth=1.1];',
      '  edge [fontname="Helvetica", fontsize=8, color="#263746", fontcolor="#344D61", penwidth=1.5, arrowhead=none, labeldistance=1.25, labelangle=0, labelfontname="Helvetica", labelfontsize=8];'];
    // Cada ponta de cabo vira uma porta no lado do equipamento voltado para o
    // outro equipamento. Sem posição conhecida (primeira renderização), usa o
    // padrão do layout: saída à direita/embaixo, chegada à esquerda/em cima.
    var equipamentoPorId = {};
    dados.equipamentos.forEach(function (eq) { equipamentoPorId[eq.id] = eq; });
    var portasPorEquipamento = {};
    dados.equipamentos.forEach(function (eq) { portasPorEquipamento[eq.id] = { cima: [], esquerda: [], direita: [], baixo: [] }; });
    var padraoSaida = direcao === "TB" ? "baixo" : "direita";
    var padraoChegada = direcao === "TB" ? "cima" : "esquerda";
    // Estrela: a regra própria (colunas e linha de baixo) só vale para os cabos do
    // centro; nos ramos, que são camadas, vale a regra do Esquerda → Direita.
    var centrosDaEstrela = {}, grauPorId = {};
    if (direcao === "ESTRELA") {
      var vizinhosPorId = {};
      dados.conexoes.forEach(function (c) {
        if (c.de === c.para) return;
        (vizinhosPorId[c.de] = vizinhosPorId[c.de] || {})[c.para] = true;
        (vizinhosPorId[c.para] = vizinhosPorId[c.para] || {})[c.de] = true;
      });
      var maiorGrau = maiorNumeroDeVizinhos(dados);
      Object.keys(vizinhosPorId).forEach(function (id) {
        var grau = Object.keys(vizinhosPorId[id]).length;
        grauPorId[id] = grau;
        if (grau === maiorGrau || grau >= LIGACOES_PARA_ESTRELA) centrosDaEstrela[id] = true;
      });
    }
    // Cabo do centro da estrela: colunas (longe na horizontal) chegam pela
    // lateral; o que está no vão entre elas (a linha de baixo), por baixo/cima.
    function ladoNaEstrela(origem, destino, padrao, limite) {
      if (!origem || !destino || !posicaoValida(origem.posicao) || !posicaoValida(destino.posicao)) return padrao;
      var dx = destino.posicao.x - origem.posicao.x, dy = destino.posicao.y - origem.posicao.y;
      if (Math.abs(dx) >= limite || Math.abs(dy) < 1) return dx >= 0 ? "direita" : "esquerda";
      return dy > 0 ? "baixo" : "cima";
    }
    dados.conexoes.forEach(function (c, indice) {
      var de = equipamentoPorId[c.de], para = equipamentoPorId[c.para];
      var centro = direcao === "ESTRELA" ? (centrosDaEstrela[c.de] ? c.de : centrosDaEstrela[c.para] ? c.para : null) : null;
      var limite = centro ? limiteLateralDaEstrela(grauPorId[centro]) : 0;
      var direcaoDoCabo = direcao === "ESTRELA" ? "LR" : direcao;
      if (de) {
        var ladoSaida = centro ? ladoNaEstrela(de, para, padraoSaida, limite) : ladoVoltadoPara(de, para, padraoSaida, direcaoDoCabo);
        portasPorEquipamento[c.de][ladoSaida].push({ indice: indice, ponta: "inicio", lado: ladoSaida, nome: c.saida || "P1", outro: para });
      }
      if (para) {
        var ladoChegada = centro ? ladoNaEstrela(para, de, padraoChegada, limite) : ladoVoltadoPara(para, de, padraoChegada, direcaoDoCabo);
        portasPorEquipamento[c.para][ladoChegada].push({ indice: indice, ponta: "fim", lado: ladoChegada, nome: c.chegada || "P2", outro: de });
      }
    });
    // Dentro de cada lado, ordena pela posição do outro equipamento para os
    // cabos não se cruzarem ao sair.
    function coordenadaDoOutro(porta, eixo) {
      return porta.outro && posicaoValida(porta.outro.posicao) ? porta.outro.posicao[eixo] : 0;
    }
    function ordenarPor(eixo) {
      return function (a, b) { return coordenadaDoOutro(a, eixo) - coordenadaDoOutro(b, eixo) || a.indice - b.indice; };
    }
    portasRenderizadas = {};
    Object.keys(portasPorEquipamento).forEach(function (id) {
      var lados = portasPorEquipamento[id];
      lados.esquerda.sort(ordenarPor("y"));
      lados.direita.sort(ordenarPor("y"));
      lados.cima.sort(ordenarPor("x"));
      lados.baixo.sort(ordenarPor("x"));
      // Mesma ordem em que o Graphviz desenha as caixas (ordem da tabela abaixo).
      portasRenderizadas[id] = {
        ordem: lados.cima.concat(lados.esquerda, lados.direita, lados.baixo),
        nCima: lados.cima.length,
        nBaixo: lados.baixo.length
      };
    });

    var CONFIG_PORTA = { largura: 52, alturaMaxima: 24, alturaMinima: 14, fonteMaxima: 10, fonteMinima: 7, paddingMaximo: 3, paddingMinimo: 1, fundo: "#FFFFFF", borda: "#202020", texto: "#111111", maxCaracteres: 11 };
    var ALTURA_BASE_EQUIPAMENTO = 92;

    function calcularFontePorta(altura) {
      if (altura >= 24) return 10;
      if (altura >= 20) return 9;
      return Math.max(CONFIG_PORTA.fonteMinima, 8);
    }

    function calcularPaddingPorta(altura) {
      if (altura >= 24) return CONFIG_PORTA.paddingMaximo;
      if (altura >= 20) return 2;
      return CONFIG_PORTA.paddingMinimo;
    }

    // Porta com tamanho fixo (alturaMaxima) quando há uma ligação só no lado,
    // diminuindo 2 pt a cada ligação a mais até alturaMinima. Com muitas portas
    // o equipamento cresce em vez de a porta encolher mais.
    function calcularLayoutPortas(totalPortas) {
      totalPortas = Math.max(Number(totalPortas) || 1, 1);
      var alturaPorta = Math.max(CONFIG_PORTA.alturaMinima, CONFIG_PORTA.alturaMaxima - (totalPortas - 1) * 2);
      return { alturaPorta: Math.round(alturaPorta), fonte: calcularFontePorta(alturaPorta), padding: calcularPaddingPorta(alturaPorta) };
    }

    function limitarNomePorta(nome) {
      nome = String(nome || "PORTA").trim();
      if (nome.length > CONFIG_PORTA.maxCaracteres) return nome.substring(0, CONFIG_PORTA.maxCaracteres - 1) + "…";
      return nome;
    }

    // Portas de cima e de baixo ficam "em pé" (estreitas e altas); o nome é girado
    // depois de desenhar (girarNomesDasPortasEmPe), porque o Graphviz não gira texto.
    function celulaPorta(porta, layout, emPe) {
      var nome = escaparHtmlDot(limitarNomePorta(porta.nome));
      return '<TD BORDER="1" COLOR="' + CONFIG_PORTA.borda + '" BGCOLOR="' + CONFIG_PORTA.fundo + '" WIDTH="' + (emPe ? layout.alturaPorta : CONFIG_PORTA.largura) + '" HEIGHT="' + (emPe ? CONFIG_PORTA.largura : layout.alturaPorta) + '" FIXEDSIZE="TRUE" CELLPADDING="' + layout.padding + '" ALIGN="CENTER" VALIGN="MIDDLE"><FONT FACE="Helvetica" POINT-SIZE="' + layout.fonte + '" COLOR="' + CONFIG_PORTA.texto + '">' + nome + '</FONT></TD>';
    }

    function linhaEquipamento(eq) {
      var status = eq.status || "ativo";
      var corStatus = corPorStatus(status);
      var corFonte = corValida(eq.corFonte, "#16323D");
      var portas = portasPorEquipamento[eq.id];
      var layoutLateral = calcularLayoutPortas(Math.max(portas.esquerda.length, portas.direita.length));
      var layoutTopo = calcularLayoutPortas(Math.max(portas.cima.length, portas.baixo.length));

      // Portas laterais numa tabela interna: fica centralizada na coluna e
      // mantém a altura das portas (sem isso o Graphviz as estica até a altura
      // da área da imagem).
      function colunaPortas(lista) {
        if (!lista.length) return '<TD WIDTH="' + CONFIG_PORTA.largura + '"></TD>';
        // Tamanho travado (FIXEDSIZE): sem isto o Graphviz esticava a coluna até a
        // altura do equipamento e abria um vão entre as portas.
        return '<TD VALIGN="MIDDLE" WIDTH="' + CONFIG_PORTA.largura + '"><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0" FIXEDSIZE="TRUE" WIDTH="' + CONFIG_PORTA.largura + '" HEIGHT="' + lista.length * layoutLateral.alturaPorta + '">' +
          lista.map(function (p) { return '<TR>' + celulaPorta(p, layoutLateral) + '</TR>'; }).join("") +
          '</TABLE></TD>';
      }
      function tabelaPortasEmPe(lista) {
        return '<TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0" FIXEDSIZE="TRUE" WIDTH="' + lista.length * layoutTopo.alturaPorta + '" HEIGHT="' + CONFIG_PORTA.largura + '"><TR>' +
          lista.map(function (p) { return celulaPorta(p, layoutTopo, true); }).join("") + '</TR></TABLE>';
      }
      // Portas de cima/baixo coladas no equipamento: o texto que ficaria entre elas
      // e o ícone (nome em cima, status embaixo) vai para o lado direito delas. Uma
      // célula vazia do mesmo tamanho à esquerda mantém as portas centralizadas.
      function linhaPortasComTexto(lista, texto, largura, alinhamento) {
        return '<TR><TD COLSPAN="3"><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0"><TR>' +
          '<TD WIDTH="' + largura + '"></TD><TD>' + tabelaPortasEmPe(lista) + '</TD>' +
          '<TD WIDTH="' + largura + '" CELLPADDING="3" ALIGN="LEFT" VALIGN="' + alinhamento + '">' + texto + '</TD>' +
          '</TR></TABLE></TD></TR>';
      }
      var alturaPortasLaterais = Math.max(portas.esquerda.length, portas.direita.length) * layoutLateral.alturaPorta;
      var fatorTamanho = tamanhoDoEquipamento(eq) / 100; // "Tamanho" do equipamento (ou o padrão do tipo)
      var larguraIcone = Math.round(88 * fatorTamanho);
      var alturaMeio = Math.max(Math.round(ALTURA_BASE_EQUIPAMENTO * fatorTamanho), alturaPortasLaterais);

      // Ordem das linhas = ordem em que o Graphviz desenha as portas:
      // cima, (cabeçalho), esquerda, direita, (status), baixo.
      var cabecalho = linhasDoCabecalho(eq, modo).join("<BR/>");
      var textoStatus = escaparHtmlDot(marcadorStatus(status) + " " + rotuloStatus(status));
      var htmlStatus = modo === "monitoramento"
        ? '<TABLE BORDER="0" CELLPADDING="4" STYLE="rounded" BGCOLOR="' + (FUNDO_STATUS[status] || FUNDO_STATUS.ativo) + '"><TR><TD><FONT FACE="Helvetica" POINT-SIZE="11" COLOR="' + corStatus + '"><B>' + textoStatus + '</B></FONT></TD></TR></TABLE>'
        : '<FONT FACE="Helvetica" POINT-SIZE="9" COLOR="' + corStatus + '"><B>' + textoStatus + '</B></FONT>';
      // Largura aproximada do texto (pt) para a célula ao lado das portas.
      var larguraCabecalho = Math.ceil(Math.max(
        String(eq.nome || eq.id).length * 7, String(eq.modelo || "").length * 5.5, String(eq.tipo || "").length * 5,
        String(eq.ip || "").length * 5, String(eq.rede || "").length * 5.5) + 8);
      var larguraStatus = Math.ceil(textoStatus.length * (modo === "monitoramento" ? 8 : 6.5) + 12);
      var infoPortas = portasRenderizadas[eq.id];
      infoPortas.cabecalhoAoLado = portas.cima.length > 0;
      infoPortas.statusAoLado = portas.baixo.length > 0;

      // Ordem dos textos = ordem em que o Graphviz desenha: portas de cima,
      // cabeçalho, portas laterais, portas de baixo e status (ou status antes
      // das portas de baixo, quando não há portas embaixo).
      var rotulo = '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">' +
        (portas.cima.length
          ? linhaPortasComTexto(portas.cima, cabecalho, larguraCabecalho, "BOTTOM")
          : '<TR><TD COLSPAN="3" CELLPADDING="3" ALIGN="CENTER">' + cabecalho + '</TD></TR>') +
        // Portas laterais e área do ícone num bloco só: se o nome ao lado das
        // portas de cima alargar o equipamento, a sobra fica por fora do bloco e
        // as portas laterais continuam coladas no ícone.
        '<TR><TD COLSPAN="3"><TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0" FIXEDSIZE="TRUE" WIDTH="' + (2 * CONFIG_PORTA.largura + larguraIcone) + '" HEIGHT="' + alturaMeio + '"><TR>' + colunaPortas(portas.esquerda) +
        '<TD BORDER="0" CELLPADDING="0" WIDTH="' + larguraIcone + '" HEIGHT="' + alturaMeio + '"></TD>' +
        colunaPortas(portas.direita) + '</TR></TABLE></TD></TR>' +
        (portas.baixo.length
          ? linhaPortasComTexto(portas.baixo, htmlStatus, larguraStatus, "TOP")
          : '<TR><TD COLSPAN="3" CELLPADDING="' + (modo === "monitoramento" ? 2 : 4) + '" ALIGN="CENTER">' + htmlStatus + '</TD></TR>') +
        '</TABLE>>';
      return '    "' + escapar(eq.id) + '" [id="equip_' + dados.equipamentos.indexOf(eq) + '", label=' + rotulo + ', shape=plain, color="transparent", fontcolor="' + corFonte + '"];';
    }
    var grupos = {};
    dados.equipamentos.forEach(function (eq) {
      var grupo = String(eq.grupo || "").trim();
      if (!grupo) { linhas.push(linhaEquipamento(eq).replace(/^    /, "  ")); return; }
      if (!grupos[grupo]) grupos[grupo] = [];
      grupos[grupo].push(eq);
    });
    // O id do cluster usa o índice: derivar do nome fazia "Sala 1" e "Sala-1"
    // (ou "Rack Á" e "Rack É") virarem o mesmo cluster.
    Object.keys(grupos).forEach(function (grupo, indiceGrupo) {
      linhas.push('  subgraph "cluster_' + indiceGrupo + '" {');
      linhas.push('    id="grupo_' + indiceGrupo + '";');
      linhas.push('    label="' + escapar(grupo) + '";');
      linhas.push('    color="#6C8292"; style="rounded,dashed"; penwidth=1.0; fontname="Helvetica"; fontsize=9;');
      grupos[grupo].forEach(function (eq) { linhas.push(linhaEquipamento(eq)); });
      linhas.push("  }");
    });
    dados.conexoes.forEach(function (c, indice) {
      var corConexao = corValida(corDoCaboNoDesenho(c, equipamentoPorId, indice), "#5A7284");
      var grossura = Math.min(10, Number(c.grossura) || 2);
      var estiloCabo = c.estilo;
      // Monitoramento: cabo que chega a um equipamento offline fica vermelho e tracejado.
      if (modo === "monitoramento" && [c.de, c.para].some(function (id) { return equipamentoPorId[id] && equipamentoPorId[id].status === "offline"; })) {
        corConexao = corPorStatus("offline");
        estiloCabo = "dashed";
      }
      var estilo = estiloCabo && estiloCabo !== "solid" ? ', style="' + escapar(estiloCabo) + '"' : "";
      var portaDirecao = direcao === "TB" ? ', tailport="n", headport="s"' : ', tailport="e", headport="w"';
      var portas = ', tailport="out_' + indice + '", headport="in_' + indice + '"';
      if (direcao === "TB") portas = portaDirecao;
      if (direcao !== "TB") portas = portaDirecao;
      var capacidade = (c.potencia ? " · " + c.potencia : "") + (modo === "ftth" && c.distanciaKm != null ? " · " + String(c.distanciaKm).replace(".", ",") + " km" : "");
      var rotuloTexto = c.tipo ? c.tipo + capacidade : capacidade.replace(/^ · /, "");
      var rotulo = ' [id="edge_' + indice + '", label="' + escapar(rotuloTexto) + '", color="' + corConexao + '", fontcolor="#34495A", penwidth=' + Math.max(1, grossura) + estilo + portas + ']';
      linhas.push('  "' + escapar(c.de) + '" -> "' + escapar(c.para) + '"' + rotulo + ';');
    });
    linhas.push("}");
    return linhas.join("\n");
  }

  // Itens da legenda (tela e exportação): por tipo; no Monitoramento, a
  // contagem por status ("3 ativos", "1 offline").
  function itensDaLegenda(dados) {
    if (modoAtual() === "monitoramento") {
      var contagem = { ativo: 0, manutencao: 0, offline: 0 };
      dados.equipamentos.forEach(function (eq) { contagem[contagem[eq.status] != null ? eq.status : "ativo"]++; });
      return [["ativo", "ativo", "ativos"], ["manutencao", "em manutenção", "em manutenção"], ["offline", "offline", "offline"]].map(function (s) {
        var n = contagem[s[0]];
        return { cor: corPorStatus(s[0]), texto: n + " " + (n === 1 ? s[1] : s[2]), status: s[0] };
      });
    }
    var tipos = [];
    dados.equipamentos.forEach(function (eq) { var t = eq.tipo || "outro"; if (tipos.indexOf(t) < 0) tipos.push(t); });
    return tipos.map(function (t) { return { cor: corPorTipo(t), texto: t }; });
  }

  function atualizarLegenda(dados) {
    elLegenda.innerHTML = "";
    elLegenda.classList.toggle("legenda-status", modoAtual() === "monitoramento");
    itensDaLegenda(dados).forEach(function (item) {
      var span = document.createElement("span");
      if (item.status) span.setAttribute("data-status", item.status);
      var i = document.createElement("i"); i.style.background = item.cor;
      span.appendChild(i); span.appendChild(document.createTextNode(item.texto));
      // Quantidade de cada tipo (só na tela; a exportação usa itensDaLegenda).
      if (!item.status) {
        var n = dados.equipamentos.filter(function (eq) { return (eq.tipo || "outro") === item.texto; }).length;
        var b = document.createElement("b"); b.className = "legenda-qtd"; b.textContent = n;
        span.appendChild(b);
      }
      elLegenda.appendChild(span);
    });
    if (elLegenda.childNodes.length) {
      var fechar = document.createElement("button");
      fechar.type = "button"; fechar.className = "legenda-fechar-tipos"; fechar.textContent = "×";
      fechar.title = "Remover a legenda (volta em Camadas)"; fechar.setAttribute("aria-label", fechar.title);
      fechar.addEventListener("click", function () { ocultarCamada("tipos"); });
      elLegenda.appendChild(fechar);
    }
  }

  // Nomes das portas de cima e de baixo, na vertical (lidos de baixo para cima).
  // Pela ordem do rótulo (gerarDot): os primeiros textos do nó são as portas de
  // cima e os últimos, as de baixo; as caixas com borda seguem portasRenderizadas.
  function girarNomesDasPortasEmPe(svgEl) {
    if (!svgEl) return;
    svgEl.querySelectorAll("g.node").forEach(function (no) {
      var info = portasRenderizadas[idEquipamentoDoNode(no)];
      if (!info || !(info.nCima || info.nBaixo)) return;
      var textos = Array.prototype.slice.call(no.querySelectorAll("text"));
      var caixas = Array.prototype.filter.call(no.querySelectorAll("polygon"), function (p) {
        var s = String(p.getAttribute("stroke") || "").toLowerCase();
        return s && s !== "none" && s !== "transparent";
      });
      var pares = [];
      for (var i = 0; i < info.nCima; i++) pares.push([textos[i], caixas[i]]);
      var fim = textos.length - (info.statusAoLado ? 1 : 0);
      for (var j = 1; j <= info.nBaixo; j++) pares.push([textos[fim - j], caixas[info.ordem.length - j]]);
      pares.forEach(function (par) {
        var texto = par[0], caixa = par[1];
        if (!texto || !caixa) return;
        var b;
        try { b = caixa.getBBox(); } catch (e) { return; }
        var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        var tamanho = parseFloat(texto.getAttribute("font-size")) || 9;
        texto.setAttribute("x", cx.toFixed(2));
        texto.setAttribute("y", (cy + tamanho * 0.35).toFixed(2));
        texto.setAttribute("text-anchor", "middle");
        texto.setAttribute("transform", "rotate(-90 " + cx.toFixed(2) + " " + cy.toFixed(2) + ")");
      });
    });
  }

  // Filtro SVG que dá o tom da cor ao ícone mantendo claros e escuros do desenho
  // (blend "color": matiz e saturação da cor, luminosidade da imagem). Um por cor.
  function filtroCorIcone(defs, cor) {
    var id = "tom-" + cor.slice(1).toLowerCase();
    if (defs.querySelector("#" + id)) return id;
    var ns = "http://www.w3.org/2000/svg";
    var filtro = document.createElementNS(ns, "filter");
    filtro.setAttribute("id", id);
    filtro.setAttribute("color-interpolation-filters", "sRGB");
    [["feFlood", { "flood-color": cor, result: "cor" }],
     ["feBlend", { in: "cor", in2: "SourceGraphic", mode: "color", result: "tom" }],
     ["feComposite", { in: "tom", in2: "SourceAlpha", operator: "in" }]].forEach(function (p) {
      var el = document.createElementNS(ns, p[0]);
      Object.keys(p[1]).forEach(function (k) { el.setAttribute(k, p[1][k]); });
      filtro.appendChild(el);
    });
    defs.appendChild(filtro);
    return id;
  }

  // Ícones do catálogo desenhados sem quadro em volta (os demais já têm um).
  var COR_MOLDURA_ICONE = "#57555A";
  var ICONES_SEM_MOLDURA = ["CONCENTRADOR-HOTSPOT.png", "CONVERSOR-FIBRA.png", "CONVERSOR-MIDIA.png", "CX.png", "DECODER.png",
    "DEMUX.png", "DIO.png", "DWDM.png", "MIKROTIK.png", "MUX.png", "NUVEM-VPLS.png", "NVR.png", "OLT.png", "ONU.svg",
    "POE.png", "SERVIDOR.svg", "SWITCH-POE.png", "UNIFI.png"];
  function iconeSemMoldura(icone) {
    var arquivo = String(icone || "").split(/[\/]/).pop();
    return ICONES_SEM_MOLDURA.indexOf(arquivo) >= 0;
  }

  function aplicarImagensNoSvg(dados) {
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) return;

    var porId = {};
    dados.equipamentos.forEach(function (eq) {
      var imagem = nomeAtualDaImagem(eq.imagem) || imagemDoIcone(eq.icone);
      if (imagem) porId[eq.id] = imagem;
    });

    function bboxSeguro(elemento) {
      try { return elemento && elemento.getBBox ? elemento.getBBox() : null; }
      catch (e) { return null; }
    }

    function normalizarTexto(valor) {
      return String(valor || "").replace(/\s+/g, " ").trim();
    }

    svgEl.querySelectorAll("g.node").forEach(function (g) {
      var id = idEquipamentoDoNode(g);
      if (!id) return;
      var origemImagem = porId[id];
      if (!origemImagem) return;

      var equipamento = dados.equipamentos.find(function (eq) { return eq.id === id; });
      if (!equipamento) return;

      try {
        g.querySelectorAll("[data-equip-img='1']").forEach(function (imagemAntiga) {
          imagemAntiga.remove();
        });

        var bboxNode = g.getBBox();
        // Pela ordem do rótulo (gerarDot): portas de cima, nome, modelo (se
        // houver), tipo, IP (se houver), portas laterais, status, portas de baixo.
        // Comparar pelo texto falhava quando uma porta tinha o mesmo nome do modelo.
        var textos = Array.prototype.slice.call(g.querySelectorAll("text"));
        var infoPortas = portasRenderizadas[id] || { nCima: 0, nBaixo: 0 };
        var linhasCabecalho = linhasDoCabecalho(equipamento, modoAtual()).length;
        var cabecalho = textos.slice(infoPortas.nCima, infoPortas.nCima + linhasCabecalho);
        var statusTexto = (infoPortas.statusAoLado ? textos[textos.length - 1] : textos[textos.length - 1 - infoPortas.nBaixo]) || null;

        var fundoCabecalho = bboxNode.y + Math.min(36, bboxNode.height * 0.28);
        cabecalho.forEach(function (texto) {
          var box = bboxSeguro(texto);
          if (box) fundoCabecalho = Math.max(fundoCabecalho, box.y + box.height);
        });

        var topoStatus = bboxNode.y + bboxNode.height - Math.min(22, bboxNode.height * 0.18);
        var boxStatus = bboxSeguro(statusTexto);
        if (boxStatus) topoStatus = boxStatus.y;

        var areaTopo = fundoCabecalho + 5;
        var areaBaixo = topoStatus - 5;
        var areaAltura = Math.max(16, areaBaixo - areaTopo);

        var ehCatalogo = !!imagemDoIcone(equipamento.icone);
        var fator = tamanhoDoEquipamento(equipamento) / 100;
        var tamanhoDesejado = (ehCatalogo ? 84 : 48) * fator;
        var tam = Math.max(12, Math.min(tamanhoDesejado, areaAltura - 4, 108 * fator));

        var centroX = bboxNode.x + bboxNode.width / 2;
        var x = centroX - tam / 2;
        var y = areaTopo + (areaAltura - tam) / 2;

        // Ícone do catálogo sem moldura própria: ganha a mesma moldura do UPS/RPS
        // e o desenho encolhe para caber dentro dela.
        var moldura = null;
        if (!nomeAtualDaImagem(equipamento.imagem) && iconeSemMoldura(equipamento.icone)) {
          var traco = Math.max(1.5, tam * 0.045);
          moldura = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          moldura.setAttribute("data-equip-img", "1");
          moldura.setAttribute("class", "eq-moldura-icone");
          moldura.setAttribute("x", x + traco / 2);
          moldura.setAttribute("y", y + traco / 2);
          moldura.setAttribute("width", tam - traco);
          moldura.setAttribute("height", tam - traco);
          moldura.setAttribute("rx", tam * 0.04);
          moldura.setAttribute("fill", "none");
          moldura.setAttribute("stroke", COR_MOLDURA_ICONE);
          moldura.setAttribute("stroke-width", traco);
          moldura.setAttribute("pointer-events", "none");
          var interno = tam * 0.72;
          x += (tam - interno) / 2;
          y += (tam - interno) / 2;
          tam = interno;
        }

        var urlImagem = resolverUrlRelativa(origemImagem);
        var img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("data-equip-img", "1");
        // Na tela escura, o desenho do catálogo clareia (CSS); a imagem própria fica como veio.
        img.setAttribute("class", ehCatalogo && !nomeAtualDaImagem(equipamento.imagem) ? "eq-icone-catalogo" : "eq-icone-proprio");
        img.setAttributeNS("http://www.w3.org/1999/xlink", "href", urlImagem);
        img.setAttribute("href", urlImagem);
        img.setAttribute("x", x);
        img.setAttribute("y", y);
        img.setAttribute("width", tam);
        img.setAttribute("height", tam);
        img.setAttribute("preserveAspectRatio", "xMidYMid meet");
        img.setAttribute("pointer-events", "none");

        var clipId = "clip-" + id.replace(/[^a-zA-Z0-9]/g, "") + "-equip";
        var defs = svgEl.querySelector("defs");
        if (!defs) {
          defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          svgEl.insertBefore(defs, svgEl.firstChild);
        }
        var clipAntigo = defs.querySelector("#" + clipId);
        if (clipAntigo) clipAntigo.remove();

        var clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clip.setAttribute("id", clipId);
        var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", tam);
        rect.setAttribute("height", tam);
        rect.setAttribute("rx", 3);
        clip.appendChild(rect);
        defs.appendChild(clip);
        img.setAttribute("clip-path", "url(#" + clipId + ")");
        if (/^#[0-9a-f]{6}$/i.test(equipamento.corIcone || "")) img.setAttribute("filter", "url(#" + filtroCorIcone(defs, equipamento.corIcone) + ")");

        var primeiroTexto = g.querySelector("text");
        if (primeiroTexto) g.insertBefore(img, primeiroTexto);
        else g.appendChild(img);
        if (moldura) g.insertBefore(moldura, img);
      } catch (err) {}
    });
  }

  // Reposiciona todos os equipamentos pelo layout do Graphviz (veja organizarUmaVez).
  // "opcoes" é aceito por compatibilidade com quem chama window.organizarDiagramaAutomaticamente.
  function organizarDiagramaAutomaticamente(opcoes) {
    // Registra qualquer mudança pendente antes, e o organizar inteiro como um
    // único passo no desfazer (as renderizações do meio não entram).
    salvarLocal();
    var estadoAntes = ultimoEstadoHistorico;
    aplicandoHistorico = true;
    try {
      organizarUmaVez();
    } finally {
      aplicandoHistorico = false;
    }
    if (estadoAntes && estadoAntes !== JSON.stringify(estado)) {
      historicoDesfazer.push(JSON.parse(estadoAntes));
      if (historicoDesfazer.length > 50) historicoDesfazer.shift();
      historicoRefazer = [];
    }
    salvarLocal(true);
    atualizarBotoesHistorico();
    ajustarATela();
    atualizarJsonAvancado();
  }

  // Depois de organizar: equipamento ligado a um só vizinho anda (na vertical, se o
  // cabo sai pela lateral; na horizontal, se sai por cima/baixo) até a porta dele
  // ficar na mesma linha da porta do outro lado. O cabo sai reto, sem degrau.
  function alinharPortasDasPontas() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return false;
    var pontos = obterPontosDasPortas(svg), vizinhos = {}, mudou = false;
    estado.conexoes.forEach(function (c) {
      (vizinhos[c.de] = vizinhos[c.de] || {})[c.para] = true;
      (vizinhos[c.para] = vizinhos[c.para] || {})[c.de] = true;
    });
    var movidos = {};
    estado.conexoes.forEach(function (c, i) {
      var s = pontos[i + ":inicio"], e = pontos[i + ":fim"];
      if (!s || !e) return;
      [[c.para, e, s], [c.de, s, e]].some(function (par) {
        var id = par[0], meu = par[1], outro = par[2];
        if (movidos[id] || Object.keys(vizinhos[id] || {}).length !== 1) return false;
        var eq = estado.equipamentos.find(function (x) { return x.id === id; });
        if (!eq || !posicaoValida(eq.posicao)) return false;
        var lateral = Math.abs(meu.dx) > 0;
        var d = lateral ? outro.y - meu.y : outro.x - meu.x;
        if (Math.abs(d) < 0.5 || Math.abs(d) > 120) return false;
        eq.posicao = lateral ? { x: eq.posicao.x, y: eq.posicao.y + d } : { x: eq.posicao.x + d, y: eq.posicao.y };
        movidos[id] = true;
        mudou = true;
        return true;
      });
    });
    return mudou;
  }

  // Organizar = voltar ao layout do Graphviz: ele já respeita os grupos (clusters)
  // e a direção escolhida. Apaga as posições salvas e redesenha; na renderização
  // seguinte cada equipamento ganha posição nova a partir desse layout.
  function organizarUmaVez() {
    if (!estado.equipamentos.length) return;
    // Com mapa: ninguém sai do seu município nem os fixados se mexem; quem tem
    // município volta para dentro dele, os outros ficam onde estão.
    if (temRegioes() && !mapaSoDeFundo()) {
      var n = posicionarNosMunicipios(null);
      avisar(n ? n + (n === 1 ? " equipamento arrumado" : " equipamentos arrumados") + " dentro do seu município." : "Com mapa, o Organizar só arruma quem tem município. Escolha o município na edição do equipamento.");
      salvarLocal(); gerar();
      return;
    }
    var fixos = {};
    estado.equipamentos.forEach(function (eq) { if (eq.fixo && eq.posicao) fixos[eq.id] = eq.posicao; });
    estado.equipamentos.forEach(function (eq) { if (!fixos[eq.id]) { delete eq.posicao; delete eq.deslocamento; } });
    gerar();
    // Grade: o layout do Graphviz acima só serve para medir os equipamentos.
    if (selDirecao.value === "GRADE" && posicionarEmGrade()) gerar();
    if (selDirecao.value === "LADO" && posicionarGruposLadoALado()) gerar();
    arrumarDepoisDeOrganizar(); // rotas à mão saem; notas e desenhos longe vêm para perto
    gerar();
    if (alinharPortasDasPontas()) gerar();
    // Mapa só de fundo (uma cidade): reenquadra o mapa atrás do diagrama novo.
    if (temRegioes() && mapaSoDeFundo()) { encaixar(estado.mapa, caixaDosEquipamentos(), 180); salvarLocal(); gerar(); }
  }

  // Arruma blocos {w, h} em prateleiras (linhas), testando larguras máximas e
  // ficando com a que deixa o conjunto maior na folha. Grava bl.x/bl.y; retorna {w, h}.
  function empacotarEmPrateleiras(blocos, proporcao, entre) {
    function empacotar(limite) {
      var x = 0, y = 0, alturaLinha = 0, largura = 0;
      blocos.forEach(function (bl) {
        if (x > 0 && x + bl.w > limite) { x = 0; y += alturaLinha + entre; alturaLinha = 0; }
        bl.x = x; bl.y = y;
        x += bl.w + entre;
        alturaLinha = Math.max(alturaLinha, bl.h);
        largura = Math.max(largura, x - entre);
      });
      return { w: largura, h: y + alturaLinha };
    }
    var maiorBloco = Math.max.apply(null, blocos.map(function (bl) { return bl.w; }));
    var somaLarguras = blocos.reduce(function (s, bl) { return s + bl.w + entre; }, 0);
    var melhor = null;
    for (var t = 0; t <= 32; t++) {
      var limite = maiorBloco + (somaLarguras - maiorBloco) * t / 32;
      var r = empacotar(limite);
      var custo = Math.max(r.w / proporcao, r.h);
      if (!melhor || custo < melhor.custo - 1e-6) melhor = { limite: limite, custo: custo };
    }
    return empacotar(melhor.limite);
  }

  // "Grupos lado a lado": cada grupo mantém o próprio layout em camadas (quem
  // liga em quem, como no Esquerda → Direita), mas os grupos são arrumados em
  // linhas na proporção da folha do PDF, em vez de um embaixo do outro. Com
  // muitos equipamentos o desenho deixa de ficar alto e estreito.
  // O Graphviz calcula o layout de cada grupo sozinho, com caixas do tamanho
  // exato de cada equipamento (medido no desenho atual, já com as portas).
  function posicionarGruposLadoALado() {
    var svg = elCanvas.querySelector("svg");
    if (!svg || !vizInstancia) return false;
    var tamanhos = {}, somaX = 0, somaY = 0, n = 0;
    estado.equipamentos.forEach(function (eq) {
      var node = obterNodePorId(svg, eq.id);
      var b;
      try { b = node && node.getBBox(); } catch (e) { b = null; }
      if (!b || !b.width) return;
      tamanhos[eq.id] = { w: b.width, h: b.height };
      if (centrosBase[eq.id]) { somaX += centrosBase[eq.id].x; somaY += centrosBase[eq.id].y; n++; }
    });
    if (!n) return false;

    var MARGEM = 18, ROTULO = 30, ENTRE_BLOCOS = 56;
    var blocos = [];
    nomesDosGrupos(estado).forEach(function (nome) {
      var membros = estado.equipamentos.filter(function (eq) { return String(eq.grupo || "").trim() === nome && tamanhos[eq.id]; });
      if (membros.length) blocos.push({ membros: membros, grupo: true });
    });
    var soltos = estado.equipamentos.filter(function (eq) { return !String(eq.grupo || "").trim() && tamanhos[eq.id]; });
    if (soltos.length) blocos.push({ membros: soltos, grupo: false });
    if (blocos.length < 2) return posicionarEmGrade(); // um grupo só: não há o que pôr lado a lado

    function aspas(t) { return '"' + String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    try {
      blocos.forEach(function (bl) {
        var ids = {};
        bl.membros.forEach(function (eq) { ids[eq.id] = true; });
        var linhas = ["digraph G {", "  rankdir=LR; nodesep=0.55; ranksep=1.3; splines=false; pad=0;",
          '  node [shape=box, fixedsize=true, label=""];'];
        bl.membros.forEach(function (eq) {
          var t = tamanhos[eq.id];
          linhas.push("  " + aspas(eq.id) + " [width=" + (t.w / 72).toFixed(3) + ", height=" + (t.h / 72).toFixed(3) + "];");
        });
        estado.conexoes.forEach(function (c) {
          if (ids[c.de] && ids[c.para] && c.de !== c.para) linhas.push("  " + aspas(c.de) + " -> " + aspas(c.para) + ";");
        });
        linhas.push("}");
        var json = JSON.parse(vizInstancia.renderString(linhas.join("\n"), { format: "json" }));
        var bb = String(json.bb || "0,0,0,0").split(",").map(Number); // pt, y para cima
        bl.centros = {};
        (json.objects || []).forEach(function (o) {
          if (!o.pos || !ids[o.name]) return;
          var p = String(o.pos).split(",").map(Number);
          // No SVG o y cresce para baixo: a origem do bloco é o canto de cima.
          bl.centros[o.name] = { x: p[0] - bb[0], y: bb[3] - p[1] };
        });
        bl.w = (bb[2] - bb[0]) + (bl.grupo ? 2 * MARGEM : 0);
        bl.h = (bb[3] - bb[1]) + (bl.grupo ? ROTULO + MARGEM : 0);
      });
    } catch (e) {
      console.error("Grupos lado a lado: falha no layout, usando a grade.", e);
      return posicionarEmGrade();
    }

    // Blocos mais altos primeiro: as prateleiras ficam mais parelhas.
    blocos.sort(function (a, b) { return b.h - a.h; });
    var pagina = tamanhoPaginaMm();
    var total = empacotarEmPrateleiras(blocos, pagina.w / pagina.h, ENTRE_BLOCOS);
    var origemX = somaX / n - total.w / 2, origemY = somaY / n - total.h / 2;
    blocos.forEach(function (bl) {
      var x0 = origemX + bl.x + (bl.grupo ? MARGEM : 0);
      var y0 = origemY + bl.y + (bl.grupo ? ROTULO : 0);
      bl.membros.forEach(function (eq) {
        var c = bl.centros[eq.id];
        if (!c) return;
        eq.posicao = { x: x0 + c.x, y: y0 + c.y };
        delete eq.deslocamento;
      });
    });
    return true;
  }

  // Ordem dentro do grupo: começa pelo mais ligado e segue pelos vizinhos
  // (busca em largura), para equipamentos ligados ficarem lado a lado.
  function ordenarPorLigacoes(membros) {
    var noGrupo = {}, vizinhos = {};
    membros.forEach(function (eq) { noGrupo[eq.id] = eq; vizinhos[eq.id] = []; });
    estado.conexoes.forEach(function (c) {
      if (noGrupo[c.de] && noGrupo[c.para]) { vizinhos[c.de].push(c.para); vizinhos[c.para].push(c.de); }
    });
    var porGrau = membros.slice().sort(function (a, b) { return vizinhos[b.id].length - vizinhos[a.id].length; });
    var visitado = {}, ordem = [];
    porGrau.forEach(function (inicio) {
      if (visitado[inicio.id]) return;
      var fila = [inicio.id];
      visitado[inicio.id] = true;
      while (fila.length) {
        var id = fila.shift();
        ordem.push(noGrupo[id]);
        vizinhos[id].forEach(function (v) { if (!visitado[v]) { visitado[v] = true; fila.push(v); } });
      }
    });
    return ordem;
  }

  // "Grade por grupo": cada grupo vira um bloco com os equipamentos em linhas e
  // colunas, e os blocos são arrumados em prateleiras na proporção da folha do
  // PDF. Aproveita melhor a página que o layout em camadas, que com muitos
  // equipamentos fica alto e estreito. Grava eq.posicao; retorna false se não
  // houver o que medir.
  function posicionarEmGrade() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return false;
    var larguraMax = 0, alturaMax = 0, somaX = 0, somaY = 0, n = 0;
    estado.equipamentos.forEach(function (eq) {
      var node = obterNodePorId(svg, eq.id);
      var b;
      try { b = node && node.getBBox(); } catch (e) { b = null; }
      if (!b) return;
      larguraMax = Math.max(larguraMax, b.width);
      alturaMax = Math.max(alturaMax, b.height);
      if (centrosBase[eq.id]) { somaX += centrosBase[eq.id].x; somaY += centrosBase[eq.id].y; n++; }
    });
    if (!larguraMax || !n) return false;

    var ESPACO = 48, ROTULO = 30, MARGEM = 16, ENTRE_BLOCOS = 48;
    var celW = larguraMax + ESPACO, celH = alturaMax + ESPACO;
    var pagina = tamanhoPaginaMm();
    var proporcao = pagina.w / pagina.h;

    var blocos = [];
    nomesDosGrupos(estado).forEach(function (nome) {
      var membros = estado.equipamentos.filter(function (eq) { return String(eq.grupo || "").trim() === nome; });
      if (membros.length) blocos.push({ membros: membros, grupo: true });
    });
    var soltos = estado.equipamentos.filter(function (eq) { return !String(eq.grupo || "").trim(); });
    if (soltos.length) blocos.push({ membros: soltos, grupo: false });
    blocos.forEach(function (bl) {
      bl.membros = ordenarPorLigacoes(bl.membros);
      var qtd = bl.membros.length;
      // Colunas para o bloco ficar com a proporção da folha.
      bl.colunas = Math.max(1, Math.min(qtd, Math.round(Math.sqrt(qtd * celH / celW * proporcao))));
      bl.linhas = Math.ceil(qtd / bl.colunas);
      bl.w = bl.colunas * celW + (bl.grupo ? 2 * MARGEM : 0);
      bl.h = bl.linhas * celH + (bl.grupo ? ROTULO + MARGEM : 0);
    });

    // Prateleiras: testa larguras máximas e fica com a que deixa o conjunto
    // maior na folha (menor max(largura / proporção, altura)).
    function empacotar(limite) {
      var x = 0, y = 0, alturaLinha = 0, largura = 0;
      blocos.forEach(function (bl) {
        if (x > 0 && x + bl.w > limite) { x = 0; y += alturaLinha + ENTRE_BLOCOS; alturaLinha = 0; }
        bl.x = x; bl.y = y;
        x += bl.w + ENTRE_BLOCOS;
        alturaLinha = Math.max(alturaLinha, bl.h);
        largura = Math.max(largura, x - ENTRE_BLOCOS);
      });
      return { w: largura, h: y + alturaLinha };
    }
    var maiorBloco = Math.max.apply(null, blocos.map(function (bl) { return bl.w; }));
    var somaLarguras = blocos.reduce(function (s, bl) { return s + bl.w + ENTRE_BLOCOS; }, 0);
    var melhor = null;
    for (var t = 0; t <= 24; t++) {
      var limite = maiorBloco + (somaLarguras - maiorBloco) * t / 24;
      var r = empacotar(limite);
      var custo = Math.max(r.w / proporcao, r.h);
      if (!melhor || custo < melhor.custo - 1e-6) melhor = { limite: limite, custo: custo };
    }
    var total = empacotar(melhor.limite);

    // Centraliza onde o Graphviz tinha posto os equipamentos (dentro da área de desenho).
    var origemX = somaX / n - total.w / 2, origemY = somaY / n - total.h / 2;
    blocos.forEach(function (bl) {
      var x0 = origemX + bl.x + (bl.grupo ? MARGEM : 0);
      var y0 = origemY + bl.y + (bl.grupo ? ROTULO : 0);
      bl.membros.forEach(function (eq, i) {
        eq.posicao = { x: x0 + (i % bl.colunas) * celW + celW / 2, y: y0 + Math.floor(i / bl.colunas) * celH + celH / 2 };
        delete eq.deslocamento;
      });
    });
    return true;
  }

  // Projeto "grande": algum equipamento com muitas ligações (um núcleo).
  var LIGACOES_PARA_ESTRELA = 5;
  // Espaço entre o centro e a primeira camada: cresce com os cabos que passam ali.
  function vaoDaEstrela(grau) { return 110 + Math.min(grau || 0, 24) * 5; }
  // Largura do maior nome de cabo ligado ao equipamento (texto "tipo · capacidade").
  function larguraDoMaiorRotulo(id) {
    var maior = 0;
    estado.conexoes.forEach(function (c) {
      if (id && c.de !== id && c.para !== id) return;
      var texto = [c.tipo, c.potencia].filter(Boolean).join(" · ");
      if (/^LAG\s+(ae\d+|lag-?\d+)/i.test(c.tipo || "")) texto += " · 2×";
      maior = Math.max(maior, texto.length);
    });
    return Math.min(420, maior * 5.6);
  }
  // Distância horizontal a partir da qual o vizinho é de uma coluna (porta na
  // lateral do centro). Menor que a da coluna mais perto (meia largura do centro,
  // no mínimo 96, mais o vão) e maior que a metade da linha de baixo.
  function limiteLateralDaEstrela(grau) { return 96 + vaoDaEstrela(grau) * 0.75; }
  function maiorNumeroDeVizinhos(dados) {
    var vizinhos = {};
    dados.conexoes.forEach(function (c) {
      if (c.de === c.para) return;
      (vizinhos[c.de] = vizinhos[c.de] || {})[c.para] = true;
      (vizinhos[c.para] = vizinhos[c.para] || {})[c.de] = true;
    });
    return Object.keys(vizinhos).reduce(function (m, id) { return Math.max(m, Object.keys(vizinhos[id]).length); }, 0);
  }

  // Layout de fato usado: "Automático" vira estrela num projeto grande e
  // Esquerda → Direita nos demais.
  function direcaoEfetiva() {
    var valor = selDirecao.value;
    if (valor === "CENTRO") return "ESTRELA";
    if (valor === "AUTO") return maiorNumeroDeVizinhos(estado) >= LIGACOES_PARA_ESTRELA ? "ESTRELA" : "LR";
    return valor;
  }

  // "Centro (estrela)": o equipamento com mais ligações fica no meio; os
  // vizinhos dele se dividem em colunas à esquerda e à direita e numa linha
  // embaixo, e o que vem depois de cada vizinho segue para fora, em camadas.
  // Cada parte desligada do resto é arrumada assim, e as partes vão para
  // prateleiras na proporção da folha. Grava eq.posicao; false se não há o que medir.
  // Ordem natural de portas: xe-0/0/2 < xe-0/0/14 < et-0/0/1 (tipo, depois números).
  function compararPortas(a, b) {
    var pa = String(a).toLowerCase().match(/\d+|\D+/g) || [], pb = String(b).toLowerCase().match(/\d+|\D+/g) || [];
    for (var i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] === pb[i]) continue;
      var na = /^\d/.test(pa[i]), nb = /^\d/.test(pb[i]);
      if (na && nb) return Number(pa[i]) - Number(pb[i]);
      return pa[i] < pb[i] ? -1 : 1;
    }
    return pa.length - pb.length;
  }

  function posicionarEmEstrela() {
    var svg = elCanvas.querySelector("svg");
    if (!svg || !vizInstancia) return false;
    var tam = {}, somaX = 0, somaY = 0, n = 0;
    estado.equipamentos.forEach(function (eq) {
      var node = obterNodePorId(svg, eq.id);
      var b;
      try { b = node && node.getBBox(); } catch (e) { b = null; }
      if (!b || !b.width) return;
      tam[eq.id] = { w: b.width, h: b.height };
      if (centrosBase[eq.id]) { somaX += centrosBase[eq.id].x; somaY += centrosBase[eq.id].y; n++; }
    });
    if (!n) return false;

    var ordem = {}, vizinhos = {};
    estado.equipamentos.forEach(function (eq, i) { if (tam[eq.id]) { ordem[eq.id] = i; vizinhos[eq.id] = []; } });
    estado.conexoes.forEach(function (c) {
      if (!vizinhos[c.de] || !vizinhos[c.para] || c.de === c.para) return;
      if (vizinhos[c.de].indexOf(c.para) < 0) vizinhos[c.de].push(c.para);
      if (vizinhos[c.para].indexOf(c.de) < 0) vizinhos[c.para].push(c.de);
    });
    function porOrdem(a, b) { return ordem[a] - ordem[b]; }

    var ENTRE_PARTES = 90;
    function aspas(t) { return '"' + String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    // Layout em camadas (Graphviz) de um lado da estrela, a partir do centro.
    // Devolve { id: {x, y} } com o centro em (0, 0) e y para baixo.
    function camadasDoLado(centro, ids, rankdir, vao) {
      var dentro = {};
      ids.forEach(function (id) { dentro[id] = true; });
      // Vizinhos ligados entre si ficam lado a lado com portas viradas um para o
      // outro: precisam de mais espaço para os nomes das portas e dos cabos.
      var entreVizinhos = estado.conexoes.some(function (c) { return dentro[c.de] && dentro[c.para] && distancia[c.de] === distancia[c.para]; });
      var linhas = ["digraph G {", "  rankdir=" + rankdir + "; nodesep=" + (entreVizinhos ? "2.4" : "0.95") + "; ranksep=" + (vao / 72).toFixed(2) + "; splines=false; pad=0;",
        '  node [shape=box, fixedsize=true, label=""];', "  " + aspas(centro) + " [width=0.1, height=0.1];"];
      ids.forEach(function (id) {
        linhas.push("  " + aspas(id) + " [width=" + (tam[id].w / 72).toFixed(3) + ", height=" + (tam[id].h / 72).toFixed(3) + "];");
      });
      // Cabos sempre "para fora" (do mais perto do centro para o mais longe).
      var vistos = {};
      estado.conexoes.forEach(function (c) {
        var a = c.de, b = c.para;
        var aDentro = dentro[a] || a === centro, bDentro = dentro[b] || b === centro;
        if (!aDentro || !bDentro || a === b) return;
        if (distancia[a] > distancia[b]) { var t = a; a = b; b = t; }
        if (vistos[a + "\n" + b]) return;
        vistos[a + "\n" + b] = true;
        linhas.push("  " + aspas(a) + " -> " + aspas(b) + (distancia[a] === distancia[b] ? " [constraint=false]" : "") + ";");
      });
      linhas.push("}");
      var json = JSON.parse(vizInstancia.renderString(linhas.join("\n"), { format: "json" }));
      var bruto = {};
      (json.objects || []).forEach(function (o) {
        if (!o.pos) return;
        var p = String(o.pos).split(",").map(Number);
        bruto[o.name] = { x: p[0], y: -p[1] };
      });
      var c0 = bruto[centro] || { x: 0, y: 0 };
      var r = {};
      ids.forEach(function (id) { if (bruto[id]) r[id] = { x: bruto[id].x - c0.x, y: bruto[id].y - c0.y }; });
      // Cada camada alinhada pela borda voltada para o centro (o Graphviz centraliza
      // pela largura, e nomes compridos deixavam a coluna torta).
      var eixo = rankdir === "TB" ? "y" : "x", sinal = rankdir === "RL" ? -1 : 1;
      var borda = {};
      ids.forEach(function (id) {
        if (!r[id]) return;
        var meio = (eixo === "x" ? tam[id].w : tam[id].h) / 2;
        var d = distancia[id];
        borda[d] = Math.min(borda[d] == null ? Infinity : borda[d], sinal * r[id][eixo] - meio);
      });
      ids.forEach(function (id) {
        if (!r[id]) return;
        var meio = (eixo === "x" ? tam[id].w : tam[id].h) / 2;
        r[id][eixo] = sinal * (borda[distancia[id]] + meio);
      });
      return r;
    }

    var restantes = Object.keys(vizinhos);
    var blocos = [], distancia = {};
    while (restantes.length) {
      // Centro da parte: o mais ligado (empate: o que vem primeiro na lista).
      var centro = restantes.slice().sort(function (a, b) { return vizinhos[b].length - vizinhos[a].length || porOrdem(a, b); })[0];
      var visto = {}, fila = [centro];
      visto[centro] = true;
      distancia[centro] = 0;
      while (fila.length) {
        var atual = fila.shift();
        vizinhos[atual].forEach(function (v) { if (!visto[v]) { visto[v] = true; distancia[v] = distancia[atual] + 1; fila.push(v); } });
      }
      restantes = restantes.filter(function (id) { return !visto[id]; });

      // Ramos: o que continua ligado entre si sem passar pelo centro fica junto
      // (ex.: conversores que chegam no mesmo DIO).
      var ramoDe = {}, ramos = [];
      // Vizinhos na ordem das portas do centro (xe-0/0/14 antes de xe-0/0/33):
      // as colunas seguem a mesma ordem das portas e os cabos não se cruzam.
      var portaNoCentro = {};
      estado.conexoes.forEach(function (c) {
        var outro = c.de === centro ? c.para : c.para === centro ? c.de : null;
        if (!outro) return;
        var porta = c.de === centro ? c.saida : c.chegada;
        if (porta && (portaNoCentro[outro] == null || compararPortas(porta, portaNoCentro[outro]) < 0)) portaNoCentro[outro] = porta;
      });
      function porPorta(a, b) {
        var pa = portaNoCentro[a], pb = portaNoCentro[b];
        if (pa && pb) return compararPortas(pa, pb) || porOrdem(a, b);
        return pa ? -1 : pb ? 1 : porOrdem(a, b);
      }
      vizinhos[centro].slice().sort(porPorta).forEach(function (raiz) {
        if (ramoDe[raiz] != null) return;
        var ramo = [], pilha = [raiz];
        ramoDe[raiz] = ramos.length;
        while (pilha.length) {
          var id = pilha.pop();
          ramo.push(id);
          vizinhos[id].forEach(function (v) { if (v !== centro && ramoDe[v] == null) { ramoDe[v] = ramos.length; pilha.push(v); } });
        }
        ramos.push(ramo);
      });

      // Divide os ramos em duas colunas, esquerda e direita, equilibradas pelo
      // número de equipamentos. Ninguém vai para baixo do centro: fica tudo em
      // coluna, na ordem das portas.
      var lados = { esquerda: [], direita: [], baixo: [] };
      var carga = { esquerda: 0, direita: 0, baixo: 0 };
      var pesos = { direita: 0.5, esquerda: 0.5 };
      ramos.map(function (ramo, i) { return { ramo: ramo, i: i }; })
        .sort(function (a, b) { return b.ramo.length - a.ramo.length || a.i - b.i; })
        .forEach(function (item) {
          var melhor = null;
          Object.keys(pesos).forEach(function (lado) {
            var custo = (carga[lado] + item.ramo.length) / pesos[lado];
            if (!melhor || custo < melhor.custo - 1e-9) melhor = { lado: lado, custo: custo };
          });
          lados[melhor.lado].push(item);
          carga[melhor.lado] += item.ramo.length;
        });
      function idsDoLado(lado) {
        return lados[lado].sort(function (a, b) { return a.i - b.i; }).reduce(function (t, item) { return t.concat(item.ramo); }, []);
      }

      // O vão entre o centro e as colunas precisa caber o maior nome de cabo.
      var vao = Math.max(vaoDaEstrela(vizinhos[centro].length), larguraDoMaiorRotulo(centro) + 90);
      var limite = limiteLateralDaEstrela(vizinhos[centro].length);
      var metadeW = tam[centro].w / 2, metadeH = tam[centro].h / 2;
      var pos = {};
      pos[centro] = { x: 0, y: 0 };
      var alturaColunas = 0;
      try {
        // A linha de baixo precisa caber no vão entre as colunas (é o que dá a
        // porta embaixo do centro, ladoNaEstrela); o que não cabe vai para os lados.
        var pb = null, idsBaixo, minX, maxX, pertoY;
        while ((idsBaixo = idsDoLado("baixo")).length) {
          pb = camadasDoLado(centro, idsBaixo, "TB", vao);
          minX = Infinity; maxX = -Infinity; pertoY = Infinity;
          idsBaixo.forEach(function (id) {
            minX = Math.min(minX, pb[id].x - tam[id].w / 2); maxX = Math.max(maxX, pb[id].x + tam[id].w / 2);
            pertoY = Math.min(pertoY, pb[id].y - tam[id].h / 2);
          });
          if ((maxX - minX) / 2 <= limite - 10) break;
          var sobra = lados.baixo.pop();
          var lado = carga.esquerda < carga.direita ? "esquerda" : "direita";
          lados[lado].push(sobra);
          carga[lado] += sobra.ramo.length;
          pb = null;
        }
        [["direita", "LR", 1], ["esquerda", "RL", -1]].forEach(function (cfg) {
          var ids = idsDoLado(cfg[0]);
          if (!ids.length) return;
          var p = camadasDoLado(centro, ids, cfg[1], vao);
          var minY = Infinity, maxY = -Infinity, perto = Infinity;
          ids.forEach(function (id) {
            minY = Math.min(minY, p[id].y - tam[id].h / 2); maxY = Math.max(maxY, p[id].y + tam[id].h / 2);
            perto = Math.min(perto, cfg[2] * p[id].x - tam[id].w / 2);
          });
          var meio = (minY + maxY) / 2, alt = maxY - minY;
          alturaColunas = Math.max(alturaColunas, alt);
          // Coluna centrada no centro, com a borda de dentro a um vão dele.
          ids.forEach(function (id) { pos[id] = { x: p[id].x + cfg[2] * (metadeW + vao - perto), y: p[id].y - meio }; });
        });
        if (pb) {
          var meioX = (minX + maxX) / 2;
          // Embaixo, na altura em que as colunas terminam (no vão entre elas).
          var topo = Math.max(metadeH + vao * 0.6, alturaColunas / 2 - 20);
          idsBaixo.forEach(function (id) { pos[id] = { x: pb[id].x - meioX, y: pb[id].y + (topo - pertoY) }; });
        }
      } catch (e) {
        console.error("Centro (estrela): falha no layout, usando a grade.", e);
        return posicionarEmGrade();
      }

      var bl = { ids: Object.keys(pos), pos: pos };
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      bl.ids.forEach(function (id) {
        var p = pos[id], t = tam[id];
        minX = Math.min(minX, p.x - t.w / 2); maxX = Math.max(maxX, p.x + t.w / 2);
        minY = Math.min(minY, p.y - t.h / 2); maxY = Math.max(maxY, p.y + t.h / 2);
      });
      bl.minX = minX; bl.minY = minY; bl.w = maxX - minX; bl.h = maxY - minY;
      blocos.push(bl);
    }

    // A parte principal primeiro; as soltas vão em prateleiras ao lado/abaixo.
    blocos.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
    var pagina = tamanhoPaginaMm();
    var total = blocos.length > 1 ? empacotarEmPrateleiras(blocos, pagina.w / pagina.h, ENTRE_PARTES) : (blocos[0].x = 0, blocos[0].y = 0, { w: blocos[0].w, h: blocos[0].h });
    var origemX = somaX / n - total.w / 2, origemY = somaY / n - total.h / 2;
    blocos.forEach(function (bl) {
      bl.ids.forEach(function (id) {
        var eq = estado.equipamentos[ordem[id]];
        eq.posicao = { x: origemX + bl.x + bl.pos[id].x - bl.minX, y: origemY + bl.y + bl.pos[id].y - bl.minY };
        delete eq.deslocamento;
      });
    });
    return true;
  }

  window.organizarDiagramaAutomaticamente = organizarDiagramaAutomaticamente;
  window.GrafoCores = corPorTipo;

  // O que outros módulos (compartilhar.js) podem ler do editor.
  window.GrafoApp = {
    projetoAtual: function () { return projetoAtual; },
    nomesProjetos: function () { return Object.keys(projetos); },
    // Desenho atual como SVG completo (moldura e imagens embutidas); "" sem diagrama.
    svgDoDiagrama: async function () {
      var svgEl = elCanvas.querySelector("svg");
      if (!svgEl) return "";
      var copia = await prepararSvgParaExportacao(svgEl, false);
      adicionarMolduraDeExportacao(copia);
      return new XMLSerializer().serializeToString(copia);
    },
    avisar: function (texto) { avisar(texto); },
    // Janela do próprio Grafo (no lugar do prompt/confirm do navegador): { title, message, kind: "prompt"|"confirm", defaultValue, confirmText }.
    janela: function (opcoes) { return abrirModal(opcoes); },
    // Paleta de comandos (comandos.js): abrir o editor de um equipamento e trocar de projeto.
    editarEquipamento: function (id) { var eq = estado.equipamentos.find(function (e) { return e.id === id; }); if (eq) abrirEditorEquipamento(eq); return !!eq; },
    idDoNo: function (no) { return idEquipamentoDoNode(no); },
    redesenhar: function () { solicitarAtualizacaoDiagrama(); },
    trocarProjeto: function (nome) { var sel = document.getElementById("projetoSelect"); if (!sel || !projetos[nome]) return false; sel.value = nome; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; },
    // Usados por equipe.js (projetos de equipe).
    dadosProjeto: function (nome) {
      if (nome === projetoAtual) return clonarDados(estado);
      return projetos[nome] ? clonarDados(projetos[nome]) : null;
    },
    // Alteração de um colega: troca os dados do projeto (e redesenha se estiver aberto).
    substituirProjeto: function (nome, dados) {
      var r = Esquema.validarProjeto(dados, "reparar");
      projetos[nome] = r.dados;
      if (nome !== projetoAtual) { salvarLocal(true); return; }
      estado = clonarDados(r.dados);
      // O desfazer da versão anterior não vale mais: voltaria a versão do colega.
      historicoDesfazer = [];
      historicoRefazer = [];
      ultimoEstadoHistorico = JSON.stringify(estado);
      aplicandoHistorico = true;
      try {
        renderTudo();
        if (estado.equipamentos.length) gerar(); else limparDiagrama();
      } finally {
        aplicandoHistorico = false;
      }
      atualizarBotoesHistorico();
    },
    removerProjeto: function (nome) { removerProjetoDaLista(nome); },
    // Usados por racks.js (Bayface de Racks). As regras físicas ficam no esquema,
    // que também valida o projeto ao abrir, importar e sincronizar.
    racksDoProjeto: function () {
      return { racks: clonarDados(estado.racks || []), cabos: clonarDados(estado.cabosRack || []) };
    },
    salvarRacks: function (racks, cabos) {
      var r = Esquema.validarRacksDoProjeto(racks, cabos);
      if (!r.ok) return r;
      estado.racks = r.dados.racks;
      estado.cabosRack = r.dados.cabos;
      renderTudo();
      return r;
    },
    // Documentos antigos guardados no projeto (biblioteca.js os migra para a Biblioteca).
    documentosDoProjeto: function () { return clonarDados(estado.documentos || []); },
    salvarDocumentos: function (lista) {
      var r = Esquema.validarProjeto({ equipamentos: [], conexoes: [], documentos: lista }, "estrito");
      if (!r.ok) return r;
      estado.documentos = r.dados.documentos || [];
      renderTudo();
      return r;
    },
    equipamentosDoDiagrama: function () {
      return estado.equipamentos.map(function (eq) { return { id: eq.id, nome: eq.nome, tipo: eq.tipo || "", modelo: eq.modelo || "" }; });
    },
    bibliotecasPdf: async function () {
      var JsPdf = await carregarJsPdf();
      await carregarSvg2Pdf();
      return JsPdf;
    },
    baixarArquivo: function (blob, nome) { baixarBlob(blob, nome); },
    mostrarErro: function (texto, detalhes) { mostrarErro(texto, detalhes); },
    // Usados por integracao.js (NetBox + agente).
    // Cria um projeto novo com os dados de um POP. Retorna o nome, ou null se recusado.
    importarProjetoExterno: function (dados, origem) {
      var resultado = Esquema.validarProjeto(dados, "estrito");
      if (!resultado.ok) { mostrarErrosDeValidacao(origem, resultado); return null; }
      if (Object.keys(projetos).length >= LIMITES.projetos) {
        mostrarErro("Não foi possível importar: o limite é de " + LIMITES.projetos + " projetos. Exclua algum antes.");
        return null;
      }
      var nomeValido = Esquema.validarNomeProjeto(dados.projeto || "");
      var base = nomeValido.ok ? nomeValido.dados : "POP importado";
      var nome = base;
      for (var i = 2; projetos[nome]; i++) nome = base.slice(0, LIMITES.nomeProjeto - 5) + " (" + i + ")";
      salvarLocal();
      projetos[nome] = resultado.dados;
      abrirProjeto(nome);
      salvarLocal();
      mostrarAvisosDaImportacao(origem, resultado);
      return nome;
    },
    ipsDoProjeto: function () {
      return estado.equipamentos.map(function (eq) { return (eq.ip || "").split("/")[0]; }).filter(Boolean);
    },
    // mapa: { ip: { online } }. Equipamento em manutenção não muda. Retorna quantos mudaram.
    atualizarStatusOnline: function (mapa) {
      var mudou = 0;
      estado.equipamentos.forEach(function (eq) {
        var r = mapa[(eq.ip || "").split("/")[0]];
        if (!r || eq.status === "manutencao") return;
        var novo = r.online ? "ativo" : "offline";
        if (eq.status !== novo) { eq.status = novo; mudou++; }
      });
      if (mudou) renderTudo();
      return mudou;
    },
    // Usado por historico.js: volta o projeto para uma versão guardada. Entra no
    // desfazer como um passo (Ctrl+Z volta para como estava antes de restaurar).
    restaurarDados: function (nome, dados) {
      if (nome !== projetoAtual) {
        // Projeto excluído que volta pelo histórico: recriado com o mesmo nome.
        if (!projetos[nome]) { projetos[nome] = projetoVazio(); renderProjetos(); }
        abrirProjeto(nome);
      }
      var r = Esquema.validarProjeto(dados, "reparar");
      estado = clonarDados(r.dados);
      selecao = {};
      ajustarNaProximaRenderizacao = true;
      renderTudo();
      if (estado.equipamentos.length) gerar(); else limparDiagrama();
      return r.ajustes.length;
    },
    // Usados por primeiros-passos.js.
    // Abre o projeto e a janela do equipamento (QR code das etiquetas). false se não achar.
    mostrarEquipamento: function (projeto, id) {
      if (projeto && projeto !== projetoAtual) {
        if (!projetos[projeto]) return false;
        abrirProjeto(projeto);
        elProjetoSelect.value = projeto;
      }
      var eq = estado.equipamentos.find(function (item) { return item.id === id; });
      if (!eq) return false;
      abrirEditorEquipamento(eq);
      return true;
    },
    carregarJsPdf: function () { return carregarJsPdf(); },
    // O que o editor pode precisar depois de aberto, para guardar no aparelho e
    // funcionar sem internet: gerador de PDF, ícones dos equipamentos e a cópia
    // embutida deles (exportação).
    arquivosParaGuardar: function () {
      var icones = CATALOGO_ICONES.map(function (item) { return item.arquivo; });
      return [URL_JSPDF, URL_SVG2PDF, "./assets/js/editor/icones-embutidos.js"].concat(icones);
    },
    resumoAtual: function () { return { equipamentos: estado.equipamentos.length, conexoes: estado.conexoes.length }; },
    carregarExemplo: function () { carregarExemplo(); },
    // Abre um formulário da barra lateral ("navAddEquip" ou "navAddCable"),
    // expandindo o menu antes, se estiver recolhido (celular).
    abrirPainelLateral: function (id) {
      var painel = document.getElementById(id);
      var item = document.querySelector('.nav-item[data-nav-panel="' + id + '"]');
      if (!painel || !item) return;
      if (elSidebar.classList.contains("collapsed")) definirSidebarRecolhida(false);
      // Seção do menu fechada pelo título (interface.js): abre antes.
      var secao = item.closest(".nav-section");
      if (secao && secao.classList.contains("fechada")) secao.querySelector(".nav-label").click();
      fecharPaineisLaterais();
      painel.classList.add("open");
      item.classList.add("active");
      if (id === "navAddCable") renderSidebarPanels();
      item.scrollIntoView({ behavior: "smooth", block: "start" });
      var campo = painel.querySelector("input, select");
      if (campo) setTimeout(function () { campo.focus({ preventScroll: true }); }, 350);
    },
    abrirPdf: function () {
      abrirPainelPagina(true);
      if (telaCelular.matches) elPainelPagina.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    salvar: function () { salvarLocal(true); },
    atualizarListaProjetos: function () { renderProjetos(); }
  };

  // O Graphviz (WebAssembly) carrega de forma assíncrona; depois disso a
  // renderização é síncrona. Chamadas a gerar() antes do carregamento ficam pendentes.
  // Sem inicializador: gerar() pode ser chamado antes desta linha executar.
  var vizInstancia;
  var gerarPendente;
  // Centraliza/ajusta o zoom na primeira renderização e ao trocar de projeto.
  var ajustarNaProximaRenderizacao = true;

  // Entrada do diagrama ao abrir, importar ou organizar: os equipamentos surgem em
  // sequência e os cabos se desenham. Edições pequenas não animam (só redesenham).
  var movimentoReduzido = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var timerRevelar = null;
  function revelarDiagrama() {
    var svg = elCanvas.querySelector("svg");
    if (!svg || movimentoReduzido.matches) return;
    svg.querySelectorAll("g.node").forEach(function (no, i) { no.style.setProperty("--i", Math.min(i, 30)); });
    svg.querySelectorAll("g.edge").forEach(function (aresta, i) {
      aresta.style.setProperty("--i", Math.min(i, 40));
      aresta.querySelectorAll("path").forEach(function (caminho) {
        try { caminho.style.setProperty("--len", Math.ceil(caminho.getTotalLength()) + 1); } catch (e) {}
      });
    });
    svg.classList.add("revelando");
    clearTimeout(timerRevelar);
    timerRevelar = setTimeout(function () { svg.classList.remove("revelando"); }, 2600);
  }

  // Passar o mouse num equipamento acende os cabos dele e os vizinhos; o resto esmaece.
  function ativarFocoAoPassar() {
    var svg = elCanvas.querySelector("svg");
    if (!svg) return;
    var arestasPorEquip = {};
    svg.querySelectorAll("g.edge").forEach(function (aresta) {
      var c = conexaoDaAresta(aresta);
      if (!c) return;
      (arestasPorEquip[c.de] = arestasPorEquip[c.de] || []).push({ aresta: aresta, outro: c.para });
      (arestasPorEquip[c.para] = arestasPorEquip[c.para] || []).push({ aresta: aresta, outro: c.de });
    });
    var nosPorEquip = {};
    svg.querySelectorAll("g.node").forEach(function (no) { var id = idEquipamentoDoNode(no); if (id) nosPorEquip[id] = no; });
    function limpar() {
      svg.classList.remove("focando");
      svg.querySelectorAll(".foco, .vizinho, .ligado").forEach(function (el) { el.classList.remove("foco", "vizinho", "ligado"); });
    }
    Object.keys(nosPorEquip).forEach(function (id) {
      var no = nosPorEquip[id];
      no.addEventListener("pointerenter", function (ev) {
        if (ev.buttons || svg.classList.contains("revelando")) return;
        limpar();
        var ligacoes = arestasPorEquip[id] || [];
        if (!ligacoes.length) return;
        svg.classList.add("focando");
        no.classList.add("foco");
        ligacoes.forEach(function (l) {
          l.aresta.classList.add("ligado");
          if (nosPorEquip[l.outro]) nosPorEquip[l.outro].classList.add("vizinho");
        });
      });
      no.addEventListener("pointerleave", limpar);
      no.addEventListener("pointerdown", limpar);
    });
  }
  var equipamentoFixoNaSeparacao = null;
  Viz.instance().then(function (viz) {
    vizInstancia = viz;
    if (gerarPendente) { gerarPendente = false; gerar(); }
  }).catch(function (e) {
    mostrarErro("Não foi possível carregar o Graphviz.\nDetalhe: " + e.message);
  });

  function gerar() {
    window.clearTimeout(atualizacaoDiagramaPendente);
    if (!vizInstancia) { gerarPendente = true; return; }
    // Erros de uma ação anterior somem ao redesenhar; avisos ficam até a pessoa fechar.
    if (!elErro.classList.contains("aviso")) esconderErro();
    removerConexoesOrfas();
    try { validarDados(estado); } catch (e) { mostrarErro(e.message); return; }

    // Se o estado já está registrado no histórico, o que mudar aqui é só o que
    // a renderização recalcula (posições): não vira um passo a mais no desfazer.
    // Se há uma mudança pendente (ex.: arrastar), ela é registrada no fim, junto.
    var jaRegistrado = JSON.stringify(estado) === ultimoEstadoHistorico;
    var svgAntigo = elCanvas.querySelector("svg");
    var ancoraAntiga =svgAntigo && !ajustarNaProximaRenderizacao ? ancoraDoSvg(svgAntigo) : null;
    var focado = document.activeElement && document.activeElement.closest ? document.activeElement.closest("#canvas g.node") : null;
    var idFocado = focado ? idEquipamentoDoNode(focado) : null;
    // Ninguém tem posição (projeto importado ou "Organizar"): é a hora do layout inicial.
    var semPosicoes = estado.equipamentos.every(function (eq) { return !posicaoValida(eq.posicao); });

    try {
      renderizarSvg();
      // Equipamento novo só ganha posição depois de renderizado; renderiza de
      // novo para as portas dele irem para o lado certo.
      if (sincronizarPosicoes()) { renderizarSvg(); sincronizarPosicoes(); }
      // Estrela: duas rodadas, porque as portas mudam de lado (e o tamanho das
      // caixas muda) depois da primeira.
      if (semPosicoes && direcaoEfetiva() === "ESTRELA") {
        for (var passo = 0; passo < 2 && posicionarEmEstrela(); passo++) { renderizarSvg(); sincronizarPosicoes(); }
      }
      aplicarPosicoesEquipamentos();
      ajustarCaixasDosGrupos();
      var fixo = equipamentoFixoNaSeparacao;
      equipamentoFixoNaSeparacao = null;
      // Grupos mudaram de lugar: renderiza de novo para as portas acompanharem.
      // As portas podem trocar de lado e mudar o tamanho das caixas, então
      // confere de novo (até 3 rodadas) até nenhuma caixa encostar em outra.
      for (var rodada = 0; rodada < 3 && (separarEquipamentosSobrepostos(fixo) | separarGruposSobrepostos(fixo)); rodada++) {
        renderizarSvg();
        sincronizarPosicoes();
        aplicarPosicoesEquipamentos();
        ajustarCaixasDosGrupos();
      }
      rotearCabosOrtogonalmente();
      desenharDesenhos(); // formas, textos e caneta (10-desenho-e-ferramentas.js)
      desenharAnotacoes(); // antes do viewBox: as anotações também contam na área do desenho
      desenharLegendaCabos(); // legenda automática das ligações (cor de cada cabo)
      desenharMapa(); // mapa de regiões no fundo (12-mapa-de-regioes.js)
      ajustarViewBoxAoConteudo(false);
      var revelarAgora = ajustarNaProximaRenderizacao;
      if (ajustarNaProximaRenderizacao) {
        ajustarNaProximaRenderizacao = false;
        ajustarATela();
      } else {
        // O viewBox novo pode ter outra origem: compensa o pan para o
        // diagrama continuar no mesmo lugar da tela.
        if (ancoraAntiga) {
          var ancoraNova = ancoraDoSvg(elCanvas.querySelector("svg"));
          canvasView.x += (ancoraAntiga.x - ancoraNova.x) * canvasView.scale;
          canvasView.y += (ancoraAntiga.y - ancoraNova.y) * canvasView.scale;
        }
        aplicarCanvasView();
      }
      ativarArrasteDosEquipamentos();
      ativarEdicaoDosCabos();
      ativarSelecaoDosCabos();
      ativarLigacaoPeloMouse();
      ativarFocoAoPassar();
      if (revelarAgora) revelarDiagrama();
      aplicarBusca();
      aplicarCaminho();
      aplicarImagensNoSvg(estado);
      girarNomesDasPortasEmPe(elCanvas.querySelector("svg"));
      desenharLinksDeDiagrama();
      aplicarCamadas();
      atualizarLegenda(estado);
      btnCopiar.disabled = false;
      btnBaixar.disabled = false;
      btnBaixarPng.disabled = false;
      if (idFocado) {
        var noFocado = obterNodePorId(elCanvas.querySelector("svg"), idFocado);
        // Devolver o foco não é "clicar" no equipamento: não mexe na seleção.
        if (noFocado) {
          focoPorCliqueComModificador = true;
          try { noFocado.focus({ preventScroll: true }); } finally { focoPorCliqueComModificador = false; }
        }
      }
      salvarLocal(jaRegistrado);
      solicitarPrevia();
    } catch (e) {
      mostrarErro("Não foi possível desenhar o diagrama.\nDetalhe: " + e.message);
    }
  }

  // Uma conexão só existe com os dois equipamentos no diagrama. As exclusões já
  // levam os cabos junto; isto é a rede de segurança para qualquer outro caminho.
  function removerConexoesOrfas() {
    var ids = {};
    estado.equipamentos.forEach(function (eq) { ids[eq.id] = true; });
    var validas = estado.conexoes.filter(function (c) { return ids[c.de] && ids[c.para] && c.de !== c.para; });
    if (validas.length !== estado.conexoes.length) estado.conexoes = validas;
  }

  function renderizarSvg() {
    var dot = gerarDot(estado, direcaoEfetiva());
    ultimoDot = dot;
    idsEquipRenderizados = estado.equipamentos.map(function (eq) { return eq.id; });
    conexoesRenderizadas = estado.conexoes.slice();
    elDotCode.textContent = dot;
    elCanvas.classList.remove("vazio");
    elCanvas.innerHTML = vizInstancia.renderString(dot, { format: "svg" });
    registrarCentrosBase(elCanvas.querySelector("svg"));
  }

  // Posição (px, sem zoom) da origem do g.graph dentro do SVG.
  function ancoraDoSvg(svg) {
    var grafo = svg.querySelector("g.graph");
    var vb = svg.viewBox.baseVal;
    var matriz = grafo && grafo.transform.baseVal.consolidate();
    var m = matriz ? matriz.matrix : { e: 0, f: 0 };
    var pxPorUnidade = vb && vb.width ? tamanhoNaturalSvg(svg).largura / vb.width : 4 / 3;
    return { x: (m.e - (vb ? vb.x : 0)) * pxPorUnidade, y: (m.f - (vb ? vb.y : 0)) * pxPorUnidade };
  }

  window.gerar = gerar;

  btnGerar.addEventListener("click", gerar);
  btnOrganizar.addEventListener("click", function () { organizarDiagramaAutomaticamente(); });

  // Direção do layout: lembrada neste navegador e aplicada na hora
  // (antes só valia no próximo "Organizar").
  try { if (/^(AUTO|CENTRO|LR|TB|GRADE|LADO)$/.test(localStorage.getItem("grafo-direcao"))) selDirecao.value = localStorage.getItem("grafo-direcao"); } catch (e) {}
  selDirecao.addEventListener("change", function () {
    try { localStorage.setItem("grafo-direcao", selDirecao.value); } catch (e) {}
    if (estado.equipamentos.length) organizarDiagramaAutomaticamente();
  });

  btnCopiar.addEventListener("click", function () {
    if (!ultimoDot) return;
    try {
      navigator.clipboard.writeText(ultimoDot).then(function () { avisar("Código DOT copiado."); }, function () {});
      var original = btnCopiar.textContent;
      btnCopiar.textContent = "Copiado!";
      setTimeout(function () { btnCopiar.textContent = original; }, 1400);
    } catch (e) {}
  });

  // ==== 12-mapa-de-regioes.js: Mapa Regional — municípios (GeoJSON/TopoJSON/SVG) e imagem no fundo do diagrama (parte de assets/js/editor/app.js; npm run montar) ====
  // estado.mapa = {
  //   regioes: [{ nome, codigo, d, transform?, oculta?, cor? }],  municípios já projetados (largura ~1000)
  //   largura, altura, x, y, escala,                                onde o mapa fica no desenho
  //   estilo ("referencia" | "grafo"), cor, contorno, sombra, nomes, cabosPretos,
  //   imagem: { src (data URL), largura, altura, x, y, escala, rotacao, opacidade, visivel, bloqueado }
  // }
  // Equipamentos com eq.municipio vão para um ponto dentro do município (não o
  // centro da caixa, que em município torto cai fora). Os cabos continuam os do
  // diagrama: o traçado no mapa é esquemático, não o caminho real da fibra; a
  // distância é a cadastrada no cabo (nunca calculada pelo desenho).

  var MAPA_LARGURA_BASE = 1000;
  var MAPA_MAX_CARACTERES = 1500000; // soma dos caminhos (cabe no salvamento)
  var IMAGEM_MAX_LADO = 3000, IMAGEM_MAX_BYTES = 3500000;
  var ESTILOS_MAPA = {
    referencia: { cor: "#008A2E", contorno: "#000000", sombra: true, cabosPretos: true },
    grafo: { cor: "#CFE6D6", contorno: "#5A7284", sombra: false, cabosPretos: false }
  };
  var COR_MAPA_PADRAO = ESTILOS_MAPA.referencia.cor;

  function temRegioes() { return !!(estado.mapa && estado.mapa.regioes && estado.mapa.regioes.length); }
  function temImagemDeFundo() { return !!(estado.mapa && estado.mapa.imagem && estado.mapa.imagem.src); }
  function mapaAtivo() { return temRegioes() || temImagemDeFundo(); }
  function regioesVisiveis() { return temRegioes() ? estado.mapa.regioes.filter(function (r) { return !r.oculta; }) : []; }

  // ---- Leitura dos arquivos ----
  // Coordenadas geográficas → plano: equirretangular corrigido pela latitude
  // média (bom para municípios e regiões), y para baixo, largura MAPA_LARGURA_BASE.
  // Coordenadas fora de -180..180 / -90..90 são tratadas como já projetadas
  // (UTM, Mercator...): só escala, mantendo a proporção.
  function projetarAneis(poligonos) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    poligonos.forEach(function (p) { p.aneis.forEach(function (anel) { anel.forEach(function (c) {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]; if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    }); }); });
    if (!isFinite(minX)) return null;
    var geografico = minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
    var kx = geografico ? Math.cos(((minY + maxY) / 2) * Math.PI / 180) : 1;
    var largura = (maxX - minX) * kx || 1, altura = (maxY - minY) || 1;
    var esc = MAPA_LARGURA_BASE / largura;
    function ponto(c) { return [(c[0] - minX) * kx * esc, (maxY - c[1]) * esc]; } // norte para cima
    var regioes = poligonos.map(function (p) {
      var d = p.aneis.map(function (anel) {
        var saida = [], ultimo = null;
        anel.forEach(function (c) {
          var q = ponto(c);
          if (ultimo && Math.abs(q[0] - ultimo[0]) + Math.abs(q[1] - ultimo[1]) < 0.7) return; // tira pontos colados
          saida.push(q[0].toFixed(1) + " " + q[1].toFixed(1));
          ultimo = q;
        });
        return saida.length > 2 ? "M" + saida.join("L") + "Z" : "";
      }).join("");
      return { nome: p.nome, codigo: p.codigo, d: d };
    }).filter(function (r) { return r.d; });
    return { regioes: regioes, largura: MAPA_LARGURA_BASE, altura: Math.max(1, Math.round(altura * esc)), geografico: geografico };
  }
  function propriedade(props, chaves) {
    props = props || {};
    for (var i = 0; i < chaves.length; i++) if (props[chaves[i]] != null && String(props[chaves[i]]).trim()) return String(props[chaves[i]]).trim();
    return "";
  }
  function nomeDaFeicao(props) { return propriedade(props, ["NM_MUN", "nome", "NOME", "name", "NAME", "NM_MUNICIP", "municipio", "MUNICIPIO", "cidade", "CIDADE", "NM_UF"]).slice(0, 80); }
  function codigoDaFeicao(props) { return propriedade(props, ["CD_MUN", "CD_GEOCMU", "CD_MUNICIP", "codigo_ibge", "cod_ibge", "geocodigo", "GEOCODIGO", "id"]).slice(0, 20); }
  function poligonosDaGeometria(geo, nome, codigo, saida) {
    if (!geo) return;
    if (geo.type === "Polygon") saida.push({ nome: nome, codigo: codigo, aneis: geo.coordinates });
    else if (geo.type === "MultiPolygon") geo.coordinates.forEach(function (pol) { saida.push({ nome: nome, codigo: codigo, aneis: pol }); });
    else if (geo.type === "GeometryCollection") (geo.geometries || []).forEach(function (g) { poligonosDaGeometria(g, nome, codigo, saida); });
  }
  function lerGeoJson(obj) {
    if (!obj || !obj.type) throw new Error("não é um GeoJSON (falta \"type\").");
    var feicoes = obj.type === "FeatureCollection" ? obj.features : obj.type === "Feature" ? [obj] : [{ geometry: obj, properties: {} }];
    var poligonos = [], ignoradas = 0;
    (feicoes || []).forEach(function (f) {
      var antes = poligonos.length;
      poligonosDaGeometria(f && f.geometry, nomeDaFeicao(f && f.properties), codigoDaFeicao(f && f.properties), poligonos);
      if (poligonos.length === antes) ignoradas++;
    });
    // Um município com várias partes (ilhas, MultiPolygon) vira uma região só.
    var porChave = {}, juntos = [];
    poligonos.forEach(function (p) {
      var chave = p.codigo || p.nome;
      if (chave && porChave[chave]) { porChave[chave].aneis = porChave[chave].aneis.concat(p.aneis); return; }
      var novo = { nome: p.nome, codigo: p.codigo, aneis: p.aneis.slice() };
      if (chave) porChave[chave] = novo;
      juntos.push(novo);
    });
    var r = projetarAneis(juntos);
    if (r) r.ignoradas = ignoradas;
    return r;
  }
  // TopoJSON (formato padrão do mapshaper): arcos compartilhados + transform.
  function lerTopoJson(topo) {
    var t = topo.transform;
    var arcos = (topo.arcs || []).map(function (arco) {
      var x = 0, y = 0;
      return arco.map(function (p) {
        if (t) { x += p[0]; y += p[1]; return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; }
        return p.slice(0, 2);
      });
    });
    function arco(i) { return i >= 0 ? arcos[i] : arcos[~i].slice().reverse(); }
    function anel(indices) {
      var pts = [];
      indices.forEach(function (i, k) { var a = arco(i); pts = pts.concat(k ? a.slice(1) : a); });
      return pts;
    }
    function geometria(g) {
      if (!g) return null;
      if (g.type === "Polygon") return { type: "Polygon", coordinates: g.arcs.map(anel) };
      if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.arcs.map(function (pol) { return pol.map(anel); }) };
      if (g.type === "GeometryCollection") return { type: "GeometryCollection", geometries: (g.geometries || []).map(geometria) };
      return null;
    }
    var feicoes = [];
    Object.keys(topo.objects || {}).forEach(function (k) {
      var obj = topo.objects[k];
      var lista = obj.type === "GeometryCollection" ? obj.geometries : [obj];
      (lista || []).forEach(function (g) { feicoes.push({ type: "Feature", properties: g.properties || {}, geometry: geometria(g) }); });
    });
    return lerGeoJson({ type: "FeatureCollection", features: feicoes });
  }
  // SVG vetorial (mapshaper ou outro programa): cada path/polygon vira uma região.
  // Só os atributos d/points/id/data-name são lidos; nada do SVG é executado.
  function lerSvgDeMapa(texto) {
    var doc = new DOMParser().parseFromString(texto, "image/svg+xml");
    var svg = doc.querySelector("svg");
    if (!svg || doc.querySelector("parsererror")) throw new Error("SVG inválido.");
    var vb = String(svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    var largura = vb.length === 4 && vb[2] ? vb[2] : parseFloat(svg.getAttribute("width")) || 1000;
    var altura = vb.length === 4 && vb[3] ? vb[3] : parseFloat(svg.getAttribute("height")) || 1000;
    var ox = vb.length === 4 ? vb[0] : 0, oy = vb.length === 4 ? vb[1] : 0;
    var esc = MAPA_LARGURA_BASE / largura;
    var regioes = [];
    svg.querySelectorAll("path, polygon").forEach(function (el) {
      var d = el.tagName.toLowerCase() === "polygon" ? "M" + String(el.getAttribute("points") || "").trim().replace(/\s+/g, " L") + "Z" : el.getAttribute("d");
      if (!d || !/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(d)) return;
      var nome = el.getAttribute("data-name") || el.getAttribute("id") || (el.querySelector("title") || {}).textContent || "";
      regioes.push({ nome: String(nome).slice(0, 80), codigo: "", d: d, transform: "translate(" + (-ox * esc).toFixed(3) + "," + (-oy * esc).toFixed(3) + ") scale(" + esc.toFixed(6) + ")" });
    });
    return { regioes: regioes, largura: MAPA_LARGURA_BASE, altura: Math.round(altura * esc), geografico: false };
  }
  function lerArquivoDeMapa(nome, texto) {
    if (/\.(shp|kml|kmz|dbf|zip)$/i.test(nome)) throw new Error("esse formato não é lido direto. Abra no mapshaper.org e exporte em GeoJSON, TopoJSON ou SVG.");
    if (/\.svg$/i.test(nome) || /^\s*<(\?xml|svg)/i.test(texto)) return lerSvgDeMapa(texto);
    var obj;
    try { obj = JSON.parse(texto); } catch (e) { throw new Error("o arquivo não é JSON válido (GeoJSON/TopoJSON)."); }
    if (obj && obj.type === "Topology") return lerTopoJson(obj);
    return lerGeoJson(obj);
  }

  // ---- Imagem de fundo (PNG, JPG, SVG) ----
  // SVG é limpo (sem scripts, eventos, foreignObject, links externos) e entra
  // como imagem: nada dele roda. Imagem grande é reduzida para caber no salvamento.
  function limparSvg(texto) {
    var doc = new DOMParser().parseFromString(texto, "image/svg+xml");
    var svg = doc.querySelector("svg");
    if (!svg || doc.querySelector("parsererror")) throw new Error("SVG inválido.");
    doc.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video").forEach(function (e) { e.remove(); });
    doc.querySelectorAll("*").forEach(function (e) {
      Array.prototype.slice.call(e.attributes).forEach(function (a) {
        var n = a.name.toLowerCase(), v = String(a.value || "").trim().toLowerCase();
        if (n.indexOf("on") === 0) e.removeAttribute(a.name);
        else if ((n === "href" || n === "xlink:href") && !/^(#|data:image\/(png|jpe?g|gif);)/.test(v)) e.removeAttribute(a.name);
        else if (/javascript:|url\(\s*['"]?\s*(https?:|\/\/)/.test(v)) e.removeAttribute(a.name);
      });
    });
    return new XMLSerializer().serializeToString(svg);
  }
  function carregarImagem(src) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { falha(new Error("não deu para abrir a imagem.")); };
      img.src = src;
    });
  }
  async function prepararImagemDeFundo(arquivo) {
    var ehSvg = /\.svg$/i.test(arquivo.name) || arquivo.type === "image/svg+xml";
    var src;
    if (ehSvg) {
      var limpo = limparSvg(await arquivo.text());
      src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(limpo)));
    } else {
      if (!/^image\/(png|jpe?g)$/.test(arquivo.type)) throw new Error("use PNG, JPG ou SVG.");
      src = await new Promise(function (ok) { var l = new FileReader(); l.onload = function () { ok(String(l.result)); }; l.readAsDataURL(arquivo); });
    }
    var img = await carregarImagem(src);
    var w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
    var grande = !ehSvg && (Math.max(w, h) > IMAGEM_MAX_LADO || src.length > IMAGEM_MAX_BYTES);
    if (grande) {
      var f = Math.min(1, IMAGEM_MAX_LADO / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.round(w * f); c.height = Math.round(h * f);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      src = c.toDataURL("image/jpeg", 0.86);
      w = c.width; h = c.height;
    }
    if (src.length > IMAGEM_MAX_BYTES) throw new Error("imagem pesada demais mesmo reduzida (máx. ~2,5 MB).");
    return { src: src, largura: w, altura: h };
  }

  // ---- Posição ----
  function caixaDosEquipamentos() {
    var svg = elCanvas.querySelector("svg"), caixa = null;
    if (svg) svg.querySelectorAll("g.node").forEach(function (n) {
      try {
        var b = n.getBBox(), t = translateDoElemento(n);
        var c = { x1: b.x + t.x, y1: b.y + t.y, x2: b.x + t.x + b.width, y2: b.y + t.y + b.height };
        caixa = caixa ? { x1: Math.min(caixa.x1, c.x1), y1: Math.min(caixa.y1, c.y1), x2: Math.max(caixa.x2, c.x2), y2: Math.max(caixa.y2, c.y2) } : c;
      } catch (e) {}
    });
    return caixa || { x1: 0, y1: 0, x2: 1200, y2: 800 };
  }
  // Encaixa um objeto {largura, altura, x, y, escala} em volta da caixa dada.
  function encaixar(obj, caixa, folga) {
    var w = caixa.x2 - caixa.x1 + 2 * folga, h = caixa.y2 - caixa.y1 + 2 * folga;
    var esc = Math.max(w / obj.largura, h / obj.altura);
    obj.escala = Math.round(esc * 1000) / 1000;
    obj.x = Math.round((caixa.x1 + caixa.x2) / 2 - obj.largura * esc / 2);
    obj.y = Math.round((caixa.y1 + caixa.y2) / 2 - obj.altura * esc / 2);
  }
  // Caixa (em coordenadas do mapa) das regiões visíveis.
  function caixaDasRegioesVisiveis() {
    var svg = elCanvas.querySelector("svg"), caixa = null;
    if (!svg) return null;
    svg.querySelectorAll("g.camada-mapa g.mapa-regioes > path").forEach(function (p) {
      try {
        var b = p.getBBox(), m = p.getAttribute("transform");
        var s = 1, tx = 0, ty = 0;
        if (m) { var mm = /translate\(([-\d.e]+),([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(m); if (mm) { tx = +mm[1]; ty = +mm[2]; s = +mm[3]; } }
        var c = { x1: b.x * s + tx, y1: b.y * s + ty, x2: (b.x + b.width) * s + tx, y2: (b.y + b.height) * s + ty };
        caixa = caixa ? { x1: Math.min(caixa.x1, c.x1), y1: Math.min(caixa.y1, c.y1), x2: Math.max(caixa.x2, c.x2), y2: Math.max(caixa.y2, c.y2) } : c;
      } catch (e) {}
    });
    return caixa;
  }

  // Ponto bem dentro do município (aproxima o "polo de inacessibilidade"):
  // grade de pontos na caixa, fica com o de dentro mais longe da borda.
  function pontoInterno(pathEl) {
    var b;
    try { b = pathEl.getBBox(); } catch (e) { return null; }
    if (!b.width || !b.height || !pathEl.isPointInFill) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    var N = 24, dentro = [], fora = [];
    for (var i = 0; i <= N; i++) for (var j = 0; j <= N; j++) {
      var p = { x: b.x + b.width * i / N, y: b.y + b.height * j / N };
      var pt = pathEl.ownerSVGElement.createSVGPoint(); pt.x = p.x; pt.y = p.y;
      (pathEl.isPointInFill(pt) ? dentro : fora).push(p);
    }
    if (!dentro.length) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    var melhor = dentro[0], dist = -1;
    dentro.forEach(function (p) {
      // A borda da caixa também conta como "fora" (região que enche a caixa inteira).
      var borda = Math.min(p.x - b.x, b.x + b.width - p.x, p.y - b.y, b.y + b.height - p.y);
      var d = borda * borda;
      fora.forEach(function (q) { var dd = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y); if (dd < d) d = dd; });
      if (d > dist) { dist = d; melhor = p; }
    });
    return melhor;
  }
  function regiaoPorNome(nome) {
    if (!temRegioes() || !nome) return -1;
    var alvo = normalizarTextoEquipamento(nome);
    for (var i = 0; i < estado.mapa.regioes.length; i++) {
      var r = estado.mapa.regioes[i];
      if (normalizarTextoEquipamento(r.nome) === alvo || (r.codigo && r.codigo === String(nome).trim())) return i;
    }
    return -1;
  }
  // Centro (coordenadas do desenho) para um equipamento no município; vários no
  // mesmo município ficam um embaixo do outro.
  function pontoNoMunicipio(nome, ordem) {
    var i = regiaoPorNome(nome);
    if (i < 0) return null;
    var svg = elCanvas.querySelector("svg");
    var path = svg && svg.querySelector('g.camada-mapa g.mapa-regioes > path[data-regiao="' + i + '"]');
    if (!path) return null;
    var p = pontoInterno(path);
    if (!p) return null;
    var r = estado.mapa.regioes[i], s = 1, tx = 0, ty = 0;
    var mm = r.transform && /translate\(([-\d.e]+),([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(r.transform);
    if (mm) { tx = +mm[1]; ty = +mm[2]; s = +mm[3]; }
    var m = estado.mapa, esc = Number(m.escala) || 1;
    // Segundo, terceiro...: em volta do primeiro, só em lugares dentro do
    // município (cidade pequena não joga o equipamento para fora).
    if (ordem) {
      var passo = 260 / (esc * s); // ~260 unidades do desenho (um equipamento), em unidades do caminho
      var volta = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
      var dentro = [];
      [1, 0.6, 0.35].forEach(function (f) {
        volta.forEach(function (v) {
          var q = { x: p.x + v[0] * passo * f, y: p.y + v[1] * passo * f };
          var pt = path.ownerSVGElement.createSVGPoint(); pt.x = q.x; pt.y = q.y;
          if (path.isPointInFill && path.isPointInFill(pt) && !dentro.some(function (d) { return Math.abs(d.x - q.x) < passo * 0.3 && Math.abs(d.y - q.y) < passo * 0.3; })) dentro.push(q);
        });
      });
      p = dentro[ordem - 1] || { x: p.x, y: p.y + ordem * 170 / (esc * s) };
    }
    return { x: Math.round(m.x + (p.x * s + tx) * esc), y: Math.round(m.y + (p.y * s + ty) * esc) };
  }
  // Quantos municípios do mapa têm equipamento. Com menos de 2, o mapa é só o
  // fundo: o diagrama não é rearrumado por cidade (ficaria tudo empilhado).
  function municipiosComEquipamento() {
    var usados = {};
    estado.equipamentos.forEach(function (eq) { var i = regiaoPorNome(eq.municipio); if (i >= 0) usados[i] = true; });
    return Object.keys(usados).length;
  }
  function mapaSoDeFundo() { return municipiosComEquipamento() < 2; }
  // Põe os equipamentos com município dentro dele (os fixados ficam onde estão).
  // Cidade com 3 ou mais equipamentos: o grupo inteiro vai junto, mantendo o
  // desenho dele (não espalha um POP grande em volta de um ponto).
  function posicionarNosMunicipios(ids) {
    if (!temRegioes()) return 0;
    var contagem = {}, n = 0, grupos = {};
    estado.equipamentos.forEach(function (eq) {
      if (!eq.municipio || eq.fixo || (ids && ids.indexOf(eq.id) < 0)) return;
      var k = normalizarTextoEquipamento(eq.municipio);
      (grupos[k] = grupos[k] || []).push(eq);
    });
    var movidos = {};
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      if (g.length < 3 || !g.every(function (eq) { return posicaoValida(eq.posicao); })) return;
      var alvo = pontoNoMunicipio(g[0].municipio, 0);
      if (!alvo) return;
      var cx = g.reduce(function (s2, eq) { return s2 + eq.posicao.x; }, 0) / g.length;
      var cy = g.reduce(function (s2, eq) { return s2 + eq.posicao.y; }, 0) / g.length;
      g.forEach(function (eq) { eq.posicao = { x: Math.round(eq.posicao.x + alvo.x - cx), y: Math.round(eq.posicao.y + alvo.y - cy) }; delete eq.deslocamento; movidos[eq.id] = true; n++; });
    });
    estado.equipamentos.forEach(function (eq) {
      if (movidos[eq.id]) return;
      if (!eq.municipio) return;
      var k = normalizarTextoEquipamento(eq.municipio);
      var ordem = contagem[k] || 0;
      contagem[k] = ordem + 1;
      if (ids && ids.indexOf(eq.id) < 0) return;
      if (eq.fixo) return;
      var ponto = pontoNoMunicipio(eq.municipio, ordem);
      if (ponto) { eq.posicao = ponto; delete eq.deslocamento; n++; }
    });
    return n;
  }

  // ---- Desenho ----
  function desenharMapa() {
    var svg = elCanvas.querySelector("svg"), grafo = svg && svg.querySelector("g.graph");
    if (!grafo) return;
    var antigo = grafo.querySelector("g.camada-mapa");
    if (antigo) antigo.remove();
    document.body.classList.toggle("com-mapa", mapaAtivo());
    if (!mapaAtivo() || camadasOcultas().mapa) return;
    var m = estado.mapa;
    var NS = "http://www.w3.org/2000/svg";
    function no(tag, at, pai) {
      var e = document.createElementNS(NS, tag);
      Object.keys(at).forEach(function (k) { if (at[k] != null) e.setAttribute(k, at[k]); });
      if (pai) pai.appendChild(e);
      return e;
    }
    var camada = no("g", { "class": "camada-mapa", "pointer-events": "none" });
    // Atrás de tudo: logo depois do fundo do Graphviz.
    var primeiroG = Array.prototype.find.call(grafo.children, function (c) { return c.tagName.toLowerCase() === "g"; });
    grafo.insertBefore(camada, primeiroG || null);

    // Imagem de fundo (abaixo dos municípios).
    if (temImagemDeFundo() && m.imagem.visivel !== false) {
      var im = m.imagem, ei = Number(im.escala) || 1;
      var cx = im.largura * ei / 2, cy = im.altura * ei / 2;
      var gImg = no("g", { "class": "mapa-imagem", transform: "translate(" + (im.x || 0) + "," + (im.y || 0) + ") rotate(" + (Number(im.rotacao) || 0) + " " + cx + " " + cy + ")" }, camada);
      var el = no("image", { width: im.largura * ei, height: im.altura * ei, opacity: im.opacidade == null ? 1 : im.opacidade, preserveAspectRatio: "none" }, gImg);
      el.setAttributeNS("http://www.w3.org/1999/xlink", "href", im.src);
      el.setAttribute("href", im.src);
    }
    if (!temRegioes()) return;
    var esc = Number(m.escala) || 1;
    var g = no("g", { "class": "mapa-municipios", transform: "translate(" + (m.x || 0) + "," + (m.y || 0) + ") scale(" + esc + ")" }, camada);
    var traco = 1.4 / esc;
    var cor = /^#[0-9a-f]{6}$/i.test(m.cor || "") ? m.cor : COR_MAPA_PADRAO;
    var contorno = /^#[0-9a-f]{6}$/i.test(m.contorno || "") ? m.contorno : "#000000";
    if (m.sombra !== false) {
      var sombra = no("g", { "class": "mapa-sombra", transform: "translate(" + (7 / esc) + "," + (7 / esc) + ")", fill: "#000000" }, g);
      m.regioes.forEach(function (r) { if (!r.oculta) no("path", { d: r.d, transform: r.transform || null }, sombra); });
    }
    var regioes = no("g", { "class": "mapa-regioes", fill: cor, stroke: contorno, "stroke-width": traco, "stroke-linejoin": "round" }, g);
    m.regioes.forEach(function (r, i) {
      if (r.oculta) return;
      var p = no("path", { d: r.d, transform: r.transform || null, "data-regiao": i, fill: /^#[0-9a-f]{6}$/i.test(r.cor || "") ? r.cor : null }, regioes);
      if (r.nome) no("title", {}, p).textContent = r.nome;
    });
    if (m.nomes && !camadasOcultas().cidades) {
      var claro = (function () { var h = cor.replace("#", ""); var l = 0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16); return l < 140; })();
      var nomes = no("g", { "class": "mapa-nomes", "font-family": "Helvetica, Arial, sans-serif", "font-weight": "bold", fill: claro ? "#FFFFFF" : "#16323D", "fill-opacity": 0.6, "text-anchor": "middle" }, g);
      regioes.querySelectorAll("path").forEach(function (p) {
        var r = m.regioes[Number(p.getAttribute("data-regiao"))];
        if (!r || !r.nome) return;
        var b;
        try { b = p.getBBox(); } catch (e) { return; }
        var s = 1, mm = r.transform && /scale\(([-\d.e]+)\)/.exec(r.transform);
        if (mm) s = +mm[1];
        if (b.width * s * esc < 70) return; // região pequena demais para o nome
        var pi = pontoInterno(p) || { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        var t = no("text", { x: pi.x, y: pi.y, "font-size": 12 / esc / s }, nomes);
        if (r.transform) t.setAttribute("transform", r.transform);
        t.textContent = r.nome.toUpperCase();
      });
    }
    // Textos legíveis sobre o mapa: contorno claro e fino atrás das letras.
    svg.querySelectorAll("g.node > text, g.edge > text, g.cluster > text").forEach(function (t) {
      t.setAttribute("stroke", "#FFFFFF"); t.setAttribute("stroke-opacity", "0.85"); t.setAttribute("stroke-width", "2"); t.setAttribute("stroke-linejoin", "round"); t.setAttribute("paint-order", "stroke");
    });
  }

  // ---- Gerar automaticamente: malha municipal do IBGE ----
  // Fonte: IBGE, API de Malhas v3 (malha municipal vigente) e API de Localidades
  // v1 (nomes). Serviço público e gratuito; os contornos não são inventados.
  var UFS_IBGE = { AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41,
    PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17 };
  var URL_IBGE = "https://servicodados.ibge.gov.br/api/";
  async function baixarJson(url) {
    var resposta = await fetch(url, { cache: "force-cache" });
    if (!resposta.ok) throw new Error("o IBGE respondeu " + resposta.status + ".");
    return resposta.json();
  }
  // Acha o município citado no nome do equipamento ("... | Ibiruba - Coprel" → Ibirubá).
  function municipioNoNome(nomeEquip, nomes) {
    var alvo = " " + normalizarTextoEquipamento(nomeEquip).replace(/[^a-z0-9]+/g, " ") + " ";
    var melhor = "";
    nomes.forEach(function (n) {
      var k = normalizarTextoEquipamento(n).replace(/[^a-z0-9]+/g, " ").trim();
      if (k.length >= 4 && alvo.indexOf(" " + k + " ") >= 0 && k.length > normalizarTextoEquipamento(melhor).length) melhor = n;
    });
    return melhor;
  }
  // Siglas de localidade da Anatel (CNL): "POP-TPA01" → TPA → Tapera. Arquivo
  // data/cnl-siglas.json, carregado só quando precisa.
  var siglasCnl = null;
  async function carregarSiglasCnl() {
    if (siglasCnl) return siglasCnl;
    try { siglasCnl = (await (await fetch("./data/cnl-siglas.json")).json()).siglas || {}; } catch (e) { siglasCnl = {}; }
    return siglasCnl;
  }
  // Sigla CNL no nome do POP: o pedaço de 2 a 4 letras (com número junto ou não)
  // logo depois de "POP", ou qualquer pedaço assim que exista na tabela da UF.
  function municipioPelaSigla(nomeEquip, tabela) {
    if (!tabela) return "";
    var partes = String(nomeEquip || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    var candidatos = [];
    partes.forEach(function (p, i) {
      var m = /^([A-Z]{2,4})\d{0,3}$/.exec(p);
      if (!m) return;
      if (i > 0 && partes[i - 1] === "POP") candidatos.unshift(m[1]); else candidatos.push(m[1]);
    });
    for (var i = 0; i < candidatos.length; i++) if (tabela[candidatos[i]] && candidatos[i] !== "POP") return tabela[candidatos[i]];
    return "";
  }
  async function gerarMapaIbge(uf, soDoDiagrama, detalhado) {
    var codigo = UFS_IBGE[uf];
    if (!codigo) throw new Error("escolha o estado.");
    var dados = await Promise.all([
      baixarJson(URL_IBGE + "v3/malhas/estados/" + codigo + "?formato=application/vnd.geo%2Bjson&qualidade=" + (detalhado ? "intermediaria" : "minima") + "&intrarregiao=municipio"),
      baixarJson(URL_IBGE + "v1/localidades/estados/" + codigo + "/municipios")
    ]);
    var nomePorCodigo = {};
    (dados[1] || []).forEach(function (m) { nomePorCodigo[String(m.id)] = m.nome; });
    var nomes = Object.keys(nomePorCodigo).map(function (k) { return nomePorCodigo[k]; });
    var feicoes = (dados[0].features || []).map(function (f) {
      var cod = String((f.properties || {}).codarea || "");
      return { type: "Feature", geometry: f.geometry, properties: { NM_MUN: nomePorCodigo[cod] || cod, CD_MUN: cod } };
    });
    // Equipamentos sem município: primeiro a sigla CNL da Anatel no nome do POP
    // (POP-TPA01 → Tapera), depois a cidade escrita no nome.
    var tabelaUf = (await carregarSiglasCnl())[uf];
    var preenchidos = 0;
    estado.equipamentos.forEach(function (eq) {
      if (eq.municipio) return;
      var pelaSigla = municipioPelaSigla(eq.nome, tabelaUf);
      var oficial = pelaSigla && nomes.find(function (n) { return normalizarTextoEquipamento(n) === normalizarTextoEquipamento(pelaSigla); });
      var achado = oficial || municipioNoNome(eq.nome, nomes);
      if (achado) { eq.municipio = achado; preenchidos++; }
    });
    var usados = {};
    estado.equipamentos.forEach(function (eq) { if (eq.municipio) usados[normalizarTextoEquipamento(eq.municipio)] = true; });
    var naoAchados = Object.keys(usados).filter(function (k) { return !nomes.some(function (n) { return normalizarTextoEquipamento(n) === k; }); });
    if (soDoDiagrama) {
      if (!Object.keys(usados).length) throw new Error("nenhum equipamento tem município (nem no nome). Preencha o Município ou desmarque \"Só os municípios do diagrama\".");
      feicoes = feicoes.filter(function (f) { return usados[normalizarTextoEquipamento(f.properties.NM_MUN)]; });
      if (!feicoes.length) throw new Error("os municípios dos equipamentos não são de " + uf + ".");
    }
    var mapa = lerGeoJson({ type: "FeatureCollection", features: feicoes });
    return { mapa: mapa, preenchidos: preenchidos, naoAchados: naoAchados };
  }

  function esperarMapaDesenhado(depois) {
    var inicio = Date.now();
    (function conferir() {
      var svg = elCanvas.querySelector("svg");
      if (svg && svg.querySelector("g.camada-mapa g.mapa-regioes > path")) { depois(); return; }
      if (Date.now() - inicio < 8000) setTimeout(conferir, 80);
    })();
  }

  // ---- Painel "Mapa regional" ----
  (function () {
    var painel = document.getElementById("navMapa");
    if (!painel) return;
    function campo(id) { return document.getElementById(id); }
    var arquivo = campo("mapaArquivo"), arquivoImagem = campo("mapaArquivoImagem"), situacao = campo("mapaSituacao");
    var listaRegioes = campo("mapaListaRegioes"), buscaRegiao = campo("mapaBuscaRegiao");
    var alvoAjuste = "municipios"; // "municipios" | "imagem"
    try { var ufSalva = localStorage.getItem("grafo-mapa-uf"); if (ufSalva && UFS_IBGE[ufSalva]) campo("mapaUf").value = ufSalva; } catch (e) {}
    campo("mapaGerarIbge").addEventListener("click", async function () {
      var botao = campo("mapaGerarIbge"), uf = campo("mapaUf").value;
      try { localStorage.setItem("grafo-mapa-uf", uf); } catch (e) {}
      botao.disabled = true;
      var texto = botao.textContent;
      botao.textContent = "Baixando malha do IBGE…";
      try {
        var r = await gerarMapaIbge(uf, campo("mapaSoDiagrama").checked, campo("mapaDetalhado").checked);
        var anterior = estado.mapa || {};
        var estilo = ESTILOS_MAPA[anterior.estilo === "grafo" ? "grafo" : "referencia"];
        var novo = { regioes: r.mapa.regioes, largura: r.mapa.largura, altura: r.mapa.altura, estilo: anterior.estilo || "referencia",
          cor: anterior.cor || estilo.cor, contorno: anterior.contorno || estilo.contorno, sombra: anterior.sombra != null ? anterior.sombra : estilo.sombra,
          nomes: anterior.nomes != null ? anterior.nomes : true, cabosPretos: anterior.cabosPretos != null ? anterior.cabosPretos : estilo.cabosPretos };
        if (anterior.imagem) novo.imagem = anterior.imagem;
        var area = caixaDosEquipamentos();
        estado.mapa = novo; // provisório, para contar os municípios com equipamento
        var soFundo = mapaSoDeFundo();
        if (soFundo) {
          // Uma cidade só: o mapa enquadra o diagrama por trás, sem mexer nele,
          // no estilo suave (verde forte atrás de um POP inteiro atrapalha a leitura).
          if (!anterior.estilo) Object.assign(novo, { estilo: "grafo" }, ESTILOS_MAPA.grafo);
          encaixar(novo, area, 180);
        } else {
          // Mapa do tamanho que caiba os equipamentos com folga (cada município ~ 3 equipamentos).
          var lado = Math.max(2000, Math.sqrt(Math.max(1, estado.equipamentos.length)) * 950);
          encaixar(novo, { x1: area.x1, y1: area.y1, x2: area.x1 + lado, y2: area.y1 + lado * novo.altura / novo.largura }, 0);
        }
        var v = Esquema.validarMapa(novo);
        if (!v.ok) throw new Error(v.mensagem);
        estado.mapa = v.dados;
        alvoAjuste = "municipios";
        salvarLocal();
        ajustarNaProximaRenderizacao = true;
        gerar();
        // Espera o mapa aparecer no desenho (o Graphviz desenha em seguida) e
        // então coloca cada equipamento dentro do seu município.
        if (!soFundo) esperarMapaDesenhado(function () {
          var n = posicionarNosMunicipios(null);
          if (n) { salvarLocal(); ajustarNaProximaRenderizacao = true; gerar(); }
        });
        atualizarPainel();
        avisar("Mapa do IBGE (" + uf + "): " + r.mapa.regioes.length + (r.mapa.regioes.length === 1 ? " município." : " municípios.") +
          (soFundo ? " Só uma cidade com equipamento: o mapa ficou de fundo e o diagrama não foi mexido. Para espalhar por cidades, preencha o Município dos equipamentos das outras cidades." : "") +
          (r.preenchidos ? " " + r.preenchidos + " equipamento(s) tiveram o município achado pelo nome." : "") +
          (r.naoAchados.length ? " Não achei em " + uf + ": " + r.naoAchados.slice(0, 4).join(", ") + "." : ""));
      } catch (e) {
        avisar("Não deu para gerar o mapa: " + (e.message || e) + (e instanceof TypeError ? " (sem internet ou o IBGE fora do ar)" : ""));
      } finally {
        botao.disabled = false;
        botao.textContent = texto;
      }
    });

    function atualizarPainel() {
      var m = estado.mapa;
      campo("mapaControles").hidden = !temRegioes();
      campo("mapaControlesImagem").hidden = !temImagemDeFundo();
      campo("mapaAjuste").hidden = !mapaAtivo();
      var partes = [];
      if (temRegioes()) partes.push(regioesVisiveis().length + " de " + m.regioes.length + " municípios visíveis");
      if (temImagemDeFundo()) partes.push("imagem de fundo" + (m.imagem.visivel === false ? " (oculta)" : "") + (m.imagem.bloqueado ? " · bloqueada" : ""));
      situacao.textContent = partes.length ? partes.join(" · ") : "Nenhum mapa ainda.";
      campo("mapaAlvoImagem").disabled = !temImagemDeFundo();
      campo("mapaAlvoMunicipios").disabled = !temRegioes();
      if (alvoAjuste === "imagem" && !temImagemDeFundo()) alvoAjuste = "municipios";
      if (alvoAjuste === "municipios" && !temRegioes() && temImagemDeFundo()) alvoAjuste = "imagem";
      campo("mapaAlvoMunicipios").classList.toggle("active", alvoAjuste === "municipios");
      campo("mapaAlvoImagem").classList.toggle("active", alvoAjuste === "imagem");
      if (temRegioes()) {
        campo("mapaCor").value = /^#[0-9a-f]{6}$/i.test(m.cor || "") ? m.cor : COR_MAPA_PADRAO;
        campo("mapaContorno").value = /^#[0-9a-f]{6}$/i.test(m.contorno || "") ? m.contorno : "#000000";
        campo("mapaSombra").checked = m.sombra !== false;
        campo("mapaNomes").checked = !!m.nomes;
        campo("mapaCabosPretos").checked = !!m.cabosPretos;
        campo("mapaEstiloReferencia").classList.toggle("active", m.estilo !== "grafo");
        campo("mapaEstiloGrafo").classList.toggle("active", m.estilo === "grafo");
        montarListaRegioes();
      }
      if (temImagemDeFundo()) {
        campo("mapaOpacidade").value = Math.round((m.imagem.opacidade == null ? 1 : m.imagem.opacidade) * 100);
        campo("mapaRotacao").value = Number(m.imagem.rotacao) || 0;
        campo("mapaRotacaoValor").textContent = (Number(m.imagem.rotacao) || 0) + "°";
        campo("mapaImagemVisivel").checked = m.imagem.visivel !== false;
        campo("mapaImagemBloqueada").checked = !!m.imagem.bloqueado;
      }
    }
    function montarListaRegioes() {
      var termo = normalizarTextoEquipamento(buscaRegiao.value);
      var m = estado.mapa;
      var itens = m.regioes.map(function (r, i) { return { r: r, i: i }; })
        .filter(function (x) { return !termo || normalizarTextoEquipamento(x.r.nome).indexOf(termo) >= 0 || String(x.r.codigo || "").indexOf(termo) >= 0; })
        .sort(function (a, b) { return String(a.r.nome).localeCompare(String(b.r.nome), "pt"); });
      var MAX = 300;
      listaRegioes.innerHTML = itens.slice(0, MAX).map(function (x) {
        return '<label class="mapa-regiao"><input type="checkbox" data-regiao="' + x.i + '"' + (x.r.oculta ? "" : " checked") + '>' +
          '<span>' + escaparHtml(x.r.nome || "(sem nome)") + '</span>' + (x.r.codigo ? '<em>' + escaparHtml(x.r.codigo) + '</em>' : "") +
          '<input type="color" data-regiao-cor="' + x.i + '" value="' + escaparHtml(/^#[0-9a-f]{6}$/i.test(x.r.cor || "") ? x.r.cor : (m.cor || COR_MAPA_PADRAO)) + '" title="Cor só deste município"></label>';
      }).join("") + (itens.length > MAX ? '<p class="mapa-mais">+ ' + (itens.length - MAX) + ' — use a busca</p>' : "") + (!itens.length ? '<p class="mapa-mais">Nenhum município com esse nome.</p>' : "");
    }
    function mudou(redesenharTudo) {
      salvarLocal();
      if (redesenharTudo) gerar();
      else { desenharMapa(); ajustarViewBoxAoConteudo(true); }
      atualizarPainel();
    }
    new MutationObserver(function () { if (painel.classList.contains("open")) atualizarPainel(); }).observe(painel, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("grafo:render", function () { if (painel.classList.contains("open")) atualizarPainel(); document.body.classList.toggle("com-mapa", mapaAtivo()); });

    function lerTexto(f) { return new Promise(function (ok) { var l = new FileReader(); l.onload = function () { ok(String(l.result)); }; l.readAsText(f, "UTF-8"); }); }
    arquivo.addEventListener("change", async function () {
      var f = arquivo.files[0];
      arquivo.value = "";
      if (!f) return;
      try {
        var mapa = lerArquivoDeMapa(f.name, await lerTexto(f));
        if (!mapa || !mapa.regioes.length) throw new Error("não achei nenhum município/região (Polygon ou MultiPolygon) no arquivo.");
        var total = mapa.regioes.reduce(function (s, r) { return s + r.d.length; }, 0);
        if (total > MAPA_MAX_CARACTERES) throw new Error("o mapa é detalhado demais. No mapshaper, use Simplify (uns 5%) antes de exportar.");
        var anterior = estado.mapa || {};
        var estilo = ESTILOS_MAPA[anterior.estilo === "grafo" ? "grafo" : "referencia"];
        var novo = { regioes: mapa.regioes, largura: mapa.largura, altura: mapa.altura, estilo: anterior.estilo || "referencia",
          cor: anterior.cor || estilo.cor, contorno: anterior.contorno || estilo.contorno, sombra: anterior.sombra != null ? anterior.sombra : estilo.sombra,
          nomes: !!anterior.nomes, cabosPretos: anterior.cabosPretos != null ? anterior.cabosPretos : estilo.cabosPretos };
        if (anterior.imagem) novo.imagem = anterior.imagem;
        encaixar(novo, caixaDosEquipamentos(), 120);
        var v = Esquema.validarMapa(novo);
        if (!v.ok) throw new Error(v.mensagem);
        estado.mapa = v.dados;
        alvoAjuste = "municipios";
        avisar("Mapa carregado: " + mapa.regioes.length + (mapa.regioes.length === 1 ? " município/região." : " municípios/regiões.") +
          (mapa.ignoradas ? " " + mapa.ignoradas + " item(ns) sem polígono foram ignorados." : "") + " Desmarque os que não usa e arraste os equipamentos.");
        mudou(true);
      } catch (e) { avisar("Não deu para ler o mapa: " + (e.message || e)); }
    });
    arquivoImagem.addEventListener("change", async function () {
      var f = arquivoImagem.files[0];
      arquivoImagem.value = "";
      if (!f) return;
      try {
        var im = await prepararImagemDeFundo(f);
        var imagem = { src: im.src, largura: im.largura, altura: im.altura, rotacao: 0, opacidade: 1, visivel: true, bloqueado: false };
        encaixar(imagem, caixaDosEquipamentos(), 120);
        var novo = Object.assign({}, estado.mapa || { regioes: [], largura: 1000, altura: 1000 }, { imagem: imagem });
        if (!novo.regioes) novo.regioes = [];
        var v = Esquema.validarMapa(novo);
        if (!v.ok) throw new Error(v.mensagem);
        estado.mapa = v.dados;
        alvoAjuste = "imagem";
        avisar("Imagem no fundo. Ela é só um desenho: não tem municípios nem coordenadas. Ajuste tamanho, posição e opacidade no painel.");
        mudou(true);
      } catch (e) { avisar("Não deu para usar a imagem: " + (e.message || e)); }
    });

    // Estilos prontos.
    function aplicarEstilo(nome) {
      if (!temRegioes()) return;
      var e = ESTILOS_MAPA[nome];
      Object.assign(estado.mapa, { estilo: nome, cor: e.cor, contorno: e.contorno, sombra: e.sombra, cabosPretos: e.cabosPretos });
      mudou(true);
    }
    campo("mapaEstiloReferencia").addEventListener("click", function () { aplicarEstilo("referencia"); });
    campo("mapaEstiloGrafo").addEventListener("click", function () { aplicarEstilo("grafo"); });
    campo("mapaCor").addEventListener("input", function (e) { if (!temRegioes()) return; estado.mapa.cor = e.target.value; mudou(false); });
    campo("mapaContorno").addEventListener("input", function (e) { if (!temRegioes()) return; estado.mapa.contorno = e.target.value; mudou(false); });
    campo("mapaSombra").addEventListener("change", function (e) { if (!temRegioes()) return; estado.mapa.sombra = e.target.checked; mudou(false); });
    campo("mapaNomes").addEventListener("change", function (e) { if (!temRegioes()) return; estado.mapa.nomes = e.target.checked; mudou(false); });
    campo("mapaCabosPretos").addEventListener("change", function (e) { if (!temRegioes()) return; estado.mapa.cabosPretos = e.target.checked; mudou(true); });

    // Municípios: mostrar/ocultar, cor própria, busca, só os marcados.
    buscaRegiao.addEventListener("input", montarListaRegioes);
    listaRegioes.addEventListener("change", function (e) {
      var i = e.target.getAttribute("data-regiao");
      if (i != null) { estado.mapa.regioes[+i].oculta = !e.target.checked; if (!estado.mapa.regioes[+i].oculta) delete estado.mapa.regioes[+i].oculta; mudou(false); return; }
      var k = e.target.getAttribute("data-regiao-cor");
      if (k != null) { estado.mapa.regioes[+k].cor = e.target.value; mudou(false); }
    });
    campo("mapaMarcarTodos").addEventListener("click", function () { estado.mapa.regioes.forEach(function (r) { delete r.oculta; }); mudou(false); });
    campo("mapaDesmarcarTodos").addEventListener("click", function () {
      // Os da busca atual (ou todos): útil para depois marcar só os da rota.
      var termo = normalizarTextoEquipamento(buscaRegiao.value);
      estado.mapa.regioes.forEach(function (r) { if (!termo || normalizarTextoEquipamento(r.nome).indexOf(termo) >= 0) r.oculta = true; });
      mudou(false);
    });
    campo("mapaSoComEquipamentos").addEventListener("click", function () {
      var usados = {};
      estado.equipamentos.forEach(function (eq) { var i = regiaoPorNome(eq.municipio); if (i >= 0) usados[i] = true; });
      if (!Object.keys(usados).length) { avisar("Nenhum equipamento tem município. Escolha o município na edição do equipamento."); return; }
      estado.mapa.regioes.forEach(function (r, i) { if (usados[i]) delete r.oculta; else r.oculta = true; });
      mudou(false);
    });
    campo("mapaEncaixarSelecao").addEventListener("click", function () {
      if (!temRegioes()) return;
      // Encaixa a região visível em volta dos equipamentos, mantendo a proporção.
      var regiao = caixaDasRegioesVisiveis();
      if (!regiao) return;
      var m = estado.mapa, eqs = caixaDosEquipamentos();
      var w = eqs.x2 - eqs.x1 + 240, h = eqs.y2 - eqs.y1 + 240;
      var esc = Math.max(w / (regiao.x2 - regiao.x1), h / (regiao.y2 - regiao.y1));
      m.escala = Math.round(esc * 1000) / 1000;
      m.x = Math.round((eqs.x1 + eqs.x2) / 2 - (regiao.x1 + regiao.x2) / 2 * esc);
      m.y = Math.round((eqs.y1 + eqs.y2) / 2 - (regiao.y1 + regiao.y2) / 2 * esc);
      mudou(false);
    });
    campo("mapaPosicionar").addEventListener("click", function () {
      var n = posicionarNosMunicipios(null);
      if (!n) { avisar("Nenhum equipamento com município (ou todos estão fixados). Escolha o município na edição do equipamento."); return; }
      avisar(n + (n === 1 ? " equipamento colocado" : " equipamentos colocados") + " dentro do seu município.");
      salvarLocal(); gerar();
    });

    // Ajuste de posição: municípios ou imagem.
    campo("mapaAlvoMunicipios").addEventListener("click", function () { alvoAjuste = "municipios"; atualizarPainel(); });
    campo("mapaAlvoImagem").addEventListener("click", function () { alvoAjuste = "imagem"; atualizarPainel(); });
    painel.querySelectorAll("[data-mapa-mover]").forEach(function (b) {
      b.addEventListener("click", function () {
        var obj = alvoAjuste === "imagem" ? (temImagemDeFundo() && estado.mapa.imagem) : (temRegioes() && estado.mapa);
        if (!obj) return;
        if (alvoAjuste === "imagem" && obj.bloqueado) { avisar("A imagem está bloqueada. Desmarque \"Bloquear\" para mexer."); return; }
        var passo = 40, dir = b.getAttribute("data-mapa-mover");
        if (dir === "cima") obj.y -= passo;
        if (dir === "baixo") obj.y += passo;
        if (dir === "esquerda") obj.x -= passo;
        if (dir === "direita") obj.x += passo;
        if (dir === "maior" || dir === "menor") {
          var f = dir === "maior" ? 1.1 : 1 / 1.1;
          var cx = obj.x + obj.largura * obj.escala / 2, cy = obj.y + obj.altura * obj.escala / 2;
          obj.escala = Math.max(0.01, Math.min(500, Math.round(obj.escala * f * 10000) / 10000));
          obj.x = Math.round(cx - obj.largura * obj.escala / 2); obj.y = Math.round(cy - obj.altura * obj.escala / 2);
        }
        mudou(false);
      });
    });
    campo("mapaEnquadrar").addEventListener("click", function () {
      if (alvoAjuste === "imagem" && temImagemDeFundo()) { if (estado.mapa.imagem.bloqueado) return; encaixar(estado.mapa.imagem, caixaDosEquipamentos(), 120); }
      else if (temRegioes()) encaixar(estado.mapa, caixaDosEquipamentos(), 120);
      mudou(false);
    });
    // Imagem: opacidade, rotação, visível, bloqueada, trocar, remover.
    campo("mapaOpacidade").addEventListener("input", function (e) { if (!temImagemDeFundo() || estado.mapa.imagem.bloqueado) return; estado.mapa.imagem.opacidade = Number(e.target.value) / 100; mudou(false); });
    campo("mapaRotacao").addEventListener("input", function (e) { if (!temImagemDeFundo() || estado.mapa.imagem.bloqueado) return; estado.mapa.imagem.rotacao = Number(e.target.value); mudou(false); });
    campo("mapaImagemVisivel").addEventListener("change", function (e) { if (!temImagemDeFundo()) return; estado.mapa.imagem.visivel = e.target.checked; mudou(false); });
    campo("mapaImagemBloqueada").addEventListener("change", function (e) { if (!temImagemDeFundo()) return; estado.mapa.imagem.bloqueado = e.target.checked; mudou(false); });
    campo("mapaRemoverImagem").addEventListener("click", function () { if (!temImagemDeFundo()) return; delete estado.mapa.imagem; if (!temRegioes()) delete estado.mapa; mudou(true); });
    campo("mapaRemover").addEventListener("click", async function () {
      if (!temRegioes()) return;
      if (!await abrirModal({ title: "Remover os municípios", message: "Tirar os municípios do fundo deste diagrama? Equipamentos e cabos ficam como estão.", confirmText: "Remover" })) return;
      estado.mapa.regioes = [];
      if (!temImagemDeFundo()) delete estado.mapa;
      mudou(true);
    });
  })();

  // ---- Município no editor do equipamento ----
  // Lista os municípios do mapa; ao salvar com município novo, o equipamento vai
  // para dentro dele (a não ser que esteja fixado).
  function preencherCampoMunicipio(campo, valor) {
    if (!campo) return;
    var lista = document.getElementById("municipios-sugeridos");
    if (lista) {
      var nomes = temRegioes() ? estado.mapa.regioes.map(function (r) { return r.nome; }).filter(Boolean) : [];
      estado.equipamentos.forEach(function (eq) { if (eq.municipio) nomes.push(eq.municipio); });
      nomes = nomes.filter(function (n, i) { return nomes.indexOf(n) === i; }).sort(function (a, b) { return a.localeCompare(b, "pt"); });
      lista.innerHTML = nomes.map(function (n) { return '<option value="' + escaparHtml(n) + '"></option>'; }).join("");
    }
    campo.value = valor || "";
    var rotulo = campo.closest("label");
    if (rotulo) rotulo.hidden = false;
  }
  // ==== 13-cadastro-automatico.js: tipo/modelo/IP/portas sugeridos, Ligar a, seletores de modelo e tipo, colar lista (parte de assets/js/editor/app.js; npm run montar) ====
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
    [/retificador|\bxps\b|\brps\b/i, "Retificador"],
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
    // Senão, o que tiver o maior pedaço inicial do nome dentro do texto
    // ("DM4270-48XS" escolhe DM4270-48XS+6CX, não o 24XS). Mínimo: a família
    // (5+ caracteres com número), para "OLT" ou "RB" sozinhos não chutarem.
    var melhor = null, tamanho = 0;
    catalogoModelos.forEach(function (m) {
      var k = limpo(m.nome), familia = limpo(String(m.nome).split(/[-\s]/)[0]);
      if (familia.length < 5 || !/\d/.test(familia) || n.indexOf(familia) < 0) return;
      for (var t = k.length; t >= familia.length; t--) {
        if (n.indexOf(k.slice(0, t)) >= 0) { if (t > tamanho) { tamanho = t; melhor = m; } break; }
      }
    });
    return melhor;
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
    // Município pela sigla CNL da Anatel no nome do POP (POP-TPA01 → Tapera), na UF
    // escolhida no Mapa de regiões (RS se nenhuma).
    var campoMunicipio = document.getElementById("navEquipMunicipio"), municipioAutomatico = true;
    if (campoMunicipio) campoMunicipio.addEventListener("input", function () { municipioAutomatico = !campoMunicipio.value.trim(); campoMunicipio.classList.remove("campo-automatico"); });
    nome.addEventListener("input", function () {
      if (campoMunicipio && municipioAutomatico) {
        var uf = "RS";
        try { uf = localStorage.getItem("grafo-mapa-uf") || "RS"; } catch (e) {}
        var texto = nome.value;
        carregarSiglasCnl().then(function (tabelas) {
          if (!municipioAutomatico || nome.value !== texto) return;
          var achado = municipioPelaSigla(texto, tabelas[uf]);
          campoMunicipio.value = achado;
          campoMunicipio.classList.toggle("campo-automatico", !!achado);
        });
      }
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
      if (painel.classList.contains("open")) { preencherCampoMunicipio(document.getElementById("navEquipMunicipio"), ""); tipoAutomatico = !tipo.value.trim(); modeloAutomatico = !modelo || !modelo.value.trim(); ipAutomatico = true; preencherIp(); preencherLigarA(); }
    }).observe(painel, { attributes: true, attributeFilter: ["class"] });
    // Depois de salvar (o formulário é limpo), o próximo já vem com o IP seguinte.
    document.getElementById("navEquipForm").addEventListener("reset", function () {
      setTimeout(function () {
        tipoAutomatico = true; ipAutomatico = true; modeloAutomatico = true; municipioAutomatico = true;
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

  // ---- Seletor de modelos (no lugar da lista nativa do navegador) ----------------
  // Abre embaixo de qualquer campo Modelo: agrupado por fabricante, com o tipo e a
  // quantidade de portas, filtra enquanto digita e pelo Tipo já escolhido.
  // Setas + Enter escolhem; Esc fecha. O campo continua aceitando texto livre.
  var seletorModelos = document.createElement("div");
  seletorModelos.className = "seletor-modelos";
  seletorModelos.hidden = true;
  seletorModelos.setAttribute("role", "listbox");
  document.body.appendChild(seletorModelos);
  var seletorAlvo = null, seletorItens = [], seletorAtivo = -1, seletorModo = "modelo";
  var COR_FABRICANTE = { MikroTik: "#E5484D", Datacom: "#1E6FD9", Huawei: "#D9332B", Parks: "#1B7F2A", Juniper: "#0A7C86", Cisco: "#1BA0D7", "Genérico": "#7A8B99" };
  function soLetrasENumeros(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

  function ehCampoModelo(el) {
    return !!el && el.tagName === "INPUT" && (el.id === "navEquipModelo" || el.id === "editEquipModelo" || el.id === "novoEquipModelo" || el.getAttribute("data-field") === "modelo");
  }
  function ehCampoTipo(el) {
    return !!el && el.tagName === "INPUT" && (el.id === "navEquipTipo" || el.id === "editEquipTipo" || el.id === "novoEquipTipo" || (el.getAttribute("data-field") === "tipo" && !!el.closest("#listaEquip")));
  }
  // Tipos: os símbolos do quadro (sem os nomes repetidos), com o ícone.
  function montarSeletorTipos() {
    var termo = normalizarTextoEquipamento(seletorAlvo.value);
    var todos = tiposParaBiblioteca();
    var primeiro = TIPOS_PRIMEIRO_POR_MODO[modoAtual()] || [];
    todos.sort(function (a, b) {
      var ia = primeiro.indexOf(a.nome), ib = primeiro.indexOf(b.nome);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var escolhido = todos.find(function (t) { return t.nome === seletorAlvo.value; });
    var lista = todos.filter(function (t) { return !termo || escolhido || normalizarTextoEquipamento(t.nome).indexOf(termo) >= 0; });
    // O que começa com o texto vem primeiro ("olt" acha OLT antes de Volt).
    if (termo && !escolhido) lista.sort(function (a, b) { return normalizarTextoEquipamento(a.nome).indexOf(termo) - normalizarTextoEquipamento(b.nome).indexOf(termo); });
    seletorItens = [];
    var html = lista.map(function (t) {
      var i = seletorItens.push(t) - 1, icone = t.icone || iconePorTipo(t.nome);
      return '<button type="button" class="sm-item sm-item-tipo' + (escolhido && escolhido.nome === t.nome ? " escolhido" : "") + '" data-i="' + i + '" role="option">' +
        '<span class="sm-icone">' + (icone && /[\/.]/.test(icone) ?'<img src="' + escaparHtml(icone) + '" alt="">' : escaparHtml(icone || "")) + "</span><strong>" + escaparHtml(t.nome) + "</strong></button>";
    }).join("");
    seletorModelos.innerHTML = '<div class="sm-topo">' + (lista.length ? lista.length + " tipos" : "Tipo novo: será criado com esse nome") + "<span>↑↓ Enter</span></div>" +
      (html ? '<div class="sm-grade-tipos">' + html + "</div>" : "");
    seletorAtivo = -1;
    posicionarSeletor();
  }
  function montarSeletor() {
    if (!seletorAlvo) return;
    if (seletorModo === "tipo") { montarSeletorTipos(); return; }
    var campoTipo = campoTipoDoModelo(seletorAlvo);
    var base = Esquema.filtrarModelosPorTipo(catalogoModelos, campoTipo ? campoTipo.value : "");
    var termo = soLetrasENumeros(seletorAlvo.value);
    var escolhido = catalogoModelos.find(function (m) { return m.nome === seletorAlvo.value; }) || null;
    var lista = base.filter(function (m) { return !termo || escolhido || soLetrasENumeros(m.fabricante + m.nome + m.tipo).indexOf(termo) >= 0; });
    if (!lista.length && termo) lista = catalogoModelos.filter(function (m) { return soLetrasENumeros(m.fabricante + m.nome).indexOf(termo) >= 0; });
    var grupos = {}, ordem = [];
    lista.forEach(function (m) { var f = m.fabricante || "Outros"; if (!grupos[f]) { grupos[f] = []; ordem.push(f); } grupos[f].push(m); });
    seletorItens = [];
    var html = ordem.map(function (f) {
      return '<div class="sm-grupo"><div class="sm-fabricante"><i style="background:' + (COR_FABRICANTE[f] || "#7A8B99") + '"></i>' + escaparHtml(f) + "<span>" + grupos[f].length + "</span></div>" +
        grupos[f].map(function (m) {
          var i = seletorItens.push(m) - 1;
          return '<button type="button" class="sm-item' + (escolhido && escolhido.nome === m.nome ? " escolhido" : "") + '" data-i="' + i + '" role="option">' +
            "<strong>" + escaparHtml(m.nome) + '</strong><span class="sm-tipo">' + escaparHtml(m.tipo || "") + '</span><span class="sm-portas">' + m.portas.length + " portas</span></button>";
        }).join("") + "</div>";
    }).join("");
    var filtroTipo = campoTipo && campoTipo.value.trim() && base.length < catalogoModelos.length;
    seletorModelos.innerHTML = '<div class="sm-topo">' + (lista.length ? lista.length + (lista.length === 1 ? " modelo" : " modelos") : "Nenhum modelo do catálogo") +
      (filtroTipo ? " · tipo <b>" + escaparHtml(campoTipo.value.trim()) + "</b>" : "") + "<span>↑↓ Enter</span></div>" +
      (html || '<p class="sm-vazio">Pode deixar o texto digitado: o modelo fica só sem a lista de portas.</p>');
    seletorAtivo = -1;
    posicionarSeletor();
  }
  function posicionarSeletor() {
    if (!seletorAlvo || seletorModelos.hidden) return;
    var r = seletorAlvo.getBoundingClientRect();
    var largura = Math.min(Math.max(r.width, 340), window.innerWidth - 16);
    var abaixo = window.innerHeight - r.bottom - 12, acima = r.top - 12;
    var paraBaixo = abaixo >= 240 || abaixo >= acima;
    var altura = Math.min(400, paraBaixo ? abaixo : acima);
    seletorModelos.style.width = largura + "px";
    seletorModelos.style.left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)) + "px";
    seletorModelos.style.maxHeight = Math.max(160, altura) + "px";
    seletorModelos.style.top = (paraBaixo ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.max(160, altura))) + "px";
  }
  function abrirSeletor(campo, modo) {
    seletorAlvo = campo;
    seletorModo = modo || "modelo";
    seletorModelos.classList.toggle("modo-tipo", seletorModo === "tipo");
    if (campo.hasAttribute("list")) campo.removeAttribute("list");
    seletorModelos.hidden = false;
    montarSeletor();
  }
  function fecharSeletor() { seletorModelos.hidden = true; seletorAlvo = null; }
  function escolher(m) {
    if (!seletorAlvo || !m) return;
    var campo = seletorAlvo;
    campo.value = m.nome;
    campo.classList.remove("campo-automatico");
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.dispatchEvent(new Event("change", { bubbles: true }));
    var campoTipo = seletorModo === "modelo" ? campoTipoDoModelo(campo) : null;
    if (campoTipo && !campoTipo.value.trim() && m.tipo) { campoTipo.value = m.tipo; campoTipo.dispatchEvent(new Event("input", { bubbles: true })); }
    fecharSeletor();
  }
  function marcarAtivo(i) {
    var botoes = seletorModelos.querySelectorAll(".sm-item");
    if (!botoes.length) return;
    seletorAtivo = (i + botoes.length) % botoes.length;
    botoes.forEach(function (b, k) { b.classList.toggle("ativo", k === seletorAtivo); });
    botoes[seletorAtivo].scrollIntoView({ block: "nearest" });
  }
  document.addEventListener("focusin", function (e) {
    if (ehCampoModelo(e.target)) abrirSeletor(e.target, "modelo");
    else if (ehCampoTipo(e.target)) abrirSeletor(e.target, "tipo");
    else if (!seletorModelos.contains(e.target)) fecharSeletor();
  });
  document.addEventListener("input", function (e) { if (e.target === seletorAlvo) montarSeletor(); });
  document.addEventListener("keydown", function (e) {
    if (!seletorAlvo || e.target !== seletorAlvo || seletorModelos.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); marcarAtivo(seletorAtivo + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarAtivo(seletorAtivo - 1); }
    else if (e.key === "Enter" && seletorAtivo >= 0) {
      e.preventDefault();
      escolher(seletorItens[Number(seletorModelos.querySelectorAll(".sm-item")[seletorAtivo].getAttribute("data-i"))]);
    }
    else if (e.key === "Escape") { e.stopPropagation(); fecharSeletor(); }
    else if (e.key === "Tab") fecharSeletor();
  }, true);
  seletorModelos.addEventListener("pointerdown", function (e) { e.preventDefault(); }); // não tira o foco do campo
  seletorModelos.addEventListener("click", function (e) {
    var b = e.target.closest(".sm-item");
    if (b) escolher(seletorItens[Number(b.getAttribute("data-i"))]);
  });
  document.addEventListener("focusout", function (e) {
    if (e.target === seletorAlvo) setTimeout(function () { if (document.activeElement !== seletorAlvo) fecharSeletor(); }, 120);
  });
  window.addEventListener("resize", posicionarSeletor);
  document.addEventListener("scroll", posicionarSeletor, true);

  // ==== 14-exportacao-svg-png.js: imagens embutidas, moldura e exportação SVG/PNG (parte de assets/js/editor/app.js; npm run montar) ====
  function blobParaDataUrl(blob) {
    return new Promise(function (resolver, rejeitar) {
      var leitor = new FileReader();
      leitor.onload = function () { resolver(leitor.result); };
      leitor.onerror = rejeitar;
      leitor.readAsDataURL(blob);
    });
  }

  // Cópia dos ícones em base64 (assets/js/editor/icones-embutidos.js), carregada só
  // na hora de exportar. Com o app aberto direto do disco (file://) o
  // navegador bloqueia o fetch das imagens e o canvas do PNG; sem esta cópia
  // os ícones sumiam da exportação.
  var promessaIconesEmbutidos = null;
  function carregarIconesEmbutidos() {
    if (window.ICONES_EMBUTIDOS) return Promise.resolve(window.ICONES_EMBUTIDOS);
    if (!promessaIconesEmbutidos) {
      promessaIconesEmbutidos = new Promise(function (resolver) {
        var script = document.createElement("script");
        script.src = "./assets/js/editor/icones-embutidos.js";
        script.onload = function () { resolver(window.ICONES_EMBUTIDOS || {}); };
        script.onerror = function () { promessaIconesEmbutidos = null; resolver({}); };
        document.head.appendChild(script);
      });
    }
    return promessaIconesEmbutidos;
  }

  async function iconeEmbutido(origem) {
    var nome = "";
    try { nome = decodeURIComponent(new URL(origem, document.baseURI).pathname.split("/").pop() || ""); }
    catch (e) { nome = String(origem).split(/[\\/]/).pop(); }
    if (!nome) return "";
    var icones = await carregarIconesEmbutidos();
    var chave = Object.keys(icones).find(function (k) { return k.toLowerCase() === nome.toLowerCase(); });
    return chave ? icones[chave] : "";
  }

  // Imagem como data: URL para ir dentro do arquivo exportado: lê o arquivo
  // e, se o navegador bloquear (file://), usa a cópia embutida. "" se nenhum der.
  // Cache por origem: a prévia do PDF rasteriza várias vezes seguidas.
  var cacheImagensExportacao = {};
  function imagemParaExportacao(origem) {
    if (!origem) return Promise.resolve("");
    if (/^data:/i.test(origem)) return Promise.resolve(origem);
    if (!cacheImagensExportacao[origem]) {
      cacheImagensExportacao[origem] = (async function () {
        try {
          var resposta = await fetch(resolverUrlRelativa(origem), { cache: "force-cache" });
          if (!resposta.ok && resposta.status !== 0) throw new Error("HTTP " + resposta.status);
          return await blobParaDataUrl(await resposta.blob());
        } catch (erroFetch) {}
        return await iconeEmbutido(origem);
      })();
      // Falha não fica em cache: a próxima tentativa busca de novo.
      cacheImagensExportacao[origem].then(function (v) { if (!v) delete cacheImagensExportacao[origem]; });
    }
    return cacheImagensExportacao[origem];
  }

  async function fonteImagemComoDataUrl(origem, imagemViva) {
    if (!origem) return "";
    var dataUrl = await imagemParaExportacao(origem);
    if (dataUrl) return dataUrl;

    var absoluta;
    try { absoluta = new URL(origem, document.baseURI).href; }
    catch (e) { absoluta = origem; }

    if (imagemViva) {
      try {
        var bbox = imagemViva.getBBox();
        var largura = Math.max(1, Math.ceil(bbox.width || Number(imagemViva.getAttribute("width")) || 1));
        var altura = Math.max(1, Math.ceil(bbox.height || Number(imagemViva.getAttribute("height")) || 1));
        var canvasTmp = document.createElement("canvas");
        canvasTmp.width = largura * 2;
        canvasTmp.height = altura * 2;
        var ctxTmp = canvasTmp.getContext("2d");
        ctxTmp.drawImage(imagemViva, 0, 0, canvasTmp.width, canvasTmp.height);
        return canvasTmp.toDataURL("image/png");
      } catch (erroCanvas) {}
    }

    return absoluta;
  }

  function obterOrigemDaImagemSvg(imagem) {
    if (!imagem) return "";
    var href = imagem.getAttribute("href");
    var hrefXlink = imagem.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    return href || hrefXlink || "";
  }

  // Mesmo efeito do filtro da tela (filtroCorIcone): matiz e saturação da cor,
  // luminosidade e transparência da imagem. Retorna PNG em data URL, ou null.
  function tingirImagem(dataUrl, cor) {
    return new Promise(function (resolver) {
      var img = new Image();
      img.onload = function () {
        try {
          // Até 512 px no lado maior: nítido na impressão (o ícone tem ~84 pt).
          var nw = img.naturalWidth || 512, nh = img.naturalHeight || 512;
          var k = Math.min(1, 512 / Math.max(nw, nh));
          var w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          ctx.globalCompositeOperation = "color";
          ctx.fillStyle = cor;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "destination-in";
          ctx.drawImage(img, 0, 0, w, h);
          resolver(canvas.toDataURL("image/png"));
        } catch (e) { resolver(null); }
      };
      img.onerror = function () { resolver(null); };
      img.src = dataUrl;
    });
  }

  // Cor do ícone na exportação: o svg2pdf (PDF) ignora filtros SVG, então o tom
  // vai direto na imagem e o filtro sai (para não aplicar duas vezes).
  async function aplicarTomNaImagem(imagem, dataUrl) {
    var tom = /url\(#tom-([0-9a-f]{6})\)/i.exec(imagem.getAttribute("filter") || "");
    if (!tom) return dataUrl;
    var tingida = await tingirImagem(dataUrl, "#" + tom[1]);
    if (!tingida) return dataUrl;
    imagem.removeAttribute("filter");
    return tingida;
  }

  // Papel escuro: inverte a claridade do desenho do catálogo mantendo o tom
  // (o mesmo que o filtro invert + hue-rotate da tela), pixel a pixel.
  function clarearIcone(dataUrl) {
    return new Promise(function (resolver) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          var d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
          for (var i = 0; i < p.length; i += 4) {
            var r = p[i], g = p[i + 1], b = p[i + 2];
            var max = Math.max(r, g, b), min = Math.min(r, g, b);
            // Nova claridade = 255 - claridade (com um teto, para não estourar no branco).
            var desloc = (255 - (max + min)) * 0.92;
            p[i] = Math.max(0, Math.min(255, r + desloc));
            p[i + 1] = Math.max(0, Math.min(255, g + desloc));
            p[i + 2] = Math.max(0, Math.min(255, b + desloc));
          }
          ctx.putImageData(d, 0, 0);
          resolver(c.toDataURL("image/png"));
        } catch (e) { resolver(null); }
      };
      img.onerror = function () { resolver(null); };
      img.src = dataUrl;
    });
  }

  async function prepararSvgParaExportacao(svgEl, removerImagens) {
    var copia = svgEl.cloneNode(true);
    copia.querySelectorAll(".legenda-fechar").forEach(function (b) { b.remove(); }); // botão da tela
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    copia.style.transform = "none";
    copia.style.transformOrigin = "";

    var imagensVivas = Array.prototype.slice.call(svgEl.querySelectorAll("image"));
    var imagensCopia = Array.prototype.slice.call(copia.querySelectorAll("image"));

    await Promise.all(imagensCopia.map(async function (imagem, indice) {
      if (removerImagens) {
        imagem.remove();
        return;
      }

      var origem = obterOrigemDaImagemSvg(imagem);

      if (!origem && imagensVivas[indice]) {
        origem = obterOrigemDaImagemSvg(imagensVivas[indice]);
      }

      if (!origem) return;

      try {
        var dataUrl = await fonteImagemComoDataUrl(origem, imagensVivas[indice]);
        if (!dataUrl) return;
        dataUrl = await aplicarTomNaImagem(imagem, dataUrl);
        if (imagem.getAttribute("class") === "eq-icone-catalogo" && papelEscuroNaTela()) dataUrl = (await clarearIcone(dataUrl)) || dataUrl;
        imagem.setAttribute("href", dataUrl);
        imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
      } catch (erroImagem) {
        console.warn("Não foi possível incorporar imagem na exportação:", origem, erroImagem);
      }
    }));

    return copia;
  }

  // Nome do arquivo exportado: projeto + data, ex.: "projeto-principal-2026-09-26.png".
  // Diagrama de redes e de monitoramento levam o tipo no nome ("…-monitoramento-…").
  function nomeArquivoExportacao(extensao) {
    var base = normalizarTextoEquipamento(projetoAtual).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "diagrama";
    var modo = modoAtual();
    var sufixo = modo === "redes" ? "-rede" : modo === "monitoramento" ? "-monitoramento" : "";
    var hoje = new Date();
    var data = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
    return base + sufixo + "-" + data + "." + extensao;
  }

  // Tema escuro: o papel da tela é escuro, e a exportação acompanha. As cores
  // padrão do desenho (claras na tela via CSS) são gravadas na cópia, porque o
  // CSS da página não vai junto para o PDF/PNG/SVG. Cores escolhidas pelo usuário ficam.
  var CORES_PAPEL_ESCURO = {
    text: { "#14212b": "#E8F1F8", "#111111": "#E8F1F8", "#405363": "#9CB7C8", "#34495a": "#9CB7C8", "#1f5f8b": "#71C7F0", "#2ead68": "#4BE08C" }
  };
  function corEscura(cor) {
    var m = String(cor || "").match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3 || (m.length > 3 && Number(m[3]) < 0.5)) return null;
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 90;
  }
  // Fundo do layout (o do app, atrás dos painéis).
  function corDoLayout() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    var h = /^#([0-9a-f]{6})$/i.exec(v);
    if (h) return "rgb(" + [0, 2, 4].map(function (i) { return parseInt(h[1].slice(i, i + 2), 16); }).join(", ") + ")";
    return v || getComputedStyle(document.body).backgroundColor;
  }
  // Exportação sempre em papel claro (fica bonito impresso e gasta pouca tinta),
  // independente do tema da tela.
  function papelEscuroNaTela() { return false; }
  var COR_PAPEL = "#FBF8F2"; // bege bem leve: a folha inteira nessa cor, sem faixa
  function aplicarPapelEscuroNaCopia(svg) {
    svg.querySelectorAll("text").forEach(function (t) {
      var nova = CORES_PAPEL_ESCURO.text[String(t.getAttribute("fill") || "").toLowerCase()];
      if (nova) t.setAttribute("fill", nova);
    });
    svg.querySelectorAll("g.node polygon").forEach(function (p) {
      if (String(p.getAttribute("fill") || "").toLowerCase() === "#ffffff") { p.setAttribute("fill", "#132636"); p.setAttribute("stroke", "#DCEBF5"); p.setAttribute("stroke-width", "1.4"); }
    });
    svg.querySelectorAll("g.cluster path, g.cluster polygon").forEach(function (p) { if (p.getAttribute("stroke") && p.getAttribute("stroke") !== "none") p.setAttribute("stroke", "#4E6A80"); });
    svg.querySelectorAll("g.cluster text").forEach(function (t) { t.setAttribute("fill", "#9CB7C8"); });
    svg.querySelectorAll("g.edge path, g.edge polygon").forEach(function (p) {
      if (String(p.getAttribute("stroke") || "").toLowerCase() === "#5a7284") { p.setAttribute("stroke", "#7FA3BC"); if (p.tagName.toLowerCase() === "polygon") p.setAttribute("fill", "#7FA3BC"); }
    });
    svg.querySelectorAll(".eq-moldura-icone").forEach(function (r) { r.setAttribute("stroke", "#8FA9BC"); });
    // Legenda dos cabos: a caixa acompanha o fundo, sem retângulo branco.
    svg.querySelectorAll("g.legenda-cabos rect").forEach(function (r) { r.setAttribute("fill", "#FFFFFF"); r.setAttribute("fill-opacity", "0.05"); r.setAttribute("stroke", "#4E6A80"); });
    svg.querySelectorAll("g.legenda-cabos text").forEach(function (t) { t.setAttribute("fill", "#E8F1F8"); });
    svg.querySelectorAll("g.legenda-cabos tspan").forEach(function (t) { t.setAttribute("fill", "#9CB7C8"); });
    svg.querySelectorAll("g.edge g.selo-cabo rect, g.edge rect.selo-cabo").forEach(function (r) { if (String(r.getAttribute("fill") || "").toLowerCase() === "#ffffff") { r.setAttribute("fill", "#132636"); } });
    // Etiquetas de cabo e IPs ficam legíveis por cima das linhas.
    svg.querySelectorAll("g.edge text").forEach(function (t) { t.setAttribute("fill", "#9CB7C8"); });
  }

  // Emoldura a cópia exportada: cabeçalho (projeto, data, totais), rodapé com a
  // legenda de tipos e fundo sólido. Aumenta o viewBox em volta do desenho.
  // Cor de fundo da exportação: o papel (a mesma na folha, no desenho e no cabeçalho).
  function corDeFundoDaExportacao() { return COR_PAPEL; }
  function rgbDaCor(hex) {
    var h = String(hex).replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // aspecto (largura/altura da área útil da folha, opcional): a moldura cresce até
  // ter o formato da folha. Assim o cabeçalho fica colado no topo, a ficha e a
  // legenda no rodapé, e o diagrama centralizado no meio.
  function adicionarMolduraDeExportacao(svg, aspecto) {
    var vb = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(function (n) { return !Number.isFinite(n); }) || !vb[2] || !vb[3]) return;
    var NS = "http://www.w3.org/2000/svg";
    // Escala do cabeçalho e do rodapé: acompanham o tamanho do desenho, para as
    // letras terem sempre o mesmo tamanho na folha (diagrama grande não as encolhe).
    var maior = Math.max(vb[2], vb[3] * (aspecto > 0 ? aspecto : 1.414));
    var k = Math.max(1, maior / 760);
    function z(n) { return n * k; }
    var MARGEM = z(32), TOPO = z(100), RODAPE = z(74);
    var larguraNova = Math.max(vb[2] + 2 * MARGEM, z(520));
    var alturaNova = vb[3] + TOPO + RODAPE;
    if (aspecto > 0) {
      if (larguraNova / alturaNova < aspecto) larguraNova = alturaNova * aspecto;
      else alturaNova = larguraNova / aspecto;
    }
    var x0 = vb[0] - (larguraNova - vb[2]) / 2;
    var y0 = vb[1] - TOPO - (alturaNova - vb[3] - TOPO - RODAPE) / 2;
    var fimFolha = y0 + alturaNova;

    var escuro = papelEscuroNaTela();
    var fundo = corDeFundoDaExportacao();
    if (escuro) aplicarPapelEscuroNaCopia(svg);

    function el(tag, atributos, texto) {
      var no = document.createElementNS(NS, tag);
      Object.keys(atributos).forEach(function (chave) { no.setAttribute(chave, atributos[chave]); });
      if (texto != null) no.textContent = texto;
      return no;
    }

    var fonte = "Helvetica, Arial, sans-serif";
    var agora = new Date();
    var data = agora.toLocaleDateString("pt-BR"), hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    var DESTAQUE = "#E0932F", AZUL = "#0E2233", SUAVE = "#6B7C89";
    var moldura = el("g", { "class": "moldura-exportacao", "font-family": fonte, fill: AZUL });
    var xi = x0 + MARGEM, xf = x0 + larguraNova - MARGEM;

    // ---- Cabeçalho, no topo da folha ----
    moldura.appendChild(el("rect", { x: x0, y: y0, width: larguraNova, height: z(5), fill: AZUL }));
    moldura.appendChild(el("rect", { x: x0, y: y0, width: Math.min(z(180), larguraNova * 0.25), height: z(5), fill: DESTAQUE }));
    var marca = el("g", { transform: "translate(" + xi + "," + (y0 + z(24)) + ") scale(" + k + ")" });
    marca.appendChild(el("rect", { x: 0, y: 0, width: 40, height: 40, rx: 10, fill: AZUL }));
    marca.appendChild(el("path", { d: "M20 9 L31 20 L20 31 L9 20 Z", fill: "none", stroke: DESTAQUE, "stroke-width": 2.2 }));
    marca.appendChild(el("circle", { cx: 20, cy: 20, r: 3.8, fill: "#5FD4C4" }));
    moldura.appendChild(marca);
    moldura.appendChild(el("text", { x: xi + z(54), y: y0 + z(46), "font-size": z(28), "font-weight": "bold", "letter-spacing": z(-0.4) }, projetoAtual));
    moldura.appendChild(el("text", { x: xi + z(54), y: y0 + z(65), "font-size": z(12.5), fill: SUAVE },
      estado.subtitulo || ("Documentação de rede · " + MODOS_DIAGRAMA[modoAtual()].exportacao)));
    moldura.appendChild(el("text", { x: xf, y: y0 + z(40), "font-size": z(8.5), "font-weight": "bold", "letter-spacing": z(1.6), fill: SUAVE, "text-anchor": "end" }, "DIAGRAMA DE REDE"));
    moldura.appendChild(el("text", { x: xf, y: y0 + z(58), "font-size": z(13), "font-weight": "bold", "text-anchor": "end" }, MODOS_DIAGRAMA[modoAtual()].exportacao));
    moldura.appendChild(el("line", { x1: xi, x2: xf, y1: y0 + TOPO - z(14), y2: y0 + TOPO - z(14), stroke: AZUL, "stroke-opacity": 0.14, "stroke-width": k }));
    moldura.appendChild(el("line", { x1: xi, x2: xi + z(84), y1: y0 + TOPO - z(14), y2: y0 + TOPO - z(14), stroke: DESTAQUE, "stroke-width": z(2.6) }));

    // ---- Rodapé, no fim da folha: legenda à esquerda, ficha à direita ----
    var yLinha = fimFolha - RODAPE + z(8);
    moldura.appendChild(el("line", { x1: xi, x2: xf, y1: yLinha, y2: yLinha, stroke: AZUL, "stroke-opacity": 0.14, "stroke-width": k }));
    var yBase = fimFolha - z(24);
    var xLegenda = xi;
    (camadasOcultas().tipos ? [] : itensDaLegenda(estado)).forEach(function (item) {
      moldura.appendChild(el("rect", { x: xLegenda, y: yBase - z(8.5), width: z(10), height: z(10), rx: item.status ? z(5) : z(2), fill: item.cor }));
      moldura.appendChild(el("text", { x: xLegenda + z(15), y: yBase, "font-size": z(11), fill: SUAVE }, item.texto));
      xLegenda += z(15 + item.texto.length * 6.3 + 18);
    });
    var ficha = [["EQUIPAMENTOS", String(estado.equipamentos.length)], ["CABOS", String(estado.conexoes.length)], ["DATA", data + " · " + hora]];
    var xFicha = xf;
    ficha.slice().reverse().forEach(function (item) {
      var largura = z(Math.max(item[0].length * 6, item[1].length * 7.4) + 20);
      xFicha -= largura;
      moldura.appendChild(el("line", { x1: xFicha, x2: xFicha, y1: yBase - z(26), y2: yBase + z(4), stroke: AZUL, "stroke-opacity": 0.12, "stroke-width": k }));
      moldura.appendChild(el("text", { x: xFicha + z(11), y: yBase - z(14), "font-size": z(8), "font-weight": "bold", "letter-spacing": z(1.2), fill: SUAVE }, item[0]));
      moldura.appendChild(el("text", { x: xFicha + z(11), y: yBase + z(2), "font-size": z(13), "font-weight": "bold" }, item[1]));
    });
    moldura.appendChild(el("text", { x: xf, y: fimFolha - z(7), "font-size": z(7.5), fill: SUAVE, "text-anchor": "end", "fill-opacity": 0.8 }, "Gerado com Grafo · thegrafo.vercel.app"));

    // Caixa da legenda dos cabos na mesma cor do papel (só a borda aparece).
    svg.querySelectorAll("g.legenda-cabos > rect").forEach(function (r) { r.setAttribute("fill", fundo); });

    svg.insertBefore(el("rect", { x: x0, y: y0, width: larguraNova, height: alturaNova, fill: fundo }), svg.firstChild);
    svg.appendChild(moldura);

    // width/height acompanham o viewBox, mantendo a unidade original (pt/px).
    ["width", "height"].forEach(function (attr, i) {
      var valor = String(svg.getAttribute(attr) || "");
      var numero = parseFloat(valor);
      if (!numero) return;
      var unidade = valor.replace(/^[\d.\s-]+/, "");
      svg.setAttribute(attr, (numero * (i === 0 ? larguraNova / vb[2] : alturaNova / vb[3])).toFixed(2) + unidade);
    });
    svg.setAttribute("viewBox", [x0, y0, larguraNova, alturaNova].map(function (n) { return n.toFixed(2); }).join(" "));
  }

  function baixarBlob(blob, nome) {
    if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === "function") {
      window.navigator.msSaveOrOpenBlob(blob, nome);
      return;
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function carregarImagemParaCanvas(origem) {
    return new Promise(async function (resolver, rejeitar) {
      var fonte = origem;
      try { fonte = await fonteImagemComoDataUrl(origem, null); } catch (e) {}

      var img = new Image();
      img.onload = function () { resolver(img); };
      img.onerror = function () { rejeitar(new Error("Falha ao carregar imagem: " + origem)); };
      img.src = fonte;
    });
  }

  async function desenharImagensDosEquipamentosNoPng(contexto, svgEl, escala, viewBox) {
    var imagensSvg = Array.prototype.slice.call(svgEl.querySelectorAll("image"));

    for (var i = 0; i < imagensSvg.length; i++) {
      var imagemSvg = imagensSvg[i];
      var origem = obterOrigemDaImagemSvg(imagemSvg);

      if (!origem) continue;

      var raster = null;
      try {
        raster = imagemSvg;
        var teste = document.createElement("canvas");
        teste.width = 1;
        teste.height = 1;
        teste.getContext("2d").drawImage(imagemSvg, 0, 0, 1, 1);
      } catch (e) {
        raster = await carregarImagemParaCanvas(origem);
      }

      var x = numeroSvg(imagemSvg.getAttribute("x"));
      var y = numeroSvg(imagemSvg.getAttribute("y"));
      var largura = numeroSvg(imagemSvg.getAttribute("width"));
      var altura = numeroSvg(imagemSvg.getAttribute("height"));
      if (!largura || !altura) continue;

      var matriz = imagemSvg.getCTM();
      if (!matriz) continue;

      contexto.save();
      contexto.setTransform(
        escala * matriz.a,
        escala * matriz.b,
        escala * matriz.c,
        escala * matriz.d,
        escala * (matriz.e - viewBox.x),
        escala * (matriz.f - viewBox.y)
      );

      contexto.beginPath();
      var raio = Math.min(3, largura / 2, altura / 2);
      if (contexto.roundRect) {
        contexto.roundRect(x, y, largura, altura, raio);
      } else {
        contexto.rect(x, y, largura, altura);
      }
      contexto.clip();

      contexto.drawImage(raster, x, y, largura, altura);
      contexto.restore();
    }
  }

  btnBaixar.addEventListener("click", async function () {
    if (!ultimoDot) return;
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) return;

    try {
      var svgExportavel = await prepararSvgParaExportacao(svgEl, false);
      adicionarMolduraDeExportacao(svgExportavel);
      var svgText = new XMLSerializer().serializeToString(svgExportavel);
      var nomeSvg = nomeArquivoExportacao("svg");

      if (downloadsCap) {
        try {
          await downloadsCap.save({ filename: nomeSvg, data: svgText });
          avisar("SVG baixado.");
          document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "svg" }));
          return;
        } catch (e) {}
      }

      baixarBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), nomeSvg);
      avisar("SVG baixado: " + nomeSvg);
      document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "svg" }));
    } catch (e) {
      mostrarErro("Não foi possível exportar o SVG.\nDetalhe: " + e.message);
    }
  });

  async function prepararSvgSeguroParaPng(svgEl) {
    var copia = svgEl.cloneNode(true);
    copia.querySelectorAll(".legenda-fechar").forEach(function (b) { b.remove(); }); // botão da tela
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    copia.style.transform = "none";
    copia.style.transformOrigin = "";

    var imagensOriginais = Array.prototype.slice.call(svgEl.querySelectorAll("image"));
    var imagensCopia = Array.prototype.slice.call(copia.querySelectorAll("image"));
    var imagensIgnoradas = 0;

    for (var i = 0; i < imagensCopia.length; i++) {
      var imagem = imagensCopia[i];
      var origem = obterOrigemDaImagemSvg(imagem);

      if (!origem && imagensOriginais[i]) {
        origem = obterOrigemDaImagemSvg(imagensOriginais[i]);
      }

      if (!origem) {
        imagem.remove();
        imagensIgnoradas++;
        continue;
      }

      // Só data: URL pode ir para o PNG: qualquer imagem externa bloqueia o canvas.
      var dataUrl = await imagemParaExportacao(origem);
      if (dataUrl) {
        dataUrl = await aplicarTomNaImagem(imagem, dataUrl);
        if (imagem.getAttribute("class") === "eq-icone-catalogo" && papelEscuroNaTela()) dataUrl = (await clarearIcone(dataUrl)) || dataUrl;
        imagem.setAttribute("href", dataUrl);
        imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
      } else {
        console.warn("Imagem ignorada na exportação PNG (não foi possível lê-la):", origem);
        imagem.remove();
        imagensIgnoradas++;
      }
    }

    return { svg: copia, imagensIgnoradas: imagensIgnoradas };
  }

  function carregarSvgSerializadoComoImagem(svgText) {
    return new Promise(function (resolver, rejeitar) {
      var blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var imagem = new Image();

      imagem.onload = function () {
        resolver({ imagem: imagem, url: url });
      };

      imagem.onerror = function () {
        URL.revokeObjectURL(url);
        rejeitar(new Error("O navegador não conseguiu rasterizar o SVG do diagrama."));
      };

      imagem.src = url;
    });
  }

  function canvasParaPngBlob(canvas) {
    return new Promise(function (resolver, rejeitar) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) {
            rejeitar(new Error("O navegador retornou um PNG vazio."));
            return;
          }
          resolver(blob);
        }, "image/png");
      } catch (erro) {
        rejeitar(erro);
      }
    });
  }

  // Canvas grande demais trava ou sai em branco (Safari: ~16 MP). Acima disso a
  // resolução é reduzida, mantendo o desenho inteiro.
  var MAX_PIXELS_RASTER = 16e6;
  var MAX_LADO_RASTER = 12000;

  // Desenha o diagrama num canvas, com as imagens embutidas (PNG e PDF usam isto).
  // opcoes.moldura: cabeçalho + legenda. opcoes.pixelsPorUnidade(larguraVb, alturaVb):
  // quantos pixels por unidade do viewBox (pt do Graphviz); padrão 2.
  async function rasterizarDiagrama(opcoes) {
    opcoes = opcoes || {};
    var svgEl = elCanvas.querySelector("svg");
    if (!svgEl) throw new Error("Gere o diagrama antes de exportar.");
    var preparado = await prepararSvgSeguroParaPng(svgEl);
    if (opcoes.moldura !== false) adicionarMolduraDeExportacao(preparado.svg, opcoes.aspecto);
    var svgText = new XMLSerializer().serializeToString(preparado.svg);
    var carregado = await carregarSvgSerializadoComoImagem(svgText);
    try {
      // Tamanho da cópia (emoldurada ou não), não do SVG da tela.
      var vb = preparado.svg.viewBox && preparado.svg.viewBox.baseVal;
      var largura = vb && vb.width ? vb.width : (parseFloat(svgEl.getAttribute("width")) || carregado.imagem.naturalWidth || carregado.imagem.width);
      var altura = vb && vb.height ? vb.height : (parseFloat(svgEl.getAttribute("height")) || carregado.imagem.naturalHeight || carregado.imagem.height);
      if (!largura || !altura) throw new Error("Não foi possível determinar o tamanho do diagrama.");

      var escala = opcoes.pixelsPorUnidade ? opcoes.pixelsPorUnidade(largura, altura) : 2;
      escala = Math.min(escala, Math.sqrt(MAX_PIXELS_RASTER / (largura * altura)), MAX_LADO_RASTER / Math.max(largura, altura));
      escala = Math.max(escala, 0.05);

      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(largura * escala));
      canvas.height = Math.max(1, Math.ceil(altura * escala));
      var contexto = canvas.getContext("2d");
      if (!contexto) throw new Error("Canvas 2D não está disponível neste navegador.");
      contexto.fillStyle = opcoes.fundo || getComputedStyle(elCanvas).backgroundColor || "#ffffff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.imageSmoothingQuality = "high";
      contexto.drawImage(carregado.imagem, 0, 0, canvas.width, canvas.height);
      return { canvas: canvas, larguraVb: largura, alturaVb: altura, imagensIgnoradas: preparado.imagensIgnoradas };
    } finally {
      URL.revokeObjectURL(carregado.url);
    }
  }

  function avisarImagensIgnoradas(formato, quantidade) {
    mostrarErro(formato + " baixado, mas " + quantidade + " imagem(ns) não puderam ser incluídas.\n" +
      "Se forem imagens novas em assets/images, rode \"npm run icones\"; se vierem de outro site, envie o arquivo pelo campo Imagem do equipamento.", null, { aviso: true });
  }

  btnBaixarPng.addEventListener("click", async function () {
    if (!elCanvas.querySelector("svg")) {
      mostrarErro("Gere o diagrama antes de baixar o PNG.");
      return;
    }
    var textoOriginalBotao = btnBaixarPng.textContent;
    btnBaixarPng.disabled = true;
    btnBaixarPng.textContent = "Gerando PNG...";
    try {
      var r = await rasterizarDiagrama({ moldura: true });
      baixarBlob(await canvasParaPngBlob(r.canvas), nomeArquivoExportacao("png"));
      if (r.imagensIgnoradas > 0) avisarImagensIgnoradas("PNG", r.imagensIgnoradas);
      else { esconderErro(); avisar("PNG baixado."); }
      document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "png" }));
    } catch (e) {
      mostrarErro("Não foi possível exportar o diagrama como PNG.\nDetalhe: " + e.message);
    } finally {
      btnBaixarPng.disabled = false;
      btnBaixarPng.textContent = textoOriginalBotao;
    }
  });

  // ==== 15-pagina-e-pdf.js: página, prévia e PDF; inicialização do editor (parte de assets/js/editor/app.js; npm run montar) ====
  // ---- Página, área de desenho e PDF ------------------------------------------
  // Barra lateral direita. A configuração vale para a conta neste navegador.
  var FORMATOS_PAGINA = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210] };
  var ESCALAS_PAGINA = ["ajustar", "25", "50", "75", "100", "150", "200"];
  var PAGINA_PADRAO = { formato: "A4", orientacao: "paisagem", escala: "ajustar", margem: 10, moldura: true,
    areaLargura: LIMITE_CANVAS.maxX - LIMITE_CANVAS.minX, areaAltura: LIMITE_CANVAS.maxY - LIMITE_CANVAS.minY };
  var MM_POR_PT = 25.4 / 72;   // o viewBox do Graphviz é em pt
  var DPI_PDF = 200;           // resolução alvo das imagens no PDF
  var MAX_PAGINAS_PDF = 60;
  var elPainelPagina = document.getElementById("painelPagina");
  var btnPaginaPdf = document.getElementById("btnPaginaPdf");
  var btnExportarPdf = document.getElementById("btnExportarPdf");
  var elPrevia = document.getElementById("previaPagina");
  var elPreviaResumo = document.getElementById("previaResumo");
  var campoPagina = {
    areaLargura: document.getElementById("areaLargura"),
    areaAltura: document.getElementById("areaAltura"),
    formato: document.getElementById("paginaFormato"),
    escala: document.getElementById("paginaEscala"),
    margem: document.getElementById("paginaMargem"),
    moldura: document.getElementById("paginaMoldura")
  };

  function limitarNumero(valor, min, max, padrao) {
    var n = Math.round(Number(valor));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  }

  function normalizarConfigPagina(bruto) {
    var c = Object.assign({}, PAGINA_PADRAO, bruto && typeof bruto === "object" ? bruto : {});
    if (!FORMATOS_PAGINA[c.formato]) c.formato = PAGINA_PADRAO.formato;
    if (c.orientacao !== "retrato" && c.orientacao !== "paisagem") c.orientacao = PAGINA_PADRAO.orientacao;
    if (ESCALAS_PAGINA.indexOf(String(c.escala)) < 0) c.escala = PAGINA_PADRAO.escala;
    c.escala = String(c.escala);
    c.margem = limitarNumero(c.margem, 0, 40, PAGINA_PADRAO.margem);
    c.moldura = c.moldura !== false;
    c.areaLargura = limitarNumero(c.areaLargura, 1000, 20000, PAGINA_PADRAO.areaLargura);
    c.areaAltura = limitarNumero(c.areaAltura, 1000, 20000, PAGINA_PADRAO.areaAltura);
    return c;
  }

  var configPagina = (function () {
    try { return normalizarConfigPagina(JSON.parse(localStorage.getItem(window.GrafoAuth.storageKey("grafo-pagina")) || "null")); }
    catch (e) { return normalizarConfigPagina(null); }
  })();

  function salvarConfigPagina() {
    try { localStorage.setItem(window.GrafoAuth.storageKey("grafo-pagina"), JSON.stringify(configPagina)); } catch (e) {}
  }

  // Área de desenho centrada na origem: limita o deslocamento dos equipamentos.
  function aplicarAreaDeDesenho() {
    LIMITE_CANVAS.minX = -configPagina.areaLargura / 2;
    LIMITE_CANVAS.maxX = configPagina.areaLargura / 2;
    LIMITE_CANVAS.minY = -configPagina.areaAltura / 2;
    LIMITE_CANVAS.maxY = configPagina.areaAltura / 2;
  }

  function preencherFormPagina() {
    campoPagina.areaLargura.value = configPagina.areaLargura;
    campoPagina.areaAltura.value = configPagina.areaAltura;
    campoPagina.formato.value = configPagina.formato;
    campoPagina.escala.value = configPagina.escala;
    campoPagina.margem.value = configPagina.margem;
    campoPagina.moldura.checked = configPagina.moldura;
    document.querySelectorAll('input[name="paginaOrientacao"]').forEach(function (r) { r.checked = r.value === configPagina.orientacao; });
  }

  function tamanhoPaginaMm() {
    var f = FORMATOS_PAGINA[configPagina.formato];
    return configPagina.orientacao === "retrato" ? { w: f[0], h: f[1] } : { w: f[1], h: f[0] };
  }

  // Como o desenho (larguraVb × alturaVb, em pt) cabe no papel. "Ajustar" põe
  // tudo numa página; escala fixa divide em várias páginas, sem cortar nada.
  function planoDeImpressao(larguraVb, alturaVb) {
    var pg = tamanhoPaginaMm();
    var m = Math.min(configPagina.margem, pg.w / 4, pg.h / 4);
    var areaW = pg.w - 2 * m, areaH = pg.h - 2 * m;
    var baseW = larguraVb * MM_POR_PT, baseH = alturaVb * MM_POR_PT;
    var ajustar = configPagina.escala === "ajustar";
    var escala = ajustar ? Math.min(areaW / baseW, areaH / baseH) : Number(configPagina.escala) / 100;
    var larguraMm = baseW * escala, alturaMm = baseH * escala;
    var colunas = ajustar ? 1 : Math.max(1, Math.ceil(larguraMm / areaW - 1e-6));
    var linhas = ajustar ? 1 : Math.max(1, Math.ceil(alturaMm / areaH - 1e-6));
    return { pagina: pg, margem: m, areaW: areaW, areaH: areaH, escala: escala, larguraMm: larguraMm, alturaMm: alturaMm,
      colunas: colunas, linhas: linhas, total: colunas * linhas };
  }

  // Formato da área útil da folha, para a moldura ocupar a página inteira (só
  // com "Ajustar à página": uma folha, cabeçalho no topo e rodapé embaixo).
  function aspectoDaFolha() {
    if (configPagina.escala !== "ajustar") return 0;
    var p = planoDeImpressao(1, 1);
    return p.areaW / p.areaH;
  }

  // Recorta o desenho rasterizado em páginas: [{ canvas, x, y, w, h }] em mm na folha.
  function paginasDoPlano(canvas, plano) {
    var paginas = [];
    var pxPorMm = canvas.width / plano.larguraMm;
    for (var lin = 0; lin < plano.linhas; lin++) {
      for (var col = 0; col < plano.colunas; col++) {
        var xMm = col * plano.areaW, yMm = lin * plano.areaH;
        var wMm = Math.min(plano.areaW, plano.larguraMm - xMm), hMm = Math.min(plano.areaH, plano.alturaMm - yMm);
        var pedaco = canvas;
        if (plano.total > 1) {
          pedaco = document.createElement("canvas");
          pedaco.width = Math.max(1, Math.round(wMm * pxPorMm));
          pedaco.height = Math.max(1, Math.round(hMm * pxPorMm));
          pedaco.getContext("2d").drawImage(canvas, Math.round(xMm * pxPorMm), Math.round(yMm * pxPorMm), pedaco.width, pedaco.height, 0, 0, pedaco.width, pedaco.height);
        }
        // Uma página só: centraliza na área útil.
        var x = plano.margem + (plano.total === 1 ? (plano.areaW - wMm) / 2 : 0);
        var y = plano.margem + (plano.total === 1 ? (plano.areaH - hMm) / 2 : 0);
        paginas.push({ canvas: pedaco, x: x, y: y, w: wMm, h: hMm });
      }
    }
    return paginas;
  }

  function descreverPlano(plano) {
    var pg = plano.pagina;
    var partes = [configPagina.formato + " " + configPagina.orientacao + " · " + Math.round(pg.w) + " × " + Math.round(pg.h) + " mm",
      "escala " + Math.round(plano.escala * 100) + "%", plural(plano.total, "página", "páginas")];
    return partes.join(" · ");
  }

  // ---- Prévia -----------------------------------------------------------------
  var LARGURA_PREVIA = 236;  // px da miniatura de uma página
  var timerPrevia = null;
  var geracaoPrevia = 0;

  function painelPaginaAberto() { return !elPainelPagina.hidden; }

  function solicitarPrevia() {
    // Pode ser chamada por gerar() antes deste trecho inicializar.
    if (!elPainelPagina || !painelPaginaAberto()) return;
    clearTimeout(timerPrevia);
    timerPrevia = setTimeout(atualizarPrevia, 220);
  }

  async function atualizarPrevia() {
    var minha = ++geracaoPrevia;
    var temDiagrama = !!elCanvas.querySelector("svg");
    btnExportarPdf.disabled = !temDiagrama;
    if (!temDiagrama) {
      elPrevia.innerHTML = '<div class="previa-vazia">Adicione equipamentos para ver a prévia.</div>';
      elPreviaResumo.textContent = "";
      return;
    }
    elPrevia.classList.add("carregando");
    try {
      var pg = tamanhoPaginaMm();
      var escalaMiniatura = LARGURA_PREVIA / Math.max(pg.w, pg.h * 0.8); // px por mm na miniatura
      var plano = null;
      var r = await rasterizarDiagrama({ moldura: configPagina.moldura, aspecto: aspectoDaFolha(), fundo: corDeFundoDaExportacao(), pixelsPorUnidade: function (w, h) {
        plano = planoDeImpressao(w, h);
        return (plano.larguraMm * escalaMiniatura / w) * (window.devicePixelRatio || 1);
      } });
      if (minha !== geracaoPrevia) return; // já há uma prévia mais nova
      var paginas = paginasDoPlano(r.canvas, plano);
      // Várias páginas: grade com até 3 folhas por linha, na ordem de montagem.
      var colunasGrade = paginas.length > 1 ? Math.min(3, Math.max(2, plano.colunas)) : 1;
      var MOSTRAR = colunasGrade * 3;
      elPrevia.innerHTML = "";
      elPrevia.classList.toggle("varias", paginas.length > 1);
      paginas.slice(0, MOSTRAR).forEach(function (p, i) {
        var folha = document.createElement("canvas");
        var dpr = window.devicePixelRatio || 1;
        var escalaFolha = escalaMiniatura / colunasGrade * (colunasGrade > 1 ? 0.9 : 1);
        folha.width = Math.round(pg.w * escalaFolha * dpr);
        folha.height = Math.round(pg.h * escalaFolha * dpr);
        folha.style.width = Math.round(pg.w * escalaFolha) + "px";
        folha.style.height = Math.round(pg.h * escalaFolha) + "px";
        var ctx = folha.getContext("2d");
        var k = escalaFolha * dpr;
        ctx.fillStyle = corDeFundoDaExportacao(); // a folha inteira na cor do layout, como no PDF
        ctx.fillRect(0, 0, folha.width, folha.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(p.canvas, p.x * k, p.y * k, p.w * k, p.h * k);
        // Margem tracejada: mostra a área útil da folha.
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.strokeStyle = "rgba(20, 44, 60, 0.25)";
        ctx.lineWidth = dpr;
        ctx.strokeRect(plano.margem * k, plano.margem * k, plano.areaW * k, plano.areaH * k);
        folha.className = "previa-folha";
        folha.setAttribute("role", "img");
        folha.setAttribute("aria-label", "Página " + (i + 1) + " de " + paginas.length);
        elPrevia.appendChild(folha);
      });
      if (paginas.length > MOSTRAR) {
        var mais = document.createElement("div");
        mais.className = "previa-mais";
        mais.textContent = "+ " + (paginas.length - MOSTRAR) + " página(s)";
        elPrevia.appendChild(mais);
      }
      var resumo = descreverPlano(plano);
      if (plano.total > MAX_PAGINAS_PDF) resumo += " — acima do máximo de " + MAX_PAGINAS_PDF + "; use uma escala menor.";
      else if (configPagina.escala === "ajustar" && plano.escala < 0.3) resumo += " — o texto pode ficar pequeno; considere um formato maior.";
      elPreviaResumo.textContent = resumo;
      btnExportarPdf.disabled = plano.total > MAX_PAGINAS_PDF;
    } catch (e) {
      if (minha !== geracaoPrevia) return;
      elPrevia.innerHTML = '<div class="previa-vazia">Não foi possível gerar a prévia.</div>';
      elPreviaResumo.textContent = e.message;
    } finally {
      if (minha === geracaoPrevia) elPrevia.classList.remove("carregando");
    }
  }

  // ---- PDF --------------------------------------------------------------------
  // Também guardados no aparelho para exportar sem internet (GrafoApp.arquivosParaGuardar).
  var URL_JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js";
  var URL_SVG2PDF = "https://cdn.jsdelivr.net/npm/svg2pdf.js@2.8.1/dist/svg2pdf.umd.min.js";
  var promessaJsPdf = null;
  function carregarJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!promessaJsPdf) {
      promessaJsPdf = new Promise(function (resolver, rejeitar) {
        var script = document.createElement("script");
        // integrity: o navegador recusa o arquivo se o CDN entregar outro conteúdo.
        script.src = URL_JSPDF;
        script.integrity = "sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3";
        script.crossOrigin = "anonymous";
        script.onload = function () { window.jspdf && window.jspdf.jsPDF ? resolver(window.jspdf.jsPDF) : rejeitar(new Error("jsPDF indisponível.")); };
        script.onerror = function () { promessaJsPdf = null; rejeitar(new Error("Não foi possível carregar o gerador de PDF. Verifique a conexão.")); };
        document.head.appendChild(script);
      });
    }
    return promessaJsPdf;
  }

  // svg2pdf.js acrescenta doc.svg() ao jsPDF: o diagrama entra no PDF como
  // vetor (texto nítido em qualquer zoom, selecionável e pesquisável).
  var promessaSvg2Pdf = null;
  function carregarSvg2Pdf() {
    if (window.svg2pdf && window.svg2pdf.svg2pdf) return Promise.resolve();
    if (!promessaSvg2Pdf) {
      promessaSvg2Pdf = new Promise(function (resolver, rejeitar) {
        var script = document.createElement("script");
        script.src = URL_SVG2PDF;
        script.integrity = "sha384-7hc/mtl4lyRUMzYFqHxwNbYZwh27MESE5AWa2nEuVChLn8bCQcrn18OgGv9uHgzz";
        script.crossOrigin = "anonymous";
        script.onload = function () { window.svg2pdf && window.svg2pdf.svg2pdf ? resolver() : rejeitar(new Error("svg2pdf indisponível.")); };
        script.onerror = function () { promessaSvg2Pdf = null; rejeitar(new Error("Não foi possível carregar o svg2pdf.")); };
        document.head.appendChild(script);
      });
    }
    return promessaSvg2Pdf;
  }

  // As fontes padrão do PDF (Helvetica) só têm os caracteres do Latin-1.
  function textoCabeNaFontePdf(texto) { return /^[ -~ -ÿ\s]*$/.test(texto); }

  // Textos com emoji, setas etc. viram uma imagem pequena no mesmo lugar;
  // o resto do diagrama continua vetorial. O SVG precisa estar no documento
  // (getBBox e estilos calculados).
  function trocarTextosSemFontePorImagem(svg) {
    var ESCALA = 6;
    Array.prototype.slice.call(svg.querySelectorAll("text")).forEach(function (texto) {
      var conteudo = texto.textContent;
      if (!conteudo || textoCabeNaFontePdf(conteudo) || texto.querySelector("tspan")) return;
      var caixa;
      try { caixa = texto.getBBox(); } catch (e) { return; }
      if (!caixa || !caixa.width || !caixa.height) return;
      var estilo = getComputedStyle(texto);
      var tamanho = parseFloat(estilo.fontSize) || 10;
      var canvas = document.createElement("canvas");
      canvas.width = Math.ceil(caixa.width * ESCALA);
      canvas.height = Math.ceil(caixa.height * ESCALA);
      var ctx = canvas.getContext("2d");
      ctx.scale(ESCALA, ESCALA);
      ctx.font = estilo.fontStyle + " " + estilo.fontWeight + " " + tamanho + "px " + estilo.fontFamily;
      ctx.fillStyle = estilo.fill && estilo.fill !== "none" ? estilo.fill : "#000";
      ctx.globalAlpha = Number(estilo.fillOpacity) || 1;
      var ancora = estilo.textAnchor;
      ctx.textAlign = ancora === "middle" ? "center" : ancora === "end" ? "right" : "left";
      ctx.textBaseline = "alphabetic";
      var x = numeroSvg(texto.getAttribute("x")) - caixa.x;
      var y = numeroSvg(texto.getAttribute("y")) - caixa.y;
      ctx.fillText(conteudo, x, y);
      var imagem = document.createElementNS("http://www.w3.org/2000/svg", "image");
      imagem.setAttribute("x", caixa.x);
      imagem.setAttribute("y", caixa.y);
      imagem.setAttribute("width", caixa.width);
      imagem.setAttribute("height", caixa.height);
      var url = canvas.toDataURL("image/png");
      imagem.setAttribute("href", url);
      imagem.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
      if (texto.getAttribute("transform")) imagem.setAttribute("transform", texto.getAttribute("transform"));
      texto.parentNode.replaceChild(imagem, texto);
    });
  }

  // Monta o PDF em vetor. Retorna o jsPDF pronto ou lança erro (o chamador
  // então usa o modo imagem).
  async function montarPdfVetorial(JsPdf) {
    await carregarSvg2Pdf();
    var svgEl = elCanvas.querySelector("svg");
    var preparado = await prepararSvgSeguroParaPng(svgEl);
    var svg = preparado.svg;
    // O gerador de PDF não entende paint-order: o contorno claro dos textos sobre o
    // mapa cobriria as letras. No PDF vetorial os textos vão sem esse contorno.
    svg.querySelectorAll("text[paint-order]").forEach(function (t) { ["stroke", "stroke-width", "stroke-opacity", "stroke-linejoin", "paint-order"].forEach(function (a) { t.removeAttribute(a); }); });
    if (configPagina.moldura) adicionarMolduraDeExportacao(svg, aspectoDaFolha());
    var vb = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !vb[2] || !vb[3]) throw new Error("Não foi possível determinar o tamanho do diagrama.");
    var plano = planoDeImpressao(vb[2], vb[3]);
    if (plano.total > MAX_PAGINAS_PDF) {
      var erro = new Error("O PDF teria " + plano.total + " páginas (máximo " + MAX_PAGINAS_PDF + "). Use uma escala menor ou um formato maior.");
      erro.definitivo = true;
      throw erro;
    }
    var suporte = document.createElement("div");
    suporte.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
    suporte.appendChild(svg);
    document.body.appendChild(suporte);
    try {
      trocarTextosSemFontePorImagem(svg);
      var doc = new JsPdf({ orientation: configPagina.orientacao === "retrato" ? "portrait" : "landscape", unit: "mm", format: configPagina.formato.toLowerCase(), compress: true });
      doc.setProperties({ title: projetoAtual, subject: MODOS_DIAGRAMA[modoAtual()].exportacao, creator: "Grafo" });
      for (var lin = 0, i = 0; lin < plano.linhas; lin++) {
        for (var col = 0; col < plano.colunas; col++, i++) {
          if (i > 0) doc.addPage();
          var xMm = col * plano.areaW, yMm = lin * plano.areaH;
          var wMm = Math.min(plano.areaW, plano.larguraMm - xMm), hMm = Math.min(plano.areaH, plano.alturaMm - yMm);
          // Uma página só: centraliza na área útil. Várias: cada folha mostra o
          // seu pedaço do desenho inteiro, recortado na área útil.
          var x = plano.margem + (plano.total === 1 ? (plano.areaW - wMm) / 2 : 0);
          var y = plano.margem + (plano.total === 1 ? (plano.areaH - hMm) / 2 : 0);
          pintarFolha(doc, plano);
          doc.saveGraphicsState();
          doc.rect(x, y, wMm, hMm, null);
          doc.clip();
          doc.discardPath();
          await doc.svg(svg, { x: x - xMm, y: y - yMm, width: plano.larguraMm, height: plano.alturaMm });
          doc.restoreGraphicsState();
          if (plano.total > 1) {
            doc.setFontSize(7);
            doc.setTextColor(120);
            doc.text("Página " + (i + 1) + " de " + plano.total + " · linha " + (lin + 1) + ", coluna " + (col + 1),
              plano.pagina.w - plano.margem, plano.pagina.h - Math.max(2, plano.margem / 2), { align: "right" });
          }
        }
      }
      return { doc: doc, imagensIgnoradas: preparado.imagensIgnoradas };
    } finally {
      suporte.remove();
    }
  }

  // Folha inteira na cor de fundo do layout: sem faixas brancas na impressão.
  function pintarFolha(doc, plano) {
    var rgb = rgbDaCor(corDeFundoDaExportacao());
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(0, 0, plano.pagina.w, plano.pagina.h, "F");
  }

  // PDF com o diagrama como imagem (~DPI_PDF). Usado se o modo vetorial falhar.
  async function montarPdfRaster(JsPdf) {
    var plano = null;
    // Resolução pelo tamanho impresso (DPI_PDF), limitada pelo máximo seguro do canvas.
    var r = await rasterizarDiagrama({ moldura: configPagina.moldura, aspecto: aspectoDaFolha(), fundo: corDeFundoDaExportacao(), pixelsPorUnidade: function (w, h) {
      plano = planoDeImpressao(w, h);
      return (plano.larguraMm / 25.4 * DPI_PDF) / w;
    } });
    if (plano.total > MAX_PAGINAS_PDF) throw new Error("O PDF teria " + plano.total + " páginas (máximo " + MAX_PAGINAS_PDF + "). Use uma escala menor ou um formato maior.");
    var paginas = paginasDoPlano(r.canvas, plano);
    var doc = new JsPdf({ orientation: configPagina.orientacao === "retrato" ? "portrait" : "landscape", unit: "mm", format: configPagina.formato.toLowerCase(), compress: true });
    doc.setProperties({ title: projetoAtual, subject: MODOS_DIAGRAMA[modoAtual()].exportacao, creator: "Grafo" });
    paginas.forEach(function (p, i) {
      if (i > 0) doc.addPage();
      pintarFolha(doc, plano);
      doc.addImage(p.canvas, "PNG", p.x, p.y, p.w, p.h, undefined, "FAST");
      if (paginas.length > 1) {
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text("Página " + (i + 1) + " de " + paginas.length + " · linha " + (Math.floor(i / plano.colunas) + 1) + ", coluna " + (i % plano.colunas + 1),
          plano.pagina.w - plano.margem, plano.pagina.h - Math.max(2, plano.margem / 2), { align: "right" });
      }
    });
    return { doc: doc, imagensIgnoradas: r.imagensIgnoradas };
  }

  async function exportarPdf() {
    if (!elCanvas.querySelector("svg")) { mostrarErro("Gere o diagrama antes de exportar o PDF."); return; }
    var textoOriginal = btnExportarPdf.textContent;
    btnExportarPdf.disabled = true;
    btnExportarPdf.textContent = "Gerando PDF...";
    try {
      var JsPdf = await carregarJsPdf();
      var r;
      try {
        r = await montarPdfVetorial(JsPdf);
      } catch (erroVetor) {
        if (erroVetor.definitivo) throw erroVetor;
        console.warn("PDF vetorial falhou; gerando como imagem.", erroVetor);
        r = await montarPdfRaster(JsPdf);
      }
      var nome = nomeArquivoExportacao("pdf");
      baixarBlob(r.doc.output("blob"), nome);
      if (r.imagensIgnoradas > 0) avisarImagensIgnoradas("PDF", r.imagensIgnoradas);
      else { esconderErro(); avisar("PDF baixado: " + nome); }
      document.dispatchEvent(new CustomEvent("grafo:exportado", { detail: "pdf" }));
    } catch (e) {
      mostrarErro("Não foi possível exportar o PDF.\nDetalhe: " + e.message);
    } finally {
      btnExportarPdf.textContent = textoOriginal;
      btnExportarPdf.disabled = !elCanvas.querySelector("svg");
    }
  }

  var elSubtitulo = document.getElementById("paginaSubtitulo");
  if (elSubtitulo) elSubtitulo.addEventListener("change", function () {
    var v = elSubtitulo.value.trim().slice(0, 120);
    if (v) estado.subtitulo = v; else delete estado.subtitulo;
    salvarLocal();
    atualizarJsonAvancado();
    avisar("Subtítulo salvo: aparece no cabeçalho do PDF, PNG e SVG.");
  });
  function abrirPainelPagina(abrir) {
    if (abrir && elSubtitulo) elSubtitulo.value = estado.subtitulo || "";
    elPainelPagina.hidden = !abrir;
    btnPaginaPdf.setAttribute("aria-expanded", abrir ? "true" : "false");
    btnPaginaPdf.classList.toggle("active", abrir);
    document.body.classList.toggle("com-painel-pagina", abrir);
    try { localStorage.setItem("grafo-painel-pagina", abrir ? "1" : "0"); } catch (e) {}
    // A prévia rasteriza o diagrama (trabalho pesado): espera o painel terminar
    // de entrar, senão a animação de abertura trava no meio.
    if (abrir) {
      elPrevia.classList.add("carregando");
      clearTimeout(timerPrevia);
      timerPrevia = setTimeout(atualizarPrevia, 280);
    }
  }

  btnPaginaPdf.addEventListener("click", function () {
    abrirPainelPagina(!painelPaginaAberto());
    // No celular o painel fica abaixo do diagrama: leva a tela até ele.
    if (painelPaginaAberto() && telaCelular.matches) elPainelPagina.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("btnFecharPagina").addEventListener("click", function () { abrirPainelPagina(false); });
  // Abrir um menu do topo (tema, conta, organizar…) fecha o painel, para não ficarem um sobre o outro.
  document.addEventListener("grafo:menu-aberto", function (ev) {
    var menu = ev.detail && ev.detail.menu;
    if (painelPaginaAberto() && menu && !document.getElementById(menu).contains(btnPaginaPdf)) abrirPainelPagina(false);
  });
  btnExportarPdf.addEventListener("click", exportarPdf);

  var timerAreaDesenho = null;
  document.getElementById("formPagina").addEventListener("input", function (event) {
    var alvo = event.target;
    var antes = { w: configPagina.areaLargura, h: configPagina.areaAltura };
    var orientacao = document.querySelector('input[name="paginaOrientacao"]:checked');
    // Campos numéricos: só aplica valor completo; o blur/change normaliza o que ficou fora da faixa.
    configPagina = normalizarConfigPagina({
      formato: campoPagina.formato.value, orientacao: orientacao ? orientacao.value : configPagina.orientacao,
      escala: campoPagina.escala.value, margem: campoPagina.margem.value === "" ? configPagina.margem : campoPagina.margem.value,
      moldura: campoPagina.moldura.checked,
      areaLargura: campoPagina.areaLargura.value === "" ? configPagina.areaLargura : campoPagina.areaLargura.value,
      areaAltura: campoPagina.areaAltura.value === "" ? configPagina.areaAltura : campoPagina.areaAltura.value
    });
    salvarConfigPagina();
    if (antes.w !== configPagina.areaLargura || antes.h !== configPagina.areaAltura) {
      aplicarAreaDeDesenho();
      // Área menor puxa para dentro quem ficou fora; redesenha quando parar de digitar.
      clearTimeout(timerAreaDesenho);
      timerAreaDesenho = setTimeout(function () { if (estado.equipamentos.length) gerar(); }, 500);
    }
    if (alvo !== campoPagina.areaLargura && alvo !== campoPagina.areaAltura) solicitarPrevia();
  });
  document.getElementById("formPagina").addEventListener("change", preencherFormPagina);

  aplicarAreaDeDesenho();
  preencherFormPagina();

  (async function initDownloads() {
    try {
      if (window.claude && window.claude.use) { downloadsCap = await window.claude.use("downloads"); }
    } catch (e) { downloadsCap = null; }
    if (ultimoDot) btnBaixar.disabled = false;
  })();

  aplicarLimitesNosCampos(document);
  projetos = carregarProjetos();
  projetoAtual = localStorage.getItem(window.GrafoAuth.storageKey("grafo-projeto-atual")) || Object.keys(projetos)[0] || "Projeto principal";
  if (!projetos[projetoAtual]) projetoAtual = Object.keys(projetos)[0] || "Projeto principal";
  if (!projetos[projetoAtual]) projetos[projetoAtual] = projetoVazio();
  estado = clonarDados(projetos[projetoAtual]);
  ultimoEstadoHistorico = JSON.stringify(estado);
  atualizarBotoesHistorico();
  renderProjetos();
  renderTudo();
  if (estado.equipamentos.length) gerar(); else limparDiagrama();
  try { if (localStorage.getItem("grafo-painel-pagina") === "1") abrirPainelPagina(true); } catch (e) {}
  if (ajustesAoCarregar.length) {
    mostrarErro("Alguns dados salvos neste navegador estavam inválidos e foram corrigidos ao carregar (" +
      plural(ajustesAoCarregar.length, "ajuste", "ajustes") + "):", ajustesAoCarregar, { aviso: true });
  }
})();
