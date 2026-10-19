// Projetos de equipe (assets/js/recursos/equipe.js + auth.js): duas contas no mesmo banco.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { novoBanco, abrirAba, esperar, USUARIO } = require("./simulador");

const OUTRA = { id: "u2", email: "colega@exemplo.com" };
const nomeEm = dados => dados && dados.equipamentos[0] && dados.equipamentos[0].nome;
const projetoNoBanco = (banco, nome) => banco.projetos.find(p => p.nome === nome);

// Dona (u1) cria "Rede A" e põe numa equipe (grupo com um diagrama).
async function criarEquipe(banco) {
  const dona = await abrirAba(banco, { equipe: true });
  await dona.editarProjeto("Rede A", "A1");
  await dona.equipe.criarGrupo("Rede A", [{ chave: "Rede A", papel: "editar" }]);
  await dona.auth.flush();
  return dona;
}

test("transformar em equipe tira o projeto da conta e grava na tabela de equipe", async () => {
  const banco = novoBanco();
  const dona = await criarEquipe(banco);
  const p = projetoNoBanco(banco, "Rede A");
  assert.ok(p, "o projeto de equipe deveria existir");
  assert.equal(p.dono, USUARIO.id);
  assert.equal(nomeEm(p.dados), "A1");
  assert.equal(banco.linha.projects["Rede A"], undefined, "não pode ficar também na lista pessoal");
  assert.ok(dona.equipe.ehEquipe("Rede A"));
  assert.equal(banco.convitesGrupo.length, 1, "o link de convite já é criado");
});

test("quem entra pelo convite edita, e a dona recebe a alteração em tempo real", async () => {
  const banco = novoBanco();
  const dona = await criarEquipe(banco);
  const token = banco.convitesGrupo[0].token;
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + token });
  assert.ok(colega.equipe.ehEquipe("Rede A"), "a colega deveria ter o projeto");
  assert.equal(colega.editor.atual, "Rede A", "o projeto do convite abre direto");
  assert.ok(colega.avisos.some(a => /entrou na equipe/.test(a)));

  await colega.editarProjeto("Rede A", "B1");
  assert.equal(nomeEm(projetoNoBanco(banco, "Rede A").dados), "B1");
  assert.equal((banco.linhas.u2 && banco.linhas.u2.projects || {})["Rede A"], undefined, "fica fora da lista pessoal da colega");

  await esperar(60);
  assert.equal(nomeEm(dona.editor.projetos["Rede A"]), "B1", "a dona deveria ver a alteração sem recarregar");
});

test("duas pessoas editando ao mesmo tempo: ninguém sobrescreve o outro sem aviso", async () => {
  const banco = novoBanco();
  const dona = await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });

  // A dona mexe e ainda não salvou; a colega salva antes.
  dona.editor.projetos["Rede A"] = { equipamentos: [{ id: "e", nome: "DONA" }], conexoes: [] };
  await colega.editarProjeto("Rede A", "COLEGA");
  await esperar(60);
  assert.equal(nomeEm(dona.editor.projetos["Rede A"]), "DONA", "a alteração local não pode ser atropelada");

  dona.auth.scheduleSave(dona.editor.projetos, "Rede A");
  await dona.auth.flush().catch(() => {});
  assert.ok(dona.avisoAberto(), "a dona deveria ver o aviso de conflito");
  assert.equal(nomeEm(projetoNoBanco(banco, "Rede A").dados), "COLEGA");

  // "Manter a desta aba" grava a versão da dona.
  await dona.els.conflitoManter.disparar("click");
  assert.equal(nomeEm(projetoNoBanco(banco, "Rede A").dados), "DONA");
});

test("quando a dona exclui, o projeto some para os membros", async () => {
  const banco = novoBanco();
  const dona = await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });
  assert.equal(await dona.equipe.excluirOuSair("Rede A"), true);
  assert.equal(banco.projetos.length, 0);
  await esperar(60);
  assert.equal(colega.editor.projetos["Rede A"], undefined);
  assert.ok(colega.avisos.some(a => /excluído pelo dono/.test(a)));
});

