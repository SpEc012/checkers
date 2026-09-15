# Love Notes: setup and phone checks

The arcade stays available without accounts. Love Notes uses a separate `/notes` section, Better Auth email-code sign-in, D1 storage, and optional background Web Push. All drawing documents are stored privately in D1 (maximum 12,000 points, 200 strokes, 20 stickers, and a 400 KB request). There are no public drawing URLs and no R2 setup is needed for this release.

## What is already implemented

- Accounts with email codes, recovery by signing in again, 90-day rolling sessions, and device sign-out.
- Expiring one-use partner invitations, revocation, one partner per account, and disconnect.
- Typed, handwritten, and mixed colored notes, server drafts, search, pagination, saved keepsakes, reactions, and linked replies.
- Pressure-aware pen, highlighter, whole-stroke eraser, undo/redo, stickers, and expanded drawing view.
- Replay of final strokes only, reduced-motion support, full-note display, and image export.
- Scheduled delivery, editing/cancellation before publication, atomic inbox publication and durable per-device notification jobs.
- Web Push, private previews by default, unread badge where supported, subscription removal, retries and deep links.

**Email configuration and push keys are required before real accounts and alerts work.** `/api/notes/config` reports readiness from configuration presence; it cannot certify email deliverability or a phone's permission state. Physical-device verification is still required. The public paper-and-pen preview works before setup and does not send anything.

## 1. Deploy the code and database migration

Use the existing Deploy lovebugs.world workflow. `0001_love_notes.sql` is additive and does not change game-room tables. The new build bundles Better Auth and uses the `nodejs_compat` flag. Keep that flag when editing the Worker.

The Worker has a once-per-minute Cron Trigger. `NOTES_ORIGIN` is `https://lovebugs.world`. All authentication and private-note requests must use that origin. The www hostname redirects to it.

## 2. Generate and upload account and push secrets once

On your own computer in this repository:

```sh
npm ci
npm run setup:self -- --database-id YOUR_EXISTING_D1_UUID --domain
npm run setup:notes -- --contact mailto:YOUR_REAL_EMAIL --upload
```

If `wrangler.selfhost.json` already exists and points at your Worker, skip `setup:self`. Wrangler will ask you to authenticate to Cloudflare if needed. Do not use a new D1 database: use the same one holding your rooms.

The setup script generates a gitignored `.notes-secrets.json`, then uploads these secrets to the configured Worker:

| Secret | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Signs account sessions |
| `VAPID_PUBLIC_KEY` | Public Web Push application key |
| `VAPID_PRIVATE_KEY` | Private key used to sign Web Push requests |
| `VAPID_SUBJECT` | Your contact email in `mailto:` form |

Back up the file privately. Do not commit it or paste its contents into chat. The script reuses an existing file instead of rotating keys. Changing the VAPID keys requires devices to unsubscribe and subscribe again; changing the auth secret can invalidate sign-in sessions.

Alternatively, create the same secrets under Cloudflare → Workers & Pages → lovebugs → Settings → Variables and Secrets. Do not put private values in plaintext variables.

## 3. Configure sign-in email

Choose one route. The application prefers an `EMAIL` binding if it exists; otherwise it uses `RESEND_API_KEY`.

### Cloudflare email route

Cloudflare documents general outbound Email Sending as beta on the Workers Paid plan. Sending only to verified destination addresses is documented as free even when using Email Routing. For a private two-person app, verify both destination email addresses in your Cloudflare account and follow Cloudflare's current sender/domain setup. Availability and email restrictions are controlled by your account, not by this repository.

Official setup: https://developers.cloudflare.com/email-service/

In GitHub → repository Settings → Secrets and variables → Actions → Variables, add:

- `NOTES_EMAIL_BINDING` = `true`
- `NOTES_EMAIL_FROM` = an address authorized by your Cloudflare sender-domain setup, for example `notes@lovebugs.world` **only after that sender is configured**.

Run the deployment workflow again. Its configuration generator adds the native `EMAIL` send binding and the sender variable. Test sign-in with both verified addresses. A binding's presence does not prove email is being delivered.

### External email fallback

If Cloudflare email is unavailable, use a transactional sender such as Resend, verify your sending domain, and add `RESEND_API_KEY` as a **Worker secret**. Set `NOTES_EMAIL_FROM` to the verified sender as a GitHub repository variable, and leave `NOTES_EMAIL_BINDING` unset. Redeploy.

Do not leave a broken `EMAIL` binding enabled while expecting the fallback to run. Remove the repository variable and redeploy to remove that binding.

This route introduces an external email provider; pricing and limits depend on your provider account. No external provider is needed for notes storage or Web Push itself.

## 4. Sign in and connect

1. Open https://lovebugs.world/notes.
2. First-time users: choose **First time here or forgot your password?**, enter your name and email, and verify the code. Choose a unique username and a password (8–128 characters). Returning users sign in with their username and password. Existing users must use the same verified email to keep their notes and partner.
3. Create an invitation and send the link privately to your person. It expires after 24 hours.
4. They sign in, review your name, and accept.
5. Open Settings on each account, confirm your time zone and notification privacy preferences.

Use the email-code option to recover a forgotten password on the same account. Passwords are stored as salted hashes, never plaintext. Usernames are case-insensitive and separate from display names. Partner invitations are one-time setup; logging out never disconnects a pair. Sessions last 90 days and renew during use, with refreshed secure cookies sent back to the browser. Safari and an installed Home Screen app may require separate initial sign-ins. Password changes require a sign-in within the last 10 minutes and revoke other devices; reconnect notifications on those devices after signing in again. To end a lost device's access, use Settings → Signed-in devices → Sign out device.

