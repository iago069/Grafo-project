/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Carregado no <head>, antes de a página aparecer: quem já tem sessão salva vai
// direto para o editor, sem ver a página inicial piscar (auth.js tira a classe
// se a sessão não valer). Fica em arquivo, e não no HTML, por causa do CSP.
(function () {
  try {
    if (!/[?&#](recuperar=1|conta-excluida=1|error)|type=recovery/.test(location.search + location.hash) &&
        Object.keys(localStorage).some(function (k) { return /^sb-.+-auth-token$/.test(k); })) {
      document.documentElement.classList.add("com-sessao");
      // O editor vai abrir: começa já a baixar o que ele usa (auth.js carrega em ordem).
      [["https://cdn.jsdelivr.net/npm/@viz-js/viz@3.31.0/dist/viz-global.js", "sha384-iX6VK6ib27dxYB4T470zbHOsDDoLewuYvrIgv2B3XXe8kgfKsGMf8QIleFy6VPi4"],
       ["./assets/vendor/zod-3.25.76.min.js"], ["./assets/js/esquema.js"], ["./assets/js/app.js"]].forEach(function (arquivo) {
        var link = document.createElement("link");
        link.rel = "preload";
        link.as = "script";
        link.href = arquivo[0];
        if (arquivo[1]) { link.integrity = arquivo[1]; link.crossOrigin = "anonymous"; }
        document.head.appendChild(link);
      });
    }
  } catch (e) {}
})();
