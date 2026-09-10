// Our Little Arcade — the browser app.
//
// One page runs six games, two ways to play (shared device or an online room)
// and a chat panel. The rules live in engine.mjs and arcade.mjs and are shared
// with the Worker, so this file only has to be about state, the DOM and talking
// to the server.
//
// Reading order:
//   1  State and preferences        7  Menu, lobby and rooms
//   2  Small helpers                8  Game switching and moves
//   3  Permissions                  9  Draw & Guess / Puzzle / Memory / RPS
//   4  Rendering                   10  Alerts and notifications
//   5  Checkers input              11  Rock Paper Scissors scene + celebration
//   6  Talking to the server       12  Lovebugs and boot

import { THROW_DURATION } from './match-effects.mjs';
import { initial, moves, apply } from './engine.mjs';
import {
  newGame, dropHeart, drawingAction, gameNames,
  puzzleOptions, puzzleAction, memoryAction, rpsAction, publicGame,
} from './arcade.mjs';
import { createAudio } from './sound.mjs';
import { celebrationKey, createCelebration } from './celebration.mjs';
import { createLovebugs, decorate } from './lovebugs.mjs';

/* ------------------------------------------------- 1 state and preferences */

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const PAGE_TITLE = 'Our Little Arcade · Dylan & Audrey';
const SURFACES = { connect4: 'connect', draw: 'draw', puzzle: 'puzzle', memory: 'memory', rps: 'rps' };

// Game and room state.
let state = initial();
let mode = null; // null | 'local' | 'online'
let room = null;
let names = { rose: 'Dylan', cream: 'Audrey' };
let score = { rose: 0, cream: 0 };
let preferredGame = 'checkers';
let selected = null;
let hints = false;
let busy = false;
let healthy = true;
let joinId = '';
let sessionGeneration = 0;
let seenMessages = new Set();
let toastTimer;
let pollTimer;
let lobbyTimer;

// Per-game scratch state.
let drag = null;
let puzzleDrag = null;
let puzzlePick = null;
let puzzleZoom = false;
let photoUrl = null;
let photoKeyLoaded = null;
let photoLoading = false;
let stroke = null;
let localPromptHidden = false;
let localRpsReady = false;
let memoryTimer = null;

// Device preferences.
let mobilePanel = 'game';
let unread = 0;
let lastAlert = 0;
let notificationRegistration = null;

const readFlag = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'on';
  } catch {
    return fallback;
  }
};

const writeFlag = (key, value) => {
  try {
    localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    /* Private browsing: preferences simply do not stick. */
  }
};

let sound = readFlag('arcade-sound', true);
let lovebugsWanted = readFlag('arcade-lovebugs', true);
let messageChime = true;
let turnChime = false;
let systemAlerts = false;
try {
  const saved = JSON.parse(localStorage.getItem('arcade-alerts') || '{}');
  messageChime = saved.message !== false;
  turnChime = saved.turn === true;
  systemAlerts = saved.system === true;
} catch {
  /* Defaults are fine. */
}

function saveAlertPrefs() {
  try {
    localStorage.setItem('arcade-alerts', JSON.stringify({ message: messageChime, turn: turnChime, system: systemAlerts }));
  } catch {
    /* ignore */
  }
}

const audio = createAudio(() => sound);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// A phone gets a smaller colony than a desktop.
const lovebugs = createLovebugs({ count: () => (matchMedia('(max-width: 760px)').matches ? 1 : 2) });

// A per-tab credential. Reloading the same tab keeps your seat; a new tab is a
// new player.
let token;
try {
  token = sessionStorage.getItem('checkers-player-v2');
} catch {
  /* ignore */
}
if (!/^[a-f0-9]{64}$/.test(token || '')) {
  token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
  try {
    sessionStorage.setItem('checkers-player-v2', token);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------- 2 small helpers */

const kind = () => state.game || 'checkers';
const other = side => (side === 'rose' ? 'cream' : 'rose');

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}

/** A little shower of one emoji, for reactions. */
function burst(emoji) {
  for (let i = 0; i < 9; i++) {
    const piece = document.createElement('span');
    piece.className = 'floatemoji';
    piece.textContent = emoji;
    piece.style.left = `${10 + Math.random() * 80}%`;
    piece.style.animationDelay = `${i * 0.08}s`;
    $('#bursts').append(piece);
    setTimeout(() => piece.remove(), 4000);
  }
}

async function request(path, body) {
  const sending = body !== undefined;
  const response = await fetch(path, {
    method: sending ? 'POST' : 'GET',
    headers: sending ? { 'Content-Type': 'application/json', 'X-Player-Token': token } : {},
    body: sending ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Online rooms are unavailable. Please try again.');
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: response.status });
  }
  return data;
}

/* ----------------------------------------------------------- 3 permissions */

/** Both players present (or a shared device) — moves are allowed at all. */
const ready = () => mode === 'local' || (mode === 'online' && room?.opponentOnline && healthy);

const canMove = () => !busy && !state.winner && ready() && (mode === 'local' || state.turn === room?.side);

const canSelect = index =>
  kind() === 'checkers' && canMove() && state.board[index]?.side === (mode === 'online' ? room.side : state.turn);

/* ------------------------------------------------------------- 4 rendering */

function renderBoard() {
  const board = $('#board');
  const focused = document.activeElement?.dataset.index;
  const legal = kind() === 'checkers' ? moves(state) : [];
  board.replaceChildren();
  if (kind() !== 'checkers') return;

  // The guest sees the board from their own side.
  const flipped = mode === 'online' && room?.side === 'cream';
  for (let display = 0; display < 64; display++) {
    const index = flipped ? 63 - display : display;
    const piece = state.board[index];
    const square = document.createElement('button');
    const dark = ((index >> 3) + (index % 8)) % 2;
    square.className = 'square'
      + (dark ? ' dark' : '')
      + (selected === index ? ' selected' : '')
      + (hints && selected !== null && legal.some(m => m.from === selected && m.to === index) ? ' target' : '')
      + (mode === 'online' && piece && piece.side !== room?.side ? ' opponent' : '');
    square.dataset.index = index;
    const file = String.fromCharCode(97 + (index % 8));
    const rank = 8 - (index >> 3);
    const occupant = piece ? `, ${names[piece.side]} ${piece.king ? 'king' : 'piece'}` : ', empty';
    square.setAttribute('aria-label', `${file}${rank}${occupant}${selected === index ? ', selected' : ''}`);
    square.setAttribute('aria-pressed', selected === index ? 'true' : 'false');
    if (piece) {
      const disc = document.createElement('span');
      disc.className = `piece ${piece.side}`;
      disc.textContent = piece.king ? '♛' : piece.side === 'rose' ? '♥' : '♡';
      square.append(disc);
    }
    square.onclick = () => select(index);
    square.onpointerdown = event => startDrag(event, index);
    board.append(square);
  }
  if (focused !== undefined) board.querySelector(`[data-index="${focused}"]`)?.focus({ preventScroll: true });
}

function renderPlayers() {
  for (const side of ['rose', 'cream']) {
    $(`#${side}Name`).textContent = names[side];
    $(`#${side}Player`).classList.toggle('active', state.turn === side && !state.winner);
    $(`#${side}Count`).textContent = state.board.filter(piece => piece?.side === side).length;
    $(`#${side}You`).textContent = mode === 'online' && room?.side === side ? 'YOU' : '';
  }
}

