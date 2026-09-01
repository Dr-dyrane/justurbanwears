CREATE TABLE "studio_garment_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"operator_subject" text NOT NULL,
	"actor_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"expected_version" integer NOT NULL,
	"title" text NOT NULL,
	"consequence" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_garment_deletions_fingerprint" CHECK ("studio_garment_deletions"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_garment_deletions_expected_version_positive" CHECK ("studio_garment_deletions"."expected_version" > 0),
	CONSTRAINT "studio_garment_deletions_title_present" CHECK (length(trim("studio_garment_deletions"."title")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_garment_deletions_operator_idempotency_unique" ON "studio_garment_deletions" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_garment_deletions_wardrobe_unique" ON "studio_garment_deletions" USING btree ("wardrobe_item_id");--> statement-breakpoint
CREATE INDEX "studio_garment_deletions_operator_deleted_idx" ON "studio_garment_deletions" USING btree ("operator_subject","deleted_at");
