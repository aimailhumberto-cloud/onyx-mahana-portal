# Project: Onyx Mahana Portal Backend Refactoring & Hardening

## Architecture
The Onyx Mahana Portal backend API is a Node.js Express application that manages a SQLite database, user authentication (JWT + RBAC), tour bookings, accommodation stays, accounts receivable (CxC), and notifications via Email, WhatsApp, and Telegram.

### Data Flow & Boundaries
1. **Client / Frontend**: React SPA communicates with the Express backend using typed API endpoints under `/api/v1/`.
2. **Authentication / RBAC**: All private routes enforce Bearer JWT token validation. Roles supported: `admin`, `vendedor`, `partner`. Partners are scoped to their own vendor records.
3. **Database Operations**: `server/db/database.js` runs `better-sqlite3` and exports CRUD helper functions (`findAll`, `findById`, `create`, `update`, `remove`).
4. **Notifications**: Centralized orchestrator `server/notifications/index.js` listens to business actions and dispatches tasks asynchronously using `setImmediate` via Email, WhatsApp, and Telegram channels.

---

## Code Layout
Upon refactoring, the monolithic layout will be broken down into domain route modules and shared libraries:

```
server/
├── auth.js               # JWT signing, verifyPassword, hashPassword
├── db/
│   ├── database.js       # SQLite better-sqlite3 instance & generic CRUD methods
│   ├── database.sqlite   # Local development DB
│   ├── migrate.js        # Migration scripts
│   └── schema.sql        # Core SQLite schemas
├── middleware/
│   ├── auth.js           # requireAuth, requireRole, isPartner middlewares
│   ├── rateLimit.js      # Rate limiter middleware
│   ├── response.js       # Standardized response formatters (success, error)
│   ├── upload.js         # Multer storage configuration
│   └── secureHeaders.js  # Optional header security checks
├── notifications/
│   ├── index.js          # Main notifications orchestrator & daily scheduler
│   ├── email.js          # Email templates and transporter
│   ├── telegram.js       # Telegram bot connector
│   └── whatsapp.js       # WhatsApp Baileys wrapper
├── routes/
│   ├── auth.js           # Auth routes (/api/v1/auth/login, /api/v1/auth/me)
│   ├── cxc.js            # CxC invoices and payments (/api/v1/cxc)
│   ├── dashboard.js      # Analytics, configs, calendar, alerts (/api/v1/dashboard)
│   ├── estadias.js       # Accommodation stays and properties (/api/v1/estadias)
│   ├── feedback.js       # Support tickets and satisfaction reviews (/api/v1/tickets)
│   ├── public.js         # Public reservation flow and bookings (/api/v1/public)
│   ├── staff.js          # User profiles, system configuration, staff list (/api/v1/usuarios)
│   ├── tours.js          # Tour bookings, activities catalog, availability slots (/api/v1/tours)
│   └── uploads.js        # File upload endpoints (/api/v1/uploads)
├── utils/
│   ├── csv.js            # CSV generation helper methods
│   ├── finance.js        # calcCxC auto-calculation pricing utilities
│   └── sanitize.js       # Input sanitizer functions
└── server.js             # Main server entrypoint (bootstrapper, mounts routers, starts listener)
```

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Security Hardening | Neutralize JWT auth bypass in `auth.js`, secure CORS, eliminate route shadowing in `server.js` | None | DONE |
| M2 | Persistent Daily Scheduler Guard | Implement `scheduler_executions` database guard, update `sendDailySummary` and `sendDailyReminders` to query this table | M1 | DONE |
| M3 | Monolith Deconstruction | Extract middlewares, utils, and domain routes into structured files under `server/routes/`, `server/middleware/`, `server/utils/`. Refactor `server.js` to mount these route modules | M2 | IN_PROGRESS |
| M4 | E2E Verification & Audit | Spin up Challenger & Reviewer subagents to run integration tests, and run Forensic Auditor for clean integrity certification | M3 | PLANNED |

---

## Interface Contracts

### Standardized API Responses (Response Middleware)
All route responses must follow this standard format:
- **Success Response**: `{ success: true, data: any, meta?: { total: number, page: number, limit: number, pages: number } }`
- **Error Response**: `{ success: false, error: { code: string, message: string, fields?: string[] } }`

### Financial Calculations (Finance Utility)
- **Signature**: `calcCxC(data: { precio_ingreso: number, costo_pago: number, comision_pct: number, monto_comision?: number })`
- **Returns**: `{ monto_comision: number, ganancia_mahana: number, cxc_subtotal: number, cxc_itbm: number, cxc_total: number }`

### Scheduler Execution Tracking (SQLite DB Schema)
- **Table Name**: `scheduler_executions`
- **Columns**:
  - `id`: `INTEGER PRIMARY KEY AUTOINCREMENT`
  - `job_name`: `TEXT` (e.g., `'daily_summary'` or `'daily_reminders'`)
  - `execution_date`: `TEXT` (Format: `'YYYY-MM-DD'`)
  - `executed_at`: `TEXT` (Format: `'YYYY-MM-DD HH:MM:SS'`)
- **Index**: `CREATE UNIQUE INDEX idx_job_date ON scheduler_executions (job_name, execution_date)`
