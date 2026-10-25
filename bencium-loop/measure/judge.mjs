// Turns one measurement run into a verdict. Pure: no browser, no files — measure.mjs hands it
// the config, this run's numbers and the history, and gets back pass / warn / fail with reasons.
//
// The rules, in order of severity:
//   fail — over a budget, a journey too slow or too long, or anything that could not be measured.
//          An unmeasured number is an unproved number; it never passes by default.
//   warn — inside budget, but worse than the last run that measured it, by more than drift_pct
//          AND more than an absolute floor. The floor keeps laptop jitter from raising alarms.
//   pass — everything else.

const DEFAULT_DRIFT_PCT = 15;

// The smallest change worth a warning, per metric. Below this, a difference is noise.
const DRIFT_FLOOR = {
  ttfb_ms: 50,
  fcp_ms: 50,
  lcp_ms: 50,
  tbt_ms: 50,
  cls: 0.02,
  js_kb: 10,
  requests: 3,
  journey_ms: 100,
};

// Counts where any increase is worth saying out loud, however small.
const COUNT_METRICS = ["console_errors", "a11y_critical", "a11y_serious", "a11y_moderate", "a11y_minor"];

export function judge({ config, current, history = [] }) {
  const findings = [];
  const driftPct = config.drift_pct ?? DEFAULT_DRIFT_PCT;

  if (current.error) {
    findings.push(fail("run", "measure", `could not measure: ${current.error}`));
    return verdict(findings);
  }

  for (const pagePath of config.pages ?? []) {
    judgePage(pagePath, current.pages?.[pagePath], config.budgets ?? {}, history, driftPct, findings);
  }
  for (const journey of config.journeys ?? []) {
    judgeJourney(journey, current.journeys?.[journey.name], history, driftPct, findings);
  }

  return verdict(findings);
}

function judgePage(pagePath, measured, budgets, history, driftPct, findings) {
  if (!measured || measured.error) {
    findings.push(fail(pagePath, "page", `could not measure: ${measured?.error ?? "no result"}`));
    return;
  }

  const overBudget = new Set();
  for (const [metric, budget] of Object.entries(budgets)) {
    const value = measured[metric];
    if (value === undefined || value === null) {
      findings.push(fail(pagePath, metric, `${metric} has a budget but was not measured`));
      overBudget.add(metric);
    } else if (value > budget) {
      findings.push({ ...fail(pagePath, metric, `${metric} ${format(metric, value)} is over budget ${format(metric, budget)}`), value, budget });
      overBudget.add(metric);
    }
  }

  for (const [metric, value] of Object.entries(measured)) {
    if (overBudget.has(metric) || typeof value !== "number") continue;
    const previous = lastMeasured(history, (run) => run.pages?.[pagePath]?.[metric]);
    const drift = describeDrift(metric, value, previous, driftPct);
    if (drift) findings.push({ ...warn(pagePath, metric, drift), value, previous });
  }
}

function judgeJourney(journey, measured, history, driftPct, findings) {
  const where = `journey:${journey.name}`;
  if (!measured) {
    findings.push(fail(where, "journey", "journey did not run"));
    return;
  }
  if (!measured.ok) {
    findings.push(fail(where, "journey", `journey broke at step ${measured.steps + 1}: ${measured.error ?? "unknown error"}`));
    return;
  }

  let failed = false;
  if (journey.max_ms !== undefined && measured.total_ms > journey.max_ms) {
    findings.push(fail(where, "journey_ms", `took ${format("journey_ms", measured.total_ms)}, budget ${format("journey_ms", journey.max_ms)}`));
    failed = true;
  }
  if (journey.max_steps !== undefined && measured.steps > journey.max_steps) {
    findings.push(fail(where, "steps", `took ${measured.steps} steps, budget ${journey.max_steps}`));
    failed = true;
  }
  if (failed) return;

  const previous = lastMeasured(history, (run) => run.journeys?.[journey.name]?.ok ? run.journeys[journey.name].total_ms : undefined);
  const drift = describeDrift("journey_ms", measured.total_ms, previous, driftPct);
  if (drift) findings.push(warn(where, "journey_ms", drift));
}

/** The most recent value the picker finds in history, walking back from the newest run. */
function lastMeasured(history, pick) {
  for (let i = history.length - 1; i >= 0; i--) {
    const value = pick(history[i]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function describeDrift(metric, value, previous, driftPct) {
  if (previous === undefined || value <= previous) return null;

  if (COUNT_METRICS.includes(metric)) {
    return `${metric} rose from ${previous} to ${value}`;
  }

  const floor = DRIFT_FLOOR[metric];
  if (floor === undefined) return null;
  const rise = value - previous;
  const risePct = previous === 0 ? Infinity : (rise / previous) * 100;
  if (rise <= floor || risePct <= driftPct) return null;

  const pct = Number.isFinite(risePct) ? `+${Math.round(risePct)}%` : "up from zero";
  return `${metric} ${format(metric, value)}, was ${format(metric, previous)} last run (${pct})`;
}

function format(metric, value) {
  if (metric === "cls") return value.toFixed(2);
  if (metric === "journey_ms") return `${(value / 1000).toFixed(1)}s`;
  if (metric.endsWith("_ms")) return `${Math.round(value)}ms`;
  if (metric === "js_kb") return `${Math.round(value)}KB`;
  return String(value);
}

const fail = (where, metric, message) => ({ level: "fail", where, metric, message });
const warn = (where, metric, message) => ({ level: "warn", where, metric, message });

function verdict(findings) {
  const result = findings.some((f) => f.level === "fail") ? "fail" : findings.length ? "warn" : "pass";
  return { result, findings };
}
