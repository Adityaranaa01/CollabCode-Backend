# Phase 3 — Room & Membership System

Extend the existing room infrastructure with invite-based joins, plan limit enforcement, and a dashboard endpoint.

## Existing State

Most of the room system already exists:
- [createRoom](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#15-36) — transaction with Room + CodeDocument + OWNER membership, enforces `maxRooms`
- [joinRoom](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#155-207) — public room join with `FOR UPDATE` row lock, enforces `maxMembersPerRoom`
- [removeMember](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#103-122), [deleteRoom](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#123-141), [getMyRooms](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#93-125), [getPublicRooms](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#126-154), [getRoomMembers](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#142-154)

## What Needs to Change

### 1. Schema Changes

#### [MODIFY] [schema.prisma](file:///c:/Users/adity/Projects/collabcode-backend/prisma/schema.prisma)

**Add `RoomInvite` model:**
```prisma
model RoomInvite {
  id         String   @id @default(cuid())
  roomId     String
  tokenHash  String
  expiresAt  DateTime
  createdBy  String
  createdAt  DateTime @default(now())

  room       Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  creator    User     @relation(fields: [createdBy], references: [id], onDelete: Cascade)

  @@index([roomId])
  @@index([expiresAt])
  @@map("room_invites")
}
```

**Add `maxJoinedRooms` to `SubscriptionPlan`** (for enforcing how many rooms a user can join).

**Add relations** to [Room](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts#37-49) and [User](file:///c:/Users/adity/Projects/collabcode-ui/src/lib/api.ts#49-63) for `RoomInvite`.

**Remove decorative dividers** from schema while we're here.

---

### 2. Service Changes

#### [MODIFY] [room.service.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts)

- **Harden [joinRoom](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#155-207)**: add `maxJoinedRooms` check on the joining user's plan before inserting membership.
- **Add `createInvite`**: verify owner role, generate random token via `crypto.randomBytes`, hash with SHA-256, store `RoomInvite`, return raw token. Invite expires in 7 days.
- **Add `joinByInvite`**: receive raw token, hash it, look up `RoomInvite` by hash, validate expiry, enforce both `maxMembersPerRoom` (owner plan) and `maxJoinedRooms` (joiner plan), insert membership in transaction.
- **Add `getDashboard`**: return `{ ownedRooms, joinedRooms, publicRooms }`. Public rooms exclude those the user is already a member of. Paginated.

---

### 3. Controller Changes

#### [MODIFY] [room.controller.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/room.controller.ts)

- Add `createInvite` handler
- Add `joinByInvite` handler
- Replace [getMyRooms](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#93-125) + [getPublicRooms](file:///c:/Users/adity/Projects/collabcode-backend/src/services/room.service.ts#126-154) with a unified `getDashboard` handler (keep existing as-is if still needed, add new)

---

### 4. Route Changes

#### [MODIFY] [room.routes.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/routes/room.routes.ts)

New routes:
| Method | Path | Handler |
|--------|------|---------|
| POST | `/:id/invite` | `createInvite` |
| POST | `/join-by-invite` | `joinByInvite` |
| GET | `/dashboard` | `getDashboard` |

---

### 5. Type and Schema Cleanup

#### [MODIFY] [types/index.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/types/index.ts)

No new types needed — existing types cover the return shapes.

## Verification Plan

### Automated Tests
- `npx prisma migrate dev` — migration runs clean
- `npx tsc --noEmit` — zero TypeScript errors
