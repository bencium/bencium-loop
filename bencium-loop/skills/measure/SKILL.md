---
name: measure
description: Single source of truth for bencium-loop's performance and usability measurement — what is measured, how a run is judged (budget fail vs drift warning), where the history lives, and how /bencium-verify, /bencium-next and /bencium-init use it. Read this before running, configuring, or reporting a measurement.
---

# measure

ACCEPTANCE.md says what "done" means in yes/no checks. This says what "good" means in numbers: how fast pages load, how accessible they are, and how long the journeys users actually take. It gives the agent a target it can see and improve against, not just a list it can tick.

## What is measured

`node .harness/measure/measure.mjs`, run from the project root, against the local app at `url` in `.harness/measure.json`. For each page in `pages`: the median of `runs` cold loads in a real browser (Playwright, CPU slowed `cpu_slowdown`×), plus one accessibility scan (axe-core).

| Metric | Meaning |
|---|---|
| `ttfb_ms` | time until the server's first byte |
| `fcp_ms` | time until anything appears |
| `lcp_ms` | time until the main content appears |
| `cls` | how much the layout jumps while loading |
| `tbt_ms` | how long the page was too busy to respond to a tap (approximate) |
| `js_kb` / `requests` | JavaScript downloaded / network requests |
| `console_errors` | browser console errors and uncaught exceptions |
| `a11y_critical` … `a11y_minor` | elements failing an accessibility rule, by severity |

For each entry in `journeys`: the project's own script in `.harness/journeys/<name>.mjs` (template: `${CLAUDE_PLUGIN_ROOT}/templates/journey.mjs.tmpl`), timed step by step, judged on `max_ms` and `max_steps`.

The default budgets are Google's published "good" thresholds (web.dev, checked 2026-10-25): LCP 2.5s, FCP 1.8s, CLS 0.1, TBT under 200ms. They are set for real users on average phones, at the 75th percentile. **These numbers come from one machine, not from users** — say so whenever you report them. The CPU slowdown narrows that gap; it does not close it.

## How a run is judged

- **fail** — any number over its budget, a journey over `max_ms` / `max_steps` or broken at a step, or anything that could not be measured (app not running, browser missing, a budgeted metric absent). Unmeasured is unproved, and unproved never passes — the same rule as the `invariants` skill.
- **warn** — inside budget, but worse than the last run that measured it by more than `drift_pct` (default 15%) **and** more than a small floor (50ms; 0.02 CLS; 10KB JS; 100ms per journey). Any rise in an accessibility or console-error count warns.
- **pass** — everything else.

Exit code 1 means fail. The last line of output is `BENCIUM_MEASURE {"result", "fails", "warns", "findings"}`. A missing `.harness/measure.json` prints `result: "skip"` — measurement is not configured, which is a gap to show, not a pass to claim.

## Where it is used

- **`/bencium-verify` Step 2.5** runs it after the hard checks. `fail` is a FAIL like any other check: the verify result is `fail`, the receipt says so, and the deploy gate refuses. `warn` appears in the report and does not change the result. `skip` prints `Measurement: not configured`.
- **`/bencium-next` Step 2** reads the last line of `.harness/metrics.jsonl` and offers its worst finding — every fail before any warn — as a candidate task. The user chooses; never pick it for them.
- **`/bencium-next` PLAN** — a task that adds or changes a user-facing flow names the journey it adds or updates (`Journey (timed):`), and BUILD writes it. This is how journeys accumulate.
- **`/bencium-init`** offers to set it up for projects with a web UI.

## History

`.harness/metrics.jsonl` gets one line per run (about 1KB): time, commit, result, every number, and the findings. Commit it — the trend is how anyone can tell which commit made things slower. It lives under `.harness/`, so writing it does not change the verify receipt's working-tree fingerprint.

## Setup

```bash
mkdir -p .harness/measure .harness/journeys
cp "${CLAUDE_PLUGIN_ROOT}/measure/"{measure.mjs,judge.mjs,package.json} .harness/measure/
npm install --prefix .harness/measure
npx --prefix .harness/measure playwright install chromium   # ~100MB browser download, once per machine
```

Then write `.harness/measure.json` from `${CLAUDE_PLUGIN_ROOT}/templates/measure.json.tmpl` and gitignore `.harness/measure/node_modules/`. The tools live in their own folder so measurement works for any stack, Node or not, without touching the project's dependencies.

Speed numbers from a dev server mean little. Point `serve` at a production build (e.g. `npm run build && npm run start`); the runner starts it, waits for `url`, and stops it afterwards. Without `serve`, the app must already be running.
