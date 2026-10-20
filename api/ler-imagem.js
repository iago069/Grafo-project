// Lê um print ou foto (tabela do Grafana/NetBox, tela do equipamento, foto de
// rack com etiquetas) com o Claude e devolve as portas no formato do leitor do
// Grafo (assets/js/recursos/leitor.js). Só para quem está logado no Grafo.
//
// Variáveis de ambiente na Vercel: ANTHROPIC_API_KEY (a chave fica só aqui, nunca
// no navegador), SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (já usadas pelo login).
const AnthropicSdk = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSdk.default || AnthropicSdk.Anthropic || AnthropicSdk;

const MODELO = 'claude-opus-5-5';
const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BASE64 = 6 * 1024 * 1024; // ~4,5 MB de imagem (o navegador já reduz antes)

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['portas', 'notas'],
  properties: {
    portas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['porta', 'velocidade', 'descricao', 'lag', 'vizinho', 'portaVizinho', 'status'],
        properties: {
          porta: { type: 'string', description: 'Nome da interface, como aparece (ex.: xe-0/0/27, et-0/0/48, ae14, ge-1/1/3, gi0/1).' },
          velocidade: { type: 'string', description: 'Ex.: 10G, 40G, 100G, 1G. Vazio se não aparece.' },
          descricao: { type: 'string', description: 'Descrição da interface. Se a descrição for só "aeN", deixe vazio e preencha lag.' },
          lag: { type: 'string', description: 'LAG da qual a porta faz parte (ex.: ae7). Vazio se não faz parte.' },
          vizinho: { type: 'string', description: 'Equipamento do outro lado, só se aparecer escrito (LLDP, NetBox, etiqueta). Nunca invente.' },
          portaVizinho: { type: 'string', description: 'Porta do outro lado, só se aparecer escrita. Nunca invente.' },
          status: { type: 'string', enum: ['online', 'offline', ''] }
        }
      }
    },
    notas: { type: 'array', items: { type: 'string' }, description: 'Observações curtas: o que não deu para ler, avisos.' }
  }
};

const SISTEMA = [
  'Você extrai portas de rede de imagens para montar um diagrama de topologia.',
  'A imagem pode ser: tabela de interfaces do Grafana, tabela de interfaces do NetBox, saída de comando de switch/roteador (Juniper, Datacom, Huawei, MikroTik), ou foto de equipamento/rack com etiquetas.',
  'Regras:',
  '- Uma entrada por interface física e uma por LAG (aeN) que aparecer.',
  '- Porta cuja descrição é só "aeN" faz parte da LAG aeN: coloque em lag, descricao vazia.',
  '- A descrição da LAG (linha aeN) diz para onde o grupo vai.',
  '- Copie nomes e descrições exatamente como estão, sem traduzir nem corrigir.',
  '- vizinho e portaVizinho só quando estiverem escritos na imagem. Se não aparecer, deixe vazio. Nunca deduza.',
  '- Ignore subinterfaces (com ponto, ex.: et-0/0/7.1766) e linhas de cabeçalho.',
  '- Se não houver portas legíveis, devolva portas vazio e explique em notas.'
].join('\n');

async function usuarioLogado(token) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const chave = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !chave || !token) return false;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: chave, Authorization: 'Bearer ' + token } });
    return r.ok;
  } catch (e) {
    return false;
  }
}

function lerCorpo(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let dados = '';
    request.on('data', parte => { dados += parte; if (dados.length > MAX_BASE64 + 100000) reject(new Error('grande')); });
    request.on('end', () => { try { resolve(JSON.parse(dados || '{}')); } catch (e) { reject(e); } });
    request.on('error', reject);
  });
}

function pedido(conteudo) {
  return {
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    messages: [{ role: 'user', content: conteudo }]
  };
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  if (!(process.env.ANTHROPIC_API_KEY || '').trim()) {
    return response.status(503).json({ error: 'A leitura de imagens ainda não está ativada (falta ANTHROPIC_API_KEY na Vercel).' });
  }
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await usuarioLogado(token))) return response.status(401).json({ error: 'Entre na sua conta do Grafo para ler imagens.' });

  let corpo;
  try { corpo = await lerCorpo(request); } catch (e) { return response.status(413).json({ error: 'Imagem grande demais.' }); }
  const imagem = String(corpo.imagem || '');
  const tipo = String(corpo.tipo || '');
  const texto = String(corpo.texto || '').slice(0, 20000);
  if (!imagem || !TIPOS_IMAGEM.includes(tipo)) return response.status(400).json({ error: 'Envie uma imagem PNG, JPG, WEBP ou GIF.' });
  if (imagem.length > MAX_BASE64) return response.status(413).json({ error: 'Imagem grande demais.' });

  const conteudo = [
    { type: 'image', source: { type: 'base64', media_type: tipo, data: imagem } },
    { type: 'text', text: 'Equipamento destas portas: ' + String(corpo.nome || 'não informado').slice(0, 60) + '.' + (texto ? '\nTexto colado junto (use também):\n' + texto : '') }
  ];

  const client = new Anthropic();
  try {
    let resposta;
    try {
      // Se o modelo recusar por segurança, o próprio servidor tenta outro modelo.
      resposta = await client.beta.messages.create(Object.assign(pedido(conteudo), {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      }));
    } catch (erro) {
      if (!(erro instanceof Anthropic.BadRequestError)) throw erro;
      resposta = await client.messages.create(pedido(conteudo));
    }
    if (resposta.stop_reason === 'refusal') return response.status(422).json({ error: 'O modelo não leu esta imagem. Tente outro print.' });
    if (resposta.stop_reason === 'max_tokens') return response.status(422).json({ error: 'A imagem tem portas demais. Divida em prints menores.' });
    const bloco = (resposta.content || []).find(b => b.type === 'text');
    let dados;
    try { dados = JSON.parse(bloco ? bloco.text : ''); } catch (e) { return response.status(502).json({ error: 'Resposta inesperada do modelo. Tente de novo.' }); }
    return response.status(200).json({ portas: Array.isArray(dados.portas) ? dados.portas.slice(0, 400) : [], notas: Array.isArray(dados.notas) ? dados.notas.slice(0, 20) : [] });
  } catch (erro) {
    if (erro instanceof Anthropic.RateLimitError) return response.status(429).json({ error: 'Muitas leituras agora. Espere um pouco e tente de novo.' });
    if (erro instanceof Anthropic.AuthenticationError) return response.status(503).json({ error: 'A chave da API do Claude na Vercel é inválida.' });
    if (erro instanceof Anthropic.APIError) return response.status(502).json({ error: 'Falha ao falar com o Claude (' + erro.status + ').' });
    console.error('ler-imagem:', erro);
    return response.status(500).json({ error: 'Não foi possível ler a imagem.' });
  }
};
