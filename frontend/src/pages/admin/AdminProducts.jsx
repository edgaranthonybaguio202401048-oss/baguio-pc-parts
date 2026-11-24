import { useState } from 'react';
import { AdminApi, CatalogApi } from '../../api/endpoints';
import useApi from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import { BottomSheet, ErrorAlert, FormField, SkeletonLoader } from '../../components/ui';
import { formatPHP } from '../../utils/currency';
import { fieldErrorsFrom } from '../../utils/validators';

const EMPTY = { sku: '', name: '', brand: '', description: '', price: '', stock: '0', categoryId: '', imageUrl: '', specs: '{}', isActive: true };

function ProductForm({ product, categories, onDone }) {
  const [f, setF] = useState(product ? {
    ...product, price: String(product.priceCents / 100), stock: String(product.stock),
    categoryId: product.category?.id || '', imageUrl: product.imageUrl || '', specs: JSON.stringify(product.specs || {}, null, 1),
  } : EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    let specs;
    try { specs = JSON.parse(f.specs || '{}'); } catch { setErrors({ specs: 'Specs must be valid JSON' }); return; }
    const body = {
      name: f.name, brand: f.brand, description: f.description, categoryId: f.categoryId,
      priceCents: Math.round(Number(f.price) * 100), specs, isActive: f.isActive,
      ...(f.imageUrl ? { imageUrl: f.imageUrl } : {}),
    };
    setBusy(true); setError(null); setErrors({});
    try {
      if (product) await AdminApi.updateProduct(product.id, body);
      else await AdminApi.createProduct({ ...body, sku: f.sku.toUpperCase(), stock: Number(f.stock) });
      onDone();
    } catch (err) { setError(err); setErrors(fieldErrorsFrom(err)); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="stack" noValidate>
      {!product && <FormField id="p-sku" label="SKU" error={errors.sku}><input id="p-sku" value={f.sku} onChange={set('sku')} /></FormField>}
      <FormField id="p-name" label="Name" error={errors.name}><input id="p-name" value={f.name} onChange={set('name')} /></FormField>
      <FormField id="p-brand" label="Brand" error={errors.brand}><input id="p-brand" value={f.brand} onChange={set('brand')} /></FormField>
      <FormField id="p-cat" label="Category" error={errors.categoryId}>
        <select id="p-cat" value={f.categoryId} onChange={set('categoryId')}>
          <option value="">Choose…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </FormField>
      <div className="row">
        <FormField id="p-price" label="Price (₱)" error={errors.priceCents}><input id="p-price" type="number" step="0.01" min="0" value={f.price} onChange={set('price')} /></FormField>
        {!product && <FormField id="p-stock" label="Initial stock" error={errors.stock}><input id="p-stock" type="number" min="0" value={f.stock} onChange={set('stock')} /></FormField>}
      </div>
      <FormField id="p-desc" label="Description" error={errors.description}><textarea id="p-desc" rows={3} value={f.description} onChange={set('description')} /></FormField>
      <FormField id="p-img" label="Image URL" error={errors.imageUrl} hint="/images/gpu.webp or https://…"><input id="p-img" value={f.imageUrl} onChange={set('imageUrl')} /></FormField>
      <FormField id="p-specs" label="Specs (JSON, used for compatibility)" error={errors.specs}><textarea id="p-specs" rows={4} className="mono" value={f.specs} onChange={set('specs')} /></FormField>
      <label className="check"><input type="checkbox" checked={f.isActive} onChange={set('isActive')} /> Active (visible to customers)</label>
      <ErrorAlert error={error} />
      <button type="submit" className="btn btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
    </form>
  );
}

function StockForm({ product, onDone }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const history = useApi(() => AdminApi.stockHistory(product.id), [product.id]);
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try { await AdminApi.adjustStock(product.id, { delta: Number(delta), reason }); onDone(); } catch (err) { setError(err); }
  };
  return (
    <div className="stack">
      <p>Current stock: <strong>{product.stock}</strong></p>
      <form onSubmit={submit} className="stack">
        <div className="row">
          <div className="field"><label htmlFor="s-delta">Change (+/−)</label><input id="s-delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required /></div>
          <div className="field grow"><label htmlFor="s-reason">Reason</label><input id="s-reason" value={reason} minLength={3} onChange={(e) => setReason(e.target.value)} required placeholder="Supplier delivery DR-1182" /></div>
        </div>
        <ErrorAlert error={error} />
        <button type="submit" className="btn btn-block">Record adjustment</button>
      </form>
      <h3>History</h3>
      {history.loading ? <SkeletonLoader count={1} variant="row" /> : (
        <ul className="small stack">
          {(history.data || []).map((h) => (
            <li key={h.id}>{h.previousStock} → {h.newStock} ({h.delta > 0 ? '+' : ''}{h.delta}) · {h.reason} · {h.actor?.name || h.actorType} · {new Date(h.createdAt).toLocaleString('en-PH')}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminProducts() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const list = useApi((signal) => AdminApi.products({ search: q || undefined, page, limit: 20 }, signal), [q, page]);
  const cats = useApi((signal) => CatalogApi.categories(signal), []);
  const [sheet, setSheet] = useState(null); // { mode: 'new'|'edit'|'stock', product }
  const [error, setError] = useState(null);

  const done = () => { setSheet(null); list.reload(); };
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}? Products with order history are deactivated instead.`)) return;
    try {
      const { headers } = await AdminApi.deleteProduct(p.id);
      window.alert(headers.get('X-Delete-Mode') === 'soft' ? 'Product has history – it was deactivated (soft delete).' : 'Product deleted.');
      list.reload();
    } catch (err) { setError(err); }
  };

  return (
    <div className="stack">
      <div className="row between"><h2>Products</h2><button type="button" className="btn btn-small" onClick={() => setSheet({ mode: 'new' })}>+ Add</button></div>
      <label htmlFor="admin-search" className="sr-only">Search products</label>
      <input id="admin-search" type="search" placeholder="Search name, SKU, brand" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      <ErrorAlert error={error || list.error} onClose={() => setError(null)} />
      {list.loading ? <SkeletonLoader count={4} variant="row" /> : (
        <ul className="stack" role="list">
          {(list.data || []).map((p) => (
            <li key={p.id} className={`card admin-row ${p.isActive ? '' : 'inactive'}`}>
              <div className="grow">
                <strong>{p.name}</strong>
                <p className="small muted">{p.sku} · {formatPHP(p.priceCents)} · stock {p.stock}{p.isActive ? '' : ' · inactive'}</p>
              </div>
              <div className="row wrap">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setSheet({ mode: 'edit', product: p })}>Edit</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setSheet({ mode: 'stock', product: p })}>Stock</button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => remove(p)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.meta?.totalPages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page} / {list.meta.totalPages}</span>
          <button type="button" className="btn btn-ghost" disabled={page >= list.meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
      <BottomSheet open={Boolean(sheet)} onClose={() => setSheet(null)}
        title={sheet?.mode === 'stock' ? `Stock – ${sheet.product.name}` : sheet?.mode === 'edit' ? 'Edit product' : 'New product'}>
        {sheet?.mode === 'stock' && <StockForm product={sheet.product} onDone={done} />}
        {sheet && sheet.mode !== 'stock' && <ProductForm product={sheet.product} categories={cats.data || []} onDone={done} />}
      </BottomSheet>
    </div>
  );
}
