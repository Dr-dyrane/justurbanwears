export type CanonState = "DRAFT" | "REVIEW" | "APPROVED";
export type Availability = "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
export type ReferenceMark =
  | "PRIMARY"
  | "SUPPORTING"
  | "LOW QUALITY"
  | "REJECTED";
export type ReviewDecision = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS RETRY";
export type ShootPreset =
  | "CLEAN CATALOGUE"
  | "LAGOS STREET"
  | "CASUAL MIRROR"
  | "EVENING EDITORIAL"
  | "PRODUCT-FIRST";

export type VisualVariant =
  | "umber"
  | "plum"
  | "indigo"
  | "moss"
  | "chalk"
  | "lagos-dusk"
  | "mirror"
  | "studio";

export interface ModelReference {
  id: string;
  label: string;
  view: string;
  mark: ReferenceMark;
  quality: number;
  source: "OPERATOR" | "FACETIME" | "INSTAGRAM" | "VIDEO";
}

export interface ConsentRecord {
  status: "CONFIRMED" | "WITHDRAWN";
  date: string;
  allowedUse: string;
  restrictedUse: string;
}

export interface IdentityCanon {
  id: string;
  name: string;
  preferredName: string;
  version: string;
  status: CanonState;
  completeness: number;
  approvedAt?: string;
  bodyReferenceStatus: "MISSING" | "PARTIAL" | "COMPLETE";
  hairReferenceStatus: "MISSING" | "PARTIAL" | "COMPLETE";
  references: ModelReference[];
  visibleFeatureNotes: string[];
  allowedVariance: string[];
  forbiddenDrift: string[];
  consent: ConsentRecord;
}

export interface GarmentReference {
  id: string;
  view: "FRONT" | "BACK" | "DETAIL" | "SIDE" | "LABEL" | "DEFECT";
  quality: number;
}

export interface Garment {
  id: string;
  sku: string;
  title: string;
  category: string;
  sizeLabel: string;
  estimatedFit: string;
  color: string;
  price: number;
  condition: string;
  brand?: string;
  source: string;
  notes: string;
  availability: Availability;
  canonState: CanonState;
  visual: VisualVariant;
  references: GarmentReference[];
  heroGenerationId?: string;
}

export interface GenerationReview {
  decision: ReviewDecision;
  reasons: string[];
  note?: string;
  reviewedAt?: string;
}

export interface Generation {
  id: string;
  shootId: string;
  label: string;
  visual: VisualVariant;
  identityMatch: number;
  garmentMatch: number;
  review: GenerationReview;
  isHero: boolean;
}

export interface Shoot {
  id: string;
  garmentId: string;
  identityVersion: string;
  preset: ShootPreset;
  pose: string;
  crop: string;
  outputFormat: string;
  generationEngine: string;
  generationConfiguration: Record<string, string | number | boolean>;
  createdAt: string;
  generations: Generation[];
}

export interface StudioState {
  identity: IdentityCanon;
  garments: Garment[];
  shoots: Shoot[];
}

export interface NewGarmentInput {
  sku: string;
  title: string;
  category: string;
  sizeLabel: string;
  estimatedFit: string;
  color: string;
  price: number;
  condition: string;
  brand?: string;
  source: string;
  notes: string;
  hasFront: boolean;
  hasBack: boolean;
  hasDetail: boolean;
}

export interface NewShootInput {
  garmentId: string;
  preset: ShootPreset;
  pose: string;
  crop: string;
  outputFormat: string;
}

export const PRESET_DETAILS: Array<{
  name: ShootPreset;
  eyebrow: string;
  description: string;
}> = [
  {
    name: "CLEAN CATALOGUE",
    eyebrow: "Clarity first",
    description: "Soft studio daylight, simple posing, and the full garment in view.",
  },
  {
    name: "LAGOS STREET",
    eyebrow: "Social commerce",
    description: "Believable Lagos texture with a relaxed editorial posture.",
  },
  {
    name: "CASUAL MIRROR",
    eyebrow: "Relatable",
    description: "A tasteful, phone-era mirror frame without reflection errors.",
  },
  {
    name: "EVENING EDITORIAL",
    eyebrow: "After dark",
    description: "Directional night lighting with restrained, sophisticated drama.",
  },
  {
    name: "PRODUCT-FIRST",
    eyebrow: "Maximum fidelity",
    description: "Neutral posture and minimal styling intervention for listings.",
  },
];

export const REJECTION_REASONS = [
  "face drift",
  "skin-tone drift",
  "body drift",
  "hair drift",
  "wrong garment color",
  "wrong garment length",
  "missing garment detail",
  "invented detail",
  "fit looks unrealistic",
  "bad hands",
  "bad limbs",
  "bad anatomy",
  "bad reflection",
  "bad background",
  "over-retouched",
  "wrong pose",
  "poor crop",
  "other",
] as const;
