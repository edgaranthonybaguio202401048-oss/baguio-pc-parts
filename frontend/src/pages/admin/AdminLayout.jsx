import { NavLink, Outlet } from 'react-router-dom';

export default function AdminLayout() {
  return (
    <div className="page">
      <h1 className="sr-only">Store administration</h1>
      <nav className="chips-scroll admin-tabs" aria-label="Admin sections">
        <NavLink end to="/admin" className="chip">Dashboard</NavLink>
        <NavLink to="/admin/products" className="chip">Products & stock</NavLink>
        <NavLink to="/admin/orders" className="chip">Orders</NavLink>
        <NavLink to="/admin/coupons" className="chip">Coupons</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
