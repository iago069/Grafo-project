module.exports = function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  // trim: valores colados no painel/CLI costumam vir com espaço ou quebra de linha.
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !key) {
    return response.status(503).json({ error: 'Autenticação ainda não configurada.' });
  }
  return response.status(200).json({ url, key });
};
