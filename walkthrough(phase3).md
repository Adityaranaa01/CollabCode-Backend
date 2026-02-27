# Phase 3 — Room & Membership System Walkthrough

## Changes Made

### Schema ([schema.prisma](file:///c:/Users/adity/Projects/collabcode-backend/prisma/schema.prisma))

- **New model `RoomInvite`**: stores hashed invite tokens with expiry, linked to Room and creator User. Indexes on `roomId` and `expiresAt`.
- **New field `maxJoinedRooms`** on `SubscriptionPlan` (default 10, FREE plan = 10).
- Added `invites` relation arrays to [Room](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#37-49) and [User](file:///c:/Users/adity/Projects/collabcode-ui/src/lib/api.ts#49-63).
- Cleaned decorative dividers from schema.

### Service ([room.service.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts))

| Function | Description |
|----------|-------------|
| [createInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#121-151) | Owner-only. Generates 32-byte random token, hashes with SHA-256, stores `RoomInvite` with 7-day expiry. Returns raw token. |
| [joinByInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#152-206) | Hashes incoming token, looks up `RoomInvite`, validates expiry, enforces plan limits, inserts membership in transaction. |
| [getDashboard](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#50-70) | Returns `{ ownedRooms, joinedRooms, publicRooms }`. Public rooms exclude already-joined rooms. Paginated. |
| [enforceJoinLimits](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#358-390) | Extracted helper. Checks `maxJoinedRooms` (joiner plan) + `maxMembersPerRoom` (owner plan). Used in both [joinRoom](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#82-120) and [joinByInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#152-206). |

### Controller ([room.controller.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts))

Added [getDashboard](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#50-70), [createInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#121-151), [joinByInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#152-206) handlers. Replaced separate `getMyRooms`/`getPublicRooms` with unified dashboard.

### Routes ([room.routes.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/routes/room.routes.ts))

| Method | Path | Handler |
|--------|------|---------|
| GET | `/dashboard` | [getDashboard](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#50-70) |
| POST | `/join-by-invite` | [joinByInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#152-206) (Zod validated) |
| POST | `/:id/invite` | [createInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#121-151) |

## API Reference

```
All routes require Authorization: Bearer <accessToken>

POST   /api/v1/rooms                  Create room
GET    /api/v1/rooms/dashboard         Dashboard (owned + joined + public)
POST   /api/v1/rooms/join-by-invite    Join via invite { token: string }
GET    /api/v1/rooms/:id               Get room
DELETE /api/v1/rooms/:id               Delete room (owner only)
POST   /api/v1/rooms/:id/join          Join public room
POST   /api/v1/rooms/:id/invite        Create invite (owner only)
GET    /api/v1/rooms/:id/members       List members
DELETE /api/v1/rooms/:id/members/:uid  Remove member (owner only)
GET    /api/v1/rooms/:id/messages      List messages (paginated)
```

## Verification

- `prisma migrate dev` — migration applied clean
- `tsc --noEmit` — zero TypeScript errors
