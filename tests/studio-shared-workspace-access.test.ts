import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseStudioOperatorMembershipRow } from "../lib/server/studio-operator-membership";
import { projectStudioOperator } from "../lib/server/studio-operator-projection";

const root = process.cwd();
const membershipSource = readFileSync(`${root}/lib/server/studio-operator-membership.ts`, "utf8");
const operatorSource = readFileSync(`${root}/lib/server/studio-operator.ts`, "utf8");
const orderActorsSource = readFileSync(`${root}/lib/shop/server-order/actors.ts`, "utf8");

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const DATA_SUBJECT = "neon-auth:juw-studio-existing-owner";

function adminMembership() {
  const membership = parseStudioOperatorMembershipRow({
    role: "admin",
    workspace_id: WORKSPACE_ID,
    data_subject: DATA_SUBJECT,
  });
  assert.ok(membership);
  return membership;
}

test("Halo and Oluchi remain distinct actors with equal admin access to one JUW Studio", () => {
  const membership = adminMembership();
  const halo = projectStudioOperator({
    actorSubject: "neon-auth:halo",
    email: "halodyrane@gmail.com",
    displayName: "Halo",
    membership,
  });
  const oluchi = projectStudioOperator({
    actorSubject: "neon-auth:oluchi",
    email: "Oluchindukwe2@gmail.com",
    displayName: "Oluchi",
    membership,
  });

  assert.notEqual(halo.actorSubject, oluchi.actorSubject);
  assert.equal(halo.workspaceId, WORKSPACE_ID);
  assert.equal(oluchi.workspaceId, WORKSPACE_ID);
  assert.equal(halo.workspaceSubject, DATA_SUBJECT);
  assert.equal(oluchi.workspaceSubject, DATA_SUBJECT);
  assert.equal(halo.subject, DATA_SUBJECT);
  assert.equal(oluchi.subject, DATA_SUBJECT);
  assert.equal(halo.role, "admin");
  assert.equal(oluchi.role, "admin");
});

test("missing or malformed workspace membership never becomes Studio authority", () => {
  const malformedRows = [
    null,
    {},
    { role: "superadmin", workspace_id: WORKSPACE_ID, data_subject: DATA_SUBJECT },
    { role: "admin", workspace_id: "", data_subject: DATA_SUBJECT },
    { role: "admin", workspace_id: "   ", data_subject: DATA_SUBJECT },
    { role: "admin", workspace_id: WORKSPACE_ID, data_subject: "" },
    { role: "admin", workspace_id: WORKSPACE_ID, data_subject: "   " },
  ];
  for (const row of malformedRows) assert.equal(parseStudioOperatorMembershipRow(row), null);
});

test("membership lookup remains exact, active-only and fail-closed", () => {
  assert.match(membershipSource, /membership\.auth_subject = \$1/);
  assert.match(membershipSource, /lower\(membership\.email\) = lower\(\$2\)/);
  assert.match(membershipSource, /membership\.active = true/);
  assert.match(membershipSource, /join studio_workspaces/i);
  assert.match(membershipSource, /workspace_id/);
  assert.match(membershipSource, /data_subject/);

  const denied = operatorSource.slice(
    operatorSource.indexOf("if (!membership)"),
    operatorSource.indexOf("return projectStudioOperator"),
  );
  assert.match(denied, /OPERATOR_FORBIDDEN/);
  assert.match(denied, /403/);
  assert.doesNotMatch(operatorSource, /role:\s*"superadmin"|"superadmin"\s*as const/);
});

test("order mutations attribute the authenticated actor, not the shared data namespace", () => {
  const resolver = orderActorsSource.slice(orderActorsSource.indexOf("export async function resolveOperatorActor"));
  assert.match(resolver, /subject: operator\.actorSubject/);
  assert.doesNotMatch(resolver, /subject: operator\.subject/);
});
