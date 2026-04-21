'use strict';

// ===== UTILITIES =====

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

function coordsToAlgebraic(row, col) {
  return String.fromCharCode(97 + col) + (8 - row);
}

function getPieceColor(piece) {
  if (!piece) return null;
  // lowercase = white, uppercase = black (as in original)
  return (piece === piece.toLowerCase()) ? 'white' : 'black';
}

// ===== STATE CREATION =====

function createInitialState() {
  const boardState = [
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ];
  const canCastle = {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true },
  };
  return {
    boardState,
    turn: 'white',
    canCastle,
    enPassantTarget: null,
    moveHistory: [],
    boardHistory: [{
      board: deepCopy(boardState),
      canCastle: deepCopy(canCastle),
      enPassantTarget: null,
      turn: 'white',
      halfMoveClock: 0,
      capturedPieces: { white: [], black: [] },
    }],
    capturedPieces: { white: [], black: [] },
    halfMoveClock: 0,
    lastMove: null,
    gameOver: false,
    gameResult: null,
  };
}

// ===== MOVE VALIDATION =====

function isPathClear(boardState, startRow, startCol, endRow, endCol) {
  const dRow = endRow > startRow ? 1 : endRow < startRow ? -1 : 0;
  const dCol = endCol > startCol ? 1 : endCol < startCol ? -1 : 0;
  let r = startRow + dRow;
  let c = startCol + dCol;
  while (r !== endRow || c !== endCol) {
    if (boardState[r][c] !== null) return false;
    r += dRow;
    c += dCol;
  }
  return true;
}

function isSquareAttackedByPiece(boardState, piece, fromR, fromC, toR, toC) {
  const type = piece.toLowerCase();
  const dRow = Math.abs(fromR - toR);
  const dCol = Math.abs(fromC - toC);
  switch (type) {
    case 'p':
      return fromR + (getPieceColor(piece) === 'white' ? -1 : 1) === toR && Math.abs(fromC - toC) === 1;
    case 'r':
      return (fromR === toR || fromC === toC) && isPathClear(boardState, fromR, fromC, toR, toC);
    case 'b':
      return dRow === dCol && dRow > 0 && isPathClear(boardState, fromR, fromC, toR, toC);
    case 'q':
      return ((fromR === toR || fromC === toC) || (dRow === dCol && dRow > 0)) &&
             isPathClear(boardState, fromR, fromC, toR, toC);
    case 'n':
      return (dRow === 2 && dCol === 1) || (dRow === 1 && dCol === 2);
    case 'k':
      return dRow <= 1 && dCol <= 1 && (dRow + dCol > 0);
  }
  return false;
}

function isSquareUnderAttack(boardState, row, col, byColor) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && getPieceColor(piece) === byColor) {
        if (isSquareAttackedByPiece(boardState, piece, r, c, row, col)) return true;
      }
    }
  }
  return false;
}

function findKingPos(boardState, color) {
  const kingPiece = color === 'white' ? 'k' : 'K';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (boardState[r][c] === kingPiece) return { r, c };
    }
  }
  return null;
}

function isInCheck(state, color) {
  const king = findKingPos(state.boardState, color);
  if (!king) return false;
  const opponent = color === 'white' ? 'black' : 'white';
  return isSquareUnderAttack(state.boardState, king.r, king.c, opponent);
}

function isValidPawnMove(state, piece, startRow, startCol, endRow, endCol) {
  const { boardState, enPassantTarget } = state;
  const targetPiece = boardState[endRow][endCol];
  const color = getPieceColor(piece);
  const direction = color === 'white' ? -1 : 1;
  const startRank = color === 'white' ? 6 : 1;
  const dRow = endRow - startRow;
  const dCol = Math.abs(endCol - startCol);

  if (endCol === startCol && !targetPiece) {
    if (dRow === direction) return true;
    if (startRow === startRank && dRow === 2 * direction) {
      return boardState[startRow + direction][startCol] === null;
    }
  }
  if (dCol === 1 && dRow === direction) {
    if (targetPiece) return true;
    if (enPassantTarget && endRow === enPassantTarget.r && endCol === enPassantTarget.c) return true;
  }
  return false;
}

