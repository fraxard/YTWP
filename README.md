# YouTube Watch Party

A real-time YouTube watch party application that allows multiple users to join the same room and watch videos together with synchronized playback.

The application uses React on the frontend, Node.js + Express on the backend, and Socket.IO for real-time communication between users.

---

## Live Demo

**Live URL:** Coming soon

The application will be deployed as a full-stack service with the React production build served by the Express server.

---

# Overview

YouTube Watch Party is a room-based synchronized video watching application.

A user can create a room and automatically becomes the Host. Other users can join the room using a room code and are added as Participants by default.

The Host can:

- Control video playback
- Pause and play the video
- Seek to a different position
- Change the current YouTube video
- Promote participants to Moderators
- Demote Moderators back to Participants
- Remove participants
- Transfer the Host role when the Host leaves

Moderators can control playback but do not have Host-level room management permissions.

Participants can watch the synchronized video and use the room chat but cannot control playback.

The main communication between clients happens through Socket.IO events. Room state is currently stored in memory on the Node.js server.

---

# Features

## Room Management

### Create Room

A user can create a new watch party room by entering a username.

The server:

1. Generates a unique 6-character room ID.
2. Creates the room in memory.
3. Adds the creator as the Host.
4. Adds the socket to the Socket.IO room.
5. Sends the initial room state back to the creator.

Example:

    User
      ↓
    Create Room
      ↓
    Server generates room ID
      ↓
    ABC123
      ↓
    User becomes Host

---

## Join Room

Users can join an existing room using the room ID.

Joiners are automatically assigned the `participant` role.

The server sends the joining user:

- Room ID
- Participant list
- Current video state
- Recent chat messages

The other participants receive a `user_joined` event.

---

# Role-Based Access Control

The application uses three main roles.

| Role | Playback | Role Management | Remove Users |
|------|----------|-----------------|--------------|
| Host | Yes | Yes | Yes |
| Moderator | Yes | No | No |
| Participant | No | No | No |

## Host

The Host is automatically assigned when a room is created.

Host permissions include:

- Play
- Pause
- Seek
- Change video
- Assign roles
- Remove participants
- Host transfer when leaving

## Moderator

Moderators are assigned by the Host.

They can:

- Play
- Pause
- Seek
- Change video

They cannot:

- Promote other users
- Demote users
- Remove users
- Change the Host

## Participant

Participants are the default role for users joining a room.

They can:

- Watch the synchronized video
- View participants
- Send chat messages

They cannot:

- Play
- Pause
- Seek
- Change the video
- Assign roles
- Remove participants

---

# Permission Enforcement

Permissions are enforced on the backend.

The frontend hides or disables controls for users without permission, but this is not treated as the security mechanism.

The server checks the user's role before processing restricted Socket.IO events.

The general flow is:

    Client sends event
           ↓
    Server identifies socket
           ↓
    Find room
           ↓
    Find participant
           ↓
    Check participant role
           ↓
    Check permission
           ↓
    Process event
           ↓
    Broadcast result

For example, if a Participant attempts to change the video:

    Participant
         ↓
    change_video
         ↓
    Server
         ↓
    Role = participant
         ↓
    Permission denied

The server responds with a `permission_denied` event instead of processing the action.

This prevents users from bypassing frontend restrictions by manually emitting Socket.IO events.

---

# Video Synchronization

The application uses the YouTube IFrame Player API to embed and control YouTube videos.

The current room video state contains:

    {
      videoId,
      playing,
      currentTime,
      lastUpdatedAt
    }

The server keeps this state for each room.

---

## Play Synchronization

When a Host or Moderator plays the video:

    Host / Moderator
           ↓
    socket.emit("play")
           ↓
    Server validates permission
           ↓
    Room video state updated
           ↓
    Server broadcasts "play"
           ↓
    Other clients play the video

---

## Pause Synchronization

