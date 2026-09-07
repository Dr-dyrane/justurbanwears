import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindStudioVisualViewport } from "../lib/studio/ui/visual-viewport";

function fixture() {
  const values = new Map<string, string>();
  const element = { style: {
    getPropertyValue: (name: string) => values.get(name) ?? "",
    getPropertyPriority: () => "",
    setProperty: (name: string, value: string) => values.set(name, value),
    removeProperty: (name: string) => values.delete(name),
  } } as unknown as HTMLElement;
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  const dispose = bindStudioVisualViewport(element, viewport as unknown as VisualViewport);
  return { values, viewport, dispose };
}

test("visible height and panning follow keyboard open and dismissal", () => {
  const { values, viewport, dispose } = fixture();
  assert.equal(values.get("--studio-visual-height"), "800px");
  viewport.height = 360;
  viewport.dispatchEvent(new Event("resize"));
  assert.equal(values.get("--studio-visual-height"), "360px");
  viewport.offsetTop = 125;
  viewport.dispatchEvent(new Event("scroll"));
  assert.equal(values.get("--studio-visual-top"), "125px");
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  viewport.dispatchEvent(new Event("resize"));
  assert.equal(values.get("--studio-visual-height"), "800px");
  assert.equal(values.get("--studio-visual-top"), "0px");
  dispose();
  assert.equal(values.size, 0);
  viewport.dispatchEvent(new Event("resize"));
  assert.equal(values.size, 0, "unmounted routes retain no listener or style override");
});

test("pinch zoom does not shrink the app's existing layout", () => {
  const { values, viewport, dispose } = fixture();
  Object.assign(viewport, { height: 400, offsetTop: 50, scale: 2 });
  viewport.dispatchEvent(new Event("resize"));
  viewport.dispatchEvent(new Event("scroll"));
  assert.equal(values.get("--studio-visual-height"), "800px");
  assert.equal(values.get("--studio-visual-top"), "0px");
  dispose();
});

test("Ask owns its scroll area and excludes the legacy page-bottom reserve", () => {
  const css = readFileSync("app/studio-stack-navigation.css", "utf8");
  const surface = readFileSync("components/studio/navigation/studio-ask-surface.tsx", "utf8");
  assert.match(css, /\.studio-ask-thread \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /main\.page-canvas\.studio-native-canvas:has\(> \.studio-ask-page\) \{[^}]*overflow: hidden;[^}]*padding-block: 0;/);
  assert.match(css, /height: var\(--studio-visual-height, 100dvh\)/);
  assert.match(css, /top: var\(--studio-visual-top, 0px\)/);
  assert.match(surface, /return bindStudioVisualViewport\(shell, window.visualViewport\)/);
  assert.match(surface, /async function loadEarlierMessages\(\)[\s\S]*?const scroller = endRef.current\?\.closest\("\.studio-ask-thread"\);[\s\S]*?scroller.scrollTop = previousTop \+ Math.max\(0, scroller.scrollHeight - previousHeight\)/);
  assert.doesNotMatch(surface, /closest\("main"\)/);
  assert.doesNotMatch(css, /\.studio-ask-page \{[^}]*min-height: calc\(100dvh/);
});
