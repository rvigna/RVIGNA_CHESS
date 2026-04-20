'use strict';

// ===== DRAWER / MOBILE MENU UI =====

function toggleDrawer(id) {
    const el = document.getElementById(id);
    const isOpen = el.classList.contains('open');
    closeAllDrawers();
    if (!isOpen) openDrawer(id);
}

function openDrawer(id) {
    document.getElementById(id).classList.add('open');
    document.getElementById('drawer-backdrop').classList.add('active');
}

function closeDrawer(id) {
    document.getElementById(id).classList.remove('open');
    const anyOpen = document.querySelector('.sidebar.open');
    if (!anyOpen) document.getElementById('drawer-backdrop').classList.remove('active');
}

function closeAllDrawers() {
    document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('open'));
    document.getElementById('drawer-backdrop').classList.remove('active');
}

function showMobileMenu() {
    document.getElementById('mobile-menu-sheet').classList.add('open');
    document.getElementById('mobile-menu-backdrop').classList.add('active');
}

function closeMobileMenu() {
    document.getElementById('mobile-menu-sheet').classList.remove('open');
    document.getElementById('mobile-menu-backdrop').classList.remove('active');
}

// ===== PIECE SVG PATHS =====
// Lowercase = white pieces (light), Uppercase = black pieces (dark)
const PIECE_SVG = {
    'p': '/pieces/Chess_plt45.svg',
    'r': '/pieces/Chess_rlt45.svg',
    'n': '/pieces/Chess_nlt45.svg',
    'b': '/pieces/Chess_blt45.svg',
    'q': '/pieces/Chess_qlt45.svg',
    'k': '/pieces/Chess_klt45.svg',
    'P': '/pieces/Chess_pdt45.svg',
    'R': '/pieces/Chess_rdt45.svg',
    'N': '/pieces/Chess_ndt45.svg',
    'B': '/pieces/Chess_bdt45.svg',
    'Q': '/pieces/Chess_qdt45.svg',
    'K': '/pieces/Chess_kdt45.svg',
};

function makePieceImg(code, cssClass) {
    const img = document.createElement('img');
    img.src = PIECE_SVG[code];
    img.alt = code;
    img.draggable = false;
    img.className = cssClass || 'piece-img';
    return img;
}