The same pattern is used for pausing:

    Host / Moderator
           ↓
    pause
           ↓
    Server
           ↓
    Update room state
           ↓
    Broadcast pause
           ↓
    Other clients pause

---

## Seek Synchronization

When a Host or Moderator seeks, a payload similar to the following is sent to the server:

    {
      time: 125.4
    }

The server updates the room's current playback position and broadcasts the new position to other clients.

The receiving clients call the YouTube player's `seekTo()` method.

---

## Change Video Synchronization

Hosts and Moderators can paste a YouTube URL.

The client extracts the YouTube video ID and sends:

    {
      videoId
    }

to the server.

The server updates the room state and broadcasts:

    video_changed

to all clients.

The clients then load the new video.

Changing the video also resets:

    playing = false
    currentTime = 0

so that all users start the new video from the beginning.

---

# YouTube Integration

The application uses the YouTube IFrame Player API.

The frontend dynamically loads the YouTube IFrame API and creates a YouTube player instance.

The application accepts common YouTube URL formats including:

    https://www.youtube.com/watch?v=VIDEO_ID
    https://youtu.be/VIDEO_ID
    https://www.youtube.com/embed/VIDEO_ID

The video ID is extracted before being sent to the backend.

The actual player is isolated inside:

    client/src/components/VideoPlayer.jsx

This keeps YouTube-specific functionality separate from the room and participant logic.

---

# Preventing Playback Event Loops

One of the issues encountered during development was a playback event loop.

The problem occurred when a server-originated playback command caused the YouTube player to emit another state-change event.

For example:

    Server says PLAY
          ↓
    YouTube plays
          ↓
    YouTube emits PLAYING
          ↓
    Client interprets it as a new user action
          ↓
    Client emits PLAY again
          ↓
    Server broadcasts PLAY
          ↓
    ...

This could result in repeated play/pause behavior, particularly when roles were being changed.

To prevent this, the client keeps track of whether a YouTube state change was caused by a remote/server event.

A suppression reference is used so that server-originated playback changes are not immediately interpreted as new user actions.

Conceptually:

    Remote play received
           ↓
    Mark event as suppressed
           ↓
    Call YouTube playVideo()
           ↓
    YouTube fires state change
           ↓
    Client recognizes suppressed event
           ↓
    Does NOT emit another play event

This keeps local user actions and remote synchronization events on separate paths.

---

# Room State

Rooms are currently stored in memory on the Node.js server.

A simplified room looks like:

    {
      id: "ABC123",

      participants: {
        socketId: {
          id: socketId,
          username: "Ayush",
          role: "host"
        }
      },

      videoState: {
        videoId: "dQw4w9WgXcQ",
        playing: false,
        currentTime: 0,
        lastUpdatedAt: Date.now()
      },

      messages: []
    }

The room store is implemented in:

    server/src/rooms.js

The module contains helper functions for:

- Creating rooms
- Finding rooms
- Adding participants
- Removing participants
- Finding participants
- Getting participant lists
- Managing chat messages

---

# Why There Is No Database

A database is intentionally not used in the current MVP.

The application is primarily a real-time synchronization project, so the room state can be maintained in memory on the Node.js server.

The current architecture is therefore:

    Browser
       ↓
    React
       ↓
    Socket.IO
       ↓
    Node.js + Express
       ↓
    In-memory room state

This keeps the project small and makes the real-time architecture easier to understand and demonstrate.

## Trade-off

The main limitation is that room state is lost when the Node.js server process restarts.

For example:

    Server running
          ↓
    Room ABC123 exists
          ↓
    Server restart
          ↓
    Memory cleared
          ↓
    Room ABC123 no longer exists

Persistent rooms were not required for the MVP.

If persistence were required in a future version, room metadata and chat history could be moved to PostgreSQL, MongoDB, SQLite, or another persistent store.

---

# Chat

Basic room chat has been added as an additional feature.

The chat is implemented using Socket.IO.

Users can:

