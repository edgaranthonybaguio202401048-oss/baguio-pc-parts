# Business Rules (L3-04)

Every rule below is enforced **on the server**. The UI may hide buttons, but the API is the authority.
Money is integer centavos; currency PHP.

## Core commerce rules (Levels 1–2)

| # | Rule | Enforced by (endpoint → code) | Error when violated |
|---|---|---|---|
| C1 | Prices, discounts and totals are recomputed from database prices; any price/total sent by the client is ignored | `POST /orders`, `POST /checkout/preview` → `PricingService.quote()` | (silently ignored – correct total returned) |
| C2 | Rounding: percentage discount = `floor(subtotal × % / 100)` to the centavo, then capped by `maxDiscountCents`, never above subtotal. Shipping is computed on the post-discount subtotal. Gateway pesos → centavos with `Math.round(x × 100)` | `utils/money.js`, `patterns/discount/discountStrategies.js` | – |
| C3 | Cart quantity cannot exceed available stock (max 20 per line) | `POST /cart/items`, `PATCH /cart/items/:productId` | 409 `INSUFFICIENT_STOCK`, 422 `QUANTITY_LIMIT` |
| C4 | Inactive/deleted products cannot be viewed by customers or bought | `GET /products/:id`, `POST /orders` | 404 `NOT_FOUND`, 409 `PRODUCT_UNAVAILABLE` |
| C5 | Coupon must exist | checkout/preview | 422 `COUPON_NOT_FOUND` |
| C6 | Coupon must be active | checkout/preview | 422 `COUPON_INACTIVE` |
| C7 | Coupon must have started / not expired | checkout/preview | 422 `COUPON_NOT_STARTED` / `COUPON_EXPIRED` |
| C8 | Subtotal must reach `minSpendCents` | checkout/preview | 422 `COUPON_MIN_SPEND_NOT_MET` |
| C9 | Total usage limit (atomic conditional increment – concurrent checkouts cannot exceed it; DB CHECK `usedCount <= usageLimit`) | `POST /orders` | 422 `COUPON_EXHAUSTED` |
| C10 | Per-customer limit (count of `CouponRedemption` rows) | checkout/preview | 422 `COUPON_CUSTOMER_LIMIT_REACHED` |
| C11 | A cancelled/expired order gives its coupon use back | `OrderService.releaseResources()` | – |
| C12 | Stock is reserved atomically at checkout (`UPDATE … WHERE stock >= qty`) for `RESERVATION_TTL_MINUTES` (30) | `POST /orders` → `InventoryService.reserve()` | 409 `OUT_OF_STOCK` (whole order rolls back) |
| C13 | Two simultaneous checkouts for the last unit → exactly one succeeds | Postgres row lock + conditional update | 409 `OUT_OF_STOCK` for the loser |
| C14 | Checkout requires an `Idempotency-Key`; the same key returns the same order (DB unique `(userId, idempotencyKey)`) | `POST /orders` | 422 `IDEMPOTENCY_KEY_REQUIRED`; replay → 200 + `Idempotent-Replayed: true` |
| C15 | Stock can never be negative (DB CHECK + conditional update) | `POST /admin/products/:id/stock-adjustments` | 409 `STOCK_WOULD_BE_NEGATIVE` |
| C16 | Every stock movement is audited (previous, new, delta, reason, actor, order, time) | `InventoryAdjustment` table | – |
| C17 | Products with order/build/stock history are soft-deleted (deactivated), never hard-deleted | `DELETE /admin/products/:id` | 204 with `X-Delete-Mode: soft` |
| C18 | Used coupons cannot be deleted – deactivate instead | `DELETE /admin/coupons/:id` | 409 `COUPON_IN_USE` |
| C19 | A customer can only see/cancel their own orders | `GET /orders/:id`, `POST /orders/:id/cancel` | 404 `NOT_FOUND` |
| C20 | Only `pending_payment` orders can be cancelled by the customer | `POST /orders/:id/cancel` | 409 `ORDER_NOT_CANCELLABLE` |

## Order lifecycle (L2-04)

```
pending_payment ──(gateway/system: verified payment)──▶ paid ──(admin)──▶ processing ──(admin)──▶ shipped ──(admin)──▶ delivered
      │
      ├──(customer/admin)──▶ cancelled ──┐
      └──(system: hold expired)──▶ expired ┴──(gateway only: verified LATE payment + stock re-reserved)──▶ paid
```
Source of truth: `backend/src/services/orderStateMachine.js`. Anything else → **409 `ILLEGAL_TRANSITION`** (details list the allowed targets). Every transition writes `OrderStatusHistory` (from, to, actorType, actorId, note, timestamp). Updates use compare-and-set on the current status → 409 `CONCURRENT_UPDATE` if two actors race.
For in-store pickup, `shipped` means "ready for pickup" (notification text adapts).

