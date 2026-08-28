const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
// const path = require("path");

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

// ── Reconnect grace period ────────────────────────────────────────────────
// When a socket disconnects we don't immediately remove the participant.
// Instead we give them RECONNECT_GRACE_MS to come back (via reconnect_room).
// This covers the case of a browser refresh, which disconnects and then
// immediately reconnects with a new socket.id.
const RECONNECT_GRACE_MS = 8000;

// Map of clientId → { roomId, socketId, timer }
// We track pending cleanup timers so we can cancel them on reconnect.
const pendingCleanup = new Map();

app.get("/api/health", (req, res) => res.json({ ok: true }));

// if (process.env.NODE_ENV === "production") {
//   const clientDist = path.join(__dirname, "../../client/dist");
//   app.use(express.static(clientDist));
//   app.get("*", (req, res) => {
//     res.sendFile(path.join(clientDist, "index.html"));
//   });
// }

// ── Helpers ───────────────────────────────────────────────────────────────

// Actually remove a participant and broadcast the departure.
// Called either immediately (explicit leave) or after the grace period.
function evictParticipant(roomId, socketId, participantSnapshot) {
  const newHost = rooms.removeParticipant(roomId, socketId);

  if (rooms.getRoom(roomId)) {
    if (newHost) {
      io.to(roomId).emit("role_updated", { targetId: newHost.id, role: "host" });
    }
    io.to(roomId).emit("user_left", { participantId: socketId });
  }

  console.log(
    `[evict] ${socketId} (${participantSnapshot?.username}) removed from ${roomId}`
  );
}

// Schedule a participant's removal after the grace period.
// If they reconnect first, the timer is cancelled.
function scheduleCleanup(clientId, roomId, socketId, participant) {
  // Cancel any existing timer for this clientId (shouldn't normally happen,
  // but guards against rapid disconnect/reconnect cycles).
  if (pendingCleanup.has(clientId)) {
    clearTimeout(pendingCleanup.get(clientId).timer);
  }

  const timer = setTimeout(() => {
    pendingCleanup.delete(clientId);
    // Only evict if the participant is still in the room with this socket.id.
    // (If they reconnected, their socket.id was already updated.)
    const current = rooms.getParticipant(roomId, socketId);
    if (current) {
      evictParticipant(roomId, socketId, participant);
    }
  }, RECONNECT_GRACE_MS);

  pendingCleanup.set(clientId, { roomId, socketId, timer });
}

function handleLeave(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;

  const participant = rooms.getParticipant(roomId, socket.id);
  if (!participant) return;

  const clientId = participant.clientId;

  // Cancel any pending grace-period cleanup for this client — they are
  // explicitly leaving, so we evict immediately.
  if (pendingCleanup.has(clientId)) {
    clearTimeout(pendingCleanup.get(clientId).timer);
    pendingCleanup.delete(clientId);
  }

  evictParticipant(roomId, socket.id, participant);

  socket.leave(roomId);
  socket.roomId = null;

  console.log(`[leave] ${socket.id} (${participant.username}) left ${roomId}`);
}

function authorize(socket, action) {
  const room = rooms.getRoom(socket.roomId);
  if (!room) return null;

  const participant = rooms.getParticipant(socket.roomId, socket.id);
  if (!participant) return null;

  if (!can(participant.role, action)) {
    socket.emit("permission_denied", { action });
    console.log(
      `[denied] ${participant.username} (${participant.role}) tried ${action}`
    );
    return null;
  }

  return participant;
}

