import { api } from './client';

const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const AuthApi = {
  register: (body) => api.post('/auth/register', body, { auth: false }),
  login: (body) => api.post('/auth/login', body, { auth: false }),
  me: () => api.get('/auth/me'),
};

export const CatalogApi = {
  products: (params, signal) => api.get(`/products${qs(params)}`, { signal, auth: false }),
  product: (id, signal) => api.get(`/products/${id}`, { signal, auth: false }),
  categories: (signal) => api.get('/categories', { signal, auth: false }),
};

export const CartApi = {
  get: (signal) => api.get('/cart', { signal }),
  add: (productId, quantity) => api.post('/cart/items', { productId, quantity }),
  update: (productId, quantity) => api.patch(`/cart/items/${productId}`, { quantity }),
  remove: (productId) => api.del(`/cart/items/${productId}`),
  clear: () => api.del('/cart'),
};

export const CheckoutApi = {
  preview: (body) => api.post('/checkout/preview', body),
  // Idempotency-Key: one per checkout attempt (see utils/idempotency.js)
  placeOrder: (body, idempotencyKey) => api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

export const OrdersApi = {
  list: (params, signal) => api.get(`/orders${qs(params)}`, { signal }),
  get: (id, signal) => api.get(`/orders/${id}`, { signal }),
  cancel: (id) => api.post(`/orders/${id}/cancel`),
  retryPayment: (id) => api.post(`/orders/${id}/payment-session`),
  verifyPayment: (id) => api.post(`/orders/${id}/verify-payment`),
};

export const BuildsApi = {
  check: (items) => api.post('/builds/compatibility-check', { items }, { auth: false }),
  list: (signal) => api.get('/builds', { signal }),
  create: (body) => api.post('/builds', body),
  update: (id, body) => api.patch(`/builds/${id}`, body),
  remove: (id) => api.del(`/builds/${id}`),
  addToCart: (id) => api.post(`/builds/${id}/add-to-cart`),
  shared: (code, signal) => api.get(`/builds/shared/${code}`, { signal, auth: false }),
};

export const AiApi = {
  buildAdvisor: (body) => api.post('/ai/build-advisor', body),
};

export const AdminApi = {
  dashboard: (signal) => api.get('/admin/dashboard', { signal }),
  products: (params, signal) => api.get(`/admin/products${qs(params)}`, { signal }),
  createProduct: (body) => api.post('/admin/products', body),
  updateProduct: (id, body) => api.patch(`/admin/products/${id}`, body),
  deleteProduct: (id) => api.del(`/admin/products/${id}`),
  adjustStock: (id, body) => api.post(`/admin/products/${id}/stock-adjustments`, body),
  stockHistory: (id) => api.get(`/admin/products/${id}/stock-adjustments`),
  coupons: (signal) => api.get('/admin/coupons', { signal }),
  createCoupon: (body) => api.post('/admin/coupons', body),
  updateCoupon: (id, body) => api.patch(`/admin/coupons/${id}`, body),
  deleteCoupon: (id) => api.del(`/admin/coupons/${id}`),
  orders: (params, signal) => api.get(`/admin/orders${qs(params)}`, { signal }),
  order: (id, signal) => api.get(`/admin/orders/${id}`, { signal }),
  setOrderStatus: (id, body) => api.patch(`/admin/orders/${id}/status`, body),
  reconcile: (id) => api.post(`/admin/orders/${id}/reconcile`),
  webhookEvents: (params, signal) => api.get(`/admin/webhook-events${qs(params)}`, { signal }),
};
