import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { moveFocusFromWorkspaceGrip } from "../components/studio/workspace/studio-workspace-focus";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const component = read("components/studio/workspace/studio-adaptive-workspace.tsx");
const css = read("app/studio-adaptive-workspace.css");
const dossier = read("components/studio/garment-dossier.tsx");
const focusHelper = read("components/studio/workspace/studio-workspace-focus.ts");
const layout = read("app/(studio)/layout.tsx");
const orderDetail = read("components/studio/connected-order-detail.tsx");
const orderWorkspace = read("components/studio/orders/studio-order-adaptive-workspace.tsx");
const workbench = read("components/studio/wardrobe-workbench.tsx");

test("adaptive workspace is one persistent, non-modal stage and surface", () => {
  assert.match(component, /type StudioWorkspaceDetent = "peek" \| "half" \| "full"/);
  assert.match(component, /data-studio-workspace-region="stage"/);
  assert.match(component, /<aside[\s\S]*?data-studio-workspace-region="surface"/);
  assert.match(component, /aria-controls=\{surfaceContentId\}/);
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /data-side-surface=\{sideSurface \? "true" : "false"\}/);
  assert.match(component, /hidden=\{sideSurface\}/);
  assert.match(component, /active = true/);
  assert.match(component, /data-studio-adaptive-workspace=\{active \? "true" : undefined\}/);
  assert.match(component, /moveFocusFromWorkspaceGrip\(surfaceContentRef\.current, gripButtonRef\.current\)/);
  assert.match(focusHelper, /\[data-studio-workspace-primary='true'\]:not\(:disabled\)/);
  assert.match(component, /ResizeObserver/);
  assert.match(component, /observer\.observe\(root\)/);
  assert.match(component, /return \(\) => observer\.disconnect\(\)/);
  assert.doesNotMatch(component, /--studio-workspace-surface-width/);
  assert.doesNotMatch(component, /<dialog|aria-modal|window\.history|provider|prompt/i);
});

test("focus moves to an enabled surface control before the mobile grip is hidden", () => {
  const grip = {} as HTMLElement;
  const enabledControl = {} as HTMLElement;
  let activeElement: Element | null = grip;
  const selectors: string[] = [];
  enabledControl.focus = () => { activeElement = enabledControl; };
  const content = {
    focus: () => { activeElement = content as unknown as HTMLElement; },
    querySelector: (selector: string) => {
      selectors.push(selector);
      return selector.includes("data-studio-workspace-primary") ? null : enabledControl;
    },
  } as unknown as HTMLElement;

  assert.equal(moveFocusFromWorkspaceGrip(content, grip, () => activeElement), true);
  assert.equal(activeElement, enabledControl);
  assert.match(selectors[0], /:not\(:disabled\)/);
  assert.match(selectors[1], /button:not\(:disabled\)/);
});

test("focus falls back to the surface content when no enabled control exists", () => {
  const grip = {} as HTMLElement;
  let activeElement: Element | null = grip;
  const content = {
    focus: () => { activeElement = content as unknown as HTMLElement; },
    querySelector: () => null,
  } as unknown as HTMLElement;

  assert.equal(moveFocusFromWorkspaceGrip(content, grip, () => activeElement), true);
  assert.equal(activeElement, content);
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

test("Order detail keeps one versioned controller inside one adaptive workspace", () => {
  assert.match(orderDetail, /<StudioOrderAdaptiveWorkspace order=\{order\}>/);
  assert.equal(orderDetail.match(/action\(primaryTransition\)/g)?.length, 1);
  assert.match(orderDetail, /key=\{`\$\{transitionKey\(transition\)\}:\$\{order\.version\}`\}/);
  assert.match(orderDetail, /data-studio-workspace-primary=\{isNextAction \? "true" : undefined\}/);
  assert.match(orderWorkspace, /<StudioAdaptiveWorkspace/);
  assert.match(orderWorkspace, /stage=\{stage\}/);
  assert.match(orderWorkspace, /orderStateSummary\(order\)/);
  assert.doesNotMatch(orderWorkspace, /window|matchMedia|innerWidth|fetch\(/);
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
  assert.match(css, /@media \(max-height: 680px\) and \(orientation: portrait\)[\s\S]*?--studio-workspace-surface-fallback: 248px/);
  assert.match(css, /@media \(max-height: 680px\) and \(orientation: portrait\)[\s\S]*?\.juw-order-v2-heading > p[\s\S]*?display: none/);
  assert.match(css, /html:has\(\[data-studio-adaptive-workspace="true"\]\)[\s\S]*?overflow: hidden/);
  assert.match(css, /\.juw-piece-v2-summary > p \{[\s\S]*?order: 3/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.juw-order-v2-overview/);
  assert.match(css, /\.juw-order-v2-content \.studio-connected-detail-grid,[\s\S]*?grid-template-columns: 1fr/);
  assert.match(css, /\.juw-order-v2-content \.studio-connected-order-summary \{[\s\S]*?position: static/);
  assert.match(css, /@media \(max-height: 599px\) and \(orientation: landscape\)[\s\S]*?\.studio-adaptive-workspace-grip,\s*\.studio-adaptive-workspace-grip > button \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.studio-adaptive-workspace-grip > button > small \{[\s\S]*?font-size: 12px/);
  assert.match(css, /\.juw-intake-v2-stage-copy small \{[\s\S]*?font-size: 12px/);
});

test("the shared workspace stylesheet is emitted once at the Studio boundary", () => {
  assert.match(layout, /<style data-studio-atelier>/);
  assert.match(layout, /studioAdaptiveWorkspaceCss from "\.\.\/studio-adaptive-workspace\.css\?raw"/);
  assert.equal(layout.match(/<style data-studio-adaptive-workspace-css>/g)?.length, 1);
});
