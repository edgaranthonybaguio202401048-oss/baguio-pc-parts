# Code Review Record (D-12, T-26, T-27)

> Fill this in from your **real** GitHub pull requests. Every member needs at least one PR reviewed by another member. Link each finding to the PR and the fixing commit. The rows below are a *starting checklist of things worth reviewing in this codebase* – replace them with what your reviewers actually found.

## Pull requests
| PR # | Title | Author | Reviewer | Merged | Link |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |

## Findings (minimum 3 substantive)
| # | PR | Finding (what & why it matters) | Change made | Commit |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### Review prompts – good places to look for real findings
- **Webhook handler**: does it run on the raw body? Is the token compared in constant time? What if processing throws after the event row is inserted? (see `PaymentService.handleWebhook` – failed events can be retried)
- **Checkout transaction**: is the coupon usage increment conditional? Are reservation rows locked in a stable order? (deadlock risk)
- **Status updates**: is there a compare-and-set on the current status?
- **Validators**: are any write endpoints missing `.strict()`? Can `stock` be changed via `PATCH /admin/products/:id`?
- **AI output**: can the model's price ever reach the response?
- **Frontend**: is the Idempotency-Key regenerated on a network error (it must NOT be)?

## Documented refactor (T-27)
**Refactor:** extract payment verification into the PaymentService façade.

| | Before | After |
|---|---|---|
| Where | Verification logic (retrieve payment, compare amount, mark paid, commit stock) inside the webhook controller, copied into the return-page handler | `PaymentService.reconcilePayment()` + `applyVerifiedStatus()`; four callers: webhook, return page, admin reconcile, scheduled sweep |
| Problem | Duplication – a fix to amount checking had to be made twice; controllers touched repositories (T-01 violation) | One code path; controllers call one façade method |
| Effect | – | Late-payment and duplicate-payment handling added once and covered for all entry points |
| Tests | `tests/webhook.test.js` before | same tests pass after (paste output) |
| Commits | before: `_______` | after: `_______` |

*(If your group did a different refactor, document that one instead – it must be real and visible in Git history.)*
