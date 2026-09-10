// A minimal service worker: it exists so love-note notifications can be shown
// and clicked. Nothing is cached — the arcade is always live.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const page = pages.find(client => new URL(client.url).origin === self.location.origin);
    if (page) {
      await page.focus();
      page.postMessage({ type: 'open-chat' });
      return;
    }
    await self.clients.openWindow('/');
  })());
});
