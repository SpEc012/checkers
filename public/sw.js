self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});const page=pages.find(c=>new URL(c.url).origin===self.location.origin);if(page){await page.focus();page.postMessage({type:'open-chat'});}else await self.clients.openWindow('/');})())});
