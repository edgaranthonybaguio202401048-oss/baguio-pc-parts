'use strict';
/**
 * Request schemas (T-03). Every write endpoint has a strict schema:
 * types, lengths, enums and ranges are checked and unknown fields rejected.
 */
const { z } = require('zod');

const uuid = z.string().uuid('must be a valid id');
const idParam = z.object({ id: uuid }).strict();
const productIdParam = z.object({ productId: uuid }).strict();
const trimmed = (min, max) => z.string().trim().min(min).max(max);
const cents = z.number().int('must be an integer number of centavos').min(0, 'must not be negative').max(100_000_000);
const componentTypes = ['CPU', 'MOTHERBOARD', 'RAM', 'GPU', 'PSU', 'CASE', 'STORAGE', 'ACCESSORY'];
const orderStatuses = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired'];
const buildSlots = ['CPU', 'MOTHERBOARD', 'RAM', 'GPU', 'PSU', 'CASE', 'STORAGE'];

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
};

// ------------------------------------------------------------ auth
const register = z.object({
  name: trimmed(2, 80),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z
    .string()
    .min(8, 'must be at least 8 characters')
    .max(72, 'must be at most 72 characters')
    .regex(/[A-Za-z]/, 'must contain a letter')
    .regex(/\d/, 'must contain a number'),
}).strict();

const login = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(72),
}).strict();

// ------------------------------------------------------------ catalog
const productListQuery = z.object({
  ...pagination,
  search: z.string().trim().max(80).optional(),
  category: z.string().trim().max(60).optional(), // slug
  componentType: z.enum(componentTypes).optional(),
  brand: z.string().trim().max(40).optional(),
  minPrice: z.coerce.number().int().min(0).optional(), // centavos
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  // T-06: whitelisted sort fields only
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc']).default('newest'),
}).strict().refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
  message: 'minPrice must be <= maxPrice',
  path: ['minPrice'],
});

const specsSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(80), z.number(), z.boolean(), z.array(z.string().max(40)).max(10)]),
).refine((o) => Object.keys(o).length <= 20, 'too many spec fields');

const productCreate = z.object({
  sku: z.string().trim().min(3).max(40).regex(/^[A-Z0-9-]+$/, 'uppercase letters, digits and dashes only'),
  name: trimmed(3, 120),
  brand: trimmed(1, 40),
  description: trimmed(10, 2000),
  priceCents: cents.refine((v) => v > 0, 'must be greater than zero'),
  stock: z.number().int().min(0, 'must not be negative').max(100000),
  categoryId: uuid,
  imageUrl: z.string().trim().max(500).regex(/^(https:\/\/|\/)/, 'must be https:// or a /relative path').optional(),
  specs: specsSchema.default({}),
  isActive: z.boolean().default(true),
}).strict();

// Stock is NOT editable here – it changes only through audited stock adjustments (L1-10).
const productUpdate = productCreate.omit({ stock: true }).partial().strict()
  .refine((o) => Object.keys(o).length > 0, 'at least one field is required');

const stockAdjustment = z.object({
  delta: z.number().int().refine((v) => v !== 0, 'must not be zero').refine((v) => Math.abs(v) <= 10000, 'too large'),
  reason: trimmed(3, 200),
}).strict();

const categoryCreate = z.object({
  name: trimmed(2, 60),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  componentType: z.enum(componentTypes),
}).strict();
const categoryUpdate = categoryCreate.partial().strict();

// ------------------------------------------------------------ cart
const cartAdd = z.object({
  productId: uuid,
  quantity: z.number().int().min(1).max(20),
}).strict();
const cartUpdate = z.object({ quantity: z.number().int().min(1).max(20) }).strict();

// ------------------------------------------------------------ checkout / orders
const shippingMethod = z.enum(['store_pickup', 'baguio_delivery', 'luzon_courier']);
const shipping = z.object({
  name: trimmed(2, 80),
  phone: z.string().trim().regex(/^(\+63|0)9\d{9}$/, 'must be a PH mobile number like 09171234567'),
  addressLine: trimmed(5, 160),
  city: trimmed(2, 60),
  province: trimmed(2, 60),
  postalCode: z.string().trim().regex(/^\d{4}$/, 'must be a 4-digit PH postal code'),
}).strict();

const checkoutPreview = z.object({
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
  shippingMethod: shippingMethod.default('store_pickup'),
}).strict();

// Note: there is deliberately NO price/total field. Unknown fields such as
// "totalCents" or "items[].price" are stripped by `.strip()` so tampered
// requests still succeed with SERVER prices (L2-02 tamper test).
const checkout = z.object({
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
  shippingMethod,
  shipping,
}).strip();

const idempotencyHeader = z.string().trim().min(8).max(100).regex(/^[\w-]+$/);

const orderListQuery = z.object({
  ...pagination,
  status: z.enum(orderStatuses).optional(),
}).strict();

const adminOrderListQuery = z.object({
  ...pagination,
  status: z.enum(orderStatuses).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  flagged: z.enum(['true', 'false']).optional(),
}).strict();

const orderStatusUpdate = z.object({
  status: z.enum(orderStatuses),
  note: z.string().trim().max(200).optional(),
}).strict();

// ------------------------------------------------------------ coupons
const couponBase = z.object({
  code: z.string().trim().toUpperCase().min(3).max(30).regex(/^[A-Z0-9_-]+$/),
  description: z.string().trim().max(200).optional(),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().int().positive(),
  maxDiscountCents: cents.optional(),
  minSpendCents: cents.default(0),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  usageLimit: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().max(100).default(1),
  isActive: z.boolean().default(true),
}).strict();
const couponCreate = couponBase.refine((c) => c.type !== 'percentage' || c.value <= 100, {
  message: 'percentage value must be between 1 and 100', path: ['value'],
});
const couponUpdate = couponBase.partial().strict();

// ------------------------------------------------------------ builds (Level 3)
const buildItem = z.object({
  slot: z.enum(buildSlots),
  productId: uuid,
  quantity: z.number().int().min(1).max(4).default(1),
}).strict();
const buildCreate = z.object({
  name: trimmed(2, 60),
  isPublic: z.boolean().default(false),
  items: z.array(buildItem).min(1).max(12),
}).strict();
const buildUpdate = buildCreate.partial().strict();
const compatibilityCheck = z.object({ items: z.array(buildItem).min(1).max(12) }).strict();
const shareCodeParam = z.object({ shareCode: z.string().regex(/^[A-Za-z0-9]{8}$/) }).strict();

// ------------------------------------------------------------ AI (Level 4)
const aiBuildAdvisor = (maxChars) => z.object({
  prompt: z.string().trim().min(5, 'please describe what you need').max(maxChars, `must be at most ${maxChars} characters`),
  budgetCents: z.number().int().min(500_000).max(100_000_000).optional(), // ₱5,000 – ₱1,000,000
}).strict();

module.exports = {
  idParam, productIdParam, shareCodeParam,
  register, login,
  productListQuery, productCreate, productUpdate, stockAdjustment, categoryCreate, categoryUpdate,
  cartAdd, cartUpdate,
  checkoutPreview, checkout, idempotencyHeader, orderListQuery, adminOrderListQuery, orderStatusUpdate,
  couponCreate, couponUpdate,
  buildCreate, buildUpdate, compatibilityCheck,
  aiBuildAdvisor,
  pagination: z.object(pagination).strict(),
};
