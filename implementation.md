# Chatrix — Implementation Plan

> **Project:** Chatrix  
> **Stack:** MERN (MongoDB · Express · React · Node)  
> **Deployment:** Single Vercel project  
> **Reviewed:** 2026-04-23  

---

## 1. Product Goal

Build a **WhatsApp-style chat app with LinkedIn-style connection requests**, named **Chatrix**, where:

- signup/login happens **only via Google**
- every user gets a **system-generated unique ID** (the Chatrix ID)
- users find each other by searching that Chatrix ID
- users send a **connection request**; chat only becomes available after acceptance
- everything lives in **one codebase, one Vercel deployment**
- database is **MongoDB Atlas**

This is basically:
- **WhatsApp**: private one-to-one text chat
- **LinkedIn**: request → accept → connect before any DM
- **Discord/Instagram**: app-specific identity rather than phone contacts

---

## 2. Non-Negotiable Constraints

| Constraint | Decision |
|---|---|
| Auth | Google Sign-In only. No email/password, no SMTP, no OTP, no phone |
| Deployment | Single Vercel project, single repository |
| Database | MongoDB Atlas |
| User discovery | By Chatrix ID (system-generated unique ID) only |
| Chat gating | Chat requires an `accepted` connection — never before |
| Realtime for MVP | **REST + polling only** (no raw WebSockets on Vercel Functions) |
| Realtime upgrade path | Pusher / Ably in Phase 2+ — not MVP scope |

---

## 3. Architecture

### 3.1 Recommended Repo Structure

```
chatrix/
  api/
    index.js              ← Vercel entry point: exports the Express app
  server/
    config/
      db.js               ← Mongoose connection
    controllers/
    middleware/
      auth.js             ← JWT verification middleware
      errorHandler.js
    models/
    routes/
    utils/
      generateChatrixId.js
  src/                    ← Vite + React
    components/
    pages/
    layouts/
    hooks/
    lib/
      api.js              ← axios instance with base URL + credentials
    services/             ← query functions for React Query
    store/                ← Zustand stores
  public/
  package.json
  vite.config.js          ← proxy /api → localhost:3001 for local dev
  vercel.json
  .env.example
  implementation.md
```

**Why this shape:**
- `api/index.js` exports `app` (Express), satisfying Vercel Functions' module contract
- `server/` holds all business logic, testable independently
- `src/` is a standard Vite SPA — Vercel's build output config handles it
- The proxy in `vite.config.js` removes CORS friction in local dev

### 3.2 Vercel Configuration

```json
// vercel.json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build", "config": { "distDir": "dist" } }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

> **Locked decision:** The last catch-all route `/(.*)` → `/index.html` is the SPA rewrite. This must come after the `/api/(.*)` rule or every API call will 404.

### 3.3 Local Dev Setup

```
// vite.config.js (relevant excerpt)
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true
    }
  }
}
```

Run two processes locally: `npm run dev` (Vite on 5173) + `npm run server` (Express on 3001).  
Add a `concurrently` script to `package.json` for convenience:
```json
"dev:full": "concurrently \"npm run server\" \"npm run dev\""
```

### 3.4 Realtime Approach (Locked for MVP)

Vercel Serverless Functions are **stateless and short-lived**. Raw WebSocket / Socket.IO connections are not supported.

- **MVP (Phases 0–4):** REST API + interval polling (3–5 s for messages, 10 s for connection requests)
- **Phase 2 upgrade path:** Integrate Pusher Channels or Ably. MongoDB remains source of truth; the realtime provider is a delivery layer only.

Do **not** attempt to ship Socket.IO on Vercel Functions. It will break silently under load.

---

## 4. Authentication — Google Sign-In

### 4.1 Chosen Approach: Google One Tap / GIS + Backend Token Verification

Flow:

```
Browser                        Backend                        Google
  |                               |                              |
  |--- clicks "Continue w/ Google"|                              |
  |                               |                              |
  |<------ Google popup / One Tap ------------------------------|
  |<------ returns credential (ID token) -----------------------|
  |                               |                              |
  |--- POST /api/auth/google ----->|                              |
  |   { credential: <id_token> }  |                              |
  |                               |---- verifyIdToken() -------->|
  |                               |<---- tokenPayload -----------|
  |                               |                              |
  |                               |-- upsert user in MongoDB    |
  |                               |-- sign JWT                  |
  |                               |-- set HTTP-only cookie      |
  |<-- { user } ------------------||                              |
