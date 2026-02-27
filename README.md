# CollabCode — Backend

Production-grade real-time collaboration backend built with Express, Prisma, and Socket.io.

This repository contains the backend API and real-time engine for CollabCode — a collaborative coding platform where developers create rooms, edit code simultaneously, and communicate through integrated chat.

> **Frontend Repository:** [CollabCode UI](https://github.com/Adityaranaa01/CollabCode-Frontend)

---

## Architecture Overview

CollabCode backend is a monolithic Express service with:

- **REST API** — Express with TypeScript
- **WebSocket Server** — Socket.io for real-time collaboration
- **Database** — PostgreSQL on NeonDB via Prisma ORM
- **Authentication** — JWT-based dual-token system
- **Plan Enforcement** — Subscription-tier resource limits
- **Concurrency** — Optimistic version-check model

No microservices. No serverless functions. No third-party auth providers.
Built intentionally as a production-style monolith.

---

## Authentication System

Dual-token architecture with security-first design:

| Token | Lifetime | Storage | Transport |
|-------|----------|---------|-----------|
| Access Token | 15 min | In-memory (frontend) | `Authorization` header |
| Refresh Token | 7 days | HTTP-only cookie | Cookie (auto-sent) |

- Refresh token **rotation** on every use
- **Reuse detection** — revokes all sessions on stolen token replay
- Tokens stored as **SHA-256 hashes** in the database
- **Constant-time hash comparison** to prevent timing attacks
- Plan-based **max active session** enforcement

---

## Database Schema

Fully normalized relational schema with 8 models:

| Model | Purpose |
|-------|---------|
| `SubscriptionPlan` | Defines resource limits per plan tier |
| `User` | Auth credentials, profile, plan reference |
| `Room` | Collaborative coding session |
| `RoomMembership` | User-room join table with roles (OWNER / MEMBER) |
| `RoomInvite` | Hashed invite tokens for private rooms |
| `CodeDocument` | Persisted document state (content + version) |
| `Message` | Chat messages within rooms |
| `RefreshToken` | Hashed refresh tokens with expiration |

Owner is also inserted into `RoomMembership` for consistent authorization logic across all queries.

---

## Real-Time Collaboration Engine

```
Client → room:join  → validate membership → lazy-load document → send snapshot
Client → room:edit  → version check → apply patch → broadcast → debounced persist
Client → room:chat  → rate limit → insert to DB → broadcast
Disconnect → cleanup presence → persist if empty → free memory
```

- Socket.io with **JWT handshake authentication**
- **Membership validation** on every room join
- **Lazy in-memory document loading** (only active rooms held in memory)
- **Optimistic concurrency** — version check, full resync on mismatch
- **Debounced persistence** — 2.5s per-room, immediate on last disconnect
- **Chat rate limiting** — 5 messages/sec per user
- **Patch size cap** — 50KB max

No CRDT — intentional architectural tradeoff for simplicity at the target scale (2–5 users per room).

---

## Plan Enforcement

Resource limits enforced server-side via subscription plans:

| Limit | Scope | FREE Plan Default |
|-------|-------|-------------------|
| `maxRooms` | Rooms a user can own | 3 |
| `maxMembersPerRoom` | Members per owned room | 5 |
| `maxJoinedRooms` | Total rooms a user can join | 10 |
| `chatRetentionDays` | Message retention period | 7 days |
| `maxActiveSessions` | Concurrent login sessions | Unlimited |

All limits checked inside **Prisma transactions** with **row-level locks** to prevent race conditions.

---

## Security

- **bcrypt** password hashing (12 rounds)
- **Helmet** middleware for security headers
- **Rate limiting** on auth endpoints (10 req/min per IP)
- **Zod** input validation on all endpoints
- **Strict CORS** — only configured frontend origin allowed
- **HTTP-only, Secure, SameSite=Strict** cookies
- **Payload size caps** on WebSocket messages
- **Constant-time comparison** for token hashes

---

## Scaling Strategy

**Current:** Single-process, in-memory active room store.

**Scaling Path:**

1. Add **Socket.io Redis adapter** for cross-server event broadcasting
2. Configure **sticky sessions** so each room's state lives on one server
3. Move to **Redis-backed document store** for fully stateless servers
4. Extract into a **dedicated collaboration service** (long-term)

---

## Folder Structure

```
src/
 ├── config/         # Environment validation
 ├── controllers/    # Request handlers
 ├── middleware/      # Auth, validation, error handling
 ├── routes/         # Express route definitions
 ├── services/       # Business logic
 ├── sockets/        # Socket.io handlers + room store
 ├── types/          # TypeScript interfaces
 ├── utils/          # Prisma client, JWT, hashing, errors
 ├── app.ts          # Express app configuration
 └── server.ts       # HTTP server + Socket.io init
prisma/
 └── schema.prisma   # Database schema
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Rotate tokens |
| POST | `/api/v1/auth/logout` | Logout current session |
| POST | `/api/v1/auth/logout-all` | Revoke all sessions |
| GET | `/api/v1/auth/me` | Get current user |

### Rooms

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/rooms` | Create room |
| GET | `/api/v1/rooms/dashboard` | Owned + joined + public rooms |
| GET | `/api/v1/rooms/:id` | Get room details |
| DELETE | `/api/v1/rooms/:id` | Delete room (owner only) |
| POST | `/api/v1/rooms/:id/join` | Join public room |
| POST | `/api/v1/rooms/:id/invite` | Create invite (owner only) |
| POST | `/api/v1/rooms/join-by-invite` | Join via invite token |
| GET | `/api/v1/rooms/:id/members` | List members |
| DELETE | `/api/v1/rooms/:id/members/:userId` | Remove member (owner only) |
| GET | `/api/v1/rooms/:id/messages` | List messages (paginated) |

### Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `room:join` | Client → Server | Join room, receive snapshot |
| `room:joined` | Server → Client | Document + version + participants |
| `room:edit` | Bidirectional | Send/receive document patches |
| `room:resync` | Server → Client | Full snapshot on version mismatch |
| `room:chat` | Client → Server | Send chat message |
| `room:new-message` | Server → Room | Broadcast chat message |
| `room:presence` | Server → Room | Updated participant list |
| `room:cursor-update` | Server → Room | Cursor position broadcast |

---

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Create a `.env` file:

```env
DATABASE_URL=
JWT_SECRET=
REFRESH_TOKEN_SECRET=
CLIENT_URL=http://localhost:3000
PORT=4000
```

---

## Built With

- [Express](https://expressjs.com/) — HTTP framework
- [Socket.io](https://socket.io/) — Real-time engine
- [Prisma](https://www.prisma.io/) — Type-safe ORM
- [PostgreSQL](https://www.postgresql.org/) — Relational database
- [NeonDB](https://neon.tech/) — Serverless PostgreSQL
- [Zod](https://zod.dev/) — Schema validation
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js) — Password hashing
- [Helmet](https://helmetjs.github.io/) — Security headers