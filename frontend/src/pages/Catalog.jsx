import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CatalogApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import ProductCard from '../components/ProductCard';
import { BottomSheet, EmptyState, ErrorAlert, SkeletonLoader } from '../components/ui';
import { useNetwork } from '../context/NetworkStatusContext';

const SORTS = [
  ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['name_asc', 'Name A–Z'],
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const { online } = useNetwork();
  const [search, setSearch] = useState(params.get('search') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounced = useDebounce(search);

  const query = {
    search: debounced || undefined,
    category: params.get('category') || undefined,
    sort: params.get('sort') || 'newest',
    minPrice: params.get('minPrice') || undefined,
    maxPrice: params.get('maxPrice') || undefined,
    inStock: params.get('inStock') || undefined,
    page: Number(params.get('page') || 1),
    limit: 12,
  };
  const key = JSON.stringify(query);
  const products = useApi((signal) => CatalogApi.products(query, signal), [key]);
  const cats = useApi((signal) => CatalogApi.categories(signal), []);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v === undefined || v === '' || v === null) next.delete(k); else next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  // Price filter form (controlled inputs, pesos -> centavos)
  const [minP, setMinP] = useState(query.minPrice ? String(query.minPrice / 100) : '');
  const [maxP, setMaxP] = useState(query.maxPrice ? String(query.maxPrice / 100) : '');
  const applyFilters = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    minP ? next.set('minPrice', String(Math.round(Number(minP) * 100))) : next.delete('minPrice');
    maxP ? next.set('maxPrice', String(Math.round(Number(maxP) * 100))) : next.delete('maxPrice');
    next.delete('page');
    setParams(next, { replace: true });
    setFiltersOpen(false);
  };

  const meta = products.meta;
  return (
    <div className="page">
      <h1>Shop PC parts</h1>
      <form role="search" className="search-row" onSubmit={(e) => { e.preventDefault(); setParam('search', search); }}>
        <label htmlFor="search" className="sr-only">Search products</label>
        <input id="search" type="search" placeholder="Search Ryzen, RTX, B650…" value={search}
          maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" className="btn btn-ghost" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">Filters</button>
      </form>

      <div className="chips-scroll" role="group" aria-label="Category">
        <button type="button" className={`chip ${!query.category ? 'active' : ''}`} onClick={() => setParam('category')}>All</button>
        {(cats.data || []).map((c) => (
          <button type="button" key={c.id} className={`chip ${query.category === c.slug ? 'active' : ''}`}
            aria-pressed={query.category === c.slug} onClick={() => setParam('category', c.slug)}>{c.name}</button>
        ))}
      </div>

      <label htmlFor="sort" className="sr-only">Sort products</label>
      <select id="sort" value={query.sort} onChange={(e) => setParam('sort', e.target.value)}>
        {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {!online && <p className="hint">Offline: showing products saved from your last visit.</p>}
      {products.loading && <SkeletonLoader count={6} />}
      {products.error && <ErrorAlert error={products.error} onRetry={products.reload} />}
      {!products.loading && products.data?.length === 0 && (
        <EmptyState icon="🔍" title="No parts match">Try a different search or clear the filters.</EmptyState>
      )}
      {!products.loading && products.data?.length > 0 && (
        <>
          <p className="small muted">{meta.total} products</p>
          <div className="grid">{products.data.map((p) => <ProductCard key={p.id} product={p} />)}</div>
          {meta.totalPages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button type="button" className="btn btn-ghost" disabled={meta.page <= 1} onClick={() => setParam('page', meta.page - 1)}>Previous</button>
              <span>Page {meta.page} of {meta.totalPages}</span>
              <button type="button" className="btn btn-ghost" disabled={meta.page >= meta.totalPages} onClick={() => setParam('page', meta.page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}

      <BottomSheet open={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <form onSubmit={applyFilters} className="stack">
          <div className="row">
            <div className="field">
              <label htmlFor="minP">Min price (₱)</label>
              <input id="minP" type="number" inputMode="numeric" min="0" value={minP} onChange={(e) => setMinP(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="maxP">Max price (₱)</label>
              <input id="maxP" type="number" inputMode="numeric" min="0" value={maxP} onChange={(e) => setMaxP(e.target.value)} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={query.inStock === 'true'} onChange={(e) => setParam('inStock', e.target.checked ? 'true' : undefined)} />
            In stock only
          </label>
          <button type="submit" className="btn btn-block">Apply filters</button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { setMinP(''); setMaxP(''); setParams({}, { replace: true }); setFiltersOpen(false); }}>Clear all</button>
        </form>
      </BottomSheet>
    </div>
  );
}
