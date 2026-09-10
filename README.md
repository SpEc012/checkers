Want your own URL? See [the self-hosting guide](SELF_HOSTING.md) for deploying the complete app to your Cloudflare account.

# Across the Board ♡
A checkers date for Dylan & Audrey. Version 2 includes an explicit local/online start menu, a live room lobby, optional room passwords, player-owned seats, server-validated moves, opt-in hints, chat, reactions, and agreed rematches.

## Play
Choose **Side by side** to share one device and take turns with both colors. Choose **Online date** for two devices. Create a room, choose a name and color, and optionally set a password. Your partner joins from Active rooms or an invite. Each online player owns exactly one color; the server rejects wrong-player, wrong-turn, illegal, and stale moves. Selecting a piece does not automatically show hints. Click Hint to reveal legal destinations for the selected piece. Mandatory captures and chained jumps follow American checkers rules.

## Rooms
The server stores room state, up to 100 chat messages, score, and hashed player session credentials in D1. Room passwords are salted per room and hashed. Names and occupancy are visible in the lobby; chat and game state require a player seat. Room passwords restrict joining, not lobby visibility. Rooms disappear from the lobby after 45 seconds without a heartbeat and cannot be reopened after 24 hours of inactivity. Expiry is an access rule, not immediate physical deletion. Explicitly leaving ends the room for both players. Reloading the same tab resumes its reserved seat using a tab-session credential; losing that credential means creating a new room. No third-player spectators. Inactive partners pause moves until they reconnect. Browser session storage holds credentials and the room pointer, not authoritative board or chat data.

## Architecture
`public/` is the browser app, and the rules modules inside it are imported by the Worker too, so the server validates moves with exactly the code the client ran.

| File | What it holds |
| --- | --- |
| `public/engine.mjs` | American checkers rules. Pure functions, shared with the server. |
| `public/arcade.mjs` | The other five games plus the redaction rules for hidden information. |
| `public/app.mjs` | The app: state, rendering, input and talking to the room API. |
| `public/lovebugs.mjs` | The ladybirds that wander the page, and the drawing they share. |
| `public/celebration.mjs` | The victory overlay, kept testable outside a browser. |
| `public/sound.mjs` | Chimes and the win fanfare, synthesised on demand. |
| `public/rps-scene.mjs` | The jointed Three.js hands, loaded only when Rock Paper Scissors opens. |
| `public/match-effects.mjs` | Countdown timing and the words on the victory card. |
| `public/style.css` | One stylesheet, design tokens first, in numbered sections. |
| `server/api.mjs` | The Worker API: prepared D1 queries and revision-checked updates. |
| `scripts/icon-art.mjs` | The site mark — a heart on a cherry tile — described once as shapes. |
| `scripts/make-icons.mjs` | Renders that mark to `favicon.svg`, the mask icon and the PNG icons. |
| `db/schema.ts`, `drizzle/` | Schema and generated immutable migrations. |

Commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Local preview on `http://localhost:8080`. Side by side works; online rooms need the Worker. |
| `npm run build` | Bundles the Worker, embeds everything in `public/`, and copies hosting metadata and migrations. |
| `npm run icons` | Regenerates the icon files after editing `scripts/icon-art.mjs`. |
| `npm test` | Rules, two-player API interactions against SQLite, celebration, throw animation, lovebug motion and icon checks. |

`scripts/build.mjs` discovers assets from `public/` rather than a list, so a new file there ships automatically; binary files are embedded as base64 and served with a day of cache.

The active lobby and authoritative online game require the Worker and D1 backend. GitHub Pages alone cannot run that backend. The included Pages workflow publishes an entry page linking to the live full game. The complete source can be stored on GitHub independently of hosting.

## Verification
Rules tests cover initial play, invalid moves, mandatory captures, chained jumps, kings, crowning, and wins. API tests cover the room list, password checks, two-player seat limits, wrong-side rejection, stale requests, chat, agreed rematches, reconnect state, offline pause, and closure. Version 5 was also driven through a headless browser at desktop and phone widths — every game surface, the lobby, the mobile tabs and a full Rock Paper Scissors round through to the victory card — but no real device or hardware end-to-end testing has been performed.

## Our Little Arcade (version 3)
Four games share the same online room, chat and player seats. Choose a game before entering local or online mode, or use the in-room game bar. Once both players have joined, game switches require the other player's acceptance.

- **Connect Four:** server-checked turns, gravity, full-column rejection, four-in-a-row wins and draws.
- **Draw & Guess:** secret prompts sent only to the artist until the round ends, touch/mouse sketching, brush sizes and colors, undo/clear, guesses and alternating artist rounds. Shared-device play offers a hide-prompt button. Sketch strokes sync when the artist lifts their pointer.
- **Photo Puzzle:** a cooperative 16-tile square-cut picture puzzle. Tap or drag tiles to matching positions. Upload a JPEG/PNG/WebP; the browser crops it to a square and resizes it to 640px. Online images are stored in R2 and served only to room participants. Replacing a photo, switching away, or explicitly ending the room deletes its current image. Inactive-room expiry restricts access but does not physically delete abandoned uploads. Local photos remain in browser memory. Numbered practice tiles work without a photo.

