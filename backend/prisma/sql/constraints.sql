-- CHECK constraints that Prisma's schema language cannot express.
-- Idempotent: safe to run after every migration (npm run db:constraints).

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT product_stock_non_negative CHECK ("stock" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT product_price_non_negative CHECK ("priceCents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CartItem" ADD CONSTRAINT cart_quantity_positive CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT order_item_quantity_positive CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT order_amounts_valid CHECK (
    "subtotalCents" >= 0 AND "discountCents" >= 0 AND "shippingFeeCents" >= 0 AND "totalCents" >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Coupon" ADD CONSTRAINT coupon_value_positive CHECK ("value" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Coupon" ADD CONSTRAINT coupon_used_within_limit CHECK ("usageLimit" IS NULL OR "usedCount" <= "usageLimit");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockReservation" ADD CONSTRAINT reservation_quantity_positive CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
