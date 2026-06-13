# Tandem — PRD

## Overview
Tandem is an iOS-first React Native (Expo) mobile app that gives one person + their chosen partner a single calm space to share to-do lists, grocery lists, household chores, fleeting thoughts, journal entries, and a personal morning routine. Each day opens with an AI-generated life quote and the user's morning ritual checklist.

## Personas
- Primary: An individual who wants to organise their everyday life — and optionally share it with a partner, roommate, or family member.

## Core Features (MVP)
1. **Auth** — email + password signup/login (JWT, bcrypt, expo-secure-store).
2. **Today screen** — hero AI life quote (Claude Sonnet 4.5 via Emergent LLM key, cached per user per day) + morning routine checklist with daily completion tracking.
3. **Lists** — Create / view / delete to-do, grocery, and chores lists. Each list has CRUD items, check/uncheck, optional quantity (grocery). Filter chips (All / To-do / Grocery / Chores). Progress bar on cards.
4. **Thoughts** — quick masonry-style notes with optional partner sharing.
5. **Journal** — long-form entries with title, body, mood tag, optional sharing.
6. **Morning Routine editor** — add/reorder/remove steps; appears on Today screen.
7. **Sharing** — One partner per account, established via:
   - Invite by username/email (instant connect), or
   - Generate / accept 6-character invite code (with native Share sheet).
   When connected, all lists/thoughts/journal entries flagged as shared become visible to the partner.

## Tech
- Backend: FastAPI + Motor (MongoDB), JWT auth, emergentintegrations for Claude.
- Frontend: Expo SDK 54, expo-router file-based navigation, 4 bottom tabs (Today / Lists / Journal / You).
- Design: "Editorial Mobile" — terracotta brand `#A64D3C` on paper-white `#FDFCF9`, Fraunces (display) + DM Sans (body), 1px borders, no shadows.

## Smart Business Enhancement
**Shared Activity insight + future "Couples Premium"**: As partners co-use Tandem, we capture rich co-habitation data (which routines stick, which lists thrive, when journaling spikes). A future premium tier ($4.99/mo or $39/yr) can unlock: AI weekly relationship recap, shared mood trends, exportable journal books, unlimited shared connections, and partner-of-the-week celebrations — driving high retention because *both* people are bought in.

## Key API Endpoints (all under `/api`)
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `GET/POST /lists`, `GET/PATCH/DELETE /lists/{id}`
- `POST /lists/{id}/items`, `PATCH/DELETE /items/{id}`
- `GET/POST/DELETE /thoughts`, `GET/POST/DELETE /journal`
- `GET/PUT /routine`, `POST /routine/check`
- `GET /quote/today`
- `GET /connection`, `POST /connection/invite-user`, `POST /connection/code`, `POST /connection/accept-code`, `POST /connection/disconnect`

## Not in MVP (deferred)
- Push notifications
- Recurring chores logic / per-assignee chores
- Real-time partner presence
- Calendar / due-date reminders
- Multi-partner / group sharing
