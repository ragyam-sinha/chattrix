<div align="center">
  <br />
  <h1>💬 Chatrix</h1>
  <p>
    <strong>A Premium WhatsApp-Style Chat Application with LinkedIn-Style Connections</strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node" />
    <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
  </p>
</div>

<br />

Chatrix is a blazing-fast, modern chat application. It combines the seamless chatting experience of WhatsApp with the professional networking flow of LinkedIn. Users get a unique `Chatrix ID` to connect, and the UI is designed with a premium Grey-Green and Pink aesthetic, complete with dark mode!

---

## ✨ Features

- 🔐 **Passwordless Auth** — Google-only sign-in with JWT HTTP-only cookies.
- 🪪 **Unique Chatrix ID** — Every user gets a `CX-XXXX-XXXX` ID for discovery.
- 🤝 **Connection Requests** — Send and accept requests before chatting (LinkedIn style).
- 🎨 **Premium Aesthetic** — Beautiful UI with seamless **Dark/Light Theme** switching.
- 💬 **WhatsApp-style Chat** — Right-aligned sent messages, left-aligned received, with an integrated **Emoji Keyboard**.
- ✏️ **Custom Contact Names** — Rename your contacts locally; mappings sync across all your devices.
- 🗑️ **Message Management** — Soft-delete messages just like WhatsApp (*"This message was deleted"*).
- ⚡ **Near Real-time** — Optimized polling down to **1 second** for snappy delivery on Serverless platforms.
- 🚀 **Serverless Ready** — Designed specifically for single-repo deployment on Vercel/Netlify.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite + React Query + Zustand
- **Backend:** Express (Node.js) + Mongoose
- **Database:** MongoDB Atlas
- **Auth:** Google OAuth 2.0
- **Deployment:** Vercel (Serverless Functions)

---

## 📂 Project Structure

```text
chatrix/
├── api/index.js              ← Express app (Vercel entry point)
├── server/
│   ├── config/db.js          ← Mongoose cached connection
│   ├── middleware/           ← Auth & Error handlers
│   ├── models/               ← User, Connection, Conversation, Message
│   ├── routes/               ← API Routes
│   └── utils/                ← Chatrix ID generator
├── src/                      ← React frontend
│   ├── components/           ← Reusable UI components
│   ├── pages/                ← App routing pages
│   ├── store/                ← Zustand state management
│   ├── services/             ← API fetchers
│   └── lib/                  ← Axios configurations
└── vercel.json               ← Vercel deployment config
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account
- Google Cloud Console project with OAuth 2.0 credentials

### 1. Clone & Install
```bash
git clone https://github.com/ragyam-sinha/chattrix.git
cd chattrix
npm install
```

### 2. Configure Environment
Copy the example environment file and fill in your details:
```bash
cp .env.example .env
```
**Required Variables:**
- `MONGODB_URI` — Your MongoDB Atlas connection string
- `GOOGLE_CLIENT_ID` — From Google Cloud Console
- `JWT_SECRET` — Random string (min 32 chars)
- `VITE_GOOGLE_CLIENT_ID` — Same as GOOGLE_CLIENT_ID (Vite requires the `VITE_` prefix)

### 3. Google Cloud Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services > Credentials**.
3. Create an **OAuth 2.0 Client ID** (Web application).
4. Add authorized JavaScript origins:
   - `http://localhost:5173` (local dev)
   - `https://your-app.vercel.app` (production)

### 4. Run Locally
Start both the Express server and the Vite dev server concurrently:
```bash
npm run dev:full
```
- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:3001`

---

## ☁️ Deployment (Vercel)

1. Push your code to GitHub.
2. Import the project into your Vercel dashboard.
3. Configure all `.env` variables in the Vercel project settings.
4. Add `APP_URL` as your Vercel deployment URL.
5. Hit **Deploy**!

---

<div align="center">
  <i>Built with ❤️ using the MERN stack</i>
</div>
