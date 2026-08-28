import { useEffect, useRef } from "react";

export function extractVideoId(input) {
  if (!input) return null;
  const str = input.trim();
  try {
    const url = new URL(str);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/embed/")[1] || null;
      return url.searchParams.get("v") || null;
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  }
  return null;
}

function loadYouTubeScript() {
  if (window.YT || document.getElementById("yt-iframe-script")) return;
  const tag = document.createElement("script");
  tag.id = "yt-iframe-script";
  tag.src = "https://www.youtube.com/iframe_api";
  document.body.appendChild(tag);
}

const PLAYER_DIV_ID = "yt-player";

export default function VideoPlayer({ videoId, controls = true, playerRef, suppressRef }) {
  // playerRef and suppressRef are passed in from Room.jsx so the parent
  // can call player methods and set the suppress flag directly.

  useEffect(() => {
    loadYouTubeScript();

    function initPlayer() {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(PLAYER_DIV_ID, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: controls ? 1 : 0,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => console.log("[YT] Player ready"),

          onStateChange: (event) => {
            // ── Infinite loop prevention ──────────────────────────────────
            // When we receive a server event (play/pause/seek) we call
            // player.playVideo() / player.pauseVideo() programmatically.
            // That call fires onStateChange just like a user click would.
            // Without this flag we would emit back to the server, which
            // would broadcast again, which would call playVideo() again...
            //
            // Solution: before every programmatic player call, set
            // suppressRef.current = true. Here we check it and if true,
            // we clear it and return — swallowing the event silently.
            if (suppressRef.current) {
              suppressRef.current = false;
              return;
            }
            // ─────────────────────────────────────────────────────────────

            // This was a genuine user action — let Room.jsx handle it
            // via the onStateChange prop would add complexity, so instead
            // we dispatch a custom DOM event that Room.jsx listens for.
            const detail = { state: event.data };
            window.dispatchEvent(new CustomEvent("yt-state-change", { detail }));
          },

          onError: (e) => console.error("[YT] error", e.data),
        },
      });
    }

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  return (
    <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
      <div id={PLAYER_DIV_ID} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}