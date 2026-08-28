CREATE TABLE "studio_atelier_adult_verification_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"subject_authority_id" varchar(80) NOT NULL,
	"authority_revision" varchar(80) NOT NULL,
	"authority_manifest_sha256" varchar(64) NOT NULL,
	"subject_age" varchar(32) NOT NULL,
	"verification_method" varchar(48) NOT NULL,
	"evidence_receipt_id" varchar(180) NOT NULL,
	"evidence_receipt_sha256" varchar(64) NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"recorded_by_subject" text NOT NULL,
	"record_sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_adult_verification_subject" CHECK ("studio_atelier_adult_verification_receipts"."subject_authority_id" = 'lulu-v4'),
	CONSTRAINT "studio_atelier_adult_verification_revision_present" CHECK (length(trim("studio_atelier_adult_verification_receipts"."authority_revision")) > 0),
	CONSTRAINT "studio_atelier_adult_verification_manifest_hash" CHECK ("studio_atelier_adult_verification_receipts"."authority_manifest_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_adult_verification_age" CHECK ("studio_atelier_adult_verification_receipts"."subject_age" = 'VERIFIED_ADULT_18_PLUS'),
	CONSTRAINT "studio_atelier_adult_verification_method_known" CHECK (
      "studio_atelier_adult_verification_receipts"."verification_method" in ('TRUSTED_IDENTITY_PROVIDER', 'AUTHORIZED_HUMAN_REVIEW')
    ),
	CONSTRAINT "studio_atelier_adult_verification_evidence_hash" CHECK ("studio_atelier_adult_verification_receipts"."evidence_receipt_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_adult_verification_record_hash" CHECK ("studio_atelier_adult_verification_receipts"."record_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_adult_verification_actor_present" CHECK (length(trim("studio_atelier_adult_verification_receipts"."recorded_by_subject")) > 0),
	CONSTRAINT "studio_atelier_adult_verification_time_order" CHECK (
      ("studio_atelier_adult_verification_receipts"."expires_at" is null or "studio_atelier_adult_verification_receipts"."expires_at" > "studio_atelier_adult_verification_receipts"."verified_at")
      and ("studio_atelier_adult_verification_receipts"."revoked_at" is null or "studio_atelier_adult_verification_receipts"."revoked_at" >= "studio_atelier_adult_verification_receipts"."verified_at")
    )
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" varchar(24) NOT NULL,
	"grant_id" uuid NOT NULL,
	"expected_revision" integer NOT NULL,
	"resulting_revision" integer NOT NULL,
	"actor_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"previous_event_hash" varchar(64),
	"event_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_consent_events_sequence_positive" CHECK ("studio_atelier_consent_events"."sequence" > 0),
	CONSTRAINT "studio_atelier_consent_events_versions" CHECK (
    "studio_atelier_consent_events"."expected_revision" >= 0
    and "studio_atelier_consent_events"."resulting_revision" = "studio_atelier_consent_events"."expected_revision" + 1
    and "studio_atelier_consent_events"."sequence" = "studio_atelier_consent_events"."resulting_revision"
  ),
	CONSTRAINT "studio_atelier_consent_events_type_known" CHECK ("studio_atelier_consent_events"."event_type" in ('GRANTED', 'REVOKED')),
	CONSTRAINT "studio_atelier_consent_events_actor_present" CHECK (length(trim("studio_atelier_consent_events"."actor_subject")) > 0),
	CONSTRAINT "studio_atelier_consent_events_fingerprint" CHECK ("studio_atelier_consent_events"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_consent_events_payload_object" CHECK (jsonb_typeof("studio_atelier_consent_events"."payload") = 'object'),
	CONSTRAINT "studio_atelier_consent_events_previous_hash" CHECK (
    "studio_atelier_consent_events"."previous_event_hash" is null or "studio_atelier_consent_events"."previous_event_hash" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_atelier_consent_events_hash" CHECK ("studio_atelier_consent_events"."event_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_consent_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"adult_verification_id" uuid NOT NULL,
	"subject_authority_id" varchar(80) NOT NULL,
	"authority_revision" varchar(80) NOT NULL,
	"authority_manifest_sha256" varchar(64) NOT NULL,
	"affirmation_version" varchar(80) NOT NULL,
	"affirmation_sha256" varchar(64) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"model" text NOT NULL,
	"model_revision" varchar(80) NOT NULL,
	"provider_policy_revision" varchar(80) NOT NULL,
	"provider_notice_version" varchar(80) NOT NULL,
	"provider_notice_sha256" varchar(64) NOT NULL,
	"zero_data_retention" boolean NOT NULL,
	"provider_retention_acknowledged" boolean NOT NULL,
	"likeness_use_authorized" boolean NOT NULL,
	"purpose" varchar(80) NOT NULL,
	"grant_sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_consent_grants_subject" CHECK ("studio_atelier_consent_grants"."subject_authority_id" = 'lulu-v4'),
	CONSTRAINT "studio_atelier_consent_grants_manifest_hash" CHECK ("studio_atelier_consent_grants"."authority_manifest_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_consent_grants_affirmation_hash" CHECK ("studio_atelier_consent_grants"."affirmation_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_consent_grants_notice_hash" CHECK ("studio_atelier_consent_grants"."provider_notice_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_consent_grants_grant_hash" CHECK ("studio_atelier_consent_grants"."grant_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_consent_grants_provider" CHECK ("studio_atelier_consent_grants"."provider" = 'openai'),
	CONSTRAINT "studio_atelier_consent_grants_non_zdr" CHECK ("studio_atelier_consent_grants"."zero_data_retention" = false),
	CONSTRAINT "studio_atelier_consent_grants_acknowledged" CHECK (
    "studio_atelier_consent_grants"."provider_retention_acknowledged" = true and "studio_atelier_consent_grants"."likeness_use_authorized" = true
  ),
	CONSTRAINT "studio_atelier_consent_grants_purpose" CHECK (
    "studio_atelier_consent_grants"."purpose" = 'NON_SEXUAL_RETAIL_FASHION_CATALOGUE'
  )
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_consent_projections" (
	"operator_subject" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"state" varchar(24) NOT NULL,
	"current_grant_id" uuid NOT NULL,
	"last_event_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_consent_projections_revision_positive" CHECK ("studio_atelier_consent_projections"."revision" > 0),
	CONSTRAINT "studio_atelier_consent_projections_state_known" CHECK ("studio_atelier_consent_projections"."state" in ('ACTIVE', 'REVOKED')),
	CONSTRAINT "studio_atelier_consent_projections_event_hash" CHECK ("studio_atelier_consent_projections"."last_event_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_styling_advisories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"wardrobe_version" integer NOT NULL,
	"source_binding_sha256" varchar(64) NOT NULL,
	"garment_truth_revision" varchar(120) NOT NULL,
	"garment_truth_source_hash" varchar(64) NOT NULL,
	"publisher" varchar(40) NOT NULL,
	"official_url" text NOT NULL,
	"resolved_official_url" text NOT NULL,
	"page_title" text NOT NULL,
	"accessed_at" timestamp with time zone NOT NULL,
	"evidence_kind" varchar(32) NOT NULL,
	"evidence_blob_pathname" text NOT NULL,
	"evidence_mime_type" varchar(120) NOT NULL,
	"evidence_byte_size" integer NOT NULL,
	"evidence_sha256" varchar(64) NOT NULL,
	"search_scope" jsonb NOT NULL,
	"matched_garment_facts" jsonb NOT NULL,
	"decision" varchar(32) NOT NULL,
	"no_close_match_reason" text,
	"selected_styling_direction" text NOT NULL,
	"authority" varchar(40) NOT NULL,
	"passed_as_image_reference" boolean NOT NULL,
	"fetch_policy_revision" varchar(80) NOT NULL,
	"advisory_sha256" varchar(64) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_styling_advisories_wardrobe_version" CHECK ("studio_atelier_styling_advisories"."wardrobe_version" > 0),
	CONSTRAINT "studio_atelier_styling_advisories_source_hash" CHECK ("studio_atelier_styling_advisories"."source_binding_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_styling_advisories_truth_hash" CHECK ("studio_atelier_styling_advisories"."garment_truth_source_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_styling_advisories_publisher" CHECK ("studio_atelier_styling_advisories"."publisher" = 'Fashion Nova'),
	CONSTRAINT "studio_atelier_styling_advisories_official_url" CHECK (
    "studio_atelier_styling_advisories"."official_url" ~* '^https://([a-z0-9-]+[.])*fashionnova[.]com(/|$)'
    and "studio_atelier_styling_advisories"."resolved_official_url" ~* '^https://([a-z0-9-]+[.])*fashionnova[.]com(/|$)'
  ),
	CONSTRAINT "studio_atelier_styling_advisories_page_title" CHECK (length(trim("studio_atelier_styling_advisories"."page_title")) > 0),
	CONSTRAINT "studio_atelier_styling_advisories_evidence_kind" CHECK ("studio_atelier_styling_advisories"."evidence_kind" = 'OFFICIAL_PAGE_FETCH'),
	CONSTRAINT "studio_atelier_styling_advisories_evidence_mime" CHECK (
    "studio_atelier_styling_advisories"."evidence_mime_type" in ('text/html', 'application/json', 'application/pdf')
  ),
	CONSTRAINT "studio_atelier_styling_advisories_evidence_bytes" CHECK ("studio_atelier_styling_advisories"."evidence_byte_size" > 0),
	CONSTRAINT "studio_atelier_styling_advisories_evidence_hash" CHECK ("studio_atelier_styling_advisories"."evidence_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_styling_advisories_content_addressed" CHECK (
    "studio_atelier_styling_advisories"."evidence_blob_pathname" = 'studio/atelier/advisories/'
      || "studio_atelier_styling_advisories"."evidence_sha256"
      || case "studio_atelier_styling_advisories"."evidence_mime_type"
        when 'text/html' then '.html'
        when 'application/json' then '.json'
        when 'application/pdf' then '.pdf'
      end
  ),
	CONSTRAINT "studio_atelier_styling_advisories_search_array" CHECK (jsonb_typeof("studio_atelier_styling_advisories"."search_scope") = 'array'),
	CONSTRAINT "studio_atelier_styling_advisories_match_array" CHECK (jsonb_typeof("studio_atelier_styling_advisories"."matched_garment_facts") = 'array'),
	CONSTRAINT "studio_atelier_styling_advisories_decision" CHECK (
    "studio_atelier_styling_advisories"."decision" in ('KEEP', 'REFINE', 'REPLACE', 'NO_CLOSE_MATCH')
  ),
	CONSTRAINT "studio_atelier_styling_advisories_no_match" CHECK (
    ("studio_atelier_styling_advisories"."decision" = 'NO_CLOSE_MATCH'
      and jsonb_array_length("studio_atelier_styling_advisories"."matched_garment_facts") = 0
      and length(trim("studio_atelier_styling_advisories"."no_close_match_reason")) > 0
      and jsonb_array_length("studio_atelier_styling_advisories"."search_scope") > 0)
    or ("studio_atelier_styling_advisories"."decision" <> 'NO_CLOSE_MATCH'
      and jsonb_array_length("studio_atelier_styling_advisories"."matched_garment_facts") > 0
      and "studio_atelier_styling_advisories"."no_close_match_reason" is null)
  ),
	CONSTRAINT "studio_atelier_styling_advisories_direction" CHECK (length(trim("studio_atelier_styling_advisories"."selected_styling_direction")) > 0),
	CONSTRAINT "studio_atelier_styling_advisories_boundary" CHECK (
    "studio_atelier_styling_advisories"."authority" = 'ADVISORY_STYLING_ONLY' and "studio_atelier_styling_advisories"."passed_as_image_reference" = false
  ),
	CONSTRAINT "studio_atelier_styling_advisories_record_hash" CHECK ("studio_atelier_styling_advisories"."advisory_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_styling_advisories_fingerprint" CHECK ("studio_atelier_styling_advisories"."request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "studio_atelier_consent_events" ADD CONSTRAINT "studio_atelier_consent_events_grant_id_studio_atelier_consent_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."studio_atelier_consent_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_consent_grants" ADD CONSTRAINT "studio_atelier_consent_grants_adult_verification_id_studio_atelier_adult_verification_receipts_id_fk" FOREIGN KEY ("adult_verification_id") REFERENCES "public"."studio_atelier_adult_verification_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_consent_projections" ADD CONSTRAINT "studio_atelier_consent_projections_current_grant_id_studio_atelier_consent_grants_id_fk" FOREIGN KEY ("current_grant_id") REFERENCES "public"."studio_atelier_consent_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_styling_advisories" ADD CONSTRAINT "studio_atelier_styling_advisories_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_adult_verification_operator_receipt_unique" ON "studio_atelier_adult_verification_receipts" USING btree ("operator_subject","evidence_receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_adult_verification_record_hash_unique" ON "studio_atelier_adult_verification_receipts" USING btree ("record_sha256");--> statement-breakpoint
CREATE INDEX "studio_atelier_adult_verification_operator_verified_idx" ON "studio_atelier_adult_verification_receipts" USING btree ("operator_subject","verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_consent_events_operator_sequence_unique" ON "studio_atelier_consent_events" USING btree ("operator_subject","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_consent_events_operator_idempotency_unique" ON "studio_atelier_consent_events" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_consent_events_hash_unique" ON "studio_atelier_consent_events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX "studio_atelier_consent_events_operator_created_idx" ON "studio_atelier_consent_events" USING btree ("operator_subject","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_consent_grants_hash_unique" ON "studio_atelier_consent_grants" USING btree ("grant_sha256");--> statement-breakpoint
CREATE INDEX "studio_atelier_consent_grants_operator_created_idx" ON "studio_atelier_consent_grants" USING btree ("operator_subject","created_at");--> statement-breakpoint
CREATE INDEX "studio_atelier_consent_projections_state_idx" ON "studio_atelier_consent_projections" USING btree ("state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_styling_advisories_operator_idempotency_unique" ON "studio_atelier_styling_advisories" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_styling_advisories_hash_unique" ON "studio_atelier_styling_advisories" USING btree ("advisory_sha256");--> statement-breakpoint
CREATE INDEX "studio_atelier_styling_advisories_binding_idx" ON "studio_atelier_styling_advisories" USING btree ("operator_subject","wardrobe_item_id","source_binding_sha256","created_at");