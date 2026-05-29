# Original User Request

## Initial Request — 2026-05-29T12:17:25Z

Refactoring and security hardening of the Onyx Mahana Portal backend API to eliminate a critical authentication bypass, stabilize the daily scheduler, and break the 4,554-line monolith into structured, domain-based route modules.

Working directory: `C:\Users\Usuario\.gemini\antigravity\scratch\onyx-mahana-portal`
Integrity mode: development

## Requirements

### R1. Security Hardening (Blindaje de API Key y CORS)
- Remove the `requireAuth` fallback in `server/auth.js` that allows bypassing JWT validation via the header `x-api-key` using default keys. All API endpoints must enforce strict JWT token validation.
- Secure the CORS middleware in `server.js` so that if the `ALLOWED_ORIGINS` environment variable is not defined, it does not default to reflecting the request origin with credentials enabled.
- Remove the dead middleware function `requireApiKey` from `server.js` completely.

### R2. Stable Daily Scheduler (Evitar Doble Envío)
- Implement a persistent execution guard in the database (e.g., a simple logs/tracking table in SQLite) to ensure the daily summary (7:00 AM Panama) and daily reminders (6:00 PM Panama) are executed **exactly once** per day.
- The scheduler must query this table before executing `sendDailySummary` and `sendDailyReminders` to check if a successful execution already occurred for the current date, protecting against double runs due to event loop drift or server restarts.

### R3. Modularization (Break the Monolith)
- Deconstruct the 4,554-line `server/server.js` file into a modular structure under `server/` (e.g., introducing a `server/routes/` or `server/controllers/` folder).
- Group routes logically by domain into separate files:
  - `server/routes/tours.js` (Tours & reservations endpoints)
  - `server/routes/estadias.js` (Accommodation endpoints)
  - `server/routes/cxc.js` (Invoicing & Accounts Receivable endpoints)
  - `server/routes/whatsapp.js` (WhatsApp config/status/QR endpoints)
  - `server/routes/public.js` (Public endpoints)
  - `server/routes/feedback.js` (Tickets & satisfaction reviews endpoints)
- Ensure `server.js` remains clean, importing and mounting these domain routes without containing duplicate inline business logic.

## Acceptance Criteria

### Security & API Consistency
- [ ] No API endpoint accepts `x-api-key` fallbacks to bypass JWT validation.
- [ ] All existing endpoints (Tours, Estadías, CxC, etc.) continue to function with the exact same request/response structures to ensure backwards compatibility with the React frontend.
- [ ] The server boots successfully (`npm run dev` or `node server/server.js`) without any runtime compilation or execution errors.

### Scheduler Stability
- [ ] Recordatorios and daily summaries are logged in a database table upon execution.
- [ ] Running the scheduler check twice in the same minute does not trigger duplicate email or WhatsApp deliveries.

### Architectural Cleanliness
- [ ] `server/server.js` is reduced to under 300 lines of code, serving only to initialize the express application, load middlewares, mount routes, and start the listener.
