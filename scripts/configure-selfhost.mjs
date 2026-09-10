import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const args=process.argv.slice(2),get=(flag)=>{const i=args.indexOf(flag);return i<0?null:args[i+1]};
const id=(get('--database-id')||process.env.CLOUDFLARE_D1_ID||'').trim();
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')){
  console.error('Missing or invalid D1 database UUID. In GitHub: Settings > Secrets and variables > Actions, set CLOUDFLARE_D1_ID to the database UUID from Cloudflare D1 > lovebugs-rooms. A repository variable or secret is accepted. Alternatively paste it into the database_id field when starting a NEW Deploy lovebugs.world workflow run. Locally use: npm run setup:self -- --database-id YOUR_UUID');
  process.exit(1);
}
const file='wrangler.selfhost.json';if(existsSync(file)&&!args.includes('--overwrite'))throw new Error('Config already exists. Keep it, or pass --overwrite to replace it.');
const config=JSON.parse(readFileSync('wrangler.example.json','utf8'));config.name='lovebugs';config.d1_databases[0].database_id=id;config.d1_databases[0].database_name='lovebugs-rooms';config.r2_buckets[0].bucket_name='lovebugs-photos';
if(args.includes('--domain'))config.routes=[{pattern:'lovebugs.world',custom_domain:true},{pattern:'www.lovebugs.world',custom_domain:true}];
writeFileSync(file,JSON.stringify(config,null,2)+'\n');console.log('Created '+file+'. '+(config.routes?'Includes lovebugs.world and www.lovebugs.world.':'Deploy first on workers.dev; attach your domain after DNS is ready.'));
