import { useEffect, useState } from "react";
import socket from "./socket";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
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

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>YouTube Watch Party</h1>
      <p>
        Socket status:{" "}
        <strong style={{ color: connected ? "green" : "red" }}>
          {connected ? "Connected" : "Disconnected"}
        </strong>
      </p>
      <p style={{ color: "#888", fontSize: "0.9rem" }}>
        Socket ID: {socket.id || "—"}
      </p>
    </div>
  );
}