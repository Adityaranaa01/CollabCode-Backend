🚀 CollabCode — Backend

Production-grade real-time collaboration backend built with Express, Prisma, and Socket.io.

This repository contains the backend API and real-time engine for CollabCode.

The frontend (Next.js 14) is maintained separately:

👉 Frontend Repository:
https://github.com/yourusername/collabcode-ui

🏗️ Architecture Overview

CollabCode backend is a monolithic service with:

REST API (Express)

WebSocket server (Socket.io)

PostgreSQL database (Neon)

Prisma ORM

JWT-based authentication

Subscription-based plan enforcement

Optimistic concurrency real-time editing

No microservices.
No serverless functions.
No third-party auth providers.

Built intentionally as a production-style monolith.

🔐 Authentication System

Dual-token architecture:

Access Token (15m, JWT, sent via Authorization header)

Refresh Token (7d, HTTP-only cookie)

Refresh token rotation

Reuse detection (token theft mitigation)

Hashed refresh tokens stored in DB

Plan-based max active session enforcement

Security-first design.

🧩 Core Models

SubscriptionPlan

User

Room

RoomMembership

RoomInvite

CodeDocument

Message

RefreshToken

Fully normalized relational schema.

Owner is inserted into RoomMembership for consistent authorization logic.

⚡ Real-Time Collaboration Engine

Socket.io with JWT handshake auth

Membership validation on room join

Lazy in-memory document loading

Optimistic concurrency (version check)

Full snapshot persistence

Per-room debounce (2.5s)

Immediate flush on last disconnect

Chat rate limiting (5 messages/sec)

No CRDT (intentional tradeoff).

🧠 Concurrency Model

Version-based optimistic concurrency

Full resync on version mismatch

Row-level locking for room joins

Prisma transactions for atomic operations

Designed for small-to-medium collaborative groups (2–5 users per room).

📈 Scaling Strategy

Current:

Single process

In-memory active room store

Scaling Path:

Socket.io Redis adapter

Sticky sessions

Redis-backed document store

Dedicated collaboration service (future evolution)

🛡 Security Measures

Bcrypt password hashing

Helmet middleware

Rate limiting on auth endpoints

Refresh token hashing

Constant-time hash comparison

Strict CORS configuration

Payload size caps

📦 Folder Structure
src/
 ├── config/
 ├── controllers/
 ├── services/
 ├── routes/
 ├── middlewares/
 ├── sockets/
 ├── utils/
 └── server.ts
🚀 Getting Started
npm install
npx prisma migrate dev
npm run dev

Create .env:

DATABASE_URL=
JWT_SECRET=
REFRESH_TOKEN_SECRET=
CLIENT_URL=
🎯 Why This Project Matters

This backend demonstrates:

Production-grade JWT rotation

Secure invite system

Plan-based access enforcement

Optimistic concurrency design

WebSocket lifecycle management

Failure mode analysis

Scaling awareness

Built as a system design-focused resume project.