import { get } from "@vercel/blob";
import {
  addStudioAsset,
  getOwnedWardrobeItem,
} from "../../server/studio-intake-repository";
import {
  findCataloguePublication,
  publishAdoptedCatalogueRevisionAtomically,
  publishAtelierAdoptionRevisionAtomically,
  publishCatalogueRevisionAtomically,
} from "../../server/studio-catalogue-publication-repository";
import {
  appendGarmentEvent,
  archiveGarment,
  changePublicationVisibility,
  createDraftGarmentRevision,
  discardDraftGarmentRevision,
  findDraftGarmentRevision,
  listGarmentEvents,
  replaceWardrobeApprovedFront,
  updateDraftGarmentRevision,
  updatePrivateGarmentFacts,
  type GarmentRevisionRow,
} from "../../server/studio-garment-lifecycle-repository";
import type { StudioOperator } from "../../server/studio-operator";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import { invalidateServerShopCatalogue } from "../../shop/server-catalog";
import { saveWardrobeCapture } from "./pending-capture-service";
import { verifyStudioImage } from "./assets";
import {
  getStudioPublicationContext,
  publishStudioPublicationMedia,
  studioPublicationBlockers,
  type PublicationSource,
} from "./catalogue-publication-service";
import type { IntakeFacts } from "./contracts";
import { StudioEngineError } from "./errors";
import { sha256 } from "./fingerprint";
import {
  parseStudioAtelierAdoptionRevision,
  parseStudioAtelierPublicationMediaSet,
  type StudioAtelierPublicationMedia,
  type StudioPublishedMediaSlot,
} from "./catalogue-publication-contracts";
import type {
  GarmentLifecycleCommand,
  GarmentLifecycleDraft,
  GarmentLifecycleWorkspace,
  GarmentRevisionDiff,
  GarmentRevisionMediaRole,
} from "./garment-lifecycle-contracts";

type WardrobeItem = Awaited<ReturnType<typeof getOwnedWardrobeItem>>;
type Publication = NonNullable<Awaited<ReturnType<typeof findCataloguePublication>>>;

const labels: Record<StudioPublishedMediaSlot, string> = {
  GARMENT_FRONT: "Garment front",
  GARMENT_BACK: "Garment back",
  MANNEQUIN_FRONT: "On mannequin",
  FABRIC_DETAIL: "Fabric detail",
  MODEL_FRONT: "On Lulu · front",
  MODEL_LEFT_PROFILE: "On Lulu · left profile",
  MODEL_REAR_THREE_QUARTER: "On Lulu · right rear three-quarter",
};

function itemFacts(item: WardrobeItem): IntakeFacts {
  const description = typeof (item as WardrobeItem & { description?: unknown }).description === "string"
    ? (item as WardrobeItem & { description: string }).description.trim()
    : "";
  return {
    title: item.title,
    ...(description ? { description } : {}),
    category: item.category as IntakeFacts["category"],
    colour: item.colour,
    sizeLabel: item.sizeLabel,
    condition: item.condition,
    price: item.price,
  };
}

function sourceRecords(sources: PublicationSource[]) {
  return sources.map(({ id, slot, sha256: sourceSha256, width, height }) => ({
    id,
    slot,
    sourceSha256,
    width,
    height,
  }));
}

function expectedDraftRevision(input: {
  draft: GarmentRevisionRow;
  item: WardrobeItem;
  facts: IntakeFacts;
  media: Array<Record<string, unknown>>;
}) {
  return sha256(JSON.stringify({
    wardrobeItemId: input.item.id,
    intakeId: input.item.intakeId,
    itemVersion: input.item.version,
    draftId: input.draft.id,
    draftVersion: input.draft.version,
    baseSourceRevision: input.draft.baseSourceRevision,
    facts: input.facts,
    media: input.media,
  }));
}

function formatValue(value: string | number | undefined) {
  return typeof value === "number"
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value)
    : value ?? "Not set";
}

function withDescription(facts: IntakeFacts, fallback: IntakeFacts): IntakeFacts {
  const { description: _description, ...factsWithoutDescription } = facts;
  const description = typeof facts.description === "string" && facts.description.trim()
    ? facts.description.trim()
    : typeof fallback.description === "string" && fallback.description.trim()
      ? fallback.description.trim()
      : "";
  return {
    ...factsWithoutDescription,
    ...(description ? { description } : {}),
  };
}

