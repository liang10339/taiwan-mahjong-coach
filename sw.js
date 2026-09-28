const CACHE='mahjong-coach-v14';
const FILES=['./','./index.html','./styles.css','./enhancements.css','./state.css?v=14','./engine.js?v=14','./tiles.js?v=14','./tiles.css?v=14','./table.css?v=14','./sound.js?v=14','./defense.js?v=14','./app.js?v=14','./coach.js?v=14','./lessons.js?v=14','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mahjong-coach-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(async()=>{const c=await caches.open(CACHE);return await c.match(e.request)||new Response('離線時尚未快取此檔案',{status:503});}));
});
