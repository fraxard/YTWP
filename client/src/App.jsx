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

  useEffect(() => {
    // Immediately synchronize with socket's current state on mount
    if (socket.connected) {
      setConnected(true);
    }

    function onConnect() { setConnected(true); }
    function onDisconnect() { setConnected(false); }

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
    <div className="app-shell">
      {/* Product Header */}
      <header className="global-header">
        <div className="brand-section">
          <span className="brand-badge">PARTY</span>
          <span className="brand-title">YTWP : @ayxshhz</span>
        </div>
        <div className="header-status-indicator">
          <span className={`status-dot ${connected ? "connected" : "disconnected"}`}></span>
          <span>{connected ? "Connected" : "Offline"}</span>
        </div>
      </header>

      {/* Main Screen View */}
      <main className="app-main">
        {screen === "home" && (
          <div className="lobby-screen">
            <div className="lobby-box">
              <h2>Watch Together</h2>
              <p className="lobby-subtitle">Synchronized YouTube sessions in a minimal space.</p>
              <CreateRoom onRoomReady={handleRoomReady} />
              <hr className="lobby-divider" />
              <JoinRoom onRoomReady={handleRoomReady} />
            </div>
          </div>
        )}

        {screen === "room" && roomData && (
          <Room
            roomId={roomData.roomId}
            initialParticipants={roomData.roomState.participants}
            initialVideoState={roomData.roomState.videoState}
            onLeave={handleLeave}
          />
        )}
      </main>
    </div>
  );
}