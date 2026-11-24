# Design Patterns and OOP (D-07, B.5.3, B.5.4)

Seven patterns are implemented **in the live request path** (MVC + 2 creational + 4 structural/behavioral). Each section answers: problem · files · collaborators & flow · trade-off · rejected alternative.

## Pattern map

| Pattern | Kind | Files | Used by (live path) |
|---|---|---|---|
| MVC (layered) | architectural | `routes/` → `controllers/` → `services/` → `repositories/` | every request |
| Singleton | creational | `config/index.js`, `config/database.js` | every repository / service |
| Factory Method | creational | `patterns/payment/PaymentProviderFactory.js`, `patterns/ai/AiProviderFactory.js` | `PaymentService`, `AiAdvisorService` |
| Façade | structural | `services/paymentService.js` | `orderController`, `webhookController`, `adminController`, `CheckoutService` |
| Proxy | structural | `patterns/ai/AiProviderProxy.js` | `AiAdvisorService.advise()` |
| Decorator | structural | `middleware/asyncHandler.js` (+ `controllers/_wrap.js`), `middleware/validate.js` | every controller |
| Strategy | behavioral | `patterns/discount/discountStrategies.js`, `patterns/shipping/shippingStrategies.js` | `PricingService.quote()` |
| Observer | behavioral | `patterns/observer/orderEvents.js`, `patterns/observer/listeners.js` | `CheckoutService`, `OrderService`, `PaymentService` publish |

---

## 1. MVC (layered)
- **Problem:** Express lets you write SQL inside a route. That mixes HTTP, business rules and persistence, making the money logic untestable and impossible to reuse (the same "mark paid" logic is needed by the webhook, the return page, the admin button and the sweep).
- **Files:** `src/routes/index.js` (paths + middleware only) · `src/controllers/*.js` (read request, call one service, format envelope) · `src/services/*.js` (rules) · `src/repositories/*.js` (Prisma) · View = React PWA consuming JSON.
- **Flow:** `POST /api/v1/orders` → `routes/index.js` → `orderController.checkout` → `checkoutService.checkout` → `orderRepository.create` / `productRepository.decrementStockIfAvailable` → Postgres.
- **Trade-off:** more files and indirection; one change may touch 3 layers. In return, services are reused by four entry points and tested over HTTP.
- **Rejected:** "fat routes" (logic in route handlers) – duplicated payment logic and no way to inject fakes.

