# Phase 3 & 4 — Walkthrough

## Phase 3: Room & Membership System

### Schema Changes
- **`RoomInvite` model**: [id](file:///c:/Users/adity/Projects/collabcode-backend/src/middleware/validate.ts#7-27), `roomId`, `tokenHash`, `expiresAt`, `createdBy`, indexes on `roomId` + `expiresAt`
- **`maxJoinedRooms`** added to `SubscriptionPlan` (FREE = 10)

### New Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/rooms/dashboard` | Owned + joined + public rooms |
| `POST` | `/api/v1/rooms/:id/invite` | Owner creates invite |
| `POST` | `/api/v1/rooms/join-by-invite` | Join via `{ token }` |

### Key Behaviors
- [createInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#90-108): 32-byte random token, SHA-256 hash stored, 7-day expiry
- [joinByInvite](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#109-128): hash lookup, expiry check, plan limit enforcement in transaction
- [enforceJoinLimits](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#358-390): shared helper checks `maxJoinedRooms` + `maxMembersPerRoom`
- [getDashboard](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#261-322): public rooms exclude already-joined, cursor-paginated

---

## Phase 4: Real-Time Collaboration System

### Files Created/Modified

| File | Role |
|------|------|
| [room-store.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/sockets/room-store.ts) | In-memory `activeRooms` Map, lazy-load, debounced persistence |
| [room.handler.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/sockets/room.handler.ts) | Join/leave/chat with presence + rate limiting |
| [editor.handler.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/sockets/editor.handler.ts) | Optimistic concurrency edit flow |
| [index.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/sockets/index.ts) | Disconnect cleanup across all rooms |

### Architecture

```
Client → room:join → validate membership → lazy-load document → send snapshot + participants
Client → room:edit → version check → apply patch → broadcast → schedule debounced persist
Client → room:chat → rate limit check → insert to DB → broadcast
Disconnect → remove from presence → broadcast → if empty: persist + unload
```

### Socket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `room:join` | Client→Server | `roomId` |
| `room:joined` | Server→Client | `{ roomId, document, version, participants }` |
| `room:presence` | Server→Room | `{ participants }` |
| `room:edit` | Both | `{ roomId, patch, version, userId? }` |
| `room:resync` | Server→Client | `{ roomId, document, version }` (on version mismatch) |
| `room:chat` | Client→Server | `{ roomId, content }` |
| `room:new-message` | Server→Room | Full message object |
| `room:cursor-update` | Server→Room | `{ userId, cursor }` |

### Security
- JWT verified on every socket connection
- Membership validated on room join
- Presence map checked before edits
- Patch size capped at 50KB
- Chat rate limited: 5 messages/sec per user
- Document persisted on room empty, not on every keystroke

### Verification
- `prisma migrate dev` — clean  
- `tsc --noEmit` — zero errors
