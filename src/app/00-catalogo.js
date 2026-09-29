/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
(function () {
  "use strict";

  // Regras de validação/normalização (assets/js/esquema.js): as mesmas para
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

  var ASSET_BASE = "./assets/images/";
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

  var TIPOS_BASE = [
    { nome: "OLT", icone: caminhoImagem("OLT.jpeg") },
    { nome: "Switch", icone: caminhoImagem("SWITCH.jpeg") },
    { nome: "VOLT", icone: caminhoImagem("VOLT.jpeg") },
    { nome: "MikroTik", icone: caminhoImagem("MIKROTIK.png") },
    { nome: "UPS", icone: caminhoImagem("NOBREAK.jpeg") },
    { nome: "AR", icone: caminhoImagem("AR.jpeg") },
    { nome: "RPS", icone: caminhoImagem("RETIFICADOR.jpeg") },
    { nome: "Camera IP", icone: caminhoImagem("CAMERA.jpeg") },
    { nome: "ONU", icone: caminhoImagem("ONU.svg") },
    { nome: "Servidor", icone: caminhoImagem("SERVIDOR.svg") }
  ];
  var CATALOGO_ICONES = [
    { valor: caminhoImagem("MIKROTIK.png"), nome: "MikroTik / RB", arquivo: caminhoImagem("MIKROTIK.png") },
    { valor: caminhoImagem("OLT.jpeg"), nome: "OLT", arquivo: caminhoImagem("OLT.jpeg") },
    { valor: caminhoImagem("SWITCH.jpeg"), nome: "Switch", arquivo: caminhoImagem("SWITCH.jpeg") },
    { valor: caminhoImagem("RETIFICADOR.jpeg"), nome: "Retificador / RPS", arquivo: caminhoImagem("RETIFICADOR.jpeg") },
    { valor: caminhoImagem("NOBREAK.jpeg"), nome: "Nobreak", arquivo: caminhoImagem("NOBREAK.jpeg") },
    { valor: caminhoImagem("AR.jpeg"), nome: "AR", arquivo: caminhoImagem("AR.jpeg") },
    { valor: caminhoImagem("VOLT.jpeg"), nome: "Volt", arquivo: caminhoImagem("VOLT.jpeg") },
    { valor: caminhoImagem("CAMERA.jpeg"), nome: "Câmera", arquivo: caminhoImagem("CAMERA.jpeg") },
    { valor: caminhoImagem("ONU.svg"), nome: "ONU / ONT", arquivo: caminhoImagem("ONU.svg") },
    { valor: caminhoImagem("SERVIDOR.svg"), nome: "Servidor", arquivo: caminhoImagem("SERVIDOR.svg") }
  ];
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

  function imagemDoIcone(valor) {
    if (!valor) return "";
    var valorNormalizado = normalizarNomeArquivoImagem(valor);
    var item = CATALOGO_ICONES.find(function (icone) {
      var alvo = normalizarNomeArquivoImagem(icone.valor || icone.arquivo || icone.nome || "");
      return alvo === valorNormalizado || normalizarNomeArquivoImagem(icone.arquivo || "") === valorNormalizado;
    });
    if (item) return item.arquivo || "";

    var valorEmTexto = String(valor || "").toLowerCase();
    if (valorEmTexto.indexOf("mikrotik") >= 0 || valorEmTexto.indexOf("rb/") >= 0 || valorEmTexto.indexOf("roteador") >= 0) return caminhoImagem("MIKROTIK.png");
    if (valorEmTexto.indexOf("switch") >= 0) return caminhoImagem("SWITCH.jpeg");
    if (valorEmTexto.indexOf("olt") >= 0) return caminhoImagem("OLT.jpeg");
    if (/(^|[^a-z])ar([^a-z]|$)/.test(valorEmTexto) || valorEmTexto.indexOf("hvac") >= 0 || valorEmTexto.indexOf("climatiz") >= 0) return caminhoImagem("AR.jpeg");
    if (/c[aâ]mera/.test(valorEmTexto)) return caminhoImagem("CAMERA.jpeg");
    if (/(^|[^a-z])on[ut]([^a-z]|$)/.test(valorEmTexto)) return caminhoImagem("ONU.svg");
    if (valorEmTexto.indexOf("servidor") >= 0 || valorEmTexto.indexOf("server") >= 0) return caminhoImagem("SERVIDOR.svg");
    if (valorEmTexto.indexOf("retificador") >= 0 || valorEmTexto.indexOf("rps") >= 0) return caminhoImagem("RETIFICADOR.jpeg");
    if (valorEmTexto.indexOf("nobreak") >= 0 || valorEmTexto.indexOf("nobreack") >= 0) return caminhoImagem("NOBREAK.jpeg");
    if (valorEmTexto.indexOf("volt") >= 0) return caminhoImagem("VOLT.jpeg");
    return "";
  }

  function renderizarTiposSugeridos() {
    var datalist = document.getElementById("tipos-sugeridos");
    if (!datalist) return;
    var itens = [];
    catalogoTiposEquipamentos.forEach(function (tipo) {
      var nome = extrairNomeTipo(tipo);
      if (!nome) return;
      var chave = normalizarTextoEquipamento(nome);
      if (!itens.some(function (entry) { return normalizarTextoEquipamento(entry.nome) === chave; })) {
        itens.push({ nome: nome, icone: extrairIconeTipo(tipo) });
      }
    });
    datalist.innerHTML = itens.map(function (tipo) {
      return '<option value="' + escaparHtml(tipo.nome) + '"></option>';
    }).join("");
  }

  function buscarTipoNoCatalogo(tipo) {
    var chave = normalizarTextoEquipamento(tipo);
    if (!chave) return null;
    return catalogoTiposEquipamentos.find(function (item) {
      var nome = normalizarTextoEquipamento(extrairNomeTipo(item));
      return nome === chave || nome.indexOf(chave) >= 0 || chave.indexOf(nome) >= 0;
    }) || null;
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
      // A API manda só o nome do arquivo ("OLT.jpeg"); emojis passam direto.
      if (/^[\w.-]+\.(png|jpe?g|gif|svg|webp)$/i.test(icone)) icone = caminhoImagem(icone);
      merge.push({ nome: nome, icone: icone });
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
    if (chave.indexOf("olt") >= 0) return ASSET_BASE + "OLT.jpeg";
    if (chave.indexOf("switch") >= 0) return ASSET_BASE + "SWITCH.jpeg";
    if (chave.indexOf("roteador") >= 0 || chave.indexOf("mikrotik") >= 0 || chave.indexOf("rb/") >= 0) return ASSET_BASE + "MIKROTIK.png";
    if (chave.indexOf("retificador") >= 0 || chave.indexOf("rps") >= 0) return ASSET_BASE + "RETIFICADOR.jpeg";
    if (chave.indexOf("nobreak") >= 0 || chave.indexOf("nobreack") >= 0) return ASSET_BASE + "NOBREAK.jpeg";
    if (chave.indexOf("conversor") >= 0 || chave.indexOf("modulo") >= 0 || chave.indexOf("volt") >= 0) return ASSET_BASE + "VOLT.jpeg";
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

  function renderizarModelosSugeridos() {
    var datalist = document.getElementById("modelos-sugeridos");
    if (!datalist) return;
    datalist.innerHTML = catalogoModelos.map(function (m) {
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

  renderizarTiposSugeridos();
  carregarTiposDeEquipamento();