## 2. Singleton – configuration and database client
- **Problem:** creating a `PrismaClient` per request opens a new pool each time and exhausts Neon's small connection limit; reading `process.env` everywhere spreads unvalidated strings through the code.
- **Files:** `config/index.js` validates env with Zod once and exports a **frozen** object; `config/database.js` exports one `PrismaClient` (cached on `globalThis` in dev so nodemon reloads don't leak pools).
- **Flow:** `BaseRepository` constructor defaults to the singleton client; services receive repositories; `config` is required where needed.
- **Why it is not a "global junk drawer":** it holds only immutable configuration and the DB handle, is initialised in a controlled place (fails fast on bad env), and tests can still inject a different `db` via constructors.
- **Trade-off:** hidden dependency if overused → mitigated by constructor injection defaults.
- **Rejected:** a mutable global `app.locals.db` – any module could replace it at runtime.

## 3. Factory Method – payment and AI providers
- **Problem:** `PaymentService` must not care whether the gateway is Maya or PayMongo; tests must be able to swap providers; the brief recommends switching gateways by config.
- **Files:** `patterns/payment/PaymentProviderFactory.js` (`createPaymentProvider(name = config.payment.provider)`), products `MayaProvider`, `PayMongoProvider` (both extend abstract `PaymentProvider`). Same for AI: `AiProviderFactory.getAiProvider()` → `GeminiProvider` / `OpenAiProvider` wrapped in the proxy.
- **Flow:** `PaymentService.createSession()` → `this.providerFactory()` → returns cached `MayaProvider` → `createCheckout()`. Webhook route asks `this.providerFactory('maya')`.
- **Trade-off:** one more indirection; a registry must be kept in sync with new providers.
- **Rejected:** `if (provider === 'maya') … else …` inside the service – every new gateway would edit the service and its tests.

## 4. Façade – PaymentService
- **Problem:** a payment touches gateway HTTP calls, webhook verification, event de-duplication, amount checks, stock commit/release, order transitions and notifications. Controllers must not orchestrate that.
- **Files:** `services/paymentService.js` – public surface: `createSession`, `retrySession`, `handleWebhook`, `verifyOnReturn`, `adminReconcile`, `sweepExpired`.
- **Flow:** `webhookController.maya` → `paymentService.handleWebhook('maya', raw)` → provider.verifyWebhook → `webhookEventRepository.insertIfNew` → `reconcilePayment` → provider.retrievePayment → `applyVerifiedStatus` (transaction: inventory.commit, orderService.applyTransition) → `orderEvents.publishAll`.
- **Trade-off:** the façade is the largest service; it must be kept cohesive (only payment concerns).
- **Rejected:** letting controllers call Maya + repositories directly – four controllers would each re-implement verification and could drift.

## 5. Proxy – AiProviderProxy
- **Problem:** AI calls are slow, cost money and can hang; we also need privacy-safe logging. Adding this inside `GeminiProvider` would duplicate it in `OpenAiProvider`.
- **Files:** `patterns/ai/AiProviderProxy.js` – same `generateJson(input)` interface as a real provider.
- **Flow:** `AiAdvisorService.advise()` → `getAiProvider()` returns the **proxy** → cache lookup → `AbortController` timeout (`AI_TIMEOUT_MS`) → real `GeminiProvider.generateJson()` → log provider/latency/outcome (never prompt text or key) → store in cache.
- **Trade-off:** in-memory cache is per-instance and lost on restart (acceptable for one Render instance).
- **Rejected:** a caching middleware on the route – it would cache the whole HTTP response including DB-fresh prices/stock, which must never be stale.

## 6. Decorator – asyncHandler and validate
- **Problem:** Express 4 doesn't catch rejected promises; every async controller would need try/catch. Validation would otherwise be repeated in each controller.
- **Files:** `middleware/asyncHandler.js` wraps a handler and forwards errors to `next`; `controllers/_wrap.js` applies it to every controller method; `middleware/validate.js` returns a wrapper that validates `params/query/body` before the handler runs.
- **Flow:** `router.post('/orders', validate({ body }), orders.checkout)` – `orders.checkout` is `asyncHandler(original)`.
- **Trade-off:** stack traces include the wrapper frame.
- **Rejected:** try/catch in every controller (inconsistent error shapes).

## 7. Strategy – discounts and shipping fees
- **Problem:** coupons are percentage (with cap) or fixed; shipping depends on method (pickup, Baguio delivery, Luzon courier). `if/else` chains in pricing grow with every promo.
- **Files:** `DiscountStrategy` (abstract) → `PercentageDiscount`, `FixedAmountDiscount`; shipping `StorePickup`, `BaguioDelivery`, `LuzonCourier` – same `fee(amount)` contract.
- **Flow:** `PricingService.quote()` → `discountStrategyFor(coupon.type).calculate(subtotal, coupon)` → `shippingStrategyFor(method).fee(afterDiscount)` – selected **at runtime** from data.
- **Trade-off:** small classes for small formulas.
- **Rejected:** storing formulas in the DB (harder to test, injection risk).

## 8. Observer – order events
- **Problem:** after an order changes state we create notifications, write audit logs and check low stock. Putting those calls in `OrderService` couples it to every side effect.
- **Files:** subject `patterns/observer/orderEvents.js` (EventEmitter singleton with `publishAll`); subscribers `patterns/observer/listeners.js` (registered once in `app.js`).
- **Flow:** services collect events **inside** a transaction and publish **after commit** (`order.created`, `order.status_changed`, `payment.failed`, `payment.flagged`) → listeners create `Notification` rows, log `order.transition`, warn on low stock. Adding a listener (e.g. email) doesn't change `OrderService`.
- **Trade-off:** in-process events are lost if the process crashes between commit and publish (acceptable: they are notifications, not money).
- **Rejected:** message broker (out of scope per brief D.4).

---

## OOP: inheritance, abstract classes, composition (T-16 … T-20)

### Abstract base classes (T-16)
| Base | Abstract operations | Cannot be instantiated |
|---|---|---|
| `PaymentProvider` (`patterns/payment/PaymentProvider.js`) | `createCheckout`, `verifyWebhook`, `parseWebhookEvent`, `retrievePayment` (4) | `new PaymentProvider()` → `TypeError: PaymentProvider is abstract…` (`new.target` check); a subclass missing a method throws `"MayaProvider must implement retrievePayment()"` |
| `AiProvider` (`patterns/ai/AiProvider.js`) | `buildRequest`, `extractText` (2) + template method `generateJson` | same `new.target` guard |
| `DiscountStrategy` | `calculate` | throws if not overridden |

### Inheritance + polymorphism (T-17)
- `MayaProvider` and `PayMongoProvider` extend `PaymentProvider`; `PaymentService` only ever calls the base-type methods on whatever the factory returns – the webhook route uses Maya, a config flag switches checkout to PayMongo.
- `GeminiProvider` and `OpenAiProvider` extend `AiProvider`; the proxy and `AiAdvisorService` only know `generateJson`.
- Tests exercise the Maya path end-to-end (`tests/webhook.test.js`, `tests/checkout.test.js`) and the Gemini path (`tests/ai.test.js`).

### Composition (T-18)
`CheckoutService` **has a** `PricingService`, `InventoryService`, `PaymentService` (façade), `CartService`, `OrderRepository`, `CouponRepository`, `CartRepository` – all injected in `services/index.js`. `PaymentService` has an `OrderService` and `InventoryService`; `PricingService` has a coupon repository and strategies.

### Encapsulation (T-19)
- Routes never touch the database or mutate state; only services change data, via repositories.
- Config is `Object.freeze`d; `req.user` is frozen by the auth middleware.
- Invariants are guarded in one place each: stock (`InventoryService` + DB CHECK), status (`orderStateMachine.assertTransition` + compare-and-set), money (`PricingService`).
- Stock cannot be edited via `PATCH /admin/products/:id` (schema omits `stock`) – only through the audited adjustment endpoint.

### Why inheritance here and composition elsewhere (T-20)
- **Providers are a true "is-a" family** with a stable contract and shared plumbing (HTTP timeout/error mapping, "not configured" errors, result normalisation). Inheritance removes that duplication; the hierarchy is **one level deep**.
- **Checkout is a "has-a" relationship**: it *uses* pricing, inventory and payment; it is not a kind of any of them. Composition lets each collaborator be replaced (fake fetch in tests), changed independently, and avoids a fragile base class.
- **Risk of deep inheritance:** changes in a base class ripple into every subclass ("fragile base class"), behaviour gets spread over many levels and becomes hard to trace during a defense. We cap hierarchies at one level and keep bases small.

## Refactoring note (T-27)
See `code-review.md` → "Documented refactor": payment verification originally lived inside the webhook controller and was duplicated for the return page; it was extracted into `PaymentService.reconcilePayment()` / `applyVerifiedStatus()` (Façade). Record your before/after commit hashes there.
