const CACHE='mahjong-coach-v20';
const FILES=['./','./index.html','./styles.css','./enhancements.css','./state.css?v=20','./engine.js?v=20','./tiles.js?v=20','./tiles.css?v=20','./table.css?v=20','./sound.js?v=20','./defense.js?v=20','./scoring.js?v=20','./ai.js?v=20','./quiz.js?v=20','./stages.js?v=20','./app.js?v=20','./coach.js?v=20','./lessons.js?v=20','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mahjong-coach-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(async()=>{const c=await caches.open(CACHE);return await c.match(e.request)||new Response('離線時尚未快取此檔案',{status:503});}));
});
