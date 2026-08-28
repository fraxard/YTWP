const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const rooms = require("./rooms");
const { can } = require("./permissions");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  },
});

const PORT = process.env.PORT || 3001;

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function handleLeave(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;

  const participant = rooms.getParticipant(roomId, socket.id);
  if (!participant) return;

  const newHost = rooms.removeParticipant(roomId, socket.id);
  socket.leave(roomId);

  if (rooms.getRoom(roomId)) {
    if (newHost) {
      io.to(roomId).emit("role_updated", { targetId: newHost.id, role: "host" });
    }
    io.to(roomId).emit("user_left", { participantId: socket.id });
  }

  console.log(`[leave] ${socket.id} (${participant.username}) left ${roomId}`);
  socket.roomId = null;
}

function authorize(socket, action) {
  const room = rooms.getRoom(socket.roomId);
  if (!room) return null;

  const participant = rooms.getParticipant(socket.roomId, socket.id);
  if (!participant) return null;

  if (!can(participant.role, action)) {
    socket.emit("permission_denied", { action });
    console.log(`[denied] ${participant.username} (${participant.role}) tried ${action}`);
    return null;
  }

  return participant;
}

// ─── Socket.IO ───────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[connect]    ${socket.id}`);

  socket.on("create_room", ({ username }) => {
    if (!username || typeof username !== "string" || !username.trim()) {
      socket.emit("error", { message: "Username is required." });
      return;
    }
    const room = rooms.createRoom(socket, username.trim());
    socket.join(room.id);
    socket.roomId = room.id;
    console.log(`[create] ${socket.id} (${username}) created room ${room.id}`);
    socket.emit("room_created", {
      roomId: room.id,
      roomState: {
        participants: rooms.getRoomParticipants(room.id),
        videoState: room.videoState,
      },
    });
  });

  socket.on("join_room", ({ roomId, username }) => {
    if (!username || typeof username !== "string" || !username.trim()) {
      socket.emit("error", { message: "Username is required." });
      return;
    }
    const room = rooms.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }
    const participant = rooms.addParticipant(roomId, socket.id, username.trim());
    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`[join] ${socket.id} (${username}) joined room ${roomId}`);
    socket.emit("room_state", {
      roomId,
      participants: rooms.getRoomParticipants(roomId),
      videoState: room.videoState,
    });
    socket.to(roomId).emit("user_joined", { participant });
  });

  socket.on("leave_room", () => handleLeave(socket));

  socket.on("play", () => {
    if (!authorize(socket, "play")) return;
    const room = rooms.getRoom(socket.roomId);
    room.videoState.playing = true;
    room.videoState.lastUpdatedAt = Date.now();
    console.log(`[play] room ${socket.roomId}`);
    socket.to(socket.roomId).emit("play");
  });

  socket.on("pause", () => {
    if (!authorize(socket, "pause")) return;
    const room = rooms.getRoom(socket.roomId);
    room.videoState.playing = false;
    room.videoState.lastUpdatedAt = Date.now();
    console.log(`[pause] room ${socket.roomId}`);
    socket.to(socket.roomId).emit("pause");
  });

  socket.on("seek", ({ time }) => {
    if (!authorize(socket, "seek")) return;
    if (typeof time !== "number" || time < 0) return;
    const room = rooms.getRoom(socket.roomId);
    room.videoState.currentTime = time;
    room.videoState.lastUpdatedAt = Date.now();
    console.log(`[seek] room ${socket.roomId} → ${time.toFixed(2)}s`);
    socket.to(socket.roomId).emit("seek", { time });
  });

  socket.on("change_video", ({ videoId }) => {
    if (!authorize(socket, "change_video")) return;
    if (!videoId || typeof videoId !== "string") {
      socket.emit("error", { message: "Invalid video ID." });
      return;
    }
    const room = rooms.getRoom(socket.roomId);
    room.videoState.videoId = videoId;
    room.videoState.playing = false;
    room.videoState.currentTime = 0;
    room.videoState.lastUpdatedAt = Date.now();
    console.log(`[change_video] room ${socket.roomId} → ${videoId}`);
    io.to(socket.roomId).emit("video_changed", { videoId });
  });

  socket.on("assign_role", ({ targetId, role }) => {
    if (!authorize(socket, "assign_role")) return;

    const ASSIGNABLE_ROLES = ["moderator", "participant"];
    if (!ASSIGNABLE_ROLES.includes(role)) {
      socket.emit("error", { message: "Invalid role." });
      return;
    }

    const room = rooms.getRoom(socket.roomId);
    if (!room) return;

    const target = rooms.getParticipant(socket.roomId, targetId);
    if (!target) {
      socket.emit("error", { message: "Participant not found in this room." });
      return;
    }

    if (target.role === "host") {
      socket.emit("error", { message: "Cannot change the host's role." });
      return;
    }

    if (target.role === role) return;

    target.role = role;
    console.log(`[assign_role] ${socket.id} set ${targetId} → ${role} in room ${socket.roomId}`);
    io.to(socket.roomId).emit("role_updated", { targetId, role });
  });

  socket.on("remove_participant", ({ targetId }) => {
    const roomId = socket.roomId;
    if (!authorize(socket, "remove_participant")) return;

    const room = rooms.getRoom(roomId);
    if (!room) return;

    const target = rooms.getParticipant(roomId, targetId);
    if (!target) {
      socket.emit("error", { message: "Participant not found in this room." });
      return;
    }

    if (target.role === "host") {
      socket.emit("error", { message: "Cannot remove the host." });
      return;
    }

    console.log(`[remove_participant] ${socket.id} removed ${targetId} from room ${roomId}`);

    // Notify the removed participant first, then clean up
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit("participant_removed");
      targetSocket.leave(roomId);
      targetSocket.roomId = null;
    }

    rooms.removeParticipant(roomId, targetId);
    io.to(roomId).emit("user_left", { participantId: targetId });
  });

  socket.on("disconnect", () => {
    handleLeave(socket);
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});