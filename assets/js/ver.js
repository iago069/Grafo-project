/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Licença AGPL-3.0 (veja LICENSE). */
// Página do link compartilhado (ver.html): busca a cópia do desenho e mostra
// com zoom e arraste. Fica em arquivo, e não no HTML, por causa do CSP.
(function () {
  "use strict";
  var area = document.getElementById("area");
  var quadro = document.getElementById("quadro");
  var imagem = document.getElementById("imagem");
  var estado = document.getElementById("estado");
  var vista = { escala: 1, x: 0, y: 0 };
  var tamanho = { w: 0, h: 0 };
  var svgTexto = "", nomeProjeto = "";

  function mostrarEstado(texto, erro) {
    estado.textContent = texto;
    estado.classList.toggle("erro", !!erro);
    estado.hidden = !texto;
  }

  function aplicar() {
    quadro.style.transform = "translate(" + vista.x + "px," + vista.y + "px) scale(" + vista.escala + ")";
  }
  function ajustar() {
    var folga = 24;
    var w = area.clientWidth, h = area.clientHeight;
    if (!tamanho.w || !w || !h) return;
    vista.escala = Math.min(4, (w - folga * 2) / tamanho.w, (h - folga * 2) / tamanho.h);
    vista.x = (w - tamanho.w * vista.escala) / 2;
    vista.y = (h - tamanho.h * vista.escala) / 2;
    aplicar();
  }
  // Zoom mantendo fixo o ponto (px, py) da tela.
  function zoom(fator, px, py) {
    var nova = Math.min(8, Math.max(0.05, vista.escala * fator));
    if (px == null) { px = area.clientWidth / 2; py = area.clientHeight / 2; }
    vista.x = px - (px - vista.x) * (nova / vista.escala);
    vista.y = py - (py - vista.y) * (nova / vista.escala);
    vista.escala = nova;
    aplicar();
  }

  document.getElementById("mais").addEventListener("click", function () { zoom(1.25); });
  document.getElementById("menos").addEventListener("click", function () { zoom(0.8); });
  document.getElementById("ajustar").addEventListener("click", ajustar);
  document.getElementById("baixar").addEventListener("click", function () {
    var url = URL.createObjectURL(new Blob([svgTexto], { type: "image/svg+xml;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = (nomeProjeto.replace(/[^\wÀ-ſ-]+/g, "-").replace(/^-+|-+$/g, "") || "diagrama") + ".svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  });
  area.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = area.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Arrastar com um dedo/mouse; pinça com dois dedos.
  var ponteiros = {}, pinca = null;
  area.addEventListener("pointerdown", function (e) {
    area.setPointerCapture(e.pointerId);
    ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
    area.classList.add("arrastando");
  });
  area.addEventListener("pointermove", function (e) {
    var antes = ponteiros[e.pointerId];
    if (!antes) return;
    var ids = Object.keys(ponteiros);
    if (ids.length === 2) {
      var outro = ponteiros[ids[0] == e.pointerId ? ids[1] : ids[0]];
      var dist = Math.hypot(e.clientX - outro.x, e.clientY - outro.y);
      if (pinca) {
        var r = area.getBoundingClientRect();
        zoom(dist / pinca, (e.clientX + outro.x) / 2 - r.left, (e.clientY + outro.y) / 2 - r.top);
      }
      pinca = dist;
    } else {
      vista.x += e.clientX - antes.x;
      vista.y += e.clientY - antes.y;
      aplicar();
    }
    ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
  });
  function soltar(e) {
    delete ponteiros[e.pointerId];
    pinca = null;
    if (!Object.keys(ponteiros).length) area.classList.remove("arrastando");
  }
  area.addEventListener("pointerup", soltar);
  area.addEventListener("pointercancel", soltar);
  window.addEventListener("resize", ajustar);

  function tamanhoDoSvg(texto) {
    var doc = new DOMParser().parseFromString(texto, "image/svg+xml");
    var svg = doc.documentElement;
    var vb = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    var w = parseFloat(svg.getAttribute("width")), h = parseFloat(svg.getAttribute("height"));
    if (/pt$/i.test(svg.getAttribute("width") || "")) { w *= 4 / 3; h *= 4 / 3; }
    if (!(w > 0 && h > 0) && vb.length === 4) { w = vb[2]; h = vb[3]; }
    return { w: w || 800, h: h || 600 };
  }

  (async function carregar() {
    var token = new URLSearchParams(location.search).get("t") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      mostrarEstado("Link inválido. Confira se o endereço foi copiado inteiro.", true);
      return;
    }
    try {
      var config = await (await fetch("/api/auth-config", { cache: "no-store" })).json();
      if (!config.url || !config.key) throw new Error("configuração");
      var resposta = await fetch(config.url.replace(/\/+$/, "") + "/rest/v1/rpc/ver_compartilhamento", {
        method: "POST",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token: token })
      });
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);
      var linhas = await resposta.json();
      if (!linhas.length) {
        mostrarEstado("Este link foi desativado ou não existe. Peça um link novo a quem enviou.", true);
        return;
      }
      svgTexto = linhas[0].svg;
      nomeProjeto = linhas[0].projeto;
      document.title = nomeProjeto + " · Grafo";
      document.getElementById("titulo").textContent = nomeProjeto;
      document.getElementById("subtitulo").textContent = "Somente visualização · atualizado em " +
        new Date(linhas[0].atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      imagem.alt = "Diagrama de rede: " + nomeProjeto;
      tamanho = tamanhoDoSvg(svgTexto);
      imagem.width = tamanho.w;
      imagem.height = tamanho.h;
      // <img> não executa scripts do SVG: o desenho só é exibido.
      imagem.src = URL.createObjectURL(new Blob([svgTexto], { type: "image/svg+xml;charset=utf-8" }));
      await imagem.decode().catch(function () {});
      document.getElementById("acoes").hidden = false;
      mostrarEstado("");
      ajustar();
    } catch (erro) {
      mostrarEstado("Não foi possível carregar o diagrama. Verifique a conexão e recarregue a página.", true);
    }
  })();
})();
