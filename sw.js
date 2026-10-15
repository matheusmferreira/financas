// Guarda os arquivos do app no celular para abrir sem internet.
// Ao publicar uma nova versão, aumente o número em VERSAO para os celulares baixarem os arquivos novos.
const VERSAO = 'financas-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'css/estilo.css',
  'js/app.js',
  'js/calculos.js',
  'manifest.webmanifest',
  'icones/icone.svg',
  'icones/icone-192.png',
  'icones/icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((nome) => nome !== VERSAO).map((nome) => caches.delete(nome)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(caches.match(evento.request).then((resposta) => resposta ?? fetch(evento.request)));
});
