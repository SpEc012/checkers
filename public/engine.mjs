// American checkers, shared by the browser and the Worker.
//
// The board is a flat 64-entry array, index = row * 8 + column, row 0 at the
// top. `rose` moves up the board, `cream` moves down. Every function is pure:
// `apply` returns a brand new state or null when the move is not legal, which
// is what lets the server re-run exactly what the client just did.

const CROWN_ROW = { rose: index => index < 8, cream: index => index >= 56 };
const DRAW_AFTER_QUIET_PLIES = 80;

const square = index => `${String.fromCharCode(97 + (index % 8))}${8 - (index >> 3)}`;
const opponent = side => (side === 'rose' ? 'cream' : 'rose');

/** A fresh board with twelve pieces a side. */
export function initial() {
  return {
    board: Array.from({ length: 64 }, (_, index) => {
      const row = index >> 3;
      const column = index % 8;
      const playable = (row + column) % 2;
      if (!playable || (row >= 3 && row <= 4)) return null;
      return { side: row < 3 ? 'cream' : 'rose', king: false };
    }),
    turn: 'rose',
    forced: null, // mid-jump: only this square may move
    winner: null,
    ply: 0,
    quiet: 0, // plies since the last capture or crowning
    history: [],
  };
}

/**
 * Legal moves for the side to play. Captures are mandatory, so any jump hides
 * every plain move. Pass `only` to limit the search to one square.
 */
export function moves(state, only = null) {
  const jumps = [];
  const walks = [];

  for (let index = 0; index < 64; index++) {
    const piece = state.board[index];
    if (!piece || piece.side !== state.turn) continue;
    if (state.forced !== null && index !== state.forced) continue;
    if (only !== null && index !== only) continue;

    const row = index >> 3;
    const column = index % 8;
    const rowSteps = piece.king ? [-1, 1] : [piece.side === 'rose' ? -1 : 1];
    for (const rowStep of rowSteps) {
      for (const columnStep of [-1, 1]) {
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;
        if (nextRow < 0 || nextRow > 7 || nextColumn < 0 || nextColumn > 7) continue;

        const neighbour = nextRow * 8 + nextColumn;
        if (!state.board[neighbour]) {
          walks.push({ from: index, to: neighbour });
        } else if (state.board[neighbour].side !== piece.side) {
          const landingRow = row + 2 * rowStep;
          const landingColumn = column + 2 * columnStep;
          const inside = landingRow >= 0 && landingRow < 8 && landingColumn >= 0 && landingColumn < 8;
          if (inside && !state.board[landingRow * 8 + landingColumn]) {
            jumps.push({ from: index, to: landingRow * 8 + landingColumn, capture: neighbour });
          }
        }
      }
    }
  }

  if (jumps.length) return jumps;
  return state.forced !== null ? [] : walks;
}

/** Play `from` → `to`, or return null when that is not a legal move. */
export function apply(state, from, to) {
  if (state.winner) return null;
  const move = moves(state).find(option => option.from === from && option.to === to);
  if (!move) return null;

  const next = structuredClone(state);
  const piece = next.board[from];
  next.board[from] = null;
  next.board[to] = piece;
  if (move.capture !== undefined) next.board[move.capture] = null;

  const crowned = !piece.king && CROWN_ROW[piece.side](to);
  if (crowned) piece.king = true;

  next.ply++;
  next.quiet = move.capture !== undefined || crowned ? 0 : next.quiet + 1;
  next.history.push(`${square(from)} ${move.capture !== undefined ? '×' : '→'} ${square(to)}${crowned ? ' ♛' : ''}`);

  // A jumping piece keeps the turn while more captures remain — but crowning
  // always ends it.
  next.forced = move.capture !== undefined && !crowned ? to : null;
  if (next.forced !== null && !moves(next).some(option => option.capture !== undefined)) next.forced = null;
  if (next.forced === null) next.turn = opponent(next.turn);

  if (!moves(next).length) next.winner = piece.side;
  else if (next.quiet >= DRAW_AFTER_QUIET_PLIES) next.winner = 'draw';
  return next;
}
