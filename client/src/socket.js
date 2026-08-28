import { io } from "socket.io-client";

// Generate a stable clientId for this browser.
// This persists across page refreshes so the server can identify returning clients.
function getClientId() {
  const KEY = "ytwp-client-id";

  let id = localStorage.getItem(KEY);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }

  return id;
}

const socket = io(
  import.meta.env.VITE_SERVER_URL || undefined,
  {
    // Send clientId as a handshake query so the server has it
    // from the very first connection.
    query: {
      clientId: getClientId(),
    },

    // Reconnect aggressively on transient failures.
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }
);

export default socket;

export { getClientId };