function renderRoomPanel() {
  $('#status').textContent = mode === 'local' ? 'Local · shared device'
    : !healthy ? 'Reconnecting…'
      : room?.opponentOnline ? 'Online · together ♡'
        : room?.opponentJoined ? 'Partner offline'
          : 'Waiting for player';

  $('#roomTitle').textContent = mode === 'local' ? 'Side by side.' : room?.name || 'Our room';

  $('#seatLabel').textContent = mode === 'online'
    ? `You are ${names[room.side]} · ${room.side === 'rose' ? 'cherry hearts' : 'vanilla kisses'}`
    : 'Both players take turns on this device.';

  $('#connectionNote').textContent = mode === 'local'
    ? 'Want to play on separate devices? Go back and choose Online.'
    : !healthy ? 'Your connection dropped. Moves are paused while we reconnect.'
      : !room.opponentJoined ? 'Your room is listed in the lobby. Your person can join there or use an invite.'
        : !room.opponentOnline ? 'Waiting for your person to reconnect. Their seat stays reserved.'
          : 'Only your pieces can move, and only on your turn.';
}

function renderTurnbar() {
  $('#turn').textContent = state.winner
    ? state.winner === 'draw' ? 'A perfect little tie.'
      : state.winner === 'together' ? 'You did it together! ♡'
        : `${names[state.winner]} wins this one! ♡`
    : mode === 'online'
      ? state.turn === room?.side ? 'Your turn ♡' : `${names[state.turn]}’s turn`
      : `${names[state.turn]}’s turn`;

  $('#hint').textContent = !ready() ? 'Waiting for both players to be online…'
    : state.winner ? 'Another game? Winner owes the other a kiss.'
      : state.forced !== null ? 'Finish your capture with the same piece.'
        : mode === 'online' && state.turn !== room?.side ? 'Sit back, sweetheart. Your turn is coming.'
          : 'Select any of your pieces, then drag or tap a destination.';

  $('#hintButton').setAttribute('aria-pressed', String(hints));
  $('#hintButton').disabled = !canMove();
}

function render() {
  if (mode === null) return;
  renderBoard();
  renderPlayers();
  renderRoomPanel();
  renderTurnbar();

  $('#moveCount').textContent = state.ply;
  $('#history').replaceChildren(...state.history.slice(-60).map(entry => {
    const item = document.createElement('li');
    item.textContent = entry;
    return item;
  }));
  $('#score').textContent = `${names.rose} ${score.rose} ♡ ${names.cream} ${score.cream}`;

  const chatReady = mode === 'online' && healthy;
  $('#chatInput').disabled = !chatReady;
  $('#chatForm button').disabled = !chatReady;

  $('#rematch').disabled = busy || (mode === 'online' && (!room?.opponentJoined || !healthy));
  $('#rematch').textContent = room?.rematch === room?.side && mode === 'online' ? 'Request sent ♡' : 'New game ↻';
  $('#rematchRequest').hidden = mode !== 'online' || !room?.rematch || room.rematch === room.side;
  $('#copy').hidden = mode !== 'online';

  renderArcade();
  updateCelebration();
}

/** Everything that is not the checkers board. */
function renderArcade() {
  const game = kind();
  const checkers = game === 'checkers';

  $('.board-stage').hidden = !checkers;
  $('#arcadeSurface').hidden = checkers;
  $('#hintButton').hidden = !checkers;
  $('#view').hidden = !checkers;
  $('#gameHeading').textContent = gameNames[game] + (game === 'puzzle' ? ' · a little piece of us.' : ' · with love.');
  $('#gameQuip').textContent = game === 'checkers' ? 'Love you. Still taking your pieces.'
    : game === 'connect4' ? 'Four little hearts. One very big crush.'
      : game === 'draw' ? 'Your terrible drawings are my favorite.'
        : 'We make a pretty good picture.';

  for (const [name, id] of Object.entries(SURFACES)) $(`#${id}Surface`).hidden = game !== name;
  for (const button of $$('[data-switch]')) button.classList.toggle('current', button.dataset.switch === game);
  for (const side of ['rose', 'cream']) $(`#${side}Count`).parentElement.hidden = !checkers;

  const switchRequest = state.switchRequest;
  $('#switchRequest').hidden = !switchRequest;
  $('#switchText').textContent = switchRequest
    ? `${switchRequest.side === room?.side ? 'Waiting for your person to accept ' : `${names[switchRequest.side]} wants to play `}${gameNames[switchRequest.game]} ♡`
    : '';
  $('#acceptSwitch').hidden = !!switchRequest && switchRequest.side === room?.side;

  if (game === 'connect4') renderConnectFour();
  if (game === 'draw') renderDrawing();
  if (game === 'puzzle') renderPuzzle();
  if (game === 'memory') renderMemory();
  if (game === 'rps') renderThrows();
}

/* -------------------------------------------------------- 5 checkers input */

function select(index) {
  if (!canMove()) {
    toast(!ready() ? 'Waiting for your person to connect.' : `It’s ${names[state.turn]}’s turn ♡`);
    return;
  }
  if (canSelect(index)) {
    selected = selected === index ? null : index;
    render();
    return;
  }
  if (selected !== null && !state.board[index]) {
    move(selected, index);
    return;
  }
  if (mode === 'online' && state.board[index]?.side !== room.side) toast('Those are your person’s pieces ♡');
}

async function move(from, to) {
  if (!canSelect(from)) return;
  const next = apply(state, from, to);
  if (!next) {
    toast(state.forced !== null ? 'Finish the multi-jump with the same piece.'
      : moves(state).some(m => m.capture !== undefined) ? 'A capture is required this turn. Use Hint if you need help.'
        : 'That move breaks the rules. Try a diagonal move on a dark square.');
    return;
  }
  if (mode === 'online') {
    await action('move', { from, to, revision: room.revision });
    return;
  }
  state = next;
  selected = null;
  hints = false;
  if (state.winner && state.winner !== 'draw') score[state.winner]++;
  audio.chime(false);
  render();
}

function startDrag(event, index) {
  if (event.button !== 0 || !canSelect(index)) return;
  drag = { index, x: event.clientX, y: event.clientY, ghost: null };
}

addEventListener('pointermove', event => {
  if (!drag) return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
    selected = drag.index;
    render();
    drag.ghost = document.createElement('div');
    drag.ghost.className = `piece ${state.board[drag.index].side} dragghost`;
    drag.ghost.textContent = state.board[drag.index].king ? '♛' : '♥';
    document.body.append(drag.ghost);
  }
  if (drag.ghost) {
    event.preventDefault();
    drag.ghost.style.left = `${event.clientX - 27}px`;
    drag.ghost.style.top = `${event.clientY - 27}px`;
  }
}, { passive: false });

addEventListener('pointerup', event => {
  if (!drag) return;
  const dropped = drag;
  drag = null;
  if (!dropped.ghost) return;
  dropped.ghost.remove();
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-index]');
  if (target) move(dropped.index, Number(target.dataset.index));
  // Swallow the click this pointer sequence is about to fire on the square.
  const suppress = clickEvent => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
  };
  document.addEventListener('click', suppress, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', suppress, true), 0);
});

addEventListener('pointercancel', () => {
  drag?.ghost?.remove();
  drag = null;
});

/* -------------------------------------------------- 6 talking to the server */

