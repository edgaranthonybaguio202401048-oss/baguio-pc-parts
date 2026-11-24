# Baguio PC Parts 🖥️🌲
**AI-enhanced PC components store – Express REST API + PostgreSQL + Maya Checkout + Gemini + React PWA**

ITPE101 (IT PROFEL 1 – Integrative Programming & Technologies 2) Final Project · also serves as the ITE101 Mobile PWA client.

| | |
|---|---|
| Live frontend | `https://<your-app>.vercel.app` |
| Live API | `https://<your-api>.onrender.com/api/v1` |
| Swagger UI | `https://<your-api>.onrender.com/api-docs` |
| Concept | [docs/concept-statement.md](docs/concept-statement.md) |

### What makes it more than a template
- **Level 3 – Compatibility Engine:** socket, RAM type, slots, case form factor, GPU length and PSU wattage are checked on the server; incompatible carts cannot check out (409 `CART_INCOMPATIBLE`).
- **Level 3 – PC Build Planner:** save up to 10 builds, share compatible builds by link, add a whole build to the cart atomically.
- **Level 4 – AI Build Advisor:** Gemini picks only from in-stock products retrieved from Postgres; every ID/price is validated against the DB; 503 + keyword fallback on failure.
- **Level 2 money safety:** server pricing, atomic stock reservation, idempotent checkout, webhook replay protection, amount/currency verification, reconciliation for missed webhooks.

---

## Repository structure
```
baguio-pc-parts/
├── backend/                 Express API (CommonJS, Node ≥ 20)
│   ├── prisma/              schema.prisma, seed.js, sql/constraints.sql
│   ├── scripts/             reset-dev-db.js
│   ├── src/
│   │   ├── config/          env config + Prisma client (singletons)
│   │   ├── routes/          routers only
│   │   ├── controllers/     request → service → envelope
│   │   ├── services/        business rules (checkout, pricing, inventory, orders, payments, builds, AI)
│   │   ├── repositories/    data access (Prisma)
│   │   ├── middleware/      auth, roles, validation, errors, rate limits
│   │   ├── patterns/        payment & AI providers + factories, proxy, strategies, observer
│   │   ├── validators/      Zod request schemas
│   │   └── utils/           money, errors, logger, response, dto
│   ├── tests/               Jest + Supertest integration tests
│   ├── openapi.yaml
│   └── .env.example
├── frontend/                React + Vite PWA (vite-plugin-pwa / Workbox)
├── docs/                    architecture, database, patterns/OOP, AI, payments, business rules, test plan, code review, contributions, defense guide
├── postman/                 collection.json (56 requests) + environment.example.json
└── README.md
```

## Prerequisites
- Node.js **20 LTS or 22 LTS**, npm 10
- PostgreSQL 15+ (local install, Docker, or a free **Neon** project) – you need **two** databases: `baguio_pc_parts` (dev) and `baguio_pc_parts_test` (tests)
- Maya **sandbox** account (Maya Manager 1.0 sandbox) – public + secret sandbox keys
- Google AI Studio **Gemini API key**
- (optional) ngrok for receiving webhooks on localhost

## Installation
```bash
git clone <repo-url> baguio-pc-parts && cd baguio-pc-parts

# Backend
cd backend
npm install                     # also runs `prisma generate`
cp .env.example .env            # fill in values – see table below
npx prisma migrate dev --name init   # first time only: creates & applies the migration (commit prisma/migrations!)
npm run db:constraints          # CHECK constraints (stock >= 0, etc.)
npm run db:seed                 # demo data
npm run dev                     # http://localhost:4000  · docs: http://localhost:4000/api-docs

# Frontend (new terminal)
cd ../frontend
npm install
cp .env.example .env            # VITE_API_BASE_URL=http://localhost:4000/api/v1
npm run dev                     # http://localhost:5173
```

## Environment variables (backend `.env`)
| Key | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://postgres:postgres@localhost:5432/baguio_pc_parts` or Neon URL (`?sslmode=require`) |
| `JWT_SECRET` | ✅ | ≥ 32 random chars – `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | | `2h` |
| `CORS_ORIGINS` | ✅ | `http://localhost:5173,https://<your-app>.vercel.app` (no wildcard) |
| `FRONTEND_URL` | ✅ | used for Maya redirect URLs |
| `API_PUBLIC_URL` | | shown in Swagger "servers" |
| `PAYMENT_PROVIDER` | | `maya` (default) or `paymongo` |
| `MAYA_PUBLIC_KEY` / `MAYA_SECRET_KEY` | ✅ | sandbox `pk-…` / `sk-…` |
| `MAYA_WEBHOOK_TOKEN` | ✅ | long random string, part of the registered webhook URL |
| `MAYA_WEBHOOK_ALLOWED_IPS` | | `13.229.160.234,3.1.199.75` (sandbox) |
| `RESERVATION_TTL_MINUTES` | | `30` |
| `GEMINI_API_KEY` | ✅ | from Google AI Studio |
| `GEMINI_MODEL` | | `gemini-2.5-flash` |
| `AI_TIMEOUT_MS`, `AI_MAX_INPUT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_RATE_LIMIT_PER_15_MIN`, `AI_CACHE_TTL_SECONDS` | | cost controls |

`.env` is git-ignored. **Never** put keys in `frontend/.env` – everything prefixed `VITE_` ships to the browser.

