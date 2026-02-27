# CollabCode — Backend Architecture Handbook

---

## 1. Product Vision and Design Philosophy

### 1.1 What Is CollabCode

CollabCode is a real-time collaborative coding platform. Users create coding rooms, invite collaborators, edit code simultaneously, and communicate through integrated chat. The platform operates under a subscription model where plan tiers govern resource limits such as room count, member capacity, session concurrency, and chat retention.

This is not a toy project. Every decision — from token rotation to debounced persistence — was made with production reasoning. The goal is not feature completeness for its own sake, but structural integrity that can be defended under technical scrutiny.

### 1.2 Why Separate Backend and Frontend Repositories

The backend exists as a standalone Node.js Express application, entirely separate from the Next.js frontend. This was a deliberate architectural choice rather than a convenience shortcut.

Next.js API routes execute within the same process as the SSR rendering pipeline. This creates coupling between frontend deployment cycles and backend deployment cycles. When the backend needs a database migration, a schema change, or a socket server restart, there is no reason the frontend should be affected. Separate repositories enforce that boundary at the infrastructure level, not just at the code level.

More critically, CollabCode uses Socket.io for persistent WebSocket connections. Socket.io requires a long-lived HTTP server that maintains connection state in memory. Next.js API routes are designed around the request-response cycle — they spin up, handle a request, and return. They are fundamentally incompatible with the statefulness that WebSocket connections demand. Serverless deployment targets (Vercel, for example) would silently drop WebSocket connections or fail to maintain them. A standalone Express server with an attached HTTP server gives full control over the connection lifecycle.

The alternative of using a monorepo with shared workspace tooling (Turborepo, Nx) was considered and rejected. Monorepos introduce tooling complexity that offers no value when the two codebases share zero runtime code. The backend is TypeScript with Express, Prisma, and Socket.io. The frontend is TypeScript with React and Next.js. They communicate through a well-defined HTTP and WebSocket API. Sharing types between them could be achieved through a published package or even a simple shared types file, but that does not justify the overhead of monorepo tooling.

### 1.3 Why Express Over Other Frameworks

Express was chosen for its maturity, ecosystem depth, and middleware composability. The middleware pipeline — where authentication, validation, rate limiting, and error handling are composed as discrete, reusable functions — maps cleanly to the concerns of a SaaS backend.

Fastify was considered for its superior performance characteristics. However, the performance difference between Express and Fastify becomes meaningful only at thousands of requests per second on a single process. CollabCode's bottleneck will be database queries and WebSocket message throughput long before Express's routing overhead matters. The marginal performance gain does not justify adopting a less familiar framework with a smaller middleware ecosystem.

NestJS was also considered. It provides strong architectural opinions through dependency injection and decorators. However, NestJS introduces significant abstraction overhead and a learning curve that is disproportionate to the complexity of this application. CollabCode has a flat service layer — authentication, rooms, messages — that does not benefit from NestJS's module system. The added abstraction would obscure the actual program flow without providing meaningful structural benefits.

### 1.4 Why Prisma as the ORM

Prisma was selected for three reasons: type safety, migration management, and developer experience.

Prisma generates TypeScript types directly from the database schema. When the schema defines that a SubscriptionPlan has maxRooms as an integer, every query that touches that field gets compile-time type checking. This eliminates an entire class of runtime errors where a field name is misspelled or a relationship is traversed incorrectly.

Prisma's migration system generates SQL migration files from schema diffs. Each migration is a versioned, reviewable SQL file. This is important for production environments where migrations need to be audited, rolled back, and applied in a specific order. The alternative — writing raw SQL migrations manually — is error-prone and lacks the schema-to-migration diffing that Prisma provides automatically.

The alternative of using a query builder like Knex.js or Kysely was considered. These offer more control over generated SQL but lack the schema-first development model that Prisma provides. With Knex, the developer writes migrations and queries separately, with no compile-time guarantee that they are consistent. Prisma's single-source-of-truth schema eliminates that inconsistency.

Drizzle ORM is a newer alternative that was considered. Drizzle provides a TypeScript-first schema definition with better query composition than Prisma. However, Drizzle's ecosystem is less mature, its documentation is less comprehensive, and its migration tooling is less battle-tested.

### 1.5 Why PostgreSQL on NeonDB

PostgreSQL was chosen for its robust support for ACID transactions, row-level locking, and complex queries. CollabCode's room membership system requires transactions that span multiple table inserts — creating a room, a code document, and an owner membership record atomically. PostgreSQL handles this natively.

NeonDB provides a serverless PostgreSQL offering with branching, autoscaling, and generous free-tier limits. The alternative of running a self-hosted PostgreSQL instance on a VPS was rejected because it introduces operational overhead — backup management, connection pooling configuration, security patching — that is irrelevant to the application's architectural concerns.

MongoDB was explicitly rejected. CollabCode's data model is fundamentally relational. Rooms have owners (users), memberships connect users to rooms with roles, messages belong to rooms and users, and subscription plans govern user capabilities through foreign key relationships. Modeling these relationships in MongoDB would require either embedding (which creates data duplication) or manual reference management (which recreates foreign keys without the database enforcing them). PostgreSQL enforces these relationships at the database level, making invalid states unrepresentable.

### 1.6 Why No Supabase

Supabase provides a PostgreSQL database with a REST API, authentication, and real-time subscriptions out of the box. It was considered and rejected for two reasons.

First, Supabase's authentication system is opaque. It manages JWTs, refresh tokens, and sessions internally. CollabCode's authentication system implements refresh token rotation with reuse detection — a security measure that requires control over the token lifecycle. Supabase's auth system does not expose this level of control.

Second, Supabase's real-time system uses PostgreSQL's LISTEN/NOTIFY mechanism to push changes to clients. This works well for data change notifications but does not support the bidirectional, low-latency communication that collaborative editing requires. CollabCode needs to broadcast document patches to all connected clients within milliseconds. Socket.io, with its in-memory event routing, is fundamentally better suited to this use case than database-backed change propagation.

