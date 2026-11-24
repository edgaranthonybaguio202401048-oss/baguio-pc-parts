# Individual Contribution Statement (D-13)

> Must match Git history (`git shortlog -sne` and PR authors). Each member signs. Suggested split for a 4-member group – adjust to who actually wrote what.

| Member | Modules / files owned | Endpoints | Patterns / OOP | Tests | Docs | Signature |
|---|---|---|---|---|---|---|
| Member 1 – ________ | auth, middleware (auth, validate, errorHandler, rateLimiters), config singletons, admin products/inventory | `/auth/*`, `/admin/products*`, `/admin/categories*` | Singleton, Decorator | `auth.test.js`, `roles.test.js` | README, database.md | |
| Member 2 – ________ | cart, checkout, pricing, coupons, inventory reservation, order state machine | `/cart*`, `/checkout/preview`, `/orders*`, `/admin/coupons*`, `/admin/orders*` | Strategy, Observer, composition (CheckoutService) | `checkout.test.js` | business-rules.md, test-plan.md | |
| Member 3 – ________ | payments (Maya/PayMongo providers, factory, PaymentService façade), webhooks, reconciliation sweep | `/webhooks/*`, `/orders/:id/payment-session`, `/orders/:id/verify-payment`, `/admin/orders/:id/reconcile`, `/admin/webhook-events` | Factory Method, Façade, abstract `PaymentProvider` | `webhook.test.js` | payment-integration.md, architecture.md | |
| Member 4 – ________ | compatibility engine, builds, AI advisor (providers, proxy), React PWA | `/builds*`, `/ai/build-advisor` | Proxy, abstract `AiProvider` | `builds.test.js`, `ai.test.js` | ai-integration.md, design-patterns-oop.md | |

## Defense readiness (each member)
- [ ] I can trace one of my endpoints from route → controller → service → repository → table.
- [ ] I can explain one design decision in my module and one alternative we rejected.
- [ ] I can answer one "what if" question about my module (see `defense-guide.md`).