function requiredDescription(facts: IntakeFacts): string {
  if (typeof facts.description === "string" && facts.description.trim()) return facts.description.trim();
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "This piece needs a Shop description.",
    "Add the customer-facing description in Facts & price.",
  );
}

function revisionDiff(input: {
  liveFacts: IntakeFacts;
  draftFacts: IntakeFacts;
  liveMedia: Publication["media"];
  draftMedia: Array<Record<string, unknown>>;
}): GarmentRevisionDiff[] {
  const fields = [
    ["title", "Name"],
    ["description", "Shop description"],
    ["category", "Category"],
    ["colour", "Colour"],
    ["sizeLabel", "Size"],
    ["condition", "Condition"],
    ["price", "Price"],
  ] as const;
  const facts = fields.flatMap(([field, label]) => {
    const before = input.liveFacts[field];
    const after = input.draftFacts[field];
    return before === after ? [] : [{
      field,
      label,
      before: formatValue(before),
      after: formatValue(after),
    } satisfies GarmentRevisionDiff];
  });
  const identity = (media: Record<string, unknown>) =>
    typeof media.sourceSha256 === "string" ? media.sourceSha256
      : typeof media.src === "string" ? media.src : "";
  const liveHashes = new Map(input.liveMedia.map((media) => [media.slot, identity(media)]));
  const changedMedia = input.draftMedia
    .filter((media) => typeof media.slot === "string" && liveHashes.get(media.slot as keyof typeof labels) !== identity(media))
    .map((media) => labels[media.slot as keyof typeof labels]);
  return changedMedia.length ? [...facts, {
    field: "media",
    label: "Photos",
    before: "Current Shop set",
    after: changedMedia.join(", "),
  }] : facts;
}

function liveFacts(publication: Publication, item: WardrobeItem): IntakeFacts {
  const facts = publication.facts;
  const description = typeof facts.description === "string" && facts.description.trim()
    ? facts.description.trim()
    : publication.description;
  return {
    title: typeof facts.title === "string" ? facts.title : item.title,
    description,
    category: item.category as IntakeFacts["category"],
    colour: typeof facts.colour === "string" ? facts.colour : item.colour,
    sizeLabel: typeof facts.sizeLabel === "string" ? facts.sizeLabel : item.sizeLabel,
    condition: typeof facts.condition === "string" ? facts.condition : item.condition,
    price: typeof facts.price === "number" ? facts.price : item.price,
  };
}

async function ensureDraft(input: {
  item: WardrobeItem;
  publication: Publication;
  operator: StudioOperator;
  facts?: IntakeFacts;
  media: Array<Record<string, unknown>>;
}) {
  const existing = await findDraftGarmentRevision({
    wardrobeItemId: input.item.id,
    operatorSubject: input.operator.subject,
  });
  if (existing) return existing;
  const created = await createDraftGarmentRevision({
    wardrobeItemId: input.item.id,
    operatorSubject: input.operator.subject,
    baseSourceRevision: input.publication.sourceRevision,
    facts: input.facts ?? liveFacts(input.publication, input.item),
    media: input.media,
  });
  if (created) return created;
  const concurrent = await findDraftGarmentRevision({
    wardrobeItemId: input.item.id,
    operatorSubject: input.operator.subject,
  });
  if (concurrent) return concurrent;
  throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed in another window.", "Reload the piece.");
}

function isCatalogueAdopted(publication: Publication | null | undefined) {
  return publication?.origin === "CATALOGUE_ADOPTED";
}

type AtelierAdoptionIdentity = Readonly<{
  adoptionRevision: string;
  receiptId: string;
  media: readonly StudioAtelierPublicationMedia[];
}>;

