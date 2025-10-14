# Product Requirements Document (PRD)

## Project: Ephemeral Remote Control --- Secure On-Demand Access

**Version:** 1.1 \| **Stage:** Commercial MVP \| **Date:** Oct 2025

## 1. Architecture & Technology

### 1.1 Overview

The Ephemeral Remote Control system enables temporary, secure remote
desktop sessions without installing any persistent agents. A customer
downloads a lightweight helper, runs it, grants consent, and instantly
connects with an operator through a WebRTC session. The session
auto-expires after completion, leaving no residual background service.

For deployment, the control plane follows a microservices architecture
packaged as Docker containers. This enables repeatable builds,
independent scaling (e.g., signaling vs. audit ingestion), and
environment parity across dev/stage/prod.

### 1.2 Architecture Diagram (Conceptual)

    [ Operator Web Portal ] <-> [ Signaling Server (WSS) ] <-> [ Ephemeral Helper ]
              |                                           |
          WebRTC DataChannel + MediaStream <-> TURN Server (coturn)

### 1.3 Components

---

Component Description Tech Stack

---

**Web Portal Browser-based dashboard Next.js / React /
(Operator)** for initiating remote TypeScript, WebRTC,
sessions, viewing desktop DataChannel API
stream, and sending  
 control commands.

**Signaling Server** Handles SDP/ICE exchange, Node.js, Express,
session authentication, WebSocket (socket.io)
and token validation.

**TURN Server** Relays encrypted media coturn (TLS, REST
streams when P2P fails credentials)
(NAT traversal).

**Ephemeral Helper Lightweight executable Rust or C++
(Target)** launched by the user. (libwebrtc), Win32 API,
Captures screen, connects Desktop Duplication
via WebRTC, injects API, auto self-delete
keyboard/mouse events  
 using native APIs.

**Packaging & One-click signed NSIS / MSI with
Distribution** executable or installer Authenticode EV
with EV code-signing  
 certificate.

**Telemetry & Audit Collects session metadata OpenTelemetry, ELK
(optional)** (start/end time, operator Stack
ID, actions, IP).

---

### 1.4 Communication Flow

1.  Operator creates a session → Signaling server issues a short-lived
    JWT and sessionId.
2.  User downloads & runs helper with sessionId/token → connects to WSS.
3.  SDP/ICE exchange → WebRTC PeerConnection established.
4.  Screen stream → operator, control events → helper.
5.  On session termination or timeout → helper auto-closes and securely
    deletes itself.

### 1.5 Security Layers

- TLS/WSS enforced across all channels.
- DTLS-SRTP encryption for WebRTC media and data.
- JWT tokens (≤5 min validity) + per-session HMAC.
- No persistent agent or registry entries --- fully ephemeral runtime.
- Container image hardening: minimal base images, non-root users,
  SBOMs, and image signing/verification.
- Service-to-service auth: mTLS within the cluster or signed JWT
  between microservices.

### 1.6 Deployment & Microservices (Docker)

- Control plane services are stateless, containerized (Docker images)
  and can be scaled independently.
- Suggested services: Web Portal, Signaling (WSS), Auth (JWT), Session
  (lifecycle/expiry), Audit/Telemetry.
- Service communication over REST/gRPC in a private network; only Web
  Portal, Signaling, and TURN expose public endpoints.
- CI/CD builds signed images with pinned base layers and publishes to
  a private registry.

## 2. Core Features

---

Category Feature Description

---

**Session Management** One-click session Operator generates
creation temporary link + token for
the user.

                         Session expiry       Helper auto-terminates
                                              after X minutes of
                                              inactivity or upon
                                              disconnect.

**Screen Sharing** Desktop capture Uses Desktop Duplication
(multi-monitor API for high-performance
aware) capture.

                         Dynamic quality      Adaptive bitrate,
                         adjustment           resolution, and FPS based
                                              on network conditions.

**Remote Control** Mouse & keyboard Native SendInput with
injection DPI-correct coordinates;
supports modifier keys and
scroll.

                         Clipboard sync       Text-only clipboard sharing
                         (optional)           with user consent.

                         File transfer        Secure, per-session
                         (optional)           upload/download; optional
                                              encryption layer.

**Consent & UX** Consent dialog Clear prompt listing
operator name, duration,
and allowed capabilities.

                         Persistent overlay   "You are being controlled
                                              by {Operator}" + Stop
                                              button always visible.

                         Black screen mode    Optional privacy mode to
                                              hide sensitive content.

**Security & Privacy** Code-signed helper EV-signed binaries to
prevent spoofing or AV
warnings.

                         Session audit log    Record start/end time,
                                              operator ID, critical
                                              actions (no raw
                                              keystrokes).

                         Auto self-delete     Helper removes itself after
                                              session ends, leaving no
                                              traces.

