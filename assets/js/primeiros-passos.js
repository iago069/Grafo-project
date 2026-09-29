/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Cartão "Primeiros passos": três tarefas (equipamento, cabo, exportar) que se
// marcam sozinhas conforme a pessoa usa o editor. Só aparece para quem ainda
// não tem equipamento em nenhum projeto; concluído ou fechado, não volta.
(function () {
  "use strict";

  var app = window.GrafoApp, auth = window.GrafoAuth;
  var cartao = document.getElementById("primeirosPassos");
  if (!app || !auth || !cartao) return;

  var PASSOS = ["equipamento", "cabo", "exportar"];
  var chave;
  try { chave = auth.storageKey("grafo-primeiros-passos"); } catch (e) { return; }

  function ler() {
    try { return JSON.parse(localStorage.getItem(chave) || "null") || {}; } catch (e) { return {}; }
  }
  function gravar(dados) {
    try { localStorage.setItem(chave, JSON.stringify(dados)); } catch (e) {}
  }
  var progresso = ler();
  if (progresso.encerrado) return;

  // Quem já montou algum diagrama não é iniciante: não mostra.
  var jaUsa = app.nomesProjetos().some(function (nome) {
    var dados = app.dadosProjeto(nome);
    return dados && dados.equipamentos && dados.equipamentos.length;
  });
  if (jaUsa && !progresso.iniciado) { gravar({ encerrado: true }); return; }
  progresso.iniciado = true;
  gravar(progresso);

  function atualizar() {
    var resumo = app.resumoAtual();
    if (resumo.equipamentos > 0) progresso.equipamento = true;
    if (resumo.conexoes > 0) progresso.cabo = true;
    var feitos = PASSOS.filter(function (p) { return progresso[p]; }).length;
    PASSOS.forEach(function (p) {
      var item = cartao.querySelector('[data-passo="' + p + '"]');
      item.classList.toggle("feito", !!progresso[p]);
      item.querySelector("button").hidden = !!progresso[p];
    });
    document.getElementById("ppProgresso").textContent = feitos + " de " + PASSOS.length;
    cartao.querySelector(".pp-rodape").hidden = resumo.equipamentos > 0;
    gravar(progresso);
    if (feitos === PASSOS.length) concluir();
  }

  function encerrar() {
    progresso = { encerrado: true };
    gravar(progresso);
    cartao.hidden = true;
    document.removeEventListener("grafo:alterado", atualizar);
  }

  var concluindo = false;
  function concluir() {
    if (concluindo) return;
    concluindo = true;
    document.getElementById("ppTitulo").textContent = "Pronto! Você já sabe o básico.";
    setTimeout(encerrar, 4000);
  }

  cartao.addEventListener("click", function (event) {
    var botao = event.target.closest("[data-pp-acao]");
    if (!botao) return;
    var acao = botao.getAttribute("data-pp-acao");
    if (acao === "equipamento") app.abrirPainelLateral("navAddEquip");
    else if (acao === "cabo") {
      if (app.resumoAtual().equipamentos < 2) { app.avisar("Adicione pelo menos dois equipamentos para ligar um cabo entre eles."); app.abrirPainelLateral("navAddEquip"); }
      else app.abrirPainelLateral("navAddCable");
    }
    else if (acao === "exportar") app.abrirPdf();
    else if (acao === "exemplo") app.carregarExemplo();
  });
  document.getElementById("ppFechar").addEventListener("click", encerrar);
  document.addEventListener("grafo:alterado", atualizar);
  document.addEventListener("grafo:exportado", function () { progresso.exportar = true; atualizar(); });

  cartao.hidden = false;
  atualizar();
})();
