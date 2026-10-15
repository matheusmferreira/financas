// Gera dist/financas.html: um arquivo só, com CSS e JS embutidos, para abrir direto no celular Android
// sem publicar em lugar nenhum. É saída de build — editar sempre os arquivos-fonte e rodar de novo:
//   node ferramentas/gerar-html-unico.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(raiz, arquivo), 'utf8');

function substituir(texto, procurado, novo) {
  if (!texto.includes(procurado)) throw new Error(`Trecho não encontrado no build: ${procurado}`);
  return texto.replace(procurado, () => novo);
}

const importDosCalculos = /import\s*\{[\s\S]*?\}\s*from\s*'\.\/calculos\.js';\n/;
const appSemImport = ler('js/app.js').replace(importDosCalculos, '');
if (appSemImport === ler('js/app.js')) throw new Error('Import de calculos.js não encontrado em app.js');

// Os dois módulos viram um só script: os "export" deixam de ser necessários.
const calculosSemExport = ler('js/calculos.js').replace(/^export /gm, '');
const codigo = `${calculosSemExport}\n${appSemImport}`;

const iconeEmDataUri = `data:image/svg+xml,${encodeURIComponent(ler('icones/icone.svg').trim())}`;

let html = ler('index.html');
html = substituir(html, '  <link rel="manifest" href="manifest.webmanifest">\n', '');
html = substituir(html, '  <link rel="apple-touch-icon" href="icones/icone-192.png">\n', '');
html = substituir(html, 'href="icones/icone.svg"', `href="${iconeEmDataUri}"`);
html = substituir(html, '<link rel="stylesheet" href="css/estilo.css">', `<style>\n${ler('css/estilo.css')}</style>`);
html = substituir(html, '<script type="module" src="js/app.js"></script>', `<script type="module">\n${codigo}</script>`);

mkdirSync(path.join(raiz, 'dist'), { recursive: true });
writeFileSync(path.join(raiz, 'dist', 'financas.html'), html);
console.log(`dist/financas.html gerado (${Math.round(html.length / 1024)} KB)`);
