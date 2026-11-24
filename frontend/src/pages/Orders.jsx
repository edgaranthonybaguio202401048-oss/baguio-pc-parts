import { Link, useSearchParams } from 'react-router-dom';
import { OrdersApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import { EmptyState, ErrorAlert, SkeletonLoader, StatusBadge } from '../components/ui';
import { formatPHP } from '../utils/currency';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const { data, meta, loading, error, reload } = useApi((signal) => OrdersApi.list({ page, limit: 10 }, signal), [page]);

  if (loading) return <div className="page"><SkeletonLoader count={3} variant="row" /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} onRetry={reload} /></div>;
  if (!data.length) return <EmptyState icon="📦" title="No orders yet" action={<Link to="/products" className="btn">Start shopping</Link>} />;

  return (
    <div className="page">
      <h1>My orders</h1>
      <ul className="stack" role="list">
        {data.map((o) => (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`} className="card order-row">
              <div>
                <strong>{o.orderNumber}</strong>
                <p className="small muted">{new Date(o.createdAt).toLocaleString('en-PH')} · {o.itemCount} item(s)</p>
              </div>
              <div className="right">
                <StatusBadge status={o.status} />
                <p><strong>{formatPHP(o.totalCents)}</strong></p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {meta.totalPages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setParams({ page: page - 1 })}>Previous</button>
          <span>{page} / {meta.totalPages}</span>
          <button type="button" className="btn btn-ghost" disabled={page >= meta.totalPages} onClick={() => setParams({ page: page + 1 })}>Next</button>
        </nav>
      )}
    </div>
  );
}