function isValidCastlingMove(state, piece, startRow, startCol, endRow, endCol) {
  const { boardState, canCastle } = state;
  if (startRow !== endRow || Math.abs(endCol - startCol) !== 2) return false;
  const color = getPieceColor(piece);
  const isKingside = endCol > startCol;
  if (!canCastle[color][isKingside ? 'kingside' : 'queenside']) return false;
  const rookStartCol = isKingside ? 7 : 0;
  const pathMin = Math.min(startCol, rookStartCol) + 1;
  const pathMax = Math.max(startCol, rookStartCol);
  for (let c = pathMin; c < pathMax; c++) {
    if (boardState[startRow][c] !== null) return false;
  }
  const opponent = color === 'white' ? 'black' : 'white';
  if (isSquareUnderAttack(boardState, startRow, startCol, opponent)) return false;
  const midCol = startCol + (endCol > startCol ? 1 : -1);
  if (isSquareUnderAttack(boardState, startRow, midCol, opponent)) return false;
  const rookCol = isKingside ? 7 : 0;
  const rook = boardState[startRow][rookCol];
  return rook && rook.toLowerCase() === 'r' && getPieceColor(rook) === color;
}

function isValidMove(state, piece, startRow, startCol, endRow, endCol) {
  if (endRow < 0 || endRow > 7 || endCol < 0 || endCol > 7) return false;
  const { boardState } = state;
  const targetPiece = boardState[endRow][endCol];
  if (targetPiece && getPieceColor(targetPiece) === getPieceColor(piece)) return false;

  const pieceType = piece.toLowerCase();
  let isValid = false;

  if (pieceType === 'p') {
    isValid = isValidPawnMove(state, piece, startRow, startCol, endRow, endCol);
  } else if (pieceType === 'k') {
    const dRow = Math.abs(startRow - endRow);
    const dCol = Math.abs(endCol - startCol);
    if (dRow <= 1 && dCol <= 1 && !(dRow === 0 && dCol === 0)) {
      isValid = true;
    } else if (dRow === 0 && dCol === 2) {
      isValid = isValidCastlingMove(state, piece, startRow, startCol, endRow, endCol);
    }
  } else {
    const dRow = Math.abs(startRow - endRow);
    const dCol = Math.abs(endCol - startCol);
    switch (pieceType) {
      case 'r':
        isValid = (startRow === endRow || startCol === endCol) &&
                  isPathClear(boardState, startRow, startCol, endRow, endCol);
        break;
      case 'b':
        isValid = dRow === dCol && dRow > 0 && isPathClear(boardState, startRow, startCol, endRow, endCol);
        break;
      case 'q':
        isValid = ((startRow === endRow || startCol === endCol) || (dRow === dCol && dRow > 0)) &&
                  isPathClear(boardState, startRow, startCol, endRow, endCol);
        break;
      case 'n':
        isValid = (dRow === 2 && dCol === 1) || (dRow === 1 && dCol === 2);
        break;
    }
  }

  if (isValid) {
    // Simulate move and check for self-check
    const tempBoard = boardState.map(row => row.slice());
    tempBoard[endRow][endCol] = piece;
    tempBoard[startRow][startCol] = null;
    // Remove en passant captured pawn
    if (pieceType === 'p' && endCol !== startCol && !boardState[endRow][endCol]) {
      tempBoard[startRow][endCol] = null;
    }
    const tempState = { boardState: tempBoard };
    if (isInCheck(tempState, getPieceColor(piece))) return false;
  }
  return isValid;
}

function getAllValidMoves(state, color) {
  const moves = [];
  const { boardState } = state;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (!piece || getPieceColor(piece) !== color) continue;
      for (let er = 0; er < 8; er++) {
        for (let ec = 0; ec < 8; ec++) {
          if (isValidMove(state, piece, r, c, er, ec)) {
            moves.push({ startR: r, startC: c, endR: er, endC: ec });
          }
        }
      }
    }
  }
  return moves;
}

