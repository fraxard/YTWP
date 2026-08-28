import { useEffect, useState } from "react";
import socket from "./socket";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import Room from "./components/Room";
import "./App.css";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [screen, setScreen] = useState("home");
  const [roomData, setRoomData] = useState(null);

  // Load saved theme, default to light
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("ytwp-theme") || "light";
  });

  useEffect(() => {
    localStorage.setItem("ytwp-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === "light" ? "dark" : "light"
    );
  }

  useEffect(() => {
    if (socket.connected) {
      setConnected(true);
    }

    function onConnect() {
      setConnected(true);
    }

    function onDisconnect() {
      setConnected(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    function onDisconnect() {
      if (screen === "room") {
        setScreen("home");
        setRoomData(null);
      }
    }

    socket.on("disconnect", onDisconnect);

    return () => socket.off("disconnect", onDisconnect);
  }, [screen]);

  function handleRoomReady(data) {
    setRoomData(data);
    setScreen("room");
  }

  function handleLeave() {
    setRoomData(null);
    setScreen("home");
  }

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Product Header */}
      <header className="global-header">
        <div className="brand-section">
          <span className="brand-badge">
            PARTY
          </span>

          <span className="brand-title">
            YTWP : @ayxshhz
          </span>
        </div>

        <div className="header-actions">
          {/* Theme Toggle */}
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${
              theme === "light" ? "dark" : "light"
            } theme`}
            title={`Switch to ${
              theme === "light" ? "dark" : "light"
            } theme`}
          >
            {theme === "light" ? (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            )}
          </button>

          {/* Connection Status */}
          <div className="header-status-indicator">
            <span
              className={`status-dot ${
                connected
                  ? "connected"
                  : "disconnected"
              }`}
            ></span>

            <span>
              {connected
                ? "Connected"
                : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Screen View */}
      <main className="app-main">
        {screen === "home" && (
          <div className="lobby-screen">
            <div className="lobby-box">
              <h2>
                Watch Together
              </h2>

              <p className="lobby-subtitle">
                Synchronized YouTube
                sessions in a minimal
                space.
              </p>

              <CreateRoom
                onRoomReady={
                  handleRoomReady
                }
              />

              <hr className="lobby-divider" />

              <JoinRoom
                onRoomReady={
                  handleRoomReady
                }
              />
            </div>
          </div>
        )}

        {screen === "room" &&
          roomData && (
            <Room
              roomId={
                roomData.roomId
              }
              initialParticipants={
                roomData.roomState
                  .participants
              }
              initialVideoState={
                roomData.roomState
                  .videoState
              }
              initialMessages={
                roomData.roomState
                  .messages || []
              }
              onLeave={
                handleLeave
              }
            />
          )}
      </main>
    </div>
  );
}