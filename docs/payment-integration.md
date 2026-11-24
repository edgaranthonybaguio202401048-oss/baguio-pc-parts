# Payment Integration – Maya Checkout Sandbox (D-09)

| Item | Value |
|---|---|
| Gateway | **Maya Checkout**, sandbox (`https://pg-sandbox.paymaya.com`) |
| Keys | `MAYA_PUBLIC_KEY` (pk-…) creates checkouts · `MAYA_SECRET_KEY` (sk-…) reads payments – both **backend-only** |
| Dashboard | Maya Manager 1.0 sandbox: `https://manager-sandbox.paymaya.com` (generate keys, register webhooks) |
| Provider class | `backend/src/patterns/payment/MayaProvider.js` (extends `PaymentProvider`) |
| Façade | `backend/src/services/paymentService.js` |
| Webhook endpoint | `POST https://<api-host>/api/v1/webhooks/maya?token=<MAYA_WEBHOOK_TOKEN>` |
| Alternative | `PAYMENT_PROVIDER=paymongo` switches to `PayMongoProvider` (HMAC `Paymongo-Signature`) |

## Sandbox configuration
1. Sign up / log in to Maya Manager **sandbox**, open **API Keys**, copy the sandbox public (`pk-…`) and secret (`sk-…`) keys into the backend `.env` / Render env vars. Never into the frontend.
2. Generate a long random token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → `MAYA_WEBHOOK_TOKEN`.
3. In Maya Manager → **Webhooks**, register for the events **PAYMENT_SUCCESS, PAYMENT_FAILED, PAYMENT_EXPIRED, PAYMENT_CANCELLED** the URL
   `https://<your-render-app>.onrender.com/api/v1/webhooks/maya?token=<MAYA_WEBHOOK_TOKEN>` (HTTPS, domain name – not an IP or localhost). Note: Maya's docs say sandbox webhooks are sent only to URLs configured in **Maya Manager 1.0**, not Business Manager 2.0.
4. Keep `MAYA_WEBHOOK_ALLOWED_IPS=13.229.160.234,3.1.199.75` (Maya sandbox webhook IPs; production uses `18.138.50.235,3.1.207.200`). For local development with ngrok, the tunnel forwards the original IP in `X-Forwarded-For`, which Express reads via `trust proxy`.
5. Pay with Maya's published sandbox test cards / sandbox wallet accounts (see Maya's "Sandbox Credentials and Cards" page). Never use a real card.

## Checkout flow
1. `POST /api/v1/orders` – server prices the cart, creates `Order(pending_payment)`, reserves stock, then calls `POST /checkout/v1/checkouts` (Basic auth with the **public** key) with the **server** total, line items, buyer, `requestReferenceNumber = <orderNumber>-<random>` and redirect URLs:
   - success → `<FRONTEND_URL>/payment/success?orderId=…`
   - failure → `<FRONTEND_URL>/payment/cancelled?orderId=…&reason=failed`
   - cancel → `<FRONTEND_URL>/payment/cancelled?orderId=…`
2. Maya returns `{ checkoutId, redirectUrl }`; we store `Payment(gatewayRef = checkoutId, requestReference, amountCents, currency)` and return `checkoutUrl` to the PWA, which does `window.location.href = checkoutUrl`.
3. The return pages are **informational only**: they call `POST /orders/:id/verify-payment`, which asks Maya for the real status.

## Webhook verification – honest explanation for the defense
The brief asks for "the gateway's signature using the raw request body". **Maya Checkout does not send an HMAC signature header**; Maya's documented control is restricting webhooks to Maya's IP addresses. We therefore implement the strongest verification Maya allows, in `MayaProvider.verifyWebhook()` + `PaymentService.reconcilePayment()`:

1. **Shared secret in the registered URL** – `token` compared with `crypto.timingSafeEqual` (constant time). Missing/wrong → **401 `WEBHOOK_SIGNATURE_INVALID`**, nothing stored, order untouched, reason logged without the secret.
2. **Source IP allow-list** – Maya's published IPs (`MAYA_WEBHOOK_ALLOWED_IPS`).
3. **Never trust the body** – the raw body (kept as a Buffer by `express.raw` on the webhook router) is parsed only to find the payment id; we then call `GET /payments/v1/payments/{id}` with the **secret** key and act only on Maya's API answer (status, amount, currency).

For comparison, `PayMongoProvider.verifyWebhook()` shows true HMAC verification over the raw body (`HMAC-SHA256(secret, t + "." + rawBody)` compared to `te`/`li` in `Paymongo-Signature`). ⚠️ Confirm with your instructor that layered verification is acceptable for Maya, or switch `PAYMENT_PROVIDER=paymongo` if a signed gateway is required.

## Event log and idempotency
- Each webhook is inserted into `WebhookEvent` with UNIQUE `(provider, eventId)`; Maya has no event id, so `eventId = <paymentId>:<status>` (one row per state transition).
- Duplicate insert → `200 { duplicate: true }`, **no** payment or order change. A previously **failed** processing attempt may be retried.
- Unknown types → `200 { ignored: true }`, stored with status `ignored`.
- Admin can view the log: `GET /api/v1/admin/webhook-events` (dashboard shows the latest 5).

## Amount integrity
Before `paid`: Maya amount (pesos → centavos via `Math.round(x*100)`) must equal `Payment.amountCents` = `Order.totalCents`, and currency must equal `PHP`. Otherwise the payment becomes `mismatch`, the order gets `paymentFlagged=true` with `flagReason = "AMOUNT_MISMATCH: expected 1799500 PHP, gateway reported 100 PHP"`, a warning is logged with both values, and the dashboard lists it.

## Unhappy paths
| Case | Result |
|---|---|
| PAYMENT_FAILED / CANCELLED / EXPIRED (verified) | payment status updated; reservations released (stock back); order stays `pending_payment`; customer can retry (`POST /orders/:id/payment-session` → re-reserves stock or 409) |
| Customer never pays | 60-s sweep: after `RESERVATION_TTL_MINUTES` checks Maya first, then → `expired`, stock + coupon returned |
| Webhook missed | return page verification, admin **Reconcile with Maya**, or the sweep |
| Paid after expiry | re-reserve stock → `paid` (history note "late payment recovered"); if stock gone → flagged `LATE_PAYMENT_NO_STOCK` for refund |
| Paid twice (two tabs) | second payment flagged `DUPLICATE_PAYMENT` |
| Maya unreachable at checkout | order saved with stock held; response `paymentError`; customer retries from the order page |

## Evidence checklist (fill in before submission)
- [ ] Screen recording: checkout → Maya sandbox page → success → order **paid** (link: ______)
- [ ] Render log lines: `webhook.rejected`, `webhook.duplicate`, `order.transition … paid`
- [ ] Postman: "Maya webhook with forged token -> 401", replay test
- [ ] Admin webhook log screenshot
- [ ] Missed-webhook demo: disable the webhook in Maya Manager, pay, then press **Reconcile with Maya**
- [ ] `npm test` output showing `webhook.test.js` passing