function getValidMovesForPiece(state, row, col) {
  const piece = state.boardState[row][col];
  if (!piece) return [];
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isValidMove(state, piece, row, col, r, c)) {
        moves.push({ row: r, col: c, occupied: !!state.boardState[r][c] });
      }
    }
  }
  return moves;
}

// ===== DRAW DETECTION =====

function positionKey(board, cc, t) {
  let key = t[0];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) { if (empty) { key += empty; empty = 0; } key += p; }
      else empty++;
    }
    if (empty) key += empty;
    key += '/';
  }
  if (cc.white.kingside) key += 'K';
  if (cc.white.queenside) key += 'Q';
  if (cc.black.kingside) key += 'k';
  if (cc.black.queenside) key += 'q';
  return key;
}

function isThreefoldRepetition(state) {
  const currentKey = positionKey(state.boardState, state.canCastle, state.turn);
  let count = 0;
  if (Array.isArray(state.boardHistory)) {
    for (const snap of state.boardHistory) {
      if (snap.turn && positionKey(snap.board, snap.canCastle, snap.turn) === currentKey) count++;
    }
  }
  if (Array.isArray(state.positionKeys)) {
    for (const key of state.positionKeys) {
      if (key === currentKey) count++;
    }
  }
  return count >= 3;
}

function isInsufficientMaterial(boardState) {
  const pieces = { white: [], black: [] };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (!p) continue;
      const color = getPieceColor(p);
      const type = p.toLowerCase();
      if (type !== 'k') pieces[color].push({ type, r, c });
    }
  }
  const w = pieces.white;
  const b = pieces.black;
  if (w.length === 0 && b.length === 0) return true;
  if (w.length === 0 && b.length === 1 && 'nb'.includes(b[0].type)) return true;
  if (b.length === 0 && w.length === 1 && 'nb'.includes(w[0].type)) return true;
  if (w.length === 1 && b.length === 1 && w[0].type === 'b' && b[0].type === 'b') {
    if ((w[0].r + w[0].c) % 2 === (b[0].r + b[0].c) % 2) return true;
  }
  return false;
}

function checkDraw(state) {
  if (isInsufficientMaterial(state.boardState)) return 'Draw — insufficient material';
  if (state.halfMoveClock >= 100) return 'Draw — fifty-move rule';
  if (isThreefoldRepetition(state)) return 'Draw — threefold repetition';
  return null;
}

// ===== NOTATION =====

function computeBaseNotation(state, piece, startR, startC, endR, endC, capturedPiece) {
  const { boardState } = state;
  const type = piece.toLowerCase();
  const color = getPieceColor(piece);
  const to = coordsToAlgebraic(endR, endC);

  if (type === 'k' && Math.abs(endC - startC) === 2) {
    return endC > startC ? 'O-O' : 'O-O-O';
  }
  if (type === 'p') {
    let notation = '';
    if (capturedPiece || endC !== startC) notation = String.fromCharCode(97 + startC) + 'x';
    return notation + to;
  }

  let notation = type.toUpperCase();
  const ambiguous = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === startR && c === startC) continue;
      const p = boardState[r][c];
      if (!p || getPieceColor(p) !== color || p.toLowerCase() !== type) continue;
      if (isValidMove(state, p, r, c, endR, endC)) ambiguous.push({ r, c });
    }
  }
  if (ambiguous.length > 0) {
    const sameFile = ambiguous.some(a => a.c === startC);
    const sameRank = ambiguous.some(a => a.r === startR);
    if (!sameFile) notation += String.fromCharCode(97 + startC);
    else if (!sameRank) notation += (8 - startR).toString();
    else notation += coordsToAlgebraic(startR, startC);
  }
  if (capturedPiece) notation += 'x';
  return notation + to;
}

// ===== MOVE EXECUTION =====

function executeMove(boardState, piece, startR, startC, endR, endC) {
  boardState[endR][endC] = piece;
  boardState[startR][startC] = null;
}

