const rooms = {};

function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  // Regenerate on collision (astronomically unlikely but correct)
  return rooms[id] ? generateRoomId() : id;
}

function createRoom(hostSocket, username) {
  const roomId = generateRoomId();
  rooms[roomId] = {
    id: roomId,
    participants: {
      [hostSocket.id]: {
        id: hostSocket.id,
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
  };
  return rooms[roomId];
}

function getRoom(roomId) {
  return rooms[roomId] || null;
}

function addParticipant(roomId, socketId, username) {
  if (!rooms[roomId]) return null;
  rooms[roomId].participants[socketId] = {
    id: socketId,
    username,
    role: "participant",
  };
  return rooms[roomId].participants[socketId];
}

function removeParticipant(roomId, socketId) {
  if (!rooms[roomId]) return;
  delete rooms[roomId].participants[socketId];

  // Delete room if empty
  if (Object.keys(rooms[roomId].participants).length === 0) {
    delete rooms[roomId];
    console.log(`[room] ${roomId} deleted (empty)`);
    return;
  }

  // If the host left, promote the next participant
  const hasHost = Object.values(rooms[roomId].participants).some(
    (p) => p.role === "host"
  );
  if (!hasHost) {
    const nextId = Object.keys(rooms[roomId].participants)[0];
    rooms[roomId].participants[nextId].role = "host";
    console.log(`[room] ${roomId} promoted ${nextId} to host`);
    return rooms[roomId].participants[nextId]; // return new host so caller can notify
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

module.exports = {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
  getParticipant,
  getRoomParticipants,
};