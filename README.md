# YouTube Watch Party

A real-time synchronized YouTube watching application built with React, Node.js, Express, and Socket.IO. Multiple users can join the same room, watch YouTube videos together with frame-accurate playback sync, chat in real time, react with emojis, and manage room roles — all without any accounts or databases.

---

## Live Demo

**Live URL:** https://ytwp-client.onrender.com/

**Backend API / Socket.IO:** https://ytwp.onrender.com/

The application is deployed as two separate Render services: a static React/Vite frontend and a Node.js/Express/Socket.IO backend. The frontend connects to the backend through `VITE_SERVER_URL`, while the backend restricts access to the configured `CLIENT_ORIGIN`.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Role-Based Access Control](#role-based-access-control)
- [Permission Enforcement](#permission-enforcement)
- [Video Synchronization](#video-synchronization)
- [Chat](#chat)
- [Emoji Reactions](#emoji-reactions)
- [Browser Refresh Recovery](#browser-refresh-recovery)
- [Room Stopwatch](#room-stopwatch)
- [Preventing Playback Event Loops](#preventing-playback-event-loops)
- [Host Transfer](#host-transfer)
- [Room State](#room-state)
- [WebSocket Event Architecture](#websocket-event-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Production Architecture](#production-architecture)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Technology Stack](#technology-stack)
- [Security Considerations](#security-considerations)
- [Design Decisions](#design-decisions)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Project Structure](#project-structure)
- [Status](#status)
- [License](#license)

---

## Overview

YouTube Watch Party is a room-based synchronized video watching application.

A user creates a room and automatically becomes the **Host**. Other users join using a 6-character room code and are assigned the **Participant** role by default.

**Host** can:
- Control playback (play, pause, seek)
- Change the YouTube video
- Promote Participants to Moderators
- Demote Moderators back to Participants
- Remove Participants and Moderators
- Automatically transfer Host role on disconnect

**Moderators** can control playback but have no room management permissions.

**Participants** can watch the synchronized video, send chat messages, and react with emojis.

All communication happens over Socket.IO. Room state lives in server memory — no database required.

---

## Features

### Room Management

#### Create Room

A user enters a username and creates a room. The server:

1. Generates a unique 6-character room ID
2. Creates the room in memory with a `createdAt` timestamp
3. Assigns the creator as Host
4. Joins the socket to the Socket.IO room
5. Returns the full room state to the creator

#### Join Room

Users paste a room code to join. The server validates the room exists, adds the user as a Participant, and returns the current room state including participant list, video state, and recent chat messages.

---

## Role-Based Access Control

| Role | Playback | Change Video | Manage Roles | Remove Users |
|------|----------|--------------|--------------|--------------|
| Host | ✓ | ✓ | ✓ | ✓ |
| Moderator | ✓ | ✓ | ✗ | ✗ |
| Participant | ✗ | ✗ | ✗ | ✗ |

### Host

Automatically assigned at room creation. Host permissions:

- Play / Pause / Seek
- Change video
- Promote Participant → Moderator
- Demote Moderator → Participant
- Remove Participant or Moderator
- Host role transfers automatically on disconnect (after grace period)

### Moderator

Assigned by the Host. Moderators can control playback and change the video but cannot modify other participants' roles or remove users.

### Participant

The default role. Participants can watch the synced video, read and send chat messages, and send emoji reactions. They cannot control playback.

---

## Permission Enforcement

All permission checks happen on the **server**. The frontend hides controls for clarity, but the server is the actual authority.

Every restricted Socket.IO event goes through:

```
Client sends event
       ↓
Server identifies socket
       ↓
Find room → Find participant → Check role
       ↓
Permission granted → Process → Broadcast
Permission denied  → Emit permission_denied
```

A Participant manually emitting `change_video` via the browser console is rejected server-side with a `permission_denied` event. The frontend never enforces security.

---

## Video Synchronization

The application uses the YouTube IFrame Player API. Room video state stored on the server:

```json
{
  "videoId": "dQw4w9WgXcQ",
  "playing": false,
  "currentTime": 0,
  "lastUpdatedAt": 1693000000000
}
```

### Play

```
Host / Moderator → socket.emit("play")
       ↓
Server validates permission
       ↓
videoState.playing = true
       ↓
Broadcast "play" to room
       ↓
All clients call player.playVideo()
```

### Pause

Same pattern. `videoState.playing = false`, broadcast `"pause"`.

### Seek

```
Host / Moderator → socket.emit("seek", { time: 125.4 })
       ↓
Server validates permission
       ↓
videoState.currentTime = 125.4
       ↓
Broadcast "seek" to room
       ↓
All clients call player.seekTo(125.4, true)
```

### Change Video

The client extracts the YouTube video ID from any pasted URL format and sends `{ videoId }`. The server resets `playing` to `false` and `currentTime` to `0`, then broadcasts `video_changed` so all clients load the new video from the beginning.

Accepted URL formats:

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/embed/VIDEO_ID
VIDEO_ID (11-character string directly)
```

---

## Chat

Real-time room chat available to all roles.

- Messages broadcast instantly via Socket.IO
- Each message includes username, role badge, and timestamp
- Latest 50 messages stored per room
- New joiners receive the recent chat history
- Messages cap at 500 characters; empty messages are ignored
- Messages belong to the room, not the sender — leaving does not delete your previous messages
- Send with Enter key or the Send button

### Chat Flow

```
User types message → socket.emit("chat_message")
       ↓
Server validates: non-empty, ≤ 500 chars, participant exists
       ↓
Message stored in room (capped at 50)
       ↓
io.to(roomId).emit("chat_message", { id, userId, username, role, message, timestamp })
       ↓
All room members render the message
```

---

## Emoji Reactions

Users can react with one of six emojis during playback:

**❤️ 😂 😮 🔥 👏 💀**

Reactions appear as floating animations in the chat panel, showing the sender's username and drifting upward before fading. Each reaction auto-removes after 5 seconds. The allowed emoji set is validated on the server — arbitrary emoji strings are rejected.

### Reaction Flow

```
User clicks emoji → socket.emit("emoji_reaction", { emoji })
       ↓
Server validates: participant exists, emoji is in allowed list
       ↓
io.to(roomId).emit("emoji_reaction", { id, userId, username, emoji, timestamp })
       ↓
All clients animate the reaction
```

---

## Browser Refresh Recovery

When a user refreshes the browser, they automatically return to the same room with their role preserved. No login, no manual re-join.

### How It Works

**Client side:**

1. `socket.js` generates a stable `clientId` via `crypto.randomUUID()` on first load and persists it in `localStorage`. This ID never changes for a given browser.
2. The `clientId` is sent to the server as a Socket.IO handshake query parameter on every connection.
3. After a successful room join or create, `App.jsx` saves `{ roomId, username }` to `sessionStorage`.
4. On page load, if a saved session exists, the client emits `reconnect_room` instead of showing the lobby.
5. If the server confirms the reconnect, the Room view is restored. If the room no longer exists, the session is cleared and the lobby is shown.

**Server side:**

1. On disconnect, the server does **not** immediately remove the participant. Instead it starts an **8-second grace period timer**.
2. Each participant record stores the `clientId` alongside `socket.id`, `username`, and `role`.
3. If `reconnect_room` arrives within the grace period with a matching `clientId`, the timer is cancelled, the participant's `socket.id` is updated to the new connection, and `room_state` is sent back — with the **original role intact**. The client never sends or claims a role.
4. If the grace period expires without a reconnect, the participant is evicted normally and host transfer logic runs if needed.

**What this means in practice:**

| Scenario | Result |
|---|---|
| Host refreshes | Returns as Host within ~1 second |
| Moderator refreshes | Returns as Moderator with role preserved |
| Participant refreshes | Returns as Participant |
| User clicks "Leave Session" | Session cleared — refresh goes to lobby |
| Tab closed for > 8 seconds | Participant evicted, room cleans up normally |
| Room disappears while refreshing | Session cleared, lobby shown |

**Security note:** The role is never read from `localStorage` or sent by the client. The server looks up the role from its own memory using the `clientId`. A user cannot claim a role by modifying local storage.

### Reconnect Flow Diagram

```
Browser refresh
       ↓
New socket.id assigned
clientId unchanged (localStorage)
       ↓
socket.js sends clientId as handshake query
       ↓
App.jsx reads sessionStorage → { roomId, username }
       ↓
socket.emit("reconnect_room", { roomId, username })
       ↓
Server finds participant by clientId
       ↓
Cancel grace period timer
Update socket.id reference
       ↓
socket.emit("room_state", { ..., createdAt })
       ↓
App.jsx restores Room view with original role
```

---

## Room Stopwatch

A live stopwatch is displayed in the top header to the left of the theme toggle button. It shows how long the room has been active in `MM:SS` format (switching to `HH:MM:SS` after one hour).

- The timer starts from when the room was **created**, not from when the current user joined
- The `createdAt` Unix timestamp is set by the server at room creation time and included in every `room_state` and `room_created` response
- Users who join mid-session see the correct elapsed time immediately
- After a page refresh, the timer continues from the correct server-authoritative start time
- The stopwatch only appears while inside a room and disappears when the user leaves

---

## Preventing Playback Event Loops

A known challenge with the YouTube IFrame API is that calling `playVideo()` or `pauseVideo()` programmatically triggers the same `onStateChange` event as a real user interaction.

Without protection this creates a loop:

```
Server broadcasts "play"
       ↓
Client calls player.playVideo()
       ↓
YouTube fires onStateChange(PLAYING)
       ↓
Client thinks user pressed play
       ↓
Client emits "play" to server
       ↓
Server broadcasts "play" again
       ↓
...
```

**Fix:** A `suppressRef` is set before any programmatic player call. When `onStateChange` fires, if suppression is active the event is discarded and the ref is cleared. Only genuine user interactions (no active suppression) emit events back to the server.

```
Remote "play" received
       ↓
suppressRef.current = "play"
       ↓
player.playVideo()
       ↓
onStateChange(PLAYING) fires
       ↓
suppressRef active → discard, clear ref
       ↓
No duplicate emit sent
```

---

## Host Transfer

When a Host disconnects or explicitly leaves, the server checks whether any Host remains in the room. If not, it promotes the next participant in the room's participant map and broadcasts `role_updated` to everyone.

With browser refresh recovery, the Host's record stays intact during the 8-second grace period — so a Host refresh does **not** trigger a premature promotion.

```
Host leaves (or grace period expires)
       ↓
removeParticipant(roomId, socketId)
       ↓
No Host found in remaining participants
       ↓
Promote first remaining participant → "host"
       ↓
io.to(roomId).emit("role_updated", { targetId, role: "host" })
```

---

## Room State

Rooms are stored in server memory. A complete room object:

```json
{
  "id": "ABC123",
  "createdAt": 1693000000000,
  "participants": {
    "socketId": {
      "id": "socketId",
      "clientId": "uuid-from-browser",
      "username": "Ayush",
      "role": "host"
    }
  },
  "videoState": {
    "videoId": "dQw4w9WgXcQ",
    "playing": false,
    "currentTime": 0,
    "lastUpdatedAt": 1693000000000
  },
  "messages": []
}
```

`clientId` is the stable browser identity used for reconnect matching. It is separate from `socket.id`, which changes on every connection.

---

## WebSocket Event Architecture

### Client → Server

| Event | Payload | Permission |
|-------|---------|------------|
| `create_room` | `{ username }` | Anyone |
| `join_room` | `{ roomId, username }` | Anyone |
| `reconnect_room` | `{ roomId, username }` | Anyone |
| `leave_room` | — | Anyone |
| `play` | — | Host, Moderator |
| `pause` | — | Host, Moderator |
| `seek` | `{ time }` | Host, Moderator |
| `change_video` | `{ videoId }` | Host, Moderator |
| `assign_role` | `{ targetId, role }` | Host |
| `remove_participant` | `{ targetId }` | Host |
| `chat_message` | `{ message }` | Anyone in room |
| `emoji_reaction` | `{ emoji }` | Anyone in room |

### Server → Client

| Event | Payload | When |
|-------|---------|------|
| `room_created` | `{ roomId, roomState }` | After create_room |
| `room_state` | `{ roomId, participants, videoState, messages, createdAt }` | After join / reconnect |
| `user_joined` | `{ participant }` | New user enters |
| `user_left` | `{ participantId }` | User leaves or is removed |
| `role_updated` | `{ targetId, role }` | Role assignment changes |
| `play` | — | Playback started |
| `pause` | — | Playback paused |
| `seek` | `{ time }` | Playback position changed |
| `video_changed` | `{ videoId }` | Video changed |
| `chat_message` | `{ id, userId, username, role, message, timestamp }` | Chat message sent |
| `emoji_reaction` | `{ id, userId, username, emoji, timestamp }` | Emoji reaction sent |
| `participant_removed` | — | You were removed by Host |
| `permission_denied` | `{ action }` | Unauthorized action attempted |
| `reconnect_failed` | `{ message }` | Room gone, reconnect impossible |
| `error` | `{ message }` | Invalid request |

---

## Frontend Architecture

Built with React 19 and Vite 8.

```
client/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── CreateRoom.jsx     # Room creation form
│   │   ├── JoinRoom.jsx       # Room join form
│   │   ├── Room.jsx           # Main room orchestrator
│   │   └── VideoPlayer.jsx    # YouTube IFrame wrapper
│   ├── App.css                # All application styles + theming
│   ├── App.jsx                # Top-level state, routing, Stopwatch
│   ├── index.css              # CSS reset and design tokens
│   ├── main.jsx               # React entry point
│   └── socket.js              # Socket.IO client + clientId generation
├── index.html
├── package.json
└── vite.config.js
```

### Component Responsibilities

**`App.jsx`**
- Top-level screen routing (lobby / room)
- Session save/restore via `sessionStorage`
- Auto-reconnect on page load
- `Stopwatch` component (inline, reads server `createdAt`)
- Theme toggle with `localStorage` persistence
- Connection status indicator

**`socket.js`**
- Generates and persists `clientId` via `crypto.randomUUID()` in `localStorage`
- Creates the Socket.IO connection with `clientId` in the handshake query
- Exported as a singleton used across all components

**`Room.jsx`**
- Participant list with role badges
- Host management actions (promote, demote, remove)
- Video URL input and change video button (Host/Moderator only)
- YouTube player integration with suppression logic
- Chat panel with message history and input
- Emoji reaction bar and floating animation rendering
- All Socket.IO room event listeners

**`VideoPlayer.jsx`**
- Dynamically loads the YouTube IFrame API script
- Creates and manages the `YT.Player` instance
- Fires `yt-state-change` custom events for `Room.jsx` to consume
- Overlays a transparent div for Participants to block direct player interaction

**`CreateRoom.jsx` / `JoinRoom.jsx`**
- Thin forms that emit `create_room` / `join_room`
- Pass `createdAt` from server response through to `App.jsx`

---

## Backend Architecture

Built with Node.js, Express 4, and Socket.IO 4.

```
server/
├── src/
│   ├── index.js          # Express + Socket.IO entry point
│   ├── permissions.js    # Role → allowed actions map
│   └── rooms.js          # In-memory room store
├── package.json
└── package-lock.json
```

### `index.js`

Handles all Socket.IO events:

- Room lifecycle: `create_room`, `join_room`, `reconnect_room`, `leave_room`
- Playback: `play`, `pause`, `seek`, `change_video`
- Roles: `assign_role`, `remove_participant`
- Chat: `chat_message`
- Reactions: `emoji_reaction`
- Disconnect with 8-second grace period before eviction

Also exposes the `/api/health` endpoint. In production, the React frontend is deployed separately as a Render Static Site.

### `rooms.js`

In-memory store with helper functions:

| Function | Purpose |
|----------|---------|
| `createRoom(socket, username)` | Create room, assign Host, set `createdAt` |
| `getRoom(roomId)` | Look up a room |
| `addParticipant(roomId, socketId, username, clientId)` | Add a Participant |
| `removeParticipant(roomId, socketId)` | Remove and trigger host promotion if needed |
| `findParticipantByClientId(roomId, clientId)` | Locate a participant by browser identity (used for reconnect) |
| `reconnectParticipant(roomId, oldSocketId, newSocketId)` | Re-key participant record to new socket |
| `getParticipant(roomId, socketId)` | Get a single participant |
| `getRoomParticipants(roomId)` | Get all participants as an array |
| `addMessage(roomId, message)` | Add chat message, cap at 50 |
| `getMessages(roomId)` | Get chat history |

### `permissions.js`

```javascript
const PERMISSIONS = {
  host:        ["play", "pause", "seek", "change_video", "assign_role", "remove_participant"],
  moderator:   ["play", "pause", "seek", "change_video"],
  participant: [],
};

function can(role, action) {
  return PERMISSIONS[role]?.includes(action) ?? false;
}
```

Keeping this separate means adding or removing a permission is a one-line change in one file.

---

## Production Architecture

The application is deployed as **two separate Render services**:

```text
                         Internet
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
   ┌────────────────────┐      ┌─────────────────────┐
   │   YTWP-client      │      │        YTWP         │
   │   Render Static     │      │   Render Web Service │
   │   React + Vite      │      │ Node + Express       │
   │   client/dist       │      │ Socket.IO            │
   └─────────┬──────────┘      │ /api/health          │
             │                 └──────────┬──────────┘
             │                            │
             └──── Socket.IO / HTTP ──────┘
```

### Frontend

**Production URL:** `https://ytwp-client.onrender.com/`

Render builds the `client/` directory with Vite and publishes its `dist/` output as a static site.

### Backend

**Production URL:** `https://ytwp.onrender.com/`

The backend runs Node.js/Express/Socket.IO and exposes the health endpoint at `/api/health`. It does **not** serve the React build in production.

### Production connection

The frontend uses:

```text
VITE_SERVER_URL=https://ytwp.onrender.com
```

The backend uses:

```text
CLIENT_ORIGIN=https://ytwp-client.onrender.com
```

This keeps the frontend and real-time backend independently deployable while allowing Socket.IO connections from the production frontend.

### Production Build

```bash
# Frontend
cd client
npm install
npm run build

# Backend
cd server
npm install
npm start
```

Render uses the equivalent commands during deployment. The backend listens on Render's assigned `PORT`.

---

## Local Development

### Prerequisites

- Node.js ≥ 20
- npm
- Git

### Setup

```bash
git clone https://github.com/fraxard/YTWP.git
cd yt-wp
```

**Terminal 1 — Backend:**

```bash
cd server
npm install
npm run dev
```

Server runs at `http://localhost:3001`

Health check: `http://localhost:3001/api/health` → `{ "ok": true }`

**Terminal 2 — Frontend:**

```bash
cd client
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

Vite proxies `/socket.io` and `/api` to the backend automatically via `vite.config.js` — no CORS issues in development.

### Testing with Multiple Users

The core functionality requires multiple browser sessions. Recommended setup:

| Browser | Role |
|---------|------|
| Chrome (normal) | Host |
| Chrome Incognito | Moderator |
| Firefox or Edge | Participant |

---

## Environment Variables

| Variable | Default | Used by | Purpose |
|----------|---------|---------|---------|
| `PORT` | `3001` | Backend | Server port (Render sets this automatically) |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Backend | Allowed frontend origin for CORS |
| `VITE_SERVER_URL` | — | Frontend | Backend URL used by the Socket.IO client |

### Production values

```text
VITE_SERVER_URL=https://ytwp.onrender.com
CLIENT_ORIGIN=https://ytwp-client.onrender.com
```

`VITE_SERVER_URL` is a Vite build-time variable, so it must be configured in the frontend deployment environment before building.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, JavaScript (ESM), CSS |
| Backend | Node.js, Express 4 |
| Real-time | Socket.IO 4 |
| Video | YouTube IFrame Player API |
| Storage | In-memory (JavaScript object) |
| Deployment | Render (Static Site + Node.js Web Service) |

---

## Security Considerations

This is an MVP without authentication. The following protections are in place:

**Server-enforced:**
- Role validation on every restricted event
- `clientId` used for reconnect identity — role is never trusted from the client
- Host cannot be removed or have their role changed by anyone
- Invalid roles rejected on `assign_role`
- YouTube video IDs validated before storing
- Chat messages validated (type, length, non-empty)
- Emoji reactions validated against a server-side allowlist
- Room existence checked on every event

**Client-side (UX only, not security):**
- Playback controls hidden for Participants
- Video URL input hidden for Participants
- Role management buttons hidden for non-Hosts

**Future hardening for production:**
- User authentication (JWT or sessions)
- Rate limiting on Socket.IO events
- Input sanitization
- Persistent storage with proper access controls
- Redis adapter for horizontal scaling

---

## Design Decisions

### Why no database?

The application is a real-time synchronization exercise. Room state fits naturally in memory on the server. Adding a database would increase complexity without improving the core functionality being demonstrated. The trade-off is that rooms do not survive server restarts, which is acceptable for this use case.

### Why sessionStorage for the saved session?

`sessionStorage` is tab-scoped. Closing the tab clears it automatically, which is the right behavior — a new tab should start fresh. `localStorage` would persist across all tabs and browser restarts, which would be unexpected.

### Why 8 seconds for the reconnect grace period?

A browser refresh typically takes 1–3 seconds on a normal connection. 8 seconds is long enough to handle slow connections and Render's cold start latency without being so long that a genuinely disconnected user's participant slot stays open for too long.

### Why keep the role on the server only?

If the role were stored client-side (localStorage, cookie), a user could modify it and claim Host permissions. The `clientId` stored in localStorage is an identity token only — the server maps it to the role it has on record, which the client cannot influence.

### Why Socket.IO over raw WebSockets?

Socket.IO provides room-based broadcasting, automatic reconnection, and fallback transport — all needed features that would otherwise require manual implementation with raw WebSockets.

---

## Known Limitations

| Limitation | Notes |
|-----------|-------|
| No authentication | Users are identified by username only |
| No persistent rooms | Server restart clears all state |
| Single server only | Horizontal scaling requires a Redis Socket.IO adapter |
| No join-time position estimation | New joiners start at the last recorded position, not the live estimated position |
| No explicit host transfer UI | Host must leave to trigger automatic transfer |
| Join-time autoplay edge case | If a video is already playing when a new participant joins, the new participant may not autoplay until the host pauses and resumes playback |

---

## Future Improvements

- User authentication and persistent profiles
- PostgreSQL / Redis for persistent room and chat state
- Explicit host transfer (Host selects a successor before leaving)
- Join-time playback position estimation (`currentTime + elapsed since lastUpdatedAt`)
- Video queue / playlist management
- Rate limiting on chat and reactions
- Redis Socket.IO adapter for multi-instance deployment
- Room password protection
- Watch history and user profiles
- Mobile-optimized layout improvements

---

## Project Structure

```
yt-wp/
│
├── client/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── CreateRoom.jsx
│   │   │   ├── JoinRoom.jsx
│   │   │   ├── Room.jsx
│   │   │   └── VideoPlayer.jsx
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── socket.js
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── permissions.js
│   │   └── rooms.js
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
├── package.json
└── README.md
```

---

## Status

```
Room Creation                    ✓
Room Joining                     ✓
Participant List                 ✓
Host Role                        ✓
Moderator Role                   ✓
Participant Role                 ✓
Role Assignment                  ✓
Role Enforcement (server-side)   ✓
Remove Participant               ✓
Play Synchronization             ✓
Pause Synchronization            ✓
Seek Synchronization             ✓
Change Video                     ✓
YouTube Integration              ✓
Playback Loop Prevention         ✓
Chat                             ✓
Emoji Reactions                  ✓
Host Transfer on Disconnect      ✓
Browser Refresh Recovery         ✓
Room Stopwatch                   ✓
Light / Dark Theme               ✓
Production Build                 ✓
Production Deployment            ✓
Final Live Testing               ✓
Live URL in README               ✓
```

---

## License

MIT License