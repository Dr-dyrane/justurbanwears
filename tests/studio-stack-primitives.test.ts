import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const stackPage = readFileSync(join(root, "components/studio/atoms/studio-stack-page.tsx"), "utf8");
const feedback = readFileSync(join(root, "components/studio/atoms/studio-feedback.tsx"), "utf8");

test("Studio stack primitives expose the shared service, record, and workflow grammar", () => {
  assert.match(stackPage, /StudioStackPageKind = "service" \| "record" \| "workflow"/);
  assert.match(stackPage, /data-studio-stack-kind=\{kind\}/);
  assert.match(stackPage, /studio-stack-page/);
  assert.match(stackPage, /studio-stack-section/);
  assert.match(stackPage, /title\?: ReactNode/);
  assert.match(stackPage, /title === undefined \? null : <h2>/);
  assert.match(stackPage, /action\?: ReactNode/);
});

test("Studio feedback gives every terminal state an accessible announcement", () => {
  assert.match(feedback, /StudioFeedbackState = "loading" \| "success" \| "error" \| "empty"/);
  assert.match(feedback, /aria-atomic="true"/);
  assert.match(feedback, /aria-busy=\{state === "loading" \|\| undefined\}/);
  assert.match(feedback, /aria-live=\{isError \? "assertive" : "polite"\}/);
  assert.match(feedback, /role=\{isError \? "alert" : "status"\}/);
});

test("loading feedback uses the canonical JUW motion without a second live region", () => {
  assert.match(feedback, /state === "loading"/);
  assert.match(feedback, /<WardrobeMotion/);
  assert.match(feedback, /artwork="logo"/);
  assert.match(feedback, /variant="loader"/);
  assert.doesNotMatch(feedback, /<WardrobeMotion[\s\S]*?label=/);
});
