'use strict';

const http = require('http');
const express = require('express');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');

const Chess = require('./src/chess');
const Rooms = require('./src/rooms');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ===== API =====

// Lightweight health check — used by the client server-status dot
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// List rooms waiting for a second player
app.get('/api/rooms/open', (_req, res) => res.json({ rooms: Rooms.getOpenRooms() }));

// Serve the SPA for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ===== SOCKET.IO — ONLINE MULTIPLAYER =====

function roomClientState(room) {
  return {
    ...Chess.getClientState(room.state),
    whiteConnected: room.players.white.connected,
    blackConnected: room.players.black.connected,
  };
}

io.on('connection', (socket) => {

  // --- Create a room ---
  socket.on('create-room', ({ color } = {}) => {
    const { room, code, creatorToken, creatorColor } = Rooms.createRoom(color || 'white');
    room.players[creatorColor].socketId = socket.id;
    room.players[creatorColor].connected = true;
    socket.join(code);
    socket.emit('room-created', {
      roomCode: code,
      color: creatorColor,
      token: creatorToken,
      state: roomClientState(room),
    });
  });

  // --- Join / reconnect to a room ---
  socket.on('join-room', ({ roomCode, token } = {}) => {
    if (!roomCode) return socket.emit('room-error', { message: 'Room code required' });

    const result = Rooms.joinRoom(roomCode, socket.id, token || '');
    if (!result.success) return socket.emit('room-error', { message: result.error });

    const { room, color, reconnected } = result;
    socket.join(roomCode.toUpperCase());

    socket.emit('room-joined', {
      roomCode: roomCode.toUpperCase(),
      color,
      token: result.token || token,
      reconnected,
      state: roomClientState(room),
    });

    // Notify opponent
    const oppColor = Rooms.opponentColor(color);
    const oppSocket = room.players[oppColor].socketId;
    if (oppSocket) {
      io.to(oppSocket).emit('opponent-connected', { state: roomClientState(room) });
    }

    // Start game once both are connected
    if (Rooms.bothConnected(room)) {
      io.to(roomCode.toUpperCase()).emit('game-start', { state: roomClientState(room) });
    }
  });

  // --- Player move ---
  socket.on('room-move', ({ roomCode, startR, startC, endR, endC, promotedTo } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room) return socket.emit('room-error', { message: 'Room not found' });
    if (room.state.gameOver) return socket.emit('room-error', { message: 'Game is over' });

    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color) return socket.emit('room-error', { message: 'You are not in this room' });
    if (color !== room.state.turn) return socket.emit('room-error', { message: 'Not your turn' });
    if (!Rooms.bothConnected(room)) return socket.emit('room-error', { message: 'Opponent not connected' });

    const moveResult = Chess.makeMove(room.state, +startR, +startC, +endR, +endC, promotedTo || null);
    if (!moveResult.success) return socket.emit('room-error', { message: moveResult.error });

    room.lastActivity = Date.now();
    room.drawOffer = null;
    room.undoRequest = null; // cancel any pending undo when a move is made

    io.to(roomCode.toUpperCase()).emit('game-state', {
      state: roomClientState(room),
      moveResult,
    });
  });

  // --- Resign ---
  socket.on('room-resign', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room) return;
    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color) return;
    const result = Chess.resign(room.state);
    if (!result.success) return socket.emit('room-error', { message: result.error });
    room.lastActivity = Date.now();
    io.to(roomCode.toUpperCase()).emit('game-state', {
      state: roomClientState(room),
      moveResult: { success: true, resigned: true, resignedColor: color },
    });
  });

  // --- Draw offer ---
  socket.on('room-draw-offer', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room || room.state.gameOver) return;
    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color) return;
    room.drawOffer = color;
    const oppSocket = room.players[Rooms.opponentColor(color)].socketId;
    if (oppSocket) io.to(oppSocket).emit('draw-offer', { from: color });
  });

  // --- Draw accept ---
  socket.on('room-draw-accept', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room || !room.drawOffer || room.state.gameOver) return;
    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color || color === room.drawOffer) return; // can't accept own offer
    room.state.gameOver = true;
    room.state.gameResult = '1/2-1/2';
    room.drawOffer = null;
    room.lastActivity = Date.now();
    io.to(roomCode.toUpperCase()).emit('game-state', {
      state: roomClientState(room),
      moveResult: { success: true, drawAgreed: true },
    });
  });

  // --- Draw decline ---
  socket.on('room-draw-decline', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room) return;
    const offererColor = room.drawOffer;  // read before clearing
    room.drawOffer = null;
    if (offererColor) {
      const offSocket = room.players[offererColor].socketId;
      if (offSocket) io.to(offSocket).emit('draw-declined');
    }
  });

  // --- Undo request ---
  socket.on('room-undo-request', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room || room.state.gameOver) return socket.emit('room-error', { message: 'Cannot request undo' });

    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color) return socket.emit('room-error', { message: 'You are not in this room' });

    const history = room.state.moveHistory;
    if (history.length === 0) return socket.emit('room-error', { message: 'No moves to undo' });
    if (history[history.length - 1].player !== color) {
      return socket.emit('room-error', { message: 'You can only undo your own last move' });
    }
    if (room.undoRequest) return socket.emit('room-error', { message: 'An undo request is already pending' });

    const oppColor = Rooms.opponentColor(color);
    const oppSocket = room.players[oppColor].socketId;
    if (!oppSocket || !room.players[oppColor].connected) {
      return socket.emit('room-error', { message: 'Opponent not connected' });
    }

    room.undoRequest = color;
    io.to(oppSocket).emit('undo-request', { from: color });
  });

  // --- Undo accept ---
  socket.on('room-undo-accept', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room || !room.undoRequest || room.state.gameOver) return;

    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color || color === room.undoRequest) return; // can't accept own request

    const result = Chess.undoMove(room.state, 1);
    if (!result.success) return socket.emit('room-error', { message: result.error });

    room.undoRequest = null;
    room.lastActivity = Date.now();
    io.to(roomCode.toUpperCase()).emit('game-state', {
      state: roomClientState(room),
      moveResult: { success: true, undone: true },
    });
  });

  // --- Undo decline ---
  socket.on('room-undo-decline', ({ roomCode } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room) return;

    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color) return;

    const requesterColor = room.undoRequest;
    room.undoRequest = null;
    if (requesterColor) {
      const reqSocket = room.players[requesterColor].socketId;
      if (reqSocket) io.to(reqSocket).emit('undo-declined');
    }
  });

  // --- Chat ---
  socket.on('room-chat', ({ roomCode, message } = {}) => {
    const room = Rooms.getRoom(roomCode);
    if (!room) return;
    const color = Rooms.getColorBySocket(room, socket.id);
    if (!color) return;
    const text = String(message || '').trim().slice(0, 200);
    if (!text) return;
    io.to(roomCode.toUpperCase()).emit('chat-message', { color, text });
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const result = Rooms.handleDisconnect(socket.id);
    if (!result) return;
    const { room, disconnectedColor } = result;
    io.to(room.code).emit('opponent-disconnected', { color: disconnectedColor });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Chess server running on http://localhost:${PORT}`);
});

module.exports = app;
