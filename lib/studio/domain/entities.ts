export type StudioLifecycleState =
  | "EMPTY"
  | "DRAFT"
  | "READY"
  | "PUBLISHED"
  | "RESERVED"
  | "SOLD"
  | "RETURNED"
  | "ERROR";

export type ReadinessState = "EMPTY" | "DRAFT" | "READY" | "ERROR";
export type CanonState = "DRAFT" | "REVIEW" | "APPROVED";
export type Availability = "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
export type ReferenceMark = "PRIMARY" | "SUPPORTING" | "LOW QUALITY" | "REJECTED";
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

export type GarmentCategory =
  | "Dress"
  | "Shirt"
  | "Knitwear"
  | "Skirt"
  | "Trousers";

export interface ModelReference {
  id: string;
  label: string;
  view: string;
  mark: ReferenceMark;
  quality: number;
  source: "OPERATOR";
}

export interface ConsentRecord {
  status: "CONFIRMED" | "WITHDRAWN";
  date: string;
  allowedUse: string;
  restrictedUse: string;
}

export interface ModelStylingProfile {
  hair: string;
  makeup: string;
  direction: string;
}

export interface ModelReadiness {
  identityApproved: boolean;
  consentConfirmed: boolean;
  stylingComplete: boolean;
}

export interface StudioModel {
  id: string;
  name: string;
  preferredName: string;
  version: string;
  isDefault: boolean;
  state: StudioLifecycleState;
  status: CanonState;
  completeness: number;
  styling: ModelStylingProfile;
  readiness: ModelReadiness;
  approvedAt?: string;
  bodyReferenceStatus: "MISSING" | "PARTIAL" | "COMPLETE";
  hairReferenceStatus: "MISSING" | "PARTIAL" | "COMPLETE";
  references: ModelReference[];
  visibleFeatureNotes: string[];
  allowedVariance: string[];
  forbiddenDrift: string[];
  consent: ConsentRecord;
}

export type IdentityCanon = StudioModel;

export interface GarmentReference {
  id: string;
  view: "FRONT" | "BACK" | "DETAIL" | "SIDE" | "LABEL" | "DEFECT";
  quality: number;
}

export interface GarmentMeasurement {
  label: string;
  value: string;
}

export type PublicListingMediaSlot =
  | "GARMENT_FRONT"
  | "GARMENT_BACK"
  | "MANNEQUIN_FRONT"
  | "MODEL_FRONT"
  | "MODEL_BACK"
  | "FABRIC_DETAIL";

export interface PublicListingMediaProjection {
  slot: PublicListingMediaSlot;
  src: string;
}

export interface PublicModelAnchorProjection {
  id: string;
  src: string;
}

export interface Garment {
  id: string;
  sku: string;
  title: string;
  category: GarmentCategory;
  sizeLabel: string;
  estimatedFit: string;
  color: string;
  price: number;
  condition: string;
  brand?: string;
  source: string;
  notes: string;
  privateNote: string;
  publicDescription: string;
  quantity: number;
  saleEligible: boolean;
  measurements: GarmentMeasurement[];
  classificationState: ReadinessState;
  mediaState: ReadinessState;
  state: StudioLifecycleState;
  availability: Availability;
  canonState: CanonState;
  visual: VisualVariant;
  references: GarmentReference[];
  heroGenerationId?: string;
  createdAt: string;
}

export interface PublicListingProjection {
  slug: string;
  sku: string;
  name: string;
  category: "Dresses" | "Shirts" | "Knitwear" | "Skirts" | "Trousers";
  price: number;
  taggedSize: string;
  fit: string;
  condition: string;
  colour: string;
  availability: "AVAILABLE" | "RESERVED" | "SOLD";
  drop: string;
  tone: "coral" | "indigo" | "moss" | "ivory" | "cocoa" | "salmon";
  silhouette: "dress" | "shirt" | "knit" | "skirt" | "trouser";
  note: string;
  story: string;
  details: string[];
  measurements: GarmentMeasurement[];
  modelAnchor: PublicModelAnchorProjection;
  media: PublicListingMediaProjection[];
}

export interface StudioListing {
  id: string;
  garmentId: string;
  modelId: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  state: StudioLifecycleState;
  createdAt: string;
  publishedAt?: string;
  publicProjection?: PublicListingProjection;
}

export interface InventoryRecord {
  id: string;
  garmentId: string;
  listingId?: string;
  onHand: number;
  reserved: number;
  sold: number;
  returned: number;
  writeOff: number;
  state: StudioLifecycleState;
  updatedAt: string;
}

export interface StudioOrder {
  id: string;
  listingId: string;
  inventoryId: string;
  quantity: number;
  state: StudioLifecycleState;
  createdAt: string;
  fulfilledAt?: string;
}

export type ReturnDisposition = "PENDING" | "RESTOCK" | "WRITE_OFF";

export interface StudioReturn {
  id: string;
  orderId: string;
  inventoryId: string;
  quantity: number;
  state: StudioLifecycleState;
  disposition: ReturnDisposition;
  createdAt: string;
  resolvedAt?: string;
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

export interface NewModelInput {
  name: string;
}

export interface ModelUpdateInput {
  name?: string;
  styling?: Partial<ModelStylingProfile>;
  readiness?: Partial<ModelReadiness>;
}

export interface NewGarmentInput {
  sku: string;
  title: string;
  category: GarmentCategory;
  sizeLabel: string;
  estimatedFit: string;
  color: string;
  price: number;
  condition: string;
  brand?: string;
  source: string;
  notes: string;
  privateNote?: string;
  publicDescription?: string;
  quantity?: number;
  saleEligible?: boolean;
  measurements?: GarmentMeasurement[];
  hasFront: boolean;
  hasBack: boolean;
  hasDetail: boolean;
}

export interface ListingUpdateInput {
  title?: string;
  description?: string;
  price?: number;
  modelId?: string;
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
