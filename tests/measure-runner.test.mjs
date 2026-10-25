// End to end: the real runner, a real browser, a throwaway project with a tiny web server.
//
// Needs Playwright and axe-core installed somewhere. Point BENCIUM_MEASURE_DEPS at a
// node_modules folder that has them (CONTRIBUTING.md shows how); without it these tests are
// skipped and say so, rather than passing without having looked.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const measureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bencium-loop", "measure");
const deps = process.env.BENCIUM_MEASURE_DEPS;
const skip = !deps || !existsSync(path.join(deps, "playwright"))
  ? "set BENCIUM_MEASURE_DEPS to a node_modules folder with playwright and @axe-core/playwright"
  : false;

const PAGES = {
  "/": `<!doctype html><html lang="en"><head><title>Home</title></head>
        <body><main><h1>Hello</h1><a href="/signup">Sign up</a></main></body></html>`,
  // One image with no alt text: axe reports it as a critical "image-alt" violation.
  "/broken": `<!doctype html><html lang="en"><head><title>Broken</title></head>
        <body><main><h1>Broken</h1><img src="/pixel.gif"></main></body></html>`,
  "/signup": `<!doctype html><html lang="en"><head><title>Sign up</title></head>
        <body><main><h1>Sign up</h1><label>Email <input id="email"></label>
        <button id="go" onclick="document.body.dataset.done='yes'">Create account</button></main></body></html>`,
};

const JOURNEY = `export default async function journey({ page, step, baseUrl }) {
  await step("open signup", () => page.goto(baseUrl + "/signup"));
  await step("fill email", () => page.fill("#email", "a@b.co"));
  await step("submit", () => page.click("#go"));
  await step("see account", () => page.waitForSelector("body[data-done=yes]", { timeout: 2000 }));
}`;

function startSite() {
  const server = http.createServer((req, res) => {
    if (req.url === "/pixel.gif") {
      res.writeHead(200, { "content-type": "image/gif" });
      return res.end(Buffer.from("R0lGODlhAQABAAAAACw=", "base64"));
    }
    const html = PAGES[req.url];
    res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
    res.end(html ?? "not found");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function makeProject(measureConfig) {
  const root = mkdtempSync(path.join(os.tmpdir(), "bencium-measure-"));
  const target = path.join(root, ".harness", "measure");
  mkdirSync(target, { recursive: true });
  cpSync(measureDir, target, { recursive: true });
  symlinkSync(deps, path.join(target, "node_modules"), "dir");
  mkdirSync(path.join(root, ".harness", "journeys"));
  writeFileSync(path.join(root, ".harness", "journeys", "signup.mjs"), JOURNEY);
  writeFileSync(path.join(root, ".harness", "measure.json"), JSON.stringify(measureConfig));
  return root;
}

function runMeasure(root) {
  return new Promise((resolve) => {
    const child = spawn("node", [".harness/measure/measure.mjs"], { cwd: root });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const line = out.split("\n").find((l) => l.startsWith("BENCIUM_MEASURE "));
      resolve({ code, out, summary: line ? JSON.parse(line.slice("BENCIUM_MEASURE ".length)) : null });
    });
  });
}

const history = (root) => readFileSync(path.join(root, ".harness", "metrics.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

async function withSite(fn) {
  const server = await startSite();
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(url);
  } finally {
    server.close();
  }
}

test("a clean page and a working journey pass, and the run is recorded", { skip, timeout: 120_000 }, () =>
  withSite(async (url) => {
    const root = makeProject({
      url,
      runs: 2,
      pages: ["/"],
      budgets: { lcp_ms: 2500, cls: 0.1, a11y_critical: 0, a11y_serious: 0 },
      journeys: [{ name: "signup", file: ".harness/journeys/signup.mjs", max_ms: 15000, max_steps: 6 }],
    });
    try {
      const { code, out, summary } = await runMeasure(root);
      assert.equal(code, 0, out);
      assert.equal(summary.result, "pass", out);

      const [run] = history(root);
      assert.equal(typeof run.pages["/"].lcp_ms, "number");
      assert.equal(typeof run.pages["/"].fcp_ms, "number");
      assert.equal(run.pages["/"].a11y_critical, 0);
      assert.equal(run.journeys.signup.ok, true);
      assert.equal(run.journeys.signup.steps, 4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }));

test("an accessibility violation over budget fails with exit code 1 and names the rule", { skip, timeout: 120_000 }, () =>
  withSite(async (url) => {
    const root = makeProject({ url, runs: 1, pages: ["/broken"], budgets: { a11y_critical: 0 } });
    try {
      const { code, out, summary } = await runMeasure(root);
      assert.equal(code, 1, out);
      assert.equal(summary.result, "fail");
      assert.match(out, /image-alt/);
      assert.ok(history(root)[0].pages["/broken"].a11y_critical >= 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }));

test("a broken journey fails and says which step broke", { skip, timeout: 120_000 }, () =>
  withSite(async (url) => {
    const root = makeProject({
      url,
      runs: 1,
      pages: [],
      journeys: [{ name: "signup", file: ".harness/journeys/signup.mjs", max_ms: 15000 }],
    });
    writeFileSync(path.join(root, ".harness", "journeys", "signup.mjs"), JOURNEY.replace("#go", "#missing-button"));
    try {
      const { code, out } = await runMeasure(root);
      assert.equal(code, 1, out);
      assert.match(out, /journey broke at step 3/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }));

test("an app that is not running fails instead of passing empty", { skip, timeout: 60_000 }, async () => {
  const root = makeProject({ url: "http://127.0.0.1:9", runs: 1, pages: ["/"], budgets: { lcp_ms: 2500 } });
  try {
    const { code, out, summary } = await runMeasure(root);
    assert.equal(code, 1, out);
    assert.equal(summary.result, "fail");
    assert.match(out, /nothing answered/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no measure.json means measurement is skipped, visibly", { skip, timeout: 30_000 }, async () => {
  const root = makeProject({});
  rmSync(path.join(root, ".harness", "measure.json"));
  try {
    const { code, summary } = await runMeasure(root);
    assert.equal(code, 0);
    assert.equal(summary.result, "skip");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
