import { Link } from 'react-router-dom';
import { formatPHP } from '../utils/currency';

export default function ProductCard({ product }) {
  const low = product.stock > 0 && product.stock <= 3;
  return (
    <article className="card product-card">
      <Link to={`/products/${product.id}`} className="product-link" aria-label={`${product.name}, ${formatPHP(product.priceCents)}`}>
        <img src={product.imageUrl || '/images/accessory.webp'} alt="" width="480" height="360" loading="lazy" decoding="async" />
        <div className="product-body">
          <p className="eyebrow">{product.brand} · {product.category?.name}</p>
          <h3 className="product-name">{product.name}</h3>
          <p className="price">{formatPHP(product.priceCents)}</p>
          <p className={`stock ${product.stock === 0 ? 'out' : low ? 'low' : ''}`}>
            {product.stock === 0 ? 'Out of stock' : low ? `Only ${product.stock} left` : 'In stock'}
          </p>
        </div>
      </Link>
    </article>
  );
}
