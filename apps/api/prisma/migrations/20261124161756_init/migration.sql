-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'SALES_STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "BodyProportion" AS ENUM ('SHORT_LEGS', 'AVERAGE', 'LONG_LEGS');

-- CreateEnum
CREATE TYPE "FootwearType" AS ENUM ('SNEAKERS', 'ADV_BOOTS', 'MX_BOOTS');

-- CreateEnum
CREATE TYPE "RidingExperience" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'EXPERT');

-- CreateEnum
CREATE TYPE "BikeCategory" AS ENUM ('MOTOCROSS', 'ENDURO', 'DUAL_SPORT', 'ADVENTURE', 'SUPERMOTO');

-- CreateEnum
CREATE TYPE "RidingFocus" AS ENUM ('OFF_ROAD', 'ON_OFF_MIXED', 'ON_ROAD_ADV');

-- CreateEnum
CREATE TYPE "SeatFoamFirmness" AS ENUM ('FIRM', 'MEDIUM', 'PLUSH');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('HERO', 'GALLERY', 'SIDE_PROFILE_BLUEPRINT', 'SPEC_SHEET');

-- CreateEnum
CREATE TYPE "AccessoryCategory" AS ENUM ('LOWERING_LINK', 'LOW_SEAT', 'BAR_RISER', 'FOOTPEG_LOWER', 'SHOCK_SPRING', 'PROTECTION', 'APPAREL', 'EXHAUST', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('BIKE', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('BIKE_DEPOSIT', 'FULL_PURCHASE', 'ACCESSORY_ONLY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'DEPOSIT_PAID', 'PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_HANDOVER', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYOS', 'MOCK', 'VNPAY', 'STRIPE', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ShowroomCode" AS ENUM ('HN_LONG_BIEN', 'DN_SON_TRA', 'HCM_THU_DUC');

-- CreateEnum
CREATE TYPE "TestRideStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "full_name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "replaced_by_token_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_body_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL DEFAULT 'Default Profile',
    "height_cm" DOUBLE PRECISION NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "inseam_cm" DOUBLE PRECISION,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "body_proportion" "BodyProportion" NOT NULL DEFAULT 'AVERAGE',
    "footwear" "FootwearType" NOT NULL DEFAULT 'ADV_BOOTS',
    "gear_weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "riding_experience" "RidingExperience" NOT NULL DEFAULT 'INTERMEDIATE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_body_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "country" VARCHAR(60),
    "logo_url" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bikes" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "model_year" INTEGER NOT NULL,
    "category" "BikeCategory" NOT NULL,
    "riding_focus" "RidingFocus" NOT NULL,
    "engine_cc" INTEGER NOT NULL,
    "street_legal" BOOLEAN NOT NULL DEFAULT true,
    "price_vnd" BIGINT NOT NULL,
    "deposit_amount_vnd" BIGINT NOT NULL,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "short_summary" VARCHAR(500),
    "description_md" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bike_geometry_specs" (
    "id" UUID NOT NULL,
    "bike_id" UUID NOT NULL,
    "unladen_seat_height_mm" INTEGER NOT NULL,
    "seat_width_mm" INTEGER NOT NULL,
    "wheelbase_mm" INTEGER NOT NULL,
    "ground_clearance_mm" INTEGER NOT NULL,
    "front_wheel_diameter_in" DOUBLE PRECISION NOT NULL,
    "rear_wheel_diameter_in" DOUBLE PRECISION NOT NULL,
    "front_tire_outer_radius_mm" INTEGER NOT NULL,
    "rear_tire_outer_radius_mm" INTEGER NOT NULL,
    "front_travel_mm" INTEGER NOT NULL,
    "rear_travel_mm" INTEGER NOT NULL,
    "static_sag_rear_mm" INTEGER NOT NULL,
    "static_sag_front_mm" INTEGER NOT NULL,
    "target_rider_sag_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
    "reference_rider_weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 83,
    "linkage_progression_alpha" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "seat_foam_firmness" "SeatFoamFirmness" NOT NULL DEFAULT 'MEDIUM',
    "seat_pocket_x_mm" INTEGER NOT NULL,
    "seat_pocket_y_mm" INTEGER NOT NULL,
    "footpeg_x_mm" INTEGER NOT NULL,
    "footpeg_y_mm" INTEGER NOT NULL,
    "handlebar_grip_x_mm" INTEGER NOT NULL,
    "handlebar_grip_y_mm" INTEGER NOT NULL,
    "rake_deg" DOUBLE PRECISION,
    "trail_mm" DOUBLE PRECISION,
    "wet_weight_kg" DOUBLE PRECISION NOT NULL,
    "fuel_capacity_l" DOUBLE PRECISION,
    "technical_specs_json" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bike_geometry_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bike_media" (
    "id" UUID NOT NULL,
    "bike_id" UUID NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "media_type" "MediaType" NOT NULL DEFAULT 'GALLERY',
    "alt_text" VARCHAR(200),
    "width_px" INTEGER,
    "height_px" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "calibration_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bike_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessories" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "category" "AccessoryCategory" NOT NULL,
    "brand_name" VARCHAR(80),
    "price_vnd" BIGINT NOT NULL,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "image_url" VARCHAR(512),
    "description_md" TEXT,
    "ergo_impact_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bike_accessory_compatibilities" (
    "id" UUID NOT NULL,
    "bike_id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,
    "exact_seat_drop_mm" INTEGER,
    "exact_fork_drop_mm" INTEGER,
    "requires_workshop_install" BOOLEAN NOT NULL DEFAULT false,
    "install_labor_vnd" BIGINT NOT NULL DEFAULT 0,
    "fitment_notes" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bike_accessory_compatibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "guest_token" VARCHAR(64),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "bike_id" UUID,
    "accessory_id" UUID,
    "bundle_group_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(32) NOT NULL,
    "user_id" UUID NOT NULL,
    "order_type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_method" "PaymentMethod" NOT NULL,
    "subtotal_vnd" BIGINT NOT NULL,
    "install_labor_total_vnd" BIGINT NOT NULL DEFAULT 0,
    "shipping_fee_vnd" BIGINT NOT NULL DEFAULT 0,
    "discount_vnd" BIGINT NOT NULL DEFAULT 0,
    "total_vnd" BIGINT NOT NULL,
    "payable_now_vnd" BIGINT NOT NULL,
    "paid_amount_vnd" BIGINT NOT NULL DEFAULT 0,
    "remaining_balance_vnd" BIGINT NOT NULL,
    "reservation_expires_at" TIMESTAMP(3),
    "shipping_address_json" JSONB NOT NULL,
    "rider_fit_snapshot_json" JSONB,
    "customer_note" VARCHAR(500),
    "internal_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "bike_id" UUID,
    "accessory_id" UUID,
    "product_name_snapshot" VARCHAR(180) NOT NULL,
    "sku_snapshot" VARCHAR(64) NOT NULL,
    "unit_price_vnd" BIGINT NOT NULL,
    "install_labor_vnd" BIGINT NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "line_total_vnd" BIGINT NOT NULL,
    "metadata_json" JSONB,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "bike_id" UUID,
    "accessory_id" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentMethod" NOT NULL,
    "provider_tx_id" VARCHAR(128),
    "checkout_url" VARCHAR(1024),
    "amount_vnd" BIGINT NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'VND',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "failure_reason" VARCHAR(300),
    "raw_webhook_payload" JSONB,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "user_id" UUID NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "is_processing" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_ride_bookings" (
    "id" UUID NOT NULL,
    "booking_code" VARCHAR(24) NOT NULL,
    "user_id" UUID NOT NULL,
    "bike_id" UUID NOT NULL,
    "assigned_staff_id" UUID,
    "showroom_code" "ShowroomCode" NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "time_slot" VARCHAR(16) NOT NULL,
    "license_class" VARCHAR(16) NOT NULL,
    "rider_profile_snapshot" JSONB,
    "requested_mods_json" JSONB,
    "status" "TestRideStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_ride_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_role" "UserRole",
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(48) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_family_id_idx" ON "refresh_tokens"("user_id", "family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "user_body_profiles_user_id_is_default_idx" ON "user_body_profiles"("user_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "bikes_sku_key" ON "bikes"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "bikes_slug_key" ON "bikes"("slug");

-- CreateIndex
CREATE INDEX "bikes_status_deleted_at_idx" ON "bikes"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "bikes_category_riding_focus_status_idx" ON "bikes"("category", "riding_focus", "status");

-- CreateIndex
CREATE INDEX "bikes_brand_id_status_idx" ON "bikes"("brand_id", "status");

-- CreateIndex
CREATE INDEX "bikes_price_vnd_idx" ON "bikes"("price_vnd");

-- CreateIndex
CREATE UNIQUE INDEX "bike_geometry_specs_bike_id_key" ON "bike_geometry_specs"("bike_id");

-- CreateIndex
CREATE INDEX "bike_geometry_specs_unladen_seat_height_mm_wet_weight_kg_idx" ON "bike_geometry_specs"("unladen_seat_height_mm", "wet_weight_kg");

-- CreateIndex
CREATE INDEX "bike_media_bike_id_media_type_sort_order_idx" ON "bike_media"("bike_id", "media_type", "sort_order");

-- CreateIndex
CREATE INDEX "bike_media_deleted_at_idx" ON "bike_media"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "accessories_sku_key" ON "accessories"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "accessories_slug_key" ON "accessories"("slug");

-- CreateIndex
CREATE INDEX "accessories_category_status_deleted_at_idx" ON "accessories"("category", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "bike_accessory_compatibilities_accessory_id_idx" ON "bike_accessory_compatibilities"("accessory_id");

-- CreateIndex
CREATE UNIQUE INDEX "bike_accessory_compatibilities_bike_id_accessory_id_key" ON "bike_accessory_compatibilities"("bike_id", "accessory_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_guest_token_key" ON "carts"("guest_token");

-- CreateIndex
CREATE INDEX "carts_expires_at_idx" ON "carts"("expires_at");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_reservation_expires_at_idx" ON "orders"("status", "reservation_expires_at");

-- CreateIndex
CREATE INDEX "orders_deleted_at_idx" ON "orders"("deleted_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_tx_id_key" ON "payment_transactions"("provider_tx_id");

-- CreateIndex
CREATE INDEX "payment_transactions_order_id_status_idx" ON "payment_transactions"("order_id", "status");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_user_id_key" ON "idempotency_keys"("scope", "key", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_ride_bookings_booking_code_key" ON "test_ride_bookings"("booking_code");

-- CreateIndex
CREATE INDEX "test_ride_bookings_bike_id_scheduled_date_time_slot_status_idx" ON "test_ride_bookings"("bike_id", "scheduled_date", "time_slot", "status");

-- CreateIndex
CREATE INDEX "test_ride_bookings_user_id_scheduled_date_idx" ON "test_ride_bookings"("user_id", "scheduled_date" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_body_profiles" ADD CONSTRAINT "user_body_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bikes" ADD CONSTRAINT "bikes_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bike_geometry_specs" ADD CONSTRAINT "bike_geometry_specs_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bike_media" ADD CONSTRAINT "bike_media_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bike_accessory_compatibilities" ADD CONSTRAINT "bike_accessory_compatibilities_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bike_accessory_compatibilities" ADD CONSTRAINT "bike_accessory_compatibilities_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_ride_bookings" ADD CONSTRAINT "test_ride_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_ride_bookings" ADD CONSTRAINT "test_ride_bookings_bike_id_fkey" FOREIGN KEY ("bike_id") REFERENCES "bikes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_ride_bookings" ADD CONSTRAINT "test_ride_bookings_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
