import {
  studioDecisionNoteSha256,
  StudioEngineError,
  type GarmentIntakeClient,
  type IntakeFacts,
  type IntakeSnapshot,
  type IntakeSourceMode,
} from "../../components/studio/garment-intake/engine-client";
import type {
  Garment,
  GarmentCategory,
  InventoryRecord,
  StudioLifecycleState,
  StudioListing,
  StudioOrder,
  StudioReturn,
  VisualVariant,
} from "./domain/entities";
import { createDefaultModel, type StudioSnapshot } from "./domain/state";
import { mergeWardrobeAuthoritySeeds } from "./seeds/wardrobe-authority";
import type { StudioService } from "./services/contracts";

export const STUDIO_SCENARIOS = ["lifecycle", "intake-error"] as const;
export type StudioScenario = (typeof STUDIO_SCENARIOS)[number];

export const STUDIO_SCENARIO_LABELS: Record<StudioScenario, string> = {
  lifecycle: "Lifecycle",
  "intake-error": "Intake error",
};

const SCENARIO_TIME = "2026-08-16T12:00:00.000Z";
const SCENARIO_CANDIDATE_URL = "/studio/wardrobe/blush-scoop-mini-dress/01-garment-front.webp";

interface ScenarioPieceSpec {
  id: string;
  sku: string;
  slug?: string;
  title: string;
  category: GarmentCategory;
  sizeLabel: string;
  estimatedFit: string;
  color: string;
  price: number;
  condition: string;
  visual: VisualVariant;
  garmentState: StudioLifecycleState;
  listingState?: StudioLifecycleState;
  inventoryState: StudioLifecycleState;
  availability: Garment["availability"];
  onHand: number;
  reserved?: number;
  sold?: number;
  mediaReady?: boolean;
}

