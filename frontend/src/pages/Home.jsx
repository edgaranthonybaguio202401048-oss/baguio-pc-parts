import { Link } from 'react-router-dom';
import { CatalogApi } from '../api/endpoints';
import useApi from '../hooks/useApi';
import ProductCard from '../components/ProductCard';
import { ErrorAlert, SkeletonLoader } from '../components/ui';

export default function Home() {
  const featured = useApi((signal) => CatalogApi.products({ sort: 'newest', limit: 6, inStock: 'true' }, signal), []);
  const cats = useApi((signal) => CatalogApi.categories(signal), []);

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Session Road · Baguio City</p>
        <h1>Build your PC with parts that actually fit.</h1>
        <p>Every cart is compatibility-checked – socket, RAM type, case size and PSU wattage – before you pay with Maya.</p>
        <div className="row wrap">
          <Link to="/ai-assistant" className="btn">✨ Ask the AI Build Advisor</Link>
          <Link to="/products" className="btn btn-ghost">Browse parts</Link>
        </div>
      </section>

      <section aria-labelledby="cat-heading">
        <h2 id="cat-heading">Shop by category</h2>
        {cats.error && <ErrorAlert error={cats.error} onRetry={cats.reload} />}
        <ul className="chips" role="list">
          {(cats.data || []).map((c) => (
            <li key={c.id}><Link className="chip" to={`/products?category=${c.slug}`}>{c.name}</Link></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="feat-heading">
        <div className="row between">
          <h2 id="feat-heading">New arrivals</h2>
          <Link to="/products" className="small">See all</Link>
        </div>
        {featured.loading && <SkeletonLoader count={4} />}
        {featured.error && <ErrorAlert error={featured.error} onRetry={featured.reload} />}
        {featured.data && (
          <div className="grid">
            {featured.data.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      <section className="card info-card">
        <h2>Plan a full build</h2>
        <p>Save up to 10 builds, check compatibility, share a link with your barkada, and add the whole build to your cart in one tap.</p>
        <Link to="/builds" className="btn btn-ghost">Open Build Planner</Link>
      </section>
    </div>
  );
}
