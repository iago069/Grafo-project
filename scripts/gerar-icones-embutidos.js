// Gera assets/js/icones-embutidos.js com os ícones de assets/images em base64.
//
// A exportação PNG/SVG precisa das imagens como data: URL. Quando o app é
// aberto direto do disco (file://), o navegador bloqueia a leitura dos
// arquivos de imagem via fetch e o PNG sairia sem os ícones; um <script>
// continua podendo ser carregado, então os ícones vão embutidos nele.
//
// Rode de novo (npm run icones) sempre que adicionar ou trocar uma imagem.

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pastaImagens = path.join(raiz, 'assets', 'images');
const destino = path.join(raiz, 'assets', 'js', 'icones-embutidos.js');
const IGNORAR = new Set(['grafo.png', 'favicon-64.png', 'apple-touch-icon.png']); // logo/ícones do app, não de equipamento
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const icones = {};
for (const arquivo of fs.readdirSync(pastaImagens).sort()) {
  const tipo = TIPOS[path.extname(arquivo).toLowerCase()];
  if (!tipo || IGNORAR.has(arquivo)) continue;
  const base64 = fs.readFileSync(path.join(pastaImagens, arquivo)).toString('base64');
  icones[arquivo] = 'data:' + tipo + ';base64,' + base64;
}

const conteudo =
  '// Gerado por scripts/gerar-icones-embutidos.js — não edite à mão (npm run icones).\n' +
  'window.ICONES_EMBUTIDOS = ' + JSON.stringify(icones, null, 1) + ';\n';
fs.writeFileSync(destino, conteudo);
console.log('Gerado ' + path.relative(raiz, destino) + ' com ' + Object.keys(icones).length + ' ícone(s): ' + Object.keys(icones).join(', '));