const SCENARIO_PIECES: readonly ScenarioPieceSpec[] = [
  {
    id: "scenario-garment-draft",
    sku: "SIM-001",
    title: "Scenario Intake Draft",
    category: "Dress",
    sizeLabel: "Size on request",
    estimatedFit: "Measurements confirmed before payment",
    color: "Blush",
    price: 21_500,
    condition: "Excellent",
    visual: "plum",
    garmentState: "DRAFT",
    inventoryState: "DRAFT",
    availability: "AVAILABLE",
    onHand: 1,
    mediaReady: false,
  },
  {
    id: "scenario-garment-ready",
    sku: "JUW-001",
    slug: "coral-drift-dress",
    title: "Coral Drift Dress · Ready",
    category: "Dress",
    sizeLabel: "UK 10",
    estimatedFit: "Relaxed 8–10",
    color: "Washed coral",
    price: 24_500,
    condition: "Excellent pre-loved",
    visual: "plum",
    garmentState: "READY",
    listingState: "READY",
    inventoryState: "READY",
    availability: "AVAILABLE",
    onHand: 1,
  },
  {
    id: "scenario-garment-live",
    sku: "JUW-003",
    slug: "moss-square-knit",
    title: "Moss Square Knit · Live",
    category: "Knitwear",
    sizeLabel: "M",
    estimatedFit: "Fitted 8–12",
    color: "Moss green",
    price: 12_500,
    condition: "Good · light wear",
    visual: "moss",
    garmentState: "PUBLISHED",
    listingState: "PUBLISHED",
    inventoryState: "PUBLISHED",
    availability: "AVAILABLE",
    onHand: 1,
  },
  {
    id: "scenario-garment-order",
    sku: "JUW-002",
    slug: "indigo-workshirt",
    title: "Indigo Workshirt · Reserved",
    category: "Shirt",
    sizeLabel: "L",
    estimatedFit: "Oversized 10–14",
    color: "Washed indigo",
    price: 18_000,
    condition: "Very good",
    visual: "indigo",
    garmentState: "RESERVED",
    listingState: "RESERVED",
    inventoryState: "RESERVED",
    availability: "RESERVED",
    onHand: 1,
    reserved: 1,
  },
  {
    id: "scenario-garment-return",
    sku: "JUW-004",
    slug: "ivory-tie-skirt",
    title: "Ivory Tie Skirt · Return",
    category: "Skirt",
    sizeLabel: "UK 10",
    estimatedFit: "Adjustable 8–12",
    color: "Warm ivory",
    price: 15_500,
    condition: "Excellent pre-loved",
    visual: "chalk",
    garmentState: "SOLD",
    listingState: "SOLD",
    inventoryState: "SOLD",
    availability: "SOLD",
    onHand: 0,
    sold: 1,
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scenarioGarment(spec: ScenarioPieceSpec): Garment {
  const mediaReady = spec.mediaReady !== false;
  return {
    id: spec.id,
    sku: spec.sku,
    title: spec.title,
    category: spec.category,
    sizeLabel: spec.sizeLabel,
    estimatedFit: spec.estimatedFit,
    color: spec.color,
    price: spec.price,
    condition: spec.condition,
    source: "Development simulator",
    notes: "Synthetic Studio lifecycle evidence.",
    privateNote: "",
    publicDescription: "Synthetic Studio lifecycle evidence.",
    quantity: 1,
    saleEligible: true,
    measurements: [{ label: "Length", value: "Scenario measurement" }],
    classificationState: "READY",
    mediaState: mediaReady ? "READY" : "DRAFT",
    state: spec.garmentState,
    availability: spec.availability,
    canonState: spec.garmentState === "DRAFT" ? "REVIEW" : "APPROVED",
    visual: spec.visual,
    references: mediaReady
      ? (["FRONT", "BACK", "DETAIL"] as const).map((view) => ({
          id: `${spec.id}-${view.toLowerCase()}`,
          view,
          quality: 100,
        }))
      : [{ id: `${spec.id}-front`, view: "FRONT", quality: 100 }],
    createdAt: SCENARIO_TIME,
  };
}

function scenarioListing(spec: ScenarioPieceSpec): StudioListing | undefined {
  if (!spec.slug || !spec.listingState) return undefined;
  return {
    id: `${spec.id}-listing`,
    garmentId: spec.id,
    modelId: "model-lulu",
    slug: spec.slug,
    title: spec.title,
    description: "Synthetic Studio lifecycle evidence.",
    price: spec.price,
    state: spec.listingState,
    createdAt: SCENARIO_TIME,
    ...(["PUBLISHED", "RESERVED", "SOLD"].includes(spec.listingState)
      ? { publishedAt: SCENARIO_TIME }
      : {}),
  };
}

function scenarioInventory(spec: ScenarioPieceSpec): InventoryRecord {
  return {
    id: `${spec.id}-inventory`,
    garmentId: spec.id,
    ...(spec.listingState ? { listingId: `${spec.id}-listing` } : {}),
    onHand: spec.onHand,
    reserved: spec.reserved ?? 0,
    sold: spec.sold ?? 0,
    returned: 0,
    writeOff: 0,
    state: spec.inventoryState,
    updatedAt: SCENARIO_TIME,
  };
}

export function isStudioScenario(value: string | null | undefined): value is StudioScenario {
  return value !== null
    && value !== undefined
    && (STUDIO_SCENARIOS as readonly string[]).includes(value);
}

export function parseStudioScenario(
  value: string | null | undefined,
  scenariosEnabled: boolean,
): StudioScenario | null {
  return scenariosEnabled && isStudioScenario(value) ? value : null;
}

export function studioScenarioRouteSupported(pathname: string) {
  return pathname === "/studio"
    || pathname === "/studio/ask"
    || pathname === "/studio/media"
    || pathname === "/studio/operations"
    || pathname === "/studio/wardrobe"
    || pathname.startsWith("/studio/wardrobe/");
}

export function studioScenarioHref(href: string, scenario: StudioScenario | null) {
  if (
    !scenario
    || href.startsWith("#")
    || (!href.startsWith("/studio") && !href.startsWith("/shoots"))
  ) return href;
  const destination = new URL(href, "https://studio.invalid");
  // Compatibility grammar: the development simulator owns order and return
  // fixtures inside Operations. Canonical order links therefore alias to the
  // matching Operations view while production keeps the real /studio/orders
  // routes. Preserve this translation until simulator routes gain parity.
  if (destination.pathname === "/studio/orders" || destination.pathname.startsWith("/studio/orders/")) {
    const orderReference = destination.pathname.startsWith("/studio/orders/")
      ? decodeURIComponent(destination.pathname.slice("/studio/orders/".length))
      : null;
    destination.pathname = "/studio/operations";
    destination.search = "";
    destination.searchParams.set("view", "orders");
    if (orderReference) {
      destination.searchParams.set("order", orderReference);
      destination.hash = "studio-scenario-order";
    }
  }
  destination.searchParams.set("scenario", scenario);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function createStudioScenarioSnapshot(scenario: StudioScenario): StudioSnapshot {
  const garments = SCENARIO_PIECES.map((spec) => ({
    ...scenarioGarment(spec),
    source: `Development simulator · ${STUDIO_SCENARIO_LABELS[scenario]}`,
  }));
  const listings = SCENARIO_PIECES.flatMap((spec) => {
    const listing = scenarioListing(spec);
    return listing ? [listing] : [];
  });
  const inventory = SCENARIO_PIECES.map(scenarioInventory);
  const reservedSpec = SCENARIO_PIECES.find((spec) => spec.id === "scenario-garment-order")!;
  const returnedSpec = SCENARIO_PIECES.find((spec) => spec.id === "scenario-garment-return")!;
  const orders: StudioOrder[] = [
    {
      id: "scenario-order-reserved",
      listingId: `${reservedSpec.id}-listing`,
      inventoryId: `${reservedSpec.id}-inventory`,
      quantity: 1,
      state: "RESERVED",
      createdAt: SCENARIO_TIME,
    },
    {
      id: "scenario-order-sold",
      listingId: `${returnedSpec.id}-listing`,
      inventoryId: `${returnedSpec.id}-inventory`,
      quantity: 1,
      state: "SOLD",
      createdAt: SCENARIO_TIME,
      fulfilledAt: SCENARIO_TIME,
    },
  ];
  const returns: StudioReturn[] = [{
    id: "scenario-return-open",
    orderId: "scenario-order-sold",
    inventoryId: `${returnedSpec.id}-inventory`,
    quantity: 1,
    state: "DRAFT",
    disposition: "PENDING",
    createdAt: SCENARIO_TIME,
  }];
  const lifecycleSnapshot: StudioSnapshot = {
    defaultModelId: "model-lulu",
    models: [createDefaultModel()],
    garments,
    listings,
    inventory,
    orders,
    returns,
    shoots: [],
  };

  // A scenario is isolated from connected state, but its browseable catalogue
  // remains the same sanitized compatibility snapshot as local Wardrobe. The
  // five lifecycle fixtures above overlay that catalogue; no server read or
  // private source evidence is introduced.
  return clone(mergeWardrobeAuthoritySeeds(lifecycleSnapshot));
}

export function createStudioScenarioService(scenario: StudioScenario): StudioService {
  let current = createStudioScenarioSnapshot(scenario);
  let idSequence = 0;
  return {
    async hydrate() {
      return clone(current);
    },
    async persist(snapshot) {
      current = clone(snapshot);
    },
    subscribe() {
      return () => undefined;
    },
    createId(prefix) {
      idSequence += 1;
      return `scenario-${prefix}-${String(idSequence).padStart(3, "0")}`;
    },
    now() {
      return SCENARIO_TIME;
    },
  };
}

function scenarioIntake(
  sourceMode: IntakeSourceMode,
  update: Partial<IntakeSnapshot> = {},
): IntakeSnapshot {
  return {
    id: "scenario-intake-001",
    kind: "GARMENT",
    sourceMode,
    state: "SOURCE_READY",
    version: 1,
    assets: [],
    ...update,
  };
}

function nextIntake(intake: IntakeSnapshot, update: Partial<IntakeSnapshot>): IntakeSnapshot {
  return clone({ ...intake, ...update, version: intake.version + 1 });
}

function scenarioIntakeFacts(): IntakeFacts {
  return {
    title: "Scenario Intake Draft",
    category: "Dress",
    colour: "Blush",
    sizeLabel: "Size on request",
    condition: "Excellent",
    price: 21_500,
  };
}

export function createStudioScenarioIntakeClient(scenario: StudioScenario): GarmentIntakeClient {
  function assertAvailable() {
    if (scenario === "intake-error") {
      throw new StudioEngineError(
        503,
        "ENGINE_UNAVAILABLE",
        "Simulated intake service is unavailable.",
        "Your source is still here. Review it and try again.",
      );
    }
  }

  return {
    async createIntake(sourceMode) {
      assertAvailable();
      return { intake: scenarioIntake(sourceMode) };
    },
    async addSource(intakeId, file) {
      void intakeId;
      assertAvailable();
      return {
        intake: scenarioIntake("UPLOAD", {
          state: "SOURCE_READY",
          assets: [{ id: "scenario-source", role: "SOURCE", mimeType: file.type || "image/jpeg" }],
        }),
      };
    },
    async analyzeIntake(intake) {
      assertAvailable();
      return { intake: nextIntake(intake, { state: "ANALYZED", facts: scenarioIntakeFacts() }) };
    },
    async generateGarment(intake) {
      assertAvailable();
      return {
        intake: nextIntake(intake, {
          state: "REVIEW",
          facts: scenarioIntakeFacts(),
          candidate: {
            generationId: "scenario-generation-001",
            assetId: "scenario-candidate-front",
            status: "READY",
          },
        }),
        reused: false,
      };
    },
    async decideIntake(intake, decision, note) {
      assertAvailable();
      const candidate = intake.candidate;
      if (!candidate) {
        throw new StudioEngineError(
          409,
          "INVALID_TRANSITION",
          "The simulated garment candidate is unavailable.",
          "Build the garment before choosing what happens next.",
        );
      }
      const generationId = candidate.generationId;
      const noteSha256 = await studioDecisionNoteSha256(note);
      const receiptId = await studioDecisionNoteSha256(
        ["studio-decision-receipt.v1", generationId, decision, noteSha256].join("\n"),
      );
      const state = decision === "KEEP"
        ? "DECISION"
        : decision === "REJECT" ? "ARCHIVED" : "REVIEW";
      return {
        intake: nextIntake(intake, {
          state,
          candidate: decision === "KEEP"
            ? { ...candidate, status: "APPROVED" }
            : undefined,
          decisionReceipt: {
            receiptId,
            generationId,
            decision,
            noteSha256,
            decidedAt: SCENARIO_TIME,
          },
        }),
      };
    },
    async commitIntake(intake, facts) {
      assertAvailable();
      const wardrobeItem = { id: "scenario-garment-draft", state: "DRAFT" as const };
      return {
        intake: nextIntake(intake, {
          state: "COMMITTED",
          facts: clone(facts),
          wardrobeItemId: wardrobeItem.id,
        }),
        wardrobeItem,
      };
    },
    candidateUrl(intake) {
      return intake.candidate ? SCENARIO_CANDIDATE_URL : undefined;
    },
  };
}
