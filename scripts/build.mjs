// Build the deployable Worker.
//
// Everything in public/ is embedded in the Worker bundle, the server and shared rules
// modules are bundled into a single script, and the
// Three.js scene is bundled separately so it stays a lazy import. Assets are
// discovered from the folder rather than listed here, so adding a file to
// public/ is all it takes to ship it.

import { build } from 'esbuild';
import { builtinModules } from 'node:module';
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

const WORKER_RUNTIME = `
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.lovebugs.world" && (request.method === "GET" || request.method === "HEAD")) {
      url.hostname = "lovebugs.world";
      return Response.redirect(url.href, 308);
    }
    const path = url.pathname;
    if (path.startsWith("/api/notes") || path.startsWith("/api/auth/")) return notesApi(request,env,ctx);
    if (path.startsWith("/api/")) return api(request, env);

    const asset = assets[path === "/" ? "/index.html" : (path === "/notes" || path.startsWith("/notes/")) ? "/notes.html" : path];
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(asset.base64 ? decode(asset.base64) : asset.body, {
      headers: {
        "Content-Type": asset.type,
        "Cache-Control": asset.base64 ? "public, max-age=86400" : "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  async scheduled(event,env,ctx) { ctx.waitUntil(dispatchNotes(env)); },
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

await build({
  stdin:{contents:`import {api} from './server/api.mjs';\nimport {notesApi} from './server/notes-api.mjs';\nimport {dispatchNotes} from './server/notes-push.mjs';\nconst assets=${JSON.stringify(assets)};\n${WORKER_RUNTIME}`,resolveDir:process.cwd(),sourcefile:'worker-entry.mjs'},
  bundle:true,format:'esm',platform:'node',target:'es2022',minify:true,
  // Convert CommonJS built-in requires to static ESM imports for workerd.
  plugins:[{name:'worker-node-builtins',setup(builder){
    builder.onResolve({filter:/.*/},args=> {
      if(args.kind==='require-call' && builtinModules.includes(args.path.replace(/^node:/,''))) return {path:args.path.replace(/^node:/,''),namespace:'node-shim'};
    });
    builder.onLoad({filter:/.*/,namespace:'node-shim'},args=>({contents:`import * as builtin from 'node:${args.path}'; module.exports = builtin;`,loader:'js'}));
  }}],
  outfile:'dist/server/index.js',external:['cloudflare:*'],
});

writeFileSync('dist/.openai/hosting.json', JSON.stringify(manifest));
cpSync('drizzle', 'dist/.openai/drizzle', { recursive: true });

const bytes = readFileSync('dist/server/index.js').length;
console.log(`Worker built: ${Object.keys(assets).length} assets, ${(bytes / 1024).toFixed(0)} KB, plus D1 migrations.`);
