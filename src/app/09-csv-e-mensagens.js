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
      // O CSV só traz equipamentos e cabos: o tipo de diagrama continua o do projeto.
      if (estado.modo) resultado.dados.modo = estado.modo;
      estado = resultado.dados;
      ajustarNaProximaRenderizacao = true;
      mostrarAvisosDaImportacao('"' + arquivo.name + '"', resultado);
      renderTudo();
      avisar("CSV importado: " + plural(estado.equipamentos.length, "equipamento", "equipamentos") + ", " + plural(estado.conexoes.length, "cabo", "cabos") + ".");
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
  function avisar(msg) {
    if (!elToasts) return;
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = msg;
    elToasts.appendChild(toast);
    while (elToasts.children.length > 3) elToasts.removeChild(elToasts.firstChild);
    setTimeout(function () {
      toast.classList.add("saindo");
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 200);
    }, 2800);
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

