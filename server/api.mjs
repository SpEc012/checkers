// The room API, served by a Cloudflare Worker.
//
// Rooms live in D1 and hold the whole game state as JSON. Every write is
// guarded by a revision number, so two players racing each other can never
// scramble a board: the loser gets a 409 and re-syncs. The rules themselves
// come from the same modules the browser uses, which is what makes the server
// the referee rather than a relay.

import { apply } from '../public/engine.mjs';
import {
  newGame, dropHeart, drawingAction, publicGame, gameNames,
  puzzleOptions, puzzleAction, memoryAction, rpsAction,
} from '../public/arcade.mjs';

const LIVE = 45000; // a player is "online" if seen within this window
const EXPIRE = 86400000; // rooms are unreachable after a day of silence
const MAX_BODY = 12000;
const MAX_MESSAGES = 100;
const MAX_ROOMS_PER_HOST = 3;
const MAX_PHOTO_BYTES = 400000;
const CHAT_COOLDOWN = 400;
const REACTIONS = ['💗', '😘', '🫂', '🌷', '😏', '🥺'];

const ROUTE = /^\/api\/rooms\/([a-f0-9-]{36})\/(join|sync|move|chat|rematch|leave|play|switch|photo|photo-read|puzzle-config)$/;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/** Abort the request with a message the player is allowed to read. */
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

const hash = async value => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const opposite = side => (side === 'rose' ? 'cream' : 'rose');

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function database(env) {
  if (!env.DB) fail('Online rooms are temporarily unavailable. Please try again.', 503);
  return env.DB;
}

/** The room as one player is allowed to see it. */
function summary(row, token, now) {
  const host = row.host === token;
  const side = host ? row.host_side : opposite(row.host_side);
  return {
    id: row.id,
    name: row.name,
    side,
    host,
    revision: row.revision,
    state: publicGame(JSON.parse(row.state), side),
    score: JSON.parse(row.score),
    messages: JSON.parse(row.messages),
    rematch: row.rematch,
    names: { [row.host_side]: row.host_name, [opposite(row.host_side)]: row.guest_name || 'Your person' },
    opponentJoined: !!row.guest,
    opponentOnline: !!row.guest && (host ? row.guest_seen : row.host_seen) > now - LIVE,
    closed: !!row.closed,
  };
}

const loadRoom = (db, id) => db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();

/* ------------------------------------------------------------- the handler */

