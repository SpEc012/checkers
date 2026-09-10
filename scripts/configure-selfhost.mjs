// Writes the private wrangler.selfhost.json used to deploy lovebugs.world.
//
//   npm run setup:self -- --database-id YOUR_UUID     first time
//   npm run setup:self -- --database-id YOUR_UUID --domain --overwrite
//
// In CI the database id comes from the CLOUDFLARE_D1_ID variable instead of
// the flag. The file is gitignored: it names your own Cloudflare resources.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUTPUT = 'wrangler.selfhost.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
};

/** Stop with a readable message rather than a stack trace. */
function fail(lines) {
  console.error(Array.isArray(lines) ? lines.join('\n') : lines);
  process.exit(1);
}

const databaseId = flag('--database-id') || process.env.CLOUDFLARE_D1_ID || '';

if (!UUID.test(databaseId)) {
  const what = databaseId ? `"${databaseId}" is not a database id.` : 'No database id was supplied.';
  fail([
    what,
    '',
    'It is the UUID of your D1 database. To find it:',
    '  npx wrangler d1 list          (or the D1 page in the Cloudflare dashboard)',
    'To create one, if you have not yet:',
    '  npx wrangler d1 create lovebugs-rooms',
    '',
    'Then pass it in:',
    '  locally:  npm run setup:self -- --database-id YOUR_UUID',
    '  from CI:  set CLOUDFLARE_D1_ID under GitHub → Settings → Secrets and',
    '            variables → Actions → Variables (repository, or the',
    '            lovebugs-production environment).',
  ]);
}

if (existsSync(OUTPUT) && !args.includes('--overwrite')) {
  fail(`${OUTPUT} already exists. Keep it, or pass --overwrite to replace it.`);
}

const config = JSON.parse(readFileSync('wrangler.example.json', 'utf8'));
config.name = 'lovebugs';
config.d1_databases[0].database_id = databaseId;
config.d1_databases[0].database_name = 'lovebugs-rooms';
config.r2_buckets[0].bucket_name = 'lovebugs-photos';

// Only attach the custom domains once DNS is active in Cloudflare; without
// --domain the deploy lands on the workers.dev address instead.
if (args.includes('--domain')) {
  config.routes = [
    { pattern: 'lovebugs.world', custom_domain: true },
    { pattern: 'www.lovebugs.world', custom_domain: true },
  ];
}

writeFileSync(OUTPUT, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Created ${OUTPUT}. ${config.routes
  ? 'Includes lovebugs.world and www.lovebugs.world.'
  : 'Deploy first on workers.dev; attach your domain after DNS is ready.'}`);
