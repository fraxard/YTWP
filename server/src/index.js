const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

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

// Socket.IO connections
io.on("connection", (socket) => {
  console.log(`[connect]    ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});