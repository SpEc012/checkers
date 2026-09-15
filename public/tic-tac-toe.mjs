// Board nodes survive room polling: placed pieces animate only once.
const SVG = 'http://www.w3.org/2000/svg';
const symbol = side => side === 'rose' ? 'heart' : 'tulip';
const icon = side => side === 'rose'
  ? '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 85C39 76 12 57 12 34C12 12 39 9 50 28C61 9 88 12 88 34C88 57 61 76 50 85Z" fill="currentColor"/><path d="M24 33Q26 22 37 25" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round"/></svg>'
  : '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 89V48" fill="none" stroke="#477a53" stroke-width="6" stroke-linecap="round"/><path d="M48 80C28 80 22 65 23 58C38 60 47 66 48 80ZM53 86C73 83 80 68 78 61C62 65 54 74 53 86Z" fill="#629765"/><path d="M28 29Q35 12 50 9Q65 12 72 29L66 49H34Z" fill="#ee92b1"/><path d="M22 20Q38 24 50 42Q62 24 78 20V38C78 60 66 67 50 67C34 67 22 57 22 38Z" fill="currentColor"/><path d="M50 42V59" fill="none" stroke="#b63766" stroke-width="3" stroke-linecap="round"/><path d="M30 32V40Q30 48 34 51" fill="none" stroke="#ffe4ef" stroke-width="4" stroke-linecap="round"/></svg>';

export function renderTicTacToe({ state, names, canMove, side, onMove, onRematch }) {
  const board = document.querySelector('#tttBoard');
  const focused = board.contains(document.activeElement) ? Number(document.activeElement.dataset.cell) : null;
  if (!board.children.length) {
    for (let i = 0; i < 9; i++) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.dataset.cell = i;
      tile.className = 'ttt-cell';
      board.append(tile);
    }
    board.addEventListener('keydown', event => {
      const i = Number(event.target.dataset.cell);
      if (!Number.isInteger(i)) return;
      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      board.children[(i + delta + 9) % 9].focus();
    });
  }
  [...board.children].forEach((tile, i) => {
    const value = state.board[i];
    const mark = value || '';
    if (tile.dataset.mark !== mark) {
      tile.dataset.mark = mark;
      tile.innerHTML = value ? `<span class="ttt-piece ttt-${value}">${icon(value)}</span>` : '';
    }
    tile.classList.toggle('winning', !!state.winning?.includes(i));
    tile.classList.toggle('last', state.last === i);
    tile.setAttribute('aria-label', `Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${value ? `${names[value]}'s ${symbol(value)}` : 'empty'}`);
    tile.setAttribute('aria-disabled', String(!canMove || !!value));
    tile.onclick = () => { if (canMove && !value) onMove(i); };
  });
  if (focused !== null) board.children[focused]?.focus({ preventScroll: true });
  board.dataset.turn = state.turn;
  const players = document.querySelector('#tttPlayers');
  if (!players.children.length) {
    for (const player of ['rose', 'cream']) {
      const pill = document.createElement('div');
      pill.className = `ttt-player ttt-${player}`;
      const art = document.createElement('span'); art.innerHTML = icon(player);
      const text = document.createElement('span');
      pill.append(art, text); players.append(pill);
    }
  }
  ['rose', 'cream'].forEach((player, i) => {
    const pill = players.children[i];
    pill.classList.toggle('active', !state.winner && state.turn === player);
    pill.lastChild.textContent = `${names[player]}${side === player ? ' (you)' : ''} · ${player === 'rose' ? 'hearts' : 'tulips'}`;
  });
  const status = state.winner === 'draw' ? 'A perfect tie. One more?' : state.winner
    ? `${names[state.winner]} wins! Three made for each other.`
    : `${names[state.turn]}'s turn · place a ${symbol(state.turn)}`;
  const label = document.querySelector('#tttStatus');
  if (label.textContent !== status) label.textContent = status;
  const overlay = document.querySelector('#tttLine');
  const lineKey = state.winning?.join(',') || '';
  if (overlay.dataset.line !== lineKey) {
    overlay.dataset.line = lineKey;
    overlay.replaceChildren();
    if (state.winning) {
      const start = state.winning[0], end = state.winning[2];
      const line = document.createElementNS(SVG, 'line');
      Object.entries({ x1: (start % 3) * 100 + 50, y1: Math.floor(start / 3) * 100 + 50,
        x2: (end % 3) * 100 + 50, y2: Math.floor(end / 3) * 100 + 50, pathLength: 1 }).forEach(([k,v]) => line.setAttribute(k,v));
      overlay.append(line);
    }
  }
  const again = document.querySelector('#tttAgain');
  again.hidden = !state.winner;
  again.onclick = onRematch;
}