// ===== SOUND =====
const SoundFX = (() => {
    let enabled = true;
    let _ctx = null;

    function ac() {
        if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (_ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    }

    function thud(vol = 0.4, freq = 550, decay = 0.07, delay = 0) {
        const c = ac();
        const t = c.currentTime + delay;
        const len = Math.ceil(c.sampleRate * (decay + 0.04));
        const buf = c.createBuffer(1, len, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const flt = c.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.value = freq;
        flt.Q.value = 1.8;
        const gain = c.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
        src.connect(flt); flt.connect(gain); gain.connect(c.destination);
        src.start(t);
    }

    function tone(freq, dur, vol = 0.15, type = 'sine', delay = 0) {
        const c = ac();
        const t = c.currentTime + delay;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + dur + 0.05);
    }

    return {
        get enabled() { return enabled; },
        toggle() { enabled = !enabled; return enabled; },
        move()    { if (!enabled) return; thud(0.32, 620, 0.07); },
        capture() { if (!enabled) return; thud(0.45, 420, 0.06); thud(0.28, 720, 0.05, 0.03); },
        castle()  { if (!enabled) return; thud(0.30, 600, 0.06); thud(0.28, 600, 0.06, 0.13); },
        promote() { if (!enabled) return; thud(0.32, 620, 0.06); tone(660, 0.14, 0.12, 'sine', 0.06); tone(880, 0.20, 0.10, 'sine', 0.18); },
        check()   { if (!enabled) return; thud(0.30, 600, 0.06); tone(880, 0.12, 0.13, 'sine', 0.05); tone(1100, 0.18, 0.11, 'sine', 0.16); },
        gameEnd() { if (!enabled) return; tone(523, 0.25, 0.20, 'sine'); tone(659, 0.25, 0.17, 'sine', 0.24); tone(784, 0.45, 0.17, 'sine', 0.48); },
        draw()    { if (!enabled) return; tone(440, 0.30, 0.15, 'sine'); tone(370, 0.38, 0.12, 'sine', 0.30); },
    };
})();

// ===== CLIENT STATE =====
let gameId = null;
let serverState = null;       // latest state from server
let localState = null;        // local game state (used when not in online mode)
let validMovesMap = {};       // { "r,c": [{row,col}, ...] }
let selectedPos = null;       // { row, col } of selected piece
let pendingPromotion = null;  // { startR, startC, endR, endC }
let busy = false;             // prevents concurrent API calls

// Computer mode: null=2P, 'black'=you play white, 'white'=you play black, 'both'=auto
let computerColor = null;

// Review mode
let reviewMode = false;
let reviewIndex = 0;
let reviewSnapshots = [];
let reviewMoveHistory = [];

// ===== ONLINE MODE STATE =====
let socket = null;
let onlineMode = false;       // true when playing via Socket.io
let onlineRoomCode = null;
let onlineColor = null;       // 'white' | 'black'
let onlineToken = null;
let selectedOnlineColor = 'white';
let selectedDifficulty = 1;  // 1=easy, 2=normal, 3=hard
let opponentConnected = false;

// ===== LIVE HISTORY BROWSE STATE =====
let liveSnapshots = [];  // [{ board, lastMove, capturedPieces }] — index 0 = start, N = after N half-moves
let browseIndex = null;  // null = live view, number = browsing history

const boardElement = document.getElementById('chessboard');
const moveListElement = document.getElementById('move-list');

// ===== API HELPERS =====

// ===== LOCAL ENGINE (offline / no-server) =====
// When not in online mode, all /api/game/ calls are handled here using the
// browser-bundled chess engine (chess-engine.js) instead of the server.

function localGamePost(path, body) {
    body = body || {};
    // POST /api/game — create new game
    if (path === '/api/game') {
        localState = Chess.createInitialState();
        return { id: 'local', state: Chess.getClientState(localState) };
    }
    // Extract sub-path: everything after /api/game/<id>/
    const subMatch = path.match(/^\/api\/game\/[^/]+\/(.+)$/);
    const sub = subMatch ? subMatch[1] : null;

    if (sub === 'move') {
        const { startR, startC, endR, endC, promotedTo } = body;
        const result = Chess.makeMove(localState, +startR, +startC, +endR, +endC, promotedTo || null);
        if (!result.success) throw new Error(result.error);
        return { state: Chess.getClientState(localState), moveResult: result };
    }
    if (sub === 'computer-move') {
        const difficulty = Math.min(3, Math.max(1, parseInt(body.difficulty) || 2));
        const result = AI.playComputerMove(localState, difficulty);
        if (!result.success) throw new Error(result.error);
        return { state: Chess.getClientState(localState), moveResult: result };
    }
    if (sub === 'undo') {
        const count = Math.max(1, parseInt(body.count) || 1);
        const result = Chess.undoMove(localState, count);
        if (!result.success) throw new Error(result.error);
        return { state: Chess.getClientState(localState) };
    }
    if (sub === 'resign') {
        const result = Chess.resign(localState);
        if (!result.success) throw new Error(result.error);
        return { state: Chess.getClientState(localState) };
    }
    if (sub === 'reset') {
        localState = Chess.createInitialState();
        return { state: Chess.getClientState(localState) };
    }
    if (sub === 'pgn') {
        const result = PGN.importPGN(body.pgn);
        if (!result.success) throw new Error(result.error);
        localState = result.state;
        return {
            state: Chess.getClientState(localState),
            snapshots: result.snapshots,
            moveHistory: result.moveHistory,
            headers: result.headers,
        };
    }
    throw new Error('Unknown local path: ' + path);
}

function localGameGet(path) {
    // GET /api/game/:id — get current state
    if (/^\/api\/game\/[^/]+$/.test(path)) {
        if (!localState) localState = Chess.createInitialState();
        return { state: Chess.getClientState(localState) };
    }
    // GET /api/game/:id/analyse
    if (path.endsWith('/analyse')) {
        if (!localState || localState.moveHistory.length === 0) throw new Error('No moves to analyse');
        return { analysis: Analysis.analyseGame(localState) };
    }
    // GET /api/game/:id/pgn (with optional query string)
    if (/\/pgn(\?.*)?$/.test(path)) {
        if (!localState || localState.moveHistory.length === 0) throw new Error('No moves to export');
        const qIdx = path.indexOf('?');
        const params = qIdx >= 0 ? new URLSearchParams(path.slice(qIdx + 1)) : new URLSearchParams();
        const pgn = PGN.exportPGN(localState, {
            whiteName: params.get('white') || 'Human',
            blackName: params.get('black') || 'Human',
        });
        return { pgn };
    }
    throw new Error('Unknown local path: ' + path);
}

// Persist local game state to localStorage so it survives page refresh
function persistLocalState() {
    if (localState) {
        localStorage.setItem('localGameState', JSON.stringify(localState));
    } else {
        localStorage.removeItem('localGameState');
    }
}

async function apiPost(path, body) {
    // Route local (non-online) game calls through the in-browser engine
    if (!onlineMode && (path === '/api/game' || path.startsWith('/api/game/'))) {
        return localGamePost(path, body);
    }
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

async function apiGet(path) {
    // Route local (non-online) game calls through the in-browser engine
    if (!onlineMode && path.startsWith('/api/game/')) {
        return localGameGet(path);
    }
    const res = await fetch(path);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ===== INITIALISE GAME =====

async function initGame() {
    // All games start locally; online mode is only entered after socket.io room join
    const saved = localStorage.getItem('localGameState');
    if (saved) {
        try {
            localState = JSON.parse(saved);
            gameId = 'local';
            applyState(Chess.getClientState(localState));
            return;
        } catch (_) {
            localStorage.removeItem('localGameState');
        }
    }
    // No saved game — start fresh
    localState = Chess.createInitialState();
    gameId = 'local';
    applyState(Chess.getClientState(localState));
}

// ===== STATE APPLICATION =====

function applyState(state, moveResult) {
    const prevMoveCount = serverState ? serverState.moveHistory.length : -1;
    serverState = state;
    // Keep local game persisted after every state change
    if (!onlineMode && localState) persistLocalState();

    // Maintain live snapshots for history navigation
    if (!reviewMode) {
        const snap = {
            board: state.boardState.map(r => [...r]),
            lastMove: state.lastMove,
            capturedPieces: {
                white: [...(state.capturedPieces?.white || [])],
                black: [...(state.capturedPieces?.black || [])],
            },
        };
        if (prevMoveCount === -1) {
            // First call — build from server-provided snapshots (handles game resume)
            if (state.snapshots && state.snapshots.length > 0) {
                liveSnapshots = state.snapshots.map(s => ({
                    board: s.board.map(r => [...r]),
                    lastMove: s.lastMove,
                    capturedPieces: {
                        white: [...(s.capturedPieces?.white || [])],
                        black: [...(s.capturedPieces?.black || [])],
                    },
                }));
            } else {
                liveSnapshots = [snap];
            }
        } else if (state.moveHistory.length === 0) {
            liveSnapshots = [snap];
        } else if (state.moveHistory.length > prevMoveCount) {
            liveSnapshots.push(snap);
        } else if (state.moveHistory.length < prevMoveCount) {
            liveSnapshots = liveSnapshots.slice(0, state.moveHistory.length + 1);
            liveSnapshots[liveSnapshots.length - 1] = snap; // update last to current
        }
        browseIndex = null; // always return to live on state update
    }

    buildValidMovesMap(state.allValidMoves || []);
    selectedPos = null;
    renderBoard();
    renderMoveHistory(state.moveHistory);
    updateCapturedPiecesDisplay(state.capturedPieces);
    updateStatusFromState(state, moveResult);
    updateButtonVisibility(state);
    updateNavVisibility();
    if (moveResult) playSoundForMove(moveResult);
}

function buildValidMovesMap(allValidMoves) {
    validMovesMap = {};
    for (const mv of allValidMoves) {
        const key = `${mv.startR},${mv.startC}`;
        if (!validMovesMap[key]) validMovesMap[key] = [];
        validMovesMap[key].push({ row: mv.endR, col: mv.endC });
    }
}

function updateStatusFromState(state, moveResult) {
    if (state.gameOver) {
        const bar = document.getElementById('status-bar');
        bar.className = 'status-bar game-over';
        if (moveResult && moveResult.isCheckmate) {
            const winner = state.turn === 'white' ? 'Black' : 'White';
            document.getElementById('game-status').textContent = `Checkmate — ${winner} wins`;
        } else if (moveResult && moveResult.isStalemate) {
            document.getElementById('game-status').textContent = 'Stalemate — draw';
        } else if (state.gameResult === '1/2-1/2') {
            document.getElementById('game-status').textContent = 'Draw';
        } else if (state.gameResult === '1-0') {
            document.getElementById('game-status').textContent = 'White wins';
        } else if (state.gameResult === '0-1') {
            document.getElementById('game-status').textContent = 'Black wins';
        } else {
            document.getElementById('game-status').textContent = 'Game over';
        }
    } else {
        const bar = document.getElementById('status-bar');
        bar.className = 'status-bar ' + (state.turn === 'white' ? 'turn-white' : 'turn-black');
        document.getElementById('game-status').textContent =
            `${state.turn === 'white' ? 'White' : 'Black'} to move${state.inCheck ? ' — Check' : ''}`;
    }
}

function updateButtonVisibility(state) {
    const hasMovesPlayed = state.moveHistory && state.moveHistory.length > 0;
    const showResign = !state.gameOver && hasMovesPlayed && !reviewMode;

    // Helper to set display on an element (ignores missing IDs)
    const show = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    };
    const cls = (id, name, on) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle(name, on);
    };

    // Desktop / header buttons
    show('btn-resign',     showResign);
    show('btn-analyse',    hasMovesPlayed);
    show('btn-draw-offer', onlineMode && !state.gameOver && hasMovesPlayed);
    show('btn-vs-computer', !onlineMode);
    cls('btn-online', 'active-mode', onlineMode);

    // Tablet toolbar duplicates (desktop-controls)
    show('btn-resign2',     showResign);
    show('btn-analyse2',    hasMovesPlayed);
    show('btn-draw-offer2', onlineMode && !state.gameOver && hasMovesPlayed);
    show('btn-vs-computer2', !onlineMode);
    cls('btn-online2', 'active-mode', onlineMode);

    // Mobile "More" menu items
    show('mob-resign',  showResign);
    show('mob-draw',    onlineMode && !state.gameOver && hasMovesPlayed);
    show('mob-analyse', hasMovesPlayed);
    cls('mob-vs-computer', 'active-mode', computerColor !== null);
    cls('mob-sound', 'active-mode', SoundFX.enabled);

    // Tab bar online indicator
    cls('tab-online', 'active-mode', onlineMode);
    cls('tab-chat', 'active-mode', false); // updated elsewhere

    // Undo button — desktop header + inline toolbar + mobile "More" menu
    function applyUndoVisibility(el) {
        if (!el) return;
        if (onlineMode) {
            const lastMoveMine = hasMovesPlayed &&
                state.moveHistory[state.moveHistory.length - 1].player === onlineColor;
            el.style.display = (!state.gameOver && lastMoveMine) ? '' : 'none';
        } else {
            el.style.display = '';
        }
    }
    applyUndoVisibility(document.getElementById('btn-undo'));
    applyUndoVisibility(document.getElementById('btn-undo2'));
    applyUndoVisibility(document.getElementById('mob-undo'));
}

function playSoundForMove(moveResult) {
    if (serverState.gameOver) {
        if (serverState.gameResult === '1/2-1/2') SoundFX.draw();
        else SoundFX.gameEnd();
        return;
    }
    if (moveResult.inCheck) SoundFX.check();
    else if (moveResult.isPromotion) SoundFX.promote();
    else if (moveResult.isCastle) SoundFX.castle();
    else if (moveResult.isCapture) SoundFX.capture();
    else SoundFX.move();
}

// ===== BOARD RENDERING =====

function isBoardFlipped() {
    if (onlineMode) return onlineColor === 'black';
    // In local vs-computer mode, flip when the human plays black
    // computerColor is the color the computer plays, so human = opposite
    if (computerColor === 'white') return true;
    return false;
}

function updateBoardLabels(flipped) {
    const rankHtml = (flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1])
        .map(n => `<div>${n}</div>`).join('');
    const fileHtml = (flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'])
        .map(l => `<div class="file-label">${l}</div>`).join('');
    const rankLeft   = document.getElementById('rank-labels');
    const rankRight  = document.getElementById('rank-labels-right');
    const fileTop    = document.getElementById('file-labels-top');
    const fileBottom = document.getElementById('file-labels');
    if (rankLeft)   rankLeft.innerHTML   = rankHtml;
    if (rankRight)  rankRight.innerHTML  = rankHtml;
    if (fileTop)    fileTop.innerHTML    = fileHtml;
    if (fileBottom) fileBottom.innerHTML = fileHtml;
}

function renderBoard() {
    let boardData;
    if (reviewMode) {
        const snap = reviewSnapshots[reviewIndex];
        boardData = { boardState: snap.board, lastMove: snap.lastMove, inCheck: false, checkSquare: null };
    } else if (browseIndex !== null) {
        const snap = liveSnapshots[browseIndex];
        boardData = { boardState: snap.board, lastMove: snap.lastMove, inCheck: false, checkSquare: null };
    } else {
        boardData = serverState;
    }

    const flipped = isBoardFlipped();
    updateBoardLabels(flipped);

    boardElement.innerHTML = '';
    for (let vi = 0; vi < 8; vi++) {
        for (let vj = 0; vj < 8; vj++) {
            const r = flipped ? 7 - vi : vi;
            const c = flipped ? 7 - vj : vj;

            const square = document.createElement('div');
            square.classList.add('square', (r + c) % 2 === 0 ? 'white' : 'black');
            square.dataset.row = r;
            square.dataset.col = c;

            const lm = boardData.lastMove;
            if (lm && ((r === lm.startR && c === lm.startC) || (r === lm.endR && c === lm.endC))) {
                square.classList.add('last-move');
            }

            const pieceCode = boardData.boardState[r][c];
            if (pieceCode) {
                square.appendChild(makePieceImg(pieceCode));
                if (boardData.inCheck && boardData.checkSquare && r === boardData.checkSquare.r && c === boardData.checkSquare.c) {
                    square.classList.add('in-check');
                }
            }

            square.addEventListener('click', handleSquareClick);
            boardElement.appendChild(square);
        }
    }
}

function clearHighlights() {
    document.querySelectorAll('.selected, .highlighted, .occupied').forEach(el => {
        el.classList.remove('selected', 'highlighted', 'occupied');
    });
}

// ===== CLICK HANDLING =====

function isComputerTurn() {
    if (!serverState) return false;
    if (onlineMode) return false; // in online mode the server handles turns
    return computerColor === 'both' || computerColor === serverState.turn;
}

function isMyTurn() {
    if (!serverState || serverState.gameOver) return false;
    if (onlineMode) return serverState.turn === onlineColor && opponentConnected;
    return !isComputerTurn();
}

function handleSquareClick(event) {
    if (busy || !serverState || serverState.gameOver || reviewMode || browseIndex !== null) return;
    if (onlineMode && !isMyTurn()) return;
    if (!onlineMode && isComputerTurn()) return;

    const r = parseInt(event.currentTarget.dataset.row);
    const c = parseInt(event.currentTarget.dataset.col);

    // Piece color check: lowercase=white, uppercase=black
    const piece = serverState.boardState[r][c];
    const pieceColor = piece ? (piece === piece.toLowerCase() ? 'white' : 'black') : null;
    const isOwnPiece = pieceColor === serverState.turn;

    if (!selectedPos) {
        if (isOwnPiece) selectPiece(r, c);
        return;
    }

    const { row: sr, col: sc } = selectedPos;

    // Clicking selected square again → deselect
    if (r === sr && c === sc) {
        clearHighlights();
        selectedPos = null;
        return;
    }

    // Clicking another friendly piece → re-select
    if (isOwnPiece) {
        selectPiece(r, c);
        return;
    }

    // Try to make the move
    const validDests = validMovesMap[`${sr},${sc}`] || [];
    const isValid = validDests.some(d => d.row === r && d.col === c);
    if (!isValid) {
        clearHighlights();
        selectedPos = null;
        return;
    }

    // Check if promotion move
    const movingPiece = serverState.boardState[sr][sc];
    const isPromotion = movingPiece &&
        movingPiece.toLowerCase() === 'p' &&
        (r === 0 || r === 7);  // white pawn→row 0, black pawn→row 7

    if (isPromotion) {
        pendingPromotion = { startR: sr, startC: sc, endR: r, endC: c };
        showPromotionDialog(movingPiece);
    } else if (onlineMode) {
        sendOnlineMove(sr, sc, r, c, null);
    } else {
        sendMove(sr, sc, r, c, null);
    }
}

function selectPiece(r, c) {
    clearHighlights();
    selectedPos = { row: r, col: c };
    const sq = boardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    if (sq) sq.classList.add('selected');

    const dests = validMovesMap[`${r},${c}`] || [];
    for (const d of dests) {
        const target = boardElement.querySelector(`[data-row="${d.row}"][data-col="${d.col}"]`);
        if (target) {
            target.classList.add('highlighted');
            if (serverState.boardState[d.row][d.col]) target.classList.add('occupied');
        }
    }
}

// ===== SEND MOVES =====

async function sendMove(startR, startC, endR, endC, promotedTo) {
    if (busy) return;
    busy = true;
    clearHighlights();
    selectedPos = null;
    try {
        const data = await apiPost(`/api/game/${gameId}/move`, { startR, startC, endR, endC, promotedTo });
        applyState(data.state, data.moveResult);
        // Trigger computer move if needed
        if (!data.state.gameOver && isComputerTurn()) {
            setTimeout(triggerComputerMove, 350);
        }
    } catch (err) {
        updateStatusMessage(`Error: ${err.message}`);
    } finally {
        busy = false;
    }
}

async function triggerComputerMove() {
    if (busy || !serverState || serverState.gameOver) return;
    if (selectedDifficulty === 4) {
        await triggerStockfishMove();
        return;
    }
    busy = true;
    try {
        const data = await apiPost(`/api/game/${gameId}/computer-move`, { difficulty: selectedDifficulty });
        applyState(data.state, data.moveResult);
        // For 'both' mode, keep going
        if (!data.state.gameOver && isComputerTurn()) {
            setTimeout(triggerComputerMove, 350);
        }
    } catch (err) {
        updateStatusMessage(`Computer error: ${err.message}`);
    } finally {
        busy = false;
    }
}

// ===== PROMOTION DIALOG =====

function showPromotionDialog(pawn) {
    const isWhitePawn = pawn === pawn.toLowerCase(); // lowercase = white
    const pieceCodes = isWhitePawn
        ? ['q', 'r', 'b', 'n']
        : ['Q', 'R', 'B', 'N'];

    const choicesDiv = document.getElementById('promotion-choices');
    choicesDiv.innerHTML = '';
    pieceCodes.forEach(code => {
        const div = document.createElement('div');
        div.className = 'promotion-piece';
        div.appendChild(makePieceImg(code));
        div.onclick = () => completePawnPromotion(code.toUpperCase());
        choicesDiv.appendChild(div);
    });
    document.getElementById('promotion-overlay').classList.add('active');
    document.getElementById('promotion-dialog').classList.add('active');
}

function completePawnPromotion(promotedTo) {
    document.getElementById('promotion-overlay').classList.remove('active');
    document.getElementById('promotion-dialog').classList.remove('active');
    if (!pendingPromotion) return;
    const { startR, startC, endR, endC } = pendingPromotion;
    pendingPromotion = null;
    if (onlineMode) {
        sendOnlineMove(startR, startC, endR, endC, promotedTo);
    } else {
        sendMove(startR, startC, endR, endC, promotedTo);
    }
}

// ===== RENDERING HELPERS =====

function updateCapturedPiecesDisplay(capturedPieces) {
    let whiteScore = 0, blackScore = 0;
    for (const color of ['white', 'black']) {
        const el = document.getElementById(`captured-${color}`);
        const list = capturedPieces[color] || [];
        el.innerHTML = '';
        for (const p of list) {
            const wrap = document.createElement('span');
            wrap.className = 'captured-piece';
            wrap.appendChild(makePieceImg(p, 'piece-img-captured'));
            el.appendChild(wrap);
            // captured-white = pieces white captured (black pieces lost)
            if (color === 'white') blackScore += AI.PIECE_VALUE[p.toLowerCase()] || 0;
            else whiteScore += AI.PIECE_VALUE[p.toLowerCase()] || 0;
        }
    }
    const diff = whiteScore - blackScore;
    const flipped = isBoardFlipped();
    const topEl    = document.getElementById('material-diff-top');
    const bottomEl = document.getElementById('material-diff-bottom');
    // When not flipped: black is at top → top bar shows black's advantage (diff < 0)
    // When flipped:     white is at top → top bar shows white's advantage (diff > 0)
    const topAdv    = flipped ? diff > 0 : diff < 0;
    const topVal    = flipped ? diff : -diff;
    const bottomAdv = flipped ? diff < 0 : diff > 0;
    const bottomVal = flipped ? -diff : diff;
    if (topEl) {
        topEl.textContent = topAdv ? `+${topVal}` : '';
        topEl.className = 'material-diff' + (topAdv ? ' adv' : '');
    }
    if (bottomEl) {
        bottomEl.textContent = bottomAdv ? `+${bottomVal}` : '';
        bottomEl.className = 'material-diff' + (bottomAdv ? ' adv' : '');
    }
    // Move the captured-pieces divs to the correct container based on flip
    // Top container should show pieces captured by the player at the top
    // Bottom container should show pieces captured by the player at the bottom
    const topCapEl    = topEl    && topEl.parentElement;
    const bottomCapEl = bottomEl && bottomEl.parentElement;
    if (topCapEl && bottomCapEl) {
        const whiteEl = document.getElementById('captured-white');
        const blackEl = document.getElementById('captured-black');
        if (flipped) {
            // Black at bottom: bottom bar = black's captures, top bar = white's captures
            if (whiteEl.parentElement !== topCapEl)    topCapEl.insertBefore(whiteEl, topEl);
            if (blackEl.parentElement !== bottomCapEl) bottomCapEl.insertBefore(blackEl, bottomEl);
        } else {
            // White at bottom: bottom bar = white's captures, top bar = black's captures
            if (blackEl.parentElement !== topCapEl)    topCapEl.insertBefore(blackEl, topEl);
            if (whiteEl.parentElement !== bottomCapEl) bottomCapEl.insertBefore(whiteEl, bottomEl);
        }
    }
}

function renderMoveHistory(history) {
    const displayHistory = reviewMode ? reviewMoveHistory : (history || serverState?.moveHistory || []);
    // Which move index is currently highlighted
    const currentIdx = reviewMode
        ? reviewIndex - 1
        : (browseIndex === null ? displayHistory.length - 1 : browseIndex - 1);

    moveListElement.innerHTML = '';
    for (let i = 0; i < displayHistory.length; i++) {
        const move = displayHistory[i];
        const isCurrent = i === currentIdx;
        const onClickFn = reviewMode
            ? () => navigateReview(i + 1)
            : () => browse(i + 1);

        if (move.player === 'white') {
            const moveNum = Math.floor(i / 2) + 1;
            const item = document.createElement('li');
            item.className = 'move-item' + (isCurrent ? ' current-review' : '');
            const numSpan = document.createElement('span');
            numSpan.className = 'move-number';
            numSpan.textContent = `${moveNum}.`;
            const moveSpan = document.createElement('span');
            moveSpan.className = 'white-notation';
            moveSpan.textContent = ' ' + move.notation;
            moveSpan.style.cursor = 'pointer';
            moveSpan.onclick = onClickFn;
            item.appendChild(numSpan);
            item.appendChild(moveSpan);
            moveListElement.appendChild(item);
        } else {
            const lastItem = moveListElement.lastChild;
            if (lastItem) {
                if (isCurrent) lastItem.classList.add('current-review');
                const moveSpan = document.createElement('span');
                moveSpan.className = 'black-notation';
                moveSpan.textContent = ' ' + move.notation;
                moveSpan.style.cursor = 'pointer';
                moveSpan.onclick = onClickFn;
                lastItem.appendChild(moveSpan);
            }
        }
    }
    const cur = moveListElement.querySelector('.current-review');
    if (cur) {
        cur.scrollIntoView({ block: 'nearest' });
    } else if (!reviewMode && browseIndex === null) {
        const wrapper = moveListElement.parentElement;
        wrapper.scrollTop = wrapper.scrollHeight;
    }
}

function updateStatusMessage(msg) {
    document.getElementById('game-status').textContent = msg;
}

// ===== GAME CONTROLS =====

async function resetGame() {
    if (busy) return;
    if (onlineMode) return; // can't reset an online game
    if (reviewMode) exitReviewMode();
    busy = true;
    try {
        const data = await apiPost(`/api/game/${gameId}/reset`);
        applyState(data.state);
        if (!data.state.gameOver && isComputerTurn()) {
            setTimeout(triggerComputerMove, 400);
        }
    } catch (err) {
        updateStatusMessage(`Error: ${err.message}`);
    } finally {
        busy = false;
    }
}

async function undoMove() {
    if (busy || reviewMode) return;
    if (onlineMode) {
        if (socket && onlineRoomCode) {
            socket.emit('room-undo-request', { roomCode: onlineRoomCode });
            updateStatusMessage('Undo requested — waiting for opponent...');
        }
        return;
    }
    // In computer mode, undo 2 half-moves so the player gets their move back
    const count = (computerColor !== null && serverState && serverState.moveHistory.length >= 2) ? 2 : 1;
    busy = true;
    try {
        const data = await apiPost(`/api/game/${gameId}/undo`, { count });
        applyState(data.state);
    } catch (err) {
        updateStatusMessage(err.message);
    } finally {
        busy = false;
    }
}

async function resign() {
    if (busy || reviewMode) return;
    if (onlineMode) {
        if (socket && onlineRoomCode) socket.emit('room-resign', { roomCode: onlineRoomCode });
        return;
    }
    busy = true;
    try {
        const data = await apiPost(`/api/game/${gameId}/resign`);
        SoundFX.draw();
        applyState(data.state);
        // Adjust status message for resign
        // gameResult '0-1' = black wins = white resigned; '1-0' = white wins = black resigned
        if (serverState) {
            const loser = serverState.gameResult === '0-1' ? 'White' : 'Black';
            const winner = loser === 'White' ? 'Black' : 'White';
            document.getElementById('game-status').textContent = `${loser} resigns — ${winner} wins`;
        }
    } catch (err) {
        updateStatusMessage(err.message);
    } finally {
        busy = false;
    }
}

// ===== COMPUTER MODE =====

let selectedComputerColor = 'white';

function showComputerModal() {
    if (onlineMode) return;
    document.getElementById('computer-overlay').classList.add('active');
    document.getElementById('computer-modal').classList.add('active');
}

function hideComputerModal() {
    document.getElementById('computer-overlay').classList.remove('active');
    document.getElementById('computer-modal').classList.remove('active');
}

function selectComputerColor(c) {
    selectedComputerColor = c;
    document.querySelectorAll('[data-cc]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.cc === c);
    });
}

