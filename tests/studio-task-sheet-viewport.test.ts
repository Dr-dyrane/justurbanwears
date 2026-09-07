import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindStudioTaskSheetViewport } from "../lib/studio/ui/task-sheet-viewport";

test("canonical sheets center on desktop while mobile viewport placement overrides remain", () => {
  const foundation = readFileSync(`${process.cwd()}/app/foundation.css`, "utf8");
  const stack = readFileSync(`${process.cwd()}/app/studio-stack-navigation.css`, "utf8");
  const canonical = foundation.match(/^\.studio-task-sheet\s*\{([^}]+)\}/m)?.[1] ?? "";
  assert.match(canonical, /(?:^|;)\s*margin:\s*auto\s*;/);
  const mobile = stack.match(/@media\s*\(max-width:\s*760px\)\s*\{\s*body \.studio-task-sheet\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(mobile, /height:\s*calc\(var\(--studio-visual-height, 100dvh\) - 12px\);/);
  assert.match(mobile, /inset-block:\s*calc\(var\(--studio-visual-top, 0px\) \+ 12px\) auto;/);
  assert.match(mobile, /margin-block:\s*0;/);
  assert.match(mobile, /min-height:\s*0;/);
});

type Owner = {
  parentElement: Owner | null;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  overflowY: string;
  getBoundingClientRect(): { top: number; bottom: number };
};

function fixture(previousHeight?: string) {
  const values = new Map<string, { value: string; priority: string }>();
  if (previousHeight) values.set("--studio-visual-height", { value: previousHeight, priority: "important" });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const view = {
    innerWidth: 390,
    getComputedStyle: (owner: Owner) => ({ overflowY: owner.overflowY }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const document = { defaultView: view, activeElement: null as unknown };
  const dialog = Object.assign(new EventTarget(), {
    open: true,
    ownerDocument: document,
    parentElement: null,
    scrollTop: 0,
    style: {
      getPropertyValue: (name: string) => values.get(name)?.value ?? "",
      getPropertyPriority: (name: string) => values.get(name)?.priority ?? "",
      setProperty: (name: string, value: string, priority = "") => values.set(name, { value, priority }),
      removeProperty: (name: string) => values.delete(name),
    },
  });
  const parentScroll = (parent: Owner | null): number => {
    let offset = 0;
    for (let owner = parent; owner; owner = owner.parentElement) offset += owner.scrollTop;
    return offset;
  };
  const makeOwner = (parentElement: Owner, top: number, bottom: number): Owner => ({
    parentElement,
    scrollTop: 0,
    scrollHeight: 1200,
    clientHeight: bottom - top,
    overflowY: "auto",
    getBoundingClientRect() {
      const offset = parentScroll(this.parentElement);
      return { top: top - offset, bottom: bottom - offset };
    },
  });
  const body = makeOwner(dialog as unknown as Owner, 80, 760);
  const field = {
    parentElement: body,
    dialogOwner: dialog as unknown,
    top: 420,
    bottom: 460,
    editable: true,
    matches: () => field.editable,
    closest: () => field.dialogOwner,
    getBoundingClientRect() {
      const offset = parentScroll(this.parentElement);
      return { top: this.top - offset, bottom: this.bottom - offset };
    },
  };
  document.activeElement = field;
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  const dispose = bindStudioTaskSheetViewport(dialog as unknown as HTMLDialogElement, viewport as unknown as VisualViewport);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  return { body, dialog, field, frames, makeOwner, view, viewport, values, dispose, flush };
}

test("keyboard resize and subsequent focus reveal the field inside the sheet body", () => {
  const f = fixture();
  f.flush();
  assert.equal(f.body.scrollTop, 0);
  f.viewport.height = 320;
  f.viewport.dispatchEvent(new Event("resize"));
  assert.equal(f.values.get("--studio-visual-height")?.value, "320px");
  assert.equal(f.body.scrollTop, 0, "reveal waits until the resized layout can be measured");
  f.flush();
  assert.equal(f.body.scrollTop, 152);
  assert.equal(f.field.getBoundingClientRect().bottom, 308);

  Object.assign(f.field, { top: 620, bottom: 680 });
  f.dialog.dispatchEvent(new Event("focusin"));
  f.viewport.dispatchEvent(new Event("resize"));
  assert.equal(f.frames.size, 1, "focus and viewport events share one pending frame");
  f.flush();
  assert.equal(f.field.getBoundingClientRect().bottom, 308);
  f.dispose();
});

test("viewport panning reveals a field above the visible scrollport", () => {
  const f = fixture();
  f.body.scrollTop = 100;
  Object.assign(f.field, { top: 200, bottom: 240 });
  Object.assign(f.viewport, { offsetTop: 125, height: 320 });
  f.viewport.dispatchEvent(new Event("scroll"));
  f.flush();
  assert.equal(f.body.scrollTop, 63);
  assert.equal(f.field.getBoundingClientRect().top, 137);
  assert.equal(f.dialog.scrollTop, 0);
  f.dispose();
});

test("adaptive controls use their nearest scrollable owner rather than the sheet body", () => {
  const f = fixture();
  const inner = f.makeOwner(f.body, 100, 360);
  f.field.parentElement = inner;
  f.flush();
  assert.equal(inner.scrollTop, 112);
  assert.equal(f.body.scrollTop, 0);
  assert.equal(f.dialog.scrollTop, 0);
  f.dispose();
});

test("outside, nested-dialog and non-field focus never move the parent sheet", () => {
  const f = fixture();
  f.viewport.height = 320;
  for (const owner of [null, new EventTarget()]) {
    f.field.dialogOwner = owner;
    f.dialog.dispatchEvent(new Event("focusin"));
    f.flush();
    assert.equal(f.body.scrollTop, 0);
  }
  f.field.dialogOwner = f.dialog;
  f.field.editable = false;
  f.dialog.dispatchEvent(new Event("focusin"));
  f.flush();
  assert.equal(f.body.scrollTop, 0);
  f.field.editable = true;
  f.body.overflowY = "hidden";
  f.dialog.dispatchEvent(new Event("focusin"));
  f.flush();
  assert.equal(f.body.scrollTop, 0, "no local scroll owner does not fall back to document scrolling");
  assert.equal(f.dialog.scrollTop, 0);
  f.dispose();
});

test("desktop, pinch zoom and closed sheets do not force focused-field scrolling", () => {
  const f = fixture();
  f.viewport.height = 320;
  for (const [width, scale, open] of [[1200, 1, true], [390, 2, true], [390, 1, false]] as const) {
    f.view.innerWidth = width;
    f.viewport.scale = scale;
    f.dialog.open = open;
    f.viewport.dispatchEvent(new Event("resize"));
    f.flush();
    assert.equal(f.body.scrollTop, 0);
  }
  f.dispose();
});

test("disposal cancels reveal work, removes listeners and restores prior viewport styles", () => {
  const f = fixture("75vh");
  f.viewport.height = 320;
  f.viewport.dispatchEvent(new Event("resize"));
  assert.equal(f.frames.size, 1);
  f.dispose();
  assert.equal(f.frames.size, 0);
  assert.deepEqual(f.values.get("--studio-visual-height"), { value: "75vh", priority: "important" });
  assert.equal(f.values.has("--studio-visual-top"), false);
  f.dialog.dispatchEvent(new Event("focusin"));
  f.viewport.dispatchEvent(new Event("resize"));
  f.viewport.dispatchEvent(new Event("scroll"));
  f.flush();
  assert.equal(f.frames.size, 0);
  assert.equal(f.body.scrollTop, 0);
  assert.deepEqual(f.values.get("--studio-visual-height"), { value: "75vh", priority: "important" });
});