/** Fold a fresh room snapshot into local state. */
function ingest(data) {
  const firstSnapshot = !room || room.id !== data.id;
  const previousTurn = state.turn;
  if (room && data.id === room.id && data.revision < room.revision) return;

  const changed = kind() !== (data.state.game || 'checkers')
    || state.ply !== data.state.ply
    || JSON.stringify(state.board) !== JSON.stringify(data.state.board);

  room = data;
  state = data.state;
  score = data.score;
  names = data.names;
  healthy = true;

  if (!firstSnapshot && previousTurn !== state.turn && state.turn === room.side && turnChime) audio.chime(false);
  if (changed) {
    selected = null;
    hints = false;
    puzzlePick = null;
    localPromptHidden = false;
    audio.chime(false);
  }

  const messages = $('#messages');
  const wasAtBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 50;
  for (const message of room.messages) {
    if (seenMessages.has(message.id)) continue;
    seenMessages.add(message.id);
    if (!firstSnapshot && message.side !== room.side) incomingMessage(message);
    $('.chat-intro')?.remove();
    const bubble = document.createElement('div');
    bubble.className = `message${message.side === room.side ? ' mine' : ''}`;
    const label = document.createElement('small');
    label.textContent = names[message.side];
    bubble.append(label, document.createTextNode(message.text));
    messages.append(bubble);
    if (message.emoji && Date.now() - message.at < 5000) burst(message.text);
  }
  while (messages.children.length > 100) messages.firstElementChild.remove();
  if (wasAtBottom) messages.scrollTop = messages.scrollHeight;

  // Never redraw out from under a drag or a brush stroke.
  if (!drag?.ghost && !stroke && !puzzleDrag?.ghost && (changed || !busy)) render();
}

async function action(type, body = {}) {
  if (!room || busy) return false;
  busy = true;
  const id = room.id;
  try {
    const data = await request(`/api/rooms/${id}/${type}`, body);
    if (room?.id === id) ingest(data);
    return true;
  } catch (error) {
    toast(error.message);
    if (error.status === 409) await syncRoom();
    return false;
  } finally {
    busy = false;
    render();
  }
}

async function syncRoom() {
  if (mode !== 'online' || !room) return;
  const id = room.id;
  try {
    const data = await request(`/api/rooms/${id}/sync`, {});
    if (room?.id === id) ingest(data);
  } catch (error) {
    if (room?.id !== id) return;
    if (error.status === 410 || error.status === 404) {
      toast(error.message);
      goMenu();
      showLobby();
      return;
    }
    healthy = false;
    render();
  }
}

function scheduleSync() {
  clearTimeout(pollTimer);
  const generation = sessionGeneration;
  pollTimer = setTimeout(async () => {
    if (generation !== sessionGeneration) return;
    if (!busy) await syncRoom();
    if (generation === sessionGeneration && mode === 'online') scheduleSync();
  }, 1500);
}

/* ------------------------------------------------- 7 menu, lobby and rooms */

function openGameScreen() {
  clearUnread();
  setMobilePanel('game', false);
  document.body.classList.add('in-game');
  $('#mobileTabs').hidden = false;
  clearPhoto();
  $('#menu').hidden = true;
  $('#gameScreen').hidden = false;
  scrollTo(0, 0);
}

/** Enter an online room with its first snapshot. */
function enter(data) {
  openGameScreen();
  sessionGeneration++;
  clearInterval(lobbyTimer);
  mode = 'online';
  room = null;
  state = initial();
  selected = null;
  hints = false;
  seenMessages = new Set();
  $('#messages').replaceChildren();
  ingest(data);
  try {
    sessionStorage.setItem('checkers-room-v2', data.id);
  } catch {
    /* ignore */
  }
  scheduleSync();
}

function goMenu() {
  celebration.reset();
  resetThrow();
  document.body.classList.remove('in-game');
  $('#mobileTabs').hidden = true;
  clearUnread();
  sessionGeneration++;
  clearTimeout(pollTimer);
  clearInterval(lobbyTimer);
  mode = null;
  room = null;
  busy = false;
  selected = null;
  hints = false;
  drag?.ghost?.remove();
  drag = null;
  $('#gameScreen').hidden = true;
  $('#menu').hidden = false;
  $('#lobby').hidden = true;
  $('#modeChoices').hidden = false;
  try {
    sessionStorage.removeItem('checkers-room-v2');
  } catch {
    /* ignore */
  }
  history.replaceState(null, '', location.pathname);
  scrollTo(0, 0);
}

function showLobby() {
  $('#modeChoices').hidden = true;
  $('#lobby').hidden = false;
  loadRooms();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(() => {
    if (!document.hidden) loadRooms();
  }, 10000);
}

async function loadRooms() {
  const list = $('#roomList');
  $('#refreshRooms').disabled = true;
  try {
    const data = await request('/api/rooms');
    list.replaceChildren();
    $('#roomTotal').textContent = `${data.rooms.length} active`;
    if (!data.rooms.length) {
      const empty = document.createElement('div');
      empty.className = 'room-empty';
      empty.textContent = 'No dates in progress yet ♡ Create a room and your person will find it here.';
      list.append(empty);
    }
    for (const entry of data.rooms) {
      const row = document.createElement('div');
      row.className = 'room-row';
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      const join = document.createElement('button');
      title.textContent = entry.name;
      meta.textContent = `${gameNames[entry.game] || 'Checkers'} · ${entry.hostName} · ${entry.players}/2 players${entry.locked ? ' · Password protected' : ''}`;
      detail.append(title, meta);
      join.textContent = entry.joinable ? 'Join ♡' : 'Full';
      join.disabled = !entry.joinable;
      join.onclick = () => openJoin(entry.id, entry.name);
      row.append(detail, join);
      list.append(row);
    }
  } catch (error) {
    $('#roomTotal').textContent = 'Unavailable';
    list.replaceChildren();
    const failure = document.createElement('div');
    failure.className = 'room-empty';
    failure.textContent = `${error.message} Tap Refresh to retry.`;
    list.append(failure);
  } finally {
    $('#refreshRooms').disabled = false;
  }
}

/** Accept a raw room id or a full invite link. */
function parseCode(value) {
  let code = value.trim();
  try {
    if (code.includes('#')) code = new URL(code).hash.slice(1);
  } catch {
    /* Not a URL: treat the text as a code. */
  }
  return /^[a-f0-9-]{36}$/.test(code) ? code : null;
}

function openJoin(id, name = 'Your little checkers date') {
  joinId = id;
  $('#joinRoomTitle').textContent = name;
  $('#guestPin').value = '';
  $('#joinError').textContent = '';
  $('#joinDialog').showModal();
}

$('#chooseOnline').onclick = showLobby;
$('#backModes').onclick = goMenu;

$('#chooseLocal').onclick = () => {
  openGameScreen();
  mode = 'local';
  state = newGame(preferredGame);
  score = { rose: 0, cream: 0 };
  names = { rose: 'Dylan', cream: 'Audrey' };
  room = null;
  selected = null;
  hints = false;
  $('#messages').replaceChildren(chatIntro());
  render();
};

function chatIntro() {
  const intro = document.createElement('div');
  intro.className = 'chat-intro';
  const heading = document.createElement('b');
  heading.textContent = 'You’re already side by side ♡';
  const note = document.createElement('p');
  note.textContent = 'Love notes are available in online rooms.';
  intro.append(heading, note);
  return intro;
}

