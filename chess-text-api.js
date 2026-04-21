'use strict';

/**
 * Chess Text API — stateless REST API.
 * All game state is owned by the caller and sent with every request.
 * The server is side-effect-free: no sessions, no storage.
 *
 * Usage:  node chess-text-api.js
 *
 * Endpoints
 * ─────────
 *  POST /api/new          Start a new game  (opt body: { "style": "ascii" })
 *  POST /api/move         Make a move       { state, move: "e2e4" }
 *  POST /api/ai-move      AI plays          { state, difficulty: 1|2|3 }
 *  POST /api/resign       Resign            { state }
 *
 * Every response includes the full updated `state` to be stored by the caller.
 */

const http = require('http');
const path = require('path');
const express = require('express');

const Chess = require('./src/chess');
const AI    = require('./src/ai');

const app  = express();
const PORT = process.env.TEXT_API_PORT || 3001;

app.use(express.json({ limit: '2mb' }));

// Allow requests from any origin (file://, Live Server, etc.)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ─── Text rendering ──────────────────────────────────────────────────────────

// Piece encoding: lowercase = white, uppercase = black (engine convention)
const UNICODE = {
  k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙',  // white
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',  // black
};
const ASCII = {
  k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P',   // white
  K: 'k', q: 'q', r: 'r', b: 'b', n: 'n', P: 'p',   // black (lowercased)
};

/**
 * Render the board as an array of text lines.
 * White pieces are lowercase in the engine but displayed with uppercase symbols.
 * Black pieces are uppercase in the engine but displayed with solid symbols.
 *
 * @param {Array<Array<string|null>>} boardState
 * @param {object|null}               lastMove  { startR, startC, endR, endC }
 * @param {'unicode'|'ascii'}         style
 * @returns {string[]}
 */
function renderBoardLines(boardState, lastMove, style) {
  const map = style === 'ascii' ? ASCII : UNICODE;
  const files = '  a b c d e f g h';
  const sep   = '  -----------------';
  const lines = [files, sep];

  for (let r = 0; r < 8; r++) {
    const rank = 8 - r;
    const cells = boardState[r].map((p) => p ? (map[p] || p) : '.');
    lines.push(`${rank}| ${cells.join(' ')} |${rank}`);
  }

  lines.push(sep);
  lines.push(files);

  if (lastMove) {
    const from = Chess.coordsToAlgebraic(lastMove.startR, lastMove.startC);
    const to   = Chess.coordsToAlgebraic(lastMove.endR,   lastMove.endC);
    lines.push(`  Last move: ${from}-${to}`);
  }

  return lines;
}

// ─── Notation helpers ────────────────────────────────────────────────────────

/**
 * Convert an algebraic square like "e4" to { r, c } (0-based).
 */
function squareToCoords(sq) {
  const c = sq.charCodeAt(0) - 97; // 'a' → 0
  const r = 8 - parseInt(sq[1], 10);
  return { r, c };
}

/**
 * Parse long algebraic move notation: "e2e4", "g1f3", "e7e8q".
 * Returns { startR, startC, endR, endC, promotion } or null on failure.
 */
function parseLongAlgebraic(move) {
  const m = move.trim().toLowerCase();
  if (m.length < 4 || m.length > 5) return null;

  const from = squareToCoords(m.slice(0, 2));
  const to   = squareToCoords(m.slice(2, 4));

  if ([from.r, from.c, to.r, to.c].some(n => n < 0 || n > 7)) return null;

  const promotion = m.length === 5 ? m[4].toUpperCase() : null;
  return { startR: from.r, startC: from.c, endR: to.r, endC: to.c, promotion };
}

// ─── Response shape ──────────────────────────────────────────────────────────

function gameResponse(state, style) {
  const board = renderBoardLines(state.boardState, state.lastMove, style || 'unicode').join('\n');
  const inCheck = !state.gameOver && Chess.isInCheck(state, state.turn);
  // Encode each valid move as a compact 4-char string (e.g. "e2e4") — ~10× smaller than objects.
  const allValidMoves = state.gameOver ? [] :
    Chess.getAllValidMoves(state, state.turn).map(m =>
      String.fromCharCode(97 + m.startC) + (8 - m.startR) +
      String.fromCharCode(97 + m.endC)   + (8 - m.endR)
    );
  // boardHistory is not sent to clients; threefold repetition is tracked via positionKeys.
  const posKey = Chess.positionKey(state.boardState, state.canCastle, state.turn);
  const positionKeys = [...(state.positionKeys || []), posKey];
  // eslint-disable-next-line no-unused-vars
  const { boardHistory: _bh, ...stateWithout } = state;
  return { state: { ...stateWithout, positionKeys }, board, inCheck, allValidMoves };
}

