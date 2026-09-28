// "Minha conta" (LGPD): exclusão da conta pela própria pessoa (assets/js/auth.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { novoBanco, abrirAba, esperar, USUARIO } = require("./simulador");

async function abrirConta(banco) {
  const aba = await abrirAba(banco);
  await aba.els.accountOpen.disparar("click");
  return aba;
}
async function digitar(aba, texto) {
  aba.els.contaConfirmar.value = texto;
  await aba.els.contaConfirmar.disparar("input");
}

test("o botão de excluir só libera com o e-mail da conta (sem diferenciar maiúsculas)", async () => {
  const aba = await abrirConta(novoBanco());
  assert.ok(!aba.els.contaModal.classList.contains("hidden"), "a janela deveria abrir");
  assert.equal(aba.els.contaExcluir.disabled, true);
  await digitar(aba, "outro@exemplo.com");
  assert.equal(aba.els.contaExcluir.disabled, true);
  await digitar(aba, "  " + USUARIO.email.toUpperCase() + " ");
  assert.equal(aba.els.contaExcluir.disabled, false);
});

test("excluir apaga no servidor, limpa o navegador e volta ao login", async () => {
  const banco = novoBanco();
  const aba = await abrirConta(banco);
  await aba.editar("A1");
  assert.ok(banco.linha, "o projeto deveria estar salvo antes");
  aba.armazenamento["grafo-projetos:" + USUARIO.id] = "{}";
  aba.armazenamento["grafo-pagina:" + USUARIO.id] = "{}";
  aba.armazenamento["diagrama-tema"] = "dark";

  await digitar(aba, USUARIO.email);
  await aba.els.contaExcluirForm.disparar("submit");
  assert.equal(banco.contaExcluida, true);
  assert.equal(aba.navegouPara, "/?conta-excluida=1");
  assert.ok(aba.saiu, "a sessão local deveria ser encerrada");
  assert.equal(aba.armazenamento["grafo-projetos:" + USUARIO.id], undefined);
  assert.equal(aba.armazenamento["grafo-pagina:" + USUARIO.id], undefined);
  assert.equal(aba.armazenamento["diagrama-tema"], "dark", "preferências gerais do navegador ficam");
});

test("nada é salvo depois da exclusão, nem uma edição que estava pendente", async () => {
  const banco = novoBanco();
  const aba = await abrirConta(banco);
  await aba.editar("A1");
  aba.auth.scheduleSave({ "Projeto principal": { equipamentos: [{ id: "e", nome: "pendente" }], conexoes: [] } }, "Projeto principal");
  await digitar(aba, USUARIO.email);
  await aba.els.contaExcluirForm.disparar("submit");
  aba.auth.scheduleSave({ "Projeto principal": { equipamentos: [{ id: "e", nome: "depois" }], conexoes: [] } }, "Projeto principal");
  await esperar(1000);
  assert.equal(banco.linha, null);
  assert.notEqual(aba.status(), "Erro ao salvar");
});

test("sem a função no servidor, avisa e não sai da conta", async () => {
  const banco = novoBanco();
  banco.semFuncao = true;
  const aba = await abrirConta(banco);
  await digitar(aba, USUARIO.email);
  await aba.els.contaExcluirForm.disparar("submit");
  assert.equal(aba.navegouPara, null);
  assert.equal(aba.saiu, false);
  assert.match(aba.els.contaMensagem.textContent, /ainda não está ativada/);
  assert.equal(aba.els.contaExcluir.disabled, false, "pode tentar de novo depois");
});