function selectDifficulty(level) {
    selectedDifficulty = level;
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.level == level);
    });
}

function startVsComputer() {
    hideComputerModal();
    let color = selectedComputerColor;
    if (color === 'random') color = Math.random() < 0.5 ? 'white' : 'black';
    // computerColor = the color the computer plays (opposite of player)
    computerColor = color === 'white' ? 'black' : 'white';
    ['btn-vs-computer', 'btn-vs-computer2', 'mob-vs-computer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('active-mode');
    });
    resetGame();
}

function stopVsComputer() {
    hideComputerModal();
    computerColor = null;
    ['btn-vs-computer', 'btn-vs-computer2', 'mob-vs-computer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active-mode');
    });
    resetGame();
}

// ===== ANALYSIS =====

async function analyseGame() {
    if (busy) return;
    busy = true;
    updateStatusMessage('Analysing...');
    try {
        // Always run analysis in-browser — no server round-trip, works offline
        // and in online games. Online mode uses serverState.snapshots as boardHistory;
        // local mode uses the full localState directly.
        let analysisInput;
        if (onlineMode) {
            if (!serverState || !serverState.moveHistory.length) throw new Error('No moves to analyse');
            // serverState.snapshots now includes canCastle + enPassantTarget
            analysisInput = { ...serverState, boardHistory: serverState.snapshots };
        } else {
            if (!localState || !localState.moveHistory.length) throw new Error('No moves to analyse');
            analysisInput = localState;
        }
        renderAnalysis(Analysis.analyseGame(analysisInput));
    } catch (err) {
        updateStatusMessage(`Analysis error: ${err.message}`);
    } finally {
        busy = false;
        if (serverState) updateStatusFromState(serverState);
    }
}

