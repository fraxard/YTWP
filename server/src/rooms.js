// rooms.js — in-memory room store.
// Each participant now also carries a `clientId` so the server can match
// a returning browser to its existing slot when it reconnects after a refresh.

const rooms = {};

function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms[id] ? generateRoomId() : id;
}

function createRoom(hostSocket, username) {
  const roomId = generateRoomId();
  const clientId = hostSocket.handshake.query.clientId || hostSocket.id;

  rooms[roomId] = {
    id: roomId,
    createdAt: Date.now(),   // used by the client stopwatch
    participants: {
      [hostSocket.id]: {
        id: hostSocket.id,
        clientId,          // stable browser identity
        username,
        role: "host",
      },
    },
    videoState: {
      videoId: null,
      playing: false,
      currentTime: 0,
      lastUpdatedAt: Date.now(),
    },
    messages: [],
  };

  return rooms[roomId];
}

function getRoom(roomId) {
  return rooms[roomId] || null;
}

function addParticipant(roomId, socketId, username, clientId) {
  if (!rooms[roomId]) return null;

  rooms[roomId].participants[socketId] = {
    id: socketId,
    clientId: clientId || socketId,
    username,
    role: "participant",
  };

  return rooms[roomId].participants[socketId];
}

// Find a participant by clientId across all socket slots in a room.
// Used during reconnect to locate the existing participant record.
function findParticipantByClientId(roomId, clientId) {
  if (!rooms[roomId]) return null;

  return (
    Object.values(rooms[roomId].participants).find(
      (p) => p.clientId === clientId
    ) || null
  );
}

// Reconnect: update the socket.id key for an existing participant.
// Returns the updated participant, or null if not found.
function reconnectParticipant(roomId, oldSocketId, newSocketId) {
  if (!rooms[roomId]) return null;

  const participant = rooms[roomId].participants[oldSocketId];
  if (!participant) return null;

  // Move the record to the new socket.id key.
  delete rooms[roomId].participants[oldSocketId];
  participant.id = newSocketId;
  rooms[roomId].participants[newSocketId] = participant;

  return participant;
}

function removeParticipant(roomId, socketId) {
  if (!rooms[roomId]) return;

  delete rooms[roomId].participants[socketId];

  if (Object.keys(rooms[roomId].participants).length === 0) {
    delete rooms[roomId];
    console.log(`[room] ${roomId} deleted (empty)`);
    return;
  }

  // If the host left, promote the next participant.
  const hasHost = Object.values(rooms[roomId].participants).some(
    (p) => p.role === "host"
  );

  if (!hasHost) {
    const nextId = Object.keys(rooms[roomId].participants)[0];
    rooms[roomId].participants[nextId].role = "host";
    console.log(`[room] ${roomId} promoted ${nextId} to host`);
    return rooms[roomId].participants[nextId];
  }
}

function getParticipant(roomId, socketId) {
  if (!rooms[roomId]) return null;
  return rooms[roomId].participants[socketId] || null;
}

function getRoomParticipants(roomId) {
  if (!rooms[roomId]) return [];
  return Object.values(rooms[roomId].participants);
}

function addMessage(roomId, message) {
  if (!rooms[roomId]) return null;
  rooms[roomId].messages.push(message);
  if (rooms[roomId].messages.length > 50) {
    rooms[roomId].messages.shift();
  }
  return message;
}

function getMessages(roomId) {
  if (!rooms[roomId]) return [];
  return rooms[roomId].messages;
}

module.exports = {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
  findParticipantByClientId,
  reconnectParticipant,
  getParticipant,
  getRoomParticipants,
  addMessage,
  getMessages,
};