## Payment rules (L2-05 … L2-09)

| # | Rule | Where | Result |
|---|---|---|---|
| P1 | An order becomes `paid` only after the backend fetches the payment from Maya's API and verifies status = PAYMENT_SUCCESS | `PaymentService.reconcilePayment()` | redirects/webhook bodies are hints only |
| P2 | Webhooks must carry the secret token and come from Maya's IPs | `POST /webhooks/maya` | 401 `WEBHOOK_SIGNATURE_INVALID`, order untouched |
| P3 | Each webhook event is stored once (unique `(provider, eventId)`); replays are acknowledged with no side effects | `WebhookEvent` | 200 `{ duplicate: true }` |
| P4 | Unknown event types are acknowledged and ignored | webhook | 200 `{ ignored: true }` |
| P5 | Gateway amount and currency must equal the stored order total | reconcile | order **flagged** `AMOUNT_MISMATCH…`, not paid; visible on admin dashboard |
| P6 | Failed / cancelled / expired payment → order stays unpaid, stock released, customer may retry with a NEW session | reconcile, `POST /orders/:id/payment-session` | 201 new checkout URL (409 `OUT_OF_STOCK` if gone) |
| P7 | Missed webhook recovery: return page (`POST /orders/:id/verify-payment`), admin button (`POST /admin/orders/:id/reconcile`) and a 60-second scheduled sweep that checks Maya before expiring any order | `server.js`, `PaymentService.sweepExpired()` | – |
| P8 | Late payment on an expired/cancelled order: re-reserve stock → paid; if stock is gone → flagged `LATE_PAYMENT_NO_STOCK` for manual refund. A paid order is never silently reversed | reconcile | flagged |
| P9 | A second successful payment for an already-paid order is flagged `DUPLICATE_PAYMENT` | reconcile | flagged |

## L3-A Compatibility Engine (`services/compatibilityService.js`)

| Code | Rule | Severity |
|---|---|---|
| `SOCKET_MISMATCH` | CPU `socket` = motherboard `socket` | error |
| `CPU_MEMORY_UNSUPPORTED` | CPU `memoryType` (e.g. `DDR4/DDR5`) includes board `memoryType` | error |
| `RAM_TYPE_MISMATCH` | RAM `memoryType` = board `memoryType` | error |
| `RAM_SLOTS_EXCEEDED` | Σ(RAM modules × qty) ≤ board `ramSlots` | error |
| `FORM_FACTOR_MISMATCH` | board `formFactor` ∈ case `supportedFormFactors` | error |
| `GPU_TOO_LONG` | GPU `lengthMm` ≤ case `maxGpuLengthMm` | error |
| `PSU_INSUFFICIENT` | PSU `wattage` ≥ estimated draw (80 W base + CPU TDP + GPU TDP) | error |
| `PSU_LOW_HEADROOM` | PSU ≥ max(1.3 × draw rounded up to 50 W, GPU recommended PSU) | warning |
| `NO_DISPLAY_OUTPUT` | CPU without iGPU and no GPU | warning |
| `MULTIPLE_PARTS` | >1 distinct product of a type in the cart → pair checks for that type skipped (customer may be buying for two PCs) | warning |
| `SLOT_TYPE_MISMATCH`, `DUPLICATE_SLOT` | builds only | error (422 `BUILD_INVALID_SLOTS`) |
| `MISSING_PART` | builds only | warning |

Enforced at: `POST /builds/compatibility-check` (report), `GET /cart` (report), `POST /checkout/preview` (report), **`POST /orders` → 409 `CART_INCOMPATIBLE`**.

## L3-B PC Build Planner (`services/buildService.js`)

| # | Rule | Endpoint | Error |
|---|---|---|---|
| B1 | Max 10 saved builds per customer | `POST /builds` | 409 `BUILD_LIMIT_REACHED` |
| B2 | Parts must exist, be active and sit in the slot of their component type | `POST/PATCH /builds` | 422 `PRODUCT_NOT_FOUND` / `BUILD_INVALID_SLOTS` |
| B3 | Only compatible builds can be public/shared | `POST/PATCH /builds` with `isPublic: true` | 409 `BUILD_INCOMPATIBLE` |
| B4 | Add-to-cart requires zero compatibility errors and stock for every part; all-or-nothing transaction | `POST /builds/:id/add-to-cart` | 409 `BUILD_INCOMPATIBLE` / `OUT_OF_STOCK` |
| B5 | Builds are private to the owner; shared view exposes only owner's first name | `GET /builds/:id`, `GET /builds/shared/:code` | 404 |

## Shipping fees (Strategy)
| Method | Fee |
|---|---|
| `store_pickup` | ₱0 |
| `baguio_delivery` | ₱150, free at ₱15,000+ (after discount) |
| `luzon_courier` | ₱350, free at ₱50,000+ (after discount) |
