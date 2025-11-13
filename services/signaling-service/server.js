// Simple WebSocket signaling bridge:
// Browser connects -> sends JSON control messages -> server forwards to TCP Helper.
// Helper side: run existing remotebt_helper.exe as --server. We connect to it via TCP.
// This is a minimal stepping stone toward full signaling.

import "dotenv/config";
import { WebSocketServer } from "ws";
import net from "net";
import jwt from "jsonwebtoken";
import express from "express";
import http from "http";
import { v4 as uuidv4 } from "uuid";

// Prefer WS_PORT/SIGNING_SECRET but remain backward-compatible with SIGNALING_* names used in infra .env
const WS_PORT = process.env.WS_PORT
  ? parseInt(process.env.WS_PORT, 10)
  : process.env.SIGNALING_PORT
  ? parseInt(process.env.SIGNALING_PORT, 10)
  : 8081;
const SIGNING_SECRET =
  process.env.SIGNING_SECRET ||
  process.env.SIGNALING_JWT_SECRET ||
  "dev-signing-secret";
const HELPER_HOST = process.env.HELPER_HOST || "0.0.0.0";
const HELPER_PORT = process.env.HELPER_PORT
  ? parseInt(process.env.HELPER_PORT, 10)
  : 5555;
const HELPER_TOKEN = process.env.HELPER_TOKEN || "dev-secret";
const COMPAT_SERVER_AUTH = process.env.HELPER_COMPAT_SERVER_AUTH !== "0"; // default on for compatibility

// Maintain one TCP connection to helper (inbound from helper/agent)
let helperSocket = null;
let helperReady = false;
let pendingQueue = [];