function atelierAdoptionIdentity(
  publication: Publication | null | undefined,
): AtelierAdoptionIdentity | null {
  if (!publication) return null;
  try {
    const adoptionRevision = parseStudioAtelierAdoptionRevision(
      publication.facts,
      publication.sourceRevision,
    );
    if (!adoptionRevision) return null;
    if (publication.origin !== "STUDIO_NATIVE" || publication.baseline !== null) {
      throw new Error("The adoption marker is attached to the wrong publication origin.");
    }
    const parsed = parseStudioAtelierPublicationMediaSet(publication.media);
    return Object.freeze({
      adoptionRevision,
      receiptId: parsed.receiptId,
      media: parsed.media,
    });
  } catch {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "This locked Atelier publication is inconsistent.",
      "Reload the piece and verify its adoption receipt before changing it.",
    );
  }
}

function hasImmutablePublicationMedia(publication: Publication | null | undefined) {
  return isCatalogueAdopted(publication) || atelierAdoptionIdentity(publication) !== null;
}

function revisionMedia(publication: Publication | null, sources: PublicationSource[]) {
  return publication && hasImmutablePublicationMedia(publication)
    ? publication.media as Array<Record<string, unknown>>
    : sourceRecords(sources);
}

function allowedActions(input: {
  item: WardrobeItem;
  publication: Publication | null;
  draft: GarmentRevisionRow | null;
}): GarmentLifecycleWorkspace["allowedActions"] {
  if (input.item.state === "ARCHIVED" || input.publication?.state === "ARCHIVED") return [];
  const actions: GarmentLifecycleWorkspace["allowedActions"] = ["EDIT", "ARCHIVE"];
  if (input.draft) actions.push("PUBLISH_REVISION", "DISCARD_REVISION");
  if (input.publication?.state === "PUBLISHED") actions.push("UNPUBLISH");
  if (input.publication?.state === "UNPUBLISHED") actions.push("REPUBLISH");
  return actions;
}

export async function getGarmentLifecycleWorkspace(
  wardrobeItemId: string,
  operator: StudioOperator,
): Promise<GarmentLifecycleWorkspace> {
  const [item, publication, context, draft, history] = await Promise.all([
    getOwnedWardrobeItem(wardrobeItemId, operator.subject),
    findCataloguePublication({ wardrobeItemId, operatorSubject: operator.subject }),
    getStudioPublicationContext(wardrobeItemId, operator),
    findDraftGarmentRevision({ wardrobeItemId, operatorSubject: operator.subject }),
    listGarmentEvents({ wardrobeItemId, operatorSubject: operator.subject }),
  ]);
  const baseline = publication ? liveFacts(publication, item) : itemFacts(context.item);
  const draftFacts = draft ? withDescription(draft.facts, baseline) : undefined;
  const immutablePublicationMedia = hasImmutablePublicationMedia(publication);
  const currentRevisionMedia = publication
    ? immutablePublicationMedia ? (draft?.media ?? publication.media) : sourceRecords(context.sources)
    : sourceRecords(context.sources);
  const draftView: GarmentLifecycleDraft | undefined = draft ? {
    id: draft.id,
    revisionNumber: draft.revisionNumber,
    version: draft.version,
    expectedRevision: expectedDraftRevision({ draft, item, facts: draftFacts!, media: currentRevisionMedia as Array<Record<string, unknown>> }),
    facts: draftFacts!,
    media: immutablePublicationMedia ? [] : context.sources.map((source) => ({
      id: source.id,
      slot: source.slot,
      label: source.label,
      assetUrl: source.assetUrl,
      width: source.width ?? 0,
      height: source.height ?? 0,
    })),
    diff: publication ? revisionDiff({
      liveFacts: baseline,
      draftFacts: draftFacts!,
      liveMedia: publication.media,
      draftMedia: currentRevisionMedia as Array<Record<string, unknown>>,
    }) : [],
    updatedAt: draft.updatedAt.toISOString(),
  } : undefined;
  const publicationState = String(publication?.state ?? "");
  const state: GarmentLifecycleWorkspace["state"] = item.state === "ARCHIVED" || publicationState === "ARCHIVED"
    ? "ARCHIVED"
    : publicationState === "PUBLISHED" ? "PUBLISHED"
      : publicationState === "UNPUBLISHED" ? "UNPUBLISHED" : "PRIVATE";
  return {
    wardrobeItemId,
    itemVersion: item.version,
    state,
    facts: baseline,
    editableFacts: draftFacts ?? baseline,
    mediaEditable: !immutablePublicationMedia,
    ...(publication ? {
      live: {
        receipt: {
          publicationId: publication.id,
          wardrobeItemId: publication.wardrobeItemId,
          sku: publication.sku,
          slug: publication.slug,
          origin: publication.origin as "STUDIO_NATIVE" | "CATALOGUE_ADOPTED",
          publishedAt: publication.publishedAt.toISOString(),
          shopUrl: `/shop/products/${publication.slug}`,
        },
        sourceRevision: publication.sourceRevision,
        facts: baseline,
        media: publication.media.map((media) => ({
          slot: media.slot,
          label: labels[media.slot],
          src: media.src,
        })),
      },
    } : {}),
    ...(draftView ? { draft: draftView } : {}),
    history,
    allowedActions: allowedActions({ item, publication, draft }),
  };
}

