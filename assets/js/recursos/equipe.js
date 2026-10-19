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
      /grafo_projetos_equipe|grafo_aceitar_convite|grafo_criar_projeto_equipe|grafo_criar_grupo|grafo_definir_acesso|grafo_adicionar_ao_grupo|grafo_convites_grupo/i.test(erro.message || ""));
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

  // papel: "editar" ou "ver" (quem só vê não grava); grupo: equipe com vários diagramas.
  function registrar(chave, linha, papel) {
    projetos[chave] = { id: linha.id, dono: linha.dono, versao: linha.atualizado_em, enviado: JSON.stringify(linha.dados),
      grupo: linha.grupo || null, papel: papel === "ver" ? "ver" : "editar" };
  }
  function soVe(chave) { return !!projetos[chave] && projetos[chave].papel === "ver"; }

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
      return { projetos: {}, abrir: null, falhou: true };
    }
  }

  async function carregarEquipe(ocupadas) {
    projetos = {};
    var resultado = { projetos: {}, abrir: null };
    var token = null;
    try { token = localStorage.getItem(CONVITE_PENDENTE); } catch (e) {}
    var aceitos = [], deGrupo = false;
    if (token) {
      try { localStorage.removeItem(CONVITE_PENDENTE); } catch (e) {}
      if (/^[0-9a-f-]{36}$/i.test(token)) {
        // Convite de grupo (vários diagramas) primeiro; senão, o convite antigo de um diagrama.
        var grupo = await client.rpc("grafo_aceitar_convite_grupo", { p_token: token });
        if (grupo.error && !erroTabelaAusente(grupo.error)) throw grupo.error;
        if (grupo.data && grupo.data.length) { aceitos = grupo.data.map(function (l) { return l.id; }); deGrupo = true; }
        else {
          var convite = await client.rpc("grafo_aceitar_convite", { p_token: token });
          if (convite.error && !erroTabelaAusente(convite.error)) throw convite.error;
          if (convite.data && convite.data[0]) aceitos = [convite.data[0].id];
        }
      }
      if (!aceitos.length) avisosPendentes.push("O convite é inválido ou foi desativado. Peça um link novo a quem convidou.");
    }
    var r = await client.from(TABELA).select("id,nome,dados,dono,atualizado_em,grupo").order("nome");
    // Sem o SQL de grupos ainda: a coluna "grupo" não existe.
    if (r.error && (r.error.code === "42703" || /grupo/i.test(r.error.message || ""))) r = await client.from(TABELA).select("id,nome,dados,dono,atualizado_em").order("nome");
    if (r.error) {
      if (erroTabelaAusente(r.error)) { disponivel = false; return resultado; }
      throw r.error;
    }
    disponivel = true;
    var papeis = {};
    var meus = await client.from("grafo_membros").select("projeto,papel").eq("usuario", usuario.id);
    if (!meus.error) (meus.data || []).forEach(function (m) { papeis[m.projeto] = m.papel; });
    var entrouEm = [];
    var usadas = Object.assign({}, ocupadas);
    (r.data || []).forEach(function (linha) {
      var chave = chaveLivre(linha.nome, usadas);
      usadas[chave] = true;
      registrar(chave, linha, papeis[linha.id]);
      resultado.projetos[chave] = linha.dados;
      if (aceitos.indexOf(linha.id) >= 0) {
        if (!resultado.abrir) resultado.abrir = chave;
        entrouEm.push(chave);
      }
    });
    if (entrouEm.length) {
      var dono = projetos[entrouEm[0]].dono === usuario.id;
      avisosPendentes.push(dono ? "Esta equipe é sua." : deGrupo
        ? "Você entrou na equipe: " + entrouEm.length + (entrouEm.length === 1 ? " diagrama liberado." : " diagramas liberados.")
        : "Você entrou no projeto de equipe “" + entrouEm[0] + "”.");
    }
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
      return !soVe(chave) && todos[chave] && JSON.stringify(todos[chave]) !== projetos[chave].enviado;
    });
  }

  // Grava os projetos de equipe que mudaram. Retorna "ok" ou "conflito".
  // Quem foi removido da equipe (ou teve o projeto excluído) perde o projeto aqui.
  async function gravar(todos) {
    for (var chave in projetos) {
      var info = projetos[chave];
      if (!todos[chave] || info.papel === "ver") continue;
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
        // O dono pode ter mudado o acesso para "só visualizar".
        var meu = await client.from("grafo_membros").select("papel").eq("projeto", info.id).eq("usuario", usuario.id).maybeSingle();
        if (!meu.error && meu.data && meu.data.papel === "ver") {
          info.papel = "ver";
          await aplicarRemoto(info.id, true);
          if (app()) app().avisar("Agora você só pode visualizar “" + chave + "”. A alteração não foi salva.");
          continue;
        }
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

  // ---- Sem internet (auth.js) ------------------------------------------------
  // Versões que este aparelho conhece, guardadas junto com a cópia local:
  // { chave: { id, versao } }.
  function versoesConhecidas() {
    var saida = {};
    Object.keys(projetos).forEach(function (chave) { saida[chave] = { id: projetos[chave].id, versao: projetos[chave].versao }; });
    return saida;
  }

  // Editor aberto sem internet: refaz a lista de projetos de equipe a partir do
  // que ficou guardado, para eles não serem tratados como pessoais. sincronizado:
  // a cópia local é igual à do servidor (nada pendente).
  function restaurarOffline(salvo, locais, sincronizado, c, u) {
    client = c;
    usuario = u;
    disponivel = false;
    projetos = {};
    Object.keys(salvo || {}).forEach(function (chave) {
      if (!salvo[chave] || !salvo[chave].id) return;
      projetos[chave] = { id: salvo[chave].id, dono: null, versao: salvo[chave].versao,
        enviado: sincronizado && locais[chave] ? JSON.stringify(locais[chave]) : null };
    });
  }

  // Retomando alterações feitas sem internet: nos projetos alterados neste
  // aparelho, volta a versão que ele conhecia, para a gravação perceber se um
  // colega salvou nesse meio-tempo (e mostrar o aviso de conflito).
  // Retorna { chaveAntiga: chaveAtual, ou null se a pessoa saiu da equipe }.
  function usarVersoesBase(salvo, locais) {
    var mapa = {};
    Object.keys(salvo || {}).forEach(function (antiga) {
      var chave = salvo[antiga] && chavePorId(salvo[antiga].id);
      mapa[antiga] = chave || null;
      if (!chave || !locais[antiga] || !salvo[antiga].versao) return;
      if (JSON.stringify(locais[antiga]) !== projetos[chave].enviado) projetos[chave].versao = salvo[antiga].versao;
    });
    return mapa;
  }

  // ---- Alterações dos colegas (tempo real) --------------------------------
  function app() { return window.GrafoApp; }

  function removerLocal(chave, aviso) {
    delete projetos[chave];
    if (app()) { app().removerProjeto(chave); if (aviso) app().avisar(aviso); }
  }

  async function aplicarRemoto(id, forcar) {
    var chave = chavePorId(id);
    if (!chave || !app()) return;
    var info = projetos[chave];
    var r = await client.from(TABELA).select("id,dados,atualizado_em,atualizado_por").eq("id", id).maybeSingle();
    if (r.error) return;
    if (!r.data) { removerLocal(chave, "O projeto “" + chave + "” foi excluído pelo dono."); return; }
    if (r.data.atualizado_em === info.versao && !forcar) return; // a própria gravação voltando
    var local = app().dadosProjeto(chave);
    // Com alteração local ainda não gravada, quem resolve é o aviso de conflito
    // (a próxima gravação vai falhar e perguntar qual versão fica).
    if (!forcar && info.papel !== "ver" && local && JSON.stringify(local) !== info.enviado) return;
    info.versao = r.data.atualizado_em;
    info.enviado = JSON.stringify(r.data.dados);
    app().substituirProjeto(chave, r.data.dados);
    // O editor pode recalcular posições ao redesenhar: isso vira a nova base,
    // sem regravar (senão duas abas ficariam gravando uma por cima da outra).
    var redesenhado = app().dadosProjeto(chave);
    if (redesenhado) info.enviado = info.base = JSON.stringify(redesenhado);
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

  // ---- Grupos: vários diagramas e acesso por pessoa ------------------------
  var PAPEIS = { nenhum: "Sem acesso", ver: "Só visualizar", editar: "Pode editar" };

  function chavesDoGrupo(grupo) {
    return Object.keys(projetos).filter(function (k) { return grupo && projetos[k].grupo === grupo; }).sort();
  }

  // Cria a equipe com os diagramas pessoais escolhidos.
  // itens: [{ chave, papel: "ver"|"editar" }]. Resolve com o id do grupo.
  async function criarGrupo(nome, itens) {
    await window.GrafoAuth.flush();
    var lista = itens.map(function (it) { return { nome: it.chave, dados: app().dadosProjeto(it.chave), papel: it.papel === "ver" ? "ver" : "editar" }; })
      .filter(function (it) { return it.dados; });
    if (!lista.length) throw new Error("Escolha ao menos um diagrama.");
    var r = await client.rpc("grafo_criar_grupo", { p_nome: nome, p_projetos: lista });
    if (r.error) throw r.error;
    var grupo = null;
    (r.data || []).forEach(function (linha) {
      var item = lista.find(function (it) { return it.nome === linha.nome; });
      if (!item) return;
      grupo = linha.grupo;
      registrar(item.nome, { id: linha.id, dono: usuario.id, atualizado_em: linha.atualizado_em, dados: item.dados, grupo: linha.grupo }, "editar");
    });
    // Saem da lista pessoal na próxima gravação (auth.js usa separar()).
    app().salvar();
    if (app().atualizarListaProjetos) app().atualizarListaProjetos();
    return grupo;
  }

  // Põe mais um diagrama pessoal no grupo (só o dono).
  async function adicionarAoGrupo(grupo, chave, papel) {
    await window.GrafoAuth.flush();
    var dados = app().dadosProjeto(chave);
    var r = await client.rpc("grafo_adicionar_ao_grupo", { p_grupo: grupo, p_nome: chave, p_dados: dados, p_papel: papel === "ver" ? "ver" : "editar" });
    if (r.error) throw r.error;
    var linha = r.data && r.data[0];
    registrar(chave, { id: linha.id, dono: usuario.id, atualizado_em: linha.atualizado_em, dados: dados, grupo: grupo }, "editar");
    app().salvar();
    if (app().atualizarListaProjetos) app().atualizarListaProjetos();
  }

  // Quem está no grupo e o acesso de cada um a cada diagrama:
  // [{ usuario, email, papeis: { chave: "ver"|"editar" } }] (sem o dono).
  async function acessosDoGrupo(grupo) {
    var chaves = chavesDoGrupo(grupo);
    var ids = chaves.map(function (k) { return projetos[k].id; });
    if (!ids.length) return [];
    var r = await client.from("grafo_membros").select("projeto,usuario,email,papel").in("projeto", ids);
    if (r.error) throw r.error;
    var dono = projetos[chaves[0]].dono, pessoas = {}, ordem = [];
    (r.data || []).forEach(function (m) {
      if (m.usuario === dono) return;
      if (!pessoas[m.usuario]) { pessoas[m.usuario] = { usuario: m.usuario, email: m.email || "", papeis: {} }; ordem.push(m.usuario); }
      if (m.email && !pessoas[m.usuario].email) pessoas[m.usuario].email = m.email;
      var chave = chavePorId(m.projeto);
      if (chave) pessoas[m.usuario].papeis[chave] = m.papel === "ver" ? "ver" : "editar";
    });
    return ordem.map(function (u) { return pessoas[u]; }).sort(function (a, b) { return a.email.localeCompare(b.email); });
  }

  async function definirAcesso(chave, pessoa, papel) {
    var info = projetos[chave];
    if (!info) throw new Error("Diagrama desconhecido.");
    var r = await client.rpc("grafo_definir_acesso", { p_projeto: info.id, p_usuario: pessoa, p_papel: papel });
    if (r.error) throw r.error;
  }

  // ---- Quem só visualiza: o editor mostra o aviso e desfaz qualquer alteração --
  var ultimaChaveVista = null, desfazendo = false;
  function vigiarSomenteLeitura() {
    if (!app()) return;
    var chave = app().projetoAtual();
    var ver = soVe(chave);
    if (document.body.setAttribute) {
      if (ver) document.body.setAttribute("data-somente-leitura", ""); else document.body.removeAttribute("data-somente-leitura");
    }
    if (!ver || desfazendo) { ultimaChaveVista = chave; return; }
    var info = projetos[chave];
    var atual = JSON.stringify(app().dadosProjeto(chave));
    // Abrindo o diagrama: o que aparece (já redesenhado) vira a base.
    if (chave !== ultimaChaveVista || !info.base) { info.base = atual; ultimaChaveVista = chave; return; }
    if (atual === info.base) return;
    desfazendo = true;
    try { app().substituirProjeto(chave, JSON.parse(info.base)); info.base = JSON.stringify(app().dadosProjeto(chave)); }
    finally { desfazendo = false; }
    app().avisar("Você só pode visualizar este diagrama. Peça ao dono da equipe para liberar a edição.");
  }

  // ---- Janela "Equipe" -----------------------------------------------------
  var el = {};
  var focoAnterior = null;

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function mensagem(texto, erro) { el.mensagem.textContent = texto || ""; el.mensagem.classList.toggle("erro", !!erro); }
  function urlConvite(token) { return location.origin + "/?convite=" + encodeURIComponent(token); }
  function opcoesPapel(atual, comNenhum) {
    return (comNenhum ? ["nenhum", "ver", "editar"] : ["editar", "ver"]).map(function (p) {
      return '<option value="' + p + '"' + (p === atual ? " selected" : "") + ">" + PAPEIS[p] + "</option>";
    }).join("");
  }
  function pessoaisLivres() {
    var nomes = app().nomesProjetos ? app().nomesProjetos() : [];
    return nomes.filter(function (n) { return !ehEquipe(n); });
  }

  function mostrarEscolha(chaveAtual) {
    if (!el.escolha) return;
    var nomes = pessoaisLivres();
    el.escolha.innerHTML = nomes.map(function (n) {
      return '<label class="equipe-diag"><input type="checkbox" data-equipe-diag value="' + esc(n) + '"' + (n === chaveAtual ? " checked" : "") + '>' +
        '<span>' + esc(n) + '</span><select data-equipe-papel="' + esc(n) + '" aria-label="Acesso de quem entrar em ' + esc(n) + '">' + opcoesPapel("editar") + "</select></label>";
    }).join("") || "<p>Nenhum diagrama pessoal.</p>";
    if (el.nomeGrupo && !el.nomeGrupo.value) el.nomeGrupo.value = chaveAtual || "";
  }

  async function mostrarGrupo(info, souDono) {
    var chaves = chavesDoGrupo(info.grupo);
    el.grupo.hidden = false;
    el.membrosBloco.hidden = true;
    if (!souDono) {
      el.matriz.innerHTML = '<p>Seus acessos nesta equipe:</p><ul class="equipe-seus">' + chaves.map(function (k) {
        return "<li><span>" + esc(k) + "</span><em>" + PAPEIS[projetos[k].papel] + "</em></li>";
      }).join("") + "</ul>";
      el.adicionar.hidden = true;
      return;
    }
    var pessoas;
    try { pessoas = await acessosDoGrupo(info.grupo); }
    catch (e) { mensagem("Não foi possível carregar os acessos.", true); return; }
    el.matriz.innerHTML = pessoas.length
      ? '<div class="equipe-tabela-rolagem"><table class="equipe-tabela"><thead><tr><th>Pessoa</th>' + chaves.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        pessoas.map(function (p) {
          return "<tr><td>" + esc(p.email || "Membro") + "</td>" + chaves.map(function (k) {
            return '<td><select data-acesso-chave="' + esc(k) + '" data-acesso-pessoa="' + esc(p.usuario) + '" aria-label="Acesso de ' + esc(p.email) + " em " + esc(k) + '">' + opcoesPapel(p.papeis[k] || "nenhum", true) + "</select></td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>"
      : "<p>Ninguém entrou ainda. Envie o link de convite abaixo: cada diagrama entra com o acesso escolhido para ele, e depois você ajusta aqui pessoa por pessoa.</p>";
    var livres = pessoaisLivres();
    el.adicionar.hidden = !livres.length;
    if (el.adicionarDiag) el.adicionarDiag.innerHTML = livres.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
  }

  async function mostrar() {
    var chave = app().projetoAtual();
    var info = projetos[chave];
    el.projeto.textContent = "“" + chave + "”";
    el.pessoal.hidden = !!info;
    el.equipe.hidden = !info;
    el.donoAcoes.hidden = true;
    el.membroAcoes.hidden = true;
    el.membros.innerHTML = "";
    if (el.grupo) el.grupo.hidden = true;
    if (el.membrosBloco) el.membrosBloco.hidden = false;
    if (!info) { mostrarEscolha(chave); return; }
    var souDono = info.dono === usuario.id;
    el.donoAcoes.hidden = !souDono;
    el.membroAcoes.hidden = souDono;
    if (info.grupo && el.grupo) {
      await mostrarGrupo(info, souDono);
      if (souDono) {
        var cg = await client.from("grafo_convites_grupo").select("token").eq("grupo", info.grupo).maybeSingle();
        mostrarConvite(cg.data && cg.data.token);
      }
      return;
    }
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
    var botao = $("equipeTransformar");
    var itens = [];
    el.escolha.querySelectorAll("[data-equipe-diag]").forEach(function (cb) {
      if (!cb.checked) return;
      var sel = el.escolha.querySelector('[data-equipe-papel="' + (window.CSS && CSS.escape ? CSS.escape(cb.value) : cb.value) + '"]');
      itens.push({ chave: cb.value, papel: sel ? sel.value : "editar" });
    });
    if (!itens.length) { mensagem("Marque ao menos um diagrama.", true); return; }
    botao.disabled = true;
    mensagem("Criando a equipe...");
    try {
      await criarGrupo((el.nomeGrupo && el.nomeGrupo.value) || itens[0].chave, itens);
      var atual = app().projetoAtual();
      if (!ehEquipe(atual) && app().trocarProjeto) app().trocarProjeto(itens[0].chave);
      await mostrar();
      mensagem("Pronto! Copie o link de convite e envie. Depois ajuste aqui quem vê e quem edita cada diagrama.");
    } catch (erro) {
      mensagem(erroTabelaAusente(erro)
        ? "As equipes com vários diagramas ainda não estão ativadas no servidor (falta rodar o SQL 2026-10-19-equipe-grupos.sql)."
        : "Não foi possível criar a equipe. " + (erro.message || ""), true);
    } finally {
      botao.disabled = false;
    }
  }

  async function mudarAcesso(select) {
    select.disabled = true;
    try {
      await definirAcesso(select.getAttribute("data-acesso-chave"), select.getAttribute("data-acesso-pessoa"), select.value);
      mensagem("Acesso atualizado.");
    } catch (erro) {
      mensagem("Não foi possível mudar o acesso. " + (erro.message || ""), true);
    }
    select.disabled = false;
    await mostrar();
  }

  async function adicionarPeloBotao() {
    var info = projetos[app().projetoAtual()];
    if (!info || !info.grupo || !el.adicionarDiag.value) return;
    var botao = $("equipeAdicionarBtn");
    botao.disabled = true;
    try {
      await adicionarAoGrupo(info.grupo, el.adicionarDiag.value, el.adicionarPapel.value);
      mensagem("Diagrama adicionado à equipe.");
      await mostrar();
    } catch (erro) {
      mensagem("Não foi possível adicionar. " + (erro.message || ""), true);
    }
    botao.disabled = false;
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
    var r = info.grupo
      ? await client.from("grafo_convites_grupo").upsert({ grupo: info.grupo, token: token }, { onConflict: "grupo" })
      : await client.from("grafo_convites").upsert({ projeto: info.id, token: token }, { onConflict: "projeto" });
    if (r.error) { mensagem("Não foi possível gerar o link.", true); return; }
    mostrarConvite(token);
    $("equipeCopiar").focus();
    mensagem("Link novo gerado. O anterior parou de funcionar.");
  }

  async function desativarConvite() {
    var info = projetos[app().projetoAtual()];
    if (!info) return;
    var r = info.grupo
      ? await client.from("grafo_convites_grupo").delete().eq("grupo", info.grupo)
      : await client.from("grafo_convites").delete().eq("projeto", info.id);
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
      conviteCom: $("equipeConviteCom"), conviteSem: $("equipeConviteSem"), conviteUrl: $("equipeConviteUrl"), mensagem: $("equipeMensagem"),
      escolha: $("equipeEscolha"), nomeGrupo: $("equipeNomeGrupo"), grupo: $("equipeGrupo"), matriz: $("equipeMatriz"), membrosBloco: $("equipeMembrosBloco"),
      adicionar: $("equipeAdicionar"), adicionarDiag: $("equipeAdicionarDiag"), adicionarPapel: $("equipeAdicionarPapel")
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
    if ($("equipeAdicionarBtn")) $("equipeAdicionarBtn").addEventListener("click", adicionarPeloBotao);
    if (el.matriz) el.matriz.addEventListener("change", function (event) { if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-acesso-chave")) mudarAcesso(event.target); });
    window.addEventListener("grafo:render", vigiarSomenteLeitura);
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
    versoesConhecidas: versoesConhecidas,
    restaurarOffline: restaurarOffline,
    usarVersoesBase: usarVersoesBase,
    ehEquipe: ehEquipe,
    // id (uuid) do projeto de equipe, para o histórico de versões; null se for pessoal.
    idDaEquipe: function (chave) { return ehEquipe(chave) ? projetos[chave].id : null; },
    // Grupos (equipe com vários diagramas) e acesso por pessoa.
    criarGrupo: criarGrupo,
    adicionarAoGrupo: adicionarAoGrupo,
    acessosDoGrupo: acessosDoGrupo,
    definirAcesso: definirAcesso,
    papel: function (chave) { return ehEquipe(chave) ? projetos[chave].papel : null; },
    grupo: function (chave) { return ehEquipe(chave) ? projetos[chave].grupo : null; },
    excluirOuSair: excluirOuSair,
    iniciarInterface: iniciarInterface,
    conviteNaUrl: function () { return conviteNaUrl; }
  };
})();
