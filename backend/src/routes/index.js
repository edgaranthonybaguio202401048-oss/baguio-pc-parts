'use strict';
/**
 * Express routers ONLY – no queries, no business rules (T-01).
 * Each line is: path + middleware chain (auth / role / validation) + controller.
 */
const express = require('express');
const config = require('../config');
const S = require('../validators/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { authLimiter, aiLimiter } = require('../middleware/rateLimiters');
const auth = require('../controllers/authController');
const catalog = require('../controllers/catalogController');
const cart = require('../controllers/cartController');
const orders = require('../controllers/orderController');
const builds = require('../controllers/buildController');
const ai = require('../controllers/aiController');
const admin = require('../controllers/adminController');

const v1 = express.Router();

// ---------------------------------------------------------------- auth
v1.post('/auth/register', authLimiter, validate({ body: S.register }), auth.register);
v1.post('/auth/login', authLimiter, validate({ body: S.login }), auth.login);
v1.get('/auth/me', authenticate, auth.me);

// ---------------------------------------------------------------- catalog (public)
v1.get('/products', validate({ query: S.productListQuery }), catalog.listProducts);
v1.get('/products/:id', validate({ params: S.idParam }), catalog.getProduct);
v1.get('/categories', catalog.listCategories);
v1.get('/shipping-options', catalog.listShippingOptions);

// ---------------------------------------------------------------- cart (customer)
const cartRouter = express.Router();
cartRouter.use(authenticate, authorize('customer', 'admin'));
cartRouter.get('/', cart.get);
cartRouter.post('/items', validate({ body: S.cartAdd }), cart.addItem);
cartRouter.patch('/items/:productId', validate({ params: S.productIdParam, body: S.cartUpdate }), cart.updateItem);
cartRouter.delete('/items/:productId', validate({ params: S.productIdParam }), cart.removeItem);
cartRouter.delete('/', cart.clear);
v1.use('/cart', cartRouter);

// ---------------------------------------------------------------- checkout & orders (customer)
v1.post('/checkout/preview', authenticate, validate({ body: S.checkoutPreview }), orders.preview);
const orderRouter = express.Router();
orderRouter.use(authenticate);
orderRouter.post('/', validate({ body: S.checkout }), orders.checkout);
orderRouter.get('/', validate({ query: S.orderListQuery }), orders.listMine);
orderRouter.get('/:id', validate({ params: S.idParam }), orders.getMine);
orderRouter.post('/:id/cancel', validate({ params: S.idParam }), orders.cancel);
orderRouter.post('/:id/payment-session', validate({ params: S.idParam }), orders.retryPayment);
orderRouter.post('/:id/verify-payment', validate({ params: S.idParam }), orders.verifyPayment);
v1.use('/orders', orderRouter);

// ---------------------------------------------------------------- Level 3: PC builds
v1.post('/builds/compatibility-check', validate({ body: S.compatibilityCheck }), builds.check);
v1.get('/builds/shared/:shareCode', validate({ params: S.shareCodeParam }), builds.getShared);
const buildRouter = express.Router();
buildRouter.use(authenticate);
buildRouter.get('/', builds.list);
buildRouter.post('/', validate({ body: S.buildCreate }), builds.create);
buildRouter.get('/:id', validate({ params: S.idParam }), builds.get);
buildRouter.patch('/:id', validate({ params: S.idParam, body: S.buildUpdate }), builds.update);
buildRouter.delete('/:id', validate({ params: S.idParam }), builds.remove);
buildRouter.post('/:id/add-to-cart', validate({ params: S.idParam }), builds.addToCart);
v1.use('/builds', buildRouter);

// ---------------------------------------------------------------- Level 4: AI
v1.post('/ai/build-advisor', optionalAuth, aiLimiter, validate({ body: S.aiBuildAdvisor(config.ai.maxInputChars) }), ai.buildAdvisor);

// ---------------------------------------------------------------- admin (every route behind auth + admin role)
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin'));
adminRouter.get('/dashboard', admin.dashboard);
adminRouter.get('/products', validate({ query: S.productListQuery }), admin.listProducts);
adminRouter.post('/products', validate({ body: S.productCreate }), admin.createProduct);
adminRouter.get('/products/:id', validate({ params: S.idParam }), admin.getProduct);
adminRouter.patch('/products/:id', validate({ params: S.idParam, body: S.productUpdate }), admin.updateProduct);
adminRouter.delete('/products/:id', validate({ params: S.idParam }), admin.deleteProduct);
adminRouter.post('/products/:id/stock-adjustments', validate({ params: S.idParam, body: S.stockAdjustment }), admin.adjustStock);
adminRouter.get('/products/:id/stock-adjustments', validate({ params: S.idParam }), admin.stockHistory);
adminRouter.post('/categories', validate({ body: S.categoryCreate }), admin.createCategory);
adminRouter.patch('/categories/:id', validate({ params: S.idParam, body: S.categoryUpdate }), admin.updateCategory);
adminRouter.get('/coupons', admin.listCoupons);
adminRouter.post('/coupons', validate({ body: S.couponCreate }), admin.createCoupon);
adminRouter.patch('/coupons/:id', validate({ params: S.idParam, body: S.couponUpdate }), admin.updateCoupon);
adminRouter.delete('/coupons/:id', validate({ params: S.idParam }), admin.deleteCoupon);
adminRouter.get('/orders', validate({ query: S.adminOrderListQuery }), admin.listOrders);
adminRouter.get('/orders/:id', validate({ params: S.idParam }), admin.getOrder);
adminRouter.patch('/orders/:id/status', validate({ params: S.idParam, body: S.orderStatusUpdate }), admin.updateOrderStatus);
adminRouter.post('/orders/:id/reconcile', validate({ params: S.idParam }), admin.reconcileOrder);
adminRouter.get('/webhook-events', validate({ query: S.pagination }), admin.webhookEvents);
v1.use('/admin', adminRouter);

module.exports = v1;
