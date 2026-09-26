// Fonte única do catálogo: o mesmo JSON servido pelo server.js.
// Fica fora de api/ porque a Vercel trata cada arquivo ali como rota, e
// equipamentos.js + equipamentos.json colidiriam em /api/equipamentos.
const catalogo = require('../data/equipamentos.json');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json(catalogo);
    return;
  }

  res.status(405).json({ erro: 'Método não permitido.' });
};
