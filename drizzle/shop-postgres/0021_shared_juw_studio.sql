CREATE TABLE "studio_workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"data_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_workspaces_key_known" CHECK ("studio_workspaces"."key" = 'juw-studio'),
	CONSTRAINT "studio_workspaces_name_present" CHECK (length(trim("studio_workspaces"."name")) > 0),
	CONSTRAINT "studio_workspaces_data_subject_present" CHECK (
    length(trim("studio_workspaces"."data_subject")) between 1 and 255
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_workspaces_key_unique" ON "studio_workspaces" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_workspaces_data_subject_unique" ON "studio_workspaces" USING btree ("data_subject");--> statement-breakpoint
LOCK TABLE
	"studio_operator_membership",
	"studio_intakes",
	"studio_wardrobe_items",
	"studio_catalogue_publications",
	"studio_garment_revisions"
	IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
DECLARE
	membership_count integer;
	adopted_owner_count integer;
	canonical_data_subject text;
	canonical_workspace_id uuid := md5('juw:studio:workspace:juw-studio')::uuid;
BEGIN
	SELECT count(*)::integer
	INTO membership_count
	FROM studio_operator_membership;

	SELECT count(DISTINCT lineage.operator_subject)::integer,
		min(lineage.operator_subject)
	INTO adopted_owner_count, canonical_data_subject
	FROM (
		SELECT publication.operator_subject
		FROM studio_catalogue_publications publication
		WHERE publication.origin = 'CATALOGUE_ADOPTED'
		UNION ALL
		SELECT wardrobe.operator_subject
		FROM studio_wardrobe_items wardrobe
		JOIN studio_catalogue_publications publication
			ON publication.wardrobe_item_id = wardrobe.id
		WHERE publication.origin = 'CATALOGUE_ADOPTED'
		UNION ALL
		SELECT intake.operator_subject
		FROM studio_intakes intake
		JOIN studio_wardrobe_items wardrobe ON wardrobe.intake_id = intake.id
		JOIN studio_catalogue_publications publication
			ON publication.wardrobe_item_id = wardrobe.id
		WHERE publication.origin = 'CATALOGUE_ADOPTED'
		UNION ALL
		SELECT revision.operator_subject
		FROM studio_garment_revisions revision
		JOIN studio_catalogue_publications publication
			ON publication.wardrobe_item_id = revision.wardrobe_item_id
		WHERE publication.origin = 'CATALOGUE_ADOPTED'
	) lineage;

	IF membership_count = 0 THEN
		IF adopted_owner_count <> 0 THEN
			RAISE EXCEPTION 'STUDIO_WORKSPACE_ADOPTED_OWNER_MEMBERSHIP_MISSING';
		END IF;
		canonical_data_subject := 'studio-workspace:juw-studio';
	ELSIF adopted_owner_count <> 1 THEN
		RAISE EXCEPTION 'STUDIO_WORKSPACE_ADOPTED_OWNER_AMBIGUOUS';
	ELSIF NOT EXISTS (
		SELECT 1
		FROM studio_operator_membership membership
		WHERE membership.auth_subject = canonical_data_subject
	) THEN
		RAISE EXCEPTION 'STUDIO_WORKSPACE_ADOPTED_OWNER_MEMBERSHIP_MISSING';
	END IF;

	INSERT INTO studio_workspaces (
		id, key, name, data_subject, created_at, updated_at
	) VALUES (
		canonical_workspace_id,
		'juw-studio',
		'JUW Studio',
		canonical_data_subject,
		now(),
		now()
	);
END
$$;--> statement-breakpoint
ALTER TABLE "studio_operator_membership" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "studio_operator_membership"
SET "workspace_id" = md5('juw:studio:workspace:juw-studio')::uuid
WHERE "workspace_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM studio_operator_membership membership
		WHERE membership.workspace_id IS NULL
	) THEN
		RAISE EXCEPTION 'STUDIO_WORKSPACE_MEMBERSHIP_BACKFILL_INCOMPLETE';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "studio_operator_membership" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_operator_membership" ADD CONSTRAINT "studio_operator_membership_workspace_id_studio_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."studio_workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_operator_membership_workspace_active_role_idx" ON "studio_operator_membership" USING btree ("workspace_id","active","role");
