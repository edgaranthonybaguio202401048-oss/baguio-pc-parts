# Concept Statement – Baguio PC Parts (L3-01)

> One-page concept for instructor approval (Week 14 / Week 16). Group: ________ · Section: ________

## The business
**Baguio PC Parts** is a computer-components store on Session Road, Baguio City, selling CPUs, motherboards, memory, graphics cards, power supplies, cases and storage to students (SLU, UC, UB, UP Baguio), gamers and small offices in Baguio–La Trinidad and the rest of Luzon. Customers pick up in store, get Baguio delivery, or ship by courier. Payments go through **Maya Checkout** (sandbox in this project).

## Why a generic store template is not enough
In a PC parts store **the product is compatibility**. A shirt never "fails" to fit another shirt, but an AM5 processor physically cannot go into an AM4 motherboard, DDR5 memory does not fit a DDR4 board, a 280 mm graphics card does not fit a case rated for 270 mm, and a 550 W power supply can trip under a 600 W load. Every one of those mistakes means a return, a wasted trip down Session Road and an unhappy customer. The store therefore needs **server-side business rules about how products relate to each other**, which no generic template has.

## Actors
| Actor | What they do |
|---|---|
| Customer | Registers, browses and filters parts, plans and saves PC builds, gets a compatibility check on the cart, applies coupons, checks out, pays with Maya, tracks orders. |
| Administrator (store staff) | Manages catalog, component specs, stock (with audited reasons), coupons and the order lifecycle; reconciles payments; reviews flagged payments. |
| Maya (gateway) | Hosts the payment page; sends webhook notifications. |
| Gemini (AI provider) | Ranks/explains real catalog products for the AI Build Advisor. |

There are no third-party sellers, so L3-03 (extra roles) is satisfied by the existing customer/admin split: builds and orders are owner-scoped and every admin route is role-protected.

## Differentiated features and the rule each enforces

### Feature A – Compatibility Engine + compatibility-aware cart/checkout
- **Data model change:** every product carries `specs` (JSON) – socket, memoryType, formFactor, ramSlots, tdpWatts, wattage, lengthMm, maxGpuLengthMm, supportedFormFactors; categories carry a `componentType`.
- **Rules:** socket match, RAM type match, CPU memory support, RAM slot count, case form factor, GPU length, PSU wattage ≥ estimated draw (warning below 1.3× headroom), no-display-output warning.
- **API:** `POST /builds/compatibility-check`; `GET /cart` and `POST /checkout/preview` include a `compatibility` report; **`POST /orders` is blocked with 409 `CART_INCOMPATIBLE`** when the cart contains an incompatible pair.
- **Workflow change:** customers see a compatibility panel in cart/checkout; checkout button is disabled until issues are fixed.

### Feature B – PC Build Planner (saved & shareable builds)
- **Data model change:** `Build` and `BuildItem(slot, product, quantity)` tables; unique share codes.
- **Rules:** max 10 builds per customer (409 `BUILD_LIMIT_REACHED`); parts must be in the matching slot; **only compatible builds may be made public** (409 `BUILD_INCOMPATIBLE`); **"add whole build to cart" is all-or-nothing** – requires zero compatibility errors and enough stock for every part (409 `OUT_OF_STOCK`).
- **API:** `GET/POST/PATCH/DELETE /builds`, `GET /builds/shared/:shareCode`, `POST /builds/:id/add-to-cart`.
- **Workflow change:** slot-by-slot build editor with live server compatibility; share link for barkada/parents; one-tap add to cart.

### Level 4 – AI Build Advisor
Customer describes use and budget ("1440p gaming, ₱70k"); backend retrieves in-stock candidates per component type from PostgreSQL, Gemini picks/explains from those IDs only, and the backend validates IDs, slots, prices and compatibility before replying.

## What would go wrong without these rules
Wrong-socket returns, refund disputes over "the store let me buy it", oversold last units, and AI suggestions of parts we don't stock. Each rule above prevents one of these with a specific server-side check and error code (see `business-rules.md`).
