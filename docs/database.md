# Database Design (D-03)

**Engine:** PostgreSQL (Neon in production, local Postgres for development) via **Prisma ORM**.
**Why PostgreSQL:** the core risks of this project – overselling, double payments, coupon over-use – are integrity problems. Postgres gives real foreign keys, unique constraints, CHECK constraints, row-level locking and ACID transactions, so those guarantees live in the database and not only in application code.

**Money:** every amount is an `Int` number of **centavos** (`priceCents`, `totalCents`…). No floating point is ever stored.

Schema source: `backend/prisma/schema.prisma` · extra CHECK constraints: `backend/prisma/sql/constraints.sql`.

## ERD

```mermaid
erDiagram
  User ||--o{ CartItem : has
  User ||--o{ Order : places
  User ||--o{ Build : saves
  User ||--o{ CouponRedemption : uses
  User ||--o{ Notification : receives
  Category ||--o{ Product : groups
  Product ||--o{ CartItem : "in"
  Product ||--o{ OrderItem : "sold as"
  Product ||--o{ StockReservation : "held by"
  Product ||--o{ InventoryAdjustment : "audited by"
  Product ||--o{ BuildItem : "used in"
  Order ||--|{ OrderItem : contains
  Order ||--|{ OrderStatusHistory : "transitions"
  Order ||--o{ StockReservation : holds
  Order ||--o{ Payment : "paid via"
  Order |o--o| CouponRedemption : redeems
  Coupon ||--o{ CouponRedemption : "redeemed as"
  Coupon |o--o{ Order : discounts
  Build ||--|{ BuildItem : contains

  User { uuid id PK; string email UK; string passwordHash; string name; enum role }
  Category { uuid id PK; string name UK; string slug UK; enum componentType }
  Product { uuid id PK; string sku UK; string slug UK; string name; string brand; int priceCents; int stock; json specs; bool isActive; datetime deletedAt; uuid categoryId FK }
  InventoryAdjustment { uuid id PK; uuid productId FK; int previousStock; int newStock; int delta; string reason; enum actorType; uuid actorId FK; uuid orderId; datetime createdAt }
  CartItem { uuid id PK; uuid userId FK; uuid productId FK; int quantity }
  Coupon { uuid id PK; string code UK; enum type; int value; int maxDiscountCents; int minSpendCents; datetime startsAt; datetime expiresAt; int usageLimit; int perCustomerLimit; int usedCount; bool isActive }
  CouponRedemption { uuid id PK; uuid couponId FK; uuid userId FK; uuid orderId FK_UK }
  Order { uuid id PK; string orderNumber UK; uuid userId FK; enum status; int subtotalCents; int discountCents; int shippingFeeCents; int totalCents; string currency; enum shippingMethod; string idempotencyKey; bool paymentFlagged; string flagReason; datetime paidAt }
  OrderItem { uuid id PK; uuid orderId FK; uuid productId FK; string productName; string sku; int unitPriceCents; int quantity; int lineTotalCents }
  OrderStatusHistory { uuid id PK; uuid orderId FK; enum fromStatus; enum toStatus; enum actorType; uuid actorId; string note; datetime createdAt }
  StockReservation { uuid id PK; uuid orderId FK; uuid productId FK; int quantity; enum status; datetime expiresAt }
  Payment { uuid id PK; uuid orderId FK; string provider; string gatewayRef UK; string requestReference UK; string checkoutUrl; enum status; int amountCents; string currency; int gatewayAmountCents; string gatewayCurrency; string gatewayStatus }
  WebhookEvent { uuid id PK; string provider; string eventId; string type; json payload; enum status; string error; datetime receivedAt }
  Build { uuid id PK; uuid userId FK; string name; string shareCode UK; bool isPublic }
  BuildItem { uuid id PK; uuid buildId FK; enum slot; uuid productId FK; int quantity }
  Notification { uuid id PK; uuid userId FK; string type; string message; uuid orderId; datetime readAt }
```

