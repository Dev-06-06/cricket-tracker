# CricTrack 🏏

> **From gully to glory — track every ball.**

CricTrack is a full-stack, real-time cricket match management platform built for local and gully cricket groups. It handles everything from toss to final result — live ball-by-ball scoring, automatic strike rotation, over breaks, wicket flows, and per-group career statistics — all synced instantly across every connected device via WebSockets.

🔗 **Live App:** [bit.ly/crictrack](https://bit.ly/crictrack) &nbsp;|&nbsp; 📦 **Repo:** [github.com/Dev-06-06/cricket-tracker](https://github.com/Dev-06-06/cricket-tracker)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, React Router DOM 7, Tailwind CSS 4 |
| Backend | Node.js, Express 4 |
| Real-time | Socket.IO 4 — WebSocket-only transport |
| Database | MongoDB Atlas (Singapore) via Mongoose 8 |
| Auth | JWT (15-day sessions), bcryptjs |
| Security | express-rate-limit, Socket.IO JWT handshake auth |
| Deployment | Vercel (frontend) · Render (backend) |

---

## Features

### 🔐 Auth & Profiles
- Register, login, password reset, and profile update (name, email, photo)
- JWT sessions with 15-day expiry; all REST routes and Socket.IO handshakes are token-authenticated

### 👥 Groups & Players
- Create groups with auto-generated 6-character invite codes
- Admin and member roles; join, leave, and manage group player pools
- Registered and guest player support; per-group career statistics isolated from global profiles

### 🏟️ Match Lifecycle
- Full status pipeline: **Upcoming → Toss → Innings Setup → Live → Innings Complete → Completed**
- Create upcoming matches, view live and completed match lists, delete matches
- Joker player support — one player can appear in both teams within a single match

### 🪙 Toss
- Custom coin flip animation — 1800° rotateY arc over 2.2s with cubic-bezier easing and ambient glow pulse
- Multi-step flow with animated progress indicators; bat/bowl choice after winner selection

### ⚡ Live Scoring (Umpire View)
- Record every delivery: runs, wides, no-balls, byes, leg-byes, wickets
- Automatic strike rotation on odd runs and end-of-over
- Wicket flow — opens next-batsman selection drawer automatically
- Over break flow — bowler selection screen between every over
- Bench and replace batsmen mid-innings
- Undo last delivery
- Socket auto-reconnects silently (`reconnectionAttempts: Infinity`) and re-joins match room on recovery

### 📺 Live Scoreboard (Viewer View)
- Real-time score, current batting pair, active bowler, overs bowled, wickets fallen
- First innings summary, second innings target, ball-by-ball commentary feed
- Dark scoreboard shell (`bg-slate-950`) with `Barlow Condensed` tabular score digits that never shift width on update

### 📊 Career Statistics
- Per-group batting: runs, balls, fours, sixes, dismissals, 30s / 50s / 100s, highest score
- Per-group bowling: overs, runs, wickets, economy, 3W / 4W / 5W hauls, best figures
- Stats recalculated deterministically from match data at completion — never accumulated live

---

## Project Structure
```
cricket-tracker/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js                  # MongoDB Atlas connection
│   │   ├── controllers/
│   │   │   ├── authController.js      # Register, login, profile, reset password
│   │   │   ├── groupController.js     # Groups CRUD, invite codes, player pool
│   │   │   ├── matchController.js     # Match creation, listing, deletion
│   │   │   └── playerController.js    # Player creation, group-scoped stats
│   │   ├── middleware/
│   │   │   └── authMiddleware.js      # JWT Bearer token verification
│   │   ├── models/
│   │   │   ├── User.js                # User schema
│   │   │   ├── Player.js              # Player schema
│   │   │   ├── Group.js               # Group schema with invite code
│   │   │   ├── Match.js               # Match schema with embedded player snapshots
│   │   │   └── GroupPlayerStats.js    # Per-group career stats schema
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── groupRoutes.js
│   │   │   ├── matchRoutes.js
│   │   │   └── playerRoutes.js
│   │   ├── sockets/
│   │   │   └── matchSocket.js         # All Socket.IO live match event handlers (~2,000 lines)
│   │   ├── utils/
│   │   │   └── statsUpdater.js        # Deterministic stat recalculation at match end
│   │   └── server.js                  # Express + Socket.IO entry point
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── BottomNav.jsx           # App-wide bottom navigation bar
    │   │   ├── BottomSheet.jsx         # Reusable slide-up drawer primitive
    │   │   ├── BottomSheetOption.jsx   # Option row inside BottomSheet
    │   │   ├── ErrorBoundary.jsx       # React error boundary wrapper
    │   │   ├── GroupChip.jsx           # Active group pill indicator
    │   │   ├── OverBreakDrawer.jsx     # Bowler selection drawer between overs
    │   │   ├── PlayerManagerTab.jsx    # Player pool management UI
    │   │   └── ProfileToolbarButton.jsx
    │   ├── context/
    │   │   ├── AuthContext.jsx         # JWT auth state, login/logout
    │   │   └── ActiveGroupContext.jsx  # Currently selected group across pages
    │   ├── hooks/
    │   │   └── usePageCache.js         # Caches page scroll position
    │   ├── pages/
    │   │   ├── LandingPage.jsx         # Marketing landing (~1,255 lines)
    │   │   ├── HomePage.jsx            # Live / Upcoming / Completed match lists
    │   │   ├── GroupsPage.jsx          # Group creation, joining, management
    │   │   ├── LoginPage.jsx
    │   │   ├── RegisterPage.jsx
    │   │   ├── ResetPasswordPage.jsx
    │   │   ├── TossPage.jsx            # Coin flip animation + toss flow
    │   │   ├── UmpireSetupPage.jsx     # Opening lineup selection (~1,502 lines)
    │   │   ├── UmpireScorerPage.jsx    # Live scoring engine (~1,776 lines)
    │   │   ├── ScoreboardPage.jsx      # Live viewer scoreboard (~2,589 lines)
    │   │   ├── ScorerPage.jsx          # Scorer role entry point
    │   │   ├── PlayerProfilesPage.jsx  # Per-group career stats viewer
    │   │   └── UserProfilePage.jsx     # Profile update page
    │   ├── routes/
    │   │   └── RequireAuth.jsx         # JWT-gated route guard
    │   ├── services/
    │   │   ├── api.js                  # Axios API client
    │   │   └── socket.js               # Socket.IO client (WS-only, auto-reconnect)
    │   ├── utils/
    │   │   └── matchResult.js          # Win/loss/tie calculation helpers
    │   └── App.jsx                     # Route definitions
    ├── vercel.json                      # SPA rewrite config for Vercel
    └── package.json
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster (free tier works)

### 1. Clone the repo
```bash
git clone https://github.com/Dev-06-06/cricket-tracker.git
cd cricket-tracker
```

### 2. Backend
```bash
cd backend
npm install
```

Create `backend/.env`:
```env
JWT_SECRET=your_jwt_secret_here
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=your_mongodb_atlas_connection_string
```
```bash
npm run dev
# API running at http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
npm install
```

Create `frontend/.env.local` (optional — defaults to localhost):
```env
VITE_API_BASE_URL=http://localhost:5000
```
```bash
npm run dev
# App running at http://localhost:5173
```

---

## Environment Variables

### Backend — `backend/.env`

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Secret key for signing JWTs |
| `PORT` | Server port (default: `5000`) |
| `CLIENT_ORIGIN` | CORS allowed origin (e.g. `https://your-app.vercel.app`) |
| `MONGODB_URI` | MongoDB Atlas connection string |

### Frontend — `frontend/.env.local`

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (e.g. `https://your-backend.onrender.com`) |

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register new user (rate-limited) |
| POST | `/login` | Login (rate-limited) |
| GET | `/me` | Get current user info |
| PUT | `/profile` | Update name, email, photo |
| POST | `/reset-password` | Reset password (rate-limited) |

### Groups — `/api/groups`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Create a group |
| GET | `/` | List all user's groups |
| POST | `/join` | Join group via invite code |
| POST | `/:groupId/leave` | Leave a group |
| GET | `/:groupId/players` | List players in a group |
| POST | `/:groupId/players` | Add player to group |
| DELETE | `/:groupId/players/:playerId` | Remove player from group |

### Matches — `/api/match`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Create match |
| POST | `/upcoming` | Create upcoming match |
| GET | `/live` | List live matches |
| GET | `/upcoming` | List upcoming matches |
| GET | `/completed` | List completed matches |
| GET | `/ongoing` | Get user's ongoing match |
| GET | `/:id` | Get match details |
| DELETE | `/:id` | Delete match |

### Players — `/api/players`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List all players (rate-limited) |
| POST | `/` | Create player (rate-limited) |
| GET | `/by-group/:groupId` | Players with group career stats |

---

## Socket.IO Events

### Client → Server

| Event | Purpose |
|---|---|
| `joinMatch` | Join match room, receive full state |
| `tossResult` | Finalize toss winner and bat/bowl choice |
| `setOpeners` | Set opening batter pair and first bowler |
| `setNewBatter` | Bring in batsman after a wicket |
| `setNewBowler` | Select bowler for a new over |
| `umpire_update` | Record a delivery (runs, extras, wicket) |
| `benchAndReplace` | Bench a batsman and bring in replacement |
| `overBreakCommit` | Finalize over break and confirm new bowler |
| `swapStriker` | Manually rotate strike |
| `undo_delivery` | Undo the last recorded ball |
| `complete_match` | Mark match as completed |

### Server → Client

| Event | What It Carries |
|---|---|
| `matchState` | Full match state — teams, players, score, innings, stats |
| `fullTimeline` | Complete ball-by-ball commentary array |
| `innings_complete` | First innings has ended |
| `overBreakStarted` | Over break begun, bowler selection required |
| `inningsBreakStarted` | Second innings starting |
| `match_completed` | Final result and updated career statistics |
| `groupMatchUpdate` | Group-level match status change |
| `matchError` | Error message from the server |

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| **Embedded player snapshots in Match documents** | Avoids `populate()` on hot scoring paths; match state reads are a single document fetch |
| **`GroupPlayerStats` separate from Player** | Career stats are group-scoped by design — the same player can have different histories in different groups |
| **Deterministic stat recalculation** | Stats computed from match records at completion, never accumulated live — eliminates drift from undos and corrections |
| **Socket.IO VersionError retry (3 attempts, exponential backoff)** | Concurrent delivery writes on the same match document are safe without a distributed lock |
| **WebSocket-only transport** | Long-polling disabled to eliminate upgrade latency on mobile networks |
| **`Barlow Condensed` with `tabular-nums`** | Score digits never shift layout width between single and double digits during live updates |

---

*Built with React, Node.js, Socket.IO, and MongoDB Atlas.*
