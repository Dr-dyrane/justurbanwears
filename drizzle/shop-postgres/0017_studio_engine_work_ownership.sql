CREATE TABLE "studio_engine_work_ownership" (
	"operator_subject" text NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"stage_family" varchar(40) NOT NULL,
	"owner" varchar(16) NOT NULL,
	"semantic_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_engine_work_ownership_operator_subject_wardrobe_item_id_stage_family_pk" PRIMARY KEY("operator_subject","wardrobe_item_id","stage_family"),
	CONSTRAINT "studio_engine_work_ownership_owner_known" CHECK ("studio_engine_work_ownership"."owner" in ('LEGACY', 'ATELIER')),
	CONSTRAINT "studio_engine_work_ownership_stage_known" CHECK (
    "studio_engine_work_ownership"."stage_family" in (
      'GARMENT_FRONT', 'GARMENT_BACK', 'GARMENT_MANNEQUIN',
      'GARMENT_DETAIL', 'SUBJECT', 'ROOM_FINAL'
    )
  ),
	CONSTRAINT "studio_engine_work_ownership_semantic_hash" CHECK ("studio_engine_work_ownership"."semantic_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
WITH legacy_candidates AS (
	SELECT
		wardrobe.operator_subject,
		wardrobe.id AS wardrobe_item_id,
		CASE generation.operation
			WHEN 'GARMENT_FRONT' THEN 'GARMENT_FRONT'
			WHEN 'MANNEQUIN_FRONT' THEN 'GARMENT_MANNEQUIN'
			WHEN 'MODEL_TRY_ON' THEN 'SUBJECT'
			WHEN 'EDITORIAL_MODEL' THEN 'ROOM_FINAL'
		END AS stage_family,
		generation.created_at
	FROM studio_wardrobe_items wardrobe
	INNER JOIN studio_generations generation ON generation.intake_id = wardrobe.intake_id
	WHERE generation.operation IN ('GARMENT_FRONT', 'MANNEQUIN_FRONT', 'MODEL_TRY_ON', 'EDITORIAL_MODEL')
	UNION ALL
	SELECT
		wardrobe.operator_subject,
		wardrobe.id AS wardrobe_item_id,
		CASE completion.role
			WHEN 'GARMENT_FRONT' THEN 'GARMENT_FRONT'
			WHEN 'GARMENT_BACK' THEN 'GARMENT_BACK'
			WHEN 'FABRIC_DETAIL' THEN 'GARMENT_DETAIL'
		END AS stage_family,
		completion.created_at
	FROM studio_wardrobe_items wardrobe
	INNER JOIN studio_media_completion_jobs completion
		ON completion.operator_subject = wardrobe.operator_subject
		AND completion.target_kind = 'WARDROBE_ITEM'
		AND completion.target_key = wardrobe.id::text
	WHERE completion.role IN ('GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL')
), first_legacy_claim AS (
	SELECT DISTINCT ON (operator_subject, wardrobe_item_id, stage_family)
		operator_subject, wardrobe_item_id, stage_family, created_at
	FROM legacy_candidates
	WHERE stage_family IS NOT NULL
	ORDER BY operator_subject, wardrobe_item_id, stage_family, created_at ASC
)
INSERT INTO studio_engine_work_ownership (
	operator_subject, wardrobe_item_id, stage_family, owner,
	semantic_hash, created_at, updated_at
)
SELECT
	operator_subject,
	wardrobe_item_id,
	stage_family,
	'LEGACY',
	encode(digest(convert_to(
		'juw.studio-engine-work-ownership.v1' || E'\n'
		|| operator_subject || E'\n'
		|| wardrobe_item_id::text || E'\n'
		|| stage_family,
		'UTF8'
	), 'sha256'), 'hex'),
	created_at,
	created_at
FROM first_legacy_claim
ON CONFLICT (operator_subject, wardrobe_item_id, stage_family) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "studio_atelier_operations" ADD COLUMN "wardrobe_item_id" uuid;--> statement-breakpoint
ALTER TABLE "studio_engine_work_ownership" ADD CONSTRAINT "studio_engine_work_ownership_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_engine_work_ownership_owner_idx" ON "studio_engine_work_ownership" USING btree ("owner","updated_at");--> statement-breakpoint
ALTER TABLE "studio_atelier_operations" ADD CONSTRAINT "studio_atelier_operations_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_atelier_operations_wardrobe_stage_idx" ON "studio_atelier_operations" USING btree ("operator_subject","wardrobe_item_id","stage","created_at");
