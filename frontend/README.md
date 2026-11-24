# Baguio PC Parts – Mobile-First React PWA (ITE101)

React 18 + Vite + `vite-plugin-pwa` (Workbox). Client only: **no Express code, database drivers, payment secrets or AI keys** – every operation goes through `src/api/` to the documented `/api/v1` REST API.

## Setup
```bash
npm install
cp .env.example .env       # VITE_API_BASE_URL=http://localhost:4000/api/v1
npm run dev                # http://localhost:5173
npm run build && npm run preview   # test the service worker on http://localhost:4173
npm run lint:secrets       # after build: fails if a key pattern is in dist/
```
Deploy on Vercel (root `frontend`, env `VITE_API_BASE_URL`). `vercel.json` / `public/_redirects` rewrite every path to `index.html` so `/products/:id`, `/payment/success`, `/orders/:id` deep links work.

## Syllabus topic → where it is implemented
| # | Topic | Files |
|---|---|---|
| 1 | Semantic HTML5 & mobile CSS | `components/Layout.jsx` (`header`, `nav`, `main`, `footer`), pages use `section`/`article`; `styles/global.css` (custom properties, Flexbox/Grid) |
| 2 | JSX & modular components | `components/ui.jsx` (SkeletonLoader, EmptyState, ErrorAlert, QuantityStepper, BottomSheet, FormField, StatusBadge, AiBadge), `ProductCard`, `CompatibilityPanel`, `Layout` (BottomNav, OfflineBanner) |
| 3 | Props & useState | QuantityStepper, Catalog filter drawer, Checkout form, Builds editor |
| 4 | useEffect & cleanup | `hooks/useApi.js` (AbortController), `hooks/useOnlineStatus.js` (online/offline listeners), `CartContext` (sync + cache), `PaymentResult` (polling timer cleanup), `BottomSheet` (keydown listener) |
| 5 | Conditional rendering & lists | skeletons, empty cart/orders states, `ErrorAlert` mapped from backend error codes (`utils/errorMessages.js`), lists keyed by DB ids |
| 6 | Lifting state / Context | `context/AuthContext.jsx` (JWT + role), `context/CartContext.jsx` (optimistic updates synced with `/api/v1/cart`), `context/NetworkStatusContext.jsx` |
| 7 | Forms & controlled components | Login, Register, Checkout shipping + coupon, Catalog search/filters, AI prompt (500-char limit), admin forms |
| 8 | Routing | `App.jsx`: `/`, `/products`, `/products/:id`, `/ai-assistant`, `/cart`, `/checkout`, `/payment/success`, `/payment/cancelled`, `/orders`, `/orders/:id`, `/login`, `/register`, `/builds`, `/builds/shared/:shareCode`, `/admin/*` (protected, admin role), `*` 404. Routes are `React.lazy` split. |

## API contract handling
- `api/client.js` parses `{ success, data, meta }` and `{ success:false, error:{code,message,details}, requestId }` → `ApiError`.
- 401 → session cleared + "sign in again" message · 403 → access notice · 409 → stock/state messages · 422 → field errors mapped onto inputs (`fieldErrorsFrom`) and coupon codes · 503 `AI_UNAVAILABLE` → keyword fallback list.
- **Idempotency:** `utils/idempotency.js` – one `crypto.randomUUID()` key per checkout attempt, kept across network retries; submit button disabled while in flight.
- **Payment:** checkout posts shipping + coupon only (no prices) and redirects with `window.location.href = checkoutUrl`. `/payment/success` and `/payment/cancelled` never mark anything paid – they call `POST /orders/:id/verify-payment` and display the server's status.
- **AI:** calls only `/api/v1/ai/build-advisor`; product cards use DB ids/prices from the response; "✨ AI-Assisted" label; text rendered as plain text (no `dangerouslySetInnerHTML`).

## PWA & offline
- Manifest: name, short_name, description, `start_url: "/"`, `display: standalone`, `orientation: portrait`, theme/background colours, 192 & 512 PNG icons + maskable 512.
- Precache: app shell (HTML, JS, CSS, icons, images).
- Runtime: `StaleWhileRevalidate` for `GET /api/v1/products|categories|shipping-options`; `CacheFirst` for images (30 days).
- Never cached: POST/PATCH/DELETE, `/auth`, `/cart`, `/orders`, `/checkout`, `/webhooks`, `/admin`, `/ai`.
- Offline UX: sticky **Offline Mode banner**; cached catalog browsing; last cart viewable read-only; Checkout, Pay, AI Advisor, Login, Register and cart edits disabled with "You're offline – … needs an internet connection".

## Mobile viewports tested
| Viewport | Result | Notes |
|---|---|---|
| 360 × 800 | ☐ | no horizontal scroll, 14 px+ text, bottom-nav labels fit |
| 390 × 844 | ☐ | 2-column grid, sticky Add-to-cart / Checkout bars |
| 412 × 915 | ☐ | proportional cards |
| 800 × 600 | ☐ | centred 480 px shell on backdrop |

## Lighthouse (mobile preset, production URL)
| Category | Minimum | Score | Date |
|---|---|---|---|
| Performance | ≥ 75 | | |
| Accessibility | ≥ 85 | | |
| Best Practices | ≥ 85 | | |
| SEO | ≥ 80 | | |
| PWA installable | pass | | |
Attach the PDF export / screenshot as `lighthouse-report.pdf`.