function executeCastling(boardState, startR, startC, endR, endC) {
  const piece = boardState[startR][startC];
  boardState[endR][endC] = piece;
  boardState[startR][startC] = null;
  const rookCol = endC > startC ? 7 : 0;
  const rookNewCol = endC > startC ? 5 : 3;
  boardState[startR][rookNewCol] = boardState[startR][rookCol];
  boardState[startR][rookCol] = null;
}

function updateCastlingRights(canCastle, piece, row, col) {
  const color = getPieceColor(piece);
  const type = piece.toLowerCase();
  if (type === 'k') {
    canCastle[color] = { kingside: false, queenside: false };
  } else if (type === 'r') {
    if (col === 7) canCastle[color].kingside = false;
    else if (col === 0) canCastle[color].queenside = false;
  }
}

// ===== MAIN MOVE FUNCTION =====

function makeMove(state, startR, startC, endR, endC, promotedTo) {
  if (state.gameOver) return { success: false, error: 'Game is over' };
  const piece = state.boardState[startR][startC];
  if (!piece) return { success: false, error: 'No piece at start position' };
  if (getPieceColor(piece) !== state.turn) return { success: false, error: 'Not your turn' };
  if (!isValidMove(state, piece, startR, startC, endR, endC)) return { success: false, error: 'Invalid move' };

  const capturedPiece = state.boardState[endR][endC];
  const baseNotation = computeBaseNotation(state, piece, startR, startC, endR, endC, capturedPiece);
  let notation = baseNotation;

  const isCastle = piece.toLowerCase() === 'k' && Math.abs(endC - startC) === 2;
  const isEnPassant = piece.toLowerCase() === 'p' && endC !== startC && !capturedPiece;
  let enPassantCaptured = null;

  if (isCastle) {
    executeCastling(state.boardState, startR, startC, endR, endC);
  } else if (isEnPassant) {
    enPassantCaptured = state.boardState[startR][endC];
    state.boardState[startR][endC] = null;
    executeMove(state.boardState, piece, startR, startC, endR, endC);
  } else {
    executeMove(state.boardState, piece, startR, startC, endR, endC);
  }

  // Update castling rights
  updateCastlingRights(state.canCastle, piece, startR, startC);
  // Revoke castling rights if a rook is captured
  if (capturedPiece && capturedPiece.toLowerCase() === 'r') {
    updateCastlingRights(state.canCastle, capturedPiece, endR, endC);
  }

  // En passant target
  state.enPassantTarget = (piece.toLowerCase() === 'p' && Math.abs(endR - startR) === 2)
    ? { r: startR + (endR - startR) / 2, c: endC }
    : null;

  // Promotion
  const isPromotion = piece.toLowerCase() === 'p' && (endR === 0 || endR === 7);
  let finalPiece = piece;
  if (isPromotion) {
    const pTo = (promotedTo || 'Q').toUpperCase();
    finalPiece = getPieceColor(piece) === 'white' ? pTo.toLowerCase() : pTo;
    state.boardState[endR][endC] = finalPiece;
    notation += '=' + pTo;
  }

  // Captured pieces tracking
  const actualCapture = enPassantCaptured || capturedPiece;
  if (actualCapture) state.capturedPieces[state.turn].push(actualCapture);

  // Fifty-move clock
  if (piece.toLowerCase() === 'p' || actualCapture) state.halfMoveClock = 0;
  else state.halfMoveClock++;

  state.lastMove = { startR, startC, endR, endC };
  const movingPlayer = state.turn;
  state.turn = state.turn === 'white' ? 'black' : 'white';

  // Check / checkmate / stalemate
  const inCheck = isInCheck(state, state.turn);
  const validMoves = getAllValidMoves(state, state.turn);

  if (validMoves.length === 0) {
    state.gameOver = true;
    if (inCheck) {
      notation += '#';
      state.gameResult = state.turn === 'black' ? '1-0' : '0-1';
    } else {
      state.gameResult = '1/2-1/2';
    }
  } else if (inCheck) {
    notation += '+';
  }

  // Draw detection
  if (!state.gameOver) {
    const drawReason = checkDraw(state);
    if (drawReason) {
      state.gameOver = true;
      state.gameResult = '1/2-1/2';
    }
  }

  // Save history
  state.moveHistory.push({
    notation,
    piece: finalPiece,
    from: { r: startR, c: startC },
    to: { r: endR, c: endC },
    captured: actualCapture || null,
    player: movingPlayer,
  });
  state.boardHistory.push({
    board: deepCopy(state.boardState),
    canCastle: deepCopy(state.canCastle),
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    turn: state.turn,
    halfMoveClock: state.halfMoveClock,
    capturedPieces: deepCopy(state.capturedPieces),
  });

  return {
    success: true,
    notation,
    isCastle,
    isPromotion,
    isCapture: !!actualCapture,
    inCheck,
    gameOver: state.gameOver,
    isCheckmate: state.gameOver && inCheck,
    isStalemate: state.gameOver && !inCheck && validMoves.length === 0,
  };
}

