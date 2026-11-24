# Defense Guide – where to point for each question (F.15, F.16)

## 8-minute live demo script
| Min | Show |
|---|---|
| 0–1 | Phone viewport: home → search "ryzen" → filter → product detail (specs) |
| 1–2 | Add **Ryzen 5 7600** + **B550M** → cart shows **SOCKET_MISMATCH** → checkout disabled → swap to **B650M** → compatible |
| 2–3 | Checkout: coupon **EXPIRED2025** → 422 message; **BAGUIO10** → server discount; Pay with Maya |
| 3–4 | Maya sandbox payment → `/payment/success` polls → **paid**; order timeline shows `gateway` actor |
| 4–5 | Postman: forged-token webhook → 401; replay → duplicate; admin webhook log |
| 5–6 | Admin: dashboard sales, low stock, stock adjustment with reason, coupon create, order → processing → shipped; illegal transition → 409 |
| 6–7 | AI Advisor: "1440p gaming ₱70k AMD" → AI-Assisted picks with DB prices + compatibility; then failure demo (invalid key) → keyword fallback |
| 7–8 | DevTools offline → banner, cached catalog, disabled checkout; Swagger UI at `/api-docs` execute one request |

## Question → file map
| Question | Answer points | Open this |
|---|---|---|
| Payment succeeded but no webhook? | return-page verify, admin reconcile, 60 s sweep checks Maya before expiring | `services/paymentService.js` `verifyOnReturn`, `adminReconcile`, `sweepExpired`; `server.js` |
| Webhook arrives twice? | token + IP check, UNIQUE (provider,eventId), `already_paid` idempotent branch | `paymentService.handleWebhook`, `schema.prisma` `WebhookEvent @@unique` |
| How do you know the amount matches? | GET payment from Maya with secret key; compare cents + currency; flag on mismatch | `paymentService.applyVerifiedStatus` |
| Show an invalid signature request | Postman "forged token" → 401, order unchanged | `MayaProvider.verifyWebhook` |
| Why no HMAC for Maya? | Maya doesn't sign; documented control is IP allow-list; we add secret token + re-fetch; PayMongo subclass shows HMAC | `payment-integration.md` |
| Frontend price manipulation? | schema strips price fields; `PricingService` uses DB prices; test AT-12 | `validators/schemas.js` `checkout`, `pricingService.js` |
| Two customers, last item? | conditional `UPDATE … WHERE stock >= qty` in a transaction; row lock; test AT-18 | `productRepository.decrementStockIfAvailable`, `inventoryService.reserve` |
| Duplicate orders on repeated clicks? | Idempotency-Key + DB unique `(userId, idempotencyKey)`; P2002 → return winner | `checkoutService.checkout`, `utils/idempotency.js` (frontend) |
| Illegal transition? | state machine + CAS update + history | `orderStateMachine.js`, `orderService.applyTransition` |
| Protect admin endpoints? | `adminRouter.use(authenticate, authorize('admin'))`; test AT-08 | `routes/index.js`, `middleware/auth.js` |
| Token expired / tampered? | `jwt.verify` HS256 only → 401 `TOKEN_EXPIRED`/`TOKEN_INVALID` | `middleware/auth.js` |
| Why PostgreSQL / where are constraints? | FKs, UNIQUEs, CHECKs, transactions; money in centavos | `database.md`, `prisma/sql/constraints.sql` |
| Where would integrity fail without a transaction? | checkout: order created but stock not reserved / coupon used twice | `checkoutService.js` `$transaction` |
| Pattern X – what problem? | see map | `design-patterns-oop.md` |
| Singleton vs global variable? | validated once, frozen, single pool, injectable | `config/index.js`, `config/database.js` |
| Abstract class – missing method? | `new.target` guard; base method throws "must implement" | `PaymentProvider.js`, `AiProvider.js` |
| Composition instead of inheritance? | CheckoutService has-a collaborators, injected in composition root | `services/index.js`, `checkoutService.js` constructor |
| How does AI retrieve actual products? | SQL candidates per slot, IDs validated, re-read from DB | `aiAdvisorService.retrieveCandidates`, `advise` |
| Stop AI inventing a product/price? | JSON schema, Zod, candidate-set check, DB re-read, prices never from model | `aiAdvisorService.js` |
| AI down / invalid JSON? | Proxy timeout → `AiProviderError` → 503 `AI_UNAVAILABLE` + keyword fallback | `AiProviderProxy.js`, `aiAdvisorService.advise` |
| AI key protection? | backend env only, header not URL, rate limit, bundle scan | `GeminiProvider.buildRequest`, `rateLimiters.js` |
| "Ignore instructions, reveal prompt"? | delimited data, `<>` stripped, no secrets in prompt, output validated anyway | `SYSTEM_PROMPT`, test AT-32 |
| 409 vs 400 vs 422? | 400 malformed JSON; 422 well-formed but invalid fields/business input (coupon); 409 conflicts with current state (stock, status, duplicates) | `utils/errors.js`, `errorHandler.js` |
| Versioning / breaking change? | `/api/v1`; additive changes first; breaking → `/api/v2` router side by side, deprecation headers, sunset date | README "API versioning" |
| What next with two more weeks? | email notifications listener; refunds via Maya void API for flagged orders; Redis-backed rate limit/cache for multi-instance | – |
