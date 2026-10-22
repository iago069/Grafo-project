/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// Botões "Instalar app" ([data-instalar], na página inicial e ao lado de "Conta").
// - Chrome, Edge e Android: o navegador avisa que dá para instalar
//   (beforeinstallprompt); o botão abre a janela de instalação dele.
// - iPhone/iPad: o Safari não tem esse aviso; o botão mostra como fazer pelo menu.
// - Já instalado (aberto como aplicativo) ou navegador sem suporte: sem botão.
// Carregado no <head> para não perder o aviso, que pode chegar cedo.
(function () {
  "use strict";

  var pedido = null;

  function instalado() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  }
  function ehIos() {
    var ua = navigator.userAgent || "";
    // iPadOS se apresenta como Mac, mas tem tela de toque.
    return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  // No iPhone, só o Safari instala ("Adicionar à Tela de Início"); Chrome e outros
  // no iOS também têm a opção no menu Compartilhar nas versões recentes.
  function podeMostrar() {
    return !instalado() && (pedido || ehIos());
  }

  function atualizar() {
    var mostrar = !!podeMostrar();
    document.querySelectorAll("[data-instalar]").forEach(function (botao) { botao.hidden = !mostrar; });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    pedido = event;
    atualizar();
  });
  window.addEventListener("appinstalled", function () {
    pedido = null;
    atualizar();
  });

  function abrirInstrucoes() {
    var modal = document.getElementById("instalarModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    var botao = modal.querySelector(".primary");
    if (botao) botao.focus();
  }
  function fecharInstrucoes() {
    var modal = document.getElementById("instalarModal");
    if (modal) modal.classList.add("hidden");
  }

  document.addEventListener("click", async function (event) {
    if (event.target.closest("[data-instalar-fechar]") || event.target.id === "instalarModal") { fecharInstrucoes(); return; }
    if (!event.target.closest("[data-instalar]")) return;
    if (!pedido) { abrirInstrucoes(); return; }
    var atual = pedido;
    pedido = null; // o aviso do navegador só pode ser usado uma vez
    atual.prompt();
    try { await atual.userChoice; } catch (e) {}
    atualizar();
  });
  document.addEventListener("keydown", function (event) {
    var modal = document.getElementById("instalarModal");
    if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) fecharInstrucoes();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atualizar);
  else atualizar();
})();
