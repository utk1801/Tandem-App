# Tandem — PRD

## Overview
Tandem is an iOS-first React Native (Expo) mobile app that gives one person + their chosen partner a single calm space to share to-do lists, grocery lists, household chores, fleeting thoughts, journal entries, a personal morning routine, dated tasks with reminders, and a shared event calendar. Each day opens with an AI-generated life quote.

## Core Features
1. **Auth** — email + password signup/login (JWT, bcrypt, expo-secure-store).
2. **Today screen** — hero AI life quote (Claude Sonnet 4.5, cached per user per day) + morning routine checklist + "Coming up" preview of next 5 events within 2 weeks.
3. **Lists** (to-do / grocery / chores) — full CRUD, filter chips, progress bars.
   - **NEW: per-item due dates + local reminder.** Item composer now has a bell icon → opens reminder sheet. Pick a date (Today / Tomorrow / next 7 days), 24-hour time, and "remind me" preset (At time / 5 min / 30 min / 1 hr / 1 day / 1 week before). A local notification is scheduled via `expo-notifications`. Overdue items are highlighted in red. Completing or deleting an item auto-cancels its reminder.
4. **NEW: Calendar tab** — 5th bottom tab. Events grouped by month → day, magazine-layout list with day number on the left and event cards on the right. Long-press to delete.
   - Event fields: title, date, optional time, optional location, optional notes, "remind me before" preset, share-with-partner toggle.
   - Local notification scheduled per event automatically; cancelled on delete.
5. **Thoughts** + **Journal** — quick masonry cards + long-form entries with mood, per-entry share toggle.
6. **Morning Routine editor** — add/reorder/remove steps; show on Today.
7. **Sharing** — one partner per account (username/email invite OR 6-char invite code via native Share). All shared lists, items, thoughts, journals, and events flow to the connected partner automatically.

## Notifications
- **Local-only** scheduled via `expo-notifications` `scheduleNotificationAsync` with `{ type: "date", date }` trigger.
- Persistent map of `entityKey → notificationId` in `@/src/utils/storage` so cancel / reschedule survives app restarts.
- Permission requested contextually the first time a user adds a reminder. Handles denied + "Open Settings" through `Linking.openSettings()` on subsequent attempts (TODO: add explicit settings deep-link banner if permission stays denied).
- Works in Expo Go for local schedules; no server, no Firebase, no `google-services.json` required.

## Tech
- Backend: FastAPI + Motor (MongoDB), JWT auth, emergentintegrations for Claude.
- Frontend: Expo SDK 54, expo-router file-based nav, 5 bottom tabs (Today / Lists / Calendar / Journal / You), expo-notifications, expo-haptics, expo-linear-gradient.
- Design: "Editorial Mobile" — terracotta `#A64D3C` on paper-white, Fraunces (display) + DM Sans (body), 1px borders, no shadows.

## Smart Business Enhancement
**Couples Premium ($4.99/mo)** unlocks: AI weekly relationship recap, shared mood + reminder-completion trends, exportable journal books, partner-of-the-week celebrations, unlimited connections, and smart anniversary/birthday surfacing inside Calendar. High retention because both partners are bought in.

## Key API Endpoints (all under `/api`)
- Auth: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- Lists: `GET/POST /lists`, `GET/PATCH/DELETE /lists/{id}`, `POST /lists/{id}/items`, `PATCH/DELETE /items/{id}` (items now accept `due_at` and `remind_minutes_before`)
- Thoughts: `GET/POST/DELETE /thoughts`
- Journal: `GET/POST/DELETE /journal`
- Routine: `GET/PUT /routine`, `POST /routine/check`
- **NEW Events: `GET/POST /events`, `PATCH/DELETE /events/{id}`**
- Quote: `GET /quote/today`
- Connection: `GET /connection`, `POST /connection/invite-user`, `POST /connection/code`, `POST /connection/accept-code`, `POST /connection/disconnect`

## Not in MVP / deferred
- Cross-device push (would need Emergent push + Firebase + a build — user opted for local-only for now)
- Recurring events / recurring tasks
- Multi-partner / group sharing
- Calendar month-grid view (currently list grouped by day)
