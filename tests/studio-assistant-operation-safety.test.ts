import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertStudioAssistantOperationConfirmation } from "../lib/server/studio-assistant-operation-service";
import {
  studioAssistantOperationCommandSchema,
  studioAssistantPieceEditInputSchema,
  type StudioAssistantOperationPreview,
} from "../lib/studio/assistant/tool-contracts";

const root = process.cwd();

function source(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

const preview: StudioAssistantOperationPreview = {
  changes: [{ after: "After", before: "Before", field: "title", label: "Name" }],
  confirmationLabel: "Confirm",
  consequence: "The reviewed change will be applied once.",
  destructive: false,
  risk: "R1",
  summary: "Review the exact change.",
};

test("operation commands require the exact reviewed confirmation", () => {
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CONFIRM",
    expectedVersion: 1,
  }).success, false);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CONFIRM",
    confirmation: "DELETE_PERMANENTLY",
    expectedVersion: 1,
  }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CONFIRM",
    confirmation: "PUBLISH_REVISION",
    expectedVersion: 1,
  }).success, false);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CONFIRM",
    confirmation: "PUBLISH_REVISION",
    expectedVersion: 1,
    publicMediaConfirmed: true,
  }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CANCEL",
    expectedVersion: 1,
  }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "RECONCILE",
    expectedVersion: 2,
  }).success, true);
});

test("the operation kind and exact publication media are bound before execution", () => {
  const archive = studioAssistantOperationCommandSchema.parse({
    action: "CONFIRM",
    confirmation: "ARCHIVE",
    expectedVersion: 1,
  });
  const deletion = studioAssistantOperationCommandSchema.parse({
    action: "CONFIRM",
    confirmation: "DELETE_PERMANENTLY",
    expectedVersion: 1,
  });
  const publication = studioAssistantOperationCommandSchema.parse({
    action: "CONFIRM",
    confirmation: "PUBLISH_REVISION",
    expectedVersion: 1,
    publicMediaConfirmed: true,
  });
  if (archive.action !== "CONFIRM" || deletion.action !== "CONFIRM" || publication.action !== "CONFIRM") {
    assert.fail("Expected confirmation commands.");
  }

  assert.doesNotThrow(() => assertStudioAssistantOperationConfirmation("ARCHIVE", preview, archive));
  assert.throws(() => assertStudioAssistantOperationConfirmation("PERMANENT_DELETE", preview, archive));
  assert.doesNotThrow(() => assertStudioAssistantOperationConfirmation("PERMANENT_DELETE", preview, deletion));
  assert.throws(() => assertStudioAssistantOperationConfirmation("PUBLISH_REVISION", preview, publication));
  assert.doesNotThrow(() => assertStudioAssistantOperationConfirmation("PUBLISH_REVISION", {
    ...preview,
    media: [{
      id: "GARMENT_FRONT",
      label: "Garment front",
      sourceRevision: "a".repeat(64),
      src: "/api/studio/wardrobe/item-1/media/front",
    }],
  }, publication));
});

test("piece edit inputs align with canonical title length and can clear description", () => {
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({
    changes: { name: "a".repeat(100) },
  }).success, true);
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({
    changes: { name: "a".repeat(101) },
  }).success, false);
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({
    changes: { description: null },
  }).success, true);
});

test("GET reconciliation is receipt-only and never crosses a domain write fence", () => {
  const service = source("lib/server/studio-assistant-operation-service.ts");
  const inspect = service.slice(
    service.indexOf("async function inspectOperationReceipt"),
    service.indexOf("async function executeOperation"),
  );
  const reconcile = service.slice(
    service.indexOf("export async function reconcileStudioAssistantOperation"),
    service.indexOf("export async function persistReconciledStudioAssistantOperation"),
  );

  assert.match(inspect, /getStudioCollectionCommandReceipt/);
  assert.match(inspect, /getGarmentPermanentDeleteReceipt/);
  assert.doesNotMatch(inspect, /applyStudioCollectionCommand|runGarmentLifecycleCommand|permanentlyDeleteGarment/);
  assert.doesNotMatch(reconcile, /finishStudioAssistantOperation|markStudioAssistantOperationIndeterminate/);
});

test("explicit reconciliation persists an exact owning-domain receipt without replaying the command", () => {
  const service = source("lib/server/studio-assistant-operation-service.ts");
  const route = source("app/api/studio/ask/operations/[id]/route.ts");
  const reconcile = service.slice(
    service.indexOf("export async function persistReconciledStudioAssistantOperation"),
    service.indexOf("export async function confirmStudioAssistantOperation"),
  );

  assert.match(reconcile, /inspectOperationReceipt/);
  assert.match(reconcile, /finishStudioAssistantOperation/);
  assert.doesNotMatch(reconcile, /applyStudioCollectionCommand|runGarmentLifecycleCommand|permanentlyDeleteGarment/);
  assert.match(route, /command\.action === "RECONCILE"/);
  assert.match(route, /persistReconciledStudioAssistantOperation/);
});

test("execution attribution is acquired once and invalid operation ids are client errors", () => {
  const repository = source("lib/server/studio-assistant-operation-repository.ts");
  const route = source("app/api/studio/ask/operations/[id]/route.ts");
  const start = repository.slice(
    repository.indexOf("export async function startStudioAssistantOperation"),
    repository.indexOf("export async function finishStudioAssistantOperation"),
  );
  const finish = repository.slice(
    repository.indexOf("export async function finishStudioAssistantOperation"),
    repository.indexOf("export async function markStudioAssistantOperationIndeterminate"),
  );

  assert.match(start, /executedBySubject: input\.operator\.subject/);
  assert.match(start, /executedByDisplayName: input\.operator\.displayName/);
  assert.doesNotMatch(finish, /executedBy(?:Subject|DisplayName|Email):/);
  assert.match(route, /operationIdSchema\.safeParse/);
  assert.match(route, /"INVALID_REQUEST",\s*400/);
});

test("operation projections redact actor emails from model-visible contracts", () => {
  const contracts = source("lib/studio/assistant/tool-contracts.ts");
  const repository = source("lib/server/studio-assistant-operation-repository.ts");

  assert.doesNotMatch(contracts, /studioAssistantOperationReceiptSchema[\s\S]*?actor:[\s\S]*?email:/);
  assert.doesNotMatch(repository, /return \{ displayName: row\.(?:created|executed)ByDisplayName, email:/);
});