$('#createRoomForm').onsubmit = async event => {
  event.preventDefault();
  $('#host').disabled = true;
  try {
    enter(await request('/api/rooms', {
      name: $('#newRoomName').value,
      playerName: $('#playerName').value,
      side: $('#playerSide').value,
      pin: $('#newRoomPin').value,
      game: preferredGame,
    }));
    $('#newRoomPin').value = '';
  } catch (error) {
    toast(error.message);
  } finally {
    $('#host').disabled = false;
  }
};

$('#refreshRooms').onclick = loadRooms;

$('#joinCodeForm').onsubmit = event => {
  event.preventDefault();
  const id = parseCode($('#roomCode').value);
  if (id) openJoin(id);
  else toast('Paste a current room code or invitation.');
};

$('#joinRoomForm').onsubmit = async event => {
  event.preventDefault();
  $('#confirmJoin').disabled = true;
  try {
    const data = await request(`/api/rooms/${joinId}/join`, {
      playerName: $('#guestName').value,
      pin: $('#guestPin').value,
    });
    $('#joinDialog').close();
    enter(data);
  } catch (error) {
    $('#joinError').textContent = error.message;
  } finally {
    $('#confirmJoin').disabled = false;
  }
};

$('#closeJoin').onclick = () => $('#joinDialog').close();

$('#copy').onclick = async () => {
  const url = new URL(location.href);
  url.hash = room.id;
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Invite copied. Send it to your person ♡');
  } catch {
    prompt('Copy your invitation', url.href);
  }
};

$('#local').onclick = async () => {
  if (mode === 'online') {
    if (!confirm('End this room for both players and go back to the menu?')) return;
    try {
      await request(`/api/rooms/${room.id}/leave`, {});
    } catch (error) {
      if (error.status !== 410 && error.status !== 404) {
        toast(error.message);
        return;
      }
    }
  } else if (state.ply && !confirm('Leave this local game?')) {
    return;
  }
  goMenu();
};

$('#chatForm').onsubmit = async event => {
  event.preventDefault();
  const text = $('#chatInput').value.trim();
  if (text && mode === 'online' && await action('chat', { text })) $('#chatInput').value = '';
};

for (const button of $$('[data-emoji]')) {
  button.onclick = () => {
    if (mode === 'online') action('chat', { text: button.dataset.emoji, emoji: true });
    else burst(button.dataset.emoji);
  };
}

/* ------------------------------------------------ 8 game switching and moves */

function setGame(game) {
  state = newGame(game);
  selected = null;
  hints = false;
  puzzlePick = null;
  localRpsReady = false;
  localPromptHidden = false;
  clearPhoto();
  render();
}

for (const button of $$('[data-pick]')) {
  button.onclick = () => {
    preferredGame = button.dataset.pick;
    for (const card of $$('[data-pick]')) card.classList.toggle('chosen', card === button);
    $('#selectedGameLabel').textContent = `${gameNames[preferredGame]} selected · choose how to play`;
    $('#createGameLabel').textContent = `Playing ${gameNames[preferredGame]}`;
  };
}

for (const button of $$('[data-switch]')) {
  button.onclick = () => {
    const game = button.dataset.switch;
    if (game === kind()) return;
    if (mode === 'local') {
      if (confirm(`Switch to ${gameNames[game]}? This ends the current game.`)) setGame(game);
    } else {
      action('switch', { game });
    }
  };
}

$('#acceptSwitch').onclick = () => action('switch', { accept: true });
$('#declineSwitch').onclick = () => action('switch', { accept: false });

$('#rematch').onclick = () => {
  if (mode === 'local') {
    if (!confirm('Start a fresh game?')) return;
    state = newGame(kind(), { config: state.config, photoKey: state.photoKey });
    selected = null;
    hints = false;
    puzzlePick = null;
    render();
  } else {
    action('rematch');
  }
};

$('#acceptRematch').onclick = () => action('rematch', { accept: true });
$('#declineRematch').onclick = () => action('rematch', { accept: false });

$('#hintButton').onclick = () => {
  hints = !hints;
  if (hints && selected === null) toast('Select a piece to see its legal destinations.');
  else if (hints && !moves(state).some(m => m.from === selected)) {
    toast('This piece cannot move now. A capture elsewhere or a continued jump may be required.');
  }
  render();
};

$('#view').onclick = () => {
  const flat = $('.board-stage').classList.toggle('flat');
  $('#view').textContent = flat ? '◇ 3D view' : '↓ Top view';
};

$('#sound').onclick = () => {
  sound = !sound;
  writeFlag('arcade-sound', sound);
  $('#sound').setAttribute('aria-pressed', String(sound));
  $('#sound').textContent = sound ? '♪ Sound on' : '♪ Sound off';
  if (sound) audio.unlock();
  audio.chime(false);
};

const RULE_NOTES = {
  connect4: 'Take turns dropping a heart. Four in a row wins.',
  draw: 'The artist sketches a secret prompt. The other player guesses. Take turns after each round.',
  puzzle: 'Work together: drag a tile or tap it, then select its matching square. Correct pieces stay in place.',
  memory: 'Flip two cards. Match a pair to keep your turn. Most pairs wins.',
  rps: 'Choose secretly. Both choices reveal together. First to three round wins takes the match.',
};

$('#rules').onclick = () => {
  if (kind() === 'checkers') $('#rulesDialog').showModal();
  else toast(RULE_NOTES[kind()]);
};

for (const button of $$('#rulesDialog .close')) button.onclick = () => $('#rulesDialog').close();

