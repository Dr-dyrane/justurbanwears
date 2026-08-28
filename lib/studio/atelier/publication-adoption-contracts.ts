import { z } from "zod";

export const STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION =
  "juw.studio-atelier-shop-adoption.v1" as const;

/**
 * The first migration allowed to persist this contract. It must be generated
 * only after the verified 0019 external-authority migration is landed.
 */
export const STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION =
  "0020_studio_atelier_shop_adoption_receipts" as const;

export const studioAtelierShopMediaRoleSchema = z.enum([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "FABRIC_DETAIL",
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
]);

export type StudioAtelierShopMediaRole = z.infer<
  typeof studioAtelierShopMediaRoleSchema
>;

export const STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER = Object.freeze([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "FABRIC_DETAIL",
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
] as const satisfies readonly StudioAtelierShopMediaRole[]);

export const STUDIO_ATELIER_SHOP_STAGE_BINDINGS = Object.freeze([
  Object.freeze({ role: "GARMENT_FRONT", view: "01", stages: Object.freeze(["GARMENT_01_FRONT"]) }),
  Object.freeze({ role: "GARMENT_BACK", view: "02", stages: Object.freeze(["GARMENT_02_BACK"]) }),
  Object.freeze({ role: "MANNEQUIN_FRONT", view: "03", stages: Object.freeze(["GARMENT_03_MANNEQUIN"]) }),
  Object.freeze({ role: "FABRIC_DETAIL", view: "04", stages: Object.freeze(["GARMENT_04_DETAIL"]) }),
  Object.freeze({ role: "MODEL_FRONT", view: "05", stages: Object.freeze(["ROOM_FINAL_05"]) }),
  Object.freeze({ role: "MODEL_LEFT_PROFILE", view: "06", stages: Object.freeze(["SIBLING_06"]) }),
  Object.freeze({
    role: "MODEL_REAR_THREE_QUARTER",
    view: "07",
    stages: Object.freeze(["SIBLING_07_CORE", "SIBLING_07_RECOVERY"]),
  }),
] as const satisfies readonly Readonly<{
  role: StudioAtelierShopMediaRole;
  view: string;
  stages: readonly string[];
}>[]);

export const studioAtelierShopAdoptionCommandSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  expectedRevision: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().trim().min(8).max(160)
    .regex(/^[a-zA-Z0-9._:-]+$/),
  confirmation: z.literal("ADOPT_LOCKED_ATELIER_MEDIA"),
});

export type StudioAtelierShopAdoptionCommand = z.infer<
  typeof studioAtelierShopAdoptionCommandSchema
>;

export type StudioAtelierShopAdoptionMediaReceipt = Readonly<{
  role: StudioAtelierShopMediaRole;
  operationId: string;
  projectionVersion: number;
  lockedArtifactSha256: string;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
}>;

/**
 * Server-side immutable receipt. It deliberately contains no private Blob
 * pathname, provider URL, public URL, provider request ID, prompt or bytes.
 */
export type StudioAtelierShopAdoptionReceipt = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION;
  receiptId: string;
  wardrobeItemId: string;
  garmentId: string;
  adoptionRevision: string;
  media: readonly StudioAtelierShopAdoptionMediaReceipt[];
}>;

export type StudioAtelierShopAdoptionReview =
  | Readonly<{
      state: "BLOCKED";
      wardrobeItemId: string;
      blockers: readonly string[];
    }>
  | Readonly<{
      state: "READY";
      wardrobeItemId: string;
      garmentId: string;
      expectedRevision: string;
      roles: readonly StudioAtelierShopMediaRole[];
    }>;
