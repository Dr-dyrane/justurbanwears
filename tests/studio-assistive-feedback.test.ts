import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("Ask Studio announces both reply progress and completion", async () => {
  const ask = await readFile(path.join(root, "components/studio/navigation/studio-ask-surface.tsx"), "utf8");

  assert.match(ask, /const \[replyAnnouncement, setReplyAnnouncement\] = useState\(""\)/);
  assert.match(ask, /"Ask Studio reply ready\."/);
  assert.match(ask, /aria-live="polite"[\s\S]*?replyAnnouncement/);
  assert.match(ask, /setReplyAnnouncement\(""\)[\s\S]*?sendMessage/);
});

test("Studio dialogs are named, restore focus, and keep mobile media controls tappable", async () => {
  const [taskSheet, mediaViewer, localIntake, foundation] = await Promise.all([
    readFile(path.join(root, "components/studio/atoms/studio-task-sheet.tsx"), "utf8"),
    readFile(path.join(root, "components/studio/media-viewer.tsx"), "utf8"),
    readFile(path.join(root, "components/studio/garment-intake/local-garment-intake-dialog.tsx"), "utf8"),
    readFile(path.join(root, "app/foundation.css"), "utf8"),
  ]);

  for (const source of [taskSheet, mediaViewer, localIntake]) {
    assert.match(source, /<dialog[\s\S]*?aria-labelledby=/);
  }
  assert.match(taskSheet, /onClose=\{restoreFocus\}/);
  assert.match(taskSheet, /returnFocus\?\.isConnected/);
  assert.match(mediaViewer, /origin\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(foundation, /\.studio-media-viewer-stage \{ grid-template-columns: 44px minmax\(0, 1fr\) 44px; \}/);
  assert.match(foundation, /\.studio-media-viewer-stage > button \{ height: 44px; width: 44px; \}/);
});