## Commands
| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` / `npm start` | run API (dev with nodemon) |
| backend | `npm run db:seed` | repeatable seed (upserts – no duplicates) |
| backend | `npm run db:reset` | drop + recreate **dev** DB, migrate, constraints, seed (refuses on production) |
| backend | `npm run db:deploy` | `prisma migrate deploy` + constraints (production) |
| backend | `npm test` | Jest + Supertest integration tests against `.env.test` DB (name must contain "test") |
| backend | `npm run audit` | dependency audit |
| frontend | `npm run dev` / `npm run build` / `npm run preview` | Vite |
| frontend | `npm run lint:secrets` | scans `dist/` for leaked keys |

## Demo accounts (test-only credentials created by the seed)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@baguiopcparts.test` | `Admin#2026` |
| Customer | `juan@baguiopcparts.test` | `Customer#2026` |
| Customer | `maria@baguiopcparts.test` | `Customer#2026` |

Demo data: 26 products / 8 categories, **Ryzen 7 7800X3D has stock 1** (concurrency demo). Coupons: `BAGUIO10`, `STUDENT500`, `EXPIRED2025` (expired), `PANAGBENGA1` (single use). Pay only with Maya's published **sandbox** test cards.

## API overview
Base path `/api/v1`. Envelopes: `{ success: true, data, meta }` / `{ success: false, error: { code, message, details }, requestId }`. Full contract: `backend/openapi.yaml`, live at `/api-docs`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Catalog | `GET /products` (search, category, componentType, brand, minPrice, maxPrice, inStock, sort, page, limit), `GET /products/:id`, `GET /categories`, `GET /shipping-options` |
| Cart | `GET/DELETE /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:productId` |
| Checkout & orders | `POST /checkout/preview`, `POST /orders` (Idempotency-Key), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/payment-session`, `POST /orders/:id/verify-payment` |
| Webhooks | `POST /webhooks/maya?token=…`, `POST /webhooks/paymongo` |
| Builds (L3) | `POST /builds/compatibility-check`, `GET /builds/shared/:shareCode`, `GET/POST /builds`, `GET/PATCH/DELETE /builds/:id`, `POST /builds/:id/add-to-cart` |
| AI (L4) | `POST /ai/build-advisor` |
| Admin | `GET /admin/dashboard`, products CRUD + `stock-adjustments`, categories, coupons CRUD, `GET /admin/orders` (status/from/to/flagged), `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status`, `POST /admin/orders/:id/reconcile`, `GET /admin/webhook-events` |

### API versioning (T-07)
All routes live under `/api/v1` (one Express router, `src/routes/index.js`). Non-breaking changes (new optional fields, new endpoints) are added to v1. A breaking change (renaming a field, changing a status code or envelope) would be built as a new `src/routes/v2` router mounted at `/api/v2` **alongside** v1; v1 responses would then carry `Deprecation` and `Sunset` headers with a migration note in the README, and v1 would be removed only after the PWA and any other clients have moved to v2.

## Deployment
**Database – Neon:** create a project → copy the pooled connection string into `DATABASE_URL`. Allow access only from your backend (Neon requires SSL + password; do not publish the URL).

**API – Render (Web Service):**
- Root directory `backend` · Build: `npm ci && npm run db:deploy` · Start: `npm start` · Health check path `/health`
- Add every variable from `.env.example` in Render → Environment (`NODE_ENV=production`, `API_PUBLIC_URL=https://<api>.onrender.com`, `FRONTEND_URL=https://<app>.vercel.app`, `CORS_ORIGINS=https://<app>.vercel.app`)
- Seed once: Render Shell → `npm run db:seed` (or run locally with the Neon URL)
- Register the Maya webhook: `https://<api>.onrender.com/api/v1/webhooks/maya?token=<MAYA_WEBHOOK_TOKEN>`
- Free instances sleep: open `/health` a few minutes before the defense.

**Frontend – Vercel:** root directory `frontend`, framework Vite, env `VITE_API_BASE_URL=https://<api>.onrender.com/api/v1`. `vercel.json` rewrites all routes to `index.html`, so deep links like `/products/:id` and `/payment/success` never 404 (Netlify: `public/_redirects`).

**Local webhooks:** `ngrok http 4000` → register `https://<id>.ngrok-free.app/api/v1/webhooks/maya?token=…` in Maya Manager sandbox; update it when the tunnel changes.

## Documentation index
| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | context diagram, layers, checkout + webhook + missed-webhook sequence, class model |
| [docs/database.md](docs/database.md) | ERD, tables, constraints, indexes, transactions, seed/reset |
| [docs/design-patterns-oop.md](docs/design-patterns-oop.md) | 7 patterns with files, flows, trade-offs, rejected alternatives; abstract classes, inheritance, composition |
| [docs/business-rules.md](docs/business-rules.md) | every rule, enforcing endpoint, error code |
| [docs/payment-integration.md](docs/payment-integration.md) | Maya sandbox setup, verification, idempotency, unhappy paths |
| [docs/ai-integration.md](docs/ai-integration.md) | provider, prompt, retrieval, validation, fallback, cost & privacy |
| [docs/test-plan.md](docs/test-plan.md) | 36 automated + manual cases (fill in actual results) |
| [docs/code-review.md](docs/code-review.md) / [docs/contributions.md](docs/contributions.md) | templates to complete from your real PRs and Git history |
| [docs/defense-guide.md](docs/defense-guide.md) | demo script + question → file map |
| [frontend/README.md](frontend/README.md) | PWA, viewports, Lighthouse |

## Security summary
bcrypt (12 rounds) · JWT HS256 with expiry · role middleware on every admin route · Zod `.strict()` validation on every write · Prisma parameterised queries · Helmet · CORS allow-list · rate limits on auth/AI/API · generic 500s with requestId · webhook token (constant-time) + IP allow-list + server-side payment re-fetch · secrets only in env · AI output treated as untrusted text.
