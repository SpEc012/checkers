// A local preview server: `npm run dev`.
//
// Serves public/ straight from disk and bundles the Three.js scene on request,
// so the arcade can be opened in a browser without a full build. Online rooms
// need the Worker and D1, so /api/ answers 503 here — Side by side works fully.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { build } from 'esbuild';

const ROOT = new URL('../public/', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/** Bundle the scene once per run so `import 'three'` resolves in the browser. */
let scenePromise = null;
function bundleScene() {
  scenePromise ??= build({
    entryPoints: [join(ROOT, 'rps-scene.mjs')],
    bundle: true,
    format: 'esm',
    write: false,
  }).then(result => result.outputFiles[0].text);
  return scenePromise;
}

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const send = (status, type, body) => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
  };

  if (path.startsWith('/api/')) {
    send(503, 'application/json', JSON.stringify({ error: 'Online rooms need the Worker. Run npm run build and deploy.' }));
    return;
  }

  if (path === '/rps-scene.mjs') {
    try {
      send(200, TYPES['.mjs'], await bundleScene());
    } catch (error) {
      send(500, 'text/plain', `Could not bundle the scene: ${error.message}`);
    }
    return;
  }

  const file = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  if (file.includes('..')) {
    send(403, 'text/plain', 'Nope.');
    return;
  }
  try {
    send(200, TYPES[extname(file)] || 'application/octet-stream', await readFile(join(ROOT, file)));
  } catch {
    send(404, 'text/plain', 'Not found');
  }
}).listen(PORT, () => {
  console.log(`Our Little Arcade → http://localhost:${PORT}  (Side by side works; online rooms need the Worker)`);
});