// TCP server that accepts a single helper connection
const helperServer = net.createServer((socket) => {
  if (helperSocket) {
    console.warn("[helper] rejecting extra connection (already connected)");
    try {
      socket.end();
    } catch (_) {}
    return;
  }
  console.log("[helper] inbound connected");
  helperSocket = socket;
  helperReady = false;
  broadcastHelperReady();

  // Wait for helper to send AUTH within a short timeout; if not received, drop the connection.
  let authTimer = setTimeout(() => {
    if (!helperReady) {
      console.error("[helper] AUTH not received within timeout; closing");
      try {
        socket.end();
      } catch (_) {}
    }
  }, Math.max(3000, parseInt(process.env.HELPER_AUTH_TIMEOUT || "5000", 10)));

  // Compatibility path: some older helpers expect the server to initiate AUTH.
  if (COMPAT_SERVER_AUTH) {
    try {
      socket.write(`AUTH ${HELPER_TOKEN}\n`);
    } catch (_) {}
  }

  let bufAcc = Buffer.alloc(0);
  let frameExpect = -1; // expecting N bytes of base64
  // Clipboard line buffer (simple lines 'CLIP <base64>') handled like GEOM

  socket.on("data", (chunk) => {
    bufAcc = Buffer.concat([bufAcc, chunk]);
    while (true) {
      if (frameExpect >= 0) {
        if (bufAcc.length >= frameExpect + 1) {
          // payload + trailing \n
          const payload = bufAcc.subarray(0, frameExpect).toString("utf8");
          const nl = bufAcc[frameExpect];
          bufAcc = bufAcc.subarray(frameExpect + 1);
          // broadcast frame to all WS clients
          const msg = JSON.stringify({
            type: "frame",
            mime: "image/png",
            data: payload,
          });
          for (const client of wss.clients) {
            try {
              client.send(msg);
            } catch (_) {}
          }
          frameExpect = -1;
          continue;
        } else {
          break;
        }
      }
      const nlIdx = bufAcc.indexOf(0x0a); // \n
      if (nlIdx === -1) break;
      const line = bufAcc
        .subarray(0, nlIdx)
        .toString("utf8")
        .replace(/\r$/, "");
      bufAcc = bufAcc.subarray(nlIdx + 1);

      if (line.startsWith("AUTH ")) {
        const parts = line.split(" ");
        const token = parts[1] || "";
        // Accept either HELPER_TOKEN (legacy) or hostToken (starts with "host_")
        if (token === HELPER_TOKEN || token.startsWith("host_")) {
          console.log("[helper] AUTH ok");
          if (!helperReady) {
            helperReady = true;
            try {
              clearTimeout(authTimer);
            } catch (_) {}
            broadcastHelperReady();
            // flush any pending commands
            for (const l of pendingQueue) {
              try {
                helperSocket.write(l);
              } catch (_) {}
            }
            pendingQueue = [];
          }
        } else {
          console.error("[helper] AUTH failed; closing");
          try {
            socket.end();
          } catch (_) {}
        }
      } else if (/^OK\s+auth$/i.test(line)) {
        // Older helper replies with 'OK auth' after we sent AUTH <token>
        console.log("[helper] AUTH confirmed by helper");
        if (!helperReady) {
          helperReady = true;
          try {
            clearTimeout(authTimer);
          } catch (_) {}
          broadcastHelperReady();
          for (const l of pendingQueue) {
            try {
              helperSocket.write(l);
            } catch (_) {}
          }
          pendingQueue = [];
        }
      } else if (line.startsWith("FRAME ")) {
        const parts = line.split(" ");
        const n = parseInt(parts[1] || "0", 10);
        frameExpect = n > 0 ? n : -1;
      } else if (line.startsWith("GEOM ")) {
        // Geometry metadata: GEOM originX originY width height
        const parts = line.split(" ");
        if (parts.length >= 5) {
          const gx = parseInt(parts[1], 10);
          const gy = parseInt(parts[2], 10);
          const gw = parseInt(parts[3], 10);
          const gh = parseInt(parts[4], 10);
          const msg = JSON.stringify({
            type: "geom",
            originX: gx,
            originY: gy,
            width: gw,
            height: gh,
          });
          for (const client of wss.clients) {
            try {
              client.send(msg);
            } catch (_) {}
          }
        }
      } else if (line.startsWith("CLIP ")) {
        const b64 = line.substring(5).trim();
        let text = "";
        try {
          text = Buffer.from(b64, "base64").toString("utf8");
        } catch (_) {}
        const msg = JSON.stringify({ type: "clip", text, base64: b64 });
        for (const client of wss.clients) {
          try {
            client.send(msg);
          } catch (_) {}
        }
      } else {
        // ignore other lines
      }
    }
  });

  socket.on("error", (err) => {
    console.error("[helper] error", err.message);
  });
  socket.on("close", () => {
    console.log("[helper] disconnected");
    helperSocket = null;
    if (helperReady) {
      helperReady = false;
      broadcastHelperReady();
    }
  });
});

helperServer.listen(HELPER_PORT, HELPER_HOST, () => {
  console.log(`[helper] listening on ${HELPER_HOST}:${HELPER_PORT}`);
});

// HTTP + WS on the same port
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST");
    return res.sendStatus(200);
  }
  next();
});

// Simple health endpoint for troubleshooting
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    wsPort: WS_PORT,
    helperReady,
    helperHost: HELPER_HOST,
    helperPort: HELPER_PORT,
  });
});