async function saveGarmentFacts(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  expectedVersion: number;
  facts: IntakeFacts;
}) {
  const [item, publication, context, draft] = await Promise.all([
    getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject),
    findCataloguePublication({ wardrobeItemId: input.wardrobeItemId, operatorSubject: input.operator.subject }),
    getStudioPublicationContext(input.wardrobeItemId, input.operator),
    findDraftGarmentRevision({ wardrobeItemId: input.wardrobeItemId, operatorSubject: input.operator.subject }),
  ]);
  if (item.state === "ARCHIVED" || publication?.state === "ARCHIVED") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This piece is archived.", "Return to Wardrobe.");
  }
  const fallbackFacts = draft?.facts ?? (publication ? liveFacts(publication, item) : itemFacts(context.item));
  const facts = withDescription(input.facts, fallbackFacts);
  if (!publication) {
    const saved = await updatePrivateGarmentFacts({
      wardrobeItemId: item.id,
      operatorSubject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      facts,
    });
    if (!saved) throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed in another window.", "Reload the piece.");
    return;
  }
  if (!draft) {
    if (input.expectedVersion !== item.version) {
      throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed in another window.", "Reload the piece.");
    }
    const created = await ensureDraft({
      item,
      publication,
      operator: input.operator,
      facts,
      media: revisionMedia(publication, context.sources),
    });
    if (created.facts.title !== facts.title || created.version !== 1) {
      throw new StudioEngineError("VERSION_CONFLICT", 409, "A private revision already exists.", "Reload the piece.");
    }
    return;
  }
  const updated = await updateDraftGarmentRevision({
    id: draft.id,
    wardrobeItemId: item.id,
    operatorSubject: input.operator.subject,
    expectedVersion: input.expectedVersion,
    facts,
    media: revisionMedia(publication, context.sources),
  });
  if (!updated) throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision changed in another window.", "Reload the piece.");
}

export async function runGarmentLifecycleCommand(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  command: GarmentLifecycleCommand;
}): Promise<GarmentLifecycleWorkspace> {
  if (input.command.command === "SAVE_FACTS") {
    await saveGarmentFacts({
      wardrobeItemId: input.wardrobeItemId,
      operator: input.operator,
      expectedVersion: input.command.expectedVersion,
      facts: input.command.facts,
    });
  } else if (input.command.command === "DISCARD_REVISION") {
    const workspace = await getGarmentLifecycleWorkspace(input.wardrobeItemId, input.operator);
    if (!workspace.draft || workspace.draft.expectedRevision !== input.command.expectedRevision) {
      throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision changed in another window.", "Review it again.");
    }
    const discarded = await discardDraftGarmentRevision({
      wardrobeItemId: input.wardrobeItemId,
      operatorSubject: input.operator.subject,
      expectedVersion: workspace.draft.version,
    });
    if (!discarded) throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision changed in another window.", "Reload the piece.");
  } else if (input.command.command === "PUBLISH_REVISION") {
    await publishGarmentRevision({
      wardrobeItemId: input.wardrobeItemId,
      operator: input.operator,
      expectedRevision: input.command.expectedRevision,
      idempotencyKey: input.command.idempotencyKey,
    });
  } else if (input.command.command === "UNPUBLISH" || input.command.command === "REPUBLISH") {
    const changed = await changePublicationVisibility({
      wardrobeItemId: input.wardrobeItemId,
      operatorSubject: input.operator.subject,
      expectedSourceRevision: input.command.expectedRevision,
      command: input.command.command,
    });
    if (!changed) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "This piece cannot change visibility now.", "Check that it is not reserved or sold.");
    }
    invalidateServerShopCatalogue();
  } else {
    const archived = await archiveGarment({
      wardrobeItemId: input.wardrobeItemId,
      operatorSubject: input.operator.subject,
      expectedVersion: input.command.expectedVersion,
    });
    if (!archived) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "This piece cannot be archived now.", "Check that it is not reserved or sold.");
    }
    invalidateServerShopCatalogue();
  }
  return getGarmentLifecycleWorkspace(input.wardrobeItemId, input.operator);
}

