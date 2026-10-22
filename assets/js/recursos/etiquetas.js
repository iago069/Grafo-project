/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// Etiquetas para imprimir (botão "Etiquetas com QR code"): PDF em folha A4 de
// etiquetas adesivas. Equipamento: QR code + nome, tipo/modelo, IP e grupo.
// Cabo: duas etiquetas, uma para cada ponta, com a porta daquela ponta primeiro.
// O QR code leva a /?abrir=<id>&projeto=<nome> (ou &equipe=<id da equipe>);
// ao abrir esse endereço logado, o Grafo mostra o equipamento (fim deste arquivo).
(function () {
  "use strict";

  var app = window.GrafoApp;
  if (!app) return;

  // qrcode-generator (MIT), carregado só ao gerar as etiquetas.
  var URL_QR = "https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js";
  var INTEGRITY_QR = "sha384-e9EFD6BGC90bkW9aDV5xbbBfzwN7G8YImHao2lfLVKV/hPB0E0go+H3I64h7oHtA";

  // Folhas A4 (mm): colunas × linhas, tamanho da etiqueta, margens e espaço entre colunas.
  var FOLHAS = {
    "21": { colunas: 3, linhas: 7, largura: 63.5, altura: 38.1, esquerda: 7.2, topo: 15.15, vao: 2.5 },
    "14": { colunas: 2, linhas: 7, largura: 99.1, altura: 38.1, esquerda: 4.65, topo: 15.15, vao: 2.5 },
    "65": { colunas: 5, linhas: 13, largura: 38.1, altura: 21.2, esquerda: 4.65, topo: 10.7, vao: 2.5 }
  };

  var promessaQr = null;
  function carregarQr() {
    if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
    if (!promessaQr) {
      promessaQr = new Promise(function (resolver, rejeitar) {
        var script = document.createElement("script");
        script.src = URL_QR;
        script.integrity = INTEGRITY_QR;
        script.crossOrigin = "anonymous";
        script.onload = function () { typeof window.qrcode === "function" ? resolver(window.qrcode) : rejeitar(new Error("Gerador de QR code indisponível.")); };
        script.onerror = function () { promessaQr = null; rejeitar(new Error("Não foi possível carregar o gerador de QR code. Verifique a conexão.")); };
        document.head.appendChild(script);
      });
    }
    return promessaQr;
  }

  // As fontes padrão do PDF só têm Latin-1: o resto vira "?" (emoji some).
  function latin1(texto) {
    return String(texto == null ? "" : texto)
      .replace(/[←-⇿]/g, "»")
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️‍]/gu, "")
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
      .trim();
  }

  function enderecoDoEquipamento(projeto, id) {
    var equipe = window.GrafoEquipe && window.GrafoEquipe.idDaEquipe ? window.GrafoEquipe.idDaEquipe(projeto) : null;
    return location.origin + "/?abrir=" + encodeURIComponent(id) +
      (equipe ? "&equipe=" + encodeURIComponent(equipe) : "&projeto=" + encodeURIComponent(projeto));
  }

  // Lista de etiquetas a imprimir, na ordem: equipamentos (por nome) e depois cabos.
  function montarEtiquetas(projeto, dados, opcoes) {
    var lista = [];
    var porId = {};
    dados.equipamentos.forEach(function (eq) { porId[eq.id] = eq; });
    if (opcoes.equipamentos) {
      dados.equipamentos.slice().sort(function (a, b) { return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { numeric: true }); })
        .forEach(function (eq) {
          lista.push({
            tipo: "equipamento",
            titulo: eq.nome || eq.id,
            linhas: [[eq.tipo, eq.modelo].filter(Boolean).join(" · "), eq.ip || "", eq.grupo || ""].filter(Boolean),
            qr: enderecoDoEquipamento(projeto, eq.id)
          });
        });
    }
    if (opcoes.cabos) {
      dados.conexoes.forEach(function (c) {
        var de = porId[c.de], para = porId[c.para];
        if (!de || !para) return;
        var detalhe = [c.tipo, c.potencia].filter(Boolean).join(" · ");
        [[de, c.saida, para, c.chegada], [para, c.chegada, de, c.saida]].forEach(function (p) {
          lista.push({
            tipo: "cabo",
            titulo: [p[0].nome || p[0].id, p[1]].filter(Boolean).join("  "),
            linhas: ["» " + [p[2].nome || p[2].id, p[3]].filter(Boolean).join("  "), detalhe].filter(Boolean)
          });
        });
      });
    }
    return lista;
  }

  // QR code em vetor: um retângulo por trecho escuro de cada linha.
  function desenharQr(doc, qrcode, texto, x, y, lado) {
    var qr = qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    var n = qr.getModuleCount();
    var margem = 1; // módulos de borda branca (a etiqueta já tem margem)
    var m = lado / (n + margem * 2);
    doc.setFillColor(0, 0, 0);
    for (var linha = 0; linha < n; linha++) {
      for (var col = 0; col < n; col++) {
        if (!qr.isDark(linha, col)) continue;
        var inicio = col;
        while (col + 1 < n && qr.isDark(linha, col + 1)) col++;
        doc.rect(x + (margem + inicio) * m, y + (margem + linha) * m, (col - inicio + 1) * m, m + 0.01, "F");
      }
    }
  }

  // Texto que cabe na largura: quebra em linhas e corta com "..." o que sobrar.
  function caber(doc, texto, largura, maxLinhas) {
    var partes = doc.splitTextToSize(latin1(texto), largura);
    if (partes.length > maxLinhas) {
      partes = partes.slice(0, maxLinhas);
      var ultima = partes[maxLinhas - 1];
      while (ultima.length > 1 && doc.getTextWidth(ultima + "...") > largura) ultima = ultima.slice(0, -1);
      partes[maxLinhas - 1] = ultima + "...";
    }
    return partes;
  }

  function desenharEtiqueta(doc, qrcode, etiqueta, x, y, folha) {
    var pequena = folha.altura < 30;
    var pad = pequena ? 1.5 : 2.5;
    var textoX = x + pad;
    var largura = folha.largura - pad * 2;
    if (etiqueta.qr) {
      var lado = folha.altura - pad * 2;
      desenharQr(doc, qrcode, etiqueta.qr, x + pad - 0.5, y + pad, lado);
      textoX = x + pad + lado + (pequena ? 0.8 : 1.5);
      largura = x + folha.largura - pad - textoX;
    }
    var tamTitulo = pequena ? 7 : 10, tamTexto = pequena ? 5.5 : 7.5;
    var ptParaMm = 0.3528;
    var cursor = y + pad + tamTitulo * ptParaMm;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(tamTitulo);
    caber(doc, etiqueta.titulo, largura, 2).forEach(function (t) { doc.text(t, textoX, cursor); cursor += tamTitulo * ptParaMm * 1.15; });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tamTexto);
    cursor += pequena ? 0.3 : 1;
    var limite = y + folha.altura - pad;
    etiqueta.linhas.forEach(function (linha) {
      caber(doc, linha, largura, 2).forEach(function (t) {
        if (cursor > limite) return;
        doc.text(t, textoX, cursor);
        cursor += tamTexto * ptParaMm * 1.2;
      });
    });
  }

  async function gerarPdf(projeto, dados, opcoes) {
    var etiquetas = montarEtiquetas(projeto, dados, opcoes);
    if (!etiquetas.length) throw new Error("Nada para imprimir com as opções escolhidas.");
    var resultado = await Promise.all([app.carregarJsPdf(), etiquetas.some(function (e) { return e.qr; }) ? carregarQr() : null]);
    var JsPdf = resultado[0], qrcode = resultado[1];
    var folha = FOLHAS[opcoes.tamanho] || FOLHAS["21"];
    var porFolha = folha.colunas * folha.linhas;
    var doc = new JsPdf({ unit: "mm", format: "a4", orientation: "portrait" });
    doc.setProperties({ title: latin1("Etiquetas - " + projeto), creator: "Grafo" });
    etiquetas.forEach(function (etiqueta, i) {
      if (i && i % porFolha === 0) doc.addPage();
      var pos = i % porFolha;
      var x = folha.esquerda + (pos % folha.colunas) * (folha.largura + folha.vao);
      var y = folha.topo + Math.floor(pos / folha.colunas) * folha.altura;
      desenharEtiqueta(doc, qrcode, etiqueta, x, y, folha);
    });
    var nome = String(projeto).replace(/[^\wÀ-ſ-]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
    doc.save("grafo-" + nome + "-etiquetas.pdf");
    return etiquetas.length;
  }

  // ---- Janela ------------------------------------------------------------------
  var modal = document.getElementById("etiquetasModal");
  var botao = document.getElementById("btnEtiquetas");
  if (modal && botao) {
    var mensagem = document.getElementById("etiquetasMensagem");
    var gerar = document.getElementById("etiquetasGerar");
    var focoAnterior = null;
    var avisar = function (texto, erro) { mensagem.textContent = texto || ""; mensagem.classList.toggle("erro", !!erro); };
    var abrir = function () {
      var dados = app.dadosProjeto(app.projetoAtual()) || { equipamentos: [], conexoes: [] };
      document.getElementById("etiquetasQtdEquip").textContent = "(" + dados.equipamentos.length + ")";
      document.getElementById("etiquetasQtdCabos").textContent = "(" + dados.conexoes.length * 2 + ")";
      avisar("");
      focoAnterior = document.activeElement;
      modal.classList.remove("hidden");
      gerar.focus();
    };
    var fechar = function () {
      modal.classList.add("hidden");
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    };
    botao.addEventListener("click", abrir);
    modal.querySelectorAll("[data-etiquetas-fechar]").forEach(function (b) { b.addEventListener("click", fechar); });
    modal.addEventListener("click", function (event) { if (event.target === modal) fechar(); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !modal.classList.contains("hidden")) fechar(); });
    document.getElementById("etiquetasForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      gerar.disabled = true;
      avisar("Gerando...");
      try {
        var projeto = app.projetoAtual();
        var total = await gerarPdf(projeto, app.dadosProjeto(projeto), {
          equipamentos: document.getElementById("etiquetasEquip").checked,
          cabos: document.getElementById("etiquetasCabos").checked,
          tamanho: document.getElementById("etiquetasTamanho").value
        });
        fechar();
        app.avisar(total + (total === 1 ? " etiqueta gerada." : " etiquetas geradas.") + " Na impressão, use tamanho real (100%), sem ajustar à página.");
      } catch (erro) {
        avisar(erro.message || "Não foi possível gerar as etiquetas.", true);
      } finally {
        gerar.disabled = false;
      }
    });
  }

  // Guarda o gerador de QR code no aparelho, para gerar etiquetas sem internet (sw.js).
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ tipo: "guardar", urls: [URL_QR] });
  }

  // ---- Endereço do QR code: /?abrir=<id>&projeto=<nome> ou &equipe=<id> ---------
  (function abrirDoEndereco() {
    var params = new URLSearchParams(location.search);
    var id = params.get("abrir");
    if (!id) return;
    var equipe = params.get("equipe");
    var projeto = params.get("projeto");
    if (equipe && window.GrafoEquipe) {
      projeto = app.nomesProjetos().find(function (nome) { return window.GrafoEquipe.idDaEquipe(nome) === equipe; }) || null;
    }
    ["abrir", "equipe", "projeto"].forEach(function (p) { params.delete(p); });
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    if (!projeto || !app.mostrarEquipamento(projeto, id)) {
      app.avisar("Equipamento da etiqueta não encontrado nesta conta. Ele pode ter sido apagado, ou o projeto é de outra conta.");
    }
  })();

  window.GrafoEtiquetas = { montarEtiquetas: montarEtiquetas, latin1: latin1 };
})();
