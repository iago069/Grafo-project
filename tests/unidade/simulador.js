// Navegador simulado para testar assets/js/conta/auth.js (e equipe.js) sem o Supabase
// de verdade. Usado pelos arquivos *.test.js desta pasta (este não é um teste).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ler = nome => fs.readFileSync(path.join(__dirname, "..", "..", "assets", "js", nome), "utf8");
const codigoAuth = ler("conta/auth.js");
const codigoEquipe = ler("recursos/equipe.js");
const USUARIO = { id: "u1", email: "teste@exemplo.com" };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const copia = v => JSON.parse(JSON.stringify(v));

// Banco falso. grafo_user_data: uma linha por conta (banco.linha é a de u1),
// com o filtro .eq() do PostgREST. Tabelas de equipe com as mesmas regras de
// acesso do SQL (só membros veem; só o dono exclui e gerencia convites) e aviso
// de alteração em tempo real. banco.semFuncao / banco.semEquipe simulam o SQL
// ainda não instalado.
function novoBanco() {
  const banco = {
    linhas: {}, semFuncao: false, semEquipe: false, contaExcluida: false,
    projetos: [], membros: [], convites: [], grupos: [], convitesGrupo: [], canais: [], seq: 0
  };
  Object.defineProperty(banco, "linha", {
    get: () => banco.linhas.u1 || null,
    set: v => { if (v) banco.linhas.u1 = v; else delete banco.linhas.u1; }
  });
  const ehMembro = (projeto, uid) => banco.membros.some(m => m.projeto === projeto && m.usuario === uid);
  const ehDono = (projeto, uid) => banco.projetos.some(p => p.id === projeto && p.dono === uid);
  const podeEditar = (projeto, uid) => banco.membros.some(m => m.projeto === projeto && m.usuario === uid && m.papel !== "ver");
  const ehDonoGrupo = (grupo, uid) => banco.grupos.some(g => g.id === grupo && g.dono === uid);
  const avisarCanais = (tipo, id) => banco.canais.forEach(c => {
    if (tipo === "DELETE" || ehMembro(id, c.uid)) setTimeout(() => c.fn({ eventType: tipo, new: { id }, old: { id } }), 5);
  });
  const faltaTabela = t => ({ data: null, error: { code: "PGRST205", message: "Could not find the table public." + t } });

  function executarConta(q, uid) {
    const conta = (q.filtros.find(f => f[0] === "user_id") || [])[1] || (q.campos && q.campos.user_id) || uid;
    const linha = banco.linhas[conta] || null;
    const confere = () => linha && q.filtros.every(([c, v]) => linha[c] === v);
    if (banco.contaExcluida && q.op !== "select") return { data: null, error: { code: "23503", message: "usuário não existe" } };
    if (q.op === "insert") {
      if (linha) return { data: null, error: { code: "23505", message: "duplicate key" } };
      banco.linhas[conta] = { ...q.campos };
      return { data: [{ updated_at: q.campos.updated_at }], error: null };
    }
    if (q.op === "update") {
      if (!confere()) return { data: [], error: null };
      Object.assign(linha, q.campos);
      return { data: [{ updated_at: linha.updated_at }], error: null };
    }
    const dados = confere() ? copia(linha) : null;
    return { data: q.unico ? dados : [dados], error: null };
  }

  function executarEquipe(q, uid) {
    if (banco.semEquipe) return faltaTabela(q.tabela);
    if (banco.falhaEquipe) return { data: null, error: { code: "XX000", message: "falha de rede" } };
    const passa = linha => q.filtros.every(([c, v, op]) => (op === "in" ? v.includes(linha[c]) : linha[c] === v));
    const lista = q.tabela === "grafo_projetos_equipe" ? banco.projetos : q.tabela === "grafo_membros" ? banco.membros
      : q.tabela === "grafo_convites_grupo" ? banco.convitesGrupo : banco.convites;
    const visivel = q.tabela === "grafo_projetos_equipe" ? l => (q.op === "update" ? podeEditar(l.id, uid) : ehMembro(l.id, uid))
      : q.tabela === "grafo_membros" ? l => ehMembro(l.projeto, uid)
      : q.tabela === "grafo_convites_grupo" ? l => ehDonoGrupo(l.grupo, uid) : l => ehDono(l.projeto, uid);
    const alvo = lista.filter(l => visivel(l) && passa(l));
    if (q.op === "update") {
      alvo.forEach(l => { Object.assign(l, q.campos); if (q.tabela === "grafo_projetos_equipe") { l.atualizado_por = uid; avisarCanais("UPDATE", l.id); } });
      return { data: copia(alvo), error: null };
    }
    if (q.op === "delete") {
      const pode = l => q.tabela === "grafo_projetos_equipe" ? l.dono === uid
        : q.tabela === "grafo_membros" ? (l.usuario === uid && !ehDono(l.projeto, uid)) || (ehDono(l.projeto, uid) && l.usuario !== uid)
        : q.tabela === "grafo_convites_grupo" ? ehDonoGrupo(l.grupo, uid) : ehDono(l.projeto, uid);
      const sai = alvo.filter(pode);
      sai.forEach(l => lista.splice(lista.indexOf(l), 1));
      if (q.tabela === "grafo_projetos_equipe") sai.forEach(l => {
        banco.membros = banco.membros.filter(m => m.projeto !== l.id);
        banco.convites = banco.convites.filter(c => c.projeto !== l.id);
        avisarCanais("DELETE", l.id);
      });
      return { data: null, error: null };
    }
    if (q.op === "upsert" && q.tabela === "grafo_convites_grupo") {
      if (!ehDonoGrupo(q.campos.grupo, uid)) return { data: null, error: { code: "42501", message: "permission denied" } };
      banco.convitesGrupo = banco.convitesGrupo.filter(c => c.grupo !== q.campos.grupo).concat([{ ...q.campos }]);
      return { data: null, error: null };
    }
    if (q.op === "upsert") {
      if (!ehDono(q.campos.projeto, uid)) return { data: null, error: { code: "42501", message: "permission denied" } };
      banco.convites = banco.convites.filter(c => c.projeto !== q.campos.projeto).concat([{ ...q.campos }]);
      return { data: null, error: null };
    }
    const dados = copia(alvo);
    return { data: q.unico ? dados[0] || null : dados, error: null };
  }

  function construtor(tabela, uid) {
    const q = { tabela, op: "select", filtros: [] };
    const equipe = tabela !== "grafo_user_data";
    const b = {
      select: () => b, order: () => b, single: () => b,
      eq: (c, v) => { q.filtros.push([c, v]); return b; },
      in: (c, v) => { q.filtros.push([c, v, "in"]); return b; },
      update: campos => { q.op = "update"; q.campos = campos; return b; },
      insert: campos => { q.op = "insert"; q.campos = campos; return b; },
      upsert: campos => { q.op = "upsert"; q.campos = campos; return b; },
      delete: () => { q.op = "delete"; return b; },
      maybeSingle: () => { q.unico = true; return b; },
      then: (ok, erro) => Promise.resolve(equipe ? executarEquipe(q, uid) : executarConta(q, uid)).then(ok, erro)
    };
    return b;
  }

  function rpc(nome, args, conta) {
    const uid = conta.id;
    if (nome === "excluir_minha_conta") {
      if (banco.semFuncao) return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nome } };
      delete banco.linhas[uid];
      banco.contaExcluida = true;
      return { data: null, error: null };
    }
    if (banco.semEquipe) return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nome } };
    if (nome === "grafo_criar_projeto_equipe") {
      const id = "p" + (++banco.seq), em = new Date().toISOString();
      banco.projetos.push({ id, dono: uid, nome: args.p_nome, dados: copia(args.p_dados), atualizado_em: em, atualizado_por: uid });
      banco.membros.push({ projeto: id, usuario: uid, email: conta.email, entrou_em: em });
      banco.convites.push({ projeto: id, token: "00000000-0000-4000-8000-00000000000" + banco.seq });
      return { data: [{ id, atualizado_em: em }], error: null };
    }
    if (nome === "grafo_aceitar_convite") {
      const c = banco.convites.find(x => x.token === args.p_token);
      if (!c) return { data: [], error: null };
      if (!ehMembro(c.projeto, uid)) banco.membros.push({ projeto: c.projeto, usuario: uid, email: conta.email, entrou_em: new Date().toISOString() });
      const p = banco.projetos.find(x => x.id === c.projeto);
      return { data: [copia({ id: p.id, nome: p.nome, dados: p.dados, dono: p.dono, atualizado_em: p.atualizado_em })], error: null };
    }
    if (banco.semGrupos) return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nome } };
    if (nome === "grafo_criar_grupo") {
      const grupo = "g" + (++banco.seq), em = new Date().toISOString();
      banco.grupos.push({ id: grupo, dono: uid, nome: args.p_nome });
      banco.convitesGrupo.push({ grupo, token: "11111111-1111-4111-8111-1111111111" + String(banco.seq).padStart(2, "0") });
      const saida = args.p_projetos.map(it => {
        const id = "p" + (++banco.seq);
        banco.projetos.push({ id, dono: uid, nome: it.nome, dados: copia(it.dados), atualizado_em: em, atualizado_por: uid, grupo, papel_padrao: it.papel === "ver" ? "ver" : "editar" });
        banco.membros.push({ projeto: id, usuario: uid, email: conta.email, papel: "editar", entrou_em: em });
        return { grupo, nome: it.nome, id, atualizado_em: em };
      });
      return { data: saida, error: null };
    }
    if (nome === "grafo_aceitar_convite_grupo") {
      const c = banco.convitesGrupo.find(x => x.token === args.p_token);
      if (!c) return { data: [], error: null };
      const doGrupo = banco.projetos.filter(p => p.grupo === c.grupo);
      doGrupo.forEach(p => { if (!ehMembro(p.id, uid)) banco.membros.push({ projeto: p.id, usuario: uid, email: conta.email, papel: p.papel_padrao, entrou_em: new Date().toISOString() }); });
      return { data: doGrupo.map(p => ({ id: p.id, nome: p.nome, dono: p.dono })), error: null };
    }
    if (nome === "grafo_definir_acesso") {
      const p = banco.projetos.find(x => x.id === args.p_projeto && x.dono === uid);
      if (!p || !p.grupo) return { data: null, error: { code: "P0001", message: "Só o dono do grupo muda os acessos." } };
      if (args.p_usuario === uid) return { data: null, error: { code: "P0001", message: "O dono sempre edita." } };
      banco.membros = banco.membros.filter(m => !(m.projeto === p.id && m.usuario === args.p_usuario));
      if (args.p_papel !== "nenhum") {
        const outro = banco.membros.find(m => m.usuario === args.p_usuario && banco.projetos.some(x => x.id === m.projeto && x.grupo === p.grupo));
        banco.membros.push({ projeto: p.id, usuario: args.p_usuario, email: outro ? outro.email : null, papel: args.p_papel, entrou_em: new Date().toISOString() });
      }
      return { data: null, error: null };
    }
    if (nome === "grafo_agrupar") {
      const grupo = "g" + (++banco.seq), em = new Date().toISOString();
      banco.grupos.push({ id: grupo, dono: uid, nome: args.p_nome });
      banco.convitesGrupo.push({ grupo, token: "22222222-2222-4222-8222-2222222222" + String(banco.seq).padStart(2, "0") });
      const saida = [];
      for (const it of args.p_existentes) {
        const p = banco.projetos.find(x => x.id === it.id && x.dono === uid && !x.grupo);
        if (!p) return { data: null, error: { code: "P0001", message: "Projeto de equipe inválido." } };
        p.grupo = grupo; p.papel_padrao = it.papel;
        saida.push({ grupo, nome: p.nome, id: p.id, atualizado_em: p.atualizado_em, novo: false });
      }
      for (const it of args.p_novos) {
        const id = "p" + (++banco.seq);
        const pessoas = new Map();
        banco.membros.filter(m => banco.projetos.some(x => x.id === m.projeto && x.grupo === grupo)).forEach(m => pessoas.set(m.usuario, m.email));
        pessoas.set(uid, conta.email);
        banco.projetos.push({ id, dono: uid, nome: it.nome, dados: copia(it.dados), atualizado_em: em, atualizado_por: uid, grupo, papel_padrao: it.papel });
        pessoas.forEach((email, u) => banco.membros.push({ projeto: id, usuario: u, email, papel: u === uid ? "editar" : it.papel, entrou_em: em }));
        saida.push({ grupo, nome: it.nome, id, atualizado_em: em, novo: true });
      }
      return { data: saida, error: null };
    }
    if (nome === "grafo_adicionar_ao_grupo") {
      if (!ehDonoGrupo(args.p_grupo, uid)) return { data: null, error: { code: "P0001", message: "Só o dono mexe no grupo." } };
      const id = "p" + (++banco.seq), em = new Date().toISOString();
      banco.projetos.push({ id, dono: uid, nome: args.p_nome, dados: copia(args.p_dados), atualizado_em: em, atualizado_por: uid, grupo: args.p_grupo, papel_padrao: args.p_papel });
      const pessoas = new Map();
      banco.membros.filter(m => banco.projetos.some(x => x.id === m.projeto && x.grupo === args.p_grupo)).forEach(m => pessoas.set(m.usuario, m.email));
      pessoas.forEach((email, u) => banco.membros.push({ projeto: id, usuario: u, email, papel: u === uid ? "editar" : args.p_papel, entrou_em: em }));
      return { data: [{ id, atualizado_em: em }], error: null };
    }
    return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nome } };
  }

  banco.cliente = conta => ({
    from: tabela => construtor(tabela, conta.id),
    rpc: async (nome, args) => rpc(nome, args || {}, conta),
    channel: () => {
      const canal = {
        on: (_tipo, _filtro, fn) => { banco.canais.push({ uid: conta.id, fn }); return canal; },
        subscribe: () => canal
      };
      return canal;
    }
  });
  // Compatibilidade com os testes que usam banco.from / banco.rpc direto.
  banco.from = tabela => construtor(tabela || "grafo_user_data", USUARIO.id);
  banco.rpc = async (nome, args) => rpc(nome, args || {}, USUARIO);
  return banco;
}

