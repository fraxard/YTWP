import { useState } from "react";
import socket from "../socket";

export default function CreateRoom({ onRoomReady }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  function handleCreate() {
    const name = username.trim();
    if (!name) {
      setError("Enter a username.");
      return;
    }

    socket.once("room_created", ({ roomId, roomState }) => {
      onRoomReady({ roomId, roomState, username: name });
    });

    socket.once("error", ({ message }) => {
      setError(message);
    });

    socket.emit("create_room", { username: name });
  }

  return (
    <div>
      <h2>Create a Room</h2>
      <input
        type="text"
        placeholder="Your username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
      />
      <button onClick={handleCreate}>Create Room</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}