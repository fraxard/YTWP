import { useState } from "react";
import socket from "../socket";

export default function JoinRoom({ onRoomReady }) {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");

  function handleJoin() {
    const name = username.trim();
    const id = roomId.trim().toUpperCase();

    if (!name) { setError("Enter a username."); return; }
    if (!id)   { setError("Enter a room code."); return; }

    socket.once("room_state", ({ roomId, participants, videoState, messages, createdAt }) => {
      onRoomReady({
        roomId,
        roomState: { participants, videoState, messages: messages || [], createdAt },
        username: name,
      });
    });

    socket.once("error", ({ message }) => {
      setError(message);
    });

    socket.emit("join_room", { roomId: id, username: name });
  }

  return (
    <div>
      <h2>Join a Room</h2>
      <input
        type="text"
        placeholder="Your username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="text"
        placeholder="Room code"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        style={{ textTransform: "uppercase" }}
      />
      <button onClick={handleJoin}>Join Room</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}