/** Send a move for whichever game is open. Local play applies it directly. */
async function play(body) {
  if (busy || !ready()) {
    toast('Wait for both players to be ready ♡');
    return false;
  }
  if (mode === 'online') return action('play', { ...body, revision: room.revision });

  try {
    const game = kind();
    let next;
    if (game === 'connect4') next = dropHeart(state, body.column, state.turn);
    else if (game === 'puzzle') next = puzzleAction(state, body);
    else if (game === 'memory') next = memoryAction(state, body.index, state.turn);
    else if (game === 'rps') next = rpsAction(state, body, state.picks.rose ? 'cream' : 'rose');
    else next = drawingAction(state, body.action, body, body.action === 'guess' ? other(state.turn) : state.turn);
    if (!next) throw new Error('That piece does not fit there.');

    if (!state.winner && next.winner) {
      if (next.winner === 'together') {
        score.rose++;
        score.cream++;
      } else if (['rose', 'cream'].includes(next.winner)) {
        score[next.winner]++;
      }
    }
    state = next;
    if (body.action !== 'rotate') puzzlePick = null;
    render();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

/* ------------------------------------------------------------ 9 the games */

// Connect Four ---------------------------------------------------------------

function renderConnectFour() {
  const board = $('#connectBoard');
  board.replaceChildren();
  for (let column = 0; column < 7; column++) {
    const stack = document.createElement('button');
    stack.className = 'connect-column';
    stack.setAttribute('aria-label', `Drop a heart in column ${column + 1}`);
    stack.disabled = !canMove() || !!state.board[column];
    stack.onclick = () => play({ column });
    for (let row = 0; row < 6; row++) {
      const index = row * 7 + column;
      const hole = document.createElement('span');
      hole.className = `connect-hole ${state.board[index] || ''}${state.winning?.includes(index) ? ' winning' : ''}`;
      hole.textContent = state.board[index] === 'rose' ? '♥' : '♡';
      stack.append(hole);
    }
    board.append(stack);
  }
  $('#hint').textContent = state.winner ? 'Another round, sweetheart?'
    : !ready() ? 'Waiting for both players…'
      : canMove() ? 'Choose a column to drop your heart.'
        : `${names[state.turn]} is choosing a column.`;
}

// Draw & Guess ---------------------------------------------------------------

function renderDrawing() {
  const artist = mode === 'local' || room?.side === state.turn;
  $('#drawRound').textContent = `ROUND ${state.round} · ${names[state.turn]} DRAWS`;
  $('#drawPrompt').textContent = state.revealed ? `It was ${state.word}!`
    : artist ? (localPromptHidden ? 'Prompt hidden ♡' : `Draw: ${state.word}`)
      : state.letters || 'Your person is drawing…';
  $('#hideWord').hidden = !artist || state.revealed;
  $('#hideWord').textContent = localPromptHidden ? 'Show prompt' : 'Hide prompt';
  $('.brushbar').hidden = !artist || state.revealed;
  $('#guessForm').hidden = state.revealed || (mode === 'online' && artist);
  $('#revealDrawing').hidden = !artist || state.revealed;
  $('#nextDrawing').hidden = !state.revealed;

  $('#drawInstructions').textContent = state.revealed
    ? state.winner === 'together' ? 'You got it! Both of you earn a point ♡' : 'A new round, a new masterpiece.'
    : artist
      ? mode === 'local'
        ? 'Read your prompt, hide it, then sketch while your person guesses.'
        : 'Your word is secret. Sketch it here; your person sees each stroke when you lift your brush.'
      : 'Type your guesses below. Only the artist can draw.';

  $('#guessFeedback').textContent = state.guesses?.length
    ? `Latest guesses: ${state.guesses.slice(-4).map(guess => guess.text).join(' · ')}`
    : '';
  $('#turn').textContent = state.revealed
    ? state.winner === 'together' ? 'You guessed it! ♡' : 'Round finished'
    : `${names[state.turn]} is the artist`;
  $('#hint').textContent = 'Draw, guess, laugh, switch places.';
  if (!stroke) paintSketch();
}

function drawStroke(context, { color, width, points }) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index) context.lineTo(x * 800, y * 500);
    else context.moveTo(x * 800, y * 500);
  });
  if (points.length === 1) {
    context.arc(points[0][0] * 800, points[0][1] * 500, width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.stroke();
  }
}

function paintSketch() {
  const context = $('#sketch').getContext('2d');
  context.clearRect(0, 0, 800, 500);
  for (const past of state.strokes || []) drawStroke(context, past);
  if (stroke) drawStroke(context, stroke);
}

function sketchPoint(event) {
  const box = $('#sketch').getBoundingClientRect();
  const clamp = value => Math.max(0, Math.min(1, value));
  return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
}

$('#sketch').onpointerdown = event => {
  const mine = mode !== 'online' || room.side === state.turn;
  if (kind() !== 'draw' || state.revealed || busy || !ready() || !mine) return;
  $('#sketch').setPointerCapture(event.pointerId);
  stroke = { points: [sketchPoint(event)], color: $('#ink').value, width: Number($('#brush').value) };
  paintSketch();
};

$('#sketch').onpointermove = event => {
  if (!stroke) return;
  event.preventDefault();
  stroke.points.push(sketchPoint(event));
  // Long strokes get thinned so they survive the server's 80-point limit.
  if (stroke.points.length > 400) stroke.points = stroke.points.filter((_, index) => index % 2 === 0);
  paintSketch();
};

$('#sketch').onpointerup = async () => {
  if (!stroke) return;
  const finished = stroke;
  stroke = null;
  if (finished.points.length > 80) {
    const source = finished.points;
    finished.points = Array.from({ length: 80 }, (_, i) => source[Math.round((i * (source.length - 1)) / 79)]);
  }
  await play({ action: 'stroke', ...finished });
  paintSketch();
};

$('#sketch').onpointercancel = () => {
  stroke = null;
  paintSketch();
};

$('#undoStroke').onclick = () => play({ action: 'undo' });
$('#clearDrawing').onclick = () => {
  if (confirm('Clear this drawing?')) play({ action: 'clear' });
};
$('#hideWord').onclick = () => {
  localPromptHidden = !localPromptHidden;
  renderArcade();
};
$('#guessForm').onsubmit = async event => {
  event.preventDefault();
  if (await play({ action: 'guess', text: $('#guessInput').value })) $('#guessInput').value = '';
};
$('#revealDrawing').onclick = () => play({ action: 'reveal' });
$('#nextDrawing').onclick = () => {
  localPromptHidden = false;
  play({ action: 'next' });
};

// Photo Puzzle ---------------------------------------------------------------

function clearPhoto() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  photoKeyLoaded = null;
  $('#puzzlePreview').removeAttribute('src');
}

async function placePuzzle(piece, target) {
  if ((state.rotations?.[piece] || 0) !== 0) {
    toast('Rotate this piece until it is upright.');
    return;
  }
  if (piece !== target) {
    toast('Almost! That piece belongs somewhere else.');
    return;
  }
  await play({ piece, target });
  puzzlePick = null;
}

function beginPuzzleDrag(event, id, tile) {
  if (event.button !== 0 || busy || !ready()) return;
  puzzleDrag = { id, x: event.clientX, y: event.clientY, tile, ghost: null };
}

addEventListener('pointermove', event => {
  if (!puzzleDrag) return;
  const dragging = puzzleDrag;
  if (!dragging.ghost && Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) > 7) {
    const ghost = document.createElement('div');
    ghost.className = 'puzzle-ghost';
    for (const property of ['backgroundImage', 'backgroundPosition', 'backgroundSize', 'clipPath', 'transform']) {
      ghost.style[property] = dragging.tile.style[property];
    }
    if (!photoUrl) ghost.textContent = dragging.id + 1;
    document.body.append(ghost);
    dragging.ghost = ghost;
  }
  if (dragging.ghost) {
    event.preventDefault();
    dragging.ghost.style.left = `${event.clientX - 35}px`;
    dragging.ghost.style.top = `${event.clientY - 35}px`;
  }
}, { passive: false });

addEventListener('pointerup', event => {
  if (!puzzleDrag) return;
  const dropped = puzzleDrag;
  puzzleDrag = null;
  if (!dropped.ghost) return;
  dropped.ghost.remove();
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-target]');
  if (target) placePuzzle(dropped.id, Number(target.dataset.target));
});

addEventListener('pointercancel', () => {
  puzzleDrag?.ghost?.remove();
  puzzleDrag = null;
});

async function loadPhoto() {
  photoLoading = true;
  const key = state.photoKey;
  const id = room?.id;
  try {
    if (!key) {
      clearPhoto();
      return;
    }
    const response = await fetch(`/api/rooms/${id}/photo-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Player-Token': token },
      body: '{}',
    });
    if (!response.ok) throw new Error('Could not load the shared photo.');
    const blob = await response.blob();
    if (room?.id !== id || state.photoKey !== key) return;
    clearPhoto();
    photoUrl = URL.createObjectURL(blob);
    photoKeyLoaded = key;
    $('#photoStatus').textContent = 'Your shared photo is ready. Piece it together ♡';
  } catch (error) {
    photoKeyLoaded = key;
    $('#photoStatus').textContent = `${error.message} Reopen the room to retry.`;
  } finally {
    photoLoading = false;
    if (kind() === 'puzzle') renderArcade();
  }
}

/** Crop to a square, shrink to 640px and hand the JPEG to the room. */
$('#puzzleFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 15000000) {
    toast('Choose a photo smaller than 15 MB.');
    return;
  }
  if (busy) return;
  busy = true;
  $('#photoStatus').textContent = 'Preparing your memory…';
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    const size = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 640, 640);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size > 400000) throw new Error('That photo is too detailed. Try a smaller one.');

    if (mode === 'online') {
      const response = await fetch(`/api/rooms/${room.id}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', 'X-Player-Token': token },
        body: blob,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      clearPhoto();
      ingest(data);
    } else {
      clearPhoto();
      photoUrl = URL.createObjectURL(blob);
      state = newGame('puzzle', { config: state.config });
      $('#photoStatus').textContent = 'Your photo is ready. Piece it together ♡';
    }
    puzzlePick = null;
  } catch (error) {
    $('#photoStatus').textContent = error.message;
  } finally {
    busy = false;
    event.target.value = '';
    render();
  }
};

