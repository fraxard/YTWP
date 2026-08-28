const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const rooms = require("./rooms");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  },
});

const PORT = process.env.PORT || 3001;

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Serve built React app in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

function handleLeave(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;

  const participant = rooms.getParticipant(roomId, socket.id);
  if (!participant) return;

  const newHost = rooms.removeParticipant(roomId, socket.id);
  socket.leave(roomId);

  if (rooms.getRoom(roomId)) {
    if (newHost) {
      io.to(roomId).emit("role_updated", {
        targetId: newHost.id,
        role: "host",
      });
    }
    io.to(roomId).emit("user_left", { participantId: socket.id });
  }

  console.log(`[leave] ${socket.id} (${participant.username}) left ${roomId}`);
  socket.roomId = null;
}

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

  socket.on("leave_room", () => {
    handleLeave(socket);
  });

  socket.on("disconnect", () => {
    handleLeave(socket);
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});