```

**Frontend library:** `@react-oauth/google` (wraps GIS cleanly for React)  
**Backend library:** `google-auth-library` → `OAuth2Client.verifyIdToken()`

### 4.2 JWT Session

- Sign a JWT containing `{ userId, uniqueId }` with `JWT_SECRET`
- Set as **HTTP-only, Secure, SameSite=Lax** cookie named `chatrix_session`
- Expiry: **7 days**, refreshed on each request (sliding window)
- `SameSite=Lax` works for same-origin Vercel deployments; use `SameSite=None; Secure` only if splitting domains (not needed here)

> **Locked decision:** Use JWT cookies, not localStorage. localStorage is vulnerable to XSS; HTTP-only cookies are not.

### 4.3 Auth Middleware

```js
// server/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies.chatrix_session;
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
};
```

Apply `requireAuth` to all `/api` routes except `POST /api/auth/google` and `GET /api/auth/me`.

### 4.4 CORS Setup

```js
// api/index.js
app.use(cors({
  origin: process.env.APP_URL,   // 'http://localhost:5173' locally, Vercel URL in prod
  credentials: true,             // required for cookies
}));
```

`credentials: true` + matching `withCredentials: true` in the axios instance is mandatory for cookie auth.

---

## 5. User Identity

### 5.1 Chatrix ID Format

```
CX-XXXX-XXXX   (e.g. CX-8K2Q-T7PM)
```

Rules:
- Prefix `CX-` makes it recognisable as a Chatrix ID
- Two 4-character segments: uppercase alphanumeric (A-Z, 0-9; no look-alike chars O/0/I/1)
- Total distinct space: ~1.4 billion combinations — sufficient for any realistic scale
- Generated **once** at account creation, **immutable** thereafter
- Stored in DB, indexed as unique, searched **case-insensitively** (normalize to uppercase before save and before query)

### 5.2 Generation Algorithm

```js
// server/utils/generateChatrixId.js
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1

