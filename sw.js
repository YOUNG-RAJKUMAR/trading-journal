const CACHE = 'rk-journal-v1';
const ASSETS = [
    './',
    './index.html',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install — cache core assets
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {})
    );
    self.skipWaiting();
});

// Activate — remove old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — serve from cache, fallback to network
self.addEventListener('fetch', e => {
    // Skip non-GET and Firebase/API requests — always go to network for those
    if (e.request.method !== 'GET') return;
    const url = e.request.url;
    if (url.includes('firestore') || url.includes('firebase') ||
        url.includes('googleapis.com') || url.includes('groq.com') ||
        url.includes('openrouter.ai')) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(resp => {
                // Cache new successful responses
                if (resp && resp.status === 200 && resp.type !== 'opaque') {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return resp;
            }).catch(() => {
                // If offline and not cached, return index.html as fallback
                if (e.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