- Send messages
- Receive messages in real time
- See usernames
- See sender roles
- See timestamps
- Send messages using Enter
- View recent chat history

Messages are limited to the latest 50 messages per room.

Individual messages are limited to 500 characters.

Empty messages are ignored.

---

## Chat Flow

    User types message
           ↓
    Client emits chat_message
           ↓
    Server validates message
           ↓
    Server identifies participant
           ↓
    Message stored in room
           ↓
    Server broadcasts chat_message
           ↓
    All room members receive it

A chat message contains:

    {
      id,
      userId,
      username,
      role,
      message,
      timestamp
    }

---

## Chat Persistence Behavior

Messages belong to the room rather than to the participant.

Therefore, when a participant leaves:

    Participant leaves
           ↓
    Participant removed
           ↓
    Their messages remain

If the same room continues to exist and the participant rejoins, recent messages can still be available.

When the room becomes completely empty, the room itself is removed from memory, so its messages are removed as well.

A server restart also clears room and chat state because the current implementation is memory-based.

---

# Participant Management

The Host can manage participants through the participant panel.

Available actions include:

    Participant → Make Moderator
    Moderator   → Remove Moderator
    Participant → Remove
    Moderator   → Remove

Role changes are broadcast to the room using:

    role_updated

The frontend then updates the participant list and available controls.

---

# Host Transfer

Host transfer is partially implemented.

When the current Host leaves the room, the server detects that there is no longer a Host and promotes another participant.

The current implementation selects the first remaining participant and assigns the `host` role.

The room is then notified of the role change.

Current flow:

    Host leaves
        ↓
    Server removes Host
        ↓
    Check for remaining Host
        ↓
    No Host exists
        ↓
    Promote next participant
        ↓
    Broadcast role_updated

The Host transfer behavior will be tested and finalized as part of the final reliability pass.

A future version could allow the Host to explicitly select another participant and transfer the role before leaving.

---

# Removing Participants

The Host can remove another participant.

The flow is:

    Host
     ↓
    Remove participant
     ↓
    Server validates Host permission
     ↓
    Target participant notified
     ↓
    Target socket leaves room
     ↓
    Participant removed from room state
     ↓
    Remaining users receive user_left

The removed participant is returned to the lobby.

Their chat messages are not deleted from the room's history.

---

# Leaving and Disconnecting

There are two ways for a user to leave.

## Explicit Leave

The user clicks:

    Leave Session

The client emits:

    leave_room

The server removes the participant and broadcasts the departure.

## Socket Disconnect

Socket.IO also handles unexpected disconnections.

The server performs room cleanup when a socket disconnects.

Host disconnection also triggers the Host transfer logic described above.

---

# Browser Refresh

## Current Issue

Browser refresh currently causes the React application to lose its in-memory frontend room state.

The Socket.IO connection is also recreated after the page reload.

The current application therefore returns the user to the lobby after a refresh.

Current behavior:

    Inside room
        ↓
    Browser refresh
        ↓
    React state resets
        ↓
    Socket reconnects with a new connection
        ↓
    Lobby

## Planned Fix

Session recovery will be added so that the application can remember:

    Room ID
    Username
    Client identity

and reconnect the user to their previous room.

The server will remain authoritative over the user's role.

The intended behavior is:

    Host
      ↓
    Refresh
      ↓
    Reconnect
      ↓
    Same room
      ↓
    Still Host

The same behavior should apply to Moderators and Participants.

Explicitly leaving the room will clear the saved session.

---

# Playback Position Synchronization

Basic playback synchronization is implemented, but join-time playback position synchronization is still part of the final reliability pass.

The required behavior is:

    Host is watching at 05:32
            ↓
    Participant joins
            ↓
    Participant receives current video state
            ↓
    Video loads
            ↓
    Player seeks to approximately 05:32
            ↓
    Player follows current play/pause state

The room already tracks:

    currentTime
    playing
    lastUpdatedAt

