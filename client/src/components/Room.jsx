import { useEffect, useRef, useState } from "react";
import socket from "../socket";
import VideoPlayer, { extractVideoId } from "./VideoPlayer";

const DEFAULT_VIDEO_ID = "dQw4w9WgXcQ";

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

export default function Room({ roomId, initialParticipants, initialVideoState, onLeave }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [videoId, setVideoId] = useState(
    initialVideoState?.videoId || DEFAULT_VIDEO_ID
  );
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");

  const playerRef = useRef(null);
  const suppressRef = useRef(false);

  const myParticipant = participants.find((p) => p.id === socket.id);
  const canControl = myParticipant?.role === "host";

  function safeCall(fn) {
    if (playerRef.current && typeof playerRef.current.playVideo === "function") {
      fn();
    }
  }

  // ── Socket events ─────────────────────────────────────────────────────────

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
    function onVideoChanged({ videoId }) {
      setVideoId(videoId);
    }
    function onPlay() {
      // suppressRef prevents the resulting onStateChange from emitting back
      suppressRef.current = true;
      safeCall(() => playerRef.current.playVideo());
    }
    function onPause() {
      suppressRef.current = true;
      safeCall(() => playerRef.current.pauseVideo());
    }
    function onSeek({ time }) {
      // seekTo does not trigger onStateChange, so no suppress needed —
      // but we set it anyway in case the player fires a buffering event
      suppressRef.current = true;
      safeCall(() => playerRef.current.seekTo(time, true));
    }

    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("role_updated", onRoleUpdated);
    socket.on("video_changed", onVideoChanged);
    socket.on("play", onPlay);
    socket.on("pause", onPause);
    socket.on("seek", onSeek);

    return () => {
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("role_updated", onRoleUpdated);
      socket.off("video_changed", onVideoChanged);
      socket.off("play", onPlay);
      socket.off("pause", onPause);
      socket.off("seek", onSeek);
    };
  }, []);

  // ── YouTube user actions → server ─────────────────────────────────────────

  useEffect(() => {
    function onYtStateChange(e) {
      if (!canControl) return;

      const YT_PLAYING = 1;
      const YT_PAUSED  = 2;

      if (e.detail.state === YT_PLAYING) {
        // Emit current time with play so server state stays accurate
        const time = playerRef.current?.getCurrentTime?.() ?? 0;
        socket.emit("seek", { time });
        socket.emit("play");
      } else if (e.detail.state === YT_PAUSED) {
        const time = playerRef.current?.getCurrentTime?.() ?? 0;
        socket.emit("seek", { time });
        socket.emit("pause");
      }
    }

    window.addEventListener("yt-state-change", onYtStateChange);
    return () => window.removeEventListener("yt-state-change", onYtStateChange);
  }, [canControl]);

  // ── User actions ──────────────────────────────────────────────────────────

  function handleChangeVideo() {
    setUrlError("");
    const id = extractVideoId(urlInput);
    if (!id) {
      setUrlError("Invalid YouTube URL. Paste a full youtube.com or youtu.be link.");
      return;
    }
    socket.emit("change_video", { videoId: id });
    setUrlInput("");
  }

  function handleLeave() {
    socket.emit("leave_room");
    onLeave();
  }

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: "800px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
        <h2 style={{ margin: 0 }}>Room</h2>
        <code style={{
          background: "#2f3031",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "1.1rem",
          letterSpacing: "2px",
          fontWeight: "700",
        }}>
          {roomId}
        </code>
      </div>
      <p style={{ color: "#666", marginTop: "4px", marginBottom: "20px", fontSize: "0.9rem" }}>
        Your role: <strong>{myParticipant?.role ?? "—"}</strong>
      </p>

      <VideoPlayer
        videoId={videoId}
        controls={canControl}
        playerRef={playerRef}
        suppressRef={suppressRef}
      />

      {canControl && (
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Paste a YouTube URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChangeVideo()}
            style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
          <button
            onClick={handleChangeVideo}
            style={{
              padding: "8px 16px",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Change Video
          </button>
        </div>
      )}
      {urlError && (
        <p style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "6px" }}>{urlError}</p>
      )}

      <h3 style={{ marginTop: "24px", marginBottom: "8px" }}>
        Participants <span style={{ color: "#888", fontWeight: 400 }}>({participants.length})</span>
      </h3>
      <ul style={{ padding: 0, margin: "0 0 24px 0" }}>
        {participants.map((p) => (
          <ParticipantRow key={p.id} participant={p} isMe={p.id === socket.id} />
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
        }}
      >
        Leave Room
      </button>
    </div>
  );
}