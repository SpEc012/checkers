# Lovebug Grand Prix

Choose **Lovebug Grand Prix** in the arcade, then **Single player** or **Online date**. Online uses the existing room list, room passwords, private seat tokens, chat and agreed game changes.

## Racing together

1. One person creates a room; the other joins.
2. Pick your own kart type and any shell color. Only your own car can be customized.
3. The lobby host chooses 0–3 computer racers. Zero bots means a two-person 1v1; single-player zero bots is practice.
4. Either player can propose a track. Once both people have joined, the other player accepts the track/bot configuration before it changes.
5. Both press Ready. The server starts a shared countdown.
6. Hold W/up or GAS, steer with A/D/arrows, brake with S/down, boost with Space plus gas, and use a collected item with E or the item button. Touch controls support simultaneous pedals and steering.
7. Pause affects both players. Return-to-garage requests require the other person to accept. Main arcade game switches and rematches retain the existing request/accept flow.

## Items and tracks

Three circuits are approximately 555, 584 and 668 metres per lap, with three laps per race. Flower crates contain nectar rush, love bubble, acorn shot, or a pollen slick. Boosted kart collisions and item hits can knock opponents off the track. A leaf returns the kart after a short penalty; a brief invulnerability window prevents repeated hits during recovery.

## Online implementation

The server owns position, physics, pickups, hazards, collision outcomes, bots, timing and finish order. Browsers submit only their seat's boolean inputs and monotonically increasing sequence numbers. Client-supplied positions, winners and seat IDs are ignored. D1 uses the existing room compare-and-swap writes; conflicting requests retry against fresh state. No new database, credential, migration or paid product is required.

Active drivers send inputs about every 150 ms with limited client prediction and smoothing between authoritative snapshots. This is HTTP-based racing, not a WebSocket server: poor mobile connections may produce correction/jitter. If a driver stops checking in for three seconds, shared simulation pauses until both return. Hidden tabs release pedals. Racing adds database writes while active, so normal D1 usage limits still apply.

Automated checks cover full races on all tracks, screen-relative handling, pickups/defence/recovery, two independently authenticated room clients, host/guest permissions, consent, simultaneous writes, stale inputs, disconnect/rejoin, scoring and switching games. Scene startup checks construct actual Three.js geometry without GPU rendering. Hands-on phone and two-device feel testing remains useful.
