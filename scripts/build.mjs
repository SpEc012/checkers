// Build the deployable Worker.
//
// Everything in public/ is embedded in the Worker bundle, the shared rules
// modules are concatenated with server/api.mjs into a single script, and the
// Three.js scene is bundled separately so it stays a lazy import. Assets are
// discovered from the folder rather than listed here, so adding a file to
// public/ is all it takes to ship it.

import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';

const TYPES = {
  '.html': ['text/html; charset=utf-8', 'text'],
  '.css': ['text/css; charset=utf-8', 'text'],
  '.mjs': ['text/javascript; charset=utf-8', 'text'],
  '.js': ['text/javascript; charset=utf-8', 'text'],
  '.svg': ['image/svg+xml', 'text'],
  '.json': ['application/json; charset=utf-8', 'text'],
  '.webmanifest': ['application/manifest+json; charset=utf-8', 'text'],
  '.png': ['image/png', 'binary'],
  '.webp': ['image/webp', 'binary'],
  '.ico': ['image/x-icon', 'binary'],
};

// Bundled on its own, and never embedded twice.
const BUNDLED = 'rps-scene.mjs';

const extensionOf = file => file.slice(file.lastIndexOf('.'));

/** Read every asset in public/ into the map the Worker serves from. */
function collectAssets() {
  const assets = {};
  for (const file of readdirSync('public').sort()) {
    if (file === BUNDLED || file.startsWith('.')) continue;
    const type = TYPES[extensionOf(file)];
    if (!type) throw new Error(`No content type for public/${file}. Add one to scripts/build.mjs.`);
    const [contentType, encoding] = type;
    const raw = readFileSync(`public/${file}`);
    assets[`/${file}`] = encoding === 'binary'
      ? { base64: raw.toString('base64'), type: contentType }
      : { body: raw.toString('utf8'), type: contentType };
  }
  return assets;
}

/** Inline a module: drop its imports and export keywords so it can be concatenated. */
const inline = file => readFileSync(file, 'utf8')
  .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
  .replace(/^export\s+/gm, '');

const WORKER_RUNTIME = `
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.lovebugs.world" && (request.method === "GET" || request.method === "HEAD")) {
      url.hostname = "lovebugs.world";
      return Response.redirect(url.href, 308);
    }
    const path = url.pathname;
    if (path.startsWith("/api/")) return api(request, env);

    const asset = assets[path === "/" ? "/index.html" : path];
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(asset.base64 ? decode(asset.base64) : asset.body, {
      headers: {
        "Content-Type": asset.type,
        "Cache-Control": asset.base64 ? "public, max-age=86400" : "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
`;

const manifest = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });

const assets = collectAssets();
const scene = await build({
  entryPoints: [`public/${BUNDLED}`],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
});
assets[`/${BUNDLED}`] = { body: scene.outputFiles[0].text, type: TYPES['.mjs'][0] };

writeFileSync('dist/server/index.js', [
  inline('public/engine.mjs'),
  inline('public/arcade.mjs'),
  inline('server/api.mjs'),
  `const assets=${JSON.stringify(assets)};`,
  WORKER_RUNTIME,
].join('\n'));

writeFileSync('dist/.openai/hosting.json', JSON.stringify(manifest));
cpSync('drizzle', 'dist/.openai/drizzle', { recursive: true });

const bytes = readFileSync('dist/server/index.js').length;
console.log(`Worker built: ${Object.keys(assets).length} assets, ${(bytes / 1024).toFixed(0)} KB, plus D1 migrations.`);
