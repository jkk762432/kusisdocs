/**
 * 서비스 워커 — 오프라인에서도 앱이 열리도록 화면 파일을 보관합니다.
 * - 우리 사이트 파일: 네트워크 우선 (온라인이면 항상 최신, 끊기면 보관본)
 * - 글꼴·Firebase 프로그램(CDN): 보관본 우선 + 뒤에서 갱신
 * - Firebase 데이터 통신(로그인·DB)은 건드리지 않음
 * 파일 목록을 바꾸면 VERSION 을 올려 주세요.
 */
const VERSION = 'v1.0.0';
const CACHE = `gakbu-${VERSION}`;
const SHELL = [
    '/', '/index.html', '/view/', '/view/index.html',
    '/src/home/main.js', '/src/home/style.css',
    '/src/viewer/main.js', '/src/viewer/app.js', '/src/viewer/style.css',
    '/src/shared/pwa.js', '/src/shared/fb.js', '/src/shared/firebase-config.js', '/src/shared/rules.js',
    '/emblem.png', '/manifest.webmanifest', '/view/manifest.webmanifest',
    '/icons/icon-192.png', '/icons/view-192.png'
];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com\/firebasejs)\//;

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gakbu-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === location.origin) {
        e.respondWith(fetch(req).then(res => {
            if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
            return res;
        }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match(url.pathname.startsWith('/view') ? '/view/' : '/') : undefined))));
    } else if (CDN.test(req.url)) {
        e.respondWith(caches.open(CACHE).then(async c => {
            const hit = await c.match(req);
            const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
            return hit || net;
        }));
    }
});