export async function api(request, env) {
  try {
    const db = database(env);
    const url = new URL(request.url);
    const now = Date.now();

    // ---------------------------------------------------------- the lobby
    if (request.method === 'GET' && url.pathname === '/api/rooms') {
      const { results } = await db
        .prepare('SELECT id,name,host_name,guest_name,guest,pin,host_seen,guest_seen,state FROM rooms WHERE closed=0 AND updated>? ORDER BY updated DESC LIMIT 50')
        .bind(now - LIVE)
        .all();
      const rooms = results
        .filter(row => Math.max(row.host_seen, row.guest_seen) > now - LIVE)
        .map(row => {
          const game = JSON.parse(row.state).game;
          return {
            id: row.id,
            name: row.name,
            game: gameNames[game] ? game : 'checkers',
            hostName: row.host_name,
            players: row.guest ? 2 : 1,
            locked: !!row.pin,
            joinable: !row.guest && row.host_seen > now - LIVE,
          };
        });
      return json({ rooms });
    }

    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);

    // ------------------------------------------------------ request guards
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) fail('This request is not allowed.', 403);

    const rawToken = request.headers.get('X-Player-Token') || '';
    if (!/^[a-f0-9]{64}$/.test(rawToken)) fail('Refresh to start a player session.', 401);
    const token = await hash(rawToken);

    const photoUpload = url.pathname.endsWith('/photo') && request.headers.get('Content-Type') === 'image/jpeg';
    const text = photoUpload ? '{}' : await request.text();
    if (text.length > MAX_BODY) fail('That message is too long.', 413);

    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      fail('Invalid request.');
    }
    if (!body || Array.isArray(body) || typeof body !== 'object') fail('Invalid request.');

    // ------------------------------------------------------ create a room
    if (url.pathname === '/api/rooms') {
      const name = clean(body.name, 48) || 'A little checkers date';
      const hostName = clean(body.playerName, 24) || 'Dylan';
      const pin = clean(body.pin, 40);
      if (pin && pin.length < 4) fail('Use a room password with at least 4 characters.');

      const mine = await db
        .prepare('SELECT count(*) as total FROM rooms WHERE host=? AND closed=0 AND updated>?')
        .bind(token, now - LIVE)
        .first();
      if (mine.total >= MAX_ROOMS_PER_HOST) {
        fail('You already have three active rooms. Leave one before creating another.', 429);
      }

      const id = crypto.randomUUID();
      const side = body.side === 'cream' ? 'cream' : 'rose';
      const game = Object.hasOwn(gameNames, body.game) ? body.game : 'checkers';
      await db
        .prepare('INSERT INTO rooms (id,name,host,guest,host_name,guest_name,host_side,pin,state,score,messages,revision,host_seen,guest_seen,updated,closed) VALUES (?,?,?,NULL,?,NULL,?,?,?,?,?,0,?,0,?,0)')
        .bind(id, name, token, hostName, side, pin ? await hash(id + pin) : null,
          JSON.stringify(newGame(game)), JSON.stringify({ rose: 0, cream: 0 }), '[]', now, now)
        .run();
      return json(summary(await loadRoom(db, id), token, now), 201);
    }

    // ------------------------------------------------------- find the room
    const match = url.pathname.match(ROUTE);
    if (!match) fail('Room not found.', 404);
    const [, id, action] = match;

    let row = await loadRoom(db, id);
    if (!row || row.updated < now - EXPIRE) fail('This room expired. Create a new date.', 404);
    if (row.closed) fail('This room has ended. Join or create another.', 410);

    let isHost = row.host === token;
    let isGuest = row.guest === token;

    // ------------------------------------------------------- take the seat
    if (action === 'join' && !isHost && !isGuest) {
      if (row.guest) fail('This room already has two players.', 409);
      if (row.host_seen < now - LIVE) fail('The host is offline. Try another room.', 409);
      if (row.pin && (await hash(id + clean(body.pin, 40))) !== row.pin) fail('That room password is incorrect.', 403);

      const seated = await db
        .prepare('UPDATE rooms SET guest=?,guest_name=?,guest_seen=?,updated=?,revision=revision+1 WHERE id=? AND guest IS NULL AND closed=0')
        .bind(token, clean(body.playerName, 24) || 'Audrey', now, now, id)
        .run();
      if (!seated.meta.changes) fail('Someone just took that seat.', 409);
      row = await loadRoom(db, id);
      isGuest = true;
    }

    if (!isHost && !isGuest) fail('You do not have a seat in this room.', 403);

    // A retired game once lived here; drop those rooms back to checkers so an
    // old tab does not get stuck on a board nothing can render.
    if (JSON.parse(row.state).game === 'dots') {
      await db
        .prepare('UPDATE rooms SET state=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND closed=0')
        .bind(JSON.stringify(newGame('checkers')), now, id, row.revision)
        .run();
      row = await loadRoom(db, id);
    }

    const side = isHost ? row.host_side : opposite(row.host_side);

    // ------------------------------------------------------------- photos
    if (action === 'photo-read') {
      const state = JSON.parse(row.state);
      if (!state.photoKey || !env.BUCKET) fail('Photo not found.', 404);
      const object = await env.BUCKET.get(state.photoKey);
      if (!object) fail('Photo not found.', 404);
      return new Response(object.body, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (action === 'photo') {
      const state = JSON.parse(row.state);
      if (state.game !== 'puzzle') fail('Open Photo Puzzle first.');
      if (!env.BUCKET) fail('Photo uploads are temporarily unavailable.', 503);
      if (!photoUpload) fail('Please upload a JPEG photo.');

      const data = await request.arrayBuffer();
      const bytes = new Uint8Array(data);
      const looksLikeJpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (bytes.length > MAX_PHOTO_BYTES || !looksLikeJpeg) fail('Choose a photo under 400 KB after resizing.');

      const key = `puzzles/${id}/${crypto.randomUUID()}.jpg`;
      await env.BUCKET.put(key, data, { httpMetadata: { contentType: 'image/jpeg' } });

      const fresh = newGame('puzzle', { config: state.config, photoKey: key });
      const saved = await db
        .prepare('UPDATE rooms SET state=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND closed=0')
        .bind(JSON.stringify(fresh), now, id, row.revision)
        .run();
      if (!saved.meta.changes) {
        await env.BUCKET.delete(key);
        fail('Your room changed. Upload again.', 409);
      }
      if (state.photoKey) await env.BUCKET.delete(state.photoKey);
      return json(summary(await loadRoom(db, id), token, now));
    }

    // ------------------------------------------------- heartbeat and leaving
    if (action === 'sync' || action === 'join') {
      const column = isHost ? 'host_seen' : 'guest_seen';
      await db
        .prepare(`UPDATE rooms SET ${column}=?,updated=? WHERE id=? AND closed=0`)
        .bind(now, now, id)
        .run();
      row[column] = now;
      return json(summary(row, token, now));
    }

    if (action === 'leave') {
      await db.prepare('UPDATE rooms SET closed=1,revision=revision+1 WHERE id=?').bind(id).run();
      const photoKey = JSON.parse(row.state).photoKey;
      if (photoKey && env.BUCKET) await env.BUCKET.delete(photoKey);
      return json({ left: true });
    }

    // --------------------------------------------------------- play a turn
    let state = JSON.parse(row.state);
    let score = JSON.parse(row.score);
    let messages = JSON.parse(row.messages);
    let rematch = row.rematch;
    const oldPhoto = state.photoKey;

    /** Both seats filled and the other player still connected. */
    const requirePartner = () => {
      const partnerSeen = isHost ? row.guest_seen : row.host_seen;
      if (!row.guest || partnerSeen < now - LIVE) fail('Wait for your person to reconnect.', 409);
    };

    /** Count a finished game towards the running score. */
    const award = winner => {
      if (['rose', 'cream'].includes(winner)) score[winner]++;
      else if (winner === 'together') {
        score.rose++;
        score.cream++;
      }
    };

    if (action === 'move') {
      if (state.game && state.game !== 'checkers') fail('This room is playing another game.', 409);
      requirePartner();
      if (body.revision !== row.revision) fail('The board changed. Try your move again.', 409);
      if (state.turn !== side || state.board[body.from]?.side !== side) {
        fail('You can only move your own pieces on your turn.', 403);
      }
      if (!Number.isInteger(body.from) || !Number.isInteger(body.to)) fail('Invalid square.');

      const next = apply(state, body.from, body.to);
      if (!next) fail('That move is not allowed.');
      state = next;
      if (next.winner && next.winner !== 'draw') score[next.winner]++;
      rematch = null;

    } else if (action === 'switch') {
      if (body.accept === false) {
        delete state.switchRequest;
      } else if (body.accept === true) {
        if (!state.switchRequest || state.switchRequest.side === side) fail('No game invitation from your person.');
        state = newGame(state.switchRequest.game);
        rematch = null;
      } else {
        if (!Object.hasOwn(gameNames, body.game)) fail('Choose an available game.');
        if (!row.guest) {
          state = newGame(body.game);
          rematch = null;
        } else {
          state.switchRequest = { side, game: body.game };
        }
      }

    } else if (action === 'puzzle-config') {
      if (state.game !== 'puzzle') fail('Open Photo Puzzle first.');
      if (body.accept === false) {
        delete state.puzzleRequest;
      } else if (body.accept === true) {
        if (!state.puzzleRequest || state.puzzleRequest.side === side) fail('No puzzle request from your person.');
        state = newGame('puzzle', { config: state.puzzleRequest.config, photoKey: state.photoKey });
      } else {
        const config = puzzleOptions(body.config);
        if (!row.guest) state = newGame('puzzle', { config, photoKey: state.photoKey });
        else state.puzzleRequest = { side, config };
      }

    } else if (action === 'play') {
      requirePartner();
      if (body.revision !== row.revision) fail('Your game changed. Try again.', 409);

      let next = null;
      try {
        if (state.game === 'connect4') next = dropHeart(state, body.column, side);
        else if (state.game === 'puzzle') next = puzzleAction(state, body);
        else if (state.game === 'memory') next = memoryAction(state, body.index, side, now);
        else if (state.game === 'rps') next = rpsAction(state, body, side);
        else if (state.game === 'draw') next = drawingAction(state, body.action, body, side);
      } catch (error) {
        fail(error.message);
      }
      if (!next) fail('That move is not allowed.');
      if (!state.winner && next.winner) award(next.winner);
      state = next;

    } else if (action === 'chat') {
      const value = clean(body.text, 400);
      if (!value) fail('Write a message first.');
      if (messages.some(message => message.side === side && message.at > now - CHAT_COOLDOWN)) {
        fail('One little moment between messages ♡', 429);
      }
      messages.push({
        id: crypto.randomUUID(),
        side,
        text: value,
        emoji: !!body.emoji && REACTIONS.includes(value),
        at: now,
      });
      messages = messages.slice(-MAX_MESSAGES);

    } else if (action === 'rematch') {
      if (!row.guest) fail('Wait for the other player to join.');
      if (body.accept === false) {
        rematch = null;
      } else if (body.accept === true) {
        if (!rematch || rematch === side) fail('There is no request from your opponent.');
        state = newGame(state.game || 'checkers', { config: state.config, photoKey: state.photoKey });
        rematch = null;
      } else {
        rematch = side;
      }
    }

    // ------------------------------------------------------------- persist
    const written = await db
      .prepare('UPDATE rooms SET state=?,score=?,messages=?,rematch=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND closed=0')
      .bind(JSON.stringify(state), JSON.stringify(score), JSON.stringify(messages), rematch, now, id, row.revision)
      .run();
    if (!written.meta.changes) fail('Your room just changed. Try again.', 409);

    if (oldPhoto && oldPhoto !== state.photoKey && env.BUCKET) await env.BUCKET.delete(oldPhoto);
    return json(summary(await loadRoom(db, id), token, now));

  } catch (error) {
    if (!error.status) console.error('Room API failure', error.message);
    return json(
      { error: error.status ? error.message : 'Online rooms are temporarily unavailable. Please try again.' },
      error.status || 503,
    );
  }
}
