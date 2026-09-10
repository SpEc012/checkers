# Across the Board ♡
A checkers date for Dylan & Audrey. Version 2 includes an explicit local/online start menu, a live room lobby, optional room passwords, player-owned seats, server-validated moves, opt-in hints, chat, reactions, and agreed rematches.

## Play
Choose **Side by side** to share one device and take turns with both colors. Choose **Online date** for two devices. Create a room, choose a name and color, and optionally set a password. Your partner joins from Active rooms or an invite. Each online player owns exactly one color; the server rejects wrong-player, wrong-turn, illegal, and stale moves. Selecting a piece does not automatically show hints. Click Hint to reveal legal destinations for the selected piece. Mandatory captures and chained jumps follow American checkers rules.

## Rooms
The server stores room state, up to 100 chat messages, score, and hashed player session credentials in D1. Room passwords are salted per room and hashed. Names and occupancy are visible in the lobby; chat and game state require a player seat. Room passwords restrict joining, not lobby visibility. Rooms disappear from the lobby after 45 seconds without a heartbeat and cannot be reopened after 24 hours of inactivity. Expiry is an access rule, not immediate physical deletion. Explicitly leaving ends the room for both players. Reloading the same tab resumes its reserved seat using a tab-session credential; losing that credential means creating a new room. No third-player spectators. Inactive partners pause moves until they reconnect. Browser session storage holds credentials and the room pointer, not authoritative board or chat data.

## Architecture
- `public/`: HTML, CSS 3D board, browser JavaScript, shared rules engine.
- `server/api.mjs`: Cloudflare Worker HTTP API with prepared D1 queries and revision-checked updates.
- `db/schema.ts`, `drizzle/`: schema and generated immutable migrations.
- `scripts/build.mjs`: bundles the Worker, embeds public assets, and includes hosting metadata and migrations.
- `npm run build`: build the complete hosted game.
- `npm test`: check the rules plus two-player API interactions against SQLite.

The active lobby and authoritative online game require the Worker and D1 backend. GitHub Pages alone cannot run that backend. The included Pages workflow publishes an entry page linking to the live full game. The complete source can be stored on GitHub independently of hosting.

## Verification
Rules tests cover initial play, invalid moves, mandatory captures, chained jumps, kings, crowning, and wins. API tests cover the room list, password checks, two-player seat limits, wrong-side rejection, stale requests, chat, agreed rematches, reconnect state, offline pause, and closure. Browser visual and real-device end-to-end testing has not been performed in this update.
