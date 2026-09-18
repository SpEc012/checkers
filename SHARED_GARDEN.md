# Our Garden & Our Ladybug

Open `/garden` on lovebugs.world. Sign in through Love Notes with your existing account and connect with your partner there once. The same active partnership automatically owns one shared garden; a garden URL is not an access token.

## What you can do

- Tend six plots. Seeds are free; six varieties unlock through levels. Growth takes 15–90 minutes while watered. Water adds 12% growth, at most once per minute per plot. After 24 hours without water, a plant needs revival. Plants never disappear.
- Harvest blooming plants for treats, care points, and dewdrops. Feed free aphid snacks or use harvested garden treats. Pet your ladybug, rename it, and tuck it into a leaf bed. Sleeping restores energy even when the app is closed.
- Collect 21 wardrobe choices across hats, glasses, and auras, including four unequipped choices/defaults. Change shell colors freely. Earn dewdrops through harvests and daily quests; no purchases or paid currency.
- Gain a level every 80 care points, up to level 10, with four visual/name stages. Daily care-point earnings are capped at 120. Later auras and the flower crown require both partners to care on several distinct days.
- A day counts as “together” when both partners plant, water/revive, harvest, feed, pet, or tuck the pet in. Streaks and quests use UTC calendar days, explicitly shown in the UI. Missing a day resets the streak, never the total earned care days or unlocked outfits.

Changes are saved immediately and the partner's open page refreshes every five seconds. Hidden tabs stop polling and refresh on return. This is periodic synchronization, not a live socket connection. Offline actions are not queued; the UI offers retry using the same action ID to avoid duplicate charges or rewards.

## Deployment

The existing GitHub `Deploy lovebugs.world` workflow installs dependencies, runs tests, builds the React/Lucide interface and Tailwind stylesheet, applies `drizzle/0004_shared_garden.sql`, and deploys the existing Worker. No new provider, secret, email configuration, or database is required. Keep existing Love Notes credentials and D1 configuration.

The additive `ln_garden` table stores one bounded JSON document per partnership with a revision. Every read and update checks the active partnership; compare-and-swap retries merge simultaneous actions, and remembered action IDs prevent duplicate retries. Disconnecting in Love Notes blocks both former partners from the old garden. Reconnecting creates a new partnership and therefore a new garden; prior garden data is retained for backup, not automatically transferred.

The garden does not send new background notifications. Existing Love Notes alerts are unchanged. `/garden?preview=1` is an explicitly labeled, tab-only demo with simulated partner and time controls; it never writes to an account.

The removed 3D Grand Prix no longer appears in the arcade, is not accepted for new rooms, and its assets are excluded from deployment. Existing Grand Prix rooms return to checkers; old direct racing URLs redirect to the garden. The original 2D Ladybug Race remains available. Historical racing source stays in Git for recovery.

## Verification

`npm test` covers existing notes/auth and arcade behavior plus garden privacy, actual paired sessions, simultaneous partner actions, duplicate request IDs, disconnect access, offline growth, withering/revival, harvest rewards, bedtime, quests, streaks, and cosmetic locks. Use two signed-in phones to check the five-second refresh and the visual experience on your devices.