function renderPuzzle() {
  const config = puzzleOptions(state);
  const size = config.size;
  const triangles = config.cut === 'triangles';
  const total = state.board.length;
  const placed = state.board.filter(value => value !== null).length;

  $('#puzzleProgress').textContent = `${placed} of ${total} pieces together`;
  $('#puzzleConfigLabel').textContent = `${total} pieces${config.rotate ? ' · rotation on' : ''}`;
  $('#turn').textContent = state.winner ? 'A perfect picture. A perfect team. ♡' : 'Build it together ♡';
  $('#hint').textContent = 'Tap a tile, rotate if needed, then tap where it belongs.';
  $('#rotatePuzzlePiece').hidden = !config.rotate;
  $('#rotatePuzzlePiece').disabled = puzzlePick === null || busy || !ready();
  $('#zoomPuzzleBoard').textContent = puzzleZoom ? 'Fit board ↙' : 'Enlarge board ⤢';

  const request = state.puzzleRequest;
  $('#puzzleConfigRequest').hidden = !request;
  $('#puzzleConfigText').textContent = request
    ? `${request.side === room?.side ? 'You proposed' : `${names[request.side]} proposed`} ${request.config.size} × ${request.config.size}, ${request.config.cut}${request.config.rotate ? ', with rotation' : ''}. This restarts the puzzle.`
    : '';
  $('#acceptPuzzleConfig').hidden = !!request && request.side === room?.side;

  const board = $('#puzzleBoard');
  const tray = $('#puzzleTray');
  board.replaceChildren();
  tray.replaceChildren();
  board.style.gridTemplateColumns = `repeat(${size},1fr)`;
  board.style.minWidth = puzzleZoom ? `${size * 70}px` : '0';
  board.classList.toggle('triangle-board', triangles);

  /** Paint tile `id` — a slice of the photo, or a numbered practice tile. */
  const paint = (element, id) => {
    const cell = triangles ? Math.floor(id / 2) : id;
    if (photoUrl) {
      element.style.backgroundImage = `url("${photoUrl}")`;
      element.style.backgroundSize = `${size * 100}% ${size * 100}%`;
      element.style.backgroundPosition = `${((cell % size) * 100) / (size - 1)}% ${(Math.floor(cell / size) * 100) / (size - 1)}%`;
    } else {
      const label = document.createElement('span');
      label.className = triangles ? `practice-triangle ${id % 2 ? 'lower' : 'upper'}` : 'practice-square';
      label.textContent = id + 1;
      element.append(label);
    }
    if (triangles) {
      element.style.clipPath = id % 2 === 0 ? 'polygon(0 0,100% 0,0 100%)' : 'polygon(100% 0,100% 100%,0 100%)';
      element.classList.add('tri-tile');
    }
  };

  for (let cell = 0; cell < size * size; cell++) {
    const group = document.createElement('div');
    group.className = 'puzzle-cell';
    for (let half = 0; half < (triangles ? 2 : 1); half++) {
      const id = triangles ? cell * 2 + half : cell;
      const slot = document.createElement('button');
      slot.className = `puzzle-slot${state.board[id] !== null ? ' placed' : ''}`;
      slot.dataset.target = id;
      slot.setAttribute('aria-label', `Row ${Math.floor(cell / size) + 1}, column ${(cell % size) + 1}${triangles ? `, ${half ? 'lower' : 'upper'} triangle` : ''}`);
      if (state.board[id] !== null) {
        paint(slot, id);
      } else if (triangles) {
        slot.style.clipPath = half ? 'polygon(100% 0,100% 100%,0 100%)' : 'polygon(0 0,100% 0,0 100%)';
      }
      slot.onclick = () => {
        if (puzzlePick !== null) placePuzzle(puzzlePick, id);
      };
      group.append(slot);
    }
    board.append(group);
  }

  for (const id of state.tray) {
    if (state.board[id] !== null) continue;
    const wrap = document.createElement('div');
    wrap.className = 'tray-piece-wrap';
    const tile = document.createElement('button');
    tile.className = `puzzle-tile${puzzlePick === id ? ' selected' : ''}`;
    const turns = state.rotations?.[id] || 0;
    tile.setAttribute('aria-label', `Select piece ${state.tray.indexOf(id) + 1}${config.rotate ? `, rotation ${turns * 90} degrees` : ''}`);
    tile.setAttribute('aria-pressed', String(puzzlePick === id));
    paint(tile, id);
    tile.style.transform = `rotate(${turns * 90}deg)`;
    tile.onclick = () => {
      puzzlePick = id;
      renderPuzzle();
    };
    tile.onpointerdown = event => beginPuzzleDrag(event, id, tile);
    wrap.append(tile);
    tray.append(wrap);
  }

  if (mode === 'online' && state.photoKey !== photoKeyLoaded && !photoLoading) loadPhoto();
  $('#puzzlePreview').hidden = !photoUrl;
  if (photoUrl) $('#puzzlePreview').src = photoUrl;
  $('#photoReference').hidden = !photoUrl || !config.peek;
  if (!config.peek) $('#photoReference').open = false;
}

$('#rotatePuzzlePiece').onclick = async () => {
  const id = puzzlePick;
  if (id === null) return;
  if (await play({ action: 'rotate', piece: id })) {
    puzzlePick = id;
    renderPuzzle();
  }
};

$('#zoomPuzzleBoard').onclick = () => {
  puzzleZoom = !puzzleZoom;
  renderPuzzle();
};

const configFromForm = () => ({
  size: Number($('#puzzleSize').value),
  cut: $('#puzzleCut').value,
  rotate: $('#puzzleRotate').checked,
  peek: $('#puzzlePeek').checked,
});

function updateCutCount() {
  const config = configFromForm();
  const pieces = config.size * config.size * (config.cut === 'triangles' ? 2 : 1);
  $('#puzzleCutCount').textContent = `${pieces} pieces · changing options restarts this puzzle.`;
}

$('#puzzleConfigForm').onchange = updateCutCount;

$('#puzzleConfigForm').onsubmit = async event => {
  event.preventDefault();
  const config = configFromForm();
  if (mode === 'local') {
    if (!confirm('Start a new puzzle with these cuts and difficulty?')) return;
    state = newGame('puzzle', { config, photoKey: state.photoKey });
    puzzlePick = null;
    render();
  } else {
    await action('puzzle-config', { config });
  }
  $('#puzzleSettings').open = false;
};

$('#acceptPuzzleConfig').onclick = () => action('puzzle-config', { accept: true });
$('#declinePuzzleConfig').onclick = () => action('puzzle-config', { accept: false });

