import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  if (!isAuthenticated) {
    return (
      <div className="page narrow">
        <h1>Account</h1>
        <div className="stack card">
          <p>Sign in to see your orders, saved builds and cart.</p>
          <Link to="/login" className="btn btn-block">Sign in</Link>
          <Link to="/register" className="btn btn-ghost btn-block">Create account</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <h1>Hi, {user?.name?.split(' ')[0]}</h1>
      <p className="muted">{user?.email}</p>
      <nav className="menu" aria-label="Account">
        <Link to="/orders">📦 My orders</Link>
        <Link to="/builds">🛠️ My PC builds</Link>
        <Link to="/ai-assistant">✨ AI Build Advisor</Link>
        {isAdmin && <Link to="/admin">🔧 Store admin</Link>}
      </nav>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => logout()}>Sign out</button>
    </div>
  );
}
