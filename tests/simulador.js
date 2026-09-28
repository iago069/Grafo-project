// Navegador simulado para testar assets/js/auth.js sem o Supabase de verdade.
// Usado pelos arquivos *.test.js desta pasta (este não é um teste).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const codigo = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "auth.js"), "utf8");
const USUARIO = { id: "u1", email: "teste@exemplo.com" };
const esperar = ms => new Promise(r => setTimeout(r, ms));

// Banco falso: uma linha em grafo_user_data, com o filtro .eq() do PostgREST,
// e a função excluir_minha_conta (banco.semFuncao simula o SQL não instalado).
function novoBanco() {
  const banco = { linha: null, semFuncao: false, contaExcluida: false };
  function executar(q) {
    const confere = () => banco.linha && q.filtros.every(([c, v]) => banco.linha[c] === v);
    if (banco.contaExcluida && q.op !== "select") return { data: null, error: { code: "23503", message: "usuário não existe" } };
    if (q.op === "insert") {
      if (banco.linha) return { data: null, error: { code: "23505", message: "duplicate key" } };
      banco.linha = { ...q.campos };
      return { data: [{ updated_at: banco.linha.updated_at }], error: null };
    }
    if (q.op === "update") {
      if (!confere()) return { data: [], error: null };
      Object.assign(banco.linha, q.campos);
      return { data: [{ updated_at: banco.linha.updated_at }], error: null };
    }
    const dados = confere() ? JSON.parse(JSON.stringify(banco.linha)) : null;
    return { data: q.unico ? dados : [dados], error: null };
  }
  banco.from = () => {
    const q = { op: "select", filtros: [] };
    const b = {
      select: () => b,
      eq: (c, v) => { q.filtros.push([c, v]); return b; },
      update: campos => { q.op = "update"; q.campos = campos; return b; },
      insert: campos => { q.op = "insert"; q.campos = campos; return b; },
      maybeSingle: () => { q.unico = true; return b; },
      then: (ok, erro) => Promise.resolve(executar(q)).then(ok, erro)
    };
    return b;
  };
  banco.rpc = async nome => {
    if (nome !== "excluir_minha_conta" || banco.semFuncao) {
      return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nome } };
    }
    banco.linha = null;
    banco.contaExcluida = true;
    return { data: null, error: null };
  };
  return banco;
}

const COMECAM_ESCONDIDOS = ["conflitoModal", "contaModal"];

function elemento(id) {
  const ouvintes = {};
  const classes = new Set(COMECAM_ESCONDIDOS.includes(id) ? ["hidden"] : []);
  return {
    id, textContent: "", hidden: false, disabled: false, value: "",
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
    focus() {}, click() {}, remove() {}
  };
}

async function abrirAba(banco) {
  const els = {};
  const ouvintesJanela = {};
  const armazenamento = {};
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
  const window = {
    addEventListener: (tipo, fn) => { (ouvintesJanela[tipo] = ouvintesJanela[tipo] || []).push(fn); },
    confirm: () => false,
    supabase: {
      createClient: () => ({
        from: banco.from,
        rpc: banco.rpc,
        auth: {
          onAuthStateChange() {},
          getSession: async () => ({ data: { session: { user: USUARIO } }, error: null }),
          signOut: async () => { saiu = true; return { error: null }; }
        }
      })
    }
  };
  const ctx = {
    window, document, console, setTimeout, clearTimeout, URLSearchParams,
    location: {
      search: "", hash: "", pathname: "/", origin: "http://localhost",
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
    URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
    Blob: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  await esperar(20);
  return {
    auth: window.GrafoAuth,
    els,
    armazenamento,
    get recarregou() { return recarregou; },
    get navegouPara() { return navegouPara; },
    get saiu() { return saiu; },
    avisoAberto: () => !els.conflitoModal.classList.contains("hidden"),
    status: () => els.cloudStatus.textContent,
    editar: async nome => {
      window.GrafoAuth.scheduleSave({ "Projeto principal": { equipamentos: [{ id: "e", nome }], conexoes: [] } }, "Projeto principal");
      await window.GrafoAuth.flush().catch(() => {});
    },
    voltarParaAba: async () => { (ouvintesJanela.focus || []).forEach(fn => fn()); await esperar(10); }
  };
}

module.exports = { novoBanco, abrirAba, esperar, USUARIO };
