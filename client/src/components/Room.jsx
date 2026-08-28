import { useEffect, useState } from "react";
import socket from "../socket";

const ROLE_BADGE = {
  host:        { label: "Host",        background: "#1d4ed8", color: "#fff" },
  moderator:   { label: "Moderator",   background: "#7e22ce", color: "#fff" },
  participant: { label: "Participant",  background: "#e5e7eb", color: "#374151" },
};

function RoleBadge({ role }) {
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.participant;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: "600",
      background: badge.background,
      color: badge.color,
      marginLeft: "8px",
      verticalAlign: "middle",
    }}>
      {badge.label}
    </span>
  );
}

function ParticipantRow({ participant, isMe }) {
  return (
    <li style={{
      display: "flex",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid #f0f0f0",
      listStyle: "none",
    }}>
      <span style={{ fontWeight: isMe ? "700" : "400" }}>
        {participant.username}
        {isMe && <span style={{ color: "#888", fontWeight: 400, marginLeft: 4 }}>(you)</span>}
      </span>
      <RoleBadge role={participant.role} />
    </li>
  );
}

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
  const host = participants.find((p) => p.role === "host");

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: "500px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
        <h2 style={{ margin: 0 }}>Room</h2>
        <code style={{
          background: "#2c2c2e",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "1.1rem",
          letterSpacing: "2px",
          fontWeight: "700",
        }}>
          {roomId}
        </code>
      </div>

      <p style={{ color: "#666", marginTop: "4px", marginBottom: "24px", fontSize: "0.9rem" }}>
        Your role: <strong>{myParticipant?.role ?? "—"}</strong>
      </p>

      <h3 style={{ marginBottom: "8px" }}>
        Participants <span style={{ color: "#888", fontWeight: 400 }}>({participants.length})</span>
      </h3>

      <ul style={{ padding: 0, margin: "0 0 24px 0" }}>
        {participants.map((p) => (
          <ParticipantRow
            key={p.id}
            participant={p}
            isMe={p.id === socket.id}
          />
        ))}
      </ul>

      <button
        onClick={handleLeave}
        style={{
          padding: "8px 16px",
          background: "#ef4444",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "0.95rem",
        }}
      >
        Leave Room
      </button>
    </div>
  );
}