// ── Socket.IO ──────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  // clientId is sent as a query param from the client.
  const clientId = socket.handshake.query.clientId || socket.id;
  console.log(`[connect] ${socket.id} (clientId: ${clientId})`);

  // ── Create Room ──────────────────────────────────────────────────────────

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
        messages: rooms.getMessages(room.id),
        createdAt: room.createdAt,
      },
    });
  });

  // ── Join Room ────────────────────────────────────────────────────────────

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

    const participant = rooms.addParticipant(
      roomId,
      socket.id,
      username.trim(),
      clientId
    );

    socket.join(roomId);
    socket.roomId = roomId;

    console.log(`[join] ${socket.id} (${username}) joined room ${roomId}`);

    socket.emit("room_state", {
      roomId,
      participants: rooms.getRoomParticipants(roomId),
      videoState: room.videoState,
      messages: rooms.getMessages(roomId),
      createdAt: room.createdAt,
    });

    socket.to(roomId).emit("user_joined", { participant });
  });

  // ── Reconnect Room ───────────────────────────────────────────────────────
  // Emitted by the client on page load when sessionStorage has a saved session.
  // The client sends its stable clientId (via the socket query), roomId, and
  // username. We look for an existing participant with that clientId.

  socket.on("reconnect_room", ({ roomId, username }) => {
    const room = rooms.getRoom(roomId);
    if (!room) {
      socket.emit("reconnect_failed", { message: "Room no longer exists." });
      return;
    }

    // Check if this clientId has a pending cleanup (i.e. they disconnected
    // recently and we're still within the grace period).
    const pending = pendingCleanup.get(clientId);

    // Also check for an existing participant record by clientId in case
    // the socket somehow stayed connected (edge case).
    const existing = rooms.findParticipantByClientId(roomId, clientId);

    if (existing) {
      // Cancel the scheduled eviction — they came back in time.
      if (pending) {
        clearTimeout(pending.timer);
        pendingCleanup.delete(clientId);
      }

      const oldSocketId = existing.id;

      // Update the participant record to use the new socket.id.
      rooms.reconnectParticipant(roomId, oldSocketId, socket.id);

      socket.join(roomId);
      socket.roomId = roomId;

      console.log(
        `[reconnect] ${clientId} (${existing.username}) back in ${roomId} ` +
        `as ${existing.role} [${oldSocketId} → ${socket.id}]`
      );

      // Send the rejoining client their room state (same event as join_room).
      socket.emit("room_state", {
        roomId,
        participants: rooms.getRoomParticipants(roomId),
        videoState: room.videoState,
        messages: rooms.getMessages(roomId),
        createdAt: room.createdAt,
      });

      // Tell others the socket.id changed (so their participant list stays
      // consistent if they filter by id). We reuse user_left/user_joined
      // so no new client-side event handling is needed.
      // Only broadcast if the socket.id actually changed.
      if (oldSocketId !== socket.id) {
        socket.to(roomId).emit("user_left", { participantId: oldSocketId });
        socket.to(roomId).emit("user_joined", {
          participant: rooms.getParticipant(roomId, socket.id),
        });
      }
    } else {
      // No existing record → treat as a fresh join with participant role.
      const participant = rooms.addParticipant(
        roomId,
        socket.id,
        username.trim(),
        clientId
      );

      socket.join(roomId);
      socket.roomId = roomId;

      console.log(
        `[reconnect-as-new] ${socket.id} (${username}) joined ${roomId}`
      );

      socket.emit("room_state", {
        roomId,
        participants: rooms.getRoomParticipants(roomId),
        videoState: room.videoState,
        messages: rooms.getMessages(roomId),
        createdAt: room.createdAt,
      });

      socket.to(roomId).emit("user_joined", { participant });
    }
  });

  // ── Leave Room ───────────────────────────────────────────────────────────

  socket.on("leave_room", () => {
    handleLeave(socket);
  });

  // ── Playback ─────────────────────────────────────────────────────────────

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

  // ── Roles ────────────────────────────────────────────────────────────────

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
    console.log(`[assign_role] ${socket.id} set ${targetId} → ${role}`);
    io.to(socket.roomId).emit("role_updated", { targetId, role });
  });

  // ── Remove Participant ───────────────────────────────────────────────────

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

    // Cancel any pending cleanup for this client (they're being force-removed).
    if (pendingCleanup.has(target.clientId)) {
      clearTimeout(pendingCleanup.get(target.clientId).timer);
      pendingCleanup.delete(target.clientId);
    }

    console.log(`[remove_participant] ${socket.id} removed ${targetId}`);

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit("participant_removed");
      targetSocket.leave(roomId);
      targetSocket.roomId = null;
    }

    rooms.removeParticipant(roomId, targetId);
    io.to(roomId).emit("user_left", { participantId: targetId });
  });

  // ── Chat ─────────────────────────────────────────────────────────────────

  socket.on("chat_message", ({ message }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const participant = rooms.getParticipant(roomId, socket.id);
    if (!participant) return;

    if (typeof message !== "string") return;
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    if (trimmedMessage.length > 500) {
      socket.emit("error", { message: "Message is too long. Maximum 500 characters." });
      return;
    }

    const chatMessage = {
      id: `${socket.id}-${Date.now()}`,
      userId: socket.id,
      username: participant.username,
      role: participant.role,
      message: trimmedMessage,
      timestamp: Date.now(),
    };

    rooms.addMessage(roomId, chatMessage);
    io.to(roomId).emit("chat_message", chatMessage);
  });

  // ── Emoji Reactions ──────────────────────────────────────────────────────

  socket.on("emoji_reaction", ({ emoji }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const participant = rooms.getParticipant(roomId, socket.id);
    if (!participant) return;

    const ALLOWED_EMOJIS = ["❤️", "😂", "😮", "🔥", "👏", "💀"];
    if (!ALLOWED_EMOJIS.includes(emoji)) return;

    io.to(roomId).emit("emoji_reaction", {
      id: `${socket.id}-${Date.now()}`,
      userId: socket.id,
      username: participant.username,
      emoji,
      timestamp: Date.now(),
    });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  // On disconnect we do NOT immediately remove the participant.
  // We schedule their removal after RECONNECT_GRACE_MS.
  // If they reconnect (page refresh) within that window, we cancel the timer.
  // If they don't (tab closed, navigated away, network lost), they get evicted.

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    console.log(`[disconnect] ${socket.id} (clientId: ${clientId})`);

    if (!roomId) return;

    const participant = rooms.getParticipant(roomId, socket.id);
    if (!participant) return;

    console.log(
      `[grace] ${participant.username} (${participant.role}) has ${RECONNECT_GRACE_MS}ms to reconnect`
    );

    scheduleCleanup(clientId, roomId, socket.id, participant);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});