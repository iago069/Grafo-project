// Projetos de equipe (assets/js/recursos/equipe.js + auth.js): duas contas no mesmo banco.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { novoBanco, abrirAba, esperar, USUARIO } = require("./simulador");

const OUTRA = { id: "u2", email: "colega@exemplo.com" };
const nomeEm = dados => dados && dados.equipamentos[0] && dados.equipamentos[0].nome;
const projetoNoBanco = (banco, nome) => banco.projetos.find(p => p.nome === nome);

// Dona (u1) cria "Rede A" e transforma em projeto de equipe.
async function criarEquipe(banco) {
  const dona = await abrirAba(banco, { equipe: true });
  await dona.editarProjeto("Rede A", "A1");
  await dona.els.equipeTransformar.disparar("click");
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
  assert.equal(banco.convites.length, 1, "o link de convite já é criado");
});

test("quem entra pelo convite edita, e a dona recebe a alteração em tempo real", async () => {
  const banco = novoBanco();
  const dona = await criarEquipe(banco);
  const token = banco.convites[0].token;
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + token });
  assert.ok(colega.equipe.ehEquipe("Rede A"), "a colega deveria ter o projeto");
  assert.equal(colega.editor.atual, "Rede A", "o projeto do convite abre direto");
  assert.ok(colega.avisos.some(a => /entrou no projeto/.test(a)));

  await colega.editarProjeto("Rede A", "B1");
  assert.equal(nomeEm(projetoNoBanco(banco, "Rede A").dados), "B1");
  assert.equal((banco.linhas.u2 && banco.linhas.u2.projects || {})["Rede A"], undefined, "fica fora da lista pessoal da colega");

  await esperar(60);
  assert.equal(nomeEm(dona.editor.projetos["Rede A"]), "B1", "a dona deveria ver a alteração sem recarregar");
});

test("duas pessoas editando ao mesmo tempo: ninguém sobrescreve o outro sem aviso", async () => {
  const banco = novoBanco();
  const dona = await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convites[0].token });

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
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convites[0].token });
  assert.equal(await dona.equipe.excluirOuSair("Rede A"), true);
  assert.equal(banco.projetos.length, 0);
  await esperar(60);
  assert.equal(colega.editor.projetos["Rede A"], undefined);
  assert.ok(colega.avisos.some(a => /excluído pelo dono/.test(a)));
});

test("membro removido perde o projeto na próxima gravação", async () => {
  const banco = novoBanco();
  await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convites[0].token });
  banco.membros = banco.membros.filter(m => m.usuario !== OUTRA.id); // a dona removeu
  await colega.editarProjeto("Rede A", "DEPOIS");
  assert.equal(colega.editor.projetos["Rede A"], undefined);
  assert.ok(colega.avisos.some(a => /não faz mais parte/.test(a)));
  assert.notEqual(nomeEm(projetoNoBanco(banco, "Rede A").dados), "DEPOIS", "não pode gravar sem ser membro");
});

test("sair do projeto: o membro sai e a dona continua com ele", async () => {
  const banco = novoBanco();
  await criarEquipe(banco);
  const colega = await abrirAba(banco, { equipe: true, usuario: OUTRA, busca: "?convite=" + banco.convites[0].token });
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
