import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from './ui';

/** UX guard only – the API enforces roles independently (403/401). */
export default function ProtectedRoute({ role }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (role && user?.role !== role) {
    return <EmptyState icon="🔒" title="Access denied">This page is for store administrators only.</EmptyState>;
  }
  return <Outlet />;
}
