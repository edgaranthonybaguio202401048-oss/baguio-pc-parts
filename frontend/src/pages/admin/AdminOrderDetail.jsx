import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AdminApi } from '../../api/endpoints';
import useApi from '../../hooks/useApi';
import { ErrorAlert, SkeletonLoader, StatusBadge } from '../../components/ui';
import { OrderItems, OrderTimeline } from '../OrderDetail';
import { formatPHP } from '../../utils/currency';

// Mirrors the server state machine for button display only; the API returns 409 for anything illegal.
const NEXT = { paid: ['processing'], processing: ['shipped'], shipped: ['delivered'], pending_payment: ['cancelled'] };

export default function AdminOrderDetail() {
  const { id } = useParams();
  const { data: o, loading, error, reload, setData } = useApi((signal) => AdminApi.order(id, signal), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [outcome, setOutcome] = useState('');

  if (loading) return <SkeletonLoader count={3} variant="row" />;
  if (error) return <ErrorAlert error={error} onRetry={reload} />;

  const move = async (status) => {
    setBusy(true); setActionError(null);
    try { setData((await AdminApi.setOrderStatus(o.id, { status, ...(note ? { note } : {}) })).data); setNote(''); } catch (err) { setActionError(err); } finally { setBusy(false); }
  };
  const reconcile = async () => {
    setBusy(true); setActionError(null);
    try { const { data } = await AdminApi.reconcile(o.id); setData(data.order); setOutcome(data.outcome); } catch (err) { setActionError(err); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="row between"><h2>{o.orderNumber}</h2><StatusBadge status={o.status} /></div>
      {o.paymentFlagged && <div className="alert alert-error" role="alert"><strong>Payment flagged:</strong> {o.flagReason}</div>}
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />

      <section className="card stack">
        <h3>Update status</h3>
        <label htmlFor="note">Note (optional)</label>
        <input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ready for pickup at Session Road" />
        <div className="row wrap">
          {(NEXT[o.status] || []).map((s) => (
            <button key={s} type="button" className={`btn btn-small ${s === 'cancelled' ? 'btn-danger' : ''}`} disabled={busy} onClick={() => move(s)}>Mark {s}</button>
          ))}
          {!NEXT[o.status] && <span className="small muted">No further manual transitions.</span>}
        </div>
      </section>

      <section className="card stack">
        <h3>Payment</h3>
        {o.payment ? (
          <dl className="specs">
            <div><dt>Provider</dt><dd>{o.payment.provider}</dd></div>
            <div><dt>Gateway ref</dt><dd className="mono small">{o.payment.gatewayRef}</dd></div>
            <div><dt>Status</dt><dd>{o.payment.status}{o.payment.gatewayStatus ? ` (${o.payment.gatewayStatus})` : ''}</dd></div>
            <div><dt>Expected</dt><dd>{formatPHP(o.payment.amountCents)} {o.payment.currency}</dd></div>
            <div><dt>Gateway reported</dt><dd>{o.payment.gatewayAmountCents != null ? `${formatPHP(o.payment.gatewayAmountCents)} ${o.payment.gatewayCurrency}` : '—'}</dd></div>
          </dl>
        ) : <p className="muted">No payment session.</p>}
        <button type="button" className="btn btn-ghost" disabled={busy || !o.payment} onClick={reconcile}>Reconcile with Maya</button>
        {outcome && <p className="small">Reconcile outcome: <code>{outcome}</code></p>}
      </section>

      <section className="card"><h3>Items</h3><OrderItems order={o} /></section>
      <section className="card">
        <h3>Customer shipping</h3>
        <p>{o.shipping.name} · {o.shipping.phone}</p>
        <p className="small muted">{o.shippingMethod} · {o.shipping.addressLine}, {o.shipping.city}, {o.shipping.province} {o.shipping.postalCode}</p>
      </section>
      <section className="card"><h3>History</h3><OrderTimeline history={o.statusHistory} /></section>
    </div>
  );
}
