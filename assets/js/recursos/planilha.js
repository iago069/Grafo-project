/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Relatório de inventário em planilha (.xlsx), montado no navegador sem
// biblioteca externa (o CSP do site só libera scripts próprios e de CDN fixa).
// Um .xlsx é um ZIP de arquivos XML; aqui o ZIP é gravado "sem compressão"
// (método 0), que o Excel, o LibreOffice e o Google Planilhas abrem normalmente.
//   GrafoPlanilha.montarInventario(projeto, dados, opcoes) -> [{ nome, colunas, linhas }]
//   GrafoPlanilha.gerarXlsx(abas) -> Uint8Array
(function (global) {
  "use strict";

  // ---- ZIP (sem compressão) -----------------------------------------------------
  var TABELA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(texto) { return new TextEncoder().encode(texto); }

  function zip(arquivos) {
    var partes = [], central = [], deslocamento = 0;
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    arquivos.forEach(function (arq) {
      var nome = utf8(arq.nome), dados = utf8(arq.conteudo), crc = crc32(dados);
      // Versão 20, bit 11 (nomes em UTF-8), método 0, data fixa (1/1/2026).
      var comum = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x5C21), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0));
      var local = new Uint8Array([].concat(u32(0x04034B50), comum));
      partes.push(local, nome, dados);
      central.push(new Uint8Array([].concat(u32(0x02014B50), u16(20), comum, u16(0), u16(0), u16(0), u32(0), u32(deslocamento))), nome);
      deslocamento += local.length + nome.length + dados.length;
    });
    var tamanhoCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
    var fim = new Uint8Array([].concat(u32(0x06054B50), u16(0), u16(0), u16(arquivos.length), u16(arquivos.length), u32(tamanhoCentral), u32(deslocamento), u16(0)));
    var todas = partes.concat(central, [fim]);
    var saida = new Uint8Array(todas.reduce(function (s, p) { return s + p.length; }, 0));
    var pos = 0;
    todas.forEach(function (p) { saida.set(p, pos); pos += p.length; });
    return saida;
  }

  // ---- XLSX -----------------------------------------------------------------------
  function xml(texto) {
    return String(texto == null ? "" : texto)
      // Caracteres de controle quebram o XML (e o Excel recusa o arquivo).
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function letraColuna(i) {
    var s = "";
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }

  // Célula: número vira número (soma e ordena no Excel); o resto, texto.
  // Texto vai como inlineStr, que o Excel nunca interpreta como fórmula
  // (um nome começando com "=" não vira cálculo).
  function celula(ref, valor, estilo) {
    var s = estilo ? ' s="' + estilo + '"' : "";
    if (typeof valor === "number" && isFinite(valor)) return '<c r="' + ref + '"' + s + '><v>' + valor + "</v></c>";
    if (valor == null || valor === "") return estilo ? '<c r="' + ref + '"' + s + "/>" : "";
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xml(valor) + "</t></is></c>";
  }

  function larguraColuna(aba, i) {
    var maior = String(aba.colunas[i] || "").length;
    aba.linhas.forEach(function (linha) { maior = Math.max(maior, String(linha[i] == null ? "" : linha[i]).length); });
    return Math.min(60, Math.max(8, maior + 2));
  }

  function planilhaXml(aba) {
    var ultima = letraColuna(Math.max(0, aba.colunas.length - 1));
    var linhas = ['<row r="1">' + aba.colunas.map(function (c, i) { return celula(letraColuna(i) + "1", c, 1); }).join("") + "</row>"];
    aba.linhas.forEach(function (linha, l) {
      var r = l + 2;
      linhas.push('<row r="' + r + '">' + linha.map(function (v, i) { return celula(letraColuna(i) + r, v, 0); }).join("") + "</row>");
    });
    var cols = aba.colunas.map(function (_, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + larguraColuna(aba, i) + '" customWidth="1"/>'; }).join("");
    var filtro = aba.linhas.length ? '<autoFilter ref="A1:' + ultima + (aba.linhas.length + 1) + '"/>' : "";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      // Linha 1 (títulos) congelada: continua visível ao rolar.
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      "<cols>" + cols + "</cols><sheetData>" + linhas.join("") + "</sheetData>" + filtro + "</worksheet>";
  }

  function nomeDeAba(nome, usados) {
    var base = String(nome || "Planilha").replace(/[\\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Planilha";
    var final = base;
    for (var n = 2; usados[final.toLowerCase()]; n++) final = base.slice(0, 27) + " (" + n + ")";
    usados[final.toLowerCase()] = true;
    return final;
  }

  function gerarXlsx(abas) {
    var usados = {};
    abas = abas.map(function (a) { return { nome: nomeDeAba(a.nome, usados), colunas: a.colunas || [], linhas: a.linhas || [] }; });
    var arquivos = [
      { nome: "[Content_Types].xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        abas.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
        "</Types>" },
      { nome: "_rels/.rels", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>" },
      { nome: "xl/workbook.xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        abas.map(function (a, i) { return '<sheet name="' + xml(a.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") +
        "</sheets>" +
        // Filtro automático de cada aba precisa deste nome definido para o Excel.
        (function () {
          var nomes = abas.map(function (a, i) {
            if (!a.linhas.length) return "";
            return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xml(a.nome).replace(/'/g, "''") + "'!$A$1:$" +
              letraColuna(Math.max(0, a.colunas.length - 1)) + "$" + (a.linhas.length + 1) + "</definedName>";
          }).join("");
          return nomes ? "<definedNames>" + nomes + "</definedNames>" : "";
        })() +
        "</workbook>" },
      { nome: "xl/_rels/workbook.xml.rels", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        abas.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
        '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>" },
      // Estilo 0: normal. Estilo 1: título (negrito, fundo azul-claro, borda embaixo).
      { nome: "xl/styles.xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF14212B"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEAF3"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left/><right/><top/><bottom style="thin"><color rgb="FF8AA4B6"/></bottom><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>" }
    ];
    abas.forEach(function (aba, i) { arquivos.push({ nome: "xl/worksheets/sheet" + (i + 1) + ".xml", conteudo: planilhaXml(aba) }); });
    return zip(arquivos);
  }

  // ---- Inventário ---------------------------------------------------------------
  var ROTULO_STATUS = { ativo: "Ativo", manutencao: "Manutenção", offline: "Offline" };

  // dados: { equipamentos, conexoes }. opcoes.buscarModelo(texto) -> modelo do
  // catálogo ({ nome, fabricante, portas }) ou null; opcoes.data: texto da data.
  function montarInventario(projeto, dados, opcoes) {
    opcoes = opcoes || {};
    var buscarModelo = opcoes.buscarModelo || function () { return null; };
    var equipamentos = (dados && dados.equipamentos) || [];
    var conexoes = (dados && dados.conexoes) || [];
    var porId = {};
    equipamentos.forEach(function (eq) { porId[eq.id] = eq; });
    function nome(id) { return porId[id] ? porId[id].nome || id : id; }

    // Portas usadas por equipamento: porta (minúscula) -> { porta, outro, portaOutro, cabo }
    var usadas = {};
    equipamentos.forEach(function (eq) { usadas[eq.id] = {}; });
    function descreverCabo(c) { return [c.tipo, c.potencia].filter(Boolean).join(" · "); }
    conexoes.forEach(function (c) {
      if (usadas[c.de] && c.saida) usadas[c.de][String(c.saida).toLowerCase()] = { porta: c.saida, outro: nome(c.para), portaOutro: c.chegada || "", cabo: descreverCabo(c) };
      if (usadas[c.para] && c.chegada) usadas[c.para][String(c.chegada).toLowerCase()] = { porta: c.chegada, outro: nome(c.de), portaOutro: c.saida || "", cabo: descreverCabo(c) };
    });
    var cabosPorEq = {};
    conexoes.forEach(function (c) { cabosPorEq[c.de] = (cabosPorEq[c.de] || 0) + 1; cabosPorEq[c.para] = (cabosPorEq[c.para] || 0) + 1; });

    var linhasEq = [], linhasPortas = [];
    equipamentos.forEach(function (eq) {
      var modelo = buscarModelo(eq.modelo);
      var mapa = usadas[eq.id] || {};
      var emUso = Object.keys(mapa).length;
      var total = modelo ? modelo.portas.length : null;
      var emUsoNoModelo = modelo ? modelo.portas.filter(function (p) { return mapa[p.toLowerCase()]; }).length : null;
      linhasEq.push([eq.nome || eq.id, eq.tipo || "", eq.modelo || "", modelo ? modelo.fabricante || "" : "", eq.ip || "", eq.rede || "", eq.grupo || "",
        ROTULO_STATUS[eq.status] || ROTULO_STATUS.ativo, cabosPorEq[eq.id] || 0,
        total == null ? "" : total, total == null ? "" : total - emUsoNoModelo]);
      var vistas = {};
      if (modelo) {
        modelo.portas.forEach(function (p) {
          var u = mapa[p.toLowerCase()];
          vistas[p.toLowerCase()] = true;
          linhasPortas.push([eq.nome || eq.id, p, u ? "Em uso" : "Livre", u ? u.outro : "", u ? u.portaOutro : "", u ? u.cabo : ""]);
        });
      }
      // Portas usadas que não são do modelo (ou equipamento sem modelo do catálogo).
      Object.keys(mapa).forEach(function (k) {
        if (vistas[k]) return;
        var u = mapa[k];
        linhasPortas.push([eq.nome || eq.id, u.porta, modelo ? "Em uso (fora do modelo)" : "Em uso", u.outro, u.portaOutro, u.cabo]);
      });
    });

    var linhasCabos = conexoes.map(function (c) {
      return [nome(c.de), c.saida || "", nome(c.para), c.chegada || "", c.tipo || "", c.potencia || "",
        { solid: "Contínuo", dashed: "Tracejado", dotted: "Pontilhado" }[c.estilo] || "Contínuo"];
    });

    function contar(campo, rotulos) {
      var n = {};
      equipamentos.forEach(function (eq) { var v = (rotulos ? rotulos[eq[campo]] : eq[campo]) || (campo === "status" ? "Ativo" : "(sem " + campo + ")"); n[v] = (n[v] || 0) + 1; });
      return Object.keys(n).sort().map(function (k) { return [k, n[k]]; });
    }
    var resumo = [["Projeto", projeto || ""], ["Gerado em", opcoes.data || ""], ["Equipamentos", equipamentos.length], ["Cabos", conexoes.length],
      ["Portas em uso", linhasPortas.filter(function (l) { return /^Em uso/.test(l[2]); }).length],
      ["Portas livres (equipamentos com modelo do catálogo)", linhasPortas.filter(function (l) { return l[2] === "Livre"; }).length], ["", ""], ["Por tipo", ""]]
      .concat(contar("tipo"), [["", ""], ["Por grupo", ""]], contar("grupo"), [["", ""], ["Por status", ""]], contar("status", ROTULO_STATUS));

    return [
      { nome: "Resumo", colunas: ["Item", "Valor"], linhas: resumo },
      { nome: "Equipamentos", colunas: ["Nome", "Tipo", "Modelo", "Fabricante", "IP", "VLAN / rede", "Grupo", "Status", "Cabos", "Portas do modelo", "Portas livres"], linhas: linhasEq },
      { nome: "Cabos", colunas: ["Origem", "Porta de origem", "Destino", "Porta de destino", "Tipo de enlace", "Capacidade", "Estilo"], linhas: linhasCabos },
      { nome: "Portas", colunas: ["Equipamento", "Porta", "Situação", "Ligada a", "Porta do outro lado", "Cabo"], linhas: linhasPortas }
    ];
  }

  global.GrafoPlanilha = { gerarXlsx: gerarXlsx, montarInventario: montarInventario, crc32: crc32 };
})(typeof window !== "undefined" ? window : this);
