# Tandem

iOS-first couple companion app — shared lists, calendar, journal, and morning routine in one calm space.

## Features

**Today** — AI daily quote (cached per user per day) + morning routine checklist + upcoming events preview.

**Lists** — Shared to-do, grocery, and chores lists with progress tracking, due dates, and local reminders.

**Calendar** — Shared event calendar with optional reminders and partner sharing.

**Journal** — Quick thoughts and long-form journal entries with mood tracking.

**Together** — Partner connection via invite code; all shared items flow to both accounts.

## Architecture

```
frontend/          Expo (React Native) — iOS app
backend/           FastAPI — REST API, Supabase + Firebase integration
supabase_schema.sql  DB schema for Supabase
render.yaml        Render Blueprint for backend deployment
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Expo SDK 54, React Native, expo-router |
| Backend | FastAPI, Python 3.11 |
| Auth | Supabase Auth (email+password) |
| Database | Supabase (PostgreSQL via Supabase Py client) |
| Push | Firebase Cloud Messaging (FCM) |
| AI | Anthropic Claude via `litellm` |

## API Reference

All endpoints require `Authorization: Bearer <supabase_token>` header unless noted.

**Auth**
- `GET /api/auth/me` — current user profile
- `PATCH /api/profile` — update profile

**Lists**
- `GET /api/lists`
- `POST /api/lists`
- `GET /api/lists/{list_id}`
- `PATCH /api/lists/{list_id}`
- `DELETE /api/lists/{list_id}`
- `POST /api/lists/{list_id}/items`
- `PATCH /api/items/{item_id}`
- `DELETE /api/items/{item_id}`
- `GET /api/items/{item_id}`

**Calendar**
- `GET /api/events`
- `POST /api/events`
- `GET /api/events/{eid}`
- `PATCH /api/events/{eid}`
- `DELETE /api/events/{eid}`

**Journal**
- `GET /api/thoughts`
- `POST /api/thoughts`
- `GET /api/thoughts/{tid}`
- `PATCH /api/thoughts/{tid}`
- `DELETE /api/thoughts/{tid}`
- `GET /api/journal`
- `POST /api/journal`
- `GET /api/journal/{jid}`
- `PATCH /api/journal/{jid}`
- `DELETE /api/journal/{jid}`

**Routine**
- `GET /api/routine`
- `PUT /api/routine`
- `POST /api/routine/check`
- `GET /api/quote/today`

**Connection**
- `GET /api/connection`
- `POST /api/connection/invite-user`
- `POST /api/connection/code`
- `POST /api/connection/accept-code`
- `POST /api/connection/disconnect`

**Push**
- `POST /api/register-push` — register device FCM/APNs token

**Health**
- `GET /api/` — redirected to API docs
- `GET /api/health`

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Expo CLI (`npx expo`)
- Supabase project
- Firebase project (for push notifications)

### Frontend

```bash
cd frontend
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_ANON_KEY
npx expo start
```

### Backend

```bash
cd backend
cp ../.env.example .env
# Fill in all SUPABASE_* and FIREBASE_* vars
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

To run in Docker:
```bash
docker build -t tandem-api .
docker run -p 8000:8000 --env-file .env tandem-api
```

### Environment Variables

**Frontend** (`frontend/.env`)
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon_key>
```

**Backend** (`backend/.env` / Render secret env vars)
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_JWT_SECRET=<jwt_secret>
FIREBASE_SERVICE_ACCOUNT_KEY=<firebase_service_account_json>
FIREBASE_PROJECT_ID=<firebase_project_id>
AWS_ACCESS_KEY_ID=<optional>
AWS_SECRET_ACCESS_KEY=<optional>
AWS_REGION=us-west-2
PORT=8000
```

### Supabase Setup

1. Create a Supabase project
2. Run `supabase_schema.sql` in the SQL editor
3. Enable Email Auth in Supabase dashboard
4. Copy project URL and keys

### Push Notifications

1. Create a Firebase project
2. Download the service account JSON
3. Set `FIREBASE_SERVICE_ACCOUNT_KEY` as the raw JSON string (or `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` for file-based)
4. For iOS push: add APNs credentials to Firebase project
5. The app auto-registers FCM tokens on login via `POST /api/register-push`

## Deploy

### Backend — Render (Free Tier)

```bash
# Log in to Render and connect this repo
# Add env vars in dashboard (Settings → Environment)
# Deploy from Blueprint or trigger manual deploy

# Or via CLI:
render blueprint apply
```

Free tier: 512MB RAM, 0.5 CPU, sleeps after 15 min inactivity. Cold start ~30s.

For production: upgrade to `starter` plan in `render.yaml`.

### Frontend — EAS Build

```bash
cd frontend
eas build --local --profile preview
# Or cloud:
eas build --profile preview
```

## Database Schema

See `supabase_schema.sql` for full schema including:

- `profiles` — user profiles
- `lists`, `list_items` — shared lists and items with due dates
- `thoughts` — quick thoughts
- `journal` — journal entries with mood
- `routine`, `routine_checks` — morning routine tracking
- `events` — calendar events with reminders
- `push_tokens` — device FCM tokens
- `connection_requests` — partner invites

All user data is scoped by `owner_id` (RLS policies enforced via Supabase).