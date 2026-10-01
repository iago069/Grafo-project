// Rotas da pasta api/ (funções da Vercel).
const { test } = require("node:test");
const assert = require("node:assert/strict");

function resposta() {
  const r = { statusCode: null, headers: {}, body: undefined, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = code => { r.statusCode = code; return r; };
  r.json = body => { r.body = body; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

test("/api/equipamentos devolve o catálogo no GET e recusa outros métodos", () => {
  const handler = require("../../api/equipamentos.js");
  const catalogo = require("../../data/equipamentos.json");
  const get = resposta();
  handler({ method: "GET" }, get);
  assert.equal(get.statusCode, 200);
  assert.deepEqual(get.body, catalogo);
  assert.equal(get.headers["access-control-allow-origin"], "*");

  const post = resposta();
  handler({ method: "POST" }, post);
  assert.equal(post.statusCode, 405);
});

test("/api/auth-config só responde com as variáveis configuradas", () => {
  const handler = require("../../api/auth-config.js");
  const antes = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const vazio = resposta();
    handler({}, vazio);
    assert.equal(vazio.statusCode, 503);

    process.env.SUPABASE_URL = " https://exemplo.supabase.co/ \n";
    process.env.SUPABASE_PUBLISHABLE_KEY = " chave\n";
    const ok = resposta();
    handler({}, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body, { url: "https://exemplo.supabase.co", key: "chave" });
    assert.equal(ok.headers["cache-control"], "no-store");
  } finally {
    for (const [k, v] of [["SUPABASE_URL", antes.url], ["SUPABASE_PUBLISHABLE_KEY", antes.key]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