// Session endpoint: mint short-lived JWT and return ws URL
app.post("/session", (req, res) => {
  const sessionId = (req.body && req.body.sessionId) || uuidv4();
  const ttl = Math.max(
    60,
    Math.min(600, parseInt(process.env.SESSION_TTL || "300", 10))
  );
  const token = jwt.sign({ sessionId }, SIGNING_SECRET, {
    algorithm: "HS256",
    expiresIn: ttl,
    issuer: "signaling",
    subject: sessionId,
  });
  // Auto-detect WebSocket protocol based on request
  const isSecure =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    req.headers["x-forwarded-ssl"] === "on" ||
    process.env.FORCE_WSS === "1";
  const scheme = isSecure ? "wss" : "ws";
  
  // Determine host:port for client-facing WS URL
  let host =
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    `localhost:${WS_PORT}`;
  // If forwarded host is missing an explicit port, append the public port
  if (!host.includes(":")) {
    // Try to infer from PUBLIC_BASE_URL or fall back to 8444 for https / WS_PORT for http
    let inferredPort = undefined;
    try {
      if (process.env.PUBLIC_BASE_URL) {
        const u = new URL(process.env.PUBLIC_BASE_URL);
        inferredPort = u.port;
      }
    } catch (_) {}
    if (!inferredPort) inferredPort = isSecure ? "8444" : String(WS_PORT);
    host = `${host}:${inferredPort}`;
  }

  const wsUrl = `${scheme}://${host}/ws/?token=${token}`;
  res.json({ sessionId, token, wsUrl, helperReady });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
server.listen(WS_PORT, () => console.log(`[http+ws] listening on ${WS_PORT}`));

function toHelper(cmd) {
  const line = cmd.endsWith("\n") ? cmd : cmd + "\n";
  try {
    console.log("[to-helper]", line.trim());
  } catch (_) {}
  if (helperReady && helperSocket) {
    helperSocket.write(line);
  } else {
    pendingQueue.push(line);
  }
}

wss.on("connection", (ws, req) => {
  // Expect token in query string: ws://host:port?token=...
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");
  if (!token) {
    ws.close(4001, "missing token");
    return;
  }
  try {
    const payload = jwt.verify(token, SIGNING_SECRET);
    ws._session = payload.sessionId || payload.sub || "unknown";
  } catch (e) {
    ws.close(4003, "invalid token");
    return;
  }
  console.log("[ws] client connected");
  ws.send(JSON.stringify({ type: "welcome", helperReady }));
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (msg.type === "move") {
      toHelper(`MOVE ${msg.x || 0} ${msg.y || 0}`);
    } else if (msg.type === "click") {
      toHelper(`CLICK ${msg.button || "left"}`);
    } else if (msg.type === "type") {
      try {
        console.log("[ws] type", msg.text);
      } catch (_) {}
      toHelper(`TYPE ${msg.text || ""}`);
    } else if (msg.type === "key") {
      try {
        console.log("[ws] key", msg.combo || msg.key);
      } catch (_) {}
      toHelper(`KEY ${msg.combo || msg.key || "Enter"}`);
    } else if (msg.type === "keyDown") {
      const k = msg.key || "";
      try {
        console.log("[ws] keyDown", k);
      } catch (_) {}
      toHelper(`KEYDOWN ${k}`);
    } else if (msg.type === "keyUp") {
      const k = msg.key || "";
      try {
        console.log("[ws] keyUp", k);
      } catch (_) {}
      toHelper(`KEYUP ${k}`);
    } else if (msg.type === "scroll") {
      toHelper(`SCROLL ${msg.delta || 120}`);
    } else if (msg.type === "capture") {
      const on = msg.on !== false;
      const interval = Math.max(
        100,
        Math.min(2000, parseInt(msg.interval || "500", 10))
      );
      if (on) toHelper(`CAPTURE ON ${interval}`);
      else toHelper("CAPTURE OFF");
    } else if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    } else if (msg.type === "clipGet") {
      toHelper("CLIPGET");
    } else if (msg.type === "clipSet") {
      const text = msg.text || "";
      const b64 = Buffer.from(text, "utf8").toString("base64");
      toHelper(`CLIPSET ${b64}`);
    }
  });
});

function broadcastHelperReady() {
  const payload = JSON.stringify({ type: "helperReady", helperReady });
  for (const client of wss.clients) {
    try {
      client.send(payload);
    } catch (_) {}
  }
}

process.on("SIGINT", () => {
  console.log("Shutting down");
  wss.close();
  if (helperSocket) helperSocket.end();
});
