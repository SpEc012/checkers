// Generate once on your own machine. Never commit the output or paste it in chat.
import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import webpush from 'web-push';
const args=process.argv.slice(2),contact=args[args.indexOf('--contact')+1];
if(!args.includes('--contact') || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact||''))throw new Error('Use: npm run setup:notes -- --contact mailto:YOUR_EMAIL');
const file='.notes-secrets.json';
if(!existsSync(file)) {
 const pair=webpush.generateVAPIDKeys();
 writeFileSync(file,JSON.stringify({BETTER_AUTH_SECRET:randomBytes(48).toString('base64url'),VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:pair.privateKey,VAPID_SUBJECT:contact},null,2)+'\n',{mode:0o600});
 console.log('Generated .notes-secrets.json (gitignored). Back it up privately. Reuse these keys on future deployments.');
}else console.log('Keeping your existing .notes-secrets.json. Keys have not been changed.');
if(args.includes('--upload')) {
 if(!existsSync('wrangler.selfhost.json'))throw new Error('Run setup:self first so the secrets target the correct Worker.');
 const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['wrangler','secret','bulk',file,'--config','wrangler.selfhost.json'],{stdio:'inherit',shell:process.platform==='win32'});
 process.exitCode=result.status??1;
}else console.log('To upload to the configured Worker: npm run setup:notes -- --contact '+contact+' --upload');
