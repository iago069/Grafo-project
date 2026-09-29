/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Carregado no <head>, antes de a página aparecer: quem já tem sessão salva vai
// direto para o editor, sem ver a página inicial piscar (auth.js tira a classe
// se a sessão não valer). Fica em arquivo, e não no HTML, por causa do CSP.
(function () {
  try {
    if (!/[?&#](recuperar=1|conta-excluida=1|error)|type=recovery/.test(location.search + location.hash) &&
        Object.keys(localStorage).some(function (k) { return /^sb-.+-auth-token$/.test(k); })) {
      document.documentElement.classList.add("com-sessao");
    }
  } catch (e) {}
})();