## 5. Install and enable alerts on both phones

On iPhone/iPad with iOS/iPadOS 16.4 or later: open the site, use Share → Add to Home Screen, then open Two Lovebugs from its Home Screen icon. In Love Notes → Settings, tap Enable note notifications and allow the OS permission. Other supported browsers can enable Web Push through the same button.

Tap **Send a test notification**. The result now reports accepted, rejected (with provider status), retrying, or expired. Accepted means the push service accepted the request, not that iOS displayed it. **Check phone banner** separately checks the local notification display. **Repair notifications** replaces a stale subscription. Check the phone's Notification Center, banner permissions, Focus and Scheduled Summary. Close the app and repeat a real note from the other device. Focus, battery management, network connectivity, permissions, and OS policies can affect timing. No exact-second notification guarantee is made.

The default alert contains the sender name but no note body. Choose Hide sender and message for generic alerts, or opt in to a short text preview. The preview setting affects the push payload itself. A push accepted by Apple/Google/Mozilla is not proof the recipient saw it.

## 6. Scheduled notes

The composer interprets the selected date/time in the sending device's time zone and displays it before confirmation, plus the partner's saved local time. It stores the resulting UTC instant. Nonexistent or repeated daylight-saving clock times are rejected with an explanation.

A minute-level scheduler publishes due notes even if both apps are closed. A SQLite trigger creates per-device outbox work in the same transaction. Attempts retry with a delay, and invalid subscriptions are removed. A successful provider response is labeled internally as `accepted`, never `read`.

Retries cannot create duplicate inbox notes. A provider response lost after acceptance can still lead to another push attempt; the notification tag replaces the same notification without renotifying where supported. There is no universal exactly-once guarantee for OS notification delivery.

Cancelling/editing and dispatch use state/revision checks. Whichever transition commits first wins; a note already sent cannot be edited or recalled. Disconnecting cancels future scheduled sends and outstanding notification work. An in-flight push already handed off to a provider cannot be recalled.

Previously sent notes remain accessible after disconnect. Removing a sent note hides it from that person's view; the other person's copy remains. Deleting an unsent note removes its document and related jobs. This release has no attachment objects to orphan.

## 7. Physical-device acceptance checklist

Automated tests cover auth and database behavior, but cannot establish real background delivery on your phones. Verify:

- Both email addresses receive codes; each account sees only its own notes and its partner's sent notes.
- A typed note arrives when the recipient app is closed and phone locked.
- A mixed note with a drawing opens correctly from its notification.
- Erased and undone writing does not appear during replay.
- Reduced motion shows the completed note without replay.
- Schedule two minutes ahead, close both apps, then confirm arrival and correct local time.
- Cancel a scheduled note and confirm no inbox delivery.
- Test iPhone touch drawing and Android/stylus if used, orientation changes, and the software keyboard.
- Deny notifications and verify notes still appear in the inbox.
- Sign out and verify that device stops receiving account-specific alerts.
- Sign in on another device and confirm history and saved notes persist.
- Play existing local and online games to verify no regression.

## 8. Troubleshooting

**Sign-in not configured:** Check `BETTER_AUTH_SECRET`, `NOTES_ORIGIN`, `NOTES_EMAIL_FROM`, and either EMAIL binding or RESEND_API_KEY. `/api/notes/config` exposes booleans and the public push key only.

**No email:** Check spam, sender/domain verification, permitted destination addresses, provider errors, and rate limits. Codes expire after 10 minutes. Do not put OTP values or full note contents in logs.

**No push:** Check configuration readiness, installation mode, permission, subscription, and the test notification. Re-enable after changing devices or VAPID keys. Inspect `ln_outbox` status counts without printing private payloads. An accepted push does not mean the OS displayed it immediately.

**Scheduled note not sent:** Check Workers → Triggers includes `* * * * *`, deployment status, and D1 migration. The Worker must export `scheduled`; the build now does. Check `ln_note.status` and `due_at`, not the browser's open/closed state.

**403:** Use the configured canonical origin. Preview/test hosts intentionally cannot access production notes with the production auth origin.

**404 from notification:** Redeploy the current Worker; `/notes` and its nested paths must serve notes.html. Check that www redirects to the canonical origin.

**Drawing offline:** The current tab keeps an unsent draft in sessionStorage. It is not marked saved to your account until the server confirms. Closing a tab can lose a tab-only draft. Save server drafts before leaving when possible.

## 9. Test isolation, costs and backups

Use separate Workers, D1 databases, email credentials, VAPID keys, and NOTES_ORIGIN values for testing. Do not attach a test deployment to the production D1 or reuse production subscriptions. Do not enable test schedulers against production data. The ChatGPT-hosted test arcade is not migrated or redeployed by this release.

The test suites use in-memory SQLite, captured email codes, and mocked push transport; no emails or notifications are sent to real people.

Cloudflare Email Service plan details: https://developers.cloudflare.com/email-service/
D1 usage and pricing: https://developers.cloudflare.com/d1/platform/pricing/
Workers usage and pricing: https://developers.cloudflare.com/workers/platform/pricing/

No paid plan is automatically purchased by these scripts. Check your account before enabling general outbound email. D1 read/write/storage and Worker CPU/request limits still apply. Notes queries are indexed and paginated; drawings have bounded size.

Back up D1 using its export/Time Travel facilities before major changes. Exports contain private notes, auth records, and subscriptions: keep them encrypted and out of GitHub. Preserve auth and VAPID secrets privately. An application rollback does not require dropping the additive notes tables; disable scheduled triggers if rolling back notification code.

This is access-controlled storage over HTTPS, **not end-to-end encryption**. People administering the database can access stored notes. No private API responses are cached by the service worker.
