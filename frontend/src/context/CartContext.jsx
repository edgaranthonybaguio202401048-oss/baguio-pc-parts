import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CartApi } from '../api/endpoints';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkStatusContext';

/**
 * Cart state lifted to a global context and synced with /api/v1/cart.
 * - Optimistic UI: quantity changes and removals update immediately, then
 *   reconcile with the server's authoritative response (or roll back on error).
 * - The last server cart is cached in localStorage so it can be VIEWED offline.
 *   Totals always come from the server response, never from local math.
 */
const CartContext = createContext(null);
const CACHE_KEY = 'bpc.cart.cache';
const EMPTY = { items: [], itemCount: 0, subtotalCents: 0, currency: 'PHP', compatibility: null };

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; } };

export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { online } = useNetwork();
  const [cart, setCart] = useState(() => readCache() || EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const lastGood = useRef(cart);

  const apply = useCallback((serverCart) => {
    lastGood.current = serverCart;
    setCart(serverCart);
    setStale(false);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(serverCart)); } catch { /* ignore */ }
  }, []);

  // Sync with the server whenever the user signs in or the device comes back online.
  useEffect(() => {
    if (!isAuthenticated) {
      setCart(EMPTY);
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
      return undefined;
    }
    if (!online) { setStale(true); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    CartApi.get(controller.signal)
      .then(({ data }) => apply(data))
      .catch((err) => { if (err.name !== 'AbortError') setError(err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [isAuthenticated, online, apply]);

  const run = useCallback(async (optimistic, call) => {
    setError(null);
    if (optimistic) setCart(optimistic);
    try {
      const { data } = await call();
      if (data) apply(data); else apply(EMPTY);
      return true;
    } catch (err) {
      setCart(lastGood.current); // roll back
      setError(err);
      throw err;
    }
  }, [apply]);

  const add = useCallback((productId, quantity = 1) => run(null, () => CartApi.add(productId, quantity)), [run]);

  const update = useCallback((productId, quantity) => {
    const items = cart.items.map((i) => (i.productId === productId ? { ...i, quantity, lineTotalCents: i.unitPriceCents * quantity, pending: true } : i));
    return run({ ...cart, items }, () => CartApi.update(productId, quantity));
  }, [cart, run]);

  const remove = useCallback((productId) => {
    const items = cart.items.filter((i) => i.productId !== productId);
    return run({ ...cart, items }, () => CartApi.remove(productId));
  }, [cart, run]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !online) return;
    const { data } = await CartApi.get();
    apply(data);
  }, [isAuthenticated, online, apply]);

  const value = useMemo(() => ({ cart, loading, error, stale, add, update, remove, refresh, clearError: () => setError(null) }),
    [cart, loading, error, stale, add, update, remove, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
