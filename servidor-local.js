const express = require('express');
const fs = require('fs');
const path = require('path');

// Lê o .env (se existir) para rodar localmente sem precisar definir variáveis
// no terminal. Variáveis já definidas no ambiente têm prioridade.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((linha) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m || linha.trim().startsWith('#')) return;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const apiPath = path.join(rootDir, 'data', 'equipamentos.json');

app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'grafo-io', time: new Date().toISOString() });
});

app.get('/api/auth-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    return res.status(503).json({ error: 'Autenticação ainda não configurada.' });
  }
  res.json({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY });
});

app.get('/api/equipamentos', (_req, res) => {
  fs.readFile(apiPath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).json({ error: 'Não foi possível ler o catálogo de equipamentos.' });
      return;
    }

    try {
      const json = JSON.parse(data);
      res.json(json);
    } catch (parseError) {
      res.status(500).json({ error: 'Arquivo de equipamentos inválido.' });
    }
  });
});

app.get('/api/equipamentos.json', (_req, res) => {
  res.sendFile(apiPath);
});

app.use(express.static(rootDir, {
  index: 'index.html',
  extensions: ['html']
}));

app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
