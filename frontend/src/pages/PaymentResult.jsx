import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { OrdersApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorAlert, SkeletonLoader, StatusBadge } from '../components/ui';
import { formatPHP } from '../utils/currency';

/**
 * /payment/success and /payment/cancelled – INFORMATIONAL ONLY.
 * Reaching this page proves nothing. We ask the backend to verify with Maya
 * (POST /orders/:id/verify-payment) and display whatever status the server
 * reports. The order becomes "paid" only through server-side verification.
 */
export default function PaymentResult({ kind }) {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState({ loading: true, order: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!orderId || !isAuthenticated) { setState({ loading: false, order: null, error: null }); return undefined; }
    let cancelled = false;
    let timer;
    const check = async (n) => {
      try {
        const { data } = await OrdersApi.verifyPayment(orderId);
        if (cancelled) return;
        setState({ loading: false, order: data.order, error: null });
        // Webhook may arrive a few seconds after the redirect – poll briefly.
        if (kind === 'success' && data.order.status === 'pending_payment' && n < 5) {
          timer = setTimeout(() => { setAttempt(n + 1); check(n + 1); }, 3000);
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, order: null, error: err });
      }
    };
    check(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orderId, isAuthenticated, kind]);

  if (!isAuthenticated) return <EmptyState icon="🔐" title="Sign in to see your payment status" action={<Link to="/login" className="btn">Sign in</Link>} />;
  if (!orderId) return <EmptyState icon="❓" title="No order specified" action={<Link to="/orders" className="btn">My orders</Link>} />;
  if (state.loading) return <div className="page"><p>Checking your payment with Maya…</p><SkeletonLoader count={1} variant="row" /></div>;
  if (state.error) return <div className="page"><ErrorAlert error={state.error} /></div>;

  const o = state.order;
  const paid = ['paid', 'processing', 'shipped', 'delivered'].includes(o.status);
  return (
    <div className="page">
      <section className="result card" aria-live="polite">
        <div className="result-icon" aria-hidden="true">{paid ? '✅' : kind === 'cancelled' ? '↩️' : '⏳'}</div>
        <h1>{paid ? 'Payment confirmed' : kind === 'cancelled' ? 'Payment not completed' : 'Waiting for confirmation'}</h1>
        <p>Order <strong>{o.orderNumber}</strong> · {formatPHP(o.totalCents)}</p>
        <StatusBadge status={o.status} />
        {!paid && kind === 'success' && <p className="small muted">We haven't received Maya's confirmation yet{attempt ? ` (checked ${attempt + 1}×)` : ''}. This page updates automatically.</p>}
        {!paid && kind === 'cancelled' && o.status === 'pending_payment' && <p className="small muted">No charge was made. You can retry payment from your order.</p>}
        <Link to={`/orders/${o.id}`} className="btn btn-block">View order</Link>
      </section>
    </div>
  );
}
