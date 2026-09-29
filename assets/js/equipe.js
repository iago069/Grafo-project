/*! Grafo — Copyright (c) 2026 Iago Ariel Gularte Barbosa. Todos os direitos reservados. Proibido copiar, modificar ou distribuir sem autorização. */
// Projetos de equipe (tabelas grafo_projetos_equipe, grafo_membros e
// grafo_convites). No editor eles ficam no mesmo mapa de projetos que os
// pessoais; este módulo sabe quais chaves são de equipe, grava cada uma na
// própria linha (com a mesma proteção contra conflito dos projetos pessoais) e
// aplica na hora as alterações dos colegas. auth.js chama carregar(), separar()
// e gravar(); a janela "Equipe" é ligada por iniciarInterface(), depois que o
// editor (app.js) carrega.
(function () {
  "use strict";

  var TABELA = "grafo_projetos_equipe";
  var CONVITE_PENDENTE = "grafo-convite-pendente";
  var client = null, usuario = null;
  var disponivel = false;
  // chave no editor -> { id, dono, versao (atualizado_em), enviado (JSON gravado) }
  var projetos = {};
  var avisosPendentes = [];
  var canal = null;

  function erroTabelaAusente(erro) {
    return !!erro && (erro.code === "42P01" || erro.code === "PGRST205" || erro.code === "PGRST202" ||
      /grafo_projetos_equipe|grafo_aceitar_convite|grafo_criar_projeto_equipe/i.test(erro.message || ""));
  }

  // Sempre maior que a versão atual, mesmo com o relógio deste computador atrasado.
  function proximaVersao(versao) {
    var t = Date.now();
    if (versao) t = Math.max(t, Date.parse(versao) + 1);
    return new Date(t).toISOString();
  }

  function chaveLivre(nome, ocupadas) {
    var base = String(nome || "Projeto de equipe").slice(0, 60);
    var chave = base;
    for (var n = 2; ocupadas[chave]; n++) chave = base.slice(0, 50) + " (" + n + ")";
    return chave;
  }

  function registrar(chave, linha) {
    projetos[chave] = { id: linha.id, dono: linha.dono, versao: linha.atualizado_em, enviado: JSON.stringify(linha.dados) };
  }

  function chavePorId(id) {
    for (var chave in projetos) if (projetos[chave].id === id) return chave;
    return null;
  }

  // Convite vindo pelo link (/?convite=...): guardado até a pessoa entrar,
  // porque o cadastro passa pela confirmação de e-mail e perde o endereço.
  function lerConviteDaUrl() {
    var token = new URLSearchParams(location.search).get("convite");
    if (!token) return null;
    try { localStorage.setItem(CONVITE_PENDENTE, token); } catch (e) {}
    var url = new URL(location.href);
    url.searchParams.delete("convite");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    return token;
  }
  var conviteNaUrl = lerConviteDaUrl();

  // Chamado por auth.js antes de o editor abrir. ocupadas: chaves já usadas
  // pelos projetos pessoais. Retorna { projetos: {chave: dados}, abrir: chave|null }.
  // Falha aqui não impede o editor de abrir: segue só com os projetos pessoais.
  async function carregar(c, u, ocupadas) {
    client = c;
    usuario = u;
    try {
      return await carregarEquipe(ocupadas);
    } catch (erro) {
      console.error("Falha ao carregar projetos de equipe:", erro);
      projetos = {};
      disponivel = false;
      avisosPendentes.push("Não foi possível carregar os projetos de equipe agora. Recarregue a página para tentar de novo.");
      return { projetos: {}, abrir: null };
    }
  }

  async function carregarEquipe(ocupadas) {
    projetos = {};
    var resultado = { projetos: {}, abrir: null };
    var token = null;
    try { token = localStorage.getItem(CONVITE_PENDENTE); } catch (e) {}
    var aceito = null;
    if (token) {
      try { localStorage.removeItem(CONVITE_PENDENTE); } catch (e) {}
      var convite = /^[0-9a-f-]{36}$/i.test(token) ? await client.rpc("grafo_aceitar_convite", { p_token: token }) : { data: [], error: null };
      if (convite.error && !erroTabelaAusente(convite.error)) throw convite.error;
      aceito = convite.data && convite.data[0] || null;
      if (!aceito) avisosPendentes.push("O convite é inválido ou foi desativado. Peça um link novo a quem convidou.");
    }
    var r = await client.from(TABELA).select("id,nome,dados,dono,atualizado_em").order("nome");
    if (r.error) {
      if (erroTabelaAusente(r.error)) { disponivel = false; return resultado; }
      throw r.error;
    }
    disponivel = true;
    var usadas = Object.assign({}, ocupadas);
    (r.data || []).forEach(function (linha) {
      var chave = chaveLivre(linha.nome, usadas);
      usadas[chave] = true;
      registrar(chave, linha);
      resultado.projetos[chave] = linha.dados;
      if (aceito && linha.id === aceito.id) {
        resultado.abrir = chave;
        avisosPendentes.push(linha.dono === usuario.id ? "Este projeto de equipe é seu." : "Você entrou no projeto de equipe “" + chave + "”.");
      }
    });
    return resultado;
  }

  function ehEquipe(chave) { return Object.prototype.hasOwnProperty.call(projetos, chave); }

  // Divide o mapa do editor: os pessoais vão para grafo_user_data.
  function separar(todos) {
    var pessoais = {};
    Object.keys(todos || {}).forEach(function (chave) { if (!ehEquipe(chave)) pessoais[chave] = todos[chave]; });
    return pessoais;
  }

  function temAlteracao(todos) {
    return Object.keys(projetos).some(function (chave) {
      return todos[chave] && JSON.stringify(todos[chave]) !== projetos[chave].enviado;
    });
  }

  // Grava os projetos de equipe que mudaram. Retorna "ok" ou "conflito".
  // Quem foi removido da equipe (ou teve o projeto excluído) perde o projeto aqui.
  async function gravar(todos) {
    for (var chave in projetos) {
      var info = projetos[chave];
      if (!todos[chave]) continue;
      var json = JSON.stringify(todos[chave]);
      if (json === info.enviado) continue;
      var versao = proximaVersao(info.versao);
      var r = await client.from(TABELA).update({ dados: todos[chave], atualizado_em: versao })
        .eq("id", info.id).eq("atualizado_em", info.versao).select("atualizado_em");
      if (r.error) throw r.error;
      if (!r.data.length) {
        var existe = await client.from(TABELA).select("id").eq("id", info.id).maybeSingle();
        if (existe.error) throw existe.error;
        if (!existe.data) { removerLocal(chave, "Você não faz mais parte do projeto “" + chave + "”."); continue; }
        return "conflito";
      }
      info.versao = r.data[0].atualizado_em;
      info.enviado = json;
    }
    return "ok";
  }

  // "Manter a desta aba" no aviso de conflito: passa a gravar por cima.
  async function assumirVersoesAtuais() {
    var ids = Object.keys(projetos).map(function (chave) { return projetos[chave].id; });
    if (!ids.length) return;
    var r = await client.from(TABELA).select("id,atualizado_em").in("id", ids);
    if (r.error) throw r.error;
    (r.data || []).forEach(function (linha) {
      var chave = chavePorId(linha.id);
      if (chave) { projetos[chave].versao = linha.atualizado_em; projetos[chave].enviado = null; }
    });
  }

  // ---- Alterações dos colegas (tempo real) --------------------------------
  function app() { return window.GrafoApp; }

  function removerLocal(chave, aviso) {
    delete projetos[chave];
    if (app()) { app().removerProjeto(chave); if (aviso) app().avisar(aviso); }
  }

  async function aplicarRemoto(id) {
    var chave = chavePorId(id);
    if (!chave || !app()) return;
    var info = projetos[chave];
    var r = await client.from(TABELA).select("id,dados,atualizado_em,atualizado_por").eq("id", id).maybeSingle();
    if (r.error) return;
    if (!r.data) { removerLocal(chave, "O projeto “" + chave + "” foi excluído pelo dono."); return; }
    if (r.data.atualizado_em === info.versao) return; // a própria gravação voltando
    var local = app().dadosProjeto(chave);
    // Com alteração local ainda não gravada, quem resolve é o aviso de conflito
    // (a próxima gravação vai falhar e perguntar qual versão fica).
    if (local && JSON.stringify(local) !== info.enviado) return;
    info.versao = r.data.atualizado_em;
    info.enviado = JSON.stringify(r.data.dados);
    app().substituirProjeto(chave, r.data.dados);
    // O editor pode recalcular posições ao redesenhar: isso vira a nova base,
    // sem regravar (senão duas abas ficariam gravando uma por cima da outra).
    var redesenhado = app().dadosProjeto(chave);
    if (redesenhado) info.enviado = JSON.stringify(redesenhado);
    if (r.data.atualizado_por !== usuario.id && chave === app().projetoAtual()) app().avisar("Atualizado por outra pessoa da equipe.");
  }

  function ouvirAlteracoes() {
    if (canal || !client.channel) return;
    canal = client.channel("grafo-equipe")
      .on("postgres_changes", { event: "*", schema: "public", table: TABELA }, function (evento) {
        var id = (evento.new && evento.new.id) || (evento.old && evento.old.id);
        if (!id) return;
        if (evento.eventType === "DELETE") {
          var chave = chavePorId(id);
          if (chave) removerLocal(chave, "O projeto “" + chave + "” foi excluído pelo dono.");
          return;
        }
        aplicarRemoto(id).catch(function (e) { console.error("Falha ao aplicar alteração da equipe:", e); });
      })
      .subscribe();
  }

  // ---- Janela "Equipe" -----------------------------------------------------
  var el = {};
  var focoAnterior = null;

  function $(id) { return document.getElementById(id); }
  function mensagem(texto, erro) { el.mensagem.textContent = texto || ""; el.mensagem.classList.toggle("erro", !!erro); }
  function urlConvite(token) { return location.origin + "/?convite=" + encodeURIComponent(token); }

  async function mostrar() {
    var chave = app().projetoAtual();
    var info = projetos[chave];
    el.projeto.textContent = "“" + chave + "”";
    el.pessoal.hidden = !!info;
    el.equipe.hidden = !info;
    el.donoAcoes.hidden = true;
    el.membroAcoes.hidden = true;
    el.membros.innerHTML = "";
    if (!info) return;
    var souDono = info.dono === usuario.id;
    el.donoAcoes.hidden = !souDono;
    el.membroAcoes.hidden = souDono;
    var m = await client.from("grafo_membros").select("usuario,email,entrou_em").eq("projeto", info.id).order("entrou_em");
    if (m.error) { mensagem("Não foi possível carregar os membros.", true); return; }
    (m.data || []).forEach(function (membro) {
      var li = document.createElement("li");
      var nome = document.createElement("span");
      nome.textContent = (membro.email || "Membro") + (membro.usuario === usuario.id ? " (você)" : "");
      li.appendChild(nome);
      if (membro.usuario === info.dono) {
        var selo = document.createElement("span");
        selo.className = "equipe-selo";
        selo.textContent = "dono";
        li.appendChild(selo);
      } else if (souDono) {
        var remover = document.createElement("button");
        remover.type = "button";
        remover.className = "ghost small";
        remover.textContent = "Remover";
        remover.addEventListener("click", function () { removerMembro(info, membro, remover); });
        li.appendChild(remover);
      }
      el.membros.appendChild(li);
    });
    if (souDono) {
      var c = await client.from("grafo_convites").select("token").eq("projeto", info.id).maybeSingle();
      mostrarConvite(c.data && c.data.token);
    }
  }

  function mostrarConvite(token) {
    el.conviteCom.hidden = !token;
    el.conviteSem.hidden = !!token;
    el.conviteUrl.value = token ? urlConvite(token) : "";
  }

  async function abrir() {
    focoAnterior = document.activeElement;
    mensagem("");
    el.modal.classList.remove("hidden");
    await mostrar();
    var foco = !el.pessoal.hidden ? $("equipeTransformar") : !el.conviteCom.hidden && !el.donoAcoes.hidden ? $("equipeCopiar") : $("equipeFechar");
    if (foco) foco.focus();
  }
  function fechar() {
    el.modal.classList.add("hidden");
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  }

  async function transformar() {
    var chave = app().projetoAtual();
    var botao = $("equipeTransformar");
    botao.disabled = true;
    mensagem("Criando o projeto de equipe...");
    try {
      await window.GrafoAuth.flush();
      var dados = app().dadosProjeto(chave);
      var r = await client.rpc("grafo_criar_projeto_equipe", { p_nome: chave, p_dados: dados });
      if (r.error) throw r.error;
      var linha = r.data && r.data[0];
      registrar(chave, { id: linha.id, dono: usuario.id, atualizado_em: linha.atualizado_em, dados: dados });
      // Some da lista pessoal na próxima gravação (auth.js usa separar()).
      app().salvar();
      app().atualizarListaProjetos();
      await mostrar();
      mensagem("Pronto! Copie o link de convite e envie para quem vai editar com você.");
    } catch (erro) {
      mensagem(erroTabelaAusente(erro)
        ? "Os projetos de equipe ainda não estão ativados no servidor. Entre em contato com o responsável pelo Grafo."
        : "Não foi possível criar o projeto de equipe. " + (erro.message || ""), true);
    } finally {
      botao.disabled = false;
    }
  }

  async function copiar() {
    el.conviteUrl.select();
    try { await navigator.clipboard.writeText(el.conviteUrl.value); mensagem("Link de convite copiado."); }
    catch (e) { mensagem("Selecione o link acima e copie com Ctrl+C."); }
  }

  async function novoConvite() {
    var info = projetos[app().projetoAtual()];
    var token = window.crypto && crypto.randomUUID ? crypto.randomUUID() : null;
    if (!info || !token) return;
    var r = await client.from("grafo_convites").upsert({ projeto: info.id, token: token }, { onConflict: "projeto" });
    if (r.error) { mensagem("Não foi possível gerar o link.", true); return; }
    mostrarConvite(token);
    $("equipeCopiar").focus();
    mensagem("Link novo gerado. O anterior parou de funcionar.");
  }

  async function desativarConvite() {
    var info = projetos[app().projetoAtual()];
    if (!info) return;
    var r = await client.from("grafo_convites").delete().eq("projeto", info.id);
    if (r.error) { mensagem("Não foi possível desativar o link.", true); return; }
    mostrarConvite(null);
    mensagem("Link desativado. Quem já está na equipe continua; ninguém novo entra por ele.");
  }

  async function removerMembro(info, membro, botao) {
    botao.disabled = true;
    var r = await client.from("grafo_membros").delete().eq("projeto", info.id).eq("usuario", membro.usuario);
    if (r.error) { botao.disabled = false; mensagem("Não foi possível remover.", true); return; }
    mensagem((membro.email || "O membro") + " saiu da equipe.");
    await mostrar();
  }

  async function sair() {
    var chave = app().projetoAtual();
    var info = projetos[chave];
    if (!info) return;
    var botao = $("equipeSair");
    botao.disabled = true;
    var r = await client.from("grafo_membros").delete().eq("projeto", info.id).eq("usuario", usuario.id);
    botao.disabled = false;
    if (r.error) { mensagem("Não foi possível sair do projeto.", true); return; }
    fechar();
    removerLocal(chave, "Você saiu do projeto “" + chave + "”.");
  }

  // Botão × do editor num projeto de equipe. Resolve com true se o projeto saiu da lista.
  async function excluirOuSair(chave) {
    var info = projetos[chave];
    if (!info) return false;
    var souDono = info.dono === usuario.id;
    var ok = window.confirm(souDono
      ? "Excluir o projeto de equipe “" + chave + "” para TODOS os membros? Não dá para desfazer."
      : "Sair do projeto de equipe “" + chave + "”? Você deixa de ver e editar este projeto.");
    if (!ok) return false;
    var r = souDono
      ? await client.from(TABELA).delete().eq("id", info.id)
      : await client.from("grafo_membros").delete().eq("projeto", info.id).eq("usuario", usuario.id);
    if (r.error) { app().avisar("Não foi possível " + (souDono ? "excluir o projeto." : "sair do projeto.")); return false; }
    removerLocal(chave, souDono ? "Projeto de equipe “" + chave + "” excluído." : "Você saiu do projeto “" + chave + "”.");
    return true;
  }

  // Depois que o editor carrega: botão, janela, tempo real e avisos do convite.
  function iniciarInterface() {
    el = {
      modal: $("equipeModal"), projeto: $("equipeProjeto"), pessoal: $("equipePessoal"), equipe: $("equipeProjetoEquipe"),
      membros: $("equipeMembros"), donoAcoes: $("equipeDono"), membroAcoes: $("equipeMembro"),
      conviteCom: $("equipeConviteCom"), conviteSem: $("equipeConviteSem"), conviteUrl: $("equipeConviteUrl"), mensagem: $("equipeMensagem")
    };
    var botao = $("btnEquipe");
    if (!el.modal || !botao) return;
    botao.hidden = !disponivel;
    if (!disponivel) { avisosPendentes.splice(0).forEach(function (texto) { app().avisar(texto); }); return; }
    botao.addEventListener("click", abrir);
    $("equipeTransformar").addEventListener("click", transformar);
    $("equipeCopiar").addEventListener("click", copiar);
    $("equipeNovoLink").addEventListener("click", novoConvite);
    $("equipeDesativarLink").addEventListener("click", desativarConvite);
    $("equipeCriarLink").addEventListener("click", novoConvite);
    $("equipeSair").addEventListener("click", sair);
    el.modal.querySelectorAll("[data-equipe-fechar]").forEach(function (b) { b.addEventListener("click", fechar); });
    el.modal.addEventListener("click", function (event) { if (event.target === el.modal) fechar(); });
    // No documento, não só na janela: um botão que some (ex.: "Criar link") tira o foco dela.
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !el.modal.classList.contains("hidden")) { event.preventDefault(); fechar(); }
    });
    ouvirAlteracoes();
    avisosPendentes.splice(0).forEach(function (texto) { app().avisar(texto); });
  }

  window.GrafoEquipe = {
    carregar: carregar,
    separar: separar,
    temAlteracao: temAlteracao,
    gravar: gravar,
    assumirVersoesAtuais: assumirVersoesAtuais,
    ehEquipe: ehEquipe,
    excluirOuSair: excluirOuSair,
    iniciarInterface: iniciarInterface,
    conviteNaUrl: function () { return conviteNaUrl; }
  };
})();
