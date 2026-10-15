// Guarda os arquivos do app no celular para abrir sem internet.
// Ao publicar uma nova versão, aumente o número em VERSAO para os celulares baixarem os arquivos novos.
const VERSAO = 'financas-v3';
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

// Rede primeiro: com internet sempre abre a versão publicada mais nova (e atualiza a cópia guardada);
// sem internet usa a cópia. Cache primeiro fazia cada atualização só aparecer na segunda abertura.
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request)),
  );
});