The next step is to calculate the estimated current position when a user joins while playback is active.

Conceptually:

    estimatedTime =
    currentTime +
    time elapsed since lastUpdatedAt

This prevents a user joining a currently playing video from starting at an outdated position.

---

# WebSocket Event Architecture

Socket.IO is responsible for all real-time room communication.

## Client → Server

| Event | Purpose |
|------|---------|
| `create_room` | Create a new room |
| `join_room` | Join an existing room |
| `leave_room` | Leave the current room |
| `play` | Request playback |
| `pause` | Request pause |
| `seek` | Request playback position change |
| `change_video` | Change the current YouTube video |
| `assign_role` | Assign Moderator/Participant role |
| `remove_participant` | Remove a participant |
| `chat_message` | Send a chat message |

---

## Server → Client

| Event | Purpose |
|------|---------|
| `room_created` | Return newly created room state |
| `room_state` | Send state to a joining client |
| `user_joined` | Notify existing users |
| `user_left` | Notify users of a departure |
| `play` | Synchronize playback |
| `pause` | Synchronize pause |
| `seek` | Synchronize playback position |
| `video_changed` | Synchronize video changes |
| `role_updated` | Update participant roles |
| `participant_removed` | Notify a removed participant |
| `permission_denied` | Reject unauthorized actions |
| `error` | Report invalid requests |
| `chat_message` | Broadcast chat messages |

---

# Example Real-Time Flow

Suppose the Host presses Play.

    ┌───────────────┐
    │ Host Browser  │
    └───────┬───────┘
            │
            │ socket.emit("play")
            ▼
    ┌───────────────┐
    │ Node Server   │
    └───────┬───────┘
            │
            │ Check room
            │ Check participant
            │ Check role
            ▼
    ┌───────────────┐
    │ Room State    │
    │ playing=true  │
    └───────┬───────┘
            │
            │ broadcast
            ▼
    ┌───────────────────────────────┐
    │ Moderator / Participants     │
    │                               │
    │ receive "play"                │
    │ call player.playVideo()       │
    └───────────────────────────────┘

This approach keeps the server as the authority for room-level playback state.

---

# Frontend Architecture

The frontend is built using React and Vite.

Current structure:

    client/
    ├── public/
    ├── src/
    │   ├── assets/
    │   │
    │   ├── components/
    │   │   ├── CreateRoom.jsx
    │   │   ├── JoinRoom.jsx
    │   │   ├── Room.jsx
    │   │   └── VideoPlayer.jsx
    │   │
    │   ├── App.css
    │   ├── App.jsx
    │   ├── Index.css
    │   ├── main.jsx
    │   └── socket.js
    │
    ├── index.html
    ├── package.json
    ├── package-lock.json
    └── vite.config.js

## Main Components

### `App.jsx`

Responsible for high-level application state and switching between:

    Lobby
    Room

It receives room creation/join responses and renders the Room component with the initial room state.

### `CreateRoom.jsx`

Provides the room creation form and emits the `create_room` event.

### `JoinRoom.jsx`

Provides the room joining form and emits the `join_room` event.

### `Room.jsx`

Acts as the main room orchestrator.

It handles:

- Participant state
- Roles
- Room controls
- Socket.IO room events
- Chat
- Video state changes
- Participant management
- Room leaving

### `VideoPlayer.jsx`

Encapsulates the YouTube IFrame API.

It handles:

- YouTube player creation
- Video loading
- Playback state events
- Player controls
- YouTube URL/video ID handling

### `socket.js`

Creates the Socket.IO client connection used by the React application.

---

# Backend Architecture

The backend uses Node.js, Express, and Socket.IO.

Current structure:

    server/
    ├── src/
    │   ├── index.js
    │   ├── permissions.js
    │   └── rooms.js
    │
    ├── package.json
    └── package-lock.json

## `index.js`

Main backend entry point.

Responsibilities:

