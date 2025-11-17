let ws;
let imgNaturalW = 1920,
  imgNaturalH = 1080;
let originX = 0,
  originY = 0;
let lastMoveTs = 0;
let lastWsUrl = "";
let kbOn = false;
const downSet = new Set();
let cachedRect = null;
let pingStart = 0;
let pingInterval = null;
// Invalidate cached rect on window resize and scroll
window.addEventListener("resize", () => {
  cachedRect = null;
});
window.addEventListener(
  "scroll",
  () => {
    cachedRect = null;
  },
  true
); // Use capture phase to catch all scroll events
let logCount = 0;

// Auto-detect host and port from APP_CONFIG if available
window.addEventListener("DOMContentLoaded", () => {
  if (typeof APP_CONFIG !== "undefined" && APP_CONFIG.BASE_URL) {
    try {
      const url = new URL(APP_CONFIG.BASE_URL);
      document.getElementById("sigHost").value = url.hostname;
      document.getElementById("sigPort").value =
        url.port || (url.protocol === "https:" ? "443" : "80");
    } catch (e) {
      console.warn("Failed to parse APP_CONFIG.BASE_URL", e);
    }
  }
});
function log(msg, cls) {
  const verbose = document.getElementById("verbose");
  if (!verbose.checked) {
    // Chỉ giữ lại các sự kiện quan trọng khi tắt verbose
    if (
      !/^session|^WS open|^WS closed|^health|^geom|^ERROR|^<< \{\"type\":\"welcome|^<< \{\"type\":\"helperReady/.test(
        msg
      ) &&
      !/KEY|type|click|move/.test(msg)
    ) {
    }
  }
  const el = document.getElementById("log");
  const d = document.createElement("div");
  d.textContent = msg;
  if (cls) d.className = cls;
  el.appendChild(d);
  logCount++;
  // Trim nếu quá nhiều
  if (logCount > 500) {
    while (el.firstChild && logCount > 400) {
      el.removeChild(el.firstChild);
      logCount--;
    }
  }
  el.scrollTop = el.scrollHeight;
}
function setStatus(t, ok) {
  const s = document.getElementById("status");
  s.textContent = t;
  s.className = ok ? "ok" : "err";
}
function setHelper(ready) {
  const h = document.getElementById("helper");
  h.textContent = "helper: " + (ready ? "ready" : "not ready");
  h.className = ready ? "ok" : "err";
}
function send(obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
    // Removed verbose log: log(">> " + JSON.stringify(obj));
  } else {
    log("WS not connected", "err");
  }
}
function scaledXY(evt) {
  const img = document.getElementById("preview");
  if (!cachedRect) {
    cachedRect = img.getBoundingClientRect();
  }
  const r = cachedRect;
  const x = Math.max(0, Math.min(evt.clientX - r.left, r.width));
  const y = Math.max(0, Math.min(evt.clientY - r.top, r.height));
  const sx = Math.round(x * (imgNaturalW / r.width)) + originX;
  const sy = Math.round(y * (imgNaturalH / r.height)) + originY;
  return { x: sx, y: sy };
}

async function createSession() {
  const host =
    document.getElementById("sigHost").value.trim() || window.location.hostname;
  const port =
    document.getElementById("sigPort").value.trim() ||
    window.location.port ||
    (window.location.protocol === "https:" ? "443" : "80");
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const url = `${protocol}//${host}${
    port && port !== "80" && port !== "443" ? ":" + port : ""
  }/session`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    const { wsUrl, token, sessionId, helperReady } = await r.json();
    log(
      "session created: " + sessionId + " (helperReady=" + helperReady + ")",
      "ok"
    );
    setHelper(!!helperReady);
    lastWsUrl = wsUrl;
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      setStatus("connected", true);
      log("WS open -> " + wsUrl, "ok");
      // Start ping interval for latency monitoring
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === 1) {
          pingStart = Date.now();
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 2000); // Ping every 2 seconds
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "frame" && m.data) {
          const img = document.getElementById("preview");
          // Support both JPEG (new helper) and PNG (old helper)
          const mimeType = m.mime || "image/png"; // Default to PNG for backward compatibility
          img.src = `data:${mimeType};base64,` + m.data;
          img.onload = () => {
            // Use resolution from message if available (downscaled), otherwise from image natural size
            imgNaturalW = m.width || img.naturalWidth;
            imgNaturalH = m.height || img.naturalHeight;
            cachedRect = null; // Force recalculation on next mouse event
            // Show preview when first frame arrives
            img.style.display = "block";
          };
        } else if (m.type === "welcome") {
          setHelper(!!m.helperReady);
        } else if (m.type === "helperReady") {
          setHelper(!!m.helperReady);
        } else if (m.type === "geom") {
          imgNaturalW = m.width;
          imgNaturalH = m.height;
          originX = m.originX || 0;
          originY = m.originY || 0;
          log(
            "geom: " +
              m.width +
              "x" +
              m.height +
              " origin (" +
              originX +
              "," +
              originY +
              ")",
            "ok"
          );
        } else if (m.type === "clip") {
          const ta = document.getElementById("clipText");
          ta.value = m.text || "";
          log("clip update len=" + (m.text ? m.text.length : 0), "ok");
        } else if (m.type === "pong") {
          const latency = Date.now() - pingStart;
          const pingEl = document.getElementById("ping");
          pingEl.textContent = `Ping: ${latency}ms`;
          // Color-code based on latency
          if (latency < 50) {
            pingEl.style.color = "#34d399"; // green
          } else if (latency < 150) {
            pingEl.style.color = "#fbbf24"; // yellow
          } else {
            pingEl.style.color = "#f87171"; // red
          }
        }
      } catch (_) {
        /* non-JSON */
      }
      // Removed verbose log: log("<< " + (typeof ev.data === "string" ? ev.data : "[binary]"));
    };
    ws.onclose = () => {
      setStatus("closed", false);
      log("WS closed");
      document.getElementById("btnReconnect").style.display = "inline-block";
      // Clear ping interval and reset display
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      document.getElementById("ping").textContent = "";
    };
    ws.onerror = (e) => {
      setStatus("error", false);
      log("WS error", "err");
      document.getElementById("btnReconnect").style.display = "inline-block";
      // Clear ping interval on error
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      document.getElementById("ping").textContent = "";
    };
  } catch (e) {
    setStatus("session failed", false);
    log("session error: " + e.message, "err");
  }
}
document.getElementById("btnSession").onclick = createSession;
document.getElementById("btnClear").onclick = () => {
  const el = document.getElementById("log");
  el.textContent = "";
  logCount = 0;
};
document.getElementById("btnReconnect").onclick = () => {
  if (!lastWsUrl) {
    log("No previous wsUrl", "err");
    return;
  }
  try {
    ws = new WebSocket(lastWsUrl);
    document.getElementById("btnReconnect").style.display = "none";
    log("reconnecting ws ...");
  } catch (e) {
    log("reconnect failed: " + e.message, "err");
  }
};
document.getElementById("btnHealth").onclick = async () => {
  const host =
    document.getElementById("sigHost").value.trim() || window.location.hostname;
  const port =
    document.getElementById("sigPort").value.trim() ||
    window.location.port ||
    (window.location.protocol === "https:" ? "443" : "80");
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  try {
    const r = await fetch(
      `${protocol}//${host}${
        port && port !== "80" && port !== "443" ? ":" + port : ""
      }/health`
    );
    const j = await r.json();
    log("health: " + JSON.stringify(j), "ok");
    setHelper(j.helperReady);
  } catch (e) {
    log("health error: " + e.message, "err");
  }
};

