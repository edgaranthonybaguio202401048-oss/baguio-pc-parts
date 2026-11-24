import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckoutApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNetwork } from '../context/NetworkStatusContext';
import CompatibilityPanel from '../components/CompatibilityPanel';
import { EmptyState, ErrorAlert, FormField, OfflineHint, SkeletonLoader } from '../components/ui';
import { formatPHP } from '../utils/currency';
import { newIdempotencyKey } from '../utils/idempotency';
import { fieldErrorsFrom, validateShipping } from '../utils/validators';

const METHODS = [
  ['store_pickup', 'Store pickup – Session Road (free)'],
  ['baguio_delivery', 'Baguio / La Trinidad delivery (₱150, free ₱15k+)'],
  ['luzon_courier', 'Luzon courier (₱350, free ₱50k+)'],
];

export default function Checkout() {
  const { user } = useAuth();
  const { cart, refresh } = useCart();
  const { online } = useNetwork();
  const [shipping, setShipping] = useState({ name: user?.name || '', phone: '', addressLine: '', city: 'Baguio City', province: 'Benguet', postalCode: '2600' });
  const [method, setMethod] = useState('store_pickup');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const keyRef = useRef(newIdempotencyKey()); // one key per checkout attempt

  // Server quote whenever method or applied coupon changes
  const loadQuote = useCallback(async (code) => {
    try {
      const { data } = await CheckoutApi.preview({ shippingMethod: method, ...(code ? { couponCode: code } : {}) });
      setQuote(data); setQuoteError(null); return true;
    } catch (err) {
      if (code && err.status === 422) { setCouponError(err); return false; }
      setQuoteError(err); return false;
    }
  }, [method]);

  useEffect(() => { if (online) loadQuote(coupon); }, [loadQuote, coupon, online]);

  const applyCoupon = async (e) => {
    e.preventDefault();
    setCouponError(null);
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (await loadQuote(code)) setCoupon(code); // invalid coupon leaves the total unchanged
  };

  const onField = (k) => (e) => setShipping((s) => ({ ...s, [k]: e.target.value }));

  const placeOrder = async (e) => {
    e.preventDefault();
    const v = validateShipping(shipping);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true); setSubmitError(null);
    try {
      // NOTE: no prices or totals are sent – the server computes them.
      const { data } = await CheckoutApi.placeOrder({ shippingMethod: method, shipping, ...(coupon ? { couponCode: coupon } : {}) }, keyRef.current);
      refresh().catch(() => {});
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl; // Maya hosted checkout
        return;
      }
      setPendingOrder(data); // order saved, gateway temporarily unavailable
      keyRef.current = newIdempotencyKey();
    } catch (err) {
      setSubmitError(err);
      setErrors(fieldErrorsFrom(err));
      // Network errors keep the SAME key so a retry cannot create a duplicate order.
      if (err.status >= 400 && err.status < 500) keyRef.current = newIdempotencyKey();
      if (err.code === 'OUT_OF_STOCK' || err.code === 'COUPON_EXHAUSTED') { refresh().catch(() => {}); loadQuote(coupon); }
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingOrder) {
    return (
      <EmptyState icon="🧾" title={`Order ${pendingOrder.order.orderNumber} saved`}
        action={<Link className="btn" to={`/orders/${pendingOrder.order.id}`}>Go to order & retry payment</Link>}>
        {pendingOrder.paymentError?.message}
      </EmptyState>
    );
  }
  if (cart.items.length === 0 && !submitting) {
    return <EmptyState icon="🛒" title="Nothing to check out" action={<Link to="/products" className="btn">Shop parts</Link>} />;
  }

  return (
    <div className="page has-action-bar">
      <h1>Checkout</h1>
      <form id="checkout-form" onSubmit={placeOrder} noValidate className="stack">
        <fieldset className="card">
          <legend>Shipping details</legend>
          <FormField id="name" label="Recipient name" error={errors.name}>
            <input id="name" autoComplete="name" value={shipping.name} onChange={onField('name')} aria-invalid={!!errors.name} />
          </FormField>
          <FormField id="phone" label="Mobile number" error={errors.phone} hint="e.g. 09171234567">
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={shipping.phone} onChange={onField('phone')} aria-invalid={!!errors.phone} />
          </FormField>
          <FormField id="addressLine" label="Street, barangay" error={errors.addressLine}>
            <input id="addressLine" autoComplete="street-address" value={shipping.addressLine} onChange={onField('addressLine')} aria-invalid={!!errors.addressLine} />
          </FormField>
          <div className="row">
            <FormField id="city" label="City" error={errors.city}><input id="city" value={shipping.city} onChange={onField('city')} /></FormField>
            <FormField id="postalCode" label="Postal code" error={errors.postalCode}><input id="postalCode" inputMode="numeric" maxLength={4} value={shipping.postalCode} onChange={onField('postalCode')} /></FormField>
          </div>
          <FormField id="province" label="Province" error={errors.province}><input id="province" value={shipping.province} onChange={onField('province')} /></FormField>
        </fieldset>

        <fieldset className="card">
          <legend>Delivery method</legend>
          {METHODS.map(([v, l]) => (
            <label key={v} className="radio">
              <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} /> {l}
            </label>
          ))}
        </fieldset>
      </form>

      <form className="card coupon-form" onSubmit={applyCoupon}>
        <label htmlFor="coupon">Coupon code</label>
        <div className="row">
          <input id="coupon" value={couponInput} maxLength={30} autoCapitalize="characters" placeholder="BAGUIO10"
            onChange={(e) => setCouponInput(e.target.value)} />
          <button type="submit" className="btn btn-ghost" disabled={!online}>Apply</button>
        </div>
        {coupon && <p className="small ok-text">Coupon {coupon} applied <button type="button" className="link-btn" onClick={() => { setCoupon(''); setCouponInput(''); }}>Remove</button></p>}
        <ErrorAlert error={couponError} onClose={() => setCouponError(null)} />
      </form>

      <section className="card summary" aria-labelledby="sum-h">
        <h2 id="sum-h">Order summary</h2>
        {!quote && !quoteError && <SkeletonLoader count={1} variant="row" />}
        <ErrorAlert error={quoteError} onRetry={() => loadQuote(coupon)} />
        {quote && (
          <>
            <ul className="summary-lines">
              {quote.lines.map((l) => <li key={l.productId} className="row between"><span>{l.quantity} × {l.name}</span><span>{formatPHP(l.lineTotalCents)}</span></li>)}
            </ul>
            <div className="row between"><span>Subtotal</span><span>{formatPHP(quote.subtotalCents)}</span></div>
            {quote.discountCents > 0 && <div className="row between ok-text"><span>Discount ({quote.coupon?.code})</span><span>−{formatPHP(quote.discountCents)}</span></div>}
            <div className="row between"><span>Shipping</span><span>{quote.shippingFeeCents ? formatPHP(quote.shippingFeeCents) : 'Free'}</span></div>
            <div className="row between total-line"><strong>Total</strong><strong>{formatPHP(quote.totalCents)}</strong></div>
            <CompatibilityPanel report={quote.compatibility} compact />
          </>
        )}
      </section>

      <ErrorAlert error={submitError} onClose={() => setSubmitError(null)} />
      <p className="small muted">You'll be redirected to Maya's secure page (sandbox/test mode). Your stock is held for 30 minutes.</p>

      <div className="action-bar">
        <div className="grow"><span className="small muted">Total</span><br /><strong>{quote ? formatPHP(quote.totalCents) : '—'}</strong></div>
        <button type="submit" form="checkout-form" className="btn" disabled={submitting || !online || !quote}>
          {submitting ? 'Placing order…' : 'Pay with Maya'}
        </button>
      </div>
      <OfflineHint online={online} action="checkout and payment" />
    </div>
  );
}