function randomSegment(len) {
  return Array.from({ length: len }, () =>
    CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('');
}

async function generateUniqueChatrixId(UserModel) {
  for (let attempts = 0; attempts < 10; attempts++) {
    const id = `CX-${randomSegment(4)}-${randomSegment(4)}`;
    const exists = await UserModel.exists({ chatrixId: id });
    if (!exists) return id;
  }
  throw new Error('Failed to generate unique Chatrix ID after 10 attempts');
}
```

> Collision probability at 1 million users is ~0.07%. The retry loop handles it. No need for UUID or nanoid for this scale.

### 5.3 `users` Collection Schema

```js
// server/models/User.js
{
  _id:           ObjectId,          // Mongo default
  googleId:      String,            // Google sub claim — unique
  email:         String,            // unique
  name:          String,            // from Google profile
  avatar:        String,            // Google picture URL
  chatrixId:     String,            // CX-XXXX-XXXX — unique, immutable
  displayName:   String,            // editable by user
  bio:           String,            // max 160 chars
  statusMessage: String,            // max 80 chars
  isOnboarded:   Boolean,           // false until user completes onboarding step
  lastSeen:      Date,              // updated on each authenticated request
  createdAt:     Date,
  updatedAt:     Date
}
```

**Indexes:**
```js
{ googleId: 1 }   — unique
{ email: 1 }      — unique
{ chatrixId: 1 }  — unique
```

> **Removed `username` field** from original plan — it creates a second search surface and is out of MVP scope. `displayName` is the editable label; `chatrixId` is the lookup key.

> `lastSeen` is updated via a lightweight middleware after each authenticated request — do not use a separate endpoint for this.

---

## 6. Social Graph — Connection System

### 6.1 Connection States

```
(none) → pending → accepted
               ↘ rejected
       → cancelled   (requester withdraws before response)
```

`blocked` is valid but deferred to Phase 2. Do not add it to the schema now; add it when the feature is built to avoid dead code.

### 6.2 `connections` Collection Schema

```js
{
  _id:         ObjectId,
  requesterId: ObjectId,   // ref: users
  recipientId: ObjectId,   // ref: users
  status:      String,     // 'pending' | 'accepted' | 'rejected' | 'cancelled'
  actionBy:    ObjectId,   // who performed the last status change
  createdAt:   Date,
  updatedAt:   Date,
  acceptedAt:  Date        // only set on status = 'accepted'
}
```

**Indexes:**

```js
// Fast duplicate request check and status lookup
{ requesterId: 1, recipientId: 1 }  — unique

// Fetch incoming requests for a user
{ recipientId: 1, status: 1 }

// Fetch outgoing requests for a user
{ requesterId: 1, status: 1 }
```

**Canonical ordering to prevent duplicates:** Before inserting, normalize so that `requesterId < recipientId` is NOT used — instead, keep direction (requester is the person who sent it). Uniqueness is enforced by the compound index with a pre-insert check: query for any document where `(requesterId=A, recipientId=B) OR (requesterId=B, recipientId=A)` and block if found.

### 6.3 Business Rules (enforced on backend, not just frontend)

| Rule | Enforcement |
|---|---|
| Cannot request self | `if (requesterId === recipientId) 400` |
| Cannot request if already connected | Query connections for pair before insert |
| Cannot send duplicate pending request | Query for `pending` state in pair before insert |
| Rejected request can be re-sent after 24 hours | Check `updatedAt` of rejected record |
| Only recipient can accept/reject | `if (req.user.userId !== connection.recipientId) 403` |
| Only requester can cancel | `if (req.user.userId !== connection.requesterId) 403` |
| Only participants can view connection details | Verify userId is in `[requesterId, recipientId]` |

### 6.4 What Happens on Accept

When status changes to `accepted`:
1. Set `acceptedAt = now` on the connection document
2. `POST /api/chats/open/:connectionId` is called (or triggered server-side in the same transaction)
3. Create a `conversations` document if one doesn't already exist for this pair
4. Return the conversation to both clients

> **Locked decision:** Conversation is created lazily on first accept, not pre-created. This avoids orphan conversation records if something fails mid-flow.

---

## 7. Messaging System

### 7.1 `conversations` Collection Schema

```js
{
  _id:             ObjectId,
  type:            'direct',         // only type for MVP
  participants:    [ObjectId],       // exactly 2 for direct; always sorted ascending for deterministic lookup
  connectionId:    ObjectId,         // ref: connections (the accepted connection)
  lastMessageId:   ObjectId,         // ref: messages
  lastMessageText: String,           // truncated preview (max 100 chars)
  lastMessageAt:   Date,
  unreadCounts:    {
    [userId: String]: Number         // keyed by userId string; tracks unread per participant
  },
  createdAt:       Date,
  updatedAt:       Date
}
```

**Indexes:**
```js
{ participants: 1 }                         // lookup by participant
{ participants: 1, lastMessageAt: -1 }      // sorted chat list
```

> **Design note on `unreadCounts`:** Storing it as a map on the conversation document avoids a separate `userConversation` join collection for MVP. At scale, move to a dedicated `user_conversation_state` collection, but subdocument is fine for 1-to-1 where both participants are known.

### 7.2 `messages` Collection Schema

```js
{
  _id:            ObjectId,
  conversationId: ObjectId,     // ref: conversations, indexed
  senderId:       ObjectId,     // ref: users
  text:           String,       // max 4000 chars, trimmed
  type:           'text',       // only type for MVP
  readAt:         Date,         // null until recipient reads; set on PATCH /read
  deletedAt:      Date,         // soft delete (Phase 2)
  createdAt:      Date
}
```

**Indexes:**
```js
{ conversationId: 1, createdAt: -1 }   // paginated message fetch (most recent first)
{ conversationId: 1, createdAt: 1 }    // ascending read (keep both for flexibility)
{ senderId: 1 }                         // sender history if needed
```

> **Removed `readBy: [ObjectId]` array** from original plan — it's designed for group chat. For 1:1, a single `readAt` date on the message is cleaner and sufficient.
> **Removed `deliveredTo`** — delivery tracking at message level adds complexity without benefit for polling-based MVP.

### 7.3 Permission Check on Send

Before saving any message, the backend must verify:

```js
const conversation = await Conversation.findById(req.params.conversationId);
if (!conversation) return 404;
if (!conversation.participants.includes(req.user.userId)) return 403;
// Also verify the connection is still 'accepted' (guard against block scenarios)
const conn = await Connection.findById(conversation.connectionId);
if (conn.status !== 'accepted') return 403;
```

### 7.4 Polling Strategy

- `GET /api/chats` — poll every **10 seconds** (conversation list + unread counts)
- `GET /api/chats/:id/messages?after=<lastMessageId>` — poll every **3 seconds** when chat window is open and focused
- Use `cursor` (lastMessageId or `createdAt` timestamp) instead of `page=N` to avoid pagination drift when new messages arrive

```
GET /api/chats/:conversationId/messages?after=<ISO_timestamp>&limit=30
```

Returns messages with `createdAt > after`, up to `limit`. No `page` param needed.

---

## 8. Complete API Reference

All routes require `requireAuth` middleware unless marked **[public]**.

### 8.1 Auth

| Method | Path | Description |
|---|---|---|
| POST [public] | `/api/auth/google` | Verify Google credential, upsert user, issue JWT cookie |
| GET [public] | `/api/auth/me` | Return current user from JWT (null if no cookie) |
| POST | `/api/auth/logout` | Clear `chatrix_session` cookie |

**`POST /api/auth/google` request:**
```json
{ "credential": "<google_id_token>" }
```
**Response:**
```json
{ "user": { "_id", "chatrixId", "displayName", "avatar", "isOnboarded" } }
```

### 8.2 Users

| Method | Path | Description |
|---|---|---|
| GET | `/api/users/me` | Full own profile |
| PATCH | `/api/users/me` | Update `displayName`, `bio`, `statusMessage` |
| GET | `/api/users/search?q=CX-8K2Q-T7PM` | Exact match by chatrixId. Returns limited public profile. 404 if not found |
| GET | `/api/users/:userId` | Public profile of any user (for profile previews) |

> **Locked decision on search:** Exact match only for MVP. No prefix/fuzzy search — it adds index complexity and is not necessary when users share IDs directly. Add autocomplete in Phase 2 if needed.

**Public profile fields returned by `/api/users/:userId`:**
```json
{ "_id", "chatrixId", "displayName", "avatar", "bio", "statusMessage" }
```
Do not expose `email`, `googleId`, `lastSeen` to arbitrary users.

### 8.3 Connections

| Method | Path | Description |
|---|---|---|
| POST | `/api/connections/request` | Send request. Body: `{ recipientId }` |
| GET | `/api/connections/incoming` | Pending requests where I am recipient |
| GET | `/api/connections/outgoing` | Pending requests where I am requester |
| GET | `/api/connections` | All accepted connections (my contacts list) |
| PATCH | `/api/connections/:id/accept` | Accept (only recipient can call) |
| PATCH | `/api/connections/:id/reject` | Reject (only recipient can call) |
| PATCH | `/api/connections/:id/cancel` | Cancel (only requester can call) |
| GET | `/api/connections/:id/status` | Get connection status between me and any user. Body: `{ targetUserId }` |

> Changed `POST /api/connections/request/:uniqueId` to `POST /api/connections/request` with body `{ recipientId }`. Putting IDs in URL path is fine for GETs, but POSTs with a body are cleaner for creation actions.

### 8.4 Conversations

| Method | Path | Description |
|---|---|---|
| GET | `/api/chats` | List all conversations for current user, sorted by `lastMessageAt` desc |
| GET | `/api/chats/:conversationId` | Conversation details + participants |
| POST | `/api/chats/open` | Open or create a direct conversation. Body: `{ connectionId }`. Returns existing if already created |

### 8.5 Messages

| Method | Path | Description |
|---|---|---|
| GET | `/api/chats/:conversationId/messages?after=<iso>&limit=30` | Fetch messages after timestamp (cursor pagination) |
| POST | `/api/chats/:conversationId/messages` | Send message. Body: `{ text }` |
| PATCH | `/api/chats/:conversationId/read` | Mark messages as read up to now. Updates `readAt` and resets `unreadCounts` for caller |

### 8.6 Notifications (computed, no separate collection for MVP)

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | Returns `{ pendingRequestCount, totalUnreadMessages }` — computed from connections + conversations |

> **Locked decision:** No `notifications` collection for MVP. A simple computed endpoint is enough. Use a collection only when you need persistent per-notification read states (Phase 2).

---

## 9. Frontend Architecture

### 9.1 Pages

| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Redirect to `/login` if not authed, `/app` if authed |
| `/login` | public | Brand intro + Google Sign-In button |
| `/onboarding` | protected | Show assigned Chatrix ID; let user set displayName + bio |
| `/app` | protected | Main app shell (see below) |
| `/app/requests` | protected | Incoming + outgoing requests |
| `/app/contacts` | protected | Accepted connections list |
| `/app/chat/:conversationId` | protected | Specific chat window |
| `/app/search` | protected | Search by Chatrix ID result page |
| `/app/profile` | protected | Own profile + settings |

> **Locked decision on routing:** Use React Router v6 with nested routes. `/app/*` children share the sidebar layout. Mobile-responsive: sidebar collapses when a conversation is open.

### 9.2 Component Breakdown

```
layouts/
  AppLayout.jsx          ← sidebar + main panel
  PublicLayout.jsx       ← centered card layout for login

pages/
  LoginPage.jsx
  OnboardingPage.jsx
  SearchPage.jsx
  RequestsPage.jsx
  ContactsPage.jsx
  ChatPage.jsx
  ProfilePage.jsx

components/
  auth/
    GoogleLoginButton.jsx
  search/
    SearchBar.jsx
    UserCard.jsx          ← shows chatrixId + connection state button
  connections/
    RequestItem.jsx
    ContactItem.jsx
  chat/
    ConversationList.jsx
    ChatWindow.jsx
    MessageBubble.jsx
    MessageComposer.jsx
  common/
    Avatar.jsx
    Badge.jsx             ← unread count indicator
    EmptyState.jsx
    LoadingSpinner.jsx
    ErrorToast.jsx
```

### 9.3 State Management

| State type | Tool | Why |
|---|---|---|
| Auth / session | Zustand `useAuthStore` | Globally needed, rarely changes |
| Server data (users, chats, connections) | React Query | Cache, background refresh, optimistic updates |
| UI-only (modals, toasts) | Local React state | No need to globalise ephemeral UI state |

**React Query key conventions:**
```js
['me']                              // own profile
['user', userId]                    // any user profile
['connections', 'incoming']
['connections', 'outgoing']
['connections', 'accepted']
['chats']                           // conversation list
['chat', conversationId, 'messages']
['notifications']
```

**Polling config:**
```js
// conversation list
useQuery(['chats'], fetchChats, { refetchInterval: 10_000 });

// messages (only when chat is open and window is focused)
useQuery(['chat', id, 'messages'], fetchMessages, {
  refetchInterval: 3_000,
  refetchIntervalInBackground: false,
});
```

### 9.4 Search Flow UX

1. User types `CX-8K2Q-T7PM` in search bar
2. Query fires on submit (not on keypress — avoid hammering API)
3. If user found: show `UserCard` with connection state button
4. Connection state button shows: `Send Request` / `Pending` / `Accept / Reject` / `Connected`
5. If `Connected`: button opens chat directly
6. If not found: show "No user found with this Chatrix ID"

The search bar must normalize input: strip spaces, uppercase before sending.

---

## 10. Security Boundaries

### Auth Security

- Google token is **verified on the backend** using `google-auth-library`. Never trust frontend-provided user profile data.
- All session state comes from the JWT cookie — not from a frontend-provided userId header.
- `req.user.userId` from `requireAuth` is the authoritative identity for all operations.

### API Security

- All `/api` routes except `POST /api/auth/google` and `GET /api/auth/me` require `requireAuth`
- Input validation with **Zod** on every route handler. Reject unknown fields explicitly.
- Message text: max 4000 chars, strip null bytes, trim whitespace
- Rate limits (via `express-rate-limit`):
  - Search endpoint: **20 req/min** per IP
  - Message send: **60 req/min** per user
  - Auth endpoint: **10 req/min** per IP
- `helmet()` applied globally on Express app

### Business Logic Authorization (backend enforced)

```
Action                  Authorization Check
──────────────────────────────────────────────────────────
Accept connection       req.user.userId === connection.recipientId
Reject connection       req.user.userId === connection.recipientId
Cancel connection       req.user.userId === connection.requesterId
Send message            req.user.userId ∈ conversation.participants
                        AND connection.status === 'accepted'
Read messages           req.user.userId ∈ conversation.participants
View conversation       req.user.userId ∈ conversation.participants
```

### MongoDB Security

- `MONGODB_URI` injected via Vercel env vars — never in source code
- Atlas IP allowlist: `0.0.0.0/0` is acceptable for MVP (Vercel IPs are dynamic). Tighten per-cluster in production.
- Use dedicated Atlas DB user with read/write on the Chatrix DB only — not `atlasAdmin`.

---

## 11. MongoDB Connection Handling on Vercel (Critical)

Vercel Functions are invoked cold and torn down between requests. A naive `mongoose.connect()` call inside the handler creates a new connection on every invocation.

**Solution — cached connection pattern:**

```js
// server/config/db.js
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,          // keep pool small for serverless
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
```

Call `await connectDB()` at the top of `api/index.js` before registering routes. This ensures the connection is reused across warm invocations of the function.

> This pattern is the official recommended approach in Vercel's MongoDB docs and prevents connection pool exhaustion.

---

## 12. Environment Variables

```env
# .env.example (commit this, not .env)

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/chatrix

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com

# JWT
JWT_SECRET=<min 32 random chars>
JWT_EXPIRES_IN=7d

# App
APP_URL=http://localhost:5173       # Vercel URL in production
NODE_ENV=development
```

**Vercel Dashboard env vars:** Set `APP_URL` to the actual Vercel deployment URL (e.g., `https://chatrix.vercel.app`). All others identical to `.env.example` values.

**Google Cloud Console setup:**
- Authorized JavaScript origins: `http://localhost:5173`, `https://chatrix.vercel.app`
- Authorized redirect URIs: Not needed for GIS token-based flow (no server-side OAuth redirect)

---

## 13. Library Decisions

### Frontend

| Library | Version | Purpose |
|---|---|---|
| `react` | ^18 | UI |
| `react-dom` | ^18 | |
| `react-router-dom` | ^6 | Routing |
| `@tanstack/react-query` | ^5 | Server state + polling |
| `axios` | ^1 | HTTP client |
| `zustand` | ^4 | Auth/session state |
| `@react-oauth/google` | latest | Google Sign-In button |

CSS: **CSS Modules** (Vite built-in) or plain CSS. No Tailwind for MVP — adds build config complexity without benefit at this scale. Add if team prefers after setup.

### Backend

| Library | Purpose |
|---|---|
| `express` | HTTP server |
| `mongoose` | ODM |
| `jsonwebtoken` | JWT sign/verify |
| `cookie-parser` | Parse HTTP-only cookies |
| `cors` | CORS headers |
| `zod` | Request validation |
| `google-auth-library` | Google token verification |
| `helmet` | Security headers |
| `express-rate-limit` | Rate limiting |
| `dotenv` | Env vars in local dev |

### Not Included in MVP

- `pusher` / `ably` — Phase 2 realtime
- `cloudinary` / `multer` — Phase 2 media
- `nodemailer` — never (no email auth)
- `socket.io` — never on Vercel Functions

---

## 14. Development Phases

### Phase 0 — Project Skeleton

**Goal:** Working hello-world with Vite + Express + Mongo on Vercel locally

Tasks:
1. `npm create vite@latest . -- --template react` (in root)
2. Create `api/index.js` with Express app export
3. Create `server/config/db.js` with cached Mongoose connection
4. Add `vercel.json` with builds + routes config
5. Add `vite.config.js` with `/api` proxy to port 3001
6. Add `server` npm script: `node api/index.js` (with `dotenv`)
7. Smoke test: `GET /api/health` returns `{ ok: true }`

**Acceptance criteria:**
- `npm run dev:full` starts both servers without error
- `GET /api/health` responds correctly via Vite proxy
- Mongoose connects to Atlas; no connection pool errors

---

### Phase 1 — Google Auth + Onboarding

**Goal:** User can sign in with Google; account created; Chatrix ID assigned

Tasks:
1. Create `User` model with schema from §5.3
2. Implement `POST /api/auth/google` (verify token → upsert → JWT cookie)
3. Implement `GET /api/auth/me`
4. Implement `POST /api/auth/logout`
5. Build `requireAuth` middleware
6. Build `LoginPage.jsx` with `@react-oauth/google` button
7. Build `useAuthStore` in Zustand
8. Build `OnboardingPage.jsx` (show Chatrix ID, set displayName)
9. Implement `PATCH /api/users/me` for onboarding save
10. Set `isOnboarded = true` after onboarding, redirect to `/app`

**Acceptance criteria:**
- First login creates user with valid `CX-XXXX-XXXX` Chatrix ID
- Repeat login fetches same user — no duplicate created
- Cookie is set; `GET /api/auth/me` returns user
- Logout clears cookie; subsequent `GET /api/auth/me` returns 401
- `isOnboarded = false` users are redirected to `/onboarding`

---

### Phase 2 — User Search + Connection Requests

**Goal:** Users can find each other by Chatrix ID and send/receive requests

Tasks:
1. Implement `Connection` model with schema from §6.2
2. Implement `GET /api/users/search?q=` (exact match, case-insensitive)
3. Implement `POST /api/connections/request` with all business rule checks
4. Implement `GET /api/connections/incoming` and `outgoing`
5. Implement `PATCH /api/connections/:id/accept|reject|cancel`
6. Build `SearchBar.jsx` + `UserCard.jsx` with connection state button
7. Build `RequestsPage.jsx` with incoming/outgoing tabs
8. Add `GET /api/notifications` computed endpoint

**Acceptance criteria:**
- Exact Chatrix ID search returns correct user or 404
- Cannot request self (400)
- Cannot duplicate request (400)
- Accept/reject only works for the correct parties (403 otherwise)
- Pending state visible on both sides immediately (with polling)
- Rejected request cannot be re-sent within 24 hours (400)

---

### Phase 3 — Contacts + Conversation Creation

**Goal:** Accepted connections appear as contacts; chat is ready to open

Tasks:
1. Add `GET /api/connections` (accepted list)
2. Implement `Conversation` model with schema from §7.1
3. Auto-create conversation on accept (inside the accept handler, in a try/catch)
4. Implement `POST /api/chats/open` (idempotent: return existing if present)
5. Implement `GET /api/chats` (conversation list with last message preview)
6. Build `ContactsPage.jsx` and `ConversationList.jsx`

**Acceptance criteria:**
- After acceptance, both users see each other in contacts list
- One conversation document exists per accepted pair (no duplicates)
- Chat list shows conversation with "No messages yet" if empty

---

### Phase 4 — Messaging MVP

**Goal:** Connected users can exchange text messages via polling

Tasks:
1. Implement `Message` model with schema from §7.2
2. Implement `POST /api/chats/:id/messages` with auth check
3. Implement `GET /api/chats/:id/messages?after=&limit=30`
4. Implement `PATCH /api/chats/:id/read`
5. Update conversation's `lastMessageText`, `lastMessageAt`, `unreadCounts` on each send
6. Build `ChatWindow.jsx`, `MessageBubble.jsx`, `MessageComposer.jsx`
7. Wire React Query polling (3s for messages, 10s for chat list)

**Acceptance criteria:**
- Connected users can send and receive messages
- Unconnected users get 403 on send
- Message history persists across page reload
- Unread count decrements after opening conversation (`PATCH /read`)
- Messages load in correct order (ascending by `createdAt`)
- Cursor-based pagination works: `?after=<timestamp>` returns only newer messages

---

### Phase 5 — Notifications + UX Polish

**Goal:** App feels complete and handles all edge cases gracefully

Tasks:
1. Wire `GET /api/notifications` to show badge on Requests tab
2. Add empty states for all list screens
3. Add loading skeletons (avoid blank flash)
4. Add error toasts for failed API calls
5. Copy-to-clipboard for Chatrix ID on profile/onboarding screen
6. Normalize search input on frontend (strip whitespace, uppercase)
7. Disable send button while message is in-flight (prevent double-send)
8. Show "you are not connected" state if someone tries to navigate directly to a non-existent conversation

---

### Phase 6 — Security Hardening + Index Audit

**Goal:** Production-safe API before deploy

Tasks:
1. Add `zod` schema validation to all route handlers
2. Add `express-rate-limit` to search, message, and auth endpoints
3. Add `helmet()` globally
4. Audit all Mongoose indexes (run `explain()` on search + message queries)
5. Ensure no sensitive fields returned in user search or profile APIs
6. Add centralized error handler in Express that never leaks stack traces in production
7. Test CORS: cookie sent correctly from Vite frontend to Express backend
8. Set `NODE_ENV=production` in Vercel and verify cookie `Secure` flag is active

---

### Phase 7 — Vercel Deployment

**Goal:** One-click deployable; end-to-end test in production

Tasks:
1. Push to GitHub (or GitLab)
2. Connect repo in Vercel dashboard
3. Set all env vars in Vercel project settings
4. Set `APP_URL` to production Vercel URL
5. Update Google Cloud Console: add production URL to authorized origins
6. Trigger deploy; confirm `GET /api/health` works
7. End-to-end test: login → onboarding → search → request → accept → chat
8. Check cookie is set with `Secure; SameSite=Lax; HttpOnly`
9. Check no CORS errors in browser console

**Acceptance criteria:**
- All 9 steps in build order work in production
- No "connection refused" or CORS errors
- Chatrix IDs searchable and connection flow works end-to-end

---

## 15. Edge Cases and Failure Modes

| Scenario | Handling |
|---|---|
| Google token expired/invalid | `verifyIdToken` throws → 401 response |
| Chatrix ID collision during generation | Retry loop (max 10 attempts); throw 500 if all fail |
| User sends request to already-connected user | Pre-insert check → 400 "Already connected" |
| User sends request to user who already sent them one | Pre-insert check finds reverse pending → 400 "This user already sent you a request" |
| Accepted connection gets cancelled after chat created | Chat is preserved; sending is blocked by connection status check |
| User navigates directly to `/app/chat/:id` for a conversation they're not in | 403 from `GET /api/chats/:id` |
| Mongo Atlas cold start / connection delay | `serverSelectionTimeoutMS: 5000` in cached connection; function will 500 gracefully |
| JWT secret rotation | Old tokens will fail; users will need to re-login. Acceptable for MVP — add refresh token in Phase 2 |
| Concurrent accept requests (race condition) | Use `findOneAndUpdate` with conditions to atomically update status; compound index prevents duplicates at DB level |
| Very large message history | Cursor pagination (`?after=`) avoids full collection scan |

---

## 16. MVP vs Future Scope

### ✅ MVP (Phases 0–7)

- Google-only login
- Chatrix ID assignment
- Search by exact Chatrix ID
- Send / accept / reject / cancel connection request
- One-to-one text chat (REST + polling)
- Unread count per conversation
- Basic profile (displayName, bio, statusMessage)
- Vercel deployment

### 🚀 Phase 2+ (Future)

| Feature | Notes |
|---|---|
| Realtime (Pusher/Ably) | Drop-in upgrade; MongoDB stays source of truth |
| Typing indicator | Requires realtime layer |
| Online presence / lastSeen | Update lastSeen on auth middleware; show in UI |
| Media sharing (images) | Cloudinary upload, store URL in message |
| Block / report | Add `blocked` connection status |
| Delete for me / unsend | Soft-delete `deletedAt` field already in schema |
| Push notifications | Web Push API or FCM |
| Group chat | New `conversation.type = 'group'`; major schema change |
| Archived chats | Per-user `archivedConversations[]` field |

---

## 17. Build Order (Implementation Sequence)

This is the recommended order to minimize rework:

```
1.  Project scaffold (Vite + Express + vercel.json)
2.  MongoDB cached connection
3.  GET /api/health smoke test
4.  User model + Chatrix ID generation
5.  Google auth endpoint + JWT cookie
6.  requireAuth middleware
7.  Login page + Zustand auth store
8.  Onboarding page + PATCH /api/users/me
9.  User search endpoint
10. Connection model + request/accept/reject/cancel endpoints
11. Search UI + UserCard with connection state
12. Requests page
13. Contacts list
14. Conversation model + auto-create on accept
15. Chat list (GET /api/chats)
16. Message model + send + fetch endpoints
17. Chat window UI + polling
18. Read receipts + unread counts
19. Notifications badge (computed endpoint)
20. UX polish (empty states, toasts, skeletons)
21. Security hardening (validation, rate limits, helmet)
22. Vercel deploy + production smoke test
```

---

## 18. Key Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vercel WebSocket confusion | High | High | Polling is locked for MVP; WebSocket not on the table |
| Mongo connection pool exhaustion | Medium | High | Cached connection pattern (§11) |
| Duplicate connection records | Medium | High | Compound unique index + pre-insert pair check |
| Google OAuth domain mismatch in prod | Medium | High | Add prod URL to Cloud Console before final deploy |
| JWT cookie not sent cross-origin | Medium | High | `credentials: true` in CORS + `withCredentials: true` in axios |
| SPA 404 on page refresh | Medium | Medium | `vercel.json` catch-all rewrite to `/index.html` |
| Chatrix ID collision at scale | Low | Low | Retry loop handles it; space is 1.4B combinations |
| Atlas IP allowlist too restrictive | Low | High | Use `0.0.0.0/0` for Vercel dynamic IPs; note in security docs |

---

## 19. Official References

- Vercel + Express: https://vercel.com/docs/frameworks/backend/express
- Vercel + Vite: https://vercel.com/docs/frameworks/frontend/vite
- Vercel WebSocket guidance: https://vercel.com/guides/do-vercel-serverless-functions-support-websocket-connections
- Vercel MongoDB cached connection: https://www.mongodb.com/company/partners/vercel
- Google Identity Services (GIS): https://developers.google.com/identity/gsi/web
- `@react-oauth/google`: https://github.com/MomenSherif/react-oauth-google
- `google-auth-library` Node: https://github.com/googleapis/google-auth-library-nodejs