// Quality slider
const qualitySlider = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
let isCapturing = false;

qualitySlider.oninput = () => {
  qualityValue.textContent = qualitySlider.value;
};

qualitySlider.onchange = () => {
  const q = parseInt(qualitySlider.value);
  send({ type: "quality", quality: q });
  log(`Quality set to ${q}`, "ok");

  // Restart capture để áp dụng quality mới ngay lập tức
  if (isCapturing) {
    send({ type: "capture", on: false });
    setTimeout(() => {
      send({ type: "capture", on: true, interval: +ival.value || 500 });
      log("Capture restarted with new quality", "ok");
    }, 100);
  }
};

// Track capture state
document.getElementById("btnCapOn").onclick = () => {
  isCapturing = true;
  send({ type: "capture", on: true, interval: +ival.value || 500 });
};
document.getElementById("btnCapOff").onclick = () => {
  isCapturing = false;
  send({ type: "capture", on: false });
};

// Keyboard capture
function keyNameFromEvent(e) {
  const k = e.key;
  if (k === " ") {
    return "space";
  }
  if (k === "Control" || k === "Ctrl") {
    return "ctrl";
  }
  if (k === "Alt") {
    return "alt";
  }
  if (k === "Shift") {
    return "shift";
  }
  if (k === "ArrowLeft") return "left";
  if (k === "ArrowRight") return "right";
  if (k === "ArrowUp") return "up";
  if (k === "ArrowDown") return "down";
  if (k.length === 1) {
    if (/[a-zA-Z]/.test(k)) return k.toUpperCase();
    if (/[0-9]/.test(k)) return k;
  }
  // Common names already covered; fallback to raw key
  return k;
}
function kbDown(e) {
  if (!kbOn) return;
  const name = keyNameFromEvent(e);
  if (!name) return;
  if (downSet.has(name) && e.repeat) {
    e.preventDefault();
    return;
  }
  downSet.add(name);
  e.preventDefault();
  send({ type: "keyDown", key: name });
}
function kbUp(e) {
  if (!kbOn) return;
  const name = keyNameFromEvent(e);
  if (!name) return;
  if (downSet.has(name)) downSet.delete(name);
  e.preventDefault();
  send({ type: "keyUp", key: name });
}
document.getElementById("kbToggle").onclick = () => {
  kbOn = !kbOn;
  const s = document.getElementById("kbStatus");
  if (kbOn) {
    window.addEventListener("keydown", kbDown, { capture: true });
    window.addEventListener("keyup", kbUp, { capture: true });
    s.textContent = "capturing";
    s.className = "ok";
    document.getElementById("kbToggle").textContent = "Stop Keyboard Capture";
  } else {
    window.removeEventListener("keydown", kbDown, { capture: true });
    window.removeEventListener("keyup", kbUp, { capture: true });
    s.textContent = "stopped";
    s.className = "";
    downSet.clear();
    document.getElementById("kbToggle").textContent = "Start Keyboard Capture";
  }
};

// Mouse interactions mapped to remote coordinates
(() => {
  const img = document.getElementById("preview");
  img.addEventListener("mousemove", (e) => {
    const now = performance.now();
    if (now - lastMoveTs < 33) return; // 30fps throttle
    lastMoveTs = now;
    const { x, y } = scaledXY(e);
    send({ type: "move", x, y });
  });
  img.addEventListener("click", (e) => {
    const { x, y } = scaledXY(e);
    send({ type: "move", x, y });
    send({ type: "click", button: e.shiftKey ? "right" : "left" });
  });
  // Right mouse button (context menu) wasn't logged before; capture explicitly
  img.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const { x, y } = scaledXY(e);
    send({ type: "move", x, y });
    send({ type: "click", button: "right" });
  });
  img.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -120;
      send({ type: "scroll", delta });
    },
    { passive: false }
  );
})();
