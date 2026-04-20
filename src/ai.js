'use strict';

const Chess = require('./chess');

// ===== PIECE VALUES & TABLES =====

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PST = {
  p: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  r: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0],
  ],
  q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  k: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

function getPSTValue(piece, r, c) {
  const type = piece.toLowerCase();
  const tableR = Chess.getPieceColor(piece) === 'white' ? r : 7 - r;
  return PST[type] ? PST[type][tableR][c] : 0;
}

// ===== BOARD EVALUATION =====

function evaluateBoard(state, color) {
  const { boardState } = state;
  const opponent = color === 'white' ? 'black' : 'white';
  let materialUs = 0, materialThem = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (!p) continue;
      const v = PIECE_VALUE[p.toLowerCase()] * 100 + getPSTValue(p, r, c);
      if (Chess.getPieceColor(p) === color) materialUs += v;
      else materialThem += v;
    }
  }
  let score = materialUs - materialThem;

  // Endgame mating heuristic: when up by a rook+, push opponent king to corner
  const advantage = materialUs - materialThem;
  const ROOK_CP = PIECE_VALUE['r'] * 100;
  if (advantage >= ROOK_CP) {
    const oppKing = Chess.findKingPos(boardState, opponent);
    const ourKing = Chess.findKingPos(boardState, color);
    if (oppKing && ourKing) {
      const kingEdge = Math.max(
        3 - Math.min(oppKing.r, 7 - oppKing.r),
        3 - Math.min(oppKing.c, 7 - oppKing.c)
      );
      const kingProximity = 14 - (Math.abs(oppKing.r - ourKing.r) + Math.abs(oppKing.c - ourKing.c));
      const scale = Math.min(advantage / ROOK_CP, 2);
      score += Math.round((kingEdge * 15 + kingProximity * 10) * scale);
    }
  }
  return score;
}

// ===== LOOKAHEAD HELPERS =====

// Apply a move to a board array (returns a new board, no state mutation)
function applyMoveToBoard(board, mv) {
  const b = board.map(row => row.slice());
  const piece = b[mv.startR][mv.startC];
  const target = b[mv.endR][mv.endC];

  // En passant
  if (piece && piece.toLowerCase() === 'p' && mv.endC !== mv.startC && !target) {
    b[mv.startR][mv.endC] = null;
  }
  // Castling rook
  if (piece && piece.toLowerCase() === 'k' && Math.abs(mv.endC - mv.startC) === 2) {
    const rookCol = mv.endC > mv.startC ? 7 : 0;
    const rookNewCol = mv.endC > mv.startC ? 5 : 3;
    b[mv.startR][rookNewCol] = b[mv.startR][rookCol];
    b[mv.startR][rookCol] = null;
  }
  b[mv.endR][mv.endC] = piece;
  b[mv.startR][mv.startC] = null;
  // Auto-promote to queen
  if (piece === 'p' && mv.endR === 0) b[mv.endR][mv.endC] = 'q';
  if (piece === 'P' && mv.endR === 7) b[mv.endR][mv.endC] = 'Q';
  return b;
}

function makeTempState(board, canCastle, enPassantTarget) {
  return {
    boardState: board,
    canCastle: canCastle || { white: { kingside: false, queenside: false }, black: { kingside: false, queenside: false } },
    enPassantTarget: enPassantTarget || null,
    boardHistory: [],
  };
}

function repetitionCount(state, key) {
  let count = 0;
  for (const snap of state.boardHistory) {
    if (snap.turn && Chess.positionKey(snap.board, snap.canCastle, snap.turn) === key) count++;
  }
  return count;
}

// 1-ply minimax lookahead: score a move from `color`'s perspective
function scoreMoveWithLookahead(state, move, color, depth) {
  const opponent = color === 'white' ? 'black' : 'white';
  const newBoard = applyMoveToBoard(state.boardState, move);
  const tempState = makeTempState(newBoard, state.canCastle, state.enPassantTarget);
  const advantage = evaluateBoard(tempState, color);

  if (depth <= 0) return advantage;

  // Avoid 3-fold repetition when ahead
  const resultKey = Chess.positionKey(newBoard, state.canCastle, opponent);
  if (repetitionCount(state, resultKey) >= 2 && advantage > 0) return -50000;

  // Opponent's best reply
  const replies = Chess.getAllValidMoves(tempState, opponent);
  if (replies.length === 0) {
    const mated = Chess.isInCheck(tempState, opponent);
    if (mated) return 99999;
    // Stalemate: bad if we're ahead, neutral if losing
    return advantage > 0 ? -50000 : 0;
  }

  let worstForUs = Infinity;
  for (const reply of replies) {
    const afterReply = applyMoveToBoard(newBoard, reply);
    const replyState = makeTempState(afterReply, state.canCastle, null);
    let evalScore;
    if (depth >= 2) {
      // 2nd ply: score our best response to their reply
      const ourReplies = Chess.getAllValidMoves(replyState, color);
      if (ourReplies.length === 0) {
        evalScore = Chess.isInCheck(replyState, color) ? -99999 : 0;
      } else {
        let bestForUs = -Infinity;
        for (const ourReply of ourReplies) {
          const afterOurReply = applyMoveToBoard(afterReply, ourReply);
          const finalState = makeTempState(afterOurReply, null, null);
          const s = evaluateBoard(finalState, color);
          if (s > bestForUs) bestForUs = s;
        }
        evalScore = bestForUs;
      }
    } else {
      evalScore = evaluateBoard(replyState, color);
    }
    if (evalScore < worstForUs) worstForUs = evalScore;
  }
  return worstForUs;
}

// ===== COMPUTER MOVE =====

// difficulty: 1=easy (greedy, more random), 2=normal (1-ply), 3=hard (2-ply, less random)
function playComputerMove(state, difficulty) {
  if (state.gameOver) return { success: false, error: 'Game is over' };
  const moves = Chess.getAllValidMoves(state, state.turn);
  if (moves.length === 0) return { success: false, error: 'No valid moves' };

  const color = state.turn;
  const level = difficulty || 2;
  const depth = level === 1 ? 0 : level === 3 ? 2 : 1;
  // More randomness at easy, less at hard
  const jitter = level === 1 ? 60 : level === 3 ? 2 : 5;

  const scored = moves.map(m => ({
    move: m,
    score: scoreMoveWithLookahead(state, m, color, depth) + Math.random() * jitter,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Pick randomly from top tier for variety (wider at easy, tighter at hard)
  const tier = level === 1 ? 80 : level === 3 ? 5 : 15;
  const best = scored[0].score;
  const candidates = scored.filter(s => s.score >= best - tier);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)].move;

  // Determine promotion: always queen for computer
  const piece = state.boardState[chosen.startR][chosen.startC];
  let promotedTo = null;
  if (piece && piece.toLowerCase() === 'p' && (chosen.endR === 0 || chosen.endR === 7)) {
    promotedTo = 'Q';
  }

  const result = Chess.makeMove(state, chosen.startR, chosen.startC, chosen.endR, chosen.endC, promotedTo);
  return result;
}

module.exports = {
  playComputerMove,
  evaluateBoard,
  scoreMoveWithLookahead,
  applyMoveToBoard,
  makeTempState,
};
