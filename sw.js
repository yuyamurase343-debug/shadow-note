// オフライン用キャッシュ
const VERSION = 'sn-v1';
const SHELL = ['./', 'index.html', 'app.js', 'pron.js', 'worker.js', 'cmudict.txt', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sn-') && k !== VERSION && k !== VERSION + '-ext').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('huggingface.co') || url.hostname.endsWith('hf.co')) return; // モデルはライブラリ側でキャッシュ
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    // 自分のファイル：まずネットから（更新を反映）、だめならキャッシュ
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION + '-ext').then(c => c.put(req, cp)); return r; })));
  }
});
