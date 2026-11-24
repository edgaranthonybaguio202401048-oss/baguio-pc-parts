import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CatalogApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNetwork } from '../context/NetworkStatusContext';
import { EmptyState, ErrorAlert, OfflineHint, QuantityStepper, SkeletonLoader } from '../components/ui';
import { formatPHP } from '../utils/currency';

const SPEC_LABELS = {
  socket: 'Socket', cores: 'Cores', threads: 'Threads', tdpWatts: 'TDP (W)', memoryType: 'Memory type', integratedGraphics: 'Integrated graphics',
  formFactor: 'Form factor', ramSlots: 'RAM slots', maxMemoryGb: 'Max memory (GB)', wifi: 'Wi-Fi', capacityGb: 'Capacity (GB)', modules: 'Modules',
  speedMhz: 'Speed (MHz)', chipset: 'Chipset', vramGb: 'VRAM (GB)', lengthMm: 'Length (mm)', recommendedPsuWatts: 'Recommended PSU (W)',
  wattage: 'Wattage (W)', efficiency: 'Efficiency', modular: 'Modular', supportedFormFactors: 'Supports', maxGpuLengthMm: 'Max GPU length (mm)', interface: 'Interface',
};
const show = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { add } = useCart();
  const { online } = useNetwork();
  const { data: p, loading, error, reload } = useApi((signal) => CatalogApi.product(id, signal), [id]);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [added, setAdded] = useState(false);

  if (loading) return <div className="page"><SkeletonLoader count={1} variant="detail" /></div>;
  if (error?.status === 404) return <EmptyState icon="🧩" title="Product not found" action={<Link to="/products" className="btn">Back to shop</Link>} />;
  if (error) return <div className="page"><ErrorAlert error={error} onRetry={reload} /></div>;

  const addToCart = async () => {
    if (!isAuthenticated) { navigate('/login', { state: { from: `/products/${id}` } }); return; }
    setBusy(true); setActionError(null);
    try { await add(p.id, qty); setAdded(true); } catch (err) { setActionError(err); } finally { setBusy(false); }
  };

  return (
    <div className="page has-action-bar">
      <article className="detail">
        <img src={p.imageUrl || '/images/accessory.webp'} alt={p.name} width="480" height="360" className="detail-img" />
        <p className="eyebrow">{p.brand} · {p.category?.name} · SKU {p.sku}</p>
        <h1>{p.name}</h1>
        <p className="price big">{formatPHP(p.priceCents)}</p>
        <p className={`stock ${p.stock === 0 ? 'out' : p.stock <= 3 ? 'low' : ''}`}>{p.stock === 0 ? 'Out of stock' : `${p.stock} in stock`}</p>
        <p>{p.description}</p>
        {Object.keys(p.specs || {}).length > 0 && (
          <section aria-labelledby="specs-h">
            <h2 id="specs-h">Specifications</h2>
            <dl className="specs">
              {Object.entries(p.specs).map(([k, v]) => (
                <div key={k}><dt>{SPEC_LABELS[k] || k}</dt><dd>{show(v)}</dd></div>
              ))}
            </dl>
          </section>
        )}
        <ErrorAlert error={actionError} onClose={() => setActionError(null)} />
        {added && <div className="alert alert-ok" role="status">Added to cart. <Link to="/cart">View cart</Link></div>}
      </article>

      <div className="action-bar">
        <QuantityStepper value={qty} max={Math.max(1, Math.min(20, p.stock))} onChange={setQty} disabled={p.stock === 0} />
        <button type="button" className="btn btn-grow" onClick={addToCart} disabled={busy || p.stock === 0 || !online}>
          {busy ? 'Adding…' : p.stock === 0 ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
      <OfflineHint online={online} action="adding to cart" />
    </div>
  );
}
