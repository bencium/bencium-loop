// The deployed-env smoke workflow is the last gate before a feature is called shipped.
// Every case here is a way it could report green without having proved anything.

import test from "node:test";
import assert from "node:assert/strict";
import { runWorkflow, deadAgent, scriptedAgent } from "./harness.mjs";

const rows = [
  { text: "Upload works at {{deploy_url}}" },
  { text: "No console errors on deployed page load" },
  { text: "UI loading/error states visible" },
];

const smoke = (args, agent) => runWorkflow("smoke-deployed.mjs", { args, agent });

test("every agent dying is a FAIL, not an empty-array PASS", async () => {
  const result = await smoke({ rows, deployUrl: "https://app.example.com" }, deadAgent);

  assert.equal(result.result, "fail");
  assert.equal(result.unverified, 3);
  assert.equal(result.rows.length, 3, "a row must never vanish from the report");
  assert.ok(result.rows.every((row) => row.status === "fail"));
});

test("one dead agent among passes is still a FAIL", async () => {
  const agent = scriptedAgent({
    "smoke:Upload works": { status: "pass", evidence: "POST /api/upload → 200" },
    "smoke:No console errors": { status: "pass", evidence: "GET / → 200, no error markers" },
    // the third row's agent dies
  });

  const result = await smoke({ rows, deployUrl: "https://app.example.com" }, agent);

  assert.equal(result.result, "fail");
  assert.equal(result.unverified, 1);
  assert.equal(result.rows.length, 3);
});

test("no rows is a FAIL — the command handles the genuine no-rows case before invoking", async () => {
  const result = await smoke({ rows: [], deployUrl: "https://app.example.com" }, deadAgent);

  assert.equal(result.result, "fail");
});

test("a single failing row fails the run", async () => {
  const agent = scriptedAgent({
    "smoke:Upload works": { status: "pass", evidence: "POST /api/upload → 200" },
    "smoke:No console errors": { status: "fail", evidence: "GET / → Uncaught TypeError inline" },
    "smoke:UI loading": { status: "pass", evidence: "spinner present on submit" },
  });

  const result = await smoke({ rows, deployUrl: "https://app.example.com" }, agent);

  assert.equal(result.result, "fail");
  assert.equal(result.unverified, 0);
});

test("a skipped row is PARTIAL — not a silent pass, not a failure", async () => {
  const agent = scriptedAgent({
    "smoke:Upload works": { status: "pass", evidence: "POST /api/upload → 200" },
    "smoke:No console errors": { status: "pass", evidence: "GET / → 200, no error markers" },
    "smoke:UI loading": { status: "skip", evidence: "no fixture for the forced-500 path" },
  });

  const result = await smoke({ rows, deployUrl: "https://app.example.com" }, agent);

  assert.equal(result.result, "partial");
  assert.equal(result.unverified, 0);
});

test("all rows passing is the only PASS", async () => {
  const agent = scriptedAgent({
    "smoke:": { status: "pass", evidence: "live-URL evidence" },
  });

  const result = await smoke({ rows, deployUrl: "https://app.example.com" }, agent);

  assert.equal(result.result, "pass");
  assert.equal(result.agents, 3);
});