function renderAnalysis(analysis) {
    const { summary, moves } = analysis;

    // ── Game info strip ──────────────────────────────
    const summaryDiv = document.getElementById('analysis-summary');
    summaryDiv.innerHTML = '';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'analysis-game-info';
    const phaseText = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }[summary.phase] || summary.phase;
    const phaseIcon = { opening: 'fas fa-book', middlegame: 'fas fa-chess-board', endgame: 'fas fa-chess-knight' }[summary.phase] || 'fas fa-chess';
    [
        ['fas fa-trophy', summary.result],
        ['fas fa-list-ol', summary.totalMoves + ' moves'],
        [phaseIcon, phaseText],
    ].forEach(([iconCls, text]) => {
        const span = document.createElement('span');
        const icon = document.createElement('i');
        icon.className = iconCls;
        span.appendChild(icon);
        span.appendChild(document.createTextNode('\u00a0' + text));
        infoDiv.appendChild(span);
    });
    summaryDiv.appendChild(infoDiv);

    // ── Player comparison cards ───────────────────────
    const playersDiv = document.createElement('div');
    playersDiv.className = 'analysis-players';

    for (const color of ['white', 'black']) {
        const s = summary[color];
        const card = document.createElement('div');
        card.className = 'analysis-player-card ' + color;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'analysis-player-name';
        nameDiv.textContent = color === 'white' ? '\u2654 White' : '\u265a Black';
        card.appendChild(nameDiv);

        const pct = s.accuracy;
        const pctClass = pct >= 70 ? 'high' : pct >= 45 ? 'mid' : 'low';
        const barColor  = pct >= 70 ? '#10b981' : pct >= 45 ? '#f59e0b' : '#ef4444';

        const accDiv = document.createElement('div');
        accDiv.className = 'analysis-player-accuracy ' + pctClass;
        accDiv.textContent = pct + '%';
        card.appendChild(accDiv);

        const subDiv = document.createElement('div');
        subDiv.className = 'analysis-accuracy-sub';
        subDiv.textContent = 'accuracy';
        card.appendChild(subDiv);

        const track = document.createElement('div');
        track.className = 'analysis-accuracy-bar-track';
        const fill = document.createElement('div');
        fill.className = 'analysis-accuracy-bar-fill';
        fill.style.width = pct + '%';
        fill.style.background = barColor;
        track.appendChild(fill);
        card.appendChild(track);

        const statGrid = document.createElement('div');
        statGrid.className = 'analysis-stat-grid';
        for (const [label, value, cls] of [
            ['Best',         s.best,         'stat-best'],
            ['Inaccuracies', s.inaccuracies,  'stat-inaccuracy'],
            ['Mistakes',     s.mistakes,      'stat-mistake'],
            ['Blunders',     s.blunders,      'stat-blunder'],
        ]) {
            const row = document.createElement('div');
            row.className = 'analysis-stat-row';
            const lbl = document.createElement('span');
            lbl.className = 'analysis-stat-label';
            lbl.textContent = label;
            const val = document.createElement('span');
            val.className = 'analysis-stat-value ' + cls;
            val.textContent = value;
            row.appendChild(lbl);
            row.appendChild(val);
            statGrid.appendChild(row);
        }
        card.appendChild(statGrid);
        playersDiv.appendChild(card);
    }
    summaryDiv.appendChild(playersDiv);

    // ── Move list ─────────────────────────────────────
    const list = document.getElementById('analysis-move-list');
    list.innerHTML = '';
    for (let i = 0; i < moves.length; i++) {
        const { notation, player, badge: b, cpLoss } = moves[i];
        const li = document.createElement('li');
        const isWhite = player === 'white';

        const numSpan = document.createElement('span');
        numSpan.className = 'analysis-num';
        numSpan.textContent = isWhite ? `${Math.floor(i / 2) + 1}.` : '';

        const sanSpan = document.createElement('span');
        sanSpan.className = 'analysis-san ' + (isWhite ? 'white-move' : 'black-move');
        sanSpan.textContent = notation;

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'analysis-badge ' + b.cls;
        badgeSpan.textContent = b.label;

        li.appendChild(numSpan);
        li.appendChild(sanSpan);
        li.appendChild(badgeSpan);
        if (cpLoss > 5) {
            const cpSpan = document.createElement('span');
            cpSpan.style.cssText = 'color:#999;font-size:11px';
            cpSpan.textContent = `(\u2212${cpLoss}cp)`;
            li.appendChild(cpSpan);
        }
        list.appendChild(li);
    }

    document.getElementById('analysis-overlay').classList.add('active');
    document.getElementById('analysis-modal').classList.add('active');
}

