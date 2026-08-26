import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/studio/draft-direct-captures.tsx", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

function functionBody(name: string, nextName: string) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("capture mutations fail closed until the authoritative workspace read recovers", () => {
  assert.match(source, /type CaptureReadState = \{[\s\S]*status: "LOADING" \| "READY" \| "ERROR";/u);
  assert.match(source, /const workspaceReady = captureRead\.endpoint === target\.endpoint && captureRead\.status === "READY";/u);
  assert.match(source, /const busy = !workspaceReady \|\|/u);
  assert.match(source, /setCaptureRead\(\{[\s\S]*status: "ERROR",[\s\S]*\}\);/u);
  assert.match(source, /workspaceError \? \([\s\S]*role="alert"[\s\S]*onClick=\{retryCaptureRead\}[\s\S]*>Try again<\/button>/u);

  for (const guard of [
    /function choose\([\s\S]*if \(!workspaceReady \|\| !file \|\| busy\) return;/u,
    /async function usePhoto\(\)[\s\S]*if \(!workspaceReady \|\| !preview \|\| savingRole\) return;/u,
    /async function openAi\([\s\S]*if \(!workspaceReady \|\| busy\) return;/u,
    /function chooseAiSource\([\s\S]*if \(!workspaceReady \|\| !file \|\| busy \|\| !aiFlow\) return;/u,
    /function chooseDirectAlternative\([\s\S]*if \(!workspaceReady \|\| !file \|\| busy \|\| !aiFlow\) return;/u,
  ]) assert.match(source, guard);

  assert.match(source, /className="button button-primary" disabled=\{busy\} onClick=\{usePhoto\}/u);
  assert.match(source, /className="studio-ai-discard" disabled=\{busy\} onClick=\{\(\) => void decideAi\("REJECT"\)\}/u);
});

test("AI create, retry, keep and reject share one synchronous command fence", () => {
  const create = functionBody("createAiCandidate", "decideAi");
  const decideStart = source.indexOf("async function decideAi");
  const decideEnd = source.indexOf("if (!requiredRoles.length)", decideStart);
  const decide = source.slice(decideStart, decideEnd);

  assert.match(create, /aiFlow\.step === "MAKING" \|\| aiCommandInFlightRef\.current\) return;/u);
  assert.ok(create.indexOf("aiCommandInFlightRef.current = true") < create.indexOf("await fetch(target.completionEndpoint"));
  assert.match(create, /finally \{\n\s{6}aiCommandInFlightRef\.current = false;\n\s{4}\}/u);

  assert.match(decide, /aiFlow\.step === "MAKING" \|\| aiCommandInFlightRef\.current\) return;/u);
  assert.ok(decide.indexOf("aiCommandInFlightRef.current = true") < decide.indexOf("await fetch("));
  assert.match(decide, /finally \{\n\s{6}aiCommandInFlightRef\.current = false;\n\s{4}\}/u);
  assert.match(source, /decideAi\("RETRY"\)/u);
  assert.match(source, /decideAi\("KEEP"\)/u);
  assert.match(source, /decideAi\("REJECT"\)/u);
});

test("an ambiguous AI create rereads durable state and never replays the paid command", () => {
  const create = functionBody("createAiCandidate", "decideAi");
  const catchStart = create.indexOf("} catch (error) {");
  const finallyStart = create.indexOf("} finally {", catchStart);
  const reconciliation = create.slice(catchStart, finallyStart);

  assert.notEqual(catchStart, -1);
  assert.notEqual(finallyStart, -1);
  assert.match(reconciliation, /resumeAiCompletion\(role, controller, false\)/u);
  assert.match(reconciliation, /No new attempt was started/u);
  assert.match(reconciliation, /step: "REVIEW"/u);
  assert.doesNotMatch(reconciliation, /method: "POST"/u);
  assert.doesNotMatch(reconciliation, /step: "SOURCE"/u);

  const resumeStart = source.indexOf("async function resumeAiCompletion");
  const resumeEnd = source.indexOf("function closeAi", resumeStart);
  const resume = source.slice(resumeStart, resumeEnd);
  assert.match(resume, /await readLatestAiCompletion\(role, controller\.signal\)/u);
  assert.match(resume, /latest\.state === "PENDING"|step: "MAKING"/u);
  assert.match(resume, /latest\.state === "COMPLETE"[\s\S]*step: "REVIEW"/u);
});
