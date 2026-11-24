import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildsApi, CatalogApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import { useCart } from '../context/CartContext';
import { useNetwork } from '../context/NetworkStatusContext';
import CompatibilityPanel from '../components/CompatibilityPanel';
import { BottomSheet, EmptyState, ErrorAlert, OfflineHint, SkeletonLoader } from '../components/ui';
import { formatPHP } from '../utils/currency';

const SLOTS = [
  ['CPU', 'Processor'], ['MOTHERBOARD', 'Motherboard'], ['RAM', 'Memory'], ['GPU', 'Graphics card'],
  ['PSU', 'Power supply'], ['CASE', 'Case'], ['STORAGE', 'Storage'],
];

/** Picks one product per slot; compatibility is checked by the SERVER on every change. */
function BuildEditor({ initial, onSaved, onCancel }) {
  const { online } = useNetwork();
  const [name, setName] = useState(initial?.name || 'My Baguio build');
  const [isPublic, setIsPublic] = useState(initial?.isPublic || false);
  const [selected, setSelected] = useState(() => Object.fromEntries((initial?.items || []).map((i) => [i.slot, i.product.id])));
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = useApi((signal) => Promise.all(SLOTS.map(([type]) => CatalogApi.products({ componentType: type, limit: 50, sort: 'price_asc' }, signal)))
    .then((r) => ({ data: Object.fromEntries(SLOTS.map(([t], i) => [t, r[i].data])) })), []);

  const items = Object.entries(selected).filter(([, id]) => id).map(([slot, productId]) => ({ slot, productId, quantity: 1 }));
  const itemsKey = JSON.stringify(items);

  useEffect(() => {
    if (!items.length || !online) { setReport(null); return undefined; }
    let stale = false;
    BuildsApi.check(items).then(({ data }) => { if (!stale) setReport(data); }).catch((err) => { if (!stale) setError(err); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, online]);

  const save = async (e) => {
    e.preventDefault();
    if (!items.length) return;
    setBusy(true); setError(null);
    try {
      const body = { name: name.trim(), isPublic, items };
      const { data } = initial ? await BuildsApi.update(initial.id, body) : await BuildsApi.create(body);
      onSaved(data);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  if (options.loading) return <SkeletonLoader count={3} variant="row" />;
  if (options.error) return <ErrorAlert error={options.error} onRetry={options.reload} />;

  return (
    <form onSubmit={save} className="stack">
      <div className="field">
        <label htmlFor="build-name">Build name</label>
        <input id="build-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      {SLOTS.map(([slot, label]) => (
        <div className="field" key={slot}>
          <label htmlFor={`slot-${slot}`}>{label}</label>
          <select id={`slot-${slot}`} value={selected[slot] || ''} onChange={(e) => setSelected((s) => ({ ...s, [slot]: e.target.value }))}>
            <option value="">— none —</option>
            {(options.data[slot] || []).map((p) => (
              <option key={p.id} value={p.id} disabled={p.stock === 0}>{p.name} – {formatPHP(p.priceCents)}{p.stock === 0 ? ' (out of stock)' : ''}</option>
            ))}
          </select>
        </div>
      ))}
      {report && (
        <>
          <p className="total-line">Build total: <strong>{formatPHP(report.totalCents)}</strong></p>
          <CompatibilityPanel report={report} />
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Share publicly (only compatible builds can be shared)
      </label>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      <button type="submit" className="btn btn-block" disabled={busy || !items.length || !online}>{busy ? 'Saving…' : 'Save build'}</button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
      <OfflineHint online={online} action="saving builds" />
    </form>
  );
}

export default function Builds() {
  const navigate = useNavigate();
  const { refresh } = useCart();
  const { online } = useNetwork();
  const builds = useApi((signal) => BuildsApi.list(signal), []);
  const [editing, setEditing] = useState(null); // null | 'new' | build
  const [actionError, setActionError] = useState(null);
  const [copied, setCopied] = useState('');

  const addToCart = async (b) => {
    setActionError(null);
    try { await BuildsApi.addToCart(b.id); await refresh(); navigate('/cart'); } catch (err) { setActionError(err); }
  };
  const remove = async (b) => {
    if (!window.confirm(`Delete "${b.name}"?`)) return;
    try { await BuildsApi.remove(b.id); builds.reload(); } catch (err) { setActionError(err); }
  };
  const share = async (b) => {
    try { await navigator.clipboard.writeText(b.shareUrl); setCopied(b.id); } catch { window.prompt('Copy this link', b.shareUrl); }
  };

  return (
    <div className="page">
      <div className="row between">
        <h1>PC Build Planner</h1>
        <button type="button" className="btn btn-small" onClick={() => setEditing('new')} disabled={!online}>+ New</button>
      </div>
      <ErrorAlert error={actionError} onClose={() => setActionError(null)} />
      {builds.loading && <SkeletonLoader count={2} variant="row" />}
      {builds.error && <ErrorAlert error={builds.error} onRetry={builds.reload} />}
      {builds.data?.length === 0 && (
        <EmptyState icon="🛠️" title="No saved builds yet" action={<button type="button" className="btn" onClick={() => setEditing('new')}>Plan a build</button>}>
          Pick parts slot by slot – we check socket, RAM, case size and PSU wattage for you.
        </EmptyState>
      )}
      <ul className="stack" role="list">
        {(builds.data || []).map((b) => (
          <li key={b.id} className="card stack">
            <div className="row between">
              <h2 className="h3">{b.name}</h2>
              <span className={`badge ${b.compatibility.compatible ? 'badge-paid' : 'badge-cancelled'}`}>{b.compatibility.compatible ? 'Compatible' : 'Issues'}</span>
            </div>
            <ul className="small">{b.items.map((i) => <li key={i.slot}>{i.slot}: {i.product.name}{!i.product.available && <span className="warn-text"> (unavailable)</span>}</li>)}</ul>
            <p><strong>{formatPHP(b.totalCents)}</strong></p>
            <CompatibilityPanel report={b.compatibility} compact />
            <div className="row wrap">
              <button type="button" className="btn btn-small" onClick={() => addToCart(b)} disabled={!online || !b.compatibility.compatible}>Add all to cart</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(b)} disabled={!online}>Edit</button>
              {b.isPublic && <button type="button" className="btn btn-small btn-ghost" onClick={() => share(b)}>{copied === b.id ? 'Link copied!' : 'Copy share link'}</button>}
              <button type="button" className="btn btn-small btn-danger" onClick={() => remove(b)} disabled={!online}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      <BottomSheet open={Boolean(editing)} title={editing === 'new' ? 'New build' : 'Edit build'} onClose={() => setEditing(null)}>
        {editing && (
          <BuildEditor initial={editing === 'new' ? null : editing}
            onSaved={() => { setEditing(null); builds.reload(); }} onCancel={() => setEditing(null)} />
        )}
      </BottomSheet>
    </div>
  );
}
