/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Links só para visualizar. Cada link (tabela grafo_compartilhamentos) guarda
// uma cópia do desenho em SVG; quem abre /ver?t=<token> vê só essa cópia
// (ver.html), sem login. Enquanto o link existe, este módulo reenvia o desenho
// alguns segundos depois de cada alteração no projeto.
(function () {
  "use strict";

  var auth = window.GrafoAuth, app = window.GrafoApp;
  if (!auth || !app) return;

  var TABELA = "grafo_compartilhamentos";
  var ESPERA_ATUALIZACAO = 3000;
  var botao = document.getElementById("btnCompartilhar");
  var modal = document.getElementById("compartilharModal");
  var mensagem = document.getElementById("compartilharMensagem");
  var campoUrl = document.getElementById("compartilharUrl");
  var botaoCriar = document.getElementById("compartilharCriar");
  var botaoDesativar = document.getElementById("compartilharDesativar");
  var focoAnterior = null;

  // projeto -> { token, enviado (último SVG gravado) }
  var links = {};
  var disponivel = false;
  var timer = null;
  var sincronizando = null;

  function db() { return auth.client().from(TABELA); }
  function urlDoLink(token) { return location.origin + "/ver?t=" + encodeURIComponent(token); }

  function avisarNaJanela(texto, erro) {
    mensagem.textContent = texto || "";
    mensagem.classList.toggle("erro", !!erro);
  }

  function erroTabelaAusente(erro) {
    return !!erro && (erro.code === "42P01" || erro.code === "PGRST205" || /grafo_compartilhamentos/i.test(erro.message || ""));
  }

  function mostrarEstado() {
    var projeto = app.projetoAtual();
    var link = links[projeto];
    document.getElementById("compartilharProjeto").textContent = "“" + projeto + "”";
    document.getElementById("compartilharSemLink").hidden = !!link;
    document.getElementById("compartilharComLink").hidden = !link;
    if (link) campoUrl.value = urlDoLink(link.token);
  }

  function abrir() {
    focoAnterior = document.activeElement;
    avisarNaJanela("");
    mostrarEstado();
    modal.classList.remove("hidden");
    (links[app.projetoAtual()] ? document.getElementById("compartilharCopiar") : botaoCriar).focus();
  }
  function fechar() {
    modal.classList.add("hidden");
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  }

  async function criar() {
    var projeto = app.projetoAtual();
    botaoCriar.disabled = true;
    avisarNaJanela("Criando o link...");
    try {
      var svg = await app.svgDoDiagrama();
      if (!svg) { avisarNaJanela("Adicione equipamentos ao diagrama antes de compartilhar.", true); return; }
      var r = await db().insert({ projeto: projeto, svg: svg }).select("token").single();
      if (r.error) throw r.error;
      links[projeto] = { token: r.data.token, enviado: svg };
      mostrarEstado();
      avisarNaJanela("Link criado. Copie e envie para quem precisa ver.");
      campoUrl.focus();
      campoUrl.select();
    } catch (erro) {
      avisarNaJanela(erroTabelaAusente(erro)
        ? "O compartilhamento ainda não está ativado no servidor. Entre em contato com o responsável pelo Grafo."
        : "Não foi possível criar o link. Verifique a conexão e tente de novo.", true);
      console.error("Falha ao criar link:", erro);
    } finally {
      botaoCriar.disabled = false;
    }
  }

  async function copiar() {
    campoUrl.focus();
    campoUrl.select();
    try {
      await navigator.clipboard.writeText(campoUrl.value);
      avisarNaJanela("Link copiado.");
    } catch (e) {
      avisarNaJanela("Selecione o link acima e copie com Ctrl+C.");
    }
  }

  async function desativar() {
    var projeto = app.projetoAtual();
    var link = links[projeto];
    if (!link) return;
    botaoDesativar.disabled = true;
    try {
      var r = await db().delete().eq("token", link.token);
      if (r.error) throw r.error;
      delete links[projeto];
      mostrarEstado();
      avisarNaJanela("Link desativado. Quem tinha o endereço não consegue mais ver o diagrama.");
    } catch (erro) {
      avisarNaJanela("Não foi possível desativar o link. Tente de novo.", true);
    } finally {
      botaoDesativar.disabled = false;
    }
  }

  // Mantém os links em dia: reenvia o desenho do projeto aberto se mudou e
  // apaga links de projetos que foram excluídos.
  async function sincronizar() {
    if (sincronizando) return sincronizando;
    sincronizando = (async function () {
      var existentes = app.nomesProjetos();
      for (var nome in links) {
        if (existentes.indexOf(nome) >= 0) continue;
        var token = links[nome].token;
        delete links[nome];
        var apagado = await db().delete().eq("token", token);
        if (apagado.error) console.error("Falha ao apagar link de projeto excluído:", apagado.error);
      }
      var projeto = app.projetoAtual();
      var link = links[projeto];
      if (!link) return;
      var svg = await app.svgDoDiagrama();
      // Diagrama vazio (ou ainda desenhando): mantém a última cópia.
      if (!svg || svg === link.enviado) return;
      var r = await db().update({ svg: svg, atualizado_em: new Date().toISOString() }).eq("token", link.token);
      if (r.error) { console.error("Falha ao atualizar link:", r.error); return; }
      link.enviado = svg;
    })();
    try { await sincronizando; } finally { sincronizando = null; }
  }

  function agendarSincronizacao() {
    if (!Object.keys(links).length) return;
    clearTimeout(timer);
    timer = setTimeout(function () { sincronizar().catch(function (e) { console.error(e); }); }, ESPERA_ATUALIZACAO);
  }

  botao.addEventListener("click", abrir);
  botaoCriar.addEventListener("click", criar);
  document.getElementById("compartilharCopiar").addEventListener("click", copiar);
  botaoDesativar.addEventListener("click", desativar);
  modal.querySelectorAll("[data-compartilhar-fechar]").forEach(function (b) { b.addEventListener("click", fechar); });
  modal.addEventListener("click", function (event) { if (event.target === modal) fechar(); });
  modal.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fechar(); } });
  document.addEventListener("grafo:alterado", agendarSincronizacao);

  // Links já criados. Sem a tabela no servidor, o botão fica escondido.
  (async function iniciar() {
    try {
      var r = await db().select("token,projeto");
      if (r.error) throw r.error;
      (r.data || []).forEach(function (linha) { links[linha.projeto] = { token: linha.token, enviado: null }; });
      disponivel = true;
    } catch (erro) {
      disponivel = !erroTabelaAusente(erro);
      if (disponivel) console.error("Falha ao carregar links compartilhados:", erro);
    }
    botao.hidden = !disponivel;
    // Primeira sincronização: garante que o link mostre o desenho atual.
    agendarSincronizacao();
  })();
})();
