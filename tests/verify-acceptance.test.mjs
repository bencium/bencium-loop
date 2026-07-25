// The accelerated ACCEPTANCE walk. Its output is folded into the verify report "exactly as
// if you had walked them serially", so the one thing it must never do is return fewer rows
// than it was given — a missing row reads as a row that was never in the list.

import test from "node:test";
import assert from "node:assert/strict";
import { runWorkflow, deadAgent, scriptedAgent } from "./harness.mjs";

const rows = [
  { text: "All list endpoints paginated" },
  { text: "No secrets in repo" },
  { text: "Health check returns 200" },
];

const verify = (args, agent) => runWorkflow("verify-acceptance.mjs", { args, agent });
const args = { rows, diff: "(diff)", verifyOutput: "(output)" };

test("a dead evaluator does not delete the row", async () => {
  const agent = scriptedAgent({
    "eval:All list endpoints": { status: "pass", evidence: "4 routes use limit/offset" },
    "eval:No secrets": { status: "pass", evidence: "no matches for sk_live_" },
    // the third row's evaluator dies
    "refute:": { refuted: false, reason: "holds up" },
  });

  const result = await verify(args, agent);

  assert.equal(result.items.length, 3, "a row must never vanish from the report");
  const lost = result.items.find((i) => i.text === "Health check returns 200");
  assert.equal(lost.status, "fail");
  assert.match(lost.evidence, /no result/);
  assert.equal(result.unverified, 1);
});

test("every evaluator dying leaves three failed rows, not an empty report", async () => {
  const result = await verify(args, deadAgent);

  assert.equal(result.items.length, 3);
  assert.equal(result.fail, 3);
  assert.equal(result.pass, 0);
  assert.equal(result.unverified, 3);
});

test("a refuted PASS becomes a FAIL carrying the refutation", async () => {
  const agent = scriptedAgent({
    "eval:": { status: "pass", evidence: "tests green" },
    "refute:All list endpoints": { refuted: true, reason: "assertion narrowed to expect(true)" },
    "refute:": { refuted: false, reason: "holds up" },
  });

  const result = await verify(args, agent);

  const refuted = result.items.find((i) => i.text === "All list endpoints paginated");
  assert.equal(refuted.status, "fail");
  assert.match(refuted.evidence, /^refuted: assertion narrowed/);
  assert.match(refuted.evidence, /was: tests green/);
  assert.equal(result.pass, 2);
  assert.equal(result.fail, 1);
});

test("a dead skeptic leaves the PASS unconfirmed, so it fails", async () => {
  const agent = scriptedAgent({
    "eval:": { status: "pass", evidence: "tests green" },
    // every refuter dies — nothing was checked, so nothing is confirmed
  });

  const result = await verify(args, agent);

  assert.equal(result.pass, 0);
  assert.equal(result.fail, 3);
  assert.equal(result.unverified, 3);
});

test("a FAIL from the evaluator skips the skeptic entirely", async () => {
  const agent = scriptedAgent({
    "eval:": { status: "fail", evidence: "no pagination on /api/items" },
    "refute:": { refuted: false, reason: "should never run" },
  });

  const result = await verify(args, agent);

  assert.equal(result.fail, 3);
  assert.equal(result.agents, 3, "three evaluators, no refuters — nothing passed to refute");
});

test("agent count reflects the refuters actually spawned", async () => {
  const agent = scriptedAgent({
    "eval:All list endpoints": { status: "pass", evidence: "paginated" },
    "eval:No secrets": { status: "fail", evidence: "sk_live_ in config.ts:4" },
    "eval:Health check": { status: "skip", evidence: "no deploy yet" },
    "refute:": { refuted: false, reason: "holds up" },
  });

  const result = await verify(args, agent);

  assert.equal(result.pass, 1);
  assert.equal(result.fail, 1);
  assert.equal(result.skip, 1);
  assert.equal(result.agents, 4, "three evaluators plus one refuter for the single pass");
});
