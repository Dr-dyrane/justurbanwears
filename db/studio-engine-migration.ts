import { neon } from "@neondatabase/serverless";

const studioEngineMigrationStatements = [
  `DO $$ BEGIN CREATE TYPE public.studio_asset_role AS ENUM ('SOURCE', 'GARMENT_FRONT', 'MANNEQUIN_FRONT', 'MODEL_TRY_ON'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE public.studio_decision_kind AS ENUM ('KEEP', 'EDIT', 'REJECT', 'RETRY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE public.studio_generation_state AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'APPROVED', 'REJECTED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE public.studio_intake_kind AS ENUM ('GARMENT', 'MODEL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE public.studio_intake_state AS ENUM ('DRAFT', 'ANALYZING', 'REVIEW', 'GENERATING', 'DECISION', 'COMMITTED', 'FAILED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE public.studio_source_mode AS ENUM ('CAMERA', 'UPLOAD', 'DESCRIBE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS studio_intakes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operator_subject text NOT NULL, operator_email text NOT NULL,
    kind studio_intake_kind NOT NULL, source_mode studio_source_mode NOT NULL, description text,
    facts jsonb DEFAULT '{}'::jsonb NOT NULL, state studio_intake_state DEFAULT 'DRAFT' NOT NULL,
    version integer DEFAULT 1 NOT NULL, idempotency_key varchar(160) NOT NULL, error_code varchar(80),
    created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_intakes_version_positive CHECK (version > 0),
    CONSTRAINT studio_intakes_facts_object CHECK (jsonb_typeof(facts) = 'object'))`,
  `CREATE TABLE IF NOT EXISTS studio_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), intake_id uuid NOT NULL REFERENCES studio_intakes(id) ON DELETE cascade,
    role studio_asset_role NOT NULL, blob_pathname text NOT NULL, blob_url text NOT NULL, mime_type varchar(80) NOT NULL,
    byte_size integer NOT NULL, width integer, height integer, sha256 varchar(64) NOT NULL,
    privacy varchar(24) DEFAULT 'PRIVATE' NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_assets_bytes_positive CHECK (byte_size > 0),
    CONSTRAINT studio_assets_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT studio_assets_private_only CHECK (privacy = 'PRIVATE'))`,
  `CREATE TABLE IF NOT EXISTS studio_generations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), intake_id uuid NOT NULL REFERENCES studio_intakes(id) ON DELETE cascade,
    operation varchar(40) NOT NULL, state studio_generation_state DEFAULT 'PENDING' NOT NULL, model text NOT NULL,
    prompt_version varchar(40) NOT NULL, prompt_hash varchar(64) NOT NULL, source_asset_ids jsonb NOT NULL,
    source_hashes jsonb NOT NULL, fingerprint varchar(64) NOT NULL, parameters jsonb NOT NULL,
    output_asset_id uuid REFERENCES studio_assets(id) ON DELETE set null, usage jsonb, cost_usd text, error_code varchar(80),
    created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_generations_prompt_hash CHECK (prompt_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT studio_generations_fingerprint CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT studio_generations_source_ids_array CHECK (jsonb_typeof(source_asset_ids) = 'array'),
    CONSTRAINT studio_generations_source_hashes_array CHECK (jsonb_typeof(source_hashes) = 'array'),
    CONSTRAINT studio_generations_parameters_object CHECK (jsonb_typeof(parameters) = 'object'))`,
  `CREATE TABLE IF NOT EXISTS studio_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), intake_id uuid NOT NULL REFERENCES studio_intakes(id) ON DELETE cascade,
    generation_id uuid REFERENCES studio_generations(id) ON DELETE set null, actor_subject text NOT NULL,
    decision studio_decision_kind NOT NULL, note text, created_at timestamptz DEFAULT now() NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS studio_wardrobe_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), intake_id uuid NOT NULL REFERENCES studio_intakes(id) ON DELETE restrict,
    operator_subject text NOT NULL, title text NOT NULL, category text NOT NULL, colour text NOT NULL,
    size_label text NOT NULL, condition text NOT NULL, price integer NOT NULL, quantity integer DEFAULT 1 NOT NULL,
    state varchar(24) DEFAULT 'DRAFT' NOT NULL, approved_asset_id uuid REFERENCES studio_assets(id) ON DELETE restrict,
    created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_wardrobe_items_price_nonnegative CHECK (price >= 0),
    CONSTRAINT studio_wardrobe_items_quantity_one CHECK (quantity = 1),
    CONSTRAINT studio_wardrobe_items_state_private CHECK (state in ('DRAFT', 'READY', 'ARCHIVED')))`,
  `CREATE TABLE IF NOT EXISTS studio_operator_membership (
    auth_subject text PRIMARY KEY, email text NOT NULL, role varchar(24) NOT NULL, active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_operator_membership_role CHECK (role in ('operator', 'admin')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS studio_operator_membership_email_unique ON studio_operator_membership(lower(email))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS studio_intakes_operator_idempotency_unique ON studio_intakes(operator_subject, idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS studio_intakes_operator_updated_idx ON studio_intakes(operator_subject, updated_at)`,
  `CREATE INDEX IF NOT EXISTS studio_assets_intake_role_idx ON studio_assets(intake_id, role)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS studio_assets_intake_sha_role_unique ON studio_assets(intake_id, sha256, role)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS studio_generations_intake_fingerprint_unique ON studio_generations(intake_id, fingerprint)`,
  `CREATE INDEX IF NOT EXISTS studio_generations_intake_created_idx ON studio_generations(intake_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS studio_decisions_intake_created_idx ON studio_decisions(intake_id, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS studio_wardrobe_items_intake_unique ON studio_wardrobe_items(intake_id)`,
  `CREATE INDEX IF NOT EXISTS studio_wardrobe_items_operator_updated_idx ON studio_wardrobe_items(operator_subject, updated_at)`,
] as const;

let activation: Promise<void> | undefined;

export function ensureStudioEngineSchema(): Promise<void> {
  if (activation) return activation;
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) return Promise.reject(new Error("Studio database is not configured."));
  activation = (async () => {
    const sql = neon(databaseUrl);
    for (const statement of studioEngineMigrationStatements) await sql.query(statement, []);
  })();
  return activation.catch((error) => {
    activation = undefined;
    throw error;
  });
}