function hideAnalysisModal() {
    document.getElementById('analysis-modal').classList.remove('active');
    document.getElementById('analysis-overlay').classList.remove('active');
}

// ===== PGN EXPORT =====

async function exportPGN() {
    if (busy) return;
    try {
        const whiteName = (computerColor === 'white' || computerColor === 'both') ? 'Computer' : 'Human';
        const blackName = (computerColor === 'black' || computerColor === 'both') ? 'Computer' : 'Human';
        const data = await apiGet(`/api/game/${gameId}/pgn?white=${whiteName}&black=${blackName}`);
        const text = data.pgn;

        // Use File System Access API if available (Chrome/Edge)
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'game.pgn',
                    types: [{ description: 'PGN file', accept: { 'text/plain': ['.pgn'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                return;
            } catch (e) {
                if (e.name === 'AbortError') return; // user cancelled
                // fall through to download fallback
            }
        }

        // Fallback: trigger a browser download
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'game.pgn';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } catch (err) {
        alert(err.message);
    }
}

// ===== PGN IMPORT =====

function importPGN() {
    // Use File System Access API if available
    if (window.showOpenFilePicker) {
        window.showOpenFilePicker({
            types: [{ description: 'PGN file', accept: { 'text/plain': ['.pgn'] } }],
            multiple: false,
        }).then(([handle]) => handle.getFile()).then(file => file.text()).then(loadPgnText)
          .catch(e => { if (e.name !== 'AbortError') alert(e.message); });
    } else {
        // Fallback: hidden <input type="file">
        const input = document.getElementById('pgn-file-input');
        input.value = '';
        input.click();
    }
}

function handlePgnFile(input) {
    const file = input.files[0];
    if (!file) return;
    file.text().then(loadPgnText).catch(e => alert(e.message));
}

async function loadPgnText(text) {
    text = text.trim();
    if (!text) return;
    if (busy) return;
    busy = true;
    updateStatusMessage('Loading PGN...');
    try {
        const data = await apiPost(`/api/game/${gameId}/pgn`, { pgn: text });
        reviewSnapshots = data.snapshots;
        reviewMoveHistory = data.moveHistory;
        serverState = data.state;
        buildValidMovesMap([]);
        // PGN import bypasses applyState(), so persist explicitly
        if (!onlineMode && localState) persistLocalState();
        enterReviewMode(data.snapshots.length - 1);
    } catch (err) {
        alert(`Import failed: ${err.message}`);
        if (serverState) updateStatusFromState(serverState);
    } finally {
        busy = false;
    }
}

// ===== REVIEW MODE =====

// ===== REVIEW MODE (PGN/Analysis) =====

function enterReviewMode(index) {
    reviewMode = true;
    document.getElementById('btn-vs-computer').style.display = 'none';
    navigateReview(index);
}

function exitReviewMode() {
    reviewMode = false;
    reviewSnapshots = [];
    reviewMoveHistory = [];
    reviewIndex = 0;
    document.getElementById('btn-vs-computer').style.display = onlineMode ? 'none' : '';
    resetGame();
}

function navigateReview(index) {
    if (!reviewMode || reviewSnapshots.length === 0) return;
    reviewIndex = Math.max(0, Math.min(index, reviewSnapshots.length - 1));
    const snap = reviewSnapshots[reviewIndex];

    updateCapturedPiecesDisplay(snap.capturedPieces || { white: [], black: [] });
    renderBoard();
    renderMoveHistory();
    updateButtonVisibility(serverState || { gameOver: true, moveHistory: reviewMoveHistory });
    updateNavVisibility();

    if (reviewIndex === 0) {
        updateStatusMessage('Start of game');
    } else {
        const mv = reviewMoveHistory[reviewIndex - 1];
        const moveNum = Math.ceil(reviewIndex / 2);
        updateStatusMessage(`Move ${moveNum}${mv.player === 'black' ? '...' : '.'} ${mv.notation}`);
    }
}

// ===== LIVE BROWSE (history navigation during a live game) =====

function browse(index) {
    if (liveSnapshots.length <= 1) return;
    const maxIdx = liveSnapshots.length - 1;
    const clamped = Math.max(0, Math.min(index, maxIdx));
    browseIndex = clamped === maxIdx ? null : clamped; // at latest = live view
    if (browseIndex !== null) {
        updateCapturedPiecesDisplay(liveSnapshots[browseIndex].capturedPieces);
    } else {
        updateCapturedPiecesDisplay(serverState.capturedPieces);
    }
    renderBoard();
    renderMoveHistory();
    updateNavVisibility();
    // Update status message
    if (browseIndex === null) {
        updateStatusFromState(serverState);
    } else if (browseIndex === 0) {
        updateStatusMessage('Start of game');
    } else {
        const mv = serverState.moveHistory[browseIndex - 1];
        const moveNum = Math.ceil(browseIndex / 2);
        updateStatusMessage(`Move ${moveNum}${mv.player === 'black' ? '...' : '.'} ${mv.notation}`);
    }
}

function returnToLive() {
    browseIndex = null;
    updateCapturedPiecesDisplay(serverState.capturedPieces);
    renderBoard();
    renderMoveHistory(serverState.moveHistory);
    updateStatusFromState(serverState);
    updateNavVisibility();
}

// ===== UNIFIED NAV DISPATCH =====

function navFirst() {
    if (reviewMode) navigateReview(0);
    else browse(0);
}
function navPrev() {
    if (reviewMode) navigateReview(reviewIndex - 1);
    else browse((browseIndex ?? liveSnapshots.length - 1) - 1);
}
function navNext() {
    if (reviewMode) navigateReview(reviewIndex + 1);
    else browse((browseIndex ?? liveSnapshots.length - 1) + 1);
}
function navLast() {
    if (reviewMode) navigateReview(reviewSnapshots.length - 1);
    else browse(liveSnapshots.length - 1);
}

function updateNavVisibility() {
    const nav = document.getElementById('move-nav');
    if (!nav) return;
    const hasHistory = reviewMode ? reviewSnapshots.length > 1 : liveSnapshots.length > 1;
    nav.style.display = hasHistory ? '' : 'none';
    document.getElementById('review-banner').style.display = reviewMode ? '' : 'none';
    const returnBtn = document.getElementById('btn-return-live');
    if (returnBtn) returnBtn.style.display = (!reviewMode && browseIndex !== null) ? '' : 'none';
    document.getElementById('btn-exit-review').style.display = reviewMode ? '' : 'none';
}

document.addEventListener('keydown', (e) => {
    const canNav = reviewMode || browseIndex !== null || liveSnapshots.length > 1;
    if (!canNav) return;
    // Don't steal keys when typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navPrev(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navNext(); }
    if (e.key === 'Home') { e.preventDefault(); navFirst(); }
    if (e.key === 'End')  { e.preventDefault(); navLast(); }
});

// ===== SOUND TOGGLE =====

function toggleSound() {
    const on = SoundFX.toggle();
    ['btn-sound', 'btn-sound2', 'mob-sound'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.toggle('active-mode', on); el.classList.toggle('btn-muted', !on); }
    });
}

