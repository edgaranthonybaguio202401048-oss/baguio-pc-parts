# System Architecture (D-04, T-21, T-22, T-23)

## 1. Context / deployment diagram

```mermaid
flowchart LR
  subgraph Untrusted["UNTRUSTED – customer device"]
    B[Mobile browser]
    PWA["React PWA (Vite)<br/>Vercel · HTTPS<br/>service worker cache"]
  end
  subgraph Trusted["TRUSTED – our backend"]
    API["Express REST API /api/v1<br/>Render · HTTPS<br/>JWT · roles · validation"]
    DB[("PostgreSQL<br/>Neon")]
  end
  MAYA["Maya Checkout<br/>pg-sandbox.paymaya.com"]
  AI["Google Gemini API"]

  B --> PWA
  PWA -- "HTTPS JSON + Bearer JWT" --> API
  API -- "Prisma (parameterised SQL)" --> DB
  API -- "create checkout (public key)<br/>GET payment (secret key)" --> MAYA
  B -- "redirect to hosted payment page" --> MAYA
  MAYA -- "webhook POST /webhooks/maya?token=…<br/>(from Maya IPs)" --> API
  MAYA -- "redirect /payment/success (informational)" --> PWA
  API -- "generateContent (key in header)" --> AI
```

- Everything left of the API is **untrusted**: the browser never sees the Maya secret key, the Gemini key or the JWT secret, and nothing it sends about prices or status is trusted.
- The webhook arrow points **into** the API. The success redirect only changes what the customer sees; the order status changes only after the API verifies with Maya.

## 2. Layered (MVC) structure of the API

```mermaid
flowchart TB
  R["routes/ – path + middleware chain only"] --> M["middleware/ – requestId, helmet, CORS, rate limit,<br/>authenticate, authorize(role), validate(zod), asyncHandler"]
  M --> C["controllers/ – read req, call ONE service method, format envelope"]
  C --> S["services/ – business rules: Checkout, Pricing, Inventory,<br/>Order (state machine), Payment (façade), Build, AiAdvisor"]
  S --> P["patterns/ – payment providers + factory, AI providers + proxy + factory,<br/>discount & shipping strategies, order event bus (observer)"]
  S --> RP["repositories/ – Prisma data access only"]
  RP --> DB[(PostgreSQL)]
```

**Request trace example – `POST /api/v1/orders` (checkout):**
1. `routes/index.js` → `authenticate` → `validate({ body: checkout })`
2. `controllers/orderController.checkout` → validates `Idempotency-Key`, calls `checkoutService.checkout()`
3. `services/checkoutService.js` → `cartService.loadLines` → `compatibilityService.evaluate` → `prisma.$transaction(...)`:
   `pricingService.quote` (DB prices, coupon via `discountStrategyFor`, shipping via `shippingStrategyFor`) → `orderRepository.create` → `couponRepository.incrementUsageIfAvailable` → `inventoryService.reserve` (`productRepository.decrementStockIfAvailable`) → `cartRepository.clear`
4. After commit: `orderEvents.publishAll(order.created)` → `paymentService.createSession` → `createPaymentProvider()` (factory) → `MayaProvider.createCheckout`
5. Controller returns `201 { success, data: { order, checkoutUrl } }`

## 3. Checkout + payment sequence (incl. missed webhook)