/** Send JSON as a raw UTF-8 buffer — bypasses Express string transforms. */
function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.status(status)
     .set('Content-Type', 'application/json; charset=utf-8')
     .set('Content-Length', body.length)
     .end(body);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/new
 * Start a fresh game. Optional body: { "style": "ascii" }
 * Returns a full game response including the initial state.
 */
app.post('/api/new', (req, res) => {
  const state = Chess.createInitialState();
  const style = req.body?.style === 'ascii' ? 'ascii' : 'unicode';
  sendJson(res, 201, gameResponse(state, style));
});

/**
 * POST /api/move
 * Make a human move.
 * Body: { state, move: "e2e4", style?: "ascii" }
 */
app.post('/api/move', (req, res) => {
  const { state, move: raw, style } = req.body || {};
  if (!state) return sendJson(res, 400, { error: 'Provide { state, move }' });
  state.boardHistory = [];
  if (state.gameOver) return sendJson(res, 400, { error: 'Game is over', gameResult: state.gameResult });

  if (!raw || typeof raw !== 'string') {
    return sendJson(res, 400, { error: 'Provide move as long algebraic, e.g. "e2e4"' });
  }

  const parsed = parseLongAlgebraic(raw);
  if (!parsed) {
    return sendJson(res, 400, { error: 'Invalid move format. Use long algebraic, e.g. "e2e4" or "e7e8q"' });
  }

  const result = Chess.makeMove(state, parsed.startR, parsed.startC, parsed.endR, parsed.endC, parsed.promotion);
  if (!result.success) return sendJson(res, 400, { error: result.error });

  sendJson(res, 200, { move: result.notation, ...gameResponse(state, style) });
});

/**
 * POST /api/ai-move
 * Let the AI play the current turn.
 * Body: { state, difficulty?: 1|2|3, style?: "ascii" }
 */
app.post('/api/ai-move', (req, res) => {
  const { state, difficulty, style } = req.body || {};
  if (!state) return sendJson(res, 400, { error: 'Provide { state }' });
  state.boardHistory = [];
  if (state.gameOver) return sendJson(res, 400, { error: 'Game is over', gameResult: state.gameResult });

  const level = Number.isInteger(difficulty) ? difficulty : 2;
  if (![1, 2, 3].includes(level)) return sendJson(res, 400, { error: 'difficulty must be 1, 2, or 3' });

  const result = AI.playComputerMove(state, level);
  if (!result.success) return sendJson(res, 400, { error: result.error });

  sendJson(res, 200, { move: result.notation, ...gameResponse(state, style) });
});

/**
 * POST /api/resign
 * Resign the current player.
 * Body: { state, style?: "ascii" }
 */
app.post('/api/resign', (req, res) => {
  const { state, style } = req.body || {};
  if (!state) return sendJson(res, 400, { error: 'Provide { state }' });
  state.boardHistory = [];

  const result = Chess.resign(state);
  if (!result.success) return sendJson(res, 400, { error: result.error });

  sendJson(res, 200, gameResponse(state, style));
});

// ─── Static client ──────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.get('/client', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'text-client.html')));


// ─── Help ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.type('text/plain').send(`Chess Text API  (stateless)
============================

HTML client →  http://localhost:${PORT}/client

POST /api/new          New game           body: { style?: "ascii" }
POST /api/move         Human move         body: { state, move: "e2e4" }
POST /api/ai-move      AI plays           body: { state, difficulty?: 1|2|3 }
POST /api/resign       Resign             body: { state }

Every response contains the updated { state } — store it client-side
and send it back with the next request.

Move notation: long algebraic  e.g.  e2e4  g1f3  e7e8q (promotion)
Difficulty: 1=easy  2=normal (default)  3=hard
`);
});

// ─── Start ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const server = http.createServer(app);

  // Disable socket-inactivity timeout so idle periods never close the server.
  server.timeout         = 0;      // no inactivity cut-off on open sockets
  server.keepAliveTimeout = 0;     // don't close keep-alive connections eagerly
  server.headersTimeout  = 0;      // no headers-receive deadline

  server.listen(PORT, () => {
    console.log(`Chess Text API  →  http://localhost:${PORT}`);
    console.log(`HTML Client     →  http://localhost:${PORT}/client`);
    console.log('GET / for API usage.\n');
  });
}

module.exports = app;
