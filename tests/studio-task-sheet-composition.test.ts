import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskSheet = readFileSync("components/studio/atoms/studio-task-sheet.tsx", "utf8");
const atelier = readFileSync("components/studio/model-atelier.tsx", "utf8");
const operations = readFileSync("components/studio/operations-desk.tsx", "utf8");
const lifecycleBadge = readFileSync("components/studio/atoms/lifecycle-badge.tsx", "utf8");

test("StudioTaskSheet remains the sole owner of its scroll body", () => {
  assert.match(taskSheet, /<form className="studio-task-sheet-body" onSubmit=\{onSubmit\}>\{content\}<\/form>/u);
  assert.match(taskSheet, /<div className="studio-task-sheet-body">\{content\}<\/div>/u);
  assert.match(taskSheet, /children\(\{ requestClose, requestCloseAndThen \}\)/u);
  assert.doesNotMatch(atelier, /<form(?:\s|>)/u);
  assert.doesNotMatch(operations, /<form(?:\s|>)/u);
  assert.match(atelier, /<StudioTaskSheet[\s\S]*?onSubmit=\{save\}/u);
  assert.match(atelier, /<StudioTaskSheet[\s\S]*?onSubmit=\{archiveModel\}/u);
  assert.match(operations, /<StudioTaskSheet[\s\S]*?onSubmit=\{saveHold\}/u);
});

test("task-sheet dismissal, progress, and focus semantics remain guarded", () => {
  assert.match(taskSheet, /useDocumentScrollLock\(open\)/u);
  assert.match(taskSheet, /useHistoryBackedDialog/u);
  assert.match(taskSheet, /aria-modal="true"/u);
  assert.match(taskSheet, /role="progressbar"/u);
  assert.match(taskSheet, /onClose=\{restoreFocus\}/u);
});

test("LifecycleBadge delegates operator wording to LifecycleMeta", () => {
  assert.match(lifecycleBadge, /import \{ LifecycleMeta \} from "\.\/lifecycle-meta"/u);
  assert.match(lifecycleBadge, /<LifecycleMeta[\s\S]*?state=\{state\}/u);
  assert.doesNotMatch(lifecycleBadge, />\s*\{state\.toLowerCase\(\)\}\s*<\//u);
});