### 1.7 Why No CRDT

Conflict-free Replicated Data Types are the gold standard for real-time collaborative editing. Libraries like Yjs and Automerge implement CRDTs that allow concurrent edits to be merged without conflicts, without a central server, and without version conflicts.

CollabCode explicitly does not use CRDTs. This is a considered tradeoff, not an oversight.

CRDTs introduce significant complexity in the data model. A CRDT document is not a string — it is a directed acyclic graph of operation nodes with vector clocks that track causality. Persisting a CRDT to a database requires serializing this graph structure, which is opaque and non-queryable. You cannot run a SQL query against a CRDT document to search for content.

CRDTs also increase client-side complexity. The frontend must include a CRDT library (Yjs is approximately 30KB minified), must understand the CRDT update protocol, and must maintain a local replica of the document state. This is a meaningful increase in frontend bundle size and cognitive complexity.

CollabCode instead uses optimistic concurrency with version checking. Each edit carries a version number. If the server's version matches the client's version, the edit is applied and the version increments. If the versions diverge, the server sends a full resync — the complete document content and the current version. The client replaces its local state and continues.

This model has a clear limitation: if two users edit the same document simultaneously and their edits arrive at the server in the same event loop tick, one of them will receive a resync. In practice, this is acceptable for the target use case. CollabCode rooms typically have two to five collaborators. At this scale, simultaneous conflicting edits are infrequent. When they occur, the resync is imperceptible — the client receives the full document (which already includes the other user's changes) and the user continues typing.

The tradeoff is explicit: CollabCode sacrifices theoretical conflict-free convergence for practical simplicity. If the product scaled to Google Docs-level concurrent editing (hundreds of simultaneous editors), CRDTs would be necessary. At the current target scale, they are unnecessary complexity.

---

## 2. Authentication Architecture

### 2.1 The Dual-Token Model

CollabCode uses a dual-token authentication system: short-lived access tokens and long-lived refresh tokens.

The access token is a JSON Web Token signed with a secret key. It has a 15-minute expiration. The frontend stores it in memory (a React state variable) and includes it in the Authorization header of every API request. It carries the user's ID and email as claims.

The refresh token is also a JWT, signed with a different secret key. It has a 7-day expiration. The backend sets it as an HTTP-only cookie on the auth path. The frontend never sees, reads, or manipulates this token directly — the browser automatically includes it in requests to the auth endpoints because of the cookie path scope.

The reason for using two tokens instead of one is security compartmentalization. The access token is visible to JavaScript (it must be, since it's sent in the Authorization header). If a cross-site scripting (XSS) vulnerability exists in the frontend, an attacker could steal the access token from memory. However, the access token expires in 15 minutes, limiting the window of exploitation. The refresh token, stored as an HTTP-only cookie, is invisible to JavaScript. An XSS attack cannot steal it. The attacker would need to exploit a cross-site request forgery (CSRF) vulnerability to use it, which is mitigated by the SameSite=Strict cookie attribute.

The alternative of using a single long-lived token (stored in a cookie or localStorage) was rejected. A single long-lived token that gets stolen gives the attacker persistent access. With the dual-token model, even if the access token is stolen, it expires in 15 minutes. The attacker cannot renew it without the refresh token cookie.

### 2.2 Why In-Memory Token Storage

The access token is stored in a React state variable, not in localStorage or sessionStorage.

localStorage persists across browser sessions and is accessible to any JavaScript running on the same origin. If an XSS vulnerability exists, localStorage is trivially readable. sessionStorage is cleared when the tab closes, which is better, but is still accessible to JavaScript.

In-memory storage (a variable in the React component tree) is not accessible through the DOM or through storage APIs. An XSS attack would need to specifically target the React component's internal state, which is significantly more difficult than reading localStorage.

The tradeoff is that in-memory storage does not persist across page refreshes. When the user refreshes the page, the access token is lost. The application handles this by calling the refresh endpoint on mount — the browser automatically sends the HTTP-only refresh token cookie, and the server returns a new access token. This creates a brief loading state on page load, but the delay is typically under 200 milliseconds.

### 2.3 Refresh Token Rotation and Reuse Detection

Every time a refresh token is used, it is deleted from the database and a new one is issued. This is refresh token rotation.

The security reasoning is as follows. If an attacker somehow obtains a refresh token (through a man-in-the-middle attack, server-side log exposure, or other means), they can use it to get access tokens. Without rotation, this stolen token remains valid for its full 7-day lifetime. With rotation, the stolen token becomes invalid as soon as the legitimate user refreshes their session — the server deletes the old token and issues a new one.

Rotation alone is not sufficient. Consider this scenario: an attacker steals a refresh token and uses it before the legitimate user does. The attacker receives a new token pair, and the old token is deleted. When the legitimate user tries to refresh, their token is not found in the database. This is the reuse detection signal.

When a refresh token is presented that does not exist in the database, the system assumes token theft has occurred. It responds by deleting all refresh tokens for that user, effectively logging them out of all sessions. This is a nuclear response, but it is the correct one — if token theft is suspected, there is no way to know which session is the attacker and which is the legitimate user. Revoking all sessions forces the attacker to re-authenticate (which they cannot do without the password) and forces the legitimate user to re-authenticate (which they can, since they know their password).

The alternative of using opaque refresh tokens (random strings) instead of JWTs was considered. Opaque tokens have the advantage of being unreadable without database access — they don't carry claims. However, JWTs for refresh tokens allow the server to extract the user ID and token record ID without a database query (the claims are embedded in the token). This enables a fast-path for token validation: verify the JWT signature (CPU-only, no database), extract the token record ID, look up the single record (indexed primary key lookup), and compare hashes. With opaque tokens, the server would need to hash the token and search for the hash — which is either a full table scan or requires an index on an opaque hash column.

### 2.4 Token Hashing Strategy

Refresh tokens are stored in the database as SHA-256 hashes, not as raw JWTs. This is a defense-in-depth measure.

If the database is compromised (through SQL injection, a backup leak, or unauthorized access), the attacker obtains token hashes, not tokens. SHA-256 is a one-way function — the attacker cannot derive the original JWT from the hash. They cannot use the hashes to authenticate.

Token hash comparison uses a constant-time comparison function built on Node.js's crypto.timingSafeEqual. Standard string equality comparison (using the === operator) short-circuits on the first mismatched character, which means faster responses for strings that differ early and slower responses for strings that differ late. An attacker can use this timing difference to guess the hash one character at a time. Constant-time comparison eliminates this timing side-channel.

### 2.5 Plan-Based Session Enforcement

Each subscription plan defines a maxActiveSessions value. When a user logs in or registers, the system counts their active refresh tokens (those with expiration dates in the future). If the count exceeds the plan limit, all existing sessions are deleted before the new session is created.

For the FREE plan, maxActiveSessions is set to zero, which means unlimited. This may seem counterintuitive — why would the free plan have unlimited sessions? The reasoning is that session limits are primarily a security feature for enterprise plans, where administrators want to ensure that credentials are not shared across teams. Free users are not a security risk in this context, and restricting their sessions would create friction without meaningful benefit.

If a plan has maxActiveSessions set to one, the system deletes all existing tokens before creating a new one. This effectively enforces single-session behavior — logging in on a new device logs out all other devices. This is a common requirement for enterprise plans where credential sharing must be prevented.

### 2.6 Cookie Configuration

The refresh token cookie is configured with four security-relevant attributes:

HttpOnly prevents JavaScript from reading the cookie. This is the primary defense against XSS attacks stealing the refresh token.

Secure ensures the cookie is only sent over HTTPS connections (in production). This prevents network-level interception.

SameSite=Strict prevents the browser from sending the cookie on cross-origin requests. This mitigates CSRF attacks — an attacker who tricks the user into visiting a malicious site cannot cause the browser to send the refresh token cookie to the CollabCode backend.

Path=/api/v1/auth scopes the cookie to only be sent on requests to the authentication endpoints. The cookie is not sent on requests to room endpoints, health checks, or any other paths. This minimizes the surface area — even if a vulnerability exists in a non-auth endpoint, the refresh token cookie is never present on those requests.

### 2.7 Background Token Cleanup

An hourly background job runs on the server that deletes all expired refresh tokens from the database. This is a hygiene measure.

Expired tokens are functionally dead — the JWT signature verification would reject them based on the expiration claim. However, leaving them in the database increases the table size over time, slowing down queries. The cleanup job keeps the table lean.

The cleanup runs as a setInterval on the server process, not as a separate cron job or worker process. This is appropriate for a single-server deployment. If the application scaled to multiple server instances, the cleanup would need to be extracted into a dedicated worker or cron job to avoid redundant execution.

### 2.8 Threat Model Summary

The authentication system is designed to defend against the following threats:

XSS token theft is mitigated by HTTP-only cookies for refresh tokens and short-lived in-memory access tokens. An attacker who achieves XSS can steal the access token but has only 15 minutes to use it, and cannot obtain the refresh token.

CSRF is mitigated by SameSite=Strict cookies. Cross-origin requests do not include the refresh token cookie.

Token replay is mitigated by refresh token rotation. A stolen token becomes invalid after the next refresh.

Token theft detection is implemented through reuse detection. If a deleted token is presented, all sessions are revoked.

Database compromise is mitigated by storing token hashes instead of raw tokens, using constant-time hash comparison.

Brute-force login attempts are mitigated by rate limiting on authentication endpoints (10 requests per minute per IP).

---

## 3. Database Schema Deep Dive

### 3.1 Model Overview

The database contains eight models: SubscriptionPlan, User, Room, RoomMembership, RoomInvite, CodeDocument, Message, and RefreshToken. Each model exists for a specific reason, and the relationships between them encode business logic at the database level.

### 3.2 SubscriptionPlan

The SubscriptionPlan model is the policy definition layer. It defines what a user is allowed to do, not what they have done. Each plan specifies:

maxRooms — the maximum number of rooms a user can own. This limits resource creation, not resource access. A user on the FREE plan can own at most 3 rooms but can be a member of rooms owned by others.

maxMembersPerRoom — the maximum number of members in any room owned by a user on this plan. This is an owner-side constraint, not a joiner-side constraint. When a user tries to join a room, the system checks the room owner's plan, not the joining user's plan.

maxJoinedRooms — the maximum total number of rooms a user can be a member of (including owned rooms). This prevents a single user from joining an excessive number of rooms, which could create resource strain during dashboard queries and socket connection management.

chatRetentionDays — how long messages are retained in rooms owned by a user on this plan. A value of negative one indicates unlimited retention. The retention cleanup runs as a background job that deletes messages older than the retention period for each plan.

maxActiveSessions — the maximum number of concurrent refresh tokens (effectively, concurrent logged-in sessions). A value of zero indicates unlimited.

The decision to model plan limits as a separate table rather than as columns on the User table was deliberate. Plan definitions change infrequently — perhaps when new plan tiers are introduced. User data changes frequently. Separating them means that a plan change (for example, increasing maxRooms for the PRO plan) is a single row update that instantly affects all users on that plan, rather than a batch update across potentially thousands of user rows.

### 3.3 User

The User model stores authentication credentials and profile information. The password is stored as a bcrypt hash with 12 salt rounds. Bcrypt was chosen over alternatives (Argon2, scrypt) for its widespread library support in Node.js and its battle-tested security track record. The 12-round salt factor provides a work time of approximately 250 milliseconds per hash computation on modern hardware, which is sufficient to make brute-force attacks impractical without causing perceptible login delay.

The planId foreign key connects each user to their subscription plan. The onDelete: Restrict policy prevents a plan from being deleted while users are still assigned to it. This is an intentional safety constraint — deleting a plan without reassigning its users would leave those users without plan-defined limits, potentially creating undefined behavior in limit enforcement.

### 3.4 Room

The Room model represents a collaborative coding session. Each room has an owner (the user who created it), a name, a programming language, and a visibility flag (public or private).

The ownerId foreign key with onDelete: Cascade means that deleting a user deletes all rooms they own. This is a deliberate cascading decision — an owned room without an owner is an orphaned resource with no access control authority. The cascade also triggers deletion of all related resources: memberships, messages, code documents, and invites.

The composite index on isPublic and createdAt supports the public room listing query, which filters by visibility and sorts by creation date. Without this index, listing public rooms would require a full table scan with a sort, which degrades as the room count grows.

### 3.5 RoomMembership and the Owner-in-Membership Decision

RoomMembership is a join table that connects users to rooms with a role (OWNER or MEMBER). The model has a unique composite constraint on userId and roomId, preventing duplicate memberships.

A critical design decision is that the room owner is also represented as a RoomMembership record with role OWNER. This was discussed and decided for the following reasons.

First, it simplifies membership queries. When listing all members of a room, the query is a single findMany on RoomMembership. Without owner-in-membership, every member listing would require fetching memberships and then separately fetching the room owner — a join that adds complexity to every query.

Second, it simplifies member-count enforcement. The maxMembersPerRoom limit counts RoomMembership records. If the owner were not in the membership table, the actual occupancy would be one more than the membership count, requiring an off-by-one adjustment in every limit check.

Third, it enables consistent authorization checks. The validateMembership function checks whether a user has a RoomMembership record. If the owner were not in the membership table, the function would need a special case: "is member OR is owner." By including the owner as a member, the function works uniformly.

The tradeoff is that deleting the owner's membership record would create an inconsistent state — a room with an owner (via the ownerId column on Room) but without an owner membership record. The system mitigates this by never allowing the owner to be removed — the removeMember function explicitly rejects requests where targetUserId equals ownerId.

### 3.6 RoomInvite

RoomInvite stores hashed invite tokens for private room access. The tokenHash column stores a SHA-256 hash of the raw invite token. The raw token is returned to the room owner when the invite is created, but is never stored on the server.

This mirrors the refresh token storage strategy: if the database is compromised, the attacker obtains hashes but cannot reconstruct the invite tokens. They cannot use the hashes to join rooms.

The expiresAt column governs invite validity. Expired invites are not automatically cleaned up (unlike refresh tokens), but the join-by-invite flow checks expiration before accepting the invite. A future optimization could add a background cleanup job for expired invites.

The createdBy column tracks which user created the invite, enabling audit trails and potential invite revocation in future versions.

### 3.7 CodeDocument

CodeDocument stores the persistent state of a room's code editor. The one-to-one relationship with Room (enforced by the unique constraint on roomId) ensures that each room has exactly one document.

The content column uses PostgreSQL's TEXT type (via the @db.Text annotation), which supports strings of arbitrary length. The default VARCHAR type has implicit length limitations that could truncate large documents.

The version column is a strictly increasing integer that tracks the number of edits applied to the document. It is the linchpin of the optimistic concurrency system — clients compare their local version against the server's version to detect conflicts.

The updatedAt column is automatically managed by Prisma and tracks the last time the document was persisted to the database. This is useful for debugging and monitoring but is not used in application logic.

### 3.8 Message

Message stores chat messages within rooms. Messages are immutable — once created, they are never updated. This simplifies the data model and eliminates the need for edit history tracking.

The composite index on roomId and createdAt (descending) supports the paginated message retrieval query, which fetches messages for a specific room ordered by most recent first. Without this index, the query would require a full index scan on roomId followed by a sort.

The separate index on createdAt supports the retention cleanup job, which deletes messages older than the plan's retention period across all rooms.

### 3.9 RefreshToken

RefreshToken stores hashed refresh tokens with expiration dates. The relationship to User with onDelete: Cascade ensures that deleting a user automatically revokes all their sessions.

The index on userId supports the "delete all tokens for a user" operation, which occurs during logout-all and during reuse detection.

The index on expiresAt supports the background cleanup job, which deletes expired tokens.

### 3.10 Indexing Strategy

Every index in the schema exists to support a specific query pattern. There are no speculative indexes.

The planId index on User supports the join between users and their subscription plans, which occurs on every login and every plan limit check.

The ownerId index on Room supports listing rooms owned by a specific user (the dashboard query).

The isPublic + createdAt composite index on Room supports paginated public room listing with cursor-based pagination.

The unique composite userId + roomId constraint on RoomMembership is simultaneously a uniqueness constraint and an index. It supports the validateMembership function, which is called on every socket event (room join, edit, chat).

The roomId and userId indexes on RoomMembership support member listing and "rooms for user" queries, respectively.

---

## 4. Room and Plan Enforcement Logic

### 4.1 Room Creation Flow

Room creation is a multi-step operation wrapped in a Prisma transaction.

Before the transaction, the system fetches the user with their plan and a count of rooms they own. If the owned room count equals or exceeds the plan's maxRooms, the request is rejected with a 403 error that includes the plan name and limit in the error message. This provides clear feedback — the user knows which plan they are on and what the limit is.

Inside the transaction, three operations occur atomically: the Room record is created, a CodeDocument record is created (with empty content and version zero), and a RoomMembership record is created with role OWNER. If any of these operations fails, all three are rolled back.

The transaction is necessary because these three records collectively define a valid room. A room without a code document would cause the socket handler to fail when loading the document. A room without an owner membership would cause the access control system to behave incorrectly — the owner would not appear in member listings and would fail membership validation checks.

### 4.2 Public Room Join Flow

Joining a public room is the most concurrency-sensitive operation in the application. Multiple users could attempt to join the same room simultaneously, and the system must enforce the member limit correctly even under concurrent requests.

The join function uses a Prisma interactive transaction with a raw SQL query that includes a FOR UPDATE row-level lock on the room row. This lock prevents other transactions from reading the room row until the current transaction completes. This serializes concurrent join attempts, ensuring that the member count is always accurate when the limit check occurs.

Without the FOR UPDATE lock, the following race condition could occur: User A and User B both check the member count simultaneously (both see 4 members, limit is 5), both pass the limit check, both insert a membership, and the room ends up with 6 members — exceeding the limit. The row lock prevents this by making User B wait until User A's transaction commits.

Inside the lock, the system checks:
1. Whether the user is already a member (preventing duplicate memberships).
2. Whether the room is public (private rooms require an invite).
3. Whether the user has hit their maxJoinedRooms limit based on their own plan.
4. Whether the room has reached maxMembersPerRoom based on the room owner's plan.

The maxJoinedRooms check is on the joining user's plan, not the room owner's plan. This is an important distinction. The question "can this user join more rooms" is about the user's own resource quota. The question "can this room accept more members" is about the room owner's resource quota. Both limits must be satisfied.

### 4.3 Invite Flow

Room invites are designed for private rooms. Only the room owner can create an invite.

When an invite is created, the server generates 32 bytes of cryptographically random data using Node.js's crypto.randomBytes, converts it to a hexadecimal string, and hashes it with SHA-256. The hash is stored in the RoomInvite table; the raw token is returned to the owner. The raw token is 64 characters of hexadecimal — effectively a 256-bit random value. The probability of an attacker guessing a valid invite token is one in 2^256, which is astronomically unlikely.

When a user presents an invite token to join a room, the server hashes the provided token with SHA-256 and searches for a matching RoomInvite record. If found, it checks the expiration, checks the plan limits (both joined rooms for the user and members per room for the owner), and creates a membership.

A critical design decision: invites do not become invalid after a single use. An invite remains valid until its expiration date (7 days after creation). This is intentional — it allows the room owner to share a single invite link with multiple people. If single-use invites were desired, the system would delete the invite record after use. The current design favors convenience for the common case (team invites) over the security-paranoid case (one-time-use invites). If teams needed single-use invites, an additional boolean "single use" field on the invite model would suffice.

### 4.4 Dashboard Aggregation

The dashboard endpoint returns three categories of rooms in a single response: rooms the user owns, rooms the user has joined (but does not own), and public rooms the user has not joined.

The third category is particularly interesting from a query perspective. The system first fetches all room IDs where the user has a membership, collects them into a Set, and then queries public rooms with a NOT IN filter that excludes those IDs. This prevents the dashboard from showing rooms the user is already a member of.

The public rooms section uses cursor-based pagination. The cursor is a timestamp (the createdAt of the last room in the previous page). Cursor-based pagination was chosen over offset-based pagination because offsets perform poorly at scale — an offset of 1000 requires the database to scan and discard 1000 rows before returning results. Cursor-based pagination uses an indexed timestamp comparison, which is consistently fast regardless of the page number.

### 4.5 Transaction Usage Philosophy

Prisma transactions are used only where multi-step writes require atomicity. Single-step writes (like creating a message or deleting a membership) do not use transactions because PostgreSQL already guarantees atomicity for individual statements.

The join-by-invite flow uses a transaction that includes the membership existence check, the plan limit checks, and the membership insert. Without a transaction, a time-of-check to time-of-use (TOCTOU) vulnerability would exist: the system checks the member count (4 out of 5), another request inserts a member (now 5 out of 5), and then the original request inserts another member (now 6 out of 5).

---

## 5. Real-Time Collaboration Architecture

### 5.1 Socket Authentication Model

Every Socket.io connection is authenticated before any event handlers are registered. The authentication middleware extracts the access token from the socket handshake's auth object (set by the client during connection) or from the Authorization header.

The token is verified against the JWT secret. If verification succeeds, the user's ID and email are attached to the socket's data property. If verification fails, the connection is rejected with an error.

This is a one-time check at connection time. The system does not re-verify the JWT on every event. If the access token expires while the socket connection is open, the connection remains valid. This is acceptable because the access token's purpose is to authenticate the initial connection. Once authenticated, the socket connection is trusted for its lifetime. If the server needs to evict a user (for example, after a forced logout), it does so by emitting a disconnect event, not by re-checking the token.

The alternative of re-validating the JWT on every event was considered and rejected. JWT verification involves HMAC signature computation, which, while fast, adds latency to every event in a system where latency is critical. Since the socket connection is persistent, the user's identity does not change during the connection's lifetime.

### 5.2 The ActiveRooms In-Memory Store

The activeRooms store is a Map where each key is a room ID and each value contains the document content (as a string), the current version number, a presence map (userId to socketId), and an optional persistence timeout handle.

Documents are loaded lazily. When the first user joins a room, the system checks if the room exists in activeRooms. If not, it fetches the CodeDocument from the database (or creates one if none exists) and stores it in memory. Subsequent users joining the same room find the document already loaded.

This lazy-loading strategy means that the server's memory footprint is proportional to the number of active rooms (rooms with at least one connected user), not the total number of rooms in the database. A server with 10,000 rooms in the database but only 50 active rooms holds only 50 documents in memory.

The presence map tracks which users are in which rooms and their socket IDs. This enables presence broadcasting — when a user joins or leaves, the updated participant list is sent to all remaining users in the room.

### 5.3 Room Join Flow

When a client emits a "room:join" event, the following sequence occurs:

1. The server validates that the user has a RoomMembership record for the requested room. This database check occurs on every join, not just the first one. A user who has been removed from a room between connections will be correctly rejected.

2. The server calls getOrCreateRoom, which either returns the existing in-memory room or loads it from the database. If the CodeDocument does not exist (which should not happen if room creation is correct, but is handled defensively), it creates one.

3. The user is added to the room's presence map (users Map).

4. The socket joins the Socket.io room channel ("room:" prefixed with the room ID).

5. The server emits "room:joined" to the joining client with the full document snapshot, the current version, and the list of participants. This gives the client everything it needs to initialize the editor and the presence display.

6. The server broadcasts "room:presence" to all other clients in the room with the updated participant list.

The decision to send the full document on join (rather than requiring a separate document request) reduces the number of round-trips and simplifies the client's initialization logic. The client does not need to manage a state machine with "joined but no document," "joined with document," etc.

### 5.4 Optimistic Concurrency and the Version Check

When a client makes an edit, it sends the event with three fields: the room ID, the patch (the full document content after the edit), and the version number the client was at when making the edit.

The server checks whether the client's version matches the server's current version. If they match, the edit is accepted: the server replaces the in-memory document with the patch, increments the version, broadcasts the patch and new version to all other clients, and schedules a debounced persistence.

If the versions do not match, the server emits "room:resync" to the client with the full document content and the current version. The client is expected to replace its local document with the server's version and continue from there.

This is the simplest possible concurrency model that works correctly. It has predictable behavior: every edit either succeeds (version match) or triggers a full resync (version mismatch). There are no partial merges, no conflict resolution heuristics, and no complex state reconciliation.

The tradeoff compared to operational transformation (OT, used by Google Docs) or CRDTs (used by Figma) is that concurrent edits can cause brief disruptions. If User A and User B both edit the document at version 5, one of them (whichever the server processes first) will succeed and increment to version 6. The other will receive a resync. From User B's perspective, their cursor might jump and their most recent keystroke might appear to be "replaced" by the server's version (which includes User A's edit but not User B's).

In practice, with 2-5 collaborators, this happens rarely enough that it is acceptable. The resync is instantaneous — the full document is already in memory on the server and is sent as a single WebSocket message. The user experiences a brief flicker, not a meaningful disruption.

### 5.5 Why Full Snapshot Persistence Instead of Operation Logs

The server persists the full document content to the database, not a log of operations. This is a significant architectural decision.

Operation-log persistence (storing each individual edit as a record) has the advantage of smaller individual writes. But it has severe disadvantages: reconstructing the current document requires replaying all operations from the beginning, the operation log grows without bound, and querying the document content requires materialization.

Full snapshot persistence stores the complete document content as a single database row. The write is larger (potentially the entire document), but the read is trivial (a single row fetch). The document is always in a consistent, readable state. There is no replay, no materialization, and no unbounded log growth.

The debounced persistence further optimizes this. Instead of persisting on every edit (which would generate enormous write pressure), the server waits 2.5 seconds after the last edit before persisting. If the user types 100 characters in rapid succession, that is 100 edits but only one database write. The 2.5-second delay means that in the worst case, 2.5 seconds of edits are lost if the server crashes. This is an acceptable data loss window for a collaborative coding tool — it is equivalent to an auto-save interval.

### 5.6 Debounced Persistence Mechanism

The persistence mechanism uses per-room debounce timers. When an edit is applied, the schedulePersist function is called. If a persistence timeout already exists for that room, it is cleared and a new one is set. The effect is that the persistence callback fires 2.5 seconds after the last edit.

This is fundamentally different from the previous approach of a global periodic flush every 5 seconds. A global flush has two problems: it writes all dirty documents at once (creating a burst of database writes every 5 seconds), and it writes documents that are actively being edited (the 5-second boundary is arbitrary and does not align with edit pauses).

Per-room debounce writes each document individually, 2.5 seconds after its last edit. Documents being actively edited are not written until editing pauses. This aligns persistence with natural typing pauses — when a user pauses to think, the document is persisted.

When the last user disconnects from a room, the system persists immediately (clearing any pending timeout) and removes the room from the activeRooms Map, freeing the memory. This ensures that no edits are lost when a room becomes inactive, regardless of whether the debounce timer has fired.

### 5.7 Chat Rate Limiting

Chat messages are rate-limited to 5 messages per second per user. The rate limiter uses a simple sliding window: each user has a counter and a reset timestamp. When a message is sent, the counter is incremented. If the counter exceeds 5 and the reset timestamp has not passed, the message is rejected with an error.

This prevents chat spam, which could degrade the experience for other users in the room and create unnecessary database write pressure (each chat message is persisted to the Message table).

The rate limit is intentionally per-user, not per-room. A user who is a member of multiple rooms has a single rate limit across all rooms. This prevents a user from flooding multiple rooms simultaneously.

### 5.8 Disconnect Handling and Memory Lifecycle

When a socket disconnects, the server iterates all entries in the activeRooms Map and checks whether the disconnecting user is in each room's presence map. For each room where the user is present, the server removes them from the presence map, broadcasts the updated participant list, and checks whether the room is now empty.

If a room becomes empty (no users in the presence map), the system persists the document immediately and removes the room from the activeRooms Map. This ensures that memory is freed promptly when rooms become inactive, and that no edits are lost.

The iteration over all rooms (rather than maintaining a reverse mapping from users to rooms) is O(n) in the number of active rooms. This is acceptable because the number of active rooms is typically small (tens to hundreds, not thousands).

### 5.9 Security Constraints

Several security measures protect the real-time system:

Membership is validated on room join. A user who is not in the RoomMembership table cannot join a room's socket channel. This is a database check, not a client-side check.

Presence is validated on edit. Before accepting an edit, the server checks that the user is in the room's presence map. This prevents a user who has been kicked from the room (but whose socket connection is still open) from continuing to edit.

Patch size is capped at 50KB. This prevents a malicious client from sending a multi-megabyte patch that would consume server memory. The cap is generous enough for any reasonable code file (50KB is approximately 2,000 lines of code) but aggressive enough to prevent abuse.

Payload structure is validated. The edit handler checks that roomId is a string, patch is a string, and version is a number. Invalid payloads are rejected without processing.

---

## 6. Security Hardening

### 6.1 Rate Limiting

The authentication endpoints (register, login, refresh, logout) are rate-limited to 10 requests per minute per IP address using the express-rate-limit middleware.

This prevents brute-force attacks against the login endpoint. With a 10-request-per-minute limit, an attacker can try at most 10 password guesses per minute per IP. At this rate, cracking even a simple password would take an impractically long time.

The rate limiter returns standard headers (RateLimit-* using draft-6 of the rate limit header specification) and does not return legacy X-RateLimit-* headers. The response body when rate-limited is a structured JSON error, consistent with the API's error format.

### 6.2 Helmet

The Helmet middleware sets various HTTP security headers:

Content-Security-Policy restricts the sources from which the browser can load scripts, styles, images, and other resources. This mitigates XSS attacks by preventing the browser from executing scripts loaded from unauthorized domains.

X-Content-Type-Options: nosniff prevents the browser from interpreting files as a different MIME type than their Content-Type header declares. This prevents MIME type confusion attacks.

X-Frame-Options prevents the page from being rendered in an iframe, mitigating clickjacking attacks.

Strict-Transport-Security (in production) tells browsers to always use HTTPS, preventing downgrade attacks.

### 6.3 Input Validation

All API endpoints validate their inputs using Zod schemas before processing. The validation middleware parses the request body (or query parameters, or path parameters) against a Zod schema and rejects the request with a 400 error if validation fails.

The validation error response includes the specific field paths and error messages, providing actionable feedback to the client. For example, if the password is too short, the error message is "password: Password must be at least 8 characters."

This is a defense-in-depth measure. Even if the frontend performs client-side validation, the backend must not trust it. The frontend could be bypassed entirely — an attacker could send raw HTTP requests to the API. Server-side validation ensures that only well-formed data reaches the business logic layer.

### 6.4 CORS Configuration

Cross-Origin Resource Sharing is configured to allow requests only from the CLIENT_URL (configured via environment variable). The credentials: true flag allows cookies to be sent on cross-origin requests.

This means that only the configured frontend origin can make authenticated requests to the backend. A malicious site on a different origin cannot make API requests (the browser will reject the preflight OPTIONS response).

### 6.5 Error Handling

The error handling middleware distinguishes between operational errors (ApiError instances) and unexpected errors. Operational errors return their status code and message to the client. Unexpected errors return a generic "Internal server error" message with a 500 status code.

In development mode, both error types include the stack trace in the response body, aiding debugging. In production, the stack trace is suppressed to avoid leaking implementation details.

This distinction is important. An ApiError.notFound("Room not found") is an expected condition — the client asked for something that does not exist. The error message is safe to expose. A TypeError or a database connection failure is an unexpected condition — the error message may contain sensitive information (database host names, file paths) and must not be exposed.

---

## 7. Scaling and Failure Mode Analysis

### 7.1 What Breaks First at 10,000 DAU

At 10,000 daily active users, the first bottleneck will be the in-memory activeRooms store.

Each active room holds the full document content in memory. A typical code file is 5-50KB. With 500 active rooms, the memory usage is 2.5-25MB — negligible. With 5,000 active rooms (if half of DAU is in a room at any time), the memory usage is 25-250MB. This is within the limits of a single Node.js process (which typically has a 1.5GB heap limit) but is no longer negligible.

The Socket.io connection count is the second bottleneck. Each connected user maintains a persistent WebSocket connection, which consumes memory (approximately 4-8KB per connection in Socket.io) and a file descriptor. A single Node.js process can handle approximately 10,000-50,000 concurrent WebSocket connections depending on message frequency.

Database queries become a concern at this scale because of the membership validation check, which runs on every room join. This is an indexed lookup (userId + roomId composite unique index), so each individual query is fast (sub-millisecond). But at 10,000 concurrent users joining and leaving rooms, the aggregate query volume becomes significant.

### 7.2 Horizontal Scaling Strategy

The current architecture runs on a single server process. Horizontal scaling (running multiple server instances behind a load balancer) requires addressing the in-memory state problem.

The activeRooms Map is process-local. If User A connects to Server 1 and User B connects to Server 2, they have separate activeRooms Maps. An edit made by User A on Server 1 will not be visible to User B on Server 2.

The standard solution is the Socket.io Redis adapter. The Redis adapter replaces Socket.io's in-memory room and event system with Redis Pub/Sub. When Server 1 broadcasts an event to a room, the message is published to Redis, and all servers subscribed to that room's channel receive it. This enables cross-server event broadcasting without shared memory.

However, the Redis adapter only solves the event broadcasting problem. The activeRooms Map (document content and version) must also be shared across servers. The options are:

1. Sticky sessions: configure the load balancer to route all connections for a given room to the same server. This keeps the activeRooms Map consistent within a single server per room. The limitation is that a single server handles all load for a popular room.

2. Redis-backed document store: replace the in-memory activeRooms Map with Redis. Document reads and writes go through Redis instead of a local Map. This adds latency (network round-trip to Redis) but enables fully stateless servers.

3. Dedicated collaboration server: extract the real-time collaboration logic into a separate service that handles all socket connections, while the REST API runs as separate stateless instances. This is the architecture used by production systems like Figma.

For the current scale target, sticky sessions with the Redis adapter is the most practical approach. It requires minimal code changes and addresses the most common scaling scenarios.

### 7.3 Database Contention Analysis

The room join operation uses a FOR UPDATE row lock, which serializes concurrent joins to the same room. Under high concurrency (dozens of users joining the same room simultaneously), this creates lock contention — each join must wait for the previous one to commit.

In practice, this is rarely a problem. Room joins are infrequent events (users join a room once per session, not once per second). Even a popular room with 50 members being created simultaneously would experience at most a few hundred milliseconds of total lock delay, spread across 50 requests.

If this becomes a bottleneck, the alternative is optimistic locking: attempt the insert without a lock, catch the unique constraint violation if the member count is exceeded, and return an error. This trades correctness guarantees for throughput — in rare cases, the member count could briefly exceed the limit before the constraint violation is caught.

### 7.4 Recovery Behavior on Server Restart

When the server restarts (due to a crash, deployment, or maintenance), all in-memory state is lost. The activeRooms Map is cleared, all socket connections are dropped, and all pending persistence timeouts are cancelled.

The document content that was in memory but not yet persisted is lost. The maximum data loss is the debounce interval (2.5 seconds of edits). When users reconnect, they receive the last persisted version of the document from the database. If User A made an edit at 12:00:01 and the server crashed at 12:00:02 (before the 2.5-second debounce fired), User A's edit is lost. On reconnect, the document reverts to the version persisted at the previous debounce.

This data loss window is documented and accepted. Reducing it requires more frequent persistence (increasing database write pressure) or using a write-ahead log (adding complexity). For a collaborative coding tool, 2.5 seconds of data loss is comparable to losing a few keystrokes — an inconvenience, not a disaster.

Socket.io clients have built-in reconnection logic with exponential backoff. When the server restarts, clients automatically attempt to reconnect. Once reconnected, the client re-emits "room:join" and receives the current document state.

### 7.5 Invite Abuse Edge Cases

Several invite abuse scenarios have been considered:

Invite link sharing: if a user shares their invite link publicly, anyone with the link can join the room (subject to plan limits). The maxMembersPerRoom limit provides a natural ceiling. If the room is full, the invite link is effectively dead even though it has not expired.

Invite farming: a malicious user could create many invites and distribute them widely. The system does not limit the number of invites per room. A future improvement could add a per-room invite limit or a per-user invite creation rate limit.

Expired invite use: the system checks the invite's expiresAt before accepting a join. Expired invites are rejected regardless of their token validity.

---

## 8. Interview Defense Section

### 8.1 Two-Minute System Explanation

CollabCode is a real-time collaborative coding platform built with Express, Socket.io, Prisma, and PostgreSQL. Users authenticate with JWT-based dual tokens — short-lived access tokens in memory and long-lived refresh tokens in HTTP-only cookies with rotation and reuse detection. The system has a subscription model where plan limits control room creation, member capacity, and session concurrency, all enforced server-side with transactional writes and row-level locks.

Rooms support real-time collaboration through an optimistic concurrency model — edits carry a version number, the server validates the version before applying, and sends a full-document resync on mismatch. Documents are held in memory during active editing and persisted to PostgreSQL with per-room debounce timers. When the last user leaves a room, the document is persisted immediately and the in-memory state is released.

### 8.2 Explaining the Auth Model

"We use a dual-token system. The access token is a short-lived JWT stored in memory — visible to JavaScript but expires in 15 minutes. The refresh token is a long-lived JWT stored as an HTTP-only cookie — invisible to JavaScript, scoped to the auth path, with SameSite=Strict. We rotate refresh tokens on every use and store their SHA-256 hashes in the database. If a deleted token is presented, we detect reuse and revoke all sessions for that user. This layered approach means that an XSS attack can steal the access token but can't access the refresh token, and even the stolen access token expires quickly. A database breach yields only hashes, not usable tokens."

### 8.3 Explaining the Concurrency Strategy

"We use optimistic concurrency with version checking. Each edit carries the client's current version. The server checks whether the client's version matches the server's version. If yes, the edit is applied and the version increments. If no, the server sends a full-document resync. This is not conflict-free like a CRDT — if two users edit simultaneously, one gets a resync. But for 2-5 collaborators, this is rare and imperceptible. The alternative of implementing CRDTs would add 30KB to the client bundle, require a DAG-based document model, and make database persistence non-trivial. The version-check model gives us 90% of the value with 10% of the complexity."

### 8.4 Explaining the Scaling Path

"Right now we run single-process. Active rooms are in-memory. The first scaling step is adding the Socket.io Redis adapter for cross-server event broadcasting, combined with sticky sessions so each room's state lives on one server. Beyond that, we'd move the document store to Redis for fully stateless servers. The ultimate architecture is extracting the collaboration engine into a dedicated service — the REST API runs stateless behind a load balancer, and the collaboration service handles all socket connections with Redis-backed state. Each step is incremental and doesn't require a rewrite."

### 8.5 Defending the Tradeoff Against CRDTs

"CRDTs guarantee conflict-free convergence, which is essential at Google Docs scale — hundreds of concurrent editors. Our target is 2-5 collaborators per room. At that scale, concurrent conflicting edits are infrequent. When they occur, our version-check model responds with a full-document resync in under 50 milliseconds. The user experiences a brief flicker, not data loss.

CRDTs carry real costs: Yjs adds approximately 30KB to the client bundle. CRDT documents are opaque data structures — you can't run a SQL query against a CRDT document to search for content. Persisting CRDTs requires serializing their internal DAG structure, which is larger than the document text. And debugging concurrent edit issues in a CRDT is significantly more complex than in a version-check model where the server is authoritative and the state is a plain string.

If we needed to support 50+ concurrent editors, CRDTs would be the right choice. At our scale, they're unnecessary complexity. The version-check model gives us predictable, debuggable, and simple real-time collaboration."

### 8.6 Explaining Why Certain Complexity Was Avoided

"We made several deliberate decisions to avoid premature complexity:

No microservices. The entire backend is a single Express application. Microservices introduce network boundaries, distributed transactions, service discovery, and deployment orchestration. At our scale, a monolith is faster to develop, easier to debug, and has lower operational overhead.

No message queue. Chat messages and real-time events are handled synchronously. A message queue (RabbitMQ, Kafka) would add latency, operational complexity, and a dependency that must be managed separately. When we need asynchronous processing (for example, email notifications), we'll add it. Until then, synchronous processing is correct and simple.

No caching layer. Database queries are fast (indexed lookups, sub-millisecond). Adding Redis as a cache introduces cache invalidation complexity. We use Redis's future role as a Socket.io adapter for horizontal scaling, not as a cache. If specific queries become slow, we'll add caching for those queries, not a blanket caching layer.

No operation log. We persist full document snapshots, not edit histories. An operation log would enable undo/redo on the server, but it would grow without bound and require periodic compaction. Full snapshots are simple, bounded, and queryable. If we need undo/redo, we'll implement it client-side."

---

*This document reflects the architecture as implemented through Phase 4. Future phases (frontend-backend integration for rooms, deployment pipeline, monitoring) will extend this document as they are completed.*