test("membro removido perde o projeto na próxima gravação", async () => {
  const banco = novoBanco();
  await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });
  banco.membros = banco.membros.filter(m => m.usuario !== OUTRA.id); // a dona removeu
  await colega.editarProjeto("Rede A", "DEPOIS");
  assert.equal(colega.editor.projetos["Rede A"], undefined);
  assert.ok(colega.avisos.some(a => /não faz mais parte/.test(a)));
  assert.notEqual(nomeEm(projetoNoBanco(banco, "Rede A").dados), "DEPOIS", "não pode gravar sem ser membro");
});

test("sair do projeto: o membro sai e a dona continua com ele", async () => {
  const banco = novoBanco();
  await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });
  assert.equal(await colega.equipe.excluirOuSair("Rede A"), true);
  assert.equal(banco.projetos.length, 1, "o projeto continua existindo");
  assert.ok(!banco.membros.some(m => m.usuario === OUTRA.id));
  assert.equal(colega.editor.projetos["Rede A"], undefined);
});

test("convite inválido avisa e não quebra o carregamento", async () => {
  const banco = novoBanco();
  const aba = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=00000000-0000-4000-8000-999999999999" });
  assert.ok(aba.avisos.some(a => /inválido ou foi desativado/.test(a)));
  await aba.editarProjeto("Pessoal", "X");
  assert.equal(nomeEm(banco.linhas.u2.projects.Pessoal), "X");
});

test("falha inesperada nos projetos de equipe não impede o editor de abrir", async () => {
  const banco = novoBanco();
  banco.linha = { user_id: "u1", projects: { Pessoal: { equipamentos: [{ id: "e", nome: "P1" }], conexoes: [] } }, current_project: "Pessoal", updated_at: "2026-09-29T10:00:00.000+00:00" };
  banco.falhaEquipe = true;
  const aba = await abrirAba(banco, { equipe: true });
  assert.equal(nomeEm(aba.editor.projetos.Pessoal), "P1", "os projetos pessoais abrem normalmente");
  assert.ok(aba.avisos.some(a => /Não foi possível carregar os projetos de equipe/.test(a)));
  assert.equal(aba.els.btnEquipe.hidden, true);
  await aba.editarProjeto("Pessoal", "P2");
  assert.equal(nomeEm(banco.linha.projects.Pessoal), "P2");
});

test("sem o SQL de equipe no servidor, tudo continua pessoal e o botão fica escondido", async () => {
  const banco = novoBanco();
  banco.semEquipe = true;
  const aba = await abrirAba(banco, { equipe: true });
  assert.equal(aba.els.btnEquipe.hidden, true);
  await aba.editarProjeto("Rede A", "A1");
  assert.equal(nomeEm(banco.linha.projects["Rede A"]), "A1");
});

// ---- Equipe com vários diagramas e acesso por diagrama -------------------------
async function criarGrupoComDois(banco) {
  const dona = await abrirAba(banco, { equipe: true });
  await dona.editarProjeto("Core L2", "L2");
  await dona.editarProjeto("Core L3", "L3");
  await dona.editarProjeto("Rascunho", "R");
  await dona.equipe.criarGrupo("PFU", [{ chave: "Core L2", papel: "editar" }, { chave: "Core L3", papel: "ver" }]);
  await dona.auth.flush();
  return dona;
}

test("criar equipe escolhendo os diagramas: só os marcados entram, o resto fica pessoal", async () => {
  const banco = novoBanco();
  const dona = await criarGrupoComDois(banco);
  assert.deepEqual(banco.projetos.map(p => p.nome).sort(), ["Core L2", "Core L3"]);
  assert.equal(new Set(banco.projetos.map(p => p.grupo)).size, 1, "os dois no mesmo grupo");
  assert.ok(banco.linha.projects["Rascunho"], "o não marcado continua pessoal");
  assert.equal(banco.linha.projects["Core L2"], undefined);
  assert.equal(dona.equipe.papel("Core L2"), "editar");
  assert.equal(dona.equipe.papel("Core L3"), "editar", "a dona sempre edita");
});