**DevOps & Delivery** Containerized All control plane services
services are shipped as Docker
images with pinned base
layers.

                         Environment parity    Same images run in dev,
                         via Docker            staging, and prod.

                         Independent scaling   Microservices can scale
                         of microservices      individually based on
                                              usage (e.g., signaling vs
                                              audit ingestion).

---

## 3. Non-Functional Requirements

---

Area Requirement Target / Standard

---

**Performance** Screen latency \< 250 ms average round-trip
under 50 ms network RTT

                        Frame rate               30 fps default, 60 fps when
                                                 bandwidth \> 5 Mbps

**Scalability** Concurrent sessions ≥ 200 active sessions per
signaling node

                        TURN relay load          Support 1 Gbps aggregate
                                                 throughput

                        Microservice scaling     Horizontal auto-scaling per
                                                 service with p95 CPU < 70% and
                                                 latency SLOs held under load.

**Reliability** Auto reconnection ICE restart within 3 seconds
after packet loss \> 5 %

                        Rollout strategy         Blue/Green or Canary releases
                                                 for containerized services; cap
                                                 error budget burn rate at 2x SLO.

**Security** Encryption DTLS 1.2 / SRTP AES-128-GCM, TLS
1.3 everywhere

                        Token lifetime           ≤ 5 min; bound to session and IP
                                                 fingerprint

                        Container security       Signed images, vulnerability
                                                 scans in CI, non-root runtime,
                                                 read-only filesystems.

**Compliance** Privacy GDPR-compliant consent + explicit
opt-out mechanism

                        Logging                  Audit logs retained ≤ 30 days
                                                 (configurable)

**Maintainability** Codebase Modular architecture, CI/CD
pipeline with SCA & linting

                        Service boundaries       Clear API contracts (OpenAPI or
                                                 protobuf), versioned and
                                                 backward-compatible changes.

**Portability** Platforms Windows 10+, macOS 13+, Linux
(Ubuntu 20+)

                        Runtime                  Docker Engine 24+; optional
                                                 orchestrator (Kubernetes or
                                                 Docker Swarm) in production.

**Packaging** Distribution Single binary ≤ 25 MB, EV
code-signed, checksum published

                        Images                   Docker images < 300 MB per
                                                 service; pinned digests.

**Usability** Setup time \< 15 s download-and-run
experience

**Localization** Multi-language English (v1), Vietnamese/Japanese
(v2 roadmap)

---

## 4. Risks & Security Considerations

### 4.1 Technical Risks

---

Risk Description Mitigation

---

**Code spoofing / Unsigned or tampered helper EV code-signing, checksum
malware could trick users. verification on download.
impersonation**

**UAC & Input injection blocked in Request elevation only with
permission elevated apps. explicit consent; show UAC
issues** prompt.

**NAT traversal Some enterprise firewalls Deploy multi-region TURN
failure** block UDP/WebRTC. (TLS 443 fallback).

**Bandwidth Poor network may affect Adaptive bitrate + packet
degradation** usability. prioritization for control
events.

**Container Image bloat and cold-start Use minimal distroless/alpine
overhead** overhead under scale. images, pre-warm pools,
and enable HTTP/2 & keep-alives.

**Service Cross-service latency or Establish SLOs, circuit
decomposition** cascading failures. breakers, retries with backoff,
and bulkheads.

---

### 4.2 Security Risks

---

Risk Description Mitigation

---

**Unauthorized Token leakage or reuse. Short-lived JWT, token
access** bound to helper
fingerprint.

**Privacy Operator sees private Overlay & Stop button,
violation** content. black-screen mode, audit
recording.

**Replay or Forged DataChannel HMAC-signed message
tampering** messages. envelope + sequence
counters.

**Abuse / Remote control used without Mandatory consent dialog,
misuse** consent. legal terms acceptance.

**Supply chain Compromised base images or Image signing (Sigstore/cosign),
risk** transitive vulnerabilities. vulnerability scanning in CI,
and regular patch cadence.

---

### 4.3 Legal & Compliance

- GDPR / CCPA: explicit consent, user control, and data minimization.
- Data residency: EU and APAC TURN/signaling nodes hosted in-region.
- Audit & forensics: secure session metadata only, no raw screen or
  keystroke recording.
- License compliance: WebRTC (BSD), coturn (MIT), internal components
  under proprietary EULA.

**Summary:**\
The Ephemeral Remote Control system delivers secure, lightweight,
zero-installation remote access --- ideal for enterprise IT support and
privacy-conscious environments. The design is technically feasible,
commercially scalable, and compliant with modern security standards.
