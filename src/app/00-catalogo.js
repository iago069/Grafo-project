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

