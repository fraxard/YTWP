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
            if (suppressRef.current) {
              suppressRef.current = false;
              return;
            }
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
    <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", position: "relative" }}>
      <div id={PLAYER_DIV_ID} style={{ width: "100%", height: "100%" }} />

      {/* Block all mouse interaction for participants.
          controls=false means this is a participant — overlay a transparent
          div on top of the iframe so clicks never reach the YouTube player.
          The video still plays/pauses from server events because those call
          the JS API directly, not through mouse events. */}
      {!controls && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 10,
          cursor: "not-allowed",
        }} />
      )}
    </div>
  );
}