// ===== UNDO =====

function undoMove(state, count) {
  count = count || 1;
  if (state.moveHistory.length === 0) return { success: false, error: 'No moves to undo' };

  for (let i = 0; i < count; i++) {
    if (state.moveHistory.length === 0) break;
    state.moveHistory.pop();
    state.boardHistory.pop();
  }

  const snapshot = state.boardHistory[state.boardHistory.length - 1];
  if (!snapshot) return { success: false, error: 'Cannot undo further' };

  state.boardState = deepCopy(snapshot.board);
  state.canCastle = deepCopy(snapshot.canCastle);
  state.enPassantTarget = snapshot.enPassantTarget ? { ...snapshot.enPassantTarget } : null;
  state.halfMoveClock = snapshot.halfMoveClock || 0;
  state.capturedPieces = deepCopy(snapshot.capturedPieces);
  state.turn = snapshot.turn;
  state.gameOver = false;
  state.gameResult = null;

  const prevMove = state.moveHistory[state.moveHistory.length - 1];
  state.lastMove = prevMove
    ? { startR: prevMove.from.r, startC: prevMove.from.c, endR: prevMove.to.r, endC: prevMove.to.c }
    : null;

  return { success: true };
}

// ===== RESIGN =====

function resign(state) {
  if (state.gameOver) return { success: false, error: 'Game already over' };
  state.gameOver = true;
  state.gameResult = state.turn === 'white' ? '0-1' : '1-0';
  return { success: true };
}

// ===== CLIENT STATE =====

function getClientState(state) {
  const inCheck = !state.gameOver && isInCheck(state, state.turn);
  const checkSquare = inCheck ? findKingPos(state.boardState, state.turn) : null;
  const allValidMoves = state.gameOver ? [] : getAllValidMoves(state, state.turn);
  const snapshots = state.boardHistory.map((h, i) => ({
    board: h.board,
    canCastle: h.canCastle,
    enPassantTarget: h.enPassantTarget || null,
    capturedPieces: h.capturedPieces,
    lastMove: i === 0 ? null : {
      startR: state.moveHistory[i - 1].from.r,
      startC: state.moveHistory[i - 1].from.c,
      endR: state.moveHistory[i - 1].to.r,
      endC: state.moveHistory[i - 1].to.c,
    },
  }));

  return {
    boardState: state.boardState,
    turn: state.turn,
    gameOver: state.gameOver,
    gameResult: state.gameResult,
    lastMove: state.lastMove,
    capturedPieces: state.capturedPieces,
    moveHistory: state.moveHistory,
    inCheck,
    checkSquare,
    halfMoveClock: state.halfMoveClock,
    allValidMoves,
    snapshots,
  };
}

module.exports = {
  createInitialState,
  getPieceColor,
  isValidMove,
  getAllValidMoves,
  getValidMovesForPiece,
  makeMove,
  undoMove,
  resign,
  getClientState,
  isInCheck,
  findKingPos,
  deepCopy,
  positionKey,
  computeBaseNotation,
  checkDraw,
  coordsToAlgebraic,
};