- Create Express application
- Create HTTP server
- Create Socket.IO server
- Register Socket.IO events
- Validate permissions
- Broadcast room events
- Serve production frontend
- Provide health endpoint

## `rooms.js`

Responsible for the in-memory room store and room operations.

It provides helpers for:

- Creating rooms
- Getting rooms
- Adding participants
- Removing participants
- Getting participants
- Managing chat messages

## `permissions.js`

Contains the role permission map.

The permission system follows the pattern:

    Role
     ↓
    Allowed actions
     ↓
    can(role, action)

This keeps authorization logic separate from the individual Socket.IO event handlers.

---

# Production Architecture

The intended production deployment uses a single full-stack Node.js service.

    Internet
        │
        ▼
    ┌───────────────────┐
    │      Render       │
    │                   │
    │ Node + Express    │
    │ Socket.IO         │
    │ React build       │
    └─────────┬─────────┘
              │
       ┌──────┴──────┐
       │             │
       ▼             ▼
    React client   Socket.IO
    client/dist    WebSocket
       │             │
       └──────┬──────┘
              ▼
           Browser

Express serves the React production build.

The same server handles:

    GET /
    GET /assets/*
    GET /api/health
    /socket.io/*

This avoids having to deploy the frontend and WebSocket backend as completely separate services.

---

# Production Build

The frontend is built using Vite.

The production build creates:

    client/dist/

The Express server serves this directory when:

    NODE_ENV=production

is enabled.

The expected production flow is:

    npm run build
          ↓
    client/dist
          ↓
    Express serves dist
          ↓
    Render starts Node server
          ↓
    Public application URL

---

# Environment Variables

The backend supports:

    PORT
    NODE_ENV
    CLIENT_ORIGIN

## `PORT`

The server uses:

    process.env.PORT || 3001

This allows hosting platforms such as Render to provide the production port automatically.

## `NODE_ENV`

Production mode enables serving the React build:

    NODE_ENV=production

## `CLIENT_ORIGIN`

The Socket.IO CORS configuration can use:

    CLIENT_ORIGIN

to specify the frontend origin.

During local development, the frontend runs on the Vite development server.

---

# Local Development

## Prerequisites

Install:

- Node.js
- npm
- Git

---

## Clone the repository

    git clone <repository-url>
    cd yt-wp

---

# Start the Backend

Open a terminal:

    cd server
    npm install
    npm run dev

The backend runs on the configured development port, normally:

    http://localhost:3001

Health check:

    http://localhost:3001/api/health

Expected response:

    {
      "ok": true
    }

---

# Start the Frontend

Open another terminal:

    cd client
    npm install
    npm run dev

Vite will provide the local frontend URL, normally:

    http://localhost:5173

---

# Production Build Locally

Build the frontend:

    cd client
    npm run build

Then run the backend in production mode.

On Windows PowerShell:

    $env:NODE_ENV="production"
    npm start

On macOS/Linux:

    NODE_ENV=production npm start

The Express server will serve the React production build.

---

# Testing Strategy

The application should be tested with multiple browser sessions because the main functionality is real-time and multi-user.

A recommended local test setup is:

    Chrome
      → Host

    Chrome Incognito
      → Moderator

    Edge / Firefox
      → Participant

---

# Core Test Cases

## Room

- Create a room
- Join a valid room
- Attempt to join an invalid room
- Create with an empty username
- Multiple participants in the same room

## Roles

- Host is assigned automatically
- Participant joins with Participant role
- Host promotes Participant to Moderator
- Host demotes Moderator
- Participant cannot assign roles
- Moderator cannot assign roles
- Host cannot be removed

## Playback

- Host plays video
- Host pauses video
- Host seeks
- Host changes video
- Moderator plays video
- Moderator pauses video
- Moderator seeks
- Moderator changes video
- Participant cannot control playback
- Playback remains synchronized across clients
- New participant receives the correct playback position

## Participants

- User joins
- User leaves
- User disconnects
- Host leaves
- Host transfer occurs
- Participant can be removed
- Removed participant returns to lobby

## Chat

- Host sends a message
- Moderator sends a message
- Participant sends a message
- Messages appear for all users
- Messages have timestamps
- Empty messages are rejected
- Messages over 500 characters are rejected
- User leaving does not remove their previous messages
- Recent chat history is available to users joining the room

## Refresh

- Host refresh
- Moderator refresh
- Participant refresh
- User explicitly leaves
- User refreshes after explicitly leaving

---

# Development Issues Encountered

## 1. Moderator Playback Loop

### Problem

When a participant was promoted to Moderator, playback could enter a repeated play/pause cycle.

The underlying issue was related to the difference between:

    User-originated YouTube events

and:

    Server-originated synchronization events

A remote `playVideo()` or `pauseVideo()` call can trigger YouTube's state-change event, which could then be mistaken for another user action.

### Fix

A suppression reference was added to distinguish remote commands from genuine local interactions.

This prevents a server-originated playback update from immediately generating another Socket.IO playback event.

---

## 2. Browser Refresh

### Problem

Refreshing the browser resets React state.

The previous room information was stored in React state, so a refresh caused:

    React state reset
         ↓
    roomData = null
         ↓
    Lobby rendered

The Socket.IO connection is also recreated during the page reload.

### Planned Fix

A reconnect/session recovery mechanism will preserve the user's room identity across refreshes while keeping the server authoritative over the user's role.

---

## 3. Join-Time Playback Position

### Problem

The current room state stores the last known playback position, but a newly joining participant needs the estimated current position if the video is actively playing.

For example:

    Server last recorded:
    05:00

    Host continues playing for:
    20 seconds

    New participant joins:
    should start around 05:20

### Planned Fix

Use:

    currentTime
    +
    time elapsed since lastUpdatedAt

when the room is actively playing.

This will allow users joining an active session to start much closer to the current playback position.

---

# Design Decisions

## Why React?

React provides a straightforward way to manage:

- Room state
- Participant state
- Role-based UI
- Chat messages
- Video state
- Socket event updates

The UI can react immediately when Socket.IO events update application state.

---

## Why Socket.IO?

Socket.IO provides bidirectional real-time communication between the browser and Node.js server.

This is particularly useful for a watch party because playback actions need to propagate immediately.

For example:

    Host pauses
       ↓
    Socket.IO
       ↓
    Server
       ↓
    All room clients
       ↓
    Pause locally

It also provides room-based broadcasting through Socket.IO rooms.

---

## Why Express?

Express is used for:

- Running the HTTP server
- Health checks
- Serving the production React build

It also works naturally alongside Socket.IO using the same HTTP server.

---

## Why In-Memory Storage?

The project is primarily a real-time synchronization exercise.

Using an in-memory store makes it easy to understand:

    Room
     ├── Participants
     ├── Video State
     └── Chat

without adding database configuration and persistence complexity that is not necessary for the MVP.

The trade-off is that rooms do not survive server restarts.

---

## Why Keep Authorization on the Server?

Frontend restrictions are useful for user experience, but they cannot be trusted for security.

A malicious client could still manually emit:

    change_video

even if the UI doesn't display the control.

Therefore, the server checks:

    socket
      ↓
    room
      ↓
    participant
      ↓
    role
      ↓
    permission

before processing restricted actions.

---

# Security Considerations

The current application is an internship MVP and does not implement user authentication.

The following protections are implemented at the application level:

- Server-side role validation
- Server-side permission enforcement
- Username validation
- Room existence validation
- YouTube video ID validation
- Chat message validation
- Chat length limit
- Host protection from removal
- Invalid role protection
- Participant existence checks

Future production hardening could include:

- Authentication
- Rate limiting
- Persistent user identity
- Input sanitization
- Persistent database storage
- More robust room ownership
- Abuse prevention

---

# Current Limitations

The current MVP intentionally has several limitations.

## No Authentication

Users identify themselves using a username.

There are no accounts or passwords.

## No Persistent Rooms

Rooms exist only in server memory.

A server restart clears all rooms.

## Single Server

The application currently assumes one Node.js server instance.

A horizontally scaled version would require shared state and a Socket.IO adapter such as Redis.

## No Database

Room state and chat messages are stored in memory.

## Browser Refresh Recovery

Session recovery is currently being finalized.

## Join-Time Position Sync

Playback position estimation for users joining an actively playing room is part of the final synchronization pass.

---

# Future Improvements

Possible future improvements include:

- User authentication
- Persistent rooms
- PostgreSQL / MongoDB / SQLite storage
- Explicit Host transfer UI
- Redis Socket.IO adapter
- Multiple backend instances
- Room moderation tools
- Chat moderation
- Reactions
- Video queue / playlist
- Watch history
- User profiles
- Improved reconnection handling
- Rate limiting

These are intentionally outside the current MVP scope.

---

# Project Structure

    yt-wp/
    │
    ├── client/
    │   ├── public/
    │   ├── src/
    │   │   ├── assets/
    │   │   │
    │   │   ├── components/
    │   │   │   ├── CreateRoom.jsx
    │   │   │   ├── JoinRoom.jsx
    │   │   │   ├── Room.jsx
    │   │   │   └── VideoPlayer.jsx
    │   │   │
    │   │   ├── App.css
    │   │   ├── App.jsx
    │   │   ├── Index.css
    │   │   ├── main.jsx
    │   │   └── socket.js
    │   │
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
    │   │
    │   ├── package.json
    │   └── package-lock.json
    │
    ├── .gitignore
    ├── package.json
    └── README.md

---

# Assessment Requirements

The project was developed around the required Watch Party functionality:

- Real-time synchronization
- Room-based model
- YouTube integration
- WebSockets
- Role-based access control
- Host role management
- Participant management
- Playback restrictions
- Play/pause synchronization
- Seek synchronization
- Video change synchronization
- Basic chat
- Production deployment

The final deployment will provide a publicly accessible URL where the core room, role, and playback functionality can be tested.

---

# Technology Stack

## Frontend

- React
- Vite
- JavaScript
- CSS

## Backend

- Node.js
- Express

## Real-Time Communication

- Socket.IO

## Video

- YouTube IFrame Player API

## Storage

- In-memory JavaScript object

## Deployment

- Render
- Node.js production server
- Vite production build

---

# Status

Current development status:

    Room Creation              ✓
    Room Joining               ✓
    Participant List           ✓
    Host Role                  ✓
    Moderator Role             ✓
    Participant Role           ✓
    Role Assignment            ✓
    Role Enforcement            ✓
    Remove Participant         ✓
    Play Synchronization       ✓
    Pause Synchronization      ✓
    Seek Synchronization       ✓
    Change Video               ✓
    YouTube Integration        ✓
    Chat                       ✓
    Host Transfer              In progress / verification
    Browser Refresh Recovery   In progress
    Join-Time Position Sync    In progress
    README                     ✓
    Production Build           Pending
    Production Deployment      Pending
    Final Live Testing         Pending

---

# Final Development Checklist

Before considering the project complete:

- [ ] Verify browser refresh recovery for Host
- [ ] Verify browser refresh recovery for Moderator
- [ ] Verify browser refresh recovery for Participant
- [ ] Implement/finalize join-time playback position synchronization
- [ ] Verify Host transfer behavior
- [ ] Test all RBAC restrictions
- [ ] Test playback synchronization with multiple browsers
- [ ] Test Chat with multiple users
- [ ] Create production build
- [ ] Deploy backend/frontend
- [ ] Verify Socket.IO in production
- [ ] Test the live application
- [ ] Add final live URL to this README
- [ ] Push final version to GitHub

---

# License

MIT License