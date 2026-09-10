# Your own arcade address

GitHub contains the source. GitHub Pages cannot run the server that manages shared rooms, private player choices, chat, and photo uploads. The existing Pages workflow is a landing page linking to the current deployment.

Run the full app in **your own Cloudflare account** to get an address like `across-the-board.YOUR-SUBDOMAIN.workers.dev`, or attach a domain you own. No ChatGPT runtime is needed by this deployment.

## One-time setup

Install Node.js 22 or newer and Git, then run:

```sh
git clone https://github.com/SpEc012/checkers.git
cd checkers
npm ci
npx wrangler login
npx wrangler d1 create arcade-rooms
npx wrangler r2 bucket create arcade-photos
cp wrangler.example.json wrangler.selfhost.json
```

Cloudflare may ask you to enable R2 in your account. Check the account's current usage limits and billing settings. In `wrangler.selfhost.json`, replace `REPLACE_WITH_DATABASE_ID` with the database ID printed by the create command. If you choose different resource names, update those names too. The bindings must stay `DB` and `BUCKET`.

## Deploy

```sh
npm run deploy:self
```

This builds the app, applies the database migrations, and deploys the Worker. Wrangler prints your actual URL. Open it on both phones and create a room. Future updates: `git pull`, `npm ci`, then `npm run deploy:self` again.

The new database starts empty: existing rooms, messages, and uploaded photos stay on the old host. Browser notification permissions must be enabled again on the new address.

## Use your own domain

In Cloudflare, open your Worker → Settings → Domains & Routes → Add → Custom Domain. The domain must be in your Cloudflare account. Cloudflare handles the DNS record and certificate. You can keep the workers.dev address or disable it after your domain works.

After deploying, update the link in `.github/workflows/static.yml` to your new URL, or disable that Pages workflow if you don't want a landing page. Your GitHub repository remains the source of truth; your Cloudflare account runs the app.

Official references: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/), [Custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
