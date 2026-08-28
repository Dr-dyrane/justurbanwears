import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the panel is read-only, single-flight, progressively disclosed, and retains legacy fallback", () => {
  const source = readFileSync(
    new URL("../components/studio/atelier/studio-atelier-eligibility-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /requestInFlightRef\.current/);
  assert.match(source, /AbortController/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /<details className="studio-piece-shop studio-atelier-eligibility">/);
  assert.match(source, /<summary className="studio-draft-media-action">/);
  assert.match(source, /<div className="studio-draft-readiness">/);
  assert.match(source, /10-stage status/);
  assert.match(source, /Continue with current photos/);
  assert.match(source, /Use current photos/);
  assert.match(source, /href=\{recoveryStage\.operation\.recoveryHref\}/);
  assert.match(source, /selectStudioAtelierRecovery/);
  assert.match(source, /selectStudioAtelierBlocker/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(source, /\/prepare|\/run|\/decision/);
});