```mermaid
sequenceDiagram
  autonumber
  actor U as Customer (PWA)
  participant API as Express API
  participant DB as PostgreSQL
  participant MY as Maya Checkout

  U->>API: POST /orders (shipping, coupon) + Idempotency-Key
  API->>DB: BEGIN; price from DB; insert Order(pending_payment) + items + history;<br/>coupon usage++ (conditional); UPDATE stock WHERE stock>=qty; insert reservations; clear cart; COMMIT
  API->>MY: POST /checkout/v1/checkouts (server total, requestReferenceNumber)
  MY-->>API: { checkoutId, redirectUrl }
  API->>DB: insert Payment(gatewayRef=checkoutId, amount, currency)
  API-->>U: 201 { order, checkoutUrl }
  U->>MY: redirect → pays with sandbox card / wallet
  par Webhook path
    MY->>API: POST /webhooks/maya?token=… { id, status: PAYMENT_SUCCESS }
    API->>API: verify token (constant-time) + source IP
    API->>DB: INSERT WebhookEvent (provider,eventId) UNIQUE → duplicate? ack & stop
    API->>MY: GET /payments/v1/payments/{id} (secret key)
    MY-->>API: { status, amount, currency }
    API->>DB: BEGIN; amount & currency == order? → commit reservations, order→paid, history; COMMIT
    API-->>MY: 200
  and Customer return path
    MY-->>U: redirect /payment/success?orderId=…
    U->>API: POST /orders/:id/verify-payment
    API->>MY: GET payment (same verification as above)
    API-->>U: authoritative order status (polls a few times if still pending)
  end

  Note over API,MY: MISSED WEBHOOK: if the webhook never arrives, the return-page call,<br/>the admin "Reconcile with Maya" button (POST /admin/orders/:id/reconcile),<br/>or the 60-second sweep (checks Maya BEFORE expiring an order) applies the same verification.
  Note over API,DB: FAILED / CANCELLED / EXPIRED: payment row updated, reservations released (stock back),<br/>order stays pending_payment → customer can POST /orders/:id/payment-session (new session).<br/>Hold expires after 30 min → order expired, coupon use returned.
```

## 4. Class / module model (T-23)

```mermaid
classDiagram
  direction LR
  class PaymentProvider {
    <<abstract>>
    +name
    +createCheckout(input)*
    +verifyWebhook(request)*
    +parseWebhookEvent(rawBody)*
    +retrievePayment(gatewayRef)*
    #httpJson(url, opts)
    #ensureConfigured(...)
    #normalizedResult(...)
  }
  class MayaProvider
  class PayMongoProvider
  PaymentProvider <|-- MayaProvider
  PaymentProvider <|-- PayMongoProvider

  class AiProvider {
    <<abstract>>
    +generateJson(input)  «template method»
    +buildRequest(input)*
    +extractText(json)*
  }
  class GeminiProvider
  class OpenAiProvider
  class AiProviderProxy { +generateJson(input) timeout+cache+logging }
  AiProvider <|-- GeminiProvider
  AiProvider <|-- OpenAiProvider
  AiProviderProxy o-- AiProvider : wraps

  class DiscountStrategy { <<abstract>> +calculate(subtotal, coupon)* }
  DiscountStrategy <|-- PercentageDiscount
  DiscountStrategy <|-- FixedAmountDiscount

  class CheckoutService
  class PricingService
  class InventoryService
  class PaymentService { «façade» }
  class OrderService
  class CartService
  class OrderRepository
  class OrderEventBus { «observer subject» EventEmitter }

  CheckoutService *-- PricingService
  CheckoutService *-- InventoryService
  CheckoutService *-- PaymentService
  CheckoutService *-- CartService
  CheckoutService *-- OrderRepository
  PaymentService *-- OrderService
  PaymentService *-- InventoryService
  PaymentService ..> PaymentProvider : via PaymentProviderFactory
  PricingService ..> DiscountStrategy
  OrderService ..> OrderEventBus : publishes
  AiAdvisorService ..> AiProviderProxy : via AiProviderFactory
```

Inheritance is used only for the **provider hierarchies** (true "is-a", shared HTTP/verification plumbing, one level deep). Everything else uses **composition** via constructor injection in `services/index.js`.

## 5. PWA client architecture
- `src/api/client.js` – single fetch wrapper, parses envelopes, attaches JWT, handles 401.
- `context/` – `AuthContext` (token + role), `CartContext` (server cart, optimistic updates, offline cache), `NetworkStatusContext`.
- Workbox: app shell precache; `StaleWhileRevalidate` for `GET /products|/categories`; `CacheFirst` for images; no caching of auth, cart, orders, checkout, webhooks, admin or AI.
