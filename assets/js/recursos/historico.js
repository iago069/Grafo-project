/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Histórico de versões dos projetos (tabela grafo_versoes; SQL em
// supabase/migracoes/2026-09-29-historico.sql). O banco guarda as versões
// sozinho a cada alteração (no máximo uma a cada 10 minutos por projeto); aqui
// ficam a janela "Histórico", o "Restaurar" e o "Guardar versão agora".
// Sem o SQL instalado, a janela explica como ativar e o resto do app segue igual.
(function () {
  "use strict";

  var modal = document.getElementById("historicoModal");
  var botao = document.getElementById("btnHistorico");
  if (!modal || !botao) return;
  var elLista = document.getElementById("historicoLista");
  var elProjeto = document.getElementById("historicoProjeto");
  var elMensagem = document.getElementById("historicoMensagem");
  var btnGuardar = document.getElementById("historicoGuardar");

  function auth() { return window.GrafoAuth; }
  function app() { return window.GrafoApp; }
  function client() { return auth() && auth().client && auth().client(); }
  function idEquipe(nome) { return window.GrafoEquipe && window.GrafoEquipe.idDaEquipe ? window.GrafoEquipe.idDaEquipe(nome) : null; }

  // Função/tabela ainda não criada no Supabase.
  function semHistoricoNoServidor(erro) {
    return !!erro && (erro.code === "PGRST202" || erro.code === "PGRST205" || erro.code === "42883" || erro.code === "42P01" ||
      /grafo_versoes|grafo_listar_versoes|grafo_salvar_versao_atual/i.test(erro.message || ""));
  }

  function mensagem(texto, erro) {
    elMensagem.textContent = texto || "";
    elMensagem.classList.toggle("erro", !!erro);
  }

  function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }

  function rotuloDoDia(data) {
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var dia = new Date(data); dia.setHours(0, 0, 0, 0);
    var dias = Math.round((hoje - dia) / 86400000);
    if (dias === 0) return "Hoje";
    if (dias === 1) return "Ontem";
    var texto = dia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function horario(data) { return new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

  var MOTIVOS = { "antes-de-restaurar": "antes de restaurar", manual: "guardada à mão" };

  // Projetos pessoais excluídos que ainda têm versões: dá para recuperar.
  async function projetosExcluidos() {
    var uid = auth().userId && auth().userId();
    if (!uid) return [];
    var r = await client().from("grafo_versoes").select("projeto").is("projeto_equipe", null).eq("dono", uid).limit(2000);
    if (r.error) return [];
    var atuais = {};
    (app().nomesProjetos() || []).forEach(function (n) { atuais[n] = true; });
    var vistos = {};
    return (r.data || []).map(function (l) { return l.projeto; }).filter(function (n) {
      if (atuais[n] || vistos[n]) return false;
      vistos[n] = true;
      return true;
    }).sort();
  }

  async function preencherProjetos(selecionado) {
    var atuais = app().nomesProjetos() || [];
    var excluidos = await projetosExcluidos();
    function opcao(n, sufixo) { var o = document.createElement("option"); o.value = n; o.textContent = n + (sufixo || ""); return o; }
    elProjeto.innerHTML = "";
    atuais.forEach(function (n) { elProjeto.appendChild(opcao(n, idEquipe(n) ? " (equipe)" : "")); });
    if (excluidos.length) {
      var grupo = document.createElement("optgroup");
      grupo.label = "Excluídos (recuperáveis)";
      excluidos.forEach(function (n) { grupo.appendChild(opcao(n, " — excluído")); });
      elProjeto.appendChild(grupo);
    }
    elProjeto.value = selecionado;
  }

  var carregando = 0;
  async function carregarLista() {
    var nome = elProjeto.value;
    var minha = ++carregando;
    elLista.innerHTML = '<li class="historico-vazio">Carregando…</li>';
    mensagem("");
    var r = await client().rpc("grafo_listar_versoes", { p_projeto: nome, p_equipe: idEquipe(nome) });
    if (minha !== carregando) return;
    if (r.error) {
      elLista.innerHTML = "";
      if (semHistoricoNoServidor(r.error)) {
        mensagem("O histórico ainda não está ativado neste servidor. Quem mantém o Grafo precisa rodar supabase/migracoes/2026-09-29-historico.sql no Supabase.", true);
        btnGuardar.disabled = true;
      } else {
        mensagem("Não foi possível carregar o histórico. Verifique a conexão e tente de novo.", true);
      }
      return;
    }
    btnGuardar.disabled = !app().nomesProjetos().includes(nome);
    desenharLista(nome, r.data || []);
  }

  function desenharLista(nome, versoes) {
    elLista.innerHTML = "";
    if (!versoes.length) {
      elLista.innerHTML = '<li class="historico-vazio">Ainda não há versões guardadas deste projeto. O Grafo guarda uma versão automaticamente depois das próximas alterações (no máximo uma a cada 10 minutos).</li>';
      return;
    }
    var meuEmail = (document.getElementById("accountEmail") || {}).textContent || "";
    var diaAtual = null;
    versoes.forEach(function (v) {
      var dia = rotuloDoDia(v.criado_em);
      if (dia !== diaAtual) {
        diaAtual = dia;
        var cab = document.createElement("li");
        cab.className = "historico-dia";
        cab.textContent = dia;
        elLista.appendChild(cab);
      }
      var li = document.createElement("li");
      li.className = "historico-item";
      var info = document.createElement("div");
      info.className = "historico-info";
      var linha1 = document.createElement("strong");
      linha1.textContent = horario(v.criado_em);
      var linha2 = document.createElement("span");
      var partes = [plural(v.equipamentos, "equipamento", "equipamentos"), plural(v.conexoes, "cabo", "cabos")];
      if (v.anotacoes) partes.push(plural(v.anotacoes, "anotação", "anotações"));
      if (v.criado_por_email && v.criado_por_email !== meuEmail) partes.push("por " + v.criado_por_email);
      linha2.textContent = partes.join(" · ");
      info.appendChild(linha1);
      if (MOTIVOS[v.motivo]) { var tag = document.createElement("em"); tag.textContent = MOTIVOS[v.motivo]; info.appendChild(tag); }
      info.appendChild(linha2);
      var restaurar = document.createElement("button");
      restaurar.type = "button";
      restaurar.className = "ghost small";
      restaurar.textContent = "Restaurar";
      restaurar.addEventListener("click", function () { pedirRestauracao(restaurar, nome, v); });
      li.appendChild(info);
      li.appendChild(restaurar);
      elLista.appendChild(li);
    });
  }

  // Dois cliques: o primeiro pede confirmação no próprio botão (some em 4 s).
  function pedirRestauracao(botaoItem, nome, versao) {
    if (!botaoItem.classList.contains("confirmar")) {
      elLista.querySelectorAll("button.confirmar").forEach(function (b) { b.classList.remove("confirmar"); b.textContent = "Restaurar"; });
      botaoItem.classList.add("confirmar");
      botaoItem.textContent = "Confirmar";
      setTimeout(function () { if (botaoItem.isConnected) { botaoItem.classList.remove("confirmar"); botaoItem.textContent = "Restaurar"; } }, 4000);
      return;
    }
    restaurar(nome, versao, botaoItem);
  }

  async function restaurar(nome, versao, botaoItem) {
    botaoItem.disabled = true;
    botaoItem.textContent = "Restaurando…";
    try {
      // O que ainda não foi salvo vai para a nuvem antes, e o estado atual vira
      // uma versão "antes de restaurar": a restauração também pode ser desfeita.
      await auth().flush();
      var atual = app().dadosProjeto(nome);
      if (atual) {
        var g = await client().rpc("grafo_salvar_versao_atual", { p_projeto: nome, p_equipe: idEquipe(nome), p_dados: atual, p_motivo: "antes-de-restaurar" });
        if (g.error) throw g.error;
      }
      var r = await client().from("grafo_versoes").select("dados").eq("id", versao.id).single();
      if (r.error) throw r.error;
      var ajustes = app().restaurarDados(nome, r.data.dados);
      fechar();
      app().avisar("Versão de " + rotuloDoDia(versao.criado_em).toLowerCase() + " às " + horario(versao.criado_em) + " restaurada. Ctrl+Z desfaz." +
        (ajustes ? " (" + ajustes + " item(ns) corrigido(s) ao abrir)" : ""));
    } catch (erro) {
      console.error("Falha ao restaurar versão:", erro);
      botaoItem.disabled = false;
      botaoItem.classList.remove("confirmar");
      botaoItem.textContent = "Restaurar";
      mensagem(/conflito|outro lugar/i.test(erro && erro.message || "")
        ? "Este projeto foi alterado em outro lugar. Resolva o aviso de conflito e tente de novo."
        : "Não foi possível restaurar. Verifique a conexão e tente de novo.", true);
    }
  }

  async function guardarAgora() {
    var nome = elProjeto.value;
    btnGuardar.disabled = true;
    try {
      await auth().flush();
      var r = await client().rpc("grafo_salvar_versao_atual", { p_projeto: nome, p_equipe: idEquipe(nome), p_dados: app().dadosProjeto(nome), p_motivo: "manual" });
      if (r.error) throw r.error;
      await carregarLista();
      mensagem("Versão guardada.");
    } catch (erro) {
      mensagem(semHistoricoNoServidor(erro) ? "O histórico ainda não está ativado neste servidor." : "Não foi possível guardar a versão agora.", true);
    } finally {
      btnGuardar.disabled = false;
    }
  }

  function abrir() {
    if (!client()) return;
    modal.classList.remove("saindo", "hidden");
    var atual = app().projetoAtual();
    elProjeto.innerHTML = "";
    var o = document.createElement("option"); o.value = atual; o.textContent = atual; elProjeto.appendChild(o);
    carregarLista();
    preencherProjetos(atual).catch(function () {});
    setTimeout(function () { elProjeto.focus(); }, 0);
  }

  function fechar() {
    modal.classList.add("saindo");
    setTimeout(function () { if (modal.classList.contains("saindo")) { modal.classList.remove("saindo"); modal.classList.add("hidden"); } }, 150);
  }

  botao.addEventListener("click", abrir);
  elProjeto.addEventListener("change", carregarLista);
  btnGuardar.addEventListener("click", guardarAgora);
  modal.querySelectorAll("[data-historico-fechar]").forEach(function (b) { b.addEventListener("click", fechar); });
  modal.addEventListener("click", function (event) { if (event.target === modal) fechar(); });
  modal.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); fechar(); } });
  botao.hidden = false;

  // Para testes e outros módulos.
  window.GrafoHistorico = { abrir: abrir, rotuloDoDia: rotuloDoDia };
})();