State uses the existing room JSON column; older checkers rooms remain compatible. `BUCKET` is the logical R2 binding. New tests cover cross-game agreement, secret-word redaction, drawing ownership, alternating rounds and puzzle completion. Browser visual/end-to-end testing has not been performed.

## Mobile & game expansion (version 4)
- Mobile Game/Chat/Room navigation, dedicated chat view with unread counts, larger touch controls, scrollable game selection and safe-area spacing.
- Alert settings include message chimes (after a user interaction unlocks audio), optional turn chimes and opt-in system notifications where supported. System notifications intentionally omit message text. They are generated by the connected open page, not a push server; closed or suspended tabs cannot reliably receive them. A service worker handles notification clicks. Device-only alert preferences are kept in local storage. Permission is requested only after tapping Enable.
- Photo puzzle options: 3×3, 4×4, 6×6, or 8×8 grids; square or diagonal triangle cuts (9–128 total pieces); optional quarter-turn rotation; optional hidden reference image; enlarged board mode. Players agree before changing a shared puzzle. New uploads and rematches preserve the active puzzle settings. Older 16-piece rooms remain supported.
- Memory Match: hidden card faces, timed mismatch reveal, matching-pair extra turns and competitive pair scoring. The server redacts hidden faces.
- Rock Paper Scissors: locked secret choices, simultaneous reveal, first to three round wins. Shared-device play uses a pass-screen step; online play redacts the opponent's pending choice.

`npm test` includes room API authorization plus gameplay, hidden-information and puzzle-configuration checks.

## Lovebugs update
The existing layout is preserved with its original palette and small stationary ladybugs tucked into corners. RPS uses articulated Three.js hands with three synchronized full bounces, an unfolding reveal, and scores withheld during the countdown. Every game has a named win celebration; cooperative results include both names. Motion respects reduced-motion preferences and victory audio respects Sound on/off.

## The lovebugs move in (version 5)

**The bugs.** The three ladybirds that sat still in the corners are the same plain seven-spot bug they always were — red shell, black seam, dark pronotum with two pale marks — only now they are drawn rather than typed, and a couple of them are alive. Two (one on a phone) keep to the band along the edges of the page, strongly favouring the corners and mostly staying away from the header. They crawl slowly on six jointed legs in a proper alternating tripod, at a stride driven by how far they have actually travelled, and leave a faint dotted path that fades out behind them. Every so often one opens its wings and flies a short hop, usually along an edge. They stop for up to twenty seconds at a time. They are meant to be found, not watched.

They also react: the pointer coming close makes one dart away, a win sends both up trailing little hearts, and a love note arriving while you are looking elsewhere sends the nearest one over to the chat panel.

They live in one fixed layer that never takes a click, pause with the tab, switch off entirely under `prefers-reduced-motion`, and **Alerts ✦ → Let the lovebugs wander the page** turns them off by choice, per device. The same drawing supplies the still bugs in the menu, the chat card and the footer.

**Rock Paper Scissors.** The hands were rebuilt from scratch. Each one is a forearm, a palm made of five metacarpal bones with a thumb mound and a heel, four fingers of three tapering phalanges with fingernails, and a thumb with its own three joints — every joint a nested group turning on one axis, so a single "openness" number carries a fist into paper or into scissors. The countdown got a wrist roll that leads each of the three beats, and the reveal unfurls the fingers one after another with a short overshoot, a recoil that pushes the hands apart, a damped settle, and a small camera push-in. Skin uses a sheened physical material under a key, fill and rim light.

**Icons.** `scripts/icon-art.mjs` describes the mark once — one cream heart on a cherry tile — and `npm run icons` renders it into `favicon.svg` (tab icon), `mask-icon.svg` (Safari pinned tabs), `apple-touch-icon.png` and the 192/512 PNGs referenced by `manifest.webmanifest`, so the arcade installs to a home screen with its own icon and theme colour. The PNG encoder is a small rasteriser plus zlib — no image dependency — and `npm test` fails if the committed files drift from the artwork.

**The house.** Every source file was rewritten to be read: the markup is indented and commented, the stylesheet is one pass over design tokens instead of five layers of overrides, and `app.mjs` is split into numbered sections with sound, celebration and lovebugs lifted into their own modules. Dead rules for a game that no longer exists are gone, unused imports removed, and the build no longer keeps a hand-maintained list of assets. The celebration test now drives the real module through a stand-in document rather than slicing a function out of the source text, and there are new tests for lovebug motion, the throw animation and the icons.

**Design.** Same palette, tidier: a six-card game menu on a three-column grid, per-game tints, consistent focus rings and press states, softer card shadows, chat bubbles with a tail, a pulsing hint marker on legal squares, and a proper fallback font stack for when Google Fonts is unreachable.

For **lovebugs.world**, start with [SELF_HOSTING.md](SELF_HOSTING.md). `npm run setup:self` writes the private local deployment configuration; the manual `Deploy lovebugs.world` GitHub Action can publish production independently of the existing ChatGPT test site. Build output is generated from the source, not committed.
