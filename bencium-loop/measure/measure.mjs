#!/usr/bin/env node
// bencium-loop measurement runner — called by /bencium-verify Step 2.5 from the project root:
//
//   node .harness/measure/measure.mjs
//
// Loads every page in .harness/measure.json in a real browser, records speed numbers and an
// accessibility scan, runs the timed user journeys, judges the lot against the budgets and the
// history, appends one line to .harness/metrics.jsonl, and prints a report.
//
// Exit 0 = pass or warn. Exit 1 = over budget, a broken journey, or something that could not be
// measured. The last line of output is `BENCIUM_MEASURE <json>` for the command to parse.
//
// The numbers come from this machine, not from real users. CPU slowdown narrows the gap to the
// phones the published thresholds assume; it does not close it.

import { spawn, execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { judge } from "./judge.mjs";

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, ".harness", "measure.json");
const historyPath = path.join(projectRoot, ".harness", "metrics.jsonl");

const DEFAULTS = { runs: 3, cpu_slowdown: 4, serve_timeout_s: 120, settle_ms: 1000, step_timeout_ms: 10_000 };

await main();

async function main() {
  if (!existsSync(configPath)) {
    finish({ result: "skip", reason: "no .harness/measure.json — measurement not configured" }, 0);
  }

  const config = { ...DEFAULTS, ...JSON.parse(readFileSync(configPath, "utf8")) };
  const history = readHistory();
  const server = config.serve ? startServer(config.serve) : null;

  let current;
  try {
    current = await measureEverything(config);
  } catch (error) {
    current = { error: error.message.split("\n")[0] };
  } finally {
    server?.stop();
  }

  const { result, findings } = judge({ config, current, history });
  appendFileSync(historyPath, `${JSON.stringify({ ts: new Date().toISOString(), sha: gitSha(), result, ...current, findings })}\n`);

  printReport(config, current, findings, result);
  finish({ result, fails: count(findings, "fail"), warns: count(findings, "warn"), findings }, result === "fail" ? 1 : 0);
}

async function measureEverything(config) {
  const { chromium, AxeBuilder } = await loadBrowserTools();
  await waitForApp(config.url, config.serve ? config.serve_timeout_s : 5);

  const browser = await chromium.launch();
  try {
    const pages = {};
    for (const pagePath of config.pages ?? []) {
      pages[pagePath] = await measurePage(browser, AxeBuilder, config, pagePath).catch((error) => ({ error: firstLine(error) }));
    }
    const journeys = {};
    for (const journey of config.journeys ?? []) {
      journeys[journey.name] = await runJourney(browser, config, journey);
    }
    return { url: config.url, pages, journeys };
  } finally {
    await browser.close();
  }
}

// ----- one page: median of N cold loads, plus one accessibility scan -----

async function measurePage(browser, AxeBuilder, config, pagePath) {
  const runs = [];
  for (let i = 0; i < config.runs; i++) runs.push(await loadOnce(browser, config, pagePath, i === 0 ? AxeBuilder : null));
  const axe = runs[0].a11y;

  const metrics = {};
  for (const key of Object.keys(runs[0].timing)) metrics[key] = median(runs.map((r) => r.timing[key]));
  return { ...metrics, ...axe.counts, a11y_top: axe.top };
}

async function loadOnce(browser, config, pagePath, AxeBuilder) {
  // A fresh context per load is a cold cache: what a first-time visitor gets.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await slowCpu(context, page, config.cpu_slowdown);
    await page.addInitScript(observePerformance);

    let consoleErrors = 0;
    page.on("console", (msg) => msg.type() === "error" && consoleErrors++);
    page.on("pageerror", () => consoleErrors++);

    const network = { requests: 0, scriptBytes: 0, pending: [] };
    page.on("requestfinished", (request) => {
      network.requests++;
      if (request.resourceType() === "script") {
        network.pending.push(request.sizes().then((s) => (network.scriptBytes += s.responseBodySize)).catch(() => {}));
      }
    });

    const response = await page.goto(new URL(pagePath, config.url).href, { waitUntil: "load", timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`${pagePath} answered HTTP ${response?.status() ?? "nothing"}`);
    await page.waitForTimeout(config.settle_ms);
    await Promise.all(network.pending);

    const perf = await page.evaluate(() => window.__benciumPerf.read());
    const timing = {
      ...perf,
      js_kb: round(network.scriptBytes / 1024),
      requests: network.requests,
      console_errors: consoleErrors,
    };
    const a11y = AxeBuilder ? await scanAccessibility(AxeBuilder, page) : null;
    return { timing, a11y };
  } finally {
    await context.close();
  }
}

// Runs inside the page before any of its own scripts, so no paint, shift or long task is missed.
function observePerformance() {
  const seen = { lcp: undefined, cls: 0, longTasks: [] };
  const watch = (type, onEntry) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    } catch {}
  };
  watch("largest-contentful-paint", (e) => (seen.lcp = e.startTime));
  watch("layout-shift", (e) => !e.hadRecentInput && (seen.cls += e.value));
  watch("longtask", (e) => seen.longTasks.push(e));

  window.__benciumPerf = {
    read() {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
      // Total Blocking Time, approximately: the part of each long task beyond 50ms, after first
      // paint. Lighthouse ends the window at time-to-interactive; this ends it when we read.
      const tbt = seen.longTasks
        .filter((t) => fcp === undefined || t.startTime >= fcp)
        .reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
      const r = (n) => (n === undefined ? undefined : Math.round(n));
      return {
        ttfb_ms: r(nav?.responseStart),
        fcp_ms: r(fcp),
        lcp_ms: r(seen.lcp ?? fcp),
        cls: Math.round(seen.cls * 1000) / 1000,
        tbt_ms: r(tbt),
      };
    },
  };
}

