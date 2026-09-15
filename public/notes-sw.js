// No private responses are cached. The server is always the source of truth.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{data={};}
 const url=typeof data.url==='string'&&/^\/notes(?:\?|$)/.test(data.url)?data.url:'/notes';
 // If this installation is no longer signed in, do not display private payloads.
 let session;const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),1500);try{const r=await fetch('/api/notes/me',{credentials:'include',cache:'no-store',signal:controller.signal});if(r.ok)session=await r.json();else if(r.status===401){await self.registration.showNotification('Two Lovebugs ♡',{body:'Open your postbox to sign in.',tag:'signed-out',data:{url:'/notes'}});return;}}catch{}finally{clearTimeout(deadline);}
 if(session && data.account && session.user.id!==data.account){await self.registration.showNotification('Two Lovebugs ♡',{body:'Open your postbox to check your notes.',tag:'account-changed',data:{url:'/notes'}});return;}
 const options={body:session?(data.body||'A love note is waiting for you ♡'):'A love note is waiting for you ♡',icon:'/icon-192.png',badge:'/favicon.svg',tag:data.id||'love-note',renotify:false,data:{url}};
 await self.registration.showNotification(data.title||'Two Lovebugs ♡',options);
 try{if(self.navigator.setAppBadge){const n=session?.unread??data.unread??0;if(n)await self.navigator.setAppBadge(n);else await self.navigator.clearAppBadge();}}catch{}
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=new URL(event.notification.data?.url||'/notes',self.location.origin);if(url.origin!==self.location.origin)return;const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients){if(new URL(client.url).pathname.startsWith('/notes')){await client.navigate(url.href);await client.focus();return;}}await self.clients.openWindow(url.href);})());});
self.addEventListener('message',event=>{if(event.data?.type==='clear-private')event.waitUntil((async()=>{for(const n of await self.registration.getNotifications())n.close();if(self.navigator.clearAppBadge)await self.navigator.clearAppBadge();})());});
