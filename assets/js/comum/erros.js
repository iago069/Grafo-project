/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// Registro de erros: o que quebrar no navegador de quem está logado vai para a
// tabela grafo_erros do Supabase (função grafo_registrar_erro), para quem mantém
// o Grafo saber que algo deu errado. Carregado no <head>, antes dos outros
// scripts; guarda os erros até o login terminar e então envia.
// Não envia dados do projeto: só a mensagem, o arquivo/linha, a pilha, o caminho
// da página (sem ?parâmetros, que podem ter o token de convite) e o navegador.
(function () {
  "use strict";

  var MAXIMO_POR_PAGINA = 10;
  var fila = [];
  var vistos = {};
  var total = 0;
  var tentativas = 0;
  var agendado = null;

  function semParametros(url) {
    return String(url || "").replace(/[?#][^\s)]*/g, "");
  }

  // Só erros do próprio site e das bibliotecas dele (extensões do navegador e
  // scripts de terceiros geram ruído que não dá para corrigir).
  function doSite(arquivo) {
    if (!arquivo) return true;
    return arquivo.indexOf(location.origin) === 0 || arquivo.indexOf("https://cdn.jsdelivr.net/") === 0;
  }

  function registrar(mensagem, origem, pilha) {
    mensagem = String(mensagem || "").trim();
    if (!mensagem || /^Script error\.?$/i.test(mensagem) || /ResizeObserver loop/i.test(mensagem)) return;
    var chave = mensagem + "|" + origem;
    if (vistos[chave] || total >= MAXIMO_POR_PAGINA) return;
    vistos[chave] = true;
    total++;
    fila.push({
      p_mensagem: mensagem.slice(0, 500),
      p_origem: semParametros(origem).slice(0, 300),
      p_pilha: semParametros(pilha).slice(0, 3000),
      p_pagina: location.pathname.slice(0, 200),
      p_navegador: navigator.userAgent.slice(0, 300)
    });
    enviar();
  }

  // Envia quando o login estiver pronto; até lá, tenta de novo a cada poucos segundos.
  function enviar() {
    if (agendado || !fila.length) return;
    var auth = window.GrafoAuth;
    var cliente = auth && auth.client && auth.client();
    if (!cliente || !auth.userId()) {
      if (++tentativas > 40) { fila = []; return; } // nunca logou: desiste
      agendado = setTimeout(function () { agendado = null; enviar(); }, 3000);
      return;
    }
    fila.splice(0).forEach(function (dados) {
      cliente.rpc("grafo_registrar_erro", dados).then(function () {}, function () {});
    });
  }

  window.addEventListener("error", function (event) {
    var alvo = event.target;
    // Arquivo que não carregou (script, folha de estilo, imagem do app).
    if (alvo && alvo !== window && (alvo.src || alvo.href)) {
      var endereco = alvo.src || alvo.href;
      if (alvo.tagName === "IMG" || !doSite(endereco)) return;
      registrar("Falha ao carregar " + semParametros(endereco), alvo.tagName.toLowerCase(), "");
      return;
    }
    if (!doSite(event.filename)) return;
    var erro = event.error;
    registrar(event.message || (erro && erro.message), event.filename ? event.filename + ":" + event.lineno + ":" + event.colno : "", erro && erro.stack);
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var motivo = event.reason;
    var mensagem = motivo && motivo.message ? motivo.message : String(motivo);
    var pilha = motivo && motivo.stack ? String(motivo.stack) : "";
    // Pilha que só passa por arquivos de fora (extensões etc.): ignora.
    var arquivos = pilha.match(/(https?|chrome-extension|moz-extension):\/\/[^\s)]+/g) || [];
    if (arquivos.length && !arquivos.some(doSite)) return;
    registrar("Promessa rejeitada: " + mensagem, "", pilha);
  });

  window.GrafoErros = { registrar: registrar };
})();
