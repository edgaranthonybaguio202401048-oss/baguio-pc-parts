# Test Plan and Results (D-11, T-15)

> **"Passing tests are shown, not claimed."** The *Actual* and *Date* columns are blank on purpose. Run the commands below, paste the real output into the Evidence section, and fill each row. Do not mark a row Pass unless you saw it pass.

## How to run
```bash
cd backend
cp .env.test.example .env.test        # point DATABASE_URL at a disposable DB whose name contains "test"
npm test                              # Jest + Supertest, --runInBand, recreates the test schema first
```
Postman: import `postman/collection.json` + `postman/environment.example.json`, run `npm run db:reset` first, then **Run collection** (or `npx newman run postman/collection.json -e postman/environment.example.json`).

## Automated integration tests (T-14, T-25)
Tests call the real Express app over HTTP against a real PostgreSQL test database; only Maya and Gemini (external internet services) are replaced with a `fetch` stub. Every test file truncates tables before running, so the suite can run repeatedly.

| ID | File › test | Requirement | Expected | Actual | Date |
|---|---|---|---|---|---|
| AT-01 | auth › register stores only a bcrypt hash | L1-01, S-01 | 201, hash `$2…`, no plain password | | |
| AT-02 | auth › duplicate email | L1-01 | 409 `EMAIL_TAKEN` | | |
| AT-03 | auth › wrong password vs unknown email | L1-01 | both 401, identical error | | |
| AT-04 | auth › `{ "$ne": null }` login | S-05 | 422, no bypass | | |
| AT-05 | auth › `role: admin` in register | T-03 | 422 unknown field | | |
| AT-06 | auth › tampered / expired token | S-02 | 401 / `TOKEN_EXPIRED` | | |
| AT-07 | roles › no token on 6 admin routes | L1-02 | 401 each | | |
| AT-08 | roles › customer token on 6 admin routes (incl. nested) | S-03 | 403 each | | |
| AT-09 | roles › admin dashboard reconciles with DB | L1-12 | 200, zeros, low-stock contains CPU-LAST | | |
| AT-10 | roles › stock adjustment audited; negative blocked | L1-10 | 201 prev 4 → 7; then 409 | | |
| AT-11 | roles › negative price | L1-09 | 422 field `priceCents` | | |
| AT-12 | checkout › tampered totals ignored | L2-02 | 201, total = 2×₱11,495; Maya sent ₱22,990 | | |
| AT-13 | checkout › expired coupon | L2-01 | 422 `COUPON_EXPIRED`, no order, stock unchanged | | |
| AT-14 | checkout › percentage coupon floor + shipping | L2-01, C2 | discount 114950, fee 15000 | | |
| AT-15 | checkout › min spend | L2-01 | 422 `COUPON_MIN_SPEND_NOT_MET` | | |
| AT-16 | checkout › same Idempotency-Key | L2-08 | 201 then 200 same id, 1 order, stock −1 once | | |
| AT-17 | checkout › missing key | L2-08 | 422 `IDEMPOTENCY_KEY_REQUIRED` | | |
| AT-18 | checkout › **concurrent last unit** | L2-03 | statuses [201, 409]; stock 0; 1 order | | |
| AT-19 | checkout › add > stock to cart | L1-05 | 409 `INSUFFICIENT_STOCK` | | |
| AT-20 | checkout › other customer's order / cancel paid | L1-07 | 404 / 409 | | |
| AT-21 | webhook › forged token | L2-05, S-07 | 401, order unchanged, no event row | | |
| AT-22 | webhook › success then replay | L2-05 | paid once; 2nd `duplicate`; 1 history row; reservation committed | | |
| AT-23 | webhook › amount mismatch | L2-09, S-08 | flagged, still pending, reason shows both values | | |
| AT-24 | webhook › body says success, gateway pending | L2-06 | no change | | |
| AT-25 | webhook › failed → stock released → retry session | L2-07 | stock 4, new checkout, stock 3 | | |
| AT-26 | webhook › missed webhook via verify-payment | L2-06 | paid | | |
| AT-27 | webhook › unknown event type | L2-05 | 200 ignored | | |
| AT-28 | ai › provider outage | L4-06 | 503 `AI_UNAVAILABLE` + fallback products, no stack | | |
| AT-29 | ai › invalid JSON from model | L4-04 | 503 reason `invalid_json` | | |
| AT-30 | ai › invented ID & wrong slot discarded; DB prices | L4-03/04/05 | 2 picks, discarded 2, total from DB | | |
| AT-31 | ai › prompt > 500 chars | L4-08 | 422 | | |
| AT-32 | ai › key in header; tag cannot be closed by user | L4-07 | asserted | | |
| AT-33 | builds › AM5 CPU + AM4 board | L3-02 | `SOCKET_MISMATCH` | | |
| AT-34 | builds › share incompatible build | L3-02 | 409; private save 201; add-to-cart 409 | | |
| AT-35 | builds › incompatible cart checkout | L3-02 | 409 `CART_INCOMPATIBLE` | | |
| AT-36 | builds › illegal transition | L2-04 | 409 `ILLEGAL_TRANSITION`, history unchanged | | |