test("quem entra pelo convite do grupo recebe cada diagrama com o acesso escolhido", async () => {
  const banco = novoBanco();
  await criarGrupoComDois(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });
  assert.ok(colega.equipe.ehEquipe("Core L2") && colega.equipe.ehEquipe("Core L3"));
  assert.ok(!colega.editor.projetos["Rascunho"]);
  assert.equal(colega.equipe.papel("Core L2"), "editar");
  assert.equal(colega.equipe.papel("Core L3"), "ver");
  assert.ok(colega.avisos.some(a => /2 diagramas liberados/.test(a)));

  await colega.editarProjeto("Core L2", "EDITADO");
  assert.equal(nomeEm(projetoNoBanco(banco, "Core L2").dados), "EDITADO", "onde edita, grava");
  await colega.editarProjeto("Core L3", "NAO PODE");
  assert.equal(nomeEm(projetoNoBanco(banco, "Core L3").dados), "L3", "onde só vê, não grava");
  assert.ok(!colega.avisoAberto(), "sem aviso de conflito");
  assert.equal((banco.linhas.u2 && banco.linhas.u2.projects || {})["Core L3"], undefined, "também não vira projeto pessoal");
});

test("a dona ajusta o acesso pessoa por pessoa: tirar, só ver ou editar", async () => {
  const banco = novoBanco();
  const dona = await criarGrupoComDois(banco);
  await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });

  const acessos = await dona.equipe.acessosDoGrupo(dona.equipe.grupo("Core L2"));
  assert.equal(acessos.length, 1);
  assert.equal(acessos[0].email, OUTRA.email);
  assert.deepEqual({ ...acessos[0].papeis }, { "Core L2": "editar", "Core L3": "ver" });

  await dona.equipe.definirAcesso("Core L2", OUTRA.id, "nenhum");
  await dona.equipe.definirAcesso("Core L3", OUTRA.id, "editar");
  const depois = await abrirAba(banco, { equipe: true, usuario: OUTRA });
  assert.ok(!depois.equipe.ehEquipe("Core L2"), "sem acesso: o diagrama some");
  assert.equal(depois.equipe.papel("Core L3"), "editar");
  await depois.editarProjeto("Core L3", "AGORA PODE");
  assert.equal(nomeEm(projetoNoBanco(banco, "Core L3").dados), "AGORA PODE");
});

test("se a dona muda para 'só ver' com a colega aberta, a gravação avisa em vez de dar conflito", async () => {
  const banco = novoBanco();
  const dona = await criarGrupoComDois(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });
  await dona.equipe.definirAcesso("Core L2", OUTRA.id, "ver");
  await colega.editarProjeto("Core L2", "DEPOIS");
  assert.equal(nomeEm(projetoNoBanco(banco, "Core L2").dados), "L2");
  assert.ok(!colega.avisoAberto(), "sem aviso de conflito");
  assert.ok(colega.avisos.some(a => /só pode visualizar/.test(a)));
  assert.equal(colega.equipe.papel("Core L2"), "ver");
  assert.equal(nomeEm(colega.editor.projetos["Core L2"]), "L2", "volta para a versão do servidor");
});

test("adicionar outro diagrama à equipe: quem já está recebe o acesso padrão", async () => {
  const banco = novoBanco();
  const dona = await criarGrupoComDois(banco);
  await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convitesGrupo[0].token });
  await dona.equipe.adicionarAoGrupo(dona.equipe.grupo("Core L2"), "Rascunho", "ver");
  await dona.auth.flush();
  assert.equal(banco.linha.projects["Rascunho"], undefined, "sai da lista pessoal");
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA });
  assert.equal(colega.equipe.papel("Rascunho"), "ver");
});

test("convite antigo (um diagrama, sem grupo) continua funcionando", async () => {
  const banco = novoBanco();
  await banco.rpc("grafo_criar_projeto_equipe", { p_nome: "Antigo", p_dados: { equipamentos: [{ id: "e", nome: "X" }], conexoes: [] } });
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convites[0].token });
  assert.ok(colega.equipe.ehEquipe("Antigo"));
  assert.equal(colega.equipe.papel("Antigo"), "editar");
  assert.ok(colega.avisos.some(a => /entrou no projeto/.test(a)));
});
