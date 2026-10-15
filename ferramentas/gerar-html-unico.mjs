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

function semImport(codigo, modulo) {
  const padrao = new RegExp(`import\\s*\\{[\\s\\S]*?\\}\\s*from\\s*'\\./${modulo.replace('.', '\\.')}';\\n`);
  if (!padrao.test(codigo)) throw new Error(`Import de ${modulo} não encontrado em app.js`);
  return codigo.replace(padrao, '');
}

const appSemImport = semImport(semImport(ler('js/app.js'), 'calculos.js'), 'mensagens.js');

// Os módulos viram um só script: os "export" deixam de ser necessários.
const semExport = (arquivo) => ler(arquivo).replace(/^export /gm, '');
const codigo = `${semExport('js/calculos.js')}\n${semExport('js/mensagens.js')}\n${appSemImport}`;

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
