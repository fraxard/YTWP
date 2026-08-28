import { useEffect, useRef, useState } from "react";
import socket from "./socket";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import Room from "./components/Room";
import "./App.css";

// ── Session helpers ────────────────────────────────────────────────────────
// We use sessionStorage so the saved session is tab-scoped and is automatically
// cleared when the user closes the tab entirely.

const SESSION_KEY = "ytwp-session";

function saveSession(roomId, username) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, username }));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [screen, setScreen] = useState("home");
  const [roomData, setRoomData] = useState(null);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("ytwp-theme") || "light";
  });

  // We track whether we are currently attempting an auto-reconnect so we
  // can show a sensible loading state and avoid double-attempts.
  const [reconnecting, setReconnecting] = useState(false);

  // Keep a ref to the current screen so socket event callbacks always
  // see the latest value without needing to be re-registered.
  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    localStorage.setItem("ytwp-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  // ── Auto-reconnect on page load ──────────────────────────────────────────
  // If the user refreshes while inside a room, sessionStorage still has their
  // session. We wait for the socket to connect, then emit reconnect_room.
  // The server will restore their role and send back room_state exactly like
  // a normal join would.

  useEffect(() => {
    const saved = loadSession();
    if (!saved) return; // No saved session → normal lobby flow.

    setReconnecting(true);

    function attemptReconnect() {
      socket.emit("reconnect_room", {
        roomId: saved.roomId,
        username: saved.username,
      });
    }

    function onRoomState({ roomId, participants, videoState, messages }) {
      // Server confirmed the reconnect. Restore the room view.
      setRoomData({
        roomId,
        roomState: { participants, videoState, messages: messages || [] },
        username: saved.username,
      });
      setScreen("room");
      setReconnecting(false);
    }

    function onReconnectFailed({ message }) {
      // Server said the room no longer exists (e.g. everyone left while we
      // were refreshing). Go to the lobby and clear the stale session.
      console.warn("[reconnect] failed:", message);
      clearSession();
      setReconnecting(false);
    }

    if (socket.connected) {
      attemptReconnect();
    } else {
      socket.once("connect", attemptReconnect);
    }

    socket.once("room_state", onRoomState);
    socket.once("reconnect_failed", onReconnectFailed);

    return () => {
      socket.off("connect", attemptReconnect);
      socket.off("room_state", onRoomState);
      socket.off("reconnect_failed", onReconnectFailed);
    };
  }, []); // Run once on mount only.

  // ── Socket connect / disconnect ──────────────────────────────────────────

  useEffect(() => {
    if (socket.connected) setConnected(true);

    function onConnect() { setConnected(true); }

    function onDisconnect() {
      setConnected(false);
      // IMPORTANT: We do NOT navigate to the lobby on a plain disconnect.
      // A page refresh causes a transient disconnect followed almost
      // immediately by reconnect_room from the new page load.
      // Only an explicit "Leave Session" click should send the user home.
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // ── Room ready (new create/join) ─────────────────────────────────────────

  function handleRoomReady(data) {
    saveSession(data.roomId, data.username);
    setRoomData(data);
    setScreen("room");
  }

  // ── Explicit leave ───────────────────────────────────────────────────────

  function handleLeave() {
    clearSession(); // User intentionally left → clear so refresh goes to lobby.
    setRoomData(null);
    setScreen("home");
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="global-header">
        <div className="brand-section">
          <span className="brand-badge">PARTY</span>
          <span className="brand-title">YTWP : @ayxshhz</span>
        </div>

        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" /><path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" /><path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
              </svg>
            )}
          </button>

          <div className="header-status-indicator">
            <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
            <span>{connected ? "Connected" : "Offline"}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* Reconnecting overlay */}
        {reconnecting && (
          <div className="lobby-screen">
            <div className="lobby-box">
              <h2>Rejoining room…</h2>
              <p className="lobby-subtitle">Restoring your session, please wait.</p>
            </div>
          </div>
        )}

        {!reconnecting && screen === "home" && (
          <div className="lobby-screen">
            <div className="lobby-box">
              <h2>Watch Together</h2>
              <p className="lobby-subtitle">
                Synchronized YouTube sessions in a minimal space.
              </p>
              <CreateRoom onRoomReady={handleRoomReady} />
              <hr className="lobby-divider" />
              <JoinRoom onRoomReady={handleRoomReady} />
            </div>
          </div>
        )}

        {!reconnecting && screen === "room" && roomData && (
          <Room
            roomId={roomData.roomId}
            initialParticipants={roomData.roomState.participants}
            initialVideoState={roomData.roomState.videoState}
            initialMessages={roomData.roomState.messages || []}
            onLeave={handleLeave}
          />
        )}
      </main>
    </div>
  );
}