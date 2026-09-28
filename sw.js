const CACHE='mahjong-coach-v17';
const FILES=['./','./index.html','./styles.css','./enhancements.css','./state.css?v=17','./engine.js?v=17','./tiles.js?v=17','./tiles.css?v=17','./table.css?v=17','./sound.js?v=17','./defense.js?v=17','./scoring.js?v=17','./app.js?v=17','./coach.js?v=17','./lessons.js?v=17','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mahjong-coach-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(async()=>{const c=await caches.open(CACHE);return await c.match(e.request)||new Response('離線時尚未快取此檔案',{status:503});}));
});
