import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useNetwork } from '../context/NetworkStatusContext';
import CompatibilityPanel from '../components/CompatibilityPanel';
import { EmptyState, ErrorAlert, OfflineHint, QuantityStepper, SkeletonLoader } from '../components/ui';
import { formatPHP } from '../utils/currency';

export default function Cart() {
  const { cart, loading, error, stale, update, remove, clearError } = useCart();
  const { online } = useNetwork();
  const navigate = useNavigate();

  if (loading && cart.items.length === 0) return <div className="page"><SkeletonLoader count={3} variant="row" /></div>;
  if (cart.items.length === 0) {
    return <EmptyState icon="🛒" title="Your cart is empty" action={<Link to="/products" className="btn">Start shopping</Link>}>Find parts or let the AI advisor suggest a build.</EmptyState>;
  }

  const blocked = cart.items.some((i) => !i.available) || cart.compatibility?.compatible === false;

  return (
    <div className="page has-action-bar">
      <h1>Your cart</h1>
      {stale && <p className="hint">Offline – showing your last saved cart. Changes are disabled.</p>}
      <ErrorAlert error={error} onClose={clearError} />
      <ul className="cart-list">
        {cart.items.map((i) => (
          <li key={i.productId} className={`cart-item card ${i.pending ? 'pending' : ''}`}>
            <img src={i.imageUrl || '/images/accessory.webp'} alt="" width="88" height="66" loading="lazy" />
            <div className="grow">
              <Link to={`/products/${i.productId}`} className="pick-name">{i.name}</Link>
              <p className="small muted">{formatPHP(i.unitPriceCents)} each</p>
              {i.issue === 'INSUFFICIENT_STOCK' && <p className="small warn-text">Only {i.stock} left – reduce quantity</p>}
              {i.issue === 'PRODUCT_UNAVAILABLE' && <p className="small warn-text">No longer sold – please remove</p>}
              <div className="row between">
                <QuantityStepper value={i.quantity} max={Math.max(1, Math.min(20, i.stock))} disabled={!online || stale}
                  label={`Quantity for ${i.name}`} onChange={(q) => update(i.productId, q).catch(() => {})} />
                <strong>{formatPHP(i.lineTotalCents)}</strong>
              </div>
              <button type="button" className="link-btn" disabled={!online || stale} onClick={() => remove(i.productId).catch(() => {})}>Remove</button>
            </div>
          </li>
        ))}
      </ul>

      <CompatibilityPanel report={cart.compatibility} compact />

      <div className="summary card">
        <div className="row between"><span>Subtotal ({cart.itemCount} items)</span><strong>{formatPHP(cart.subtotalCents)}</strong></div>
        <p className="small muted">Coupons and shipping are calculated at checkout by our server.</p>
      </div>

      <div className="action-bar">
        <div className="grow"><span className="small muted">Subtotal</span><br /><strong>{formatPHP(cart.subtotalCents)}</strong></div>
        <button type="button" className="btn" disabled={!online || stale || blocked} onClick={() => navigate('/checkout')}>Checkout</button>
      </div>
      <OfflineHint online={online} action="checkout" />
      {blocked && <p className="hint">Fix the highlighted issues to continue to checkout.</p>}
    </div>
  );
}
