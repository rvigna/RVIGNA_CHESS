'use strict';

const { randomBytes } = require('crypto');
const Chess = require('./chess');

// ===== ROOM STORE =====
const rooms = new Map(); // roomCode → Room

// Expire rooms idle > 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 6 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 30 * 60 * 1000);

function generateRoomCode() {
  // 6 uppercase alphanumeric characters, unambiguous (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(randomBytes(6), b => chars[b % chars.length]).join('');
  } while (rooms.has(code));
  return code;
}

function generateToken() {
  return randomBytes(24).toString('hex');
}

// ===== ROOM CREATION =====

function createRoom(preferredColor) {
  const code = generateRoomCode();
  const creatorColor = preferredColor === 'black' ? 'black'
    : preferredColor === 'random' ? (Math.random() < 0.5 ? 'white' : 'black')
    : 'white';
  const opponentColor = creatorColor === 'white' ? 'black' : 'white';

  const room = {
    code,
    state: Chess.createInitialState(),
    players: {
      [creatorColor]: { socketId: null, token: generateToken(), connected: false },
      [opponentColor]: { socketId: null, token: generateToken(), connected: false },
    },
    creatorColor,
    opponentColor,
    lastActivity: Date.now(),
    drawOffer: null,   // 'white' | 'black' | null
    undoRequest: null, // 'white' | 'black' | null — pending undo request
  };

  rooms.set(code, room);
  return { room, code, creatorToken: room.players[creatorColor].token, creatorColor };
}

// ===== ROOM JOINING =====

function joinRoom(code, socketId, token) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { success: false, error: 'Room not found' };

  // Check if this is a reconnect
  for (const color of ['white', 'black']) {
    if (room.players[color].token === token) {
      room.players[color].socketId = socketId;
      room.players[color].connected = true;
      room.lastActivity = Date.now();
      return { success: true, color, reconnected: true, room };
    }
  }

  // New join: find the empty slot (opponent seat)
  const emptyColor = room.opponentColor;
  if (room.players[emptyColor].socketId !== null && room.players[emptyColor].connected) {
    return { success: false, error: 'Room is full' };
  }

  room.players[emptyColor].socketId = socketId;
  room.players[emptyColor].connected = true;
  room.lastActivity = Date.now();
  return {
    success: true,
    color: emptyColor,
    token: room.players[emptyColor].token,
    reconnected: false,
    room,
  };
}

// ===== DISCONNECT =====

function handleDisconnect(socketId) {
  for (const [, room] of rooms) {
    for (const color of ['white', 'black']) {
      if (room.players[color].socketId === socketId) {
        room.players[color].connected = false;
        return { room, disconnectedColor: color };
      }
    }
  }
  return null;
}

// ===== GETTERS =====

function getRoom(code) {
  return rooms.get(code.toUpperCase()) || null;
}

function getColorBySocket(room, socketId) {
  for (const color of ['white', 'black']) {
    if (room.players[color].socketId === socketId) return color;
  }
  return null;
}

function bothConnected(room) {
  return room.players.white.connected && room.players.black.connected;
}

function opponentColor(color) {
  return color === 'white' ? 'black' : 'white';
}

// Returns rooms that are waiting for a second player (opponent never joined)
function getOpenRooms() {
  const open = [];
  for (const [, room] of rooms) {
    const opp = room.players[room.opponentColor];
    const creator = room.players[room.creatorColor];
    if (creator.connected && opp.socketId === null) {
      open.push({
        code: room.code,
        creatorColor: room.creatorColor,
        waitingSince: room.lastActivity,
      });
    }
  }
  // Newest first
  open.sort((a, b) => b.waitingSince - a.waitingSince);
  return open;
}

module.exports = {
  createRoom,
  joinRoom,
  handleDisconnect,
  getRoom,
  getColorBySocket,
  bothConnected,
  opponentColor,
  getOpenRooms,
};