async function publishGarmentRevision(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  expectedRevision: string;
  idempotencyKey: string;
}) {
  const publication = await findCataloguePublication({
    wardrobeItemId: input.wardrobeItemId,
    operatorSubject: input.operator.subject,
  });
  if (publication?.idempotencyKey === input.idempotencyKey && publication.state === "PUBLISHED") return;
  const [item, draft, context] = await Promise.all([
    getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject),
    findDraftGarmentRevision({ wardrobeItemId: input.wardrobeItemId, operatorSubject: input.operator.subject }),
    getStudioPublicationContext(input.wardrobeItemId, input.operator),
  ]);
  if (!publication || !draft) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no private revision to publish.", "Edit the piece first.");
  }
  const atelierAdoption = atelierAdoptionIdentity(publication);
  const immutablePublicationMedia = isCatalogueAdopted(publication) || atelierAdoption !== null;
  const facts = withDescription(draft.facts, liveFacts(publication, item));
  const currentExpected = expectedDraftRevision({
    draft,
    item,
    facts,
    media: immutablePublicationMedia ? draft.media : sourceRecords(context.sources),
  });
  if (currentExpected !== input.expectedRevision) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision changed during review.", "Review it again.");
  }
  if (isCatalogueAdopted(publication)) {
    if (JSON.stringify(draft.media) !== JSON.stringify(publication.media)) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "This catalogue photo set changed.", "Review the piece again.");
    }
    const row = await publishAdoptedCatalogueRevisionAtomically({
      wardrobeItemId: item.id,
      intakeId: item.intakeId,
      operatorSubject: input.operator.subject,
      idempotencyKey: input.idempotencyKey,
      baseSourceRevision: draft.baseSourceRevision,
      sourceRevision: input.expectedRevision,
      expectedVersion: item.version,
      revisionId: draft.id,
      revisionVersion: draft.version,
      sku: publication.sku,
      slug: publication.slug,
      title: facts.title,
      description: requiredDescription(facts),
      sourceCategory: facts.category,
      category: shopCategory(facts.category),
      price: facts.price,
      taggedSize: facts.sizeLabel,
      condition: facts.condition,
      colour: facts.colour,
      tone: presentationTone(facts.colour),
      silhouette: shopSilhouette(facts.category),
      facts: { ...facts, category: shopCategory(facts.category), quantity: 1 },
    });
    if (!row) throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision could not replace the live piece.", "Review it again.");
    invalidateServerShopCatalogue();
    return;
  }
  if (atelierAdoption) {
    if (
      draft.baseSourceRevision !== atelierAdoption.adoptionRevision
      || JSON.stringify(draft.media) !== JSON.stringify(publication.media)
      || JSON.stringify(publication.media) !== JSON.stringify(atelierAdoption.media)
    ) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "This locked Atelier photo set changed.",
        "Reload the piece and verify the adoption receipt.",
      );
    }
    const row = await publishAtelierAdoptionRevisionAtomically({
      wardrobeItemId: item.id,
      intakeId: item.intakeId,
      operatorSubject: input.operator.subject,
      idempotencyKey: input.idempotencyKey,
      baseSourceRevision: atelierAdoption.adoptionRevision,
      expectedVersion: item.version,
      revisionId: draft.id,
      revisionVersion: draft.version,
      sku: publication.sku,
      slug: publication.slug,
      title: facts.title,
      description: requiredDescription(facts),
      sourceCategory: facts.category,
      category: shopCategory(facts.category),
      price: facts.price,
      taggedSize: facts.sizeLabel,
      condition: facts.condition,
      colour: facts.colour,
      tone: presentationTone(facts.colour),
      silhouette: shopSilhouette(facts.category),
      facts: {
        ...facts,
        category: shopCategory(facts.category),
        quantity: 1,
        atelierAdoptionRevision: atelierAdoption.adoptionRevision,
      },
      receiptId: atelierAdoption.receiptId,
      media: atelierAdoption.media,
    });
    if (!row) {
      throw new StudioEngineError(
        "VERSION_CONFLICT",
        409,
        "This Atelier revision could not replace the live piece.",
        "Review it again.",
      );
    }
    invalidateServerShopCatalogue();
    return;
  }
  const blockers = studioPublicationBlockers({ ...context.item, ...facts }, context.sources);
  if (blockers.length || !context.ready) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This revision is not ready.", blockers.join(", ") || "Add all three product photos.");
  }
  const media = await Promise.all(context.sources.map((source) => publishStudioPublicationMedia(publication.slug, source)));
  const [currentItem, currentDraft, currentContext] = await Promise.all([
    getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject),
    findDraftGarmentRevision({ wardrobeItemId: input.wardrobeItemId, operatorSubject: input.operator.subject }),
    getStudioPublicationContext(input.wardrobeItemId, input.operator),
  ]);
  const currentFacts = currentDraft
    ? withDescription(currentDraft.facts, liveFacts(publication, currentItem))
    : null;
  if (!currentDraft || !currentFacts || expectedDraftRevision({ draft: currentDraft, item: currentItem, facts: currentFacts, media: sourceRecords(currentContext.sources) }) !== input.expectedRevision || !currentContext.ready) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision changed during publishing.", "Review it again.");
  }
  const row = await publishCatalogueRevisionAtomically({
    wardrobeItemId: currentItem.id,
    intakeId: currentItem.intakeId,
    operatorSubject: input.operator.subject,
    idempotencyKey: input.idempotencyKey,
    baseSourceRevision: currentDraft.baseSourceRevision,
    sourceRevision: input.expectedRevision,
    expectedVersion: currentItem.version,
    approvedAssetId: currentContext.ready.front.id,
    approvedAssetSha256: currentContext.ready.front.sha256,
    captureKey: currentContext.ready.captureKey,
    backCaptureId: currentContext.ready.back.id,
    backCaptureSha256: currentContext.ready.back.sha256,
    detailCaptureId: currentContext.ready.detail.id,
    detailCaptureSha256: currentContext.ready.detail.sha256,
    revisionId: currentDraft.id,
    revisionVersion: currentDraft.version,
    sku: publication.sku,
    slug: publication.slug,
    title: currentFacts.title,
    description: requiredDescription(currentFacts),
    sourceCategory: currentFacts.category,
    category: shopCategory(currentFacts.category),
    price: currentFacts.price,
    taggedSize: currentFacts.sizeLabel,
    condition: currentFacts.condition,
    colour: currentFacts.colour,
    tone: presentationTone(currentFacts.colour),
    silhouette: shopSilhouette(currentFacts.category),
    facts: { ...currentFacts, category: shopCategory(currentFacts.category), quantity: 1 },
    media,
  });
  if (!row) throw new StudioEngineError("VERSION_CONFLICT", 409, "This revision could not replace the live piece.", "Review it again.");
  invalidateServerShopCatalogue();
}

