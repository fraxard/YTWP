import { useEffect, useState } from "react";
import socket from "./socket";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import Room from "./components/Room";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [screen, setScreen] = useState("home");
  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
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
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "600px" }}>
      <h1>YouTube Watch Party</h1>
      <p style={{ color: connected ? "green" : "red", marginTop: 0 }}>
        {connected ? "● Connected" : "○ Disconnected"}
      </p>

      {screen === "home" && (
        <>
          <CreateRoom onRoomReady={handleRoomReady} />
          <hr />
          <JoinRoom onRoomReady={handleRoomReady} />
        </>
      )}

      {screen === "room" && roomData && (
        <Room
          roomId={roomData.roomId}
          initialParticipants={roomData.roomState.participants}
          initialVideoState={roomData.roomState.videoState}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
}