function clearAppCache() {
    if (confirm('Clear cache and reload app? Any unsaved games will be reset.')) {
        localStorage.removeItem('localGameState');
        localStorage.removeItem('onlineRoom');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(reg => reg.unregister());
            });
        }
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        setTimeout(() => { location.reload(true); }, 300);
    }
}

// ===== ONLINE MODE =====

function initSocket() {
    if (socket) return;
    socket = io();

    socket.on('room-created', ({ roomCode, color, token, state }) => {
        onlineRoomCode = roomCode;
        onlineColor = color;
        onlineToken = token;
        opponentConnected = false;
        localStorage.setItem('onlineRoom', JSON.stringify({ roomCode, token }));

        // Show waiting section with updated HTML structure
        document.getElementById('online-create-btn-section').style.display = 'none';
        document.getElementById('online-waiting-section').style.display = 'block';
        document.getElementById('code-text').textContent = roomCode;

        serverState = state;
        liveSnapshots = (state.snapshots && state.snapshots.length > 0)
            ? state.snapshots.map(s => ({
                board: s.board.map(r => [...r]),
                lastMove: s.lastMove,
                capturedPieces: {
                    white: [...(s.capturedPieces?.white || [])],
                    black: [...(s.capturedPieces?.black || [])],
                },
            }))
            : [];
        browseIndex = null;
        buildValidMovesMap(state.allValidMoves || []);
        renderBoard();
        renderMoveHistory(state.moveHistory);
        updateCapturedPiecesDisplay(state.capturedPieces);
        updateOnlineBar();
        updateButtonVisibility(state);
        updateNavVisibility();
        updateStatusMessage(`Room created — waiting for opponent (you are ${color})`);
    });

    socket.on('room-joined', ({ roomCode, color, token, reconnected, state }) => {
        onlineRoomCode = roomCode;
        onlineColor = color;
        onlineToken = token;
        opponentConnected = state.whiteConnected && state.blackConnected;
        localStorage.setItem('onlineRoom', JSON.stringify({ roomCode, token }));
        hideReconnectBanner();

        // Reconnecting before opponent ever joined — restore waiting room UI
        if (reconnected && state.moveHistory.length === 0 && !opponentConnected) {
            onlineMode = false;
            document.getElementById('online-create-btn-section').style.display = 'none';
            document.getElementById('online-waiting-section').style.display = 'block';
            document.getElementById('code-text').textContent = roomCode;
            document.getElementById('online-overlay').classList.add('active');
            document.getElementById('online-modal').classList.add('active');
            serverState = state;
            buildValidMovesMap(state.allValidMoves || []);
            renderBoard();
            renderMoveHistory(state.moveHistory);
            updateCapturedPiecesDisplay(state.capturedPieces);
            updateOnlineBar();
            updateButtonVisibility(state);
            updateNavVisibility();
            updateStatusMessage(`Room ${roomCode} — waiting for opponent (you are ${color})`);
            return;
        }

        onlineMode = true;
        hideOnlineModal();
        applyState(state);
        updateOnlineBar();
        updateStatusMessage(reconnected
            ? `Reconnected as ${color}`
            : `Joined room ${roomCode} — you are ${color}`);
    });

    socket.on('game-start', ({ state }) => {
        onlineMode = true;
        opponentConnected = true;
        hideOnlineModal();
        hideReconnectBanner();
        applyState(state);
        updateOnlineBar();
    });

    socket.on('opponent-connected', ({ state }) => {
        onlineMode = true;
        opponentConnected = true;
        applyState(state);
        updateOnlineBar();
        updateStatusMessage(`Opponent connected — game starting!`);
        appendChatSystem('Opponent connected');
        setTimeout(() => { if (serverState && !serverState.gameOver) updateStatusFromState(serverState); }, 2000);
    });

    socket.on('game-state', ({ state, moveResult }) => {
        applyState(state, moveResult);
        updateOnlineBar();
        if (moveResult && moveResult.resigned) {
            const loser = moveResult.resignedColor;
            const winner = loser === 'white' ? 'Black' : 'White';
            SoundFX.draw();
            document.getElementById('game-status').textContent = `${loser === 'white' ? 'White' : 'Black'} resigns — ${winner} wins`;
        } else if (moveResult && moveResult.drawAgreed) {
            SoundFX.draw();
            document.getElementById('game-status').textContent = 'Draw agreed';
        }
    });

    socket.on('opponent-disconnected', ({ color }) => {
        opponentConnected = false;
        updateOnlineBar();
        appendChatSystem('Opponent disconnected');
        updateStatusMessage(`Opponent disconnected — waiting for them to reconnect...`);
    });

    socket.on('draw-offer', ({ from }) => {
        document.getElementById('draw-offer-overlay').classList.add('active');
        document.getElementById('draw-offer-modal').classList.add('active');
    });

    socket.on('draw-declined', () => {
        updateStatusMessage('Draw offer declined');
        setTimeout(() => { if (serverState && !serverState.gameOver) updateStatusFromState(serverState); }, 2500);
    });

    socket.on('undo-request', () => {
        document.getElementById('undo-request-overlay').classList.add('active');
        document.getElementById('undo-request-modal').classList.add('active');
    });

    socket.on('undo-declined', () => {
        updateStatusMessage('Undo request declined');
        setTimeout(() => { if (serverState && !serverState.gameOver) updateStatusFromState(serverState); }, 2500);
    });

    socket.on('room-error', ({ message }) => {
        // Failed reconnect — room expired or server restarted
        if (message === 'Room not found' && onlineRoomCode) {
            localStorage.removeItem('onlineRoom');
            onlineRoomCode = null;
            onlineToken = null;
            onlineMode = false;
            opponentConnected = false;
            hideReconnectBanner();
            updateOnlineBar();
            updateStatusMessage('Previous game session expired — start a new game.');
            return;
        }
        // Don't alert for undo errors — show in status bar instead
        if (message.includes('undo') || message.includes('Undo')) {
            updateStatusMessage(message);
            setTimeout(() => { if (serverState && !serverState.gameOver) updateStatusFromState(serverState); }, 2500);
        } else {
            alert(`Online error: ${message}`);
        }
    });

    socket.on('chat-message', ({ color, text }) => {
        const isYou = color === onlineColor;
        appendChatMessage(isYou ? 'You' : 'Opponent', text, isYou ? 'you' : 'opp');
    });

    // ── Reconnection ──────────────────────────────────────────────────
    // Single path: 'connect' fires on initial connect AND every auto-reconnect.
    socket.on('connect', () => {
        if (onlineRoomCode && onlineToken) {
            socket.emit('join-room', { roomCode: onlineRoomCode, token: onlineToken });
        }
    });

    socket.on('disconnect', (reason) => {
        // Intentional disconnect (leaving game) — don't show reconnect UI
        if (reason === 'io client disconnect') return;
        if (onlineRoomCode) {
            showReconnectBanner('Connection lost — reconnecting...');
            // Dismiss stale modals; server state is authoritative on rejoin
            document.getElementById('draw-offer-overlay').classList.remove('active');
            document.getElementById('draw-offer-modal').classList.remove('active');
            document.getElementById('undo-request-overlay').classList.remove('active');
            document.getElementById('undo-request-modal').classList.remove('active');
        }
    });

    socket.io.on('reconnect_attempt', (attempt) => {
        if (onlineRoomCode) {
            document.getElementById('reconnect-msg').textContent =
                `Reconnecting... (attempt ${attempt})`;
        }
    });

    socket.io.on('reconnect_failed', () => {
        if (onlineRoomCode) {
            document.getElementById('reconnect-spinner').style.display = 'none';
            document.getElementById('reconnect-msg').textContent =
                'Could not reconnect — please refresh the page.';
        }
    });
}

