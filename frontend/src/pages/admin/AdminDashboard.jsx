import { Link } from 'react-router-dom';
import { AdminApi } from '../../api/endpoints';
import useApi from '../../hooks/useApi';
import { ErrorAlert, SkeletonLoader } from '../../components/ui';
import { formatPHP } from '../../utils/currency';

export default function AdminDashboard() {
  const { data: d, loading, error, reload } = useApi((signal) => AdminApi.dashboard(signal), []);
  const events = useApi((signal) => AdminApi.webhookEvents({ limit: 5 }, signal), []);
  if (loading) return <SkeletonLoader count={4} />;
  if (error) return <ErrorAlert error={error} onRetry={reload} />;
  return (
    <div className="stack">
      <h2>Dashboard</h2>
      <div className="stats">
        <div className="stat card"><span className="small muted">Paid orders</span><strong>{d.paidOrders}</strong></div>
        <div className="stat card"><span className="small muted">Gross sales (paid)</span><strong>{formatPHP(d.grossSalesCents)}</strong></div>
        <div className="stat card"><span className="small muted">Pending payment</span><strong>{d.pendingOrders}</strong></div>
        <div className="stat card"><span className="small muted">Flagged payments</span><strong className={d.flaggedOrders.length ? 'warn-text' : ''}>{d.flaggedOrders.length}</strong></div>
      </div>

      {d.flaggedOrders.length > 0 && (
        <section className="card">
          <h3>⚠️ Flagged payments (review / refund)</h3>
          <ul className="stack small">
            {d.flaggedOrders.map((o) => <li key={o.id}><Link to={`/admin/orders/${o.id}`}>{o.orderNumber}</Link> – {o.flagReason}</li>)}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>Low stock (≤ {d.lowStockThreshold})</h3>
        {d.lowStock.length === 0 ? <p className="muted">All good.</p> : (
          <table className="table">
            <thead><tr><th scope="col">SKU</th><th scope="col">Product</th><th scope="col">Stock</th></tr></thead>
            <tbody>{d.lowStock.map((p) => <tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td className={p.stock === 0 ? 'warn-text' : ''}>{p.stock}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Recent webhook events</h3>
        {events.data?.length ? (
          <ul className="small stack">
            {events.data.map((e) => <li key={e.id}><code>{e.type}</code> · {e.status} · {new Date(e.receivedAt).toLocaleString('en-PH')}</li>)}
          </ul>
        ) : <p className="muted small">No webhook events yet.</p>}
      </section>
    </div>
  );
}
