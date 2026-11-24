import { Link, useParams } from 'react-router-dom';
import { BuildsApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import CompatibilityPanel from '../components/CompatibilityPanel';
import { EmptyState, ErrorAlert, SkeletonLoader } from '../components/ui';
import { formatPHP } from '../utils/currency';

export default function SharedBuild() {
  const { shareCode } = useParams();
  const { data: b, loading, error, reload } = useApi((signal) => BuildsApi.shared(shareCode, signal), [shareCode]);
  if (loading) return <div className="page"><SkeletonLoader count={2} variant="row" /></div>;
  if (error?.status === 404) return <EmptyState icon="🔗" title="Build not found">This build is private or the link is wrong.</EmptyState>;
  if (error) return <div className="page"><ErrorAlert error={error} onRetry={reload} /></div>;
  return (
    <div className="page">
      <p className="eyebrow">Shared by {b.owner}</p>
      <h1>{b.name}</h1>
      <ul className="picks">
        {b.items.map((i) => (
          <li key={i.slot} className="pick">
            <img src={i.product.imageUrl || '/images/accessory.webp'} alt="" width="72" height="54" loading="lazy" />
            <div className="grow">
              <p className="eyebrow">{i.slot}</p>
              <Link to={`/products/${i.product.id}`} className="pick-name">{i.product.name}</Link>
              <p className="small">{formatPHP(i.product.priceCents)} {i.product.available ? '' : '· currently unavailable'}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="total-line">Total: <strong>{formatPHP(b.totalCents)}</strong></p>
      <CompatibilityPanel report={b.compatibility} />
      <Link to="/builds" className="btn btn-block">Plan your own build</Link>
    </div>
  );
}
