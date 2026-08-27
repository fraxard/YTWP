import { io } from "socket.io-client";

// In dev, Vite proxies /socket.io to the backend.
// In production, frontend and backend share the same origin.
const socket = io();

export default socket;