function sendOnlineMove(startR, startC, endR, endC, promotedTo) {
    if (!socket || !onlineRoomCode) return;
    socket.emit('room-move', { roomCode: onlineRoomCode, startR, startC, endR, endC, promotedTo });
}

function offerDraw() {
    if (!socket || !onlineRoomCode || !onlineMode) return;
    socket.emit('room-draw-offer', { roomCode: onlineRoomCode });
    updateStatusMessage('Draw offered — waiting for response...');
}

function acceptDraw() {
    document.getElementById('draw-offer-overlay').classList.remove('active');
    document.getElementById('draw-offer-modal').classList.remove('active');
    if (socket && onlineRoomCode) socket.emit('room-draw-accept', { roomCode: onlineRoomCode });
}

function declineDraw() {
    document.getElementById('draw-offer-overlay').classList.remove('active');
    document.getElementById('draw-offer-modal').classList.remove('active');
    if (socket && onlineRoomCode) socket.emit('room-draw-decline', { roomCode: onlineRoomCode });
}

function acceptUndo() {
    document.getElementById('undo-request-overlay').classList.remove('active');
    document.getElementById('undo-request-modal').classList.remove('active');
    if (socket && onlineRoomCode) socket.emit('room-undo-accept', { roomCode: onlineRoomCode });
}

function declineUndo() {
    document.getElementById('undo-request-overlay').classList.remove('active');
    document.getElementById('undo-request-modal').classList.remove('active');
    if (socket && onlineRoomCode) socket.emit('room-undo-decline', { roomCode: onlineRoomCode });
}

