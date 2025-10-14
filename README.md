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
```

This will build placeholder images for:

- web-portal (3000)
- signaling (8080)
- auth (8081)
- session (8082)
- audit (8083)

Note: These are placeholders. Replace with real app code as you implement.
