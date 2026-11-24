/**
 * One Idempotency-Key per checkout ATTEMPT. The key is created when the
 * checkout page opens and reused for every retry of the same submit (double
 * taps, network retries), so the server returns the same order instead of
 * creating a second one. A new key is generated only after a definitive
 * outcome (order created, or a 4xx business error the user must fix).
 */
export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `chk-${crypto.randomUUID()}`;
  return `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
