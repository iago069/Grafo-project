const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const apiPath = path.join(rootDir, 'api', 'equipamentos.json');

app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'grafo-io', time: new Date().toISOString() });
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