## Tables (purpose)
| Table | Purpose |
|---|---|
| `User` | Customers and admins; bcrypt `passwordHash` only. |
| `Category` | Product groups with a `componentType` used by the compatibility engine and AI retrieval. |
| `Product` | Catalog. `specs` JSON holds compatibility attributes. Soft delete via `isActive=false` + `deletedAt`. |
| `InventoryAdjustment` | Audit trail for every stock change (admin adjustments, checkout reservations, releases). |
| `CartItem` | Server-side cart, one row per (user, product). |
| `Coupon` / `CouponRedemption` | Coupon rules and per-order redemption (per-customer limits). |
| `Order` / `OrderItem` | Orders with price **snapshots** (name, SKU, unit price) so later catalog edits don't change history. |
| `OrderStatusHistory` | Every lifecycle transition with actor and timestamp. |
| `StockReservation` | Stock held for an unpaid order (active → committed / released). |
| `Payment` | Each gateway session; expected vs gateway-reported amount/currency for integrity checks. |
| `WebhookEvent` | Idempotent event log. |
| `Build` / `BuildItem` | Level 3 saved PC builds. |
| `Notification` | Records created by Observer listeners (order paid, shipped, payment failed…). |

## Constraints
| Constraint | Protects |
|---|---|
| `User.email` UNIQUE | duplicate accounts (409 `EMAIL_TAKEN`) |
| `Product.sku`, `Product.slug`, `Category.slug`, `Coupon.code`, `Order.orderNumber`, `Build.shareCode` UNIQUE | natural keys |
| `CartItem (userId, productId)` UNIQUE | one cart line per product |
| **`Order (userId, idempotencyKey)` UNIQUE** | duplicate checkouts (L2-08) |
| **`Payment.gatewayRef`, `Payment.requestReference` UNIQUE** | duplicate gateway sessions |
| **`WebhookEvent (provider, eventId)` UNIQUE** | webhook replay (L2-05) |
| `CouponRedemption.orderId` UNIQUE | one coupon per order |
| `BuildItem (buildId, slot, productId)` UNIQUE | duplicate parts in a build |
| FKs `onDelete: Restrict` on `OrderItem.productId`, `Order.userId`, `Product.categoryId`… | no orphaned order history |
| CHECK `Product.stock >= 0`, `priceCents >= 0` | negative stock/price even if code has a bug |
| CHECK quantities `> 0` (cart, order items, reservations) | nonsense quantities |
| CHECK order amounts `>= 0` | negative totals |
| CHECK `Coupon.usedCount <= usageLimit` | coupon over-use |

## Indexes
`Product(categoryId)`, `Product(isActive, deletedAt)`, `Product(priceCents)`, `Product(createdAt)` (catalog filters/sorts); `Order(status, createdAt)`, `Order(userId, createdAt)` (admin filters, my orders); `StockReservation(status, expiresAt)` (expiry sweep); `OrderStatusHistory(orderId, createdAt)`; `InventoryAdjustment(productId, createdAt)`; `WebhookEvent(receivedAt)`; `CouponRedemption(couponId, userId)`; `Notification(userId, createdAt)`.

## Transactions and atomic updates
| Flow | Mechanism | Race it prevents |
|---|---|---|
| Checkout | One interactive `$transaction`: order + items + history + coupon usage + stock reservation + cart clear | Half-created orders, stock taken without an order |
| Stock reservation | `UPDATE "Product" SET stock = stock - q WHERE id=$1 AND stock >= q` (Prisma `updateMany`) – rows affected = 0 → 409 | Two buyers taking the last unit (Postgres locks the row; the second UPDATE re-evaluates `stock >= q` after the first commits) |
| Coupon usage | `UPDATE … SET usedCount = usedCount+1 WHERE usedCount < usageLimit` | Limit exceeded by concurrent checkouts |
| Payment verification | `$transaction`: payment row + commit reservations + compare-and-set order status + history | Webhook and reconcile marking the same order twice |
| Order status change | `UPDATE "Order" … WHERE id=$1 AND status=$current` | Two admins/processes moving the same order |
| Reservation release | `UPDATE "StockReservation" SET status='released' WHERE id=$1 AND status='active'` before returning stock | Stock returned twice |

**Rows are locked in a stable order** (sorted by productId) during multi-item reservations to avoid deadlocks.

## Seed and reset (T-09)
| Command | Effect |
|---|---|
| `npm run db:seed` | Upserts 3 users (1 admin, 2 customers), 8 categories, 26 products, 4 coupons. Idempotent – keyed on email/slug/sku/code; stock is only set on first insert. |
| `npm run db:reset` | Drops and recreates the **development** DB, applies migrations + constraints, re-seeds. Refuses when `NODE_ENV=production` or the URL contains "prod". |

Demo coupons: `BAGUIO10` (10 %, min ₱10k, max ₱3k), `STUDENT500` (₱500 off ₱5k+), `EXPIRED2025` (expired – for the demo), `PANAGBENGA1` (single-use ₱1,500 off ₱30k+ – for the exhausted demo). Demo last unit: **AMD Ryzen 7 7800X3D (stock 1)**.
