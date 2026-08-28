import { useEffect, useState } from "react";
import socket from "../socket";

export default function Room({ roomId, initialParticipants, username, onLeave }) {
  const [participants, setParticipants] = useState(initialParticipants);

  useEffect(() => {
    function onUserJoined({ participant }) {
      setParticipants((prev) => {
        if (prev.find((p) => p.id === participant.id)) return prev;
        return [...prev, participant];
      });
    }

    function onUserLeft({ participantId }) {
      setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    }

    function onRoleUpdated({ targetId, role }) {
      setParticipants((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, role } : p))
      );
    }

    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("role_updated", onRoleUpdated);

    return () => {
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("role_updated", onRoleUpdated);
    };
  }, []);

  function handleLeave() {
    socket.emit("leave_room");
    onLeave();
  }

  const myParticipant = participants.find((p) => p.id === socket.id);

  return (
    <div>
      <h2>Room: {roomId}</h2>
      <p>
        Your role: <strong>{myParticipant?.role ?? "—"}</strong>
      </p>

      <h3>Participants ({participants.length})</h3>
      <ul>
        {participants.map((p) => (
          <li key={p.id}>
            {p.username} — {p.role}
            {p.id === socket.id ? " (you)" : ""}
          </li>
        ))}
      </ul>

      <button onClick={handleLeave}>Leave Room</button>
    </div>
  );
}