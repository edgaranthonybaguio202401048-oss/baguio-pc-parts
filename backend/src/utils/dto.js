'use strict';
/** Response shapers – keep internal columns (deletedAt, hashes, raw payloads) out of responses. */

function product(p) {
  if (!p) return null;
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    description: p.description,
    priceCents: p.priceCents,
    currency: 'PHP',
    stock: p.stock,
    inStock: p.stock > 0,
    imageUrl: p.imageUrl,
    specs: p.specs,
    isActive: p.isActive,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug, componentType: p.category.componentType } : undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function order(o, { admin = false } = {}) {
  if (!o) return null;
  const latestPayment = o.payments?.[0];
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    currency: o.currency,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    shippingFeeCents: o.shippingFeeCents,
    totalCents: o.totalCents,
    coupon: o.coupon ? { code: o.coupon.code } : null,
    shippingMethod: o.shippingMethod,
    shipping: {
      name: o.shipName, phone: o.shipPhone, addressLine: o.shipAddressLine,
      city: o.shipCity, province: o.shipProvince, postalCode: o.shipPostalCode,
    },
    items: o.items?.map((i) => ({
      productId: i.productId, sku: i.sku, productName: i.productName,
      unitPriceCents: i.unitPriceCents, quantity: i.quantity, lineTotalCents: i.lineTotalCents,
    })),
    statusHistory: o.statusHistory?.map((h) => ({
      from: h.fromStatus, to: h.toStatus, actorType: h.actorType, note: h.note, at: h.createdAt,
    })),
    payment: latestPayment ? {
      provider: latestPayment.provider,
      status: latestPayment.status,
      gatewayRef: latestPayment.gatewayRef,
      checkoutUrl: o.status === 'pending_payment' && latestPayment.status === 'pending' ? latestPayment.checkoutUrl : null,
      ...(admin ? {
        amountCents: latestPayment.amountCents, currency: latestPayment.currency,
        gatewayAmountCents: latestPayment.gatewayAmountCents, gatewayCurrency: latestPayment.gatewayCurrency,
        gatewayStatus: latestPayment.gatewayStatus,
      } : {}),
    } : null,
    reservationExpiresAt: o.reservations?.find((r) => r.status === 'active')?.expiresAt || null,
    paymentFlagged: admin ? o.paymentFlagged : undefined,
    flagReason: admin ? o.flagReason : undefined,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function orderSummary(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    totalCents: o.totalCents,
    currency: o.currency,
    itemCount: o.items ? o.items.reduce((n, i) => n + i.quantity, 0) : o._count?.items,
    customer: o.user ? { id: o.user.id, name: o.user.name, email: o.user.email } : undefined,
    paymentFlagged: o.paymentFlagged,
    createdAt: o.createdAt,
  };
}

module.exports = { product, order, orderSummary };
