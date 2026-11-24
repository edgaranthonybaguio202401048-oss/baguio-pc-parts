import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminApi } from '../../api/endpoints';
import useApi from '../../hooks/useApi';
import { EmptyState, ErrorAlert, SkeletonLoader, StatusBadge } from '../../components/ui';
import { formatPHP } from '../../utils/currency';

const STATUSES = ['', 'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired'];

export default function AdminOrders() {
  const [filters, setFilters] = useState({ status: '', from: '', to: '', flagged: '' });
  const [page, setPage] = useState(1);
  const params = {
    page, limit: 15, status: filters.status || undefined, flagged: filters.flagged || undefined,
    from: filters.from ? new Date(`${filters.from}T00:00:00+08:00`).toISOString() : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59+08:00`).toISOString() : undefined,
  };
  const key = JSON.stringify(params);
  const { data, meta, loading, error, reload } = useApi((signal) => AdminApi.orders(params, signal), [key]);
  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };

  return (
    <div className="stack">
      <h2>Orders</h2>
      <div className="filters card">
        <div className="field"><label htmlFor="f-status">Status</label>
          <select id="f-status" value={filters.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}</select>
        </div>
        <div className="row">
          <div className="field"><label htmlFor="f-from">From</label><input id="f-from" type="date" value={filters.from} onChange={set('from')} /></div>
          <div className="field"><label htmlFor="f-to">To</label><input id="f-to" type="date" value={filters.to} onChange={set('to')} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={filters.flagged === 'true'} onChange={(e) => { setFilters({ ...filters, flagged: e.target.checked ? 'true' : '' }); setPage(1); }} /> Flagged payments only</label>
      </div>
      {loading && <SkeletonLoader count={4} variant="row" />}
      {error && <ErrorAlert error={error} onRetry={reload} />}
      {!loading && data?.length === 0 && <EmptyState icon="📦" title="No orders match these filters" />}
      <ul className="stack" role="list">
        {(data || []).map((o) => (
          <li key={o.id}>
            <Link to={`/admin/orders/${o.id}`} className="card order-row">
              <div>
                <strong>{o.orderNumber}</strong> {o.paymentFlagged && <span className="badge badge-cancelled">flagged</span>}
                <p className="small muted">{o.customer?.name} · {new Date(o.createdAt).toLocaleString('en-PH')}</p>
              </div>
              <div className="right"><StatusBadge status={o.status} /><p><strong>{formatPHP(o.totalCents)}</strong></p></div>
            </Link>
          </li>
        ))}
      </ul>
      {meta?.totalPages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page} / {meta.totalPages}</span>
          <button type="button" className="btn btn-ghost" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}
