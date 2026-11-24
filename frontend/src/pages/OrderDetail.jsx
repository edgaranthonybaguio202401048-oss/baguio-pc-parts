import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OrdersApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import { useNetwork } from '../context/NetworkStatusContext';
import { EmptyState, ErrorAlert, OfflineHint, SkeletonLoader, StatusBadge } from '../components/ui';
import { formatPHP } from '../utils/currency';

export function OrderTimeline({ history }) {
  return (
    <ol className="timeline">
      {history.map((h) => (
        <li key={`${h.to}-${h.at}`}>
          <StatusBadge status={h.to} />
          <span className="small muted"> {new Date(h.at).toLocaleString('en-PH')} · by {h.actorType}</span>
          {h.note && <p className="small">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function OrderItems({ order }) {
  return (
    <>
      <ul className="summary-lines">
        {order.items.map((i) => (
          <li key={i.productId} className="row between"><span>{i.quantity} × {i.productName}</span><span>{formatPHP(i.lineTotalCents)}</span></li>
        ))}
      </ul>
      <div className="row between"><span>Subtotal</span><span>{formatPHP(order.subtotalCents)}</span></div>
      {order.discountCents > 0 && <div className="row between"><span>Discount {order.coupon?.code}</span><span>−{formatPHP(order.discountCents)}</span></div>}
      <div className="row between"><span>Shipping</span><span>{formatPHP(order.shippingFeeCents)}</span></div>
      <div className="row between total-line"><strong>Total</strong><strong>{formatPHP(order.totalCents)}</strong></div>
    </>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { online } = useNetwork();
  const { data: o, loading, error, reload, setData } = useApi((signal) => OrdersApi.get(id, signal), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading) return <div className="page"><SkeletonLoader count={2} variant="row" /></div>;
  if (error?.status === 404) return <EmptyState icon="📦" title="Order not found" action={<Link to="/orders" className="btn">My orders</Link>} />;
  if (error) return <div className="page"><ErrorAlert error={error} onRetry={reload} /></div>;

  const act = async (fn) => {
    setBusy(true); setActionError(null);
    try { await fn(); } catch (err) { setActionError(err); } finally { setBusy(false); }
  };
  const pay = () => act(async () => {
    const url = o.payment?.checkoutUrl || (await OrdersApi.retryPayment(o.id)).data.checkoutUrl;
    window.location.href = url;
  });
  const cancel = () => act(async () => {
    if (!window.confirm('Cancel this unpaid order? Reserved stock will be released.')) return;
    setData((await OrdersApi.cancel(o.id)).data);
  });
  const recheck = () => act(async () => setData((await OrdersApi.verifyPayment(o.id)).data.order));

  return (
    <div className="page">
      <div className="row between"><h1>{o.orderNumber}</h1><StatusBadge status={o.status} /></div>
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />
      {o.status === 'pending_payment' && (
        <section className="card stack">
          <p>Awaiting payment{o.reservationExpiresAt ? ` · stock held until ${new Date(o.reservationExpiresAt).toLocaleTimeString('en-PH')}` : ''}.</p>
          <button type="button" className="btn btn-block" onClick={pay} disabled={busy || !online}>Pay with Maya</button>
          <button type="button" className="btn btn-ghost btn-block" onClick={recheck} disabled={busy || !online}>I already paid – check status</button>
          <button type="button" className="btn btn-danger btn-block" onClick={cancel} disabled={busy || !online}>Cancel order</button>
          <OfflineHint online={online} action="payment" />
        </section>
      )}
      <section className="card"><h2>Items</h2><OrderItems order={o} /></section>
      <section className="card">
        <h2>{o.shippingMethod === 'store_pickup' ? 'Pickup' : 'Delivery'}</h2>
        <p>{o.shipping.name} · {o.shipping.phone}</p>
        <p className="small muted">{o.shipping.addressLine}, {o.shipping.city}, {o.shipping.province} {o.shipping.postalCode}</p>
      </section>
      <section className="card"><h2>Status history</h2><OrderTimeline history={o.statusHistory} /></section>
    </div>
  );
}