// ===== ONLINE LOBBY UI =====

function showOnlineModal() {
    initSocket();
    checkServerStatus();
    // Reset tabs to create section
    switchOnlineTab('create');
    // Reset UI
    if (!onlineRoomCode) {
        document.getElementById('online-waiting-section').style.display = 'none';
        document.getElementById('online-create-btn-section').style.display = 'block';
    } else {
        document.getElementById('online-waiting-section').style.display = 'block';
        document.getElementById('online-create-btn-section').style.display = 'none';
    }
    document.getElementById('online-overlay').classList.add('active');
    document.getElementById('online-modal').classList.add('active');
}

function hideOnlineModal() {
    document.getElementById('online-overlay').classList.remove('active');
    document.getElementById('online-modal').classList.remove('active');
}

function switchOnlineTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.online-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    // Deactivate all tabs
    document.querySelectorAll('.online-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    // Show selected tab and activate button
    document.getElementById('tab-' + tabName).classList.add('active');
    document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
    if (tabName === 'browse') loadOpenRooms();
}

// ===== OPEN ROOMS BROWSER =====



function formatWaitTime(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

async function loadOpenRooms() {
    const list = document.getElementById('open-rooms-list');
    const btn = document.querySelector('.open-rooms-refresh');
    if (btn) btn.classList.add('spinning');
    try {
        const data = await apiGet('/api/rooms/open');
        list.innerHTML = '';
        if (!data.rooms || data.rooms.length === 0) {
            list.innerHTML = '<div class="open-rooms-empty">No open games right now — create one!</div>';
            return;
        }
        for (const room of data.rooms) {
            const oppColor = room.creatorColor === 'white' ? 'black' : 'white';
            const row = document.createElement('div');
            row.className = 'open-room-row';
            row.innerHTML = `
                <span class="open-room-code">${room.code}</span>
                <span class="open-room-meta">
                    <span class="color-pip color-pip-${oppColor}"></span>
                    You play ${oppColor} &bull; ${formatWaitTime(room.waitingSince)}
                </span>
                <button class="open-room-join" onclick="quickJoinRoom('${room.code}')">Join</button>`;
            list.appendChild(row);
        }
    } catch (_) {
        list.innerHTML = '<div class="open-rooms-empty">Could not load games.</div>';
    } finally {
        if (btn) btn.classList.remove('spinning');
    }
}

function quickJoinRoom(code) {
    if (!socket) initSocket();
    socket.emit('join-room', { roomCode: code });
}

function selectOnlineColor(color) {
    selectedOnlineColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === color);
    });
}

function createOnlineRoom() {
    if (!socket) initSocket();
    socket.emit('create-room', { color: selectedOnlineColor });
}

function joinOnlineRoom() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (code.length !== 6) { alert('Please enter a 6-character room code'); return; }
    if (!socket) initSocket();
    socket.emit('join-room', { roomCode: code });
}

function copyRoomCode() {
    const codeSpan = document.getElementById('code-text');
    const code = codeSpan.textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            const orig = codeSpan.textContent;
            const origParent = codeSpan.parentElement;
            codeSpan.textContent = '✓ Copied!';
            setTimeout(() => { codeSpan.textContent = orig; }, 1200);
        });
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function updateChatVisibility() {
    const chatPanel = document.getElementById('chat-panel');
    const offlineMsg = document.getElementById('sidebar-offline-msg');
    if (chatPanel) chatPanel.style.display = onlineMode ? '' : 'none';
    if (offlineMsg) offlineMsg.style.display = onlineMode ? 'none' : '';
    // Badge on chat tab bar button
    const tabChat = document.getElementById('tab-chat');
    if (tabChat) tabChat.classList.toggle('tab-active', onlineMode);
}

function appendChatMessage(sender, text, type) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${type}`;
    const span = document.createElement('span');
    span.className = 'chat-msg-sender';
    span.textContent = sender + ':';
    div.appendChild(span);
    div.appendChild(document.createTextNode(' ' + text));
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function appendChatSystem(text) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-sys';
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function sendChat(e) {
    e.preventDefault();
    if (!socket || !onlineRoomCode || !onlineMode) return;
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('room-chat', { roomCode: onlineRoomCode, message: text });
    input.value = '';
}

function updateOnlineBar() {
    const bar = document.getElementById('online-bar');
    if (!onlineMode || !onlineRoomCode) { bar.style.display = 'none'; updateChatVisibility(); return; }
    bar.style.display = 'flex';
    document.getElementById('online-bar-code').textContent = onlineRoomCode;
    document.getElementById('online-bar-you').textContent = ` · You: ${onlineColor}`;
    const oppColor = onlineColor === 'white' ? 'black' : 'white';
    const opp = document.getElementById('online-bar-opp');
    if (opponentConnected) {
        opp.innerHTML = `<span class="online-status-dot dot-connected"></span> Opponent: ${oppColor}`;
    } else {
        opp.innerHTML = `<span class="online-status-dot dot-disconnected"></span> Opponent disconnected`;
    }
    updateChatVisibility();
}

function showReconnectBanner(msg) {
    const banner = document.getElementById('reconnect-banner');
    const spinner = document.getElementById('reconnect-spinner');
    document.getElementById('reconnect-msg').textContent = msg || 'Reconnecting...';
    if (spinner) spinner.style.display = '';
    banner.classList.add('active');
    busy = true;
}

function hideReconnectBanner() {
    document.getElementById('reconnect-banner').classList.remove('active');
    busy = false;
}

// Check for a saved room on load (reconnection)
function tryReconnectOnline() {
    const saved = localStorage.getItem('onlineRoom');
    if (!saved) return;
    try {
        const { roomCode, token } = JSON.parse(saved);
        if (roomCode && token) {
            // Pre-set credentials BEFORE initSocket so the 'connect' handler
            // can emit join-room as soon as the socket is ready.
            onlineRoomCode = roomCode;
            onlineToken = token;
            showReconnectBanner('Reconnecting to previous game...');
            initSocket();
            // If the socket is already connected (edge case), emit immediately.
            if (socket.connected) {
                socket.emit('join-room', { roomCode, token });
            }
        }
    } catch (_) {
        localStorage.removeItem('onlineRoom');
    }
}

// ===== SERVER STATUS =====



function setServerDot(state) {
    // state: 'checking' | 'online' | 'offline' | 'noserver'
    const titles = {
        checking: 'Checking server…',
        online:   'Server reachable',
        offline:  'No network connection',
        noserver: 'Server unreachable',
    };
    const dots = [document.getElementById('server-dot'), document.getElementById('server-dot-mobile')];
    for (const dot of dots) {
        if (!dot) continue;
        dot.className = dot.className.replace(/\bss-\S+/g, '').trimEnd();
        dot.classList.add('server-status-dot', 'ss-' + state);
        dot.title = titles[state] || '';
    }
}

async function checkServerStatus() {
    if (!navigator.onLine) {
        setServerDot('offline');
        return;
    }
    setServerDot('checking');
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch('/api/ping', { signal: ctrl.signal });
        clearTimeout(tid);
        setServerDot(res.ok ? 'online' : 'noserver');
    } catch (_) {
        setServerDot('noserver');
    }
}

// Update immediately on network events
window.addEventListener('online',  () => checkServerStatus());
window.addEventListener('offline', () => setServerDot('offline'));

// ===== BOOT =====

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

initGame().then(() => {
    tryReconnectOnline();
    // Only ping server on startup if we might need online mode
    if (localStorage.getItem('onlineRoom') || onlineMode) checkServerStatus();
}).catch(err => {
    document.getElementById('game-status').textContent = onlineMode ? 'Failed to connect to server' : 'Failed to start game';
    console.error('Init error:', err);
});
