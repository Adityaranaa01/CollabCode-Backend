# CollabCode Backend — Walkthrough

## Phase 2: Authentication Architecture

### What Changed

| File | Change |
|------|--------|
| [schema.prisma](file:///c:/Users/adity/Projects/collabcode-backend/prisma/schema.prisma) | Added `maxActiveSessions` to `SubscriptionPlan`, removed `revokedAt` + `@unique` from [RefreshToken](file:///c:/Users/adity/Projects/collabcode-backend/src/utils/jwt.ts#57-63) (hard deletes now) |
| [hash.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/utils/hash.ts) | Added [safeCompare()](file:///c:/Users/adity/Projects/collabcode-backend/src/utils/hash.ts#29-37) using `crypto.timingSafeEqual` |
| [jwt.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/utils/jwt.ts) | Refresh payload now `{ sub, tokenId }`, added [getRefreshTokenExpiryMs()](file:///c:/Users/adity/Projects/collabcode-backend/src/utils/jwt.ts#75-78) |
| [auth.service.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/services/auth.service.ts) | Full auth rewrite (see flows below) |
| [auth.controller.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/controllers/auth.controller.ts) | Cookie helpers, [logoutAll](file:///c:/Users/adity/Projects/collabcode-backend/src/services/auth.service.ts#178-183) endpoint, clear cookie on refresh failure |
| [auth.routes.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/routes/auth.routes.ts) | Added `POST /logout-all` (protected) |
| [server.ts](file:///c:/Users/adity/Projects/collabcode-backend/src/server.ts) | Hourly background cleanup of expired refresh tokens |

### Auth Flows

**Login/Register:**
1. Validate input (Zod) → compare password (bcrypt)
2. Fetch user's plan → check `maxActiveSessions`
3. If session limit reached → delete all existing tokens for user
4. Create [RefreshToken](file:///c:/Users/adity/Projects/collabcode-backend/src/utils/jwt.ts#57-63) DB record (placeholder hash)
5. Sign refresh JWT with `{ sub: userId, tokenId: record.id }`
6. Hash the JWT → update DB record with hash
7. Sign access JWT → return `{ accessToken }` in JSON + refresh token in HTTP-only cookie

**Refresh (rotation):**
1. Extract JWT from cookie → verify signature
2. Lookup DB record by `tokenId` → constant-time compare hash
3. If record missing → **reuse detected** → delete ALL user tokens → 401
4. If hash mismatch → delete ALL user tokens → 401
5. If valid → delete old record → issue new pair

**Logout:** Delete token by `tokenId`, clear cookie
**Logout All:** Delete all tokens for user (`POST /auth/logout-all`, requires access token)

### Security Measures
- `crypto.timingSafeEqual` for token hash comparison
- Refresh tokens are JWTs but hashed (SHA-256) before DB storage
- `express-rate-limit` on login (10 req/min)
- Cookie: `httpOnly`, `secure` (prod), `sameSite: strict`, scoped to `/api/v1/auth`
- `helmet` middleware for security headers

### Verification

| Check | Result |
|-------|--------|
| `npx prisma generate` | ✅ Client regenerated with `maxActiveSessions` |
| `npx tsc --noEmit` | ✅ Zero errors |

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | — | Register + issue tokens |
| POST | `/api/v1/auth/login` | — | Login + issue tokens |
| POST | `/api/v1/auth/refresh` | Cookie | Rotate tokens |
| POST | `/api/v1/auth/logout` | Cookie | Logout current session |
| POST | `/api/v1/auth/logout-all` | Bearer | Logout all sessions |
| GET | `/api/v1/auth/me` | Bearer | Get user profile + plan |
