import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const component = read("components/studio/workspace/studio-adaptive-workspace.tsx");
const css = read("app/studio-adaptive-workspace.css");
const dossier = read("components/studio/garment-dossier.tsx");
const dossierLayout = read("app/(studio)/studio/wardrobe/[id]/layout.tsx");
const layout = read("app/(studio)/layout.tsx");
const workbench = read("components/studio/wardrobe-workbench.tsx");

test("adaptive workspace is one persistent, non-modal stage and surface", () => {
  assert.match(component, /type StudioWorkspaceDetent = "peek" \| "half" \| "full"/);
  assert.match(component, /data-studio-workspace-region="stage"/);
  assert.match(component, /<aside[\s\S]*?data-studio-workspace-region="surface"/);
  assert.match(component, /aria-controls=\{surfaceContentId\}/);
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /data-side-surface=\{sideSurface \? "true" : "false"\}/);
  assert.match(component, /hidden=\{sideSurface\}/);
  assert.match(component, /querySelector<HTMLElement>\("\[data-studio-workspace-primary='true'\]"\)/);
  assert.match(component, /ResizeObserver/);
  assert.match(component, /observer\.observe\(root\)/);
  assert.match(component, /return \(\) => observer\.disconnect\(\)/);
  assert.doesNotMatch(component, /--studio-workspace-surface-width/);
  assert.doesNotMatch(component, /<dialog|aria-modal|window\.history|provider|prompt/i);
});

test("Piece route opts in once while the embedded Piece sheet stays compatible", () => {
  assert.match(dossier, /layout="adaptive"/);
  assert.match(workbench, /layout = "embedded"/);
  assert.match(workbench, /if \(adaptive\)[\s\S]*?<StudioAdaptiveWorkspace/);
  assert.match(workbench, /return <section className="studio-draft-manager studio-piece-workspace">/);
  assert.equal(workbench.match(/data-piece-region="canvas"/g)?.length, 1);
  assert.equal(workbench.match(/data-piece-region="workspace"/g)?.length, 1);
  assert.equal(dossier.match(/<PieceWorkspaceView/g)?.length, 1);
  assert.match(workbench, /adaptive \? <h1 className="juw-piece-v2-title">/);
  assert.match(workbench, /data-studio-workspace-primary="true"/);
});

test("responsive posture is capacity-derived and keeps a measured safe canvas", () => {
  assert.match(css, /container-name: studio-adaptive-workspace/);
  assert.match(css, /grid-template-areas: "stage"/);
  assert.match(css, /position: absolute/);
  assert.match(css, /bottom: 0/);
  assert.match(css, /--studio-workspace-surface-height/);
  assert.match(css, /@media \(min-height: 600px\)[\s\S]*?@container studio-adaptive-workspace \(min-width: 60rem\)/);
  assert.match(css, /grid-template-areas: "stage surface"/);
  assert.match(css, /touch-action: pan-y pinch-zoom/);
  assert.match(css, /@media \(max-height: 599px\) and \(orientation: landscape\)[\s\S]*?\.juw-piece-v2-summary \{[\s\S]*?display: contents/);
  assert.match(css, /@media \(max-height: 599px\) and \(orientation: landscape\)[\s\S]*?\[data-detent="full"\][\s\S]*?height: calc\(100% - 8px\)/);
  assert.match(css, /\.juw-piece-v2-summary > p \{[\s\S]*?order: 3/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test("the isolated workspace stylesheet is emitted only at the dossier route boundary", () => {
  assert.match(layout, /<style data-studio-atelier>/);
  assert.doesNotMatch(layout, /studioAdaptiveWorkspaceCss|data-studio-adaptive-workspace-css/);
  assert.match(dossierLayout, /studioAdaptiveWorkspaceCss from "\.\.\/\.\.\/\.\.\/\.\.\/studio-adaptive-workspace\.css\?raw"/);
  assert.match(dossierLayout, /<style data-studio-adaptive-workspace-css>/);
  assert.doesNotMatch(layout, /<style data-studio-adaptive-workspace>/);
});