export async function replaceGarmentRevisionMedia(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  expectedVersion: number;
  role: GarmentRevisionMediaRole;
  bytes: Uint8Array;
  declaredType?: string;
}): Promise<GarmentLifecycleWorkspace> {
  const [item, publication, context] = await Promise.all([
    getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject),
    findCataloguePublication({ wardrobeItemId: input.wardrobeItemId, operatorSubject: input.operator.subject }),
    getStudioPublicationContext(input.wardrobeItemId, input.operator),
  ]);
  if (hasImmutablePublicationMedia(publication)) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "This piece still uses its approved immutable photo set.",
      "Create a new verified media adoption before replacing it.",
    );
  }
  if (item.version !== input.expectedVersion || item.state === "ARCHIVED" || publication?.state === "ARCHIVED") {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed in another window.", "Reload the piece.");
  }
  const draft = publication ? await ensureDraft({
    item,
    publication,
    operator: input.operator,
    facts: liveFacts(publication, item),
    media: sourceRecords(context.sources),
  }) : null;
  if (input.role === "GARMENT_FRONT") {
    const verified = verifyStudioImage(input.bytes, input.declaredType);
    const hash = sha256(verified.bytes);
    const operatorKey = sha256(input.operator.subject).slice(0, 20);
    const pathname = `studio/operators/${operatorKey}/wardrobe/${item.id}/garment_front/${hash}.${verified.extension}`;
    const prior = await get(pathname, {
      access: "private",
      token: getShopBlobToken("private"),
      useCache: false,
    });
    if (prior) {
      const priorBytes = new Uint8Array(await new Response(prior.stream).arrayBuffer());
      if (sha256(verifyStudioImage(priorBytes, prior.blob.contentType ?? undefined).bytes) !== hash) {
        throw new StudioEngineError("INVALID_ASSET", 503, "That private photo did not verify.", "Choose the photo again.");
      }
    } else {
      await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: verified.mimeType,
        cacheControlMaxAge: 31_536_000,
      });
    }
    const asset = await addStudioAsset({
      intakeId: item.intakeId,
      role: "GARMENT_FRONT",
      blobPathname: pathname,
      blobUrl: pathname,
      mimeType: verified.mimeType,
      byteSize: verified.bytes.byteLength,
      width: verified.width,
      height: verified.height,
      sha256: hash,
    });
    const replaced = await replaceWardrobeApprovedFront({
      wardrobeItemId: item.id,
      operatorSubject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      approvedAssetId: asset.id,
    });
    if (!replaced) throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed while the photo was saving.", "Reload the piece.");
  } else {
    await saveWardrobeCapture({
      wardrobeItemId: item.id,
      role: input.role,
      operator: input.operator,
      bytes: input.bytes,
      declaredType: input.declaredType,
    });
  }
  const nextContext = await getStudioPublicationContext(item.id, input.operator);
  if (draft) {
    const touched = await updateDraftGarmentRevision({
      id: draft.id,
      wardrobeItemId: item.id,
      operatorSubject: input.operator.subject,
      expectedVersion: draft.version,
      facts: draft.facts,
      media: sourceRecords(nextContext.sources),
      eventType: "MEDIA_REPLACED",
      eventSummary: `${labels[input.role]} replaced privately`,
      mediaRole: input.role,
    });
    if (!touched) throw new StudioEngineError("VERSION_CONFLICT", 409, "The private revision changed while the photo was saving.", "Reload the piece.");
  } else {
    await appendGarmentEvent({
      wardrobeItemId: item.id,
      operatorSubject: input.operator.subject,
      eventType: "MEDIA_REPLACED",
      summary: `${labels[input.role]} replaced privately`,
      details: { mediaRole: input.role },
    });
  }
  return getGarmentLifecycleWorkspace(item.id, input.operator);
}

function shopCategory(category: IntakeFacts["category"]) {
  const categories: Partial<Record<IntakeFacts["category"], string>> = {
    Dress: "Dresses",
    Set: "Sets",
    Shirt: "Shirts",
    Knitwear: "Knitwear",
    Skirt: "Skirts",
    Trousers: "Trousers",
  };
  const value = categories[category];
  if (!value) throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a Shop category.", "Edit the garment category.");
  return value;
}

function shopSilhouette(category: IntakeFacts["category"]) {
  const values: Partial<Record<IntakeFacts["category"], string>> = {
    Dress: "dress", Set: "set", Shirt: "shirt", Knitwear: "knit", Skirt: "skirt", Trousers: "trouser",
  };
  const value = values[category];
  if (!value) throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a Shop category.", "Edit the garment category.");
  return value;
}

function presentationTone(colour: string) {
  const value = colour.toLowerCase();
  if (/coral|orange|red/.test(value)) return "coral";
  if (/salmon|pink|magenta/.test(value)) return "salmon";
  if (/blue|indigo|navy|purple/.test(value)) return "indigo";
  if (/green|moss|sage/.test(value)) return "moss";
  if (/ivory|white|cream|beige/.test(value)) return "ivory";
  return "cocoa";
}