## Postman collection (T-12, T-13) – 56 requests, 8 folders
Negative cases included: unauthenticated (cart, admin), forbidden (customer → admin), not-found (product, other's order), invalid input (injection, quantity 0, negative price, long prompt), out-of-stock (cart > stock), invalid coupon (expired, unknown), **invalid webhook signature** (forged token), **duplicate idempotency** (same key → same order), webhook replay, illegal transition.

| Run | Requests | Assertions passed / total | Date | Runner |
|---|---|---|---|---|
| Local | 56 | __ / __ | | |
| Deployed | 56 | __ / __ | | |

## Manual test cases (deployed system)
| ID | Steps | Expected | Actual | Date |
|---|---|---|---|---|
| MT-01 | Pay a real Maya **sandbox** checkout end to end | redirect → success page → order `paid` via webhook (history actor `gateway`) | | |
| MT-02 | Cancel on Maya's page | `/payment/cancelled`, order still `pending_payment`, retry works | | |
| MT-03 | Disable webhook in Maya Manager, pay, press **Reconcile with Maya** | order `paid`, outcome `paid` | | |
| MT-04 | Re-send a delivered webhook from Maya Manager / Postman | `duplicate: true`, no change | | |
| MT-05 | Two phones buy the Ryzen 7 7800X3D at the same time | one Maya page, one "last unit" error | | |
| MT-06 | AI advisor with real Gemini key | grounded picks, AI-Assisted badge | | |
| MT-07 | AI advisor with invalid key on Render | keyword fallback shown | | |
| MT-08 | Chrome DevTools offline | offline banner, cached catalog, checkout/AI disabled | | |
| MT-09 | Lighthouse mobile on production URL | Perf ≥ 75, A11y ≥ 85, BP ≥ 85, SEO ≥ 80, PWA installable | | |
| MT-10 | Viewports 360×800, 390×844, 412×915, 800×600 | no horizontal scroll, tap targets ≥ 44 px | | |

## Security checks
| Check | Command / method | Result | Date |
|---|---|---|---|
| Dependency audit (S-13) | `cd backend && npm audit --omit=dev` ; `cd frontend && npm audit --omit=dev` | paste summary; explain any critical | |
| No secrets in repo (S-06) | `git log -p \| grep -nE "sk-[A-Za-z0-9]{20}\|AIza"` | none | |
| No secrets in bundle (S-12) | `cd frontend && npm run build && npm run lint:secrets` | ✓ | |
| CORS (S-09) | `curl -H "Origin: https://evil.example" <api>/api/v1/products -i` | 403 `CORS_ORIGIN_DENIED` | |
| Headers (S-10) | `curl -I <api>/health` | Helmet headers present | |
| Forced 500 (S-11) | stop DB / bad query | generic message + requestId only | |

## Evidence
```
<paste `npm test` output here>
```

## Known limitations
- Maya does not sign webhooks; verification = secret URL token + IP allow-list + server-side re-fetch (see payment-integration.md).
- AI response cache and rate-limit counters are in memory (reset on restart; one instance assumed).
- Observer events are in-process; a crash between DB commit and publish can skip a notification (never a payment).
- JWT stored in `localStorage` (XSS would expose it); mitigated by React escaping, no `dangerouslySetInnerHTML`, short expiry (2 h).
- No refunds (out of scope) – flagged payments require manual handling in Maya Manager.