// axe counts affected elements, not rule names: twenty unlabelled inputs is worse than one, and
// counting elements is what lets "it got worse" show up as drift.
async function scanAccessibility(AxeBuilder, page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const counts = { a11y_critical: 0, a11y_serious: 0, a11y_moderate: 0, a11y_minor: 0 };
  for (const v of violations) counts[`a11y_${v.impact ?? "minor"}`] += v.nodes.length;
  const top = violations
    .sort((a, b) => b.nodes.length - a.nodes.length)
    .slice(0, 5)
    .map((v) => `${v.id} ×${v.nodes.length} (${v.impact})`);
  return { counts, top };
}

// ----- one journey: the project's own script, timed step by step -----

async function runJourney(browser, config, journey) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // A missing button should fail the step in seconds, not hang on Playwright's 30s default.
  context.setDefaultTimeout(config.step_timeout_ms);
  const record = { ok: false, total_ms: 0, steps: 0, step_ms: [] };
  const started = performance.now();
  try {
    await slowCpu(context, page, config.cpu_slowdown);
    const { default: script } = await import(pathToFileURL(path.resolve(projectRoot, journey.file)).href);
    const step = async (label, action) => {
      const t0 = performance.now();
      await action();
      record.steps++;
      record.step_ms.push([label, Math.round(performance.now() - t0)]);
    };
    const limit = Math.max(30_000, (journey.max_ms ?? 0) * 3);
    await withTimeout(script({ page, step, baseUrl: config.url.replace(/\/$/, "") }), limit, `journey still running after ${limit / 1000}s`);
    record.ok = true;
  } catch (error) {
    record.error = firstLine(error);
  } finally {
    record.total_ms = Math.round(performance.now() - started);
    await context.close();
  }
  return record;
}

// ----- the app under test -----

function startServer(command) {
  const child = spawn("sh", ["-c", command], { cwd: projectRoot, detached: true, stdio: "ignore" });
  return {
    // Kill the whole process group: `npm run start` leaves the real server as a grandchild.
    stop: () => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    },
  };
}

async function waitForApp(url, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`nothing answered at ${url} within ${timeoutSeconds}s — start the app, or set "serve" in .harness/measure.json`);
}

async function loadBrowserTools() {
  try {
    const { chromium } = await import("playwright");
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    return { chromium, AxeBuilder };
  } catch {
    throw new Error("Playwright or axe-core is not installed — run: npm install --prefix .harness/measure && npx --prefix .harness/measure playwright install chromium");
  }
}

async function slowCpu(context, page, rate) {
  if (!rate || rate <= 1) return;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

// ----- output -----

function printReport(config, current, findings, result) {
  const out = [];
  out.push(`📏 Measurement — ${config.url} (median of ${config.runs} cold loads, CPU ${config.cpu_slowdown}× slower, numbers from this machine)`);
  if (current.error) out.push(`  could not measure: ${current.error}`);

  for (const [pagePath, m] of Object.entries(current.pages ?? {})) {
    if (m.error) {
      out.push(`  ${pagePath.padEnd(14)} could not load: ${m.error}`);
      continue;
    }
    out.push(
      `  ${pagePath.padEnd(14)} LCP ${m.lcp_ms}ms · FCP ${m.fcp_ms}ms · CLS ${m.cls} · TBT ~${m.tbt_ms}ms · ` +
        `JS ${m.js_kb}KB · ${m.requests} requests · ${m.console_errors} console errors · ` +
        `a11y ${m.a11y_critical} critical / ${m.a11y_serious} serious / ${m.a11y_moderate} moderate / ${m.a11y_minor} minor`,
    );
    if (m.a11y_top?.length) out.push(`  ${"".padEnd(14)} top a11y issues: ${m.a11y_top.join(", ")}`);
  }
  for (const [name, j] of Object.entries(current.journeys ?? {})) {
    const status = j.ok ? "✓" : `✗ ${j.error}`;
    out.push(`  journey ${name.padEnd(6)} ${(j.total_ms / 1000).toFixed(1)}s · ${j.steps} steps ${status}`);
  }

  for (const f of findings) out.push(`  ${f.level === "fail" ? "✗" : "⚠"} ${f.where} — ${f.message}`);
  out.push(`Result: ${result}  (${count(findings, "fail")} over budget or unmeasured, ${count(findings, "warn")} getting worse)`);
  console.log(out.join("\n"));
}

function finish(summary, code) {
  console.log(`BENCIUM_MEASURE ${JSON.stringify(summary)}`);
  process.exit(code);
}

// ----- small helpers -----

function readHistory() {
  if (!existsSync(historyPath)) return [];
  return readFileSync(historyPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

function median(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2);
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(timer));
}

// Function declarations, not arrow consts: main() runs at the top of the module, before any
// `const` below it is initialised.
function round(n) {
  return Math.round(n * 1000) / 1000;
}

function count(findings, level) {
  return findings.filter((f) => f.level === level).length;
}

function firstLine(error) {
  return String(error?.message ?? error).split("\n")[0];
}
