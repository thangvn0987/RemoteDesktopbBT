# RemoteDesktopbBT

web remote desktop by Bao &amp; Thang

## Project Structure

```
RemoteDesktopbBT/
├─ frontend/
│  └─ web/
│     ├─ Dockerfile
│     └─ README.md
├─ services/
│  ├─ signaling-service/
│  │  ├─ Dockerfile
│  │  └─ README.md
│  ├─ auth-service/
│  │  ├─ Dockerfile
│  │  └─ README.md
│  ├─ session-service/
│  │  ├─ Dockerfile
│  │  └─ README.md
│  └─ audit-service/
│     ├─ Dockerfile
│     └─ README.md
├─ helper/
│  └─ README.md
├─ infra/
│  └─ docker/
│     ├─ docker-compose.yml
│     └─ .env.example
├─ Ephemeral_Remote_Control_Prd.md
├─ README.md
└─ .gitignore
```

## Quick Start (Docker Compose)

1. Copy env file:

```
copy infra\docker\.env.example infra\docker\.env
```

2. Start services (from `infra/docker`):

```
cd infra\docker && docker compose up --build
- signaling (8080)
- auth (8081)
- session (8082)
- audit (8083)
The helper now supports an outbound `--agent` mode designed for Internet scenarios where the controlled machine cannot expose inbound ports.

Modes:

* `--agent` (recommended): helper initiates a TCP connection to the signaling service. After connecting it sends `AUTH <token>` and waits for control commands (MOVE / CLICK / TYPE / KEY / SCROLL / CAPTURE). No firewall port-forwarding is needed on the helper side.
* `--server` (legacy): helper listens locally on a TCP port (default 5555) and a separate component connects to it. Useful for quick LAN tests only.
* `--client`: developer utility that connects and lets you type raw protocol commands interactively (or run a demo script with `--demo`).

Example outbound usage (helper machine):

```

remotebt_helper.exe --agent --host <SIGNALING_HOST_IP> --port 5555 --token <shared-secret>

```

On the signaling side, it now listens for a single helper connection on `HELPER_HOST:HELPER_PORT` (default `0.0.0.0:5555`). Once connected and authenticated it broadcasts `helperReady` to WebSocket clients and begins relaying frames and control commands.

Environment variables (signaling):

| Name | Purpose |
|------|---------|
| HELPER_HOST | Bind host for inbound helper (default 0.0.0.0) |
| HELPER_PORT | TCP port for inbound helper (default 5555) |
| HELPER_TOKEN | Shared secret the helper sends in AUTH line |

Security note: move the shared token to a secure secret store / rotate for production and prefer a future mTLS channel. JWT still gates browser WS access; the helper token gates low-level control.
```
