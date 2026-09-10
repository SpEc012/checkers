# Put our little arcade on lovebugs.world 🐞

The complete source is in [SpEc012/checkers](https://github.com/SpEc012/checkers). Keep the domain registered at **Namecheap**; use your own **Cloudflare** account to run the app, database, and photo storage. You do not need a Namecheap shared-hosting package for this setup.

| What | Where it lives |
| --- | --- |
| Domain registration and renewal | Your Namecheap account |
| DNS and HTTPS | Your Cloudflare account |
| Website, multiplayer API, game rules | Cloudflare Worker named `lovebugs` |
| Rooms, messages, scores | D1 database `lovebugs-rooms` |
| Uploaded puzzle photos | R2 bucket `lovebugs-photos` |
| Complete editable source and deployment workflow | GitHub `SpEc012/checkers` |
| Separate test copy | Existing ChatGPT Site, unchanged address |

The two deployments have separate data. Use the same address on both players' devices. Test-site rooms and pictures do not transfer automatically. The app's requests and photo URLs are relative to its current host; lovebugs.world will not call the ChatGPT backend. Google Fonts remains an optional external font source, with local fallback fonts.

## 1. Add the domain to Cloudflare

Create or sign into your Cloudflare account and add `lovebugs.world` as a domain. Follow the domain setup, review imported DNS records, and copy the two nameservers Cloudflare assigns specifically to you.

In **Namecheap → Domain List → Manage lovebugs.world → Nameservers**, choose **Custom DNS**, paste those two nameservers, and save. Keep any existing email records (MX/TXT) in Cloudflare. If DNSSEC is already enabled, follow Cloudflare's nameserver-change instructions before switching. Wait until Cloudflare marks the domain Active; DNS changes may take up to 24 hours or occasionally longer. The registration stays at Namecheap. [Namecheap instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/).

Do not set a GitHub Pages custom domain or point a CNAME at the ChatGPT site. The full game will run on your Worker.

## 2. Get the code on your computer

Install **Node.js 22 or newer** and **Git**. On Windows, open PowerShell or Windows Terminal. Run each line separately:

```sh
git clone https://github.com/SpEc012/checkers.git
cd checkers
npm ci
npx wrangler login
```

A browser opens for Cloudflare sign-in. Select the account containing lovebugs.world. If PowerShell blocks `npm.ps1`, use `npm.cmd` and `npx.cmd` instead of changing your security policy.

Already cloned it? Open that folder, run `git pull` and `npm ci`, then continue. Preserve your local edits if Git reports a conflict.

## 3. Create your database and photo bucket

```sh
npx wrangler d1 create lovebugs-rooms
npx wrangler r2 bucket create lovebugs-photos
```

Copy the **database_id** printed by the first command. Cloudflare may ask you to enable R2 in its dashboard. Check the plans and usage limits in your account; this guide does not assume unlimited free usage.

If those resources already exist, use their existing IDs rather than creating duplicates. You can find the database ID in Cloudflare's D1 dashboard.

## 4. Generate the configuration and deploy

Replace `YOUR_DATABASE_ID` below with the real UUID. When the domain is Active:

```sh
npm run setup:self -- --database-id YOUR_DATABASE_ID --domain
npm run deploy:self
```

The first command creates your ignored `wrangler.selfhost.json` with both `lovebugs.world` and `www.lovebugs.world` configured. The second builds the app, applies database migrations, then deploys the Worker. Cloudflare custom domains configure DNS and HTTPS for the Worker. Existing CNAME records for those exact hostnames must be resolved before attaching them. [Cloudflare custom-domain instructions](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

**DNS still pending?** Omit `--domain` for the first deployment to use the printed workers.dev address. Once DNS is Active, regenerate with `--domain --overwrite` and deploy again. Only use `--overwrite` if you're ready to replace the local configuration.

Open `https://lovebugs.world`. The `www` version redirects to the root address, preserving the path and invitation fragment in normal browser navigation. Your original test site is unaffected.

## 5. Try a full date

1. Open lovebugs.world on two devices. Create an Online date with a room password and have the other person join.
2. Confirm each player can move only their own pieces. Send a message and a reaction.
3. Try RPS: both pick secretly, the fists bounce three times, then choices reveal. Win three rounds for the match celebration.
4. Upload a photo to Photo Puzzle. Both players should see it. Try a harder cut and agree to the change.
5. Try a local game, reload an online room in the same tab, and check the mobile Game/Chat/Room tabs.
6. Enable notification permissions again on this new address. Closed or suspended tabs do not receive reliable chat alerts.

## 6. Publish future updates from GitHub

The included **Deploy lovebugs.world** workflow runs manually, so test-site changes do not automatically replace the version Audrey uses.

After the first successful local deployment, create a Cloudflare API token using its **Edit Cloudflare Workers** template, scoped to your account and lovebugs.world zone. Ensure the token also allows the D1 migrations and R2 bindings used by this project (D1 Edit and Workers R2 Storage Edit); keep the template's deployment and route permissions. Store credentials in GitHub secrets, never in source. [Cloudflare's GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

In **GitHub → SpEc012/checkers → Settings → Secrets and variables → Actions**, add:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | The token you created |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| Variable | `CLOUDFLARE_D1_ID` | Your lovebugs-rooms database UUID |

Go to **Actions → Deploy lovebugs.world → Run workflow**, select `main`, then run. It installs dependencies, runs the game tests, generates your domain configuration, applies migrations, and deploys. A red workflow means deployment needs attention; read the failed step before retrying. The workflow uses environment `lovebugs-production`, where you can optionally configure GitHub's deployment controls.

You can also update from your computer:

```sh
git pull
npm ci
npm test
npm run deploy:self
```

Your computer's existing `wrangler.selfhost.json` is retained. Neither method modifies the ChatGPT test host. Publishing that test copy remains a separate operation.

## 7. Keep it running

- Keep domain renewal enabled at Namecheap. Maintain your Cloudflare account and any required billing method.
- For an app error, inspect the Worker logs in Cloudflare or run `npx wrangler tail --config wrangler.selfhost.json` locally. Do not share logs containing player/session secrets.
- Database backup: `npx wrangler d1 export DB --remote --output lovebugs-backup.sql --config wrangler.selfhost.json`. Keep the backup private; it contains room data. This does not back up R2 photos. Export any photos you want to preserve separately through your account's R2 tools.
- To undo a code update, revert its commit on GitHub and rerun the workflow. Do not blindly roll back database migrations; current updates preserve the existing schema.
- Old rooms expire from access, but expiry is not automatic physical cleanup of stored records or abandoned photos. Explicitly leaving a room removes its current photo. Review storage usage periodically.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Namecheap parking page | Cloudflare nameservers are saved and the domain is Active; allow DNS propagation |
| Domain attachment fails | The zone is in the same Cloudflare account and conflicting hostname CNAME records are resolved |
| Online rooms unavailable | `DB` binding points to the correct database; migrations completed |
| Photo uploads unavailable | R2 is enabled and binding `BUCKET` points to lovebugs-photos |
| Deployment says unauthorized | Re-run `npx wrangler login` locally, or check the GitHub token scope and expiry |
| Config already exists | Keep it, edit it, or intentionally regenerate using `--overwrite` |
| Partner cannot find room | Both players must use lovebugs.world and the host must remain connected |
| Notifications are missing | Enable them on this domain, interact to unlock sound, and keep the page open |

The GitHub Pages workflow is only an entry page. Once lovebugs.world works, you can replace its play link with your domain or disable that workflow. Do not delete the separate ChatGPT Site if you still want the test address.
