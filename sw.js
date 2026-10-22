/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// Service worker: guarda o site neste aparelho para o Grafo abrir sem internet.
// - Arquivos do próprio site: busca na rede primeiro (atualizações chegam na
//   hora) e usa a cópia guardada só quando a rede falha.
// - Bibliotecas do jsDelivr: as URLs têm versão fixa, então a cópia guardada vale.
// - Fontes do Google: usa a guardada e atualiza em segundo plano.
// Nada do Supabase passa por aqui: login e projetos continuam indo direto ao servidor.
"use strict";

var CACHE = "grafo-offline-v3";
var CDN = "https://cdn.jsdelivr.net/";
var FONTES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
var APIS_GUARDADAS = ["/api/auth-config", "/api/equipamentos"];

// Na instalação: a página inicial e o que ela referencia (scripts, estilos, ícones).
self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    var resposta = await fetch("/", { cache: "no-cache" });
    if (!resposta.ok) throw new Error("index.html indisponível");
    var html = await resposta.clone().text();
    await cache.put("/", resposta);
    var urls = APIS_GUARDADAS.slice();
    html.replace(/\b(?:src|href)="([^"#]+)"/g, function (_, url) {
      var completa = new URL(url, self.location.origin);
      if (completa.origin === self.location.origin || completa.href.indexOf(CDN) === 0) urls.push(completa.href);
      return _;
    });
    await guardar(cache, urls);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var nomes = await caches.keys();
    await Promise.all(nomes.filter(function (n) { return n.indexOf("grafo-offline-") === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    await self.clients.claim();
  })());
});

// Guarda as URLs que ainda não estão no cache; uma que falhe não impede as outras.
async function guardar(cache, urls) {
  await Promise.all(urls.map(async function (url) {
    try {
      if (await cache.match(url)) return;
      var cdn = url.indexOf(CDN) === 0;
      var resposta = await fetch(url, cdn ? { mode: "cors", credentials: "omit" } : { cache: "no-cache" });
      if (resposta.ok) await cache.put(url, resposta);
    } catch (e) {}
  }));
}

// O editor pede para guardar o que ele carrega depois do login (Graphviz, app.js,
// gerador de PDF), para funcionar sem internet mesmo sem ter usado tudo antes.
self.addEventListener("message", function (event) {
  var dados = event.data || {};
  if (dados.tipo !== "guardar" || !Array.isArray(dados.urls)) return;
  var urls = dados.urls.filter(function (url) {
    try {
      var u = new URL(url, self.location.origin);
      return u.origin === self.location.origin || u.href.indexOf(CDN) === 0;
    } catch (e) { return false; }
  }).map(function (url) { return new URL(url, self.location.origin).href; });
  event.waitUntil(caches.open(CACHE).then(function (cache) { return guardar(cache, urls); }));
});

self.addEventListener("fetch", function (event) {
  var pedido = event.request;
  if (pedido.method !== "GET") return;
  var url = new URL(pedido.url);

  if (pedido.url.indexOf(CDN) === 0) { event.respondWith(primeiroCache(pedido)); return; }
  if (FONTES.test(pedido.url)) { event.respondWith(cacheEAtualiza(event, pedido)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0 && APIS_GUARDADAS.indexOf(url.pathname) < 0) return;

  event.respondWith(primeiroRede(pedido, pedido.mode === "navigate"));
});

// Rede primeiro; sem rede (ou demorando demais com cópia guardada), a cópia.
async function primeiroRede(pedido, navegacao) {
  var cache = await caches.open(CACHE);
  var chave = navegacao ? new URL(pedido.url).pathname.replace(/^\/index\.html$/, "/") : pedido;
  var guardada = await cache.match(chave, { ignoreSearch: true });
  try {
    var rede = fetch(pedido).then(function (resposta) {
      if (resposta.ok && resposta.type === "basic") cache.put(chave, resposta.clone());
      return resposta;
    });
    if (!guardada) return await rede;
    // Sem rede: a cópia. Conexão muito lenta: depois de 6 s, também a cópia
    // (a resposta da rede, se chegar, ainda atualiza o cache).
    return await Promise.race([
      rede.catch(function () { return guardada; }),
      new Promise(function (ok) { setTimeout(function () { ok(guardada); }, 6000); })
    ]);
  } catch (e) {
    if (guardada) return guardada;
    if (navegacao) {
      var inicio = await cache.match("/");
      if (inicio) return inicio;
    }
    throw e;
  }
}

async function primeiroCache(pedido) {
  var cache = await caches.open(CACHE);
  var guardada = await cache.match(pedido.url);
  if (guardada) return guardada;
  var resposta = await fetch(pedido);
  if (resposta.ok && resposta.type === "cors") cache.put(pedido.url, resposta.clone());
  return resposta;
}

async function cacheEAtualiza(event, pedido) {
  var cache = await caches.open(CACHE);
  var guardada = await cache.match(pedido);
  var rede = fetch(pedido).then(function (resposta) {
    // A folha de estilos das fontes vem sem CORS (resposta "opaca", status 0).
    if (resposta.ok || resposta.type === "opaque") cache.put(pedido, resposta.clone());
    return resposta;
  });
  if (guardada) { event.waitUntil(rede.catch(function () {})); return guardada; }
  return rede;
}
