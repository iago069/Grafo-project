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

  renderizarTiposSugeridos();
  carregarTiposDeEquipamento();

