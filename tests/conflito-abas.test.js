// Duas abas (ou computadores) da mesma conta salvando no mesmo banco:
// assets/js/auth.js roda num navegador simulado, com um Supabase falso.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { novoBanco, abrirAba, esperar } = require("./simulador");

const nomeNoBanco = banco => banco.linha.projects["Projeto principal"].equipamentos[0].nome;

test("a aba desatualizada não sobrescreve o que outra aba salvou", async () => {
  const banco = novoBanco();
  const A = await abrirAba(banco);
  const B = await abrirAba(banco);
  await A.editar("A1");
  assert.equal(nomeNoBanco(banco), "A1");
  assert.equal(A.status(), "Salvo na nuvem");

  await B.editar("B1");
  assert.ok(B.avisoAberto(), "B deveria ver o aviso");
  assert.equal(nomeNoBanco(banco), "A1");
  assert.equal(B.status(), "Alterado em outro lugar");
});

test("com o aviso aberto nada é enviado; \"Manter a desta aba\" grava a última edição", async () => {
  const banco = novoBanco();
  const A = await abrirAba(banco);
  const B = await abrirAba(banco);
  await A.editar("A1");
  await B.editar("B1");
  await B.editar("B2");
  await esperar(900);
  assert.equal(nomeNoBanco(banco), "A1");

  await B.els.conflitoManter.disparar("click");
  assert.ok(!B.avisoAberto());
  assert.equal(nomeNoBanco(banco), "B2");
  assert.equal(B.status(), "Salvo na nuvem");
});

test("ao voltar para a aba, avisa se outra aba salvou; \"Carregar a mais recente\" recarrega", async () => {
  const banco = novoBanco();
  const A = await abrirAba(banco);
  await A.editar("A1");
  const B = await abrirAba(banco);
  await B.editar("B1");

  await A.voltarParaAba();
  assert.ok(A.avisoAberto(), "A deveria ser avisada antes de editar");
  await A.els.conflitoRecarregar.disparar("click");
  assert.ok(A.recarregou);
});

test("uma aba sozinha salva várias vezes sem aviso", async () => {
  const banco = novoBanco();
  const A = await abrirAba(banco);
  for (const nome of ["1", "2", "3"]) await A.editar(nome);
  assert.equal(nomeNoBanco(banco), "3");
  await A.voltarParaAba();
  assert.ok(!A.avisoAberto());
});

test("aba aberta depois da gravação carrega a versão atual e salva normalmente", async () => {
  const banco = novoBanco();
  const A = await abrirAba(banco);
  await A.editar("A1");
  const C = await abrirAba(banco);
  await C.editar("C1");
  assert.equal(nomeNoBanco(banco), "C1");
  assert.ok(!C.avisoAberto());
});
