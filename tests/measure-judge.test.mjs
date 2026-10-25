// The verdict rules for measured performance and usability, without a browser. If these are
// wrong, the deploy gate refuses good code or waves through slow, inaccessible code.

import test from "node:test";
import assert from "node:assert/strict";
import { judge } from "../bencium-loop/measure/judge.mjs";

const config = {
  pages: ["/"],
  budgets: { lcp_ms: 2500, cls: 0.1, a11y_serious: 0 },
  journeys: [{ name: "signup", max_ms: 5000, max_steps: 5 }],
  drift_pct: 15,
};

const goodPage = { lcp_ms: 1000, fcp_ms: 600, cls: 0.01, tbt_ms: 0, a11y_serious: 0, a11y_moderate: 1 };
const goodJourney = { ok: true, total_ms: 2000, steps: 3 };
const run = (page = goodPage, journey = goodJourney) => ({ pages: { "/": page }, journeys: { signup: journey } });

const levels = (result) => result.findings.map((f) => `${f.level}:${f.where}:${f.metric}`);

test("inside every budget with no history passes", () => {
  assert.deepEqual(judge({ config, current: run() }), { result: "pass", findings: [] });
});

test("over a budget fails", () => {
  const result = judge({ config, current: run({ ...goodPage, lcp_ms: 3100 }) });
  assert.equal(result.result, "fail");
  assert.deepEqual(levels(result), ["fail:/:lcp_ms"]);
});

test("an accessibility violation over budget fails", () => {
  const result = judge({ config, current: run({ ...goodPage, a11y_serious: 2 }) });
  assert.deepEqual(levels(result), ["fail:/:a11y_serious"]);
});

test("a budgeted metric that was not measured fails rather than passing by default", () => {
  const { cls, ...withoutCls } = goodPage;
  const result = judge({ config, current: run(withoutCls) });
  assert.deepEqual(levels(result), ["fail:/:cls"]);
});

test("a page that could not be loaded fails", () => {
  const result = judge({ config, current: run({ error: "net::ERR_CONNECTION_REFUSED" }) });
  assert.deepEqual(levels(result), ["fail:/:page"]);
});

test("a run that could not start at all fails", () => {
  const result = judge({ config, current: { error: "server never answered at http://localhost:3000" } });
  assert.equal(result.result, "fail");
});

test("getting clearly slower but staying inside budget warns", () => {
  const history = [run()];
  const result = judge({ config, current: run({ ...goodPage, lcp_ms: 1400 }), history });
  assert.equal(result.result, "warn");
  assert.deepEqual(levels(result), ["warn:/:lcp_ms"]);
});

test("a big percentage rise below the absolute floor is treated as noise", () => {
  const history = [run({ ...goodPage, tbt_ms: 10 })];
  const result = judge({ config, current: run({ ...goodPage, tbt_ms: 40 }), history });
  assert.equal(result.result, "pass");
});

test("a small percentage rise above the floor is treated as noise", () => {
  const history = [run({ ...goodPage, lcp_ms: 2000 })];
  const result = judge({ config, current: run({ ...goodPage, lcp_ms: 2200 }), history });
  assert.equal(result.result, "pass");
});

test("any rise in an accessibility count warns, even inside budget", () => {
  const history = [run()];
  const result = judge({ config, current: run({ ...goodPage, a11y_moderate: 2 }), history });
  assert.deepEqual(levels(result), ["warn:/:a11y_moderate"]);
});

test("drift compares with the last run that actually measured the metric", () => {
  const history = [run({ ...goodPage, lcp_ms: 1000 }), { error: "server down" }];
  const result = judge({ config, current: run({ ...goodPage, lcp_ms: 1400 }), history });
  assert.deepEqual(levels(result), ["warn:/:lcp_ms"]);
});

test("a broken journey fails and names the step it broke at", () => {
  const result = judge({ config, current: run(goodPage, { ok: false, total_ms: 900, steps: 2, error: "button not found" }) });
  assert.deepEqual(levels(result), ["fail:journey:signup:journey"]);
  assert.match(result.findings[0].message, /step 3: button not found/);
});

test("a journey over its time or step budget fails", () => {
  const slow = judge({ config, current: run(goodPage, { ok: true, total_ms: 6000, steps: 3 }) });
  assert.deepEqual(levels(slow), ["fail:journey:signup:journey_ms"]);
  const long = judge({ config, current: run(goodPage, { ok: true, total_ms: 2000, steps: 7 }) });
  assert.deepEqual(levels(long), ["fail:journey:signup:steps"]);
});

test("a configured journey that never ran fails", () => {
  const result = judge({ config, current: { pages: { "/": goodPage }, journeys: {} } });
  assert.deepEqual(levels(result), ["fail:journey:signup:journey"]);
});

test("a journey getting clearly slower warns", () => {
  const history = [run()];
  const result = judge({ config, current: run(goodPage, { ok: true, total_ms: 3000, steps: 3 }), history });
  assert.deepEqual(levels(result), ["warn:journey:signup:journey_ms"]);
});

test("a metric over budget is reported once, as a fail, not also as drift", () => {
  const history = [run()];
  const result = judge({ config, current: run({ ...goodPage, lcp_ms: 3000 }), history });
  assert.deepEqual(levels(result), ["fail:/:lcp_ms"]);
});
