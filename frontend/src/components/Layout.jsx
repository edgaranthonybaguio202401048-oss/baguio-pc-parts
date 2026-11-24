import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkStatusContext';

export function OfflineBanner() {
  const { online } = useNetwork();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      📴 Offline mode – browsing saved products. Checkout, payment, AI and sign-in are paused.
    </div>
  );
}

export function Header() {
  const { isAdmin } = useAuth();
  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="Baguio PC Parts home">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Baguio PC Parts</span>
      </Link>
      {isAdmin && <Link to="/admin" className="btn btn-small btn-ghost">Admin</Link>}
    </header>
  );
}

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/products', label: 'Shop', icon: '🧩' },
  { to: '/ai-assistant', label: 'AI Advisor', icon: '✨' },
  { to: '/cart', label: 'Cart', icon: '🛒', badge: true },
  { to: '/account', label: 'Account', icon: '👤' },
];

export function BottomNav() {
  const { cart } = useCart();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="tab">
          <span className="tab-icon" aria-hidden="true">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
          {t.badge && cart.itemCount > 0 && <span className="tab-badge" aria-label={`${cart.itemCount} items in cart`}>{cart.itemCount}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <OfflineBanner />
      <main id="main" className="app-main" key={pathname}>
        <Outlet />
      </main>
     <footer className="app-footer small muted">© 2026 Baguio PC Parts · Sabayle Street, Iligan City · Test-mode payments only</footer>
      <BottomNav />
    </div>
  );
}