const COMECAM_ESCONDIDOS = ["conflitoModal", "contaModal", "equipeModal"];

function elemento(id) {
  const ouvintes = {};
  const classes = new Set(COMECAM_ESCONDIDOS.includes(id) ? ["hidden"] : []);
  const atributos = {};
  return {
    id, textContent: "", hidden: false, disabled: false, value: "", innerHTML: "",
    setAttribute: (nome, valor) => { atributos[nome] = String(valor); },
    getAttribute: nome => (nome in atributos ? atributos[nome] : null),
    removeAttribute: nome => { delete atributos[nome]; },
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, sim) => (sim ? classes.add(c) : classes.delete(c))
    },
    parentElement: { querySelector: () => ({ hidden: false }) },
    querySelectorAll: () => [],
    addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    disparar(tipo, evento) {
      return Promise.all((ouvintes[tipo] || []).map(fn => fn.call(this, Object.assign({ preventDefault() {}, target: this }, evento))));
    },
    appendChild() {}, focus() {}, click() {}, remove() {}, select() {}
  };
}

// opcoes.equipe: carrega também equipe.js e um editor simulado (window.GrafoApp).
// opcoes.usuario: outra conta (padrão u1). opcoes.busca: location.search inicial.
// opcoes.semSessao: ninguém logado. opcoes.armazenamento: localStorage inicial.
async function abrirAba(banco, opcoes) {
  opcoes = opcoes || {};
  const conta = opcoes.usuario || USUARIO;
  const els = {};
  const ouvintesJanela = {};
  const armazenamento = Object.assign({}, opcoes.armazenamento || {});
  const avisos = [];
  let recarregou = false, navegouPara = null, saiu = false;
  const document = {
    visibilityState: "visible",
    activeElement: null,
    getElementById: id => els[id] || (els[id] = elemento(id)),
    querySelectorAll: () => [],
    documentElement: elemento("html"),
    createElement: () => elemento("criado"),
    addEventListener() {},
    body: {
      classList: elemento("body").classList,
      appendChild: el => { if (el.onload) setTimeout(el.onload, 0); }
    }
  };
  // Editor simulado: guarda os projetos como o app.js guardaria.
  const editor = { projetos: {}, atual: null };
  const window = {
    addEventListener: (tipo, fn) => { (ouvintesJanela[tipo] = ouvintesJanela[tipo] || []).push(fn); },
    confirm: () => true,
    supabase: {
      createClient: () => Object.assign(banco.cliente(conta), {
        auth: {
          onAuthStateChange() {},
          getSession: async () => ({ data: { session: opcoes.semSessao ? null : { user: conta } }, error: null }),
          signOut: async () => { saiu = true; return { error: null }; },
          signUp: async dados => { (banco.cadastros = banco.cadastros || []).push(copia(dados)); return { data: { session: null }, error: null }; },
          updateUser: async dados => {
            conta.user_metadata = Object.assign({}, conta.user_metadata, dados.data);
            return { data: { user: conta }, error: null };
          }
        }
      })
    },
    GrafoApp: {
      projetoAtual: () => editor.atual,
      dadosProjeto: nome => editor.projetos[nome] ? copia(editor.projetos[nome]) : null,
      substituirProjeto: (nome, dados) => { editor.projetos[nome] = copia(dados); },
      removerProjeto: nome => {
        delete editor.projetos[nome];
        if (editor.atual === nome) editor.atual = Object.keys(editor.projetos)[0] || null;
        window.GrafoAuth.scheduleSave(editor.projetos, editor.atual);
      },
      avisar: texto => avisos.push(texto),
      salvar: () => window.GrafoAuth.scheduleSave(editor.projetos, editor.atual),
      atualizarListaProjetos() {},
      nomesProjetos: () => Object.keys(editor.projetos)
    }
  };
  const URLComBlob = class extends URL {};
  URLComBlob.createObjectURL = () => "blob:";
  URLComBlob.revokeObjectURL = () => {};
  const busca = opcoes.busca || "";
  const ctx = {
    window, document, console, setTimeout, clearTimeout, URLSearchParams,
    location: {
      search: busca, hash: "", pathname: "/", origin: "http://localhost", href: "http://localhost/" + busca,
      reload: () => { recarregou = true; },
      replace: url => { navegouPara = url; }
    },
    history: { replaceState() {} },
    localStorage: {
      getItem: k => (k in armazenamento ? armazenamento[k] : null),
      setItem: (k, v) => { armazenamento[k] = String(v); },
      removeItem: k => { delete armazenamento[k]; }
    },
    fetch: async () => ({ ok: true, json: async () => ({ url: "http://supabase", key: "chave" }) }),
    URL: URLComBlob,
    Blob: function () {},
    navigator: {}
  };
  ctx.crypto = { randomUUID: () => require("crypto").randomUUID() };
  vm.createContext(ctx);
  if (opcoes.equipe) {
    ctx.window.crypto = ctx.crypto;
    vm.runInContext(codigoEquipe, ctx);
  }
  vm.runInContext(codigoAuth, ctx);
  // Espera o editor abrir (auth.js preenche a conta, ou "Sem login", no fim) ou o login falhar.
  for (let i = 0; i < 100; i++) {
    await esperar(10);
    const aberto = (els.accountEmail && els.accountEmail.textContent) || (els.sidebarUsuarioNome && els.sidebarUsuarioNome.textContent);
    const falhou = els.authMessage && els.authMessage.classList.contains("error");
    if (aberto || falhou) break;
  }
  await esperar(10);
  // O editor abre com o que auth.js deixou no navegador.
  editor.projetos = JSON.parse(armazenamento["grafo-projetos:" + conta.id] || "{}");
  editor.atual = armazenamento["grafo-projeto-atual:" + conta.id] || Object.keys(editor.projetos)[0] || null;
  return {
    auth: window.GrafoAuth,
    equipe: window.GrafoEquipe,
    editor,
    avisos,
    els,
    armazenamento,
    get recarregou() { return recarregou; },
    get navegouPara() { return navegouPara; },
    get endereco() { return ctx.location.href; },
    get saiu() { return saiu; },
    avisoAberto: () => !els.conflitoModal.classList.contains("hidden"),
    status: () => els.cloudStatus.textContent,
    editar: async nome => {
      window.GrafoAuth.scheduleSave({ "Projeto principal": { equipamentos: [{ id: "e", nome }], conexoes: [] } }, "Projeto principal");
      await window.GrafoAuth.flush().catch(() => {});
    },
    // Edita um projeto do editor simulado (pessoal ou de equipe) e salva.
    editarProjeto: async (chave, nome) => {
      editor.projetos[chave] = { equipamentos: [{ id: "e", nome }], conexoes: [] };
      editor.atual = chave;
      window.GrafoAuth.scheduleSave(editor.projetos, editor.atual);
      await window.GrafoAuth.flush().catch(() => {});
    },
    voltarParaAba: async () => { (ouvintesJanela.focus || []).forEach(fn => fn()); await esperar(10); }
  };
}

module.exports = { novoBanco, abrirAba, esperar, USUARIO };
