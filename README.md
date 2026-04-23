# Chatrix

A WhatsApp-style chat app with LinkedIn-style connection requests. Built with MERN stack, designed for single Vercel deployment.

## Features

- **Google-only sign-in** — no passwords, no email verification
- **Unique Chatrix ID** — every user gets a `CX-XXXX-XXXX` ID for discovery
- **Connection requests** — connect before chatting (like LinkedIn)
- **One-to-one text chat** — send messages after connection is accepted
- **Polling-based refresh** — works on Vercel without WebSockets

## Tech Stack

- **Frontend:** React 19 + Vite + React Query + Zustand
- **Backend:** Express (Node.js) + Mongoose
- **Database:** MongoDB Atlas
- **Auth:** Google Sign-In + JWT HTTP-only cookies
- **Deployment:** Single Vercel project

## Project Structure

```
chatrix/
  api/index.js              ← Express app (Vercel entry point)
  server/
    config/db.js             ← Mongoose cached connection
    middleware/               ← auth, error handler
    models/                  ← User, Connection, Conversation, Message
    routes/                  ← auth, users, connections, chats, notifications
    utils/                   ← Chatrix ID generator
  src/                       ← React frontend
    components/              ← UI components
    pages/                   ← route pages
    store/                   ← Zustand auth store
    services/                ← API service functions
    lib/                     ← axios instance
  vercel.json                ← Vercel deployment config
```

## Setup

### Prerequisites

- Node.js 18+
- MongoDB Atlas account
- Google Cloud Console project with OAuth 2.0 credentials

### 1. Clone and install

```bash
git clone <repo-url>
cd chatrix
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `MONGODB_URI` — Your MongoDB Atlas connection string
- `GOOGLE_CLIENT_ID` — From Google Cloud Console
- `JWT_SECRET` — Random string (min 32 chars)
- `VITE_GOOGLE_CLIENT_ID` — Same as GOOGLE_CLIENT_ID (Vite needs VITE_ prefix)

### 3. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Go to **APIs & Services > Credentials**
4. Create an **OAuth 2.0 Client ID** (type: Web application)
5. Add authorized JavaScript origins:
   - `http://localhost:5173` (local dev)
   - `https://your-app.vercel.app` (production)

### 4. Run locally

```bash
# Start both Express server and Vite dev server
npm run dev:full
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### 5. Deploy to Vercel

1. Push to GitHub
2. Import in Vercel dashboard
3. Set environment variables in Vercel project settings
4. Set `APP_URL` to your Vercel deployment URL
5. Deploy

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/google` | Google sign-in |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/users/me` | Own profile |
| PATCH | `/api/users/me` | Update profile |
| GET | `/api/users/search?q=` | Search by Chatrix ID |
| POST | `/api/connections/request` | Send connection request |
| GET | `/api/connections/incoming` | Incoming requests |
| GET | `/api/connections/outgoing` | Outgoing requests |
| GET | `/api/connections` | Accepted contacts |
| PATCH | `/api/connections/:id/accept` | Accept request |
| PATCH | `/api/connections/:id/reject` | Reject request |
| PATCH | `/api/connections/:id/cancel` | Cancel request |
| GET | `/api/chats` | Conversation list |
| POST | `/api/chats/open` | Open/create conversation |
| GET | `/api/chats/:id/messages` | Fetch messages |
| POST | `/api/chats/:id/messages` | Send message |
| PATCH | `/api/chats/:id/read` | Mark as read |
| GET | `/api/notifications` | Notification counts |
| GET | `/api/health` | Health check |
