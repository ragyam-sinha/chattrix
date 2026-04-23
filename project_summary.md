# Chatrix: Architecture & Feature Summary

This document provides a comprehensive overview of how the Chatrix application works under the hood, the technologies powering it, and the specific mechanics of its chat system.

---

## 🛠️ Technology Stack

Chatrix is built on the modern **MERN Stack** but tailored for **Serverless Deployment** (like Vercel or Netlify).

### Frontend (Client-side)
* **React 19 & Vite:** The core UI library and build tool for blazing fast hot-reloading.
* **Zustand:** Used for lightweight global state management (e.g., storing the currently logged-in user).
* **React Query (`@tanstack/react-query`):** Handles all API data fetching, caching, and background polling.
* **Vanilla CSS:** Custom-built styling using CSS Variables to effortlessly switch between Light and Dark themes.

### Backend (Server-side)
* **Node.js & Express:** The API framework routing requests.
* **Serverless HTTP:** Wraps the Express app so it can run as a serverless function rather than a traditional continuous server.
* **MongoDB Atlas (Mongoose):** A NoSQL cloud database. Mongoose is used as the Object Data Modeling (ODM) library to enforce schemas.

---

## ✨ Features & How They Work

### 1. Authentication
Users sign in exclusively via **Google OAuth**. When a user logs in, the backend issues an HttpOnly JWT cookie and generates a unique `Chatrix ID` (e.g., `CX-ABCD-1234`) for them.

### 2. Connections (LinkedIn style)
To chat, users cannot just message anyone. 
1. **Search:** User A searches for User B's `Chatrix ID`.
2. **Request:** User A sends a Connection Request (`POST /api/connections/request`).
3. **Acceptance:** User B accepts (`PATCH /api/connections/:id/accept`). This automatically triggers the creation of a `Conversation` document linking both users.

### 3. Messaging & CRUD Operations
The app follows standard RESTful principles for CRUD (Create, Read, Update, Delete):
* **Create (POST):** Sending a message creates a new `Message` document in MongoDB.
* **Read (GET):** React Query fetches the conversation and its messages.
* **Update (PATCH):** Used for marking messages as read or updating a user's profile.
* **Delete (DELETE):** When a user deletes a message, it uses a **"Soft Delete"**. Instead of dropping the database row, we set `isDeleted: true` and change the text to *"This message was deleted"*.

### 4. Custom Contact Names
Users can rename contacts locally. The backend `Connection` schema holds a `requesterCustomName` and `recipientCustomName`. When the frontend loads the chat list, it checks these fields first. If a custom name exists, it overrides the default Google Display Name.

---

## 💬 Chat Mechanics & Serialization

### How Chat Between Two Users is Possible
Every accepted connection has exactly one `Conversation` document.
This document has a `participants` array containing both User A and User B's MongoDB ObjectIds.
When a message is sent, it is stored in the `messages` collection with a `conversationId`. To show the chat history, the database simply queries:
> *"Give me all messages where conversationId matches X, sorted by when they were created."*

### What if both users send a message at the exact same millisecond?
MongoDB handles this flawlessly:
1. **Concurrency Control:** MongoDB safely processes concurrent writes at the database level. Neither message is lost.
2. **Serialization (Ordering):** Messages are ordered strictly by the `createdAt` timestamp. 
3. **The Tie-breaker:** If two messages have the exact same millisecond timestamp, MongoDB relies on the `_id` (ObjectId). A MongoDB ObjectId is intrinsically chronologically sortable (it is made up of a 4-byte timestamp, a 5-byte random value, and a 3-byte incrementing counter). The database will effortlessly determine which message came first, ensuring both users see the messages in the exact same deterministic order.

### ⏱️ Why is there a 1-second delay?
You might notice a slight delay (up to 1 second) when receiving messages. 

**The Reason:** Chatrix is built for **Serverless environments** (like Vercel/Netlify). Serverless functions spin up to answer an HTTP request and immediately shut down. Because of this, we **cannot use WebSockets** (which require a continuous, open connection to the server).

**The Solution:** We use **Short Polling**. 
The React frontend uses React Query's `refetchInterval` feature to automatically send a silent `GET` request to the backend every `1000ms` (1 second). 
* **Pros:** It works perfectly on cheap/free serverless hosting.
* **Cons:** A message can take up to 1 second to appear because the frontend has to "ask" the database if a new message has arrived. 
*(Previously, this delay was set to 3 seconds, which we reduced to 1 second for a much snappier feel!)*