$('#puzzleSettings').ontoggle = () => {
  if (!$('#puzzleSettings').open || kind() !== 'puzzle') return;
  const config = puzzleOptions(state);
  $('#puzzleSize').value = String(config.size);
  $('#puzzleCut').value = config.cut;
  $('#puzzleRotate').checked = config.rotate;
  $('#puzzlePeek').checked = config.peek;
  updateCutCount();
};

// Memory Match ---------------------------------------------------------------

function renderMemory() {
  const visible = publicGame(state, room?.side || state.turn);
  const board = $('#memoryBoard');
  board.replaceChildren();
  $('#memoryScore').textContent = `${names.rose} ${state.points.rose} pairs  ♡  ${names.cream} ${state.points.cream} pairs`;

  for (let i = 0; i < 16; i++) {
    const face = visible.deck[i];
    const card = document.createElement('button');
    card.className = `memory-card${face ? ' face' : ''}${state.matched[i] ? ` matched ${state.matched[i]}` : ''}`;
    card.textContent = face || '♡';
    card.setAttribute('aria-label', face ? `Card ${i + 1}: ${face}` : `Flip card ${i + 1}`);
    card.disabled = !canMove() || !!state.matched[i] || visible.flipped.includes(i) || state.revealUntil > Date.now();
    card.onclick = () => play({ index: i });
    board.append(card);
  }

  $('#hint').textContent = state.winner ? 'Every pair found. Another round?'
    : state.revealUntil > Date.now() ? 'Remember those two…'
      : 'Find a pair to keep your turn.';

  // Redraw once the mismatched pair flips back over.
  clearTimeout(memoryTimer);
  if (state.revealUntil > Date.now()) {
    memoryTimer = setTimeout(() => {
      if (kind() === 'memory') renderMemory();
    }, state.revealUntil - Date.now() + 25);
  }
}

// Rock Paper Scissors --------------------------------------------------------

function renderThrows() {
  updateHands();
  const throwing = rpsThrowing();
  const mine = mode === 'online' ? room.side : state.picks.rose ? 'cream' : 'rose';
  const locked = !!state.picks[mine];
  const revealed = !!state.roundResult;
  const passing = mode === 'local' && !!state.picks.rose && !state.picks.cream && !localRpsReady;

  $('#rpsRound').textContent = `ROUND ${state.round} · FIRST TO THREE`;
  $('#rpsScore').textContent = `${names.rose} ${state.points.rose}  ♡  ${names.cream} ${state.points.cream}`;
  $('#rpsReveal').hidden = !revealed || throwing;
  $('#rpsReveal').textContent = revealed ? `${names.rose}: ${state.picks.rose}  ·  ${names.cream}: ${state.picks.cream}` : '';
  $('#rpsPass').hidden = !passing;
  $('#rpsChoices').hidden = revealed || passing;
  for (const button of $$('[data-throw]')) {
    button.disabled = busy || !ready() || locked || !!state.winner;
    button.classList.toggle('locked', locked && state.picks[mine] === button.dataset.throw);
  }
  $('#rpsNext').hidden = !revealed || !!state.winner || throwing;
  $('#rpsNext').disabled = busy || !ready();

  $('#rpsPrompt').textContent = throwing ? 'Three beats. No taking it back…'
    : state.winner ? `${names[state.winner]} wins the match!`
      : revealed ? (state.roundResult === 'draw' ? 'A tie! You’re too in sync.' : `${names[state.roundResult]} wins this throw.`)
        : passing ? `Choice locked. Pass the screen to ${names.cream}.`
          : locked ? 'Your choice is locked. Waiting for your person…'
            : `${names[mine]}, choose secretly.`;

  $('#turn').textContent = throwing ? 'Rock… paper… scissors…'
    : state.winner ? `${names[state.winner]} wins! ♡`
      : revealed ? 'The reveal!'
        : locked ? 'Choice locked ♡'
          : 'Make your secret choice';
  $('#hint').textContent = 'Rock beats scissors. Scissors beats paper. Paper beats rock.';

  // While the hands are still counting down, hold back the score that the
  // result would otherwise give away.
  if (!throwing) return;
  const points = { ...state.points };
  if (['rose', 'cream'].includes(state.roundResult)) points[state.roundResult]--;
  $('#rpsScore').textContent = `${names.rose} ${points.rose} ♡ ${names.cream} ${points.cream}`;
  const pending = document.createElement('li');
  pending.textContent = 'Both choices are locked. Here we go…';
  $('#history').replaceChildren(pending);
  if (state.winner) {
    const tally = { ...score };
    tally[state.winner]--;
    $('#score').textContent = `${names.rose} ${tally.rose} ♡ ${names.cream} ${tally.cream}`;
  }
  $('#rematch').disabled = true;
}

for (const button of $$('[data-throw]')) {
  button.onclick = async () => {
    const first = mode === 'local' && !state.picks.rose;
    await play({ choice: button.dataset.throw });
    if (first) localRpsReady = false;
    renderThrows();
  };
}

$('#rpsPass').onclick = () => {
  localRpsReady = true;
  renderThrows();
};

$('#rpsNext').onclick = () => {
  localRpsReady = false;
  play({ action: 'next' });
};

/* --------------------------------------------- 10 alerts and notifications */

function chatIsVisible() {
  if (document.hidden || !document.hasFocus()) return false;
  if (matchMedia('(max-width: 760px)').matches) return mobilePanel === 'chat' && mode !== null;
  const box = $('.chat').getBoundingClientRect();
  return box.top < innerHeight && box.bottom > 0;
}

function paintUnread() {
  for (const id of ['mobileUnread', 'desktopUnread']) {
    $(`#${id}`).hidden = unread === 0;
    $(`#${id}`).textContent = unread > 99 ? '99+' : unread;
  }
  document.title = (unread ? `(${unread}) ` : '') + PAGE_TITLE;
}

function clearUnread() {
  unread = 0;
  paintUnread();
}

async function incomingMessage(message) {
  const quiet = Date.now() - lastAlert > 900;
  if (messageChime && quiet) audio.chime(true);
  const canSee = chatIsVisible();
  if (!canSee) {
    unread++;
    paintUnread();

    if (!document.hidden) {
      toast(`${names[message.side]} sent you ${message.emoji ? 'a little reaction ♡' : 'a love note ♡'}`);
    }
  }
  const hiddenPage = document.hidden || !document.hasFocus();
  if (systemAlerts && !canSee && hiddenPage && quiet && 'Notification' in window && Notification.permission === 'granted') {
    try {
      // The message itself never leaves the page.
      const options = { body: 'A new love note is waiting in your room.', tag: 'arcade-love-note', data: { type: 'chat' } };
      if (notificationRegistration) {
        await notificationRegistration.showNotification(`${names[message.side]} ♡`, options);
      } else {
        const notice = new Notification(`${names[message.side]} ♡`, options);
        notice.onclick = () => {
          window.focus();
          setMobilePanel('chat');
          notice.close();
        };
      }
    } catch {
      /* Notifications are best effort. */
    }
  }
  lastAlert = Date.now();
}

