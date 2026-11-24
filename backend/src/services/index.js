'use strict';
/**
 * Composition root: the ONE place where services are constructed and their
 * collaborators injected (constructor injection). Controllers import ready
 * instances from here; tests can build their own with fakes.
 */
const InventoryService = require('./inventoryService');
const PricingService = require('./pricingService');
const OrderService = require('./orderService');
const PaymentService = require('./paymentService');
const CartService = require('./cartService');
const CheckoutService = require('./checkoutService');
const AuthService = require('./authService');
const ProductService = require('./productService');
const AdminService = require('./adminService');
const BuildService = require('./buildService');
const AiAdvisorService = require('./aiAdvisorService');

const inventoryService = new InventoryService();
const pricingService = new PricingService();
const orderService = new OrderService({ inventoryService });
const paymentService = new PaymentService({ orderService, inventoryService });
const cartService = new CartService();
const checkoutService = new CheckoutService({ pricingService, inventoryService, paymentService, cartService });

module.exports = {
  inventoryService,
  pricingService,
  orderService,
  paymentService,
  cartService,
  checkoutService,
  authService: new AuthService(),
  productService: new ProductService(),
  adminService: new AdminService(),
  buildService: new BuildService(),
  aiAdvisorService: new AiAdvisorService(),
};
