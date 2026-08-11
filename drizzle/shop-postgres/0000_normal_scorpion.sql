CREATE TYPE "public"."shop_cart_status" AS ENUM('ACTIVE', 'CONVERTED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."shop_fulfillment_kind" AS ENUM('DELIVERY', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."shop_order_status" AS ENUM('PAYMENT_REQUIRED', 'ORDER_RECEIVED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."shop_order_transmission" AS ENUM('LOCAL_ONLY', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "shop_cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_slug" text NOT NULL,
	"tagged_size" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_cart_items_quantity_one" CHECK ("shop_cart_items"."quantity" = 1),
	CONSTRAINT "shop_cart_items_price_nonnegative" CHECK ("shop_cart_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"status" "shop_cart_status" DEFAULT 'ACTIVE' NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text,
	"phone" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_follows" (
	"customer_id" uuid NOT NULL,
	"merchant_handle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_follows_customer_id_merchant_handle_pk" PRIMARY KEY("customer_id","merchant_handle")
);
--> statement-breakpoint
CREATE TABLE "shop_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "shop_order_status" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_slug" text NOT NULL,
	"sku" text NOT NULL,
	"product_name" text NOT NULL,
	"tagged_size" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"line_total" integer NOT NULL,
	CONSTRAINT "shop_order_items_quantity_one" CHECK ("shop_order_items"."quantity" = 1),
	CONSTRAINT "shop_order_items_price_nonnegative" CHECK ("shop_order_items"."unit_price" >= 0),
	CONSTRAINT "shop_order_items_total_matches" CHECK ("shop_order_items"."line_total" = "shop_order_items"."unit_price")
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"customer_id" uuid NOT NULL,
	"source_cart_id" uuid,
	"status" "shop_order_status" DEFAULT 'PAYMENT_REQUIRED' NOT NULL,
	"transmission" "shop_order_transmission" DEFAULT 'SUBMITTED' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"fulfillment_kind" "shop_fulfillment_kind" NOT NULL,
	"delivery_option_id" text NOT NULL,
	"delivery_address" jsonb,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"subtotal" integer NOT NULL,
	"delivery_fee" integer NOT NULL,
	"total" integer NOT NULL,
	"delivery_label" text NOT NULL,
	"delivery_estimate" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_fulfillment_address_matches" CHECK (
    ("shop_orders"."fulfillment_kind" = 'PICKUP' and "shop_orders"."delivery_address" is null)
    or ("shop_orders"."fulfillment_kind" = 'DELIVERY' and "shop_orders"."delivery_address" is not null)
  ),
	CONSTRAINT "shop_orders_amounts_nonnegative" CHECK (
    "shop_orders"."subtotal" >= 0
    and "shop_orders"."delivery_fee" >= 0
    and "shop_orders"."total" = "shop_orders"."subtotal" + "shop_orders"."delivery_fee"
  )
);
--> statement-breakpoint
CREATE TABLE "shop_saves" (
	"customer_id" uuid NOT NULL,
	"product_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_saves_customer_id_product_slug_pk" PRIMARY KEY("customer_id","product_slug")
);
--> statement-breakpoint
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_cart_id_shop_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."shop_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_carts" ADD CONSTRAINT "shop_carts_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_follows" ADD CONSTRAINT "shop_follows_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD CONSTRAINT "shop_order_events_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_source_cart_id_shop_carts_id_fk" FOREIGN KEY ("source_cart_id") REFERENCES "public"."shop_carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_saves" ADD CONSTRAINT "shop_saves_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_cart_items_piece_unique" ON "shop_cart_items" USING btree ("cart_id","product_slug");--> statement-breakpoint
CREATE INDEX "shop_carts_customer_status_idx" ON "shop_carts" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_customers_auth_subject_unique" ON "shop_customers" USING btree ("auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_customers_email_unique" ON "shop_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "shop_order_events_order_time_idx" ON "shop_order_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_items_piece_unique" ON "shop_order_items" USING btree ("order_id","product_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_reference_unique" ON "shop_orders" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_customer_idempotency_unique" ON "shop_orders" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "shop_orders_customer_saved_idx" ON "shop_orders" USING btree ("customer_id","saved_at");--> statement-breakpoint
CREATE INDEX "shop_saves_product_idx" ON "shop_saves" USING btree ("product_slug");