function setMobilePanel(panel, scroll = true) {
  mobilePanel = panel;
  document.body.dataset.panel = panel;
  for (const button of $$('[data-panel]')) {
    const active = button.dataset.panel === panel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
  if (panel === 'chat') {
    clearUnread();
    requestAnimationFrame(() => {
      $('#messages').scrollTop = $('#messages').scrollHeight;
      if (!matchMedia('(max-width: 760px)').matches && scroll) {
        $('.chat').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  } else if (scroll) {
    scrollTo({ top: 0, behavior: 'smooth' });
  }
}

for (const button of $$('[data-panel]')) button.onclick = () => setMobilePanel(button.dataset.panel);
addEventListener('focus', () => {
  if (chatIsVisible()) clearUnread();
});
document.addEventListener('visibilitychange', () => {
  if (chatIsVisible()) clearUnread();
});
addEventListener('scroll', () => {
  if (unread && chatIsVisible()) clearUnread();
}, { passive: true });

async function registerNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    notificationRegistration = await navigator.serviceWorker.ready;
  } catch {
    /* Without a worker we fall back to page notifications. */
  }
}

function showNotificationStatus() {
  const supported = 'Notification' in window;
  $('#enableNotifications').textContent = systemAlerts ? 'Turn browser notifications off' : 'Enable browser notifications';
  $('#notificationStatus').textContent = !supported
    ? 'This browser does not offer system notifications here. Message sounds and unread badges still work.'
    : Notification.permission === 'denied'
      ? 'Notifications are blocked in your browser settings. Sounds and badges still work.'
      : systemAlerts && Notification.permission === 'granted'
        ? 'Browser notifications are on for this device.'
        : 'Browser notifications are off. You can enable them above.';
  $('#messageSound').checked = messageChime;
  $('#turnSound').checked = turnChime;
  $('#lovebugToggle').checked = lovebugsWanted;
  $('#lovebugToggle').disabled = reducedMotion();
}

$('#notificationSettings').onclick = () => {
  showNotificationStatus();
  $('#alertsDialog').showModal();
};
$('#closeAlerts').onclick = () => $('#alertsDialog').close();
$('#messageSound').onchange = event => {
  messageChime = event.target.checked;
  saveAlertPrefs();
};
$('#turnSound').onchange = event => {
  turnChime = event.target.checked;
  saveAlertPrefs();
};
function setLadybugs(value) {
  lovebugsWanted = value;
  writeFlag('arcade-lovebugs', value);
  lovebugs.setEnabled(value);
  $('#disableLadybugs').textContent=value?'Hide ladybugs':'Show ladybugs';
  $('#disableLadybugs').setAttribute('aria-pressed',String(value));
  $('#lovebugToggle').checked=value;
}
$('#disableLadybugs').onclick=()=>setLadybugs(!lovebugsWanted);
$('#lovebugToggle').onchange = event => {
  setLadybugs(event.target.checked);
  lovebugsWanted = event.target.checked;
  writeFlag('arcade-lovebugs', lovebugsWanted);
  lovebugs.setEnabled(lovebugsWanted);
};
$('#testMessageSound').onclick = async () => {
  await audio.resume();
  audio.chime(true);
};

$('#enableNotifications').onclick = async () => {
  if (systemAlerts) {
    systemAlerts = false;
    saveAlertPrefs();
    showNotificationStatus();
    return;
  }
  if (!('Notification' in window)) {
    showNotificationStatus();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    systemAlerts = permission === 'granted';
    if (systemAlerts) await registerNotifications();
    saveAlertPrefs();
    showNotificationStatus();
  } catch {
    $('#notificationStatus').textContent = 'This browser could not enable notifications. Sounds and unread badges are still available.';
  }
};

navigator.serviceWorker?.addEventListener('message', event => {
  if (event.data?.type === 'open-chat') setMobilePanel('chat');
});

/* ------------------------------- 11 rock paper scissors scene + celebration */

let handScene = null;
let handLoading = false;
let throwKey = '';
let throwStarted = 0;
let throwTimer = null;

function resetThrow() {
  throwKey = '';
  throwStarted = 0;
  clearTimeout(throwTimer);
}

/** True while the three-bounce countdown is still playing. */
function rpsThrowing() {
  return kind() === 'rps'
    && !!state.roundResult
    && performance.now() - throwStarted < THROW_DURATION
    && !reducedMotion();
}

function updateHands() {
  if (!state.roundResult) resetThrow();
  const key = `${sessionGeneration}:${room?.id || 'local'}:${state.round}:${JSON.stringify(state.picks)}`;
  if (state.roundResult && throwKey !== key) {
    throwKey = key;
    throwStarted = performance.now();
    clearTimeout(throwTimer);
    throwTimer = setTimeout(() => {
      if (mode && kind() === 'rps' && throwKey === key) render();
    }, THROW_DURATION + 25);
  }

  const snapshot = () => ({
    key: throwKey || `waiting:${sessionGeneration}`,
    startAt: throwStarted,
    revealed: !!state.roundResult,
    picks: state.roundResult ? state.picks : null,
  });

  if (handScene) {
    handScene.update(snapshot());
    return;
  }
  if (handLoading) return;
  handLoading = true;
  // Three.js is a big download, so it only arrives when this game is opened.
  import('./rps-scene.mjs')
    .then(({ createArena }) => {
      handScene = createArena($('#rpsArena'), $('#rpsCountdown'));
      if (kind() === 'rps') handScene.update(snapshot());
    })
    .catch(() => {
      $('#rpsCountdown').textContent = 'Ready, set, throw!';
    });
}

const celebration = createCelebration({
  query: $,
  reducedMotion,
  onShow: () => {
    audio.fanfare();

  },
});

function updateCelebration() {
  const game = kind();
  const outcome = state.winner || (game === 'rps' ? state.roundResult : null);
  celebration.update({
    key: celebrationKey({ generation: sessionGeneration, game, outcome, ply: state.ply, round: state.round }),
    outcome,
    game,
    names,
    throwing: rpsThrowing(),
    matchOver: !!state.winner,
  });
}

$('#dismissVictory').onclick = () => celebration.close();
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') celebration.close();
});

/* -------------------------------------------------------- 12 lovebugs + boot */

for (const slot of $$('[data-lovebug-size]')) {
  decorate(slot, { size: Number(slot.dataset.lovebugSize), tilt: Number(slot.dataset.lovebugTilt || 0) });
}
lovebugs.setEnabled(lovebugsWanted);

document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
document.addEventListener('keydown', () => audio.unlock());
document.body.dataset.panel = 'game';
$('#sound').textContent = sound ? '♪ Sound on' : '♪ Sound off';
$('#sound').setAttribute('aria-pressed', String(sound));
if (systemAlerts) registerNotifications();

// An invite in the URL opens the join dialog; otherwise try to resume the seat
// this tab was already using.
queueMicrotask(() => {
  const invitation = parseCode(location.hash.slice(1));
  if (invitation) {
    showLobby();
    $('#roomCode').value = invitation;
    openJoin(invitation);
    return;
  }
  let saved;
  try {
    saved = sessionStorage.getItem('checkers-room-v2');
  } catch {
    /* ignore */
  }
  if (!saved) return;
  request(`/api/rooms/${saved}/sync`, {})
    .then(enter)
    .catch(() => {
      try {
        sessionStorage.removeItem('checkers-room-v2');
      } catch {
        /* ignore */
      }
    });
});

// ChatGPT app integration: let the host read the board.
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'get_checkers_game',
      description: 'Read selected game mode, board, player side and legal moves.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => ({ mode, side: room?.side, state, legal: moves(state) }),
    })).catch(() => {});
  } catch {
    /* Optional integration. */
  }
}

setLadybugs(lovebugsWanted);
