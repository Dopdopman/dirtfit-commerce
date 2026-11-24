-- 1. Inventory & pricing non-negative / consistency CHECK constraints
ALTER TABLE "bikes"
  ADD CONSTRAINT "chk_bikes_stock_non_negative" CHECK ("stock_qty" >= 0),
  ADD CONSTRAINT "chk_bikes_reserved_valid" CHECK ("reserved_qty" >= 0 AND "reserved_qty" <= "stock_qty"),
  ADD CONSTRAINT "chk_bikes_price_positive" CHECK (
    "price_vnd" > 0
    AND "deposit_amount_vnd" >= 0
    AND "deposit_amount_vnd" <= "price_vnd"
  );

ALTER TABLE "accessories"
  ADD CONSTRAINT "chk_accessories_stock_non_negative" CHECK ("stock_qty" >= 0),
  ADD CONSTRAINT "chk_accessories_reserved_valid" CHECK ("reserved_qty" >= 0 AND "reserved_qty" <= "stock_qty"),
  ADD CONSTRAINT "chk_accessories_price_positive" CHECK ("price_vnd" > 0);

-- 2. Strict polymorphic item integrity & positive quantities
ALTER TABLE "cart_items"
  ADD CONSTRAINT "chk_cart_item_polymorphic" CHECK (
    ("item_type" = 'BIKE' AND "bike_id" IS NOT NULL AND "accessory_id" IS NULL) OR
    ("item_type" = 'ACCESSORY' AND "accessory_id" IS NOT NULL AND "bike_id" IS NULL)
  ),
  ADD CONSTRAINT "chk_cart_item_qty_positive" CHECK ("quantity" > 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "chk_order_item_qty_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "chk_order_item_money_non_negative" CHECK (
    "unit_price_vnd" >= 0
    AND "install_labor_vnd" >= 0
    AND "line_total_vnd" >= 0
  );

ALTER TABLE "orders"
  ADD CONSTRAINT "chk_orders_money_non_negative" CHECK (
    "subtotal_vnd" >= 0
    AND "install_labor_total_vnd" >= 0
    AND "shipping_fee_vnd" >= 0
    AND "discount_vnd" >= 0
    AND "total_vnd" >= 0
    AND "payable_now_vnd" >= 0
    AND "paid_amount_vnd" >= 0
    AND "remaining_balance_vnd" >= 0
  );

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "chk_inventory_reservations_qty_positive" CHECK ("quantity" > 0);

-- 3. At most 1 active primary SIDE_PROFILE_BLUEPRINT per bike (ignoring soft-deleted media)
CREATE UNIQUE INDEX "uq_bike_single_primary_blueprint"
  ON "bike_media" ("bike_id")
  WHERE "media_type" = 'SIDE_PROFILE_BLUEPRINT' AND "is_primary" = true AND "deleted_at" IS NULL;

-- 4. Prevent double-booking active test-ride slots for the same bike, showroom, date & time slot
CREATE UNIQUE INDEX "uq_test_ride_slot_active"
  ON "test_ride_bookings" ("bike_id", "showroom_code", "scheduled_date", "time_slot")
  WHERE "status" IN ('PENDING', 'CONFIRMED');

-- 5. At most 1 default UserBodyProfile per user
CREATE UNIQUE INDEX "uq_user_single_default_body_profile"
  ON "user_body_profiles" ("user_id")
  WHERE "is_default" = true;
