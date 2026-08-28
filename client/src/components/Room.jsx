import { useEffect, useRef, useState } from "react";
import socket from "../socket";
import VideoPlayer, { extractVideoId } from "./VideoPlayer";

const DEFAULT_VIDEO_ID = "dQw4w9WgXcQ";

const ROLE_BADGE = {
  host: { label: "Host", background: "#212e21", color: "#f7f8f5" },
  moderator: { label: "Moderator", background: "#52634e", color: "#f7f8f5" },
  participant: { label: "Member", background: "#e2e6dc", color: "#586156" },
};

function RoleBadge({ role }) {
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.participant;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 6px",
      borderRadius: "4px",
      fontSize: "0.675rem",
      fontWeight: "700",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      background: badge.background,
      color: badge.color,
      marginLeft: "auto",
    }}>
      {badge.label}
    </span>
  );
}

function ParticipantRow({ participant, isMe, isHost, onPromote, onDemote }) {
  const canModify = isHost && !isMe && participant.role !== "host";
  const initials = (participant.username || "U").slice(0, 2).toUpperCase();

  return (
    <li className={`participant-item ${isMe ? "is-self" : ""}`}>
      <div className="avatar-initials">{initials}</div>
      <div className="participant-details">
        <span className="participant-name">
          {participant.username}
          {isMe && <span className="self-tag-text">(you)</span>}
        </span>
      </div>
      <RoleBadge role={participant.role} />

      {canModify && participant.role === "participant" && (
        <button
          onClick={() => onPromote(participant.id)}
          title="Promote to Moderator"
          className="btn-role-action"
          style={{ background: "#52634e", color: "#fff", borderColor: "#52634e" }}
        >
          Make Mod
        </button>
      )}

      {canModify && participant.role === "moderator" && (
        <button
          onClick={() => onDemote(participant.id)}
          title="Remove Moderator"
          className="btn-role-action"
          style={{ background: "#e2e6dc", color: "#586156" }}
        >
          Remove Mod
        </button>
      )}
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
  const myRole = myParticipant?.role ?? "participant";
  const canControl = myRole === "host" || myRole === "moderator";
  const isHost = myRole === "host";

  const canControlRef = useRef(canControl);
  useEffect(() => { canControlRef.current = canControl; }, [canControl]);

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
    function onVideoChanged({ videoId: newId }) {
      setVideoId(newId);
    }
    function onPlay() {
      suppressRef.current = { type: "play" };
      safeCall(() => playerRef.current.playVideo());
    }

    function onPause() {
      suppressRef.current = { type: "pause" };
      safeCall(() => playerRef.current.pauseVideo());
    }

    function onSeek({ time }) {
      suppressRef.current = { type: "seek", time };
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

  // ── YouTube state change listener ─────────────────────────────────────────

  useEffect(() => {
    function onYtStateChange(e) {
      if (!canControlRef.current) return;

      const YT_PLAYING = 1;
      const YT_PAUSED = 2;

      if (e.detail.state === YT_PLAYING) {
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
  }, []);

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

  function handlePromote(targetId) {
    socket.emit("assign_role", { targetId, role: "moderator" });
  }

  function handleDemote(targetId) {
    socket.emit("assign_role", { targetId, role: "participant" });
  }

  function handleLeave() {
    socket.emit("leave_room");
    onLeave();
  }

  return (
    <div className="party-grid-container">
      {/* Left Column: Participants */}
      <aside className="column-left-participants">
        <div className="panel-header-bar">
          <span className="panel-header-title">Participants</span>
          <span className="panel-count-tag">[{participants.length}]</span>
        </div>

        <ul className="participants-list-wrap">
          {participants.map((p) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              isMe={p.id === socket.id}
              isHost={isHost}
              onPromote={handlePromote}
              onDemote={handleDemote}
            />
          ))}
        </ul>

        <div className="room-left-footer">
          <div className="room-code-display">
            <span className="room-code-label">Room ID</span>
            <span className="room-code-val">{roomId}</span>
          </div>
          <button className="btn-leave-party" onClick={handleLeave}>
            Leave Session
          </button>
        </div>
      </aside>

      {/* Middle Column: Main Video Stage */}
      <section className="column-middle-video">
        <div className="video-frame-container">
          <VideoPlayer
            videoId={videoId}
            controls={canControl}
            playerRef={playerRef}
            suppressRef={suppressRef}
          />
        </div>

        {canControl ? (
          <div className="stage-controls-card">
            <div className="stage-input-group">
              <input
                type="text"
                placeholder="Paste YouTube link to change video..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChangeVideo()}
                className="stage-url-input"
              />
              <button onClick={handleChangeVideo} className="stage-btn-load">
                Change Video
              </button>
            </div>
            {urlError && <p className="url-error-msg">{urlError}</p>}
          </div>
        ) : (
          <p className="role-banner-note">
            Synced with room host & moderators.
          </p>
        )}
      </section>

      {/* Right Column: Chat Panel */}
      <aside className="column-right-chat">
        <div className="panel-header-bar">
          <span className="panel-header-title">Session Feed</span>
          <span className="chat-live-badge">[ONLINE]</span>
        </div>

        <div className="chat-flow-container">
          <div className="chat-placeholder-box">
            <p>Session Log</p>
            <span>Live chat and reactions will appear here in the next release.</span>
          </div>
        </div>

        <div className="chat-input-bar-locked">
          <input
            type="text"
            placeholder="Input disabled..."
            disabled
            className="chat-input-disabled"
          />
        </div>
      </aside>
    </div>
  );
}