'use strict';

const Chess = require('./chess');

// ===== PGN PARSING =====

function parsePGNMoveList(text) {
  text = text.replace(/\[[^\]]*\]/g, '');       // remove tag pairs
  text = text.replace(/\{[^}]*\}/g, '');         // remove block comments
  let prev;
  do { prev = text; text = text.replace(/\([^()]*\)/g, ''); } while (text !== prev); // nested variations
  text = text.replace(/;[^\n]*/g, '');            // semicolon comments
  text = text.replace(/\$\d+/g, '');              // NAGs
  text = text.replace(/[!?]+/g, '');              // annotations
  text = text.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ''); // result token
  text = text.replace(/\d+\.+/g, '');             // move numbers
  return text.trim().split(/\s+/).filter(s => s.length > 0 && /[a-zA-Z]/.test(s));
}

// Parse PGN tag headers into an object
function parsePGNHeaders(text) {
  const headers = {};
  const tagPattern = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

// Convert SAN move to {startR, startC, endR, endC, promotedTo} given current state
function sanToMove(state, san) {
  san = san.replace(/[+#!?]/g, '').trim();
  if (!san) return null;

  const color = state.turn;

  // Castling
  if (san === 'O-O' || san === '0-0') {
    const r = color === 'white' ? 7 : 0;
    return { startR: r, startC: 4, endR: r, endC: 6, promotedTo: null };
  }
  if (san === 'O-O-O' || san === '0-0-0') {
    const r = color === 'white' ? 7 : 0;
    return { startR: r, startC: 4, endR: r, endC: 2, promotedTo: null };
  }

  // Promotion
  let promotedTo = null;
  const promMatch = san.match(/=?([QRBN])$/i);
  if (promMatch && /[QRBN]/i.test(promMatch[1])) {
    promotedTo = promMatch[1].toUpperCase();
    san = san.replace(/=?[QRBN]$/i, '');
  }

  // Piece type
  let pieceType = 'p';
  if (/^[NBRQK]/.test(san)) { pieceType = san[0].toLowerCase(); san = san.slice(1); }
  san = san.replace('x', ''); // strip capture marker

  if (san.length < 2) return null;
  const dest = san.slice(-2);
  const disambig = san.slice(0, -2);
  const endC = dest.charCodeAt(0) - 97;
  const endR = 8 - parseInt(dest[1]);
  if (isNaN(endR) || endC < 0 || endC > 7 || endR < 0 || endR > 7) return null;

  const matches = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.boardState[r][c];
      if (!p || Chess.getPieceColor(p) !== color || p.toLowerCase() !== pieceType) continue;
      if (!Chess.isValidMove(state, p, r, c, endR, endC)) continue;
      if (disambig.length === 1) {
        if (/[a-h]/.test(disambig) && c !== disambig.charCodeAt(0) - 97) continue;
        if (/[1-8]/.test(disambig) && r !== 8 - parseInt(disambig)) continue;
      } else if (disambig.length === 2) {
        if (r !== 8 - parseInt(disambig[1]) || c !== disambig.charCodeAt(0) - 97) continue;
      }
      matches.push({ startR: r, startC: c, endR, endC, promotedTo });
    }
  }
  return matches.length > 0 ? matches[0] : null;
}

// ===== SILENT APPLY (for PGN replay without rendering) =====

function silentApplyMove(state, startR, startC, endR, endC, promotedTo) {
  return Chess.makeMove(state, startR, startC, endR, endC, promotedTo);
}

function snapshotForReview(state) {
  return {
    board: Chess.deepCopy(state.boardState),
    canCastle: Chess.deepCopy(state.canCastle),
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    capturedPieces: Chess.deepCopy(state.capturedPieces),
    turn: state.turn,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    halfMoveClock: state.halfMoveClock,
  };
}

// ===== IMPORT =====

function importPGN(text) {
  const moves = parsePGNMoveList(text);
  if (moves.length === 0) return { success: false, error: 'No moves found in PGN' };

  const headers = parsePGNHeaders(text);
  const state = Chess.createInitialState();

  const snapshots = [snapshotForReview(state)];

  for (let i = 0; i < moves.length; i++) {
    const mv = sanToMove(state, moves[i]);
    if (!mv) {
      return {
        success: false,
        error: `Could not parse move ${Math.floor(i / 2) + 1}: "${moves[i]}"`,
      };
    }
    const result = silentApplyMove(state, mv.startR, mv.startC, mv.endR, mv.endC, mv.promotedTo);
    if (!result.success) {
      return {
        success: false,
        error: `Invalid move ${Math.floor(i / 2) + 1}: "${moves[i]}" — ${result.error}`,
      };
    }
    snapshots.push(snapshotForReview(state));
  }

  return {
    success: true,
    state,
    snapshots,
    headers,
    moveHistory: Chess.deepCopy(state.moveHistory),
  };
}

// ===== EXPORT =====

function exportPGN(state, options) {
  const { whiteName = 'Human', blackName = 'Human' } = options || {};
  const src = state.moveHistory;
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const result = state.gameResult || '*';

  let pgn = `[Event "Chess Game"]\n[Site "Local"]\n[Date "${date}"]\n`;
  pgn += `[White "${whiteName}"]\n[Black "${blackName}"]\n[Result "${result}"]\n\n`;

  let moveText = '';
  for (let i = 0; i < src.length; i++) {
    if (i % 2 === 0) moveText += `${Math.floor(i / 2) + 1}. `;
    moveText += src[i].notation + ' ';
  }
  moveText += result;

  // Wrap at 80 chars per PGN standard
  const words = moveText.split(' ');
  let line = '';
  for (const w of words) {
    if (line && line.length + w.length + 1 > 80) {
      pgn += line.trimEnd() + '\n';
      line = w + ' ';
    } else {
      line += w + ' ';
    }
  }
  pgn += line.trimEnd();
  return pgn;
}

module.exports = {
  importPGN,
  exportPGN,
  parsePGNMoveList,
  parsePGNHeaders,
  sanToMove,
  snapshotForReview,
};
