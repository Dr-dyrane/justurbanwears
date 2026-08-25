import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const fullPageLoadingSurfaces = [
  "components/studio/studio-home.tsx",
  "components/studio/wardrobe-workbench.tsx",
  "components/studio/garment-dossier.tsx",
  "components/studio/navigation/studio-ask-surface.tsx",
  "components/studio/stocktake-workspace.tsx",
  "components/studio/model-atelier.tsx",
  "components/studio/operations-desk.tsx",
  "components/studio/connected-order-inbox.tsx",
  "components/studio/connected-order-detail.tsx",
  "components/shoot/shoot-gallery.tsx",
  "components/shoot/shoot-composer.tsx",
  "components/shoot/shoot-detail.tsx",
] as const;

test("Studio loading stage uses the canonical animated JUW mark accessibly", () => {
  const loadingStage = source("components/studio/atoms/studio-loading-stage.tsx");
  assert.match(loadingStage, /<WardrobeMotion loop polarity="auto" size="sm" variant="loader"/);
  assert.match(loadingStage, /aria-atomic="true"/);
  assert.match(loadingStage, /aria-busy="true"/);
  assert.match(loadingStage, /aria-live="polite"/);
  assert.match(loadingStage, /role="status"/);
});

test("every active Studio full-page wait uses the shared branded stage", () => {
  for (const path of fullPageLoadingSurfaces) {
    const contents = source(path);
    assert.match(contents, /StudioLoadingStage/, `${path} must use StudioLoadingStage`);
    assert.doesNotMatch(contents, /className="studio-loading"/, `${path} must not recreate the loader`);
  }
});

test("the Studio route segment owns a branded navigation fallback", () => {
  const routeLoading = source("app/(studio)/loading.tsx");
  assert.match(routeLoading, /StudioLoadingStage/);
  assert.match(routeLoading, /Opening Lulu Studio…/);
});
