// Uso sem login, cadastro com nome e o nome da conta (assets/js/auth.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { novoBanco, abrirAba } = require("./simulador");

const projeto = nome => ({ equipamentos: [{ id: "e1", nome }], conexoes: [] });
const pessoa = (extra) => Object.assign({ id: "u9", email: "iago@exemplo.com", user_metadata: {} }, extra);

test("sem login: o editor abre sem conta e nada vai para a nuvem", async () => {
  const banco = novoBanco();
  const aba = await abrirAba(banco, { semSessao: true, armazenamento: { "grafo-modo": "convidado" } });
  assert.equal(aba.auth.logado(), false);
  assert.equal(aba.els.sidebarUsuarioNome.textContent, "Sem login");
  assert.match(aba.els.sidebarUsuarioDetalhe.textContent, /só neste navegador/);
  assert.equal(aba.els.btnEntrarConvidado.hidden, false);
  assert.equal(aba.auth.storageKey("grafo-projetos"), "grafo-projetos:convidado");
  aba.auth.scheduleSave({ "Meu POP": projeto("SW") }, "Meu POP");
  await aba.auth.flush();
  assert.equal(banco.linha, null, "nada pode ser gravado no servidor");
});

test("sem login: compartilhar, histórico e equipe aparecem, mas pedem login", async () => {
  const aba = await abrirAba(novoBanco(), { semSessao: true, armazenamento: { "grafo-modo": "convidado" } });
  for (const id of ["btnCompartilhar", "btnHistorico", "btnEquipe"]) {
    assert.equal(aba.els[id].hidden, false, id + " visível");
    assert.ok(aba.els[id].classList.contains("requer-login"), id + " marcado");
  }
  await aba.els.btnHistorico.disparar("click");
  assert.ok(!aba.els.loginNecessarioModal.classList.contains("hidden"), "aviso de login aberto");
  assert.match(aba.els.loginNecessarioTexto.textContent, /guardar e restaurar versões/);
  await aba.els.loginNecessarioCriar.disparar("click");
  assert.match(aba.endereco, /\?criar-conta=1$/, "Criar conta leva ao formulário de cadastro");
});

test("sem a escolha de usar sem login, quem não tem sessão fica na página inicial", async () => {
  const aba = await abrirAba(novoBanco(), { semSessao: true });
  assert.equal(aba.els.sidebarUsuarioNome && aba.els.sidebarUsuarioNome.textContent || "", "");
  assert.equal(aba.auth.logado(), false);
});

test("ao entrar, os projetos feitos sem login vão para a conta (nome repetido ganha (2))", async () => {
  const banco = novoBanco();
  banco.linhas.u9 = { user_id: "u9", projects: { "Meu POP": projeto("JÁ-NA-CONTA") }, current_project: "Meu POP", updated_at: "2026-09-30T10:00:00.000Z" };
  const aba = await abrirAba(banco, {
    usuario: pessoa(),
    armazenamento: { "grafo-modo": "convidado", "grafo-projetos:convidado": JSON.stringify({ "Meu POP": projeto("FEITO-SEM-LOGIN"), "Rede nova": projeto("RB") }) }
  });
  const projetos = banco.linhas.u9.projects;
  assert.equal(projetos["Meu POP"].equipamentos[0].nome, "JÁ-NA-CONTA", "o da conta continua");
  assert.equal(projetos["Meu POP (2)"].equipamentos[0].nome, "FEITO-SEM-LOGIN", "o de sem login entra com (2)");
  assert.ok(projetos["Rede nova"]);
  assert.equal(aba.armazenamento["grafo-projetos:convidado"], undefined, "a cópia sem login sai depois de salva");
  assert.equal(aba.armazenamento["grafo-modo"], undefined, "entrou: não abre mais sem login");
  assert.equal(aba.auth.logado(), true);
});

test("o nome da conta aparece no botão (com o e-mail à parte) e em destaque na barra lateral", async () => {
  const aba = await abrirAba(novoBanco(), { usuario: pessoa({ user_metadata: { nome: "Iago Ariel Barbosa" } }) });
  assert.equal(aba.els.accountEmail.textContent, "Iago Ariel Barbosa");
  assert.equal(aba.els.accountEmail.getAttribute("data-email"), "iago@exemplo.com");
  assert.equal(aba.els.sidebarUsuarioNome.textContent, "Iago");
  assert.equal(aba.els.sidebarUsuarioDetalhe.textContent, "Iago Ariel Barbosa · iago@exemplo.com");
  assert.equal(aba.els.sidebarUsuarioInicial.textContent, "I");
  assert.equal(aba.auth.nome(), "Iago Ariel Barbosa");
});

test("conta sem nome: mostra o começo do e-mail e o nome pode ser salvo em Minha conta", async () => {
  const aba = await abrirAba(novoBanco(), { usuario: pessoa() });
  assert.equal(aba.els.sidebarUsuarioNome.textContent, "iago");
  assert.match(aba.els.sidebarUsuarioDetalhe.textContent, /Adicione seu nome/);
  await aba.els.accountOpen.disparar("click");
  aba.els.contaNome.value = "  Iago   Barbosa ";
  aba.els.contaNomeForm.querySelector = () => ({ disabled: false });
  await aba.els.contaNomeForm.disparar("submit");
  assert.equal(aba.els.contaNomeMensagem.textContent, "Nome salvo.");
  assert.equal(aba.els.accountEmail.textContent, "Iago Barbosa");
  assert.equal(aba.els.sidebarUsuarioNome.textContent, "Iago");
});

test("criar conta pede nome e a mesma senha duas vezes", async () => {
  const banco = novoBanco();
  const aba = await abrirAba(banco, { semSessao: true });
  await aba.els.authToggle.disparar("click");
  assert.equal(aba.els.authNome.hidden, false, "campo Nome no cadastro");
  assert.equal(aba.els.authRepetir.hidden, false, "campo Repetir senha no cadastro");
  aba.els.authNome.value = "Ana";
  aba.els.authEmail.value = "ana@exemplo.com";
  aba.els.authPassword.value = "segredo1";
  aba.els.authRepetir.value = "segredo2";
  await aba.els.authForm.disparar("submit");
  assert.match(aba.els.authMessage.textContent, /não são iguais/);
  assert.equal(banco.cadastros, undefined, "não cadastra com senhas diferentes");
  aba.els.authNome.value = " ";
  aba.els.authRepetir.value = "segredo1";
  await aba.els.authForm.disparar("submit");
  assert.match(aba.els.authMessage.textContent, /Digite seu nome/);
  aba.els.authNome.value = "  Ana   Souza ";
  await aba.els.authForm.disparar("submit");
  assert.equal(banco.cadastros.length, 1);
  assert.deepEqual(banco.cadastros[0].options.data, { nome: "Ana Souza", full_name: "Ana Souza" });
  assert.match(aba.els.authMessage.textContent, /Confirme o e-mail/);
  await aba.els.authBack.disparar("click");
  assert.equal(aba.els.authNome.hidden, true, "login não pede nome");
  assert.equal(aba.els.authRepetir.hidden, true, "login não pede repetir senha");
});
