---
description: Walk ACCEPTANCE.md against actual repo state, report PASS/FAIL/SKIP with evidence
allowed-tools: Read, Edit, Bash, Glob, Grep, Task, Workflow
---

You are running `/bencium-verify` — the verification gate.

## Step 0: Record phase (statusline)

If `.harness/` exists, write the current phase so the optional statusline can highlight TEST:

```bash
[ -d .harness ] && printf 'phase=test\ntask=verify acceptance\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

## Step 1: Load

1. Read `ACCEPTANCE.md` from project root. If missing, tell the user to run `/bencium-init` first.
2. Read `.harness/config.yaml` to find `verify.cmd` entries (optional — if absent, skip the hard-check phase).
3. Read `.harness/rules.md` for project-specific non-negotiables that should also be checked.

## Step 2: Hard checks (if config has them)

Run each command in `verify.cmd` sequentially via Bash. Capture exit code + last 20 lines of output. If any non-zero, record as FAIL with evidence.

Examples of typical commands users may have configured: `npm test -- --run`, `npm run typecheck`, `npm run build`, custom smoke scripts.

## Step 3: Soft checks (walk ACCEPTANCE.md — local only)

For EACH unchecked item in `ACCEPTANCE.md`:

1. **Tag check first.** If the line contains a `[deployed]` tag **anywhere** — as the checkbox marker (`- [deployed] X`), after the checkbox (`- [ ] [deployed] X`, the form a row takes once SMOKE has flipped it and something later unchecked it), or trailing the text — it is a deployed-environment check. Classify as **SKIP** with reason `awaiting post-deploy smoke — re-walked by /bencium-deploy Step 5.5 against deploy.url`. Do NOT attempt to evaluate it locally, and do NOT mark it `[x]`. Move on. (Rationale: local pass != deployed pass. The whole reason this tag exists is because tests passing locally have falsely confirmed deployed features in the past.)
2. Otherwise the line is `- [ ]` (local). Read the check carefully.
3. Determine the minimum evidence needed to call it pass/fail. Examples:
   - "All list endpoints paginated" → grep for route handlers, inspect for limit/offset/cursor
   - "Health check returns 200" → run curl against the configured URL
   - "No secrets in repo" → grep for common patterns (`SUPABASE_KEY=`, `sk_live_`, etc.) in tracked files only
   - "Localized strings preserved" → grep for stripped diacritics or missing translation keys
   - "UI discloses backend activity" → grep for `fetch(`, `useQuery`, `useMutation`, upload handlers and confirm each has visible loading/error state (e.g. matching `isLoading`, `<Spinner`, `<Skeleton`, `toast.error`, etc.); flag any async call with no visible state binding.
4. Gather the evidence. Run commands, read files, search the codebase.
5. Classify as PASS, FAIL, or SKIP (with reason). SKIP for a local check is only acceptable when it genuinely doesn't apply yet (e.g., "deploy works" before first deploy).
6. If PASS, mark `- [x]` in ACCEPTANCE.md.
7. If FAIL or SKIP, leave the line unchanged and record the reason.

## Step 3a: Gamed-test / reward-hacking inspection

A green test only counts if the test still asserts the real behavior. Agents optimize for the metric they're graded on, so before trusting any passing hard check, inspect the changes that produced it. Look at the diff for the test and config files (`git diff` on `*.test.*`, `*.spec.*`, `conftest.py`, snapshots, `vitest.config`, `jest.config`, etc.) and flag any of:

- **Weakened assertions** — `expect(true).toBe(true)`, `assert True`, an assertion deleted/commented, or narrowed to something trivially true.
- **Hardcoded expected values** that simply echo the implementation's current output (the test would pass for any output).
- **Skipped / silenced tests** — `.skip`, `xit`, `test.todo`, `@pytest.mark.skip`, `--passWithNoTests`, `|| true` appended to a verify command.
- **Test edited to fit the code** — the assertion changed to match a wrong result instead of the code being fixed to match the spec.
- **Blind snapshot updates** — snapshot regenerated (`-u`) without the change being justified in the diff.
- **Scope-narrowed verify** — `verify.cmd` quietly changed to run fewer tests, or a failing file excluded.

If you find any: record the affected acceptance/hard check as **FAIL** with the file:line evidence, **regardless of the green result**. A gamed pass is a fail. Name the specific gaming pattern in the evidence string.

This is cheap insurance against the exact failure mode where "all tests pass" but the tests no longer test anything.

## Step 3b: Independent verification — separate evaluator (recommended)

The single biggest verification lever is *separation*: an agent grading its own work skews positive. When you (the verifier) also wrote the code in this session, or when a check is subjective / large / easy to rationalize, delegate a skeptical second opinion to a subagent that did **not** write the code.

When to use it:

- **Recommended** when `/bencium-verify` runs in the same session that just built the feature (`/bencium-next` BUILD ran earlier in this context).
- **Recommended** for checks that are easy to talk yourself into (UX/disclosure rows, "feature actually works end to end", anything without a hard binary test).
- **Skip** for a small change you didn't author, or when every check is backed by an unambiguous hard test that passed Step 3a — separation adds latency for no signal there.

How:

1. Spawn **one** `Task` subagent (type `Explore` or general) — at most three only if you need to shard a long ACCEPTANCE list; one task each, never nested. Honor the 3-agent cap.
2. Brief it tightly: "You are an independent QA reviewer. You did NOT write this code. Be skeptical — default to FAIL when evidence is thin." Hand it the unchecked local `ACCEPTANCE.md` rows, the `git diff`, and the `verify.cmd` output. Ask for a concise per-row **PASS/FAIL with file:line evidence** and a one-line reason — nothing else (keep the main context clean).
3. Reconcile: where the subagent's verdict is stricter than yours, take the stricter one unless you have concrete contradicting evidence. Surface any disagreement in the report (`builder said PASS, independent reviewer said FAIL — <reason>`).

The subagent is advisory to the gate, not a separate gate — its FAILs flip the corresponding rows to FAIL in your report.

## Step 3c: Accelerated path — workflow fan-out (opt-in, Claude Code only)

A faster, wider version of Steps 3 + 3b for long ACCEPTANCE lists. **Read the `accelerated-mode` skill first** — it holds the two gates (a `Workflow` tool must exist, and the user must have opted in this run), the fallback rule, and the guardrails. If either gate is false, run Steps 3/3b serially and skip this section entirely.

When both hold:

1. Collect the unchecked **local** rows (the same set Step 3 walks — never `[deployed]` rows; those stay deferred to SMOKE). Gather the `git diff` and the Step 2 `verify.cmd` output.
2. Invoke the `Workflow` tool with the scaffolded script (prefer the project copy `.claude/workflows/verify-acceptance.mjs`; fall back to `${CLAUDE_PLUGIN_ROOT}/workflows/verify-acceptance.mjs`). Pass `args: { rows: [{ text }], diff, verifyOutput }`. The workflow evaluates each row (Haiku) and adversarially re-checks each PASS with a fresh skeptic (Sonnet) — Step 3a's gamed-pass hunt, at scale.
3. Fold the returned `items` into your Step 4 report exactly as if you had walked them serially. A row the workflow marks `fail` (including a refuted PASS) is FAIL — take the stricter verdict, same reconciliation rule as Step 3b.
   The workflow returns one item per row you passed in — never fewer. A row it could not evaluate, and a PASS whose skeptic never ran, both come back `fail` with `unverified: true`. Report those as failures and say how many: `N row(s) could not be evaluated`. An unverified row is a row with no evidence behind it, and this gate's own rule is to prefer FAIL over a hopeful PASS.
4. Record that the workflow path ran: set `mode: "workflow"` and `agents: <count>` in the Step 8 marker (see below). If you ran serially, set `mode: "serial"` and `agents: 0`.

## Step 4: Report

Print the TEST banner (yellow) — see `phase-banner` skill for the codes:

```
\033[33m┌── TEST ── verify acceptance (local) ──┐\033[0m
🗺️ ▸ 📋 ▸ 🔨 ▸ [✓] ▸ 🚀 ▸ 🔥 ▸ 💭
```

Then a structured report. Show **deployed-env checks as a separate block** so the user can see at a glance that local PASS is not a deploy gate on its own.

```
/bencium-verify report (local)

Hard checks:
  ✓ tests        (npm test -- --run, 0)
  ✗ typecheck    (npm run typecheck, 2 errors in src/api.ts:42, src/db.ts:88)

Soft checks — local (ACCEPTANCE.md):
  ✓ All list endpoints paginated
    └─ Inspected 4 routes in app/api/, all use limit/offset
  ✗ Health check returns 200
    └─ curl https://app.fly.dev/health → 503
  - No secrets in repo (skipped: no scanner configured)
  ✓ UI discloses backend activity
    └─ All 7 fetch sites bound to visible loading/error state
  ✓ ...

Deployed-env checks (deferred — run /bencium-deploy SMOKE to evaluate):
  ⏭ [deployed] Upload works at https://app.example.com
    └─ awaiting post-deploy smoke
  ⏭ [deployed] No console errors on deployed page load
    └─ awaiting post-deploy smoke

Result: 7 PASS, 2 FAIL, 1 SKIP, 2 DEFERRED-TO-SMOKE
```

Note: DEFERRED-TO-SMOKE is not a failure — it just means the row cannot be evaluated locally. The deploy command will walk these. The local pass count never includes deployed rows.

Close: `\033[33m└──────────────────────────────────┘\033[0m`

## Step 5: On failure

If any FAIL exists:

- Do NOT proceed with deploy or any destructive action.
- Render `${CLAUDE_PLUGIN_ROOT}/templates/next-moves.md.tmpl`, filling:
  - `{{phase_progress_strip}}` → `🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ [💭]` (reflect highlighted next)
  - `{{verify_reason}}` → `N checks still failing — fix and re-run` (or omit the verify block entirely)
  - `{{top_roadmap_items}}` → read from `tasks.md ## Roadmap` (first 3 items)
  - `{{tail_status}}` → `📝 Memory: unchanged (verify failed — no memory line until clean)`
- Put `/bencium-retro` at the top of the rendered output.
- Offer to fix the first failing check now (yes/no/list-all-first).

## Step 6: On full pass

Append to `.harness/memory.md` under `## Verifications`:

```
- YYYY-MM-DD HH:MM — /bencium-verify clean (N checks)
```

Render `${CLAUDE_PLUGIN_ROOT}/templates/next-moves.md.tmpl`, filling:
- `{{phase_progress_strip}}` → `🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ [🚀] ▸ 🔥 ▸ 💭` (deploy highlighted next; smoke still pending)
- `{{verify_reason}}` → `local clean — `/bencium-deploy` is gated open. Deployed-env rows will be evaluated by SMOKE after deploy; the loop is not complete until they pass.`
- `{{top_roadmap_items}}` → read from `tasks.md ## Roadmap` (first 3 items)
- `{{tail_status}}` → `📝 Memory: +1 verification line appended to .harness/memory.md`

Put `/bencium-deploy` at the top of the rendered output and tell the user the gate is open.

## Step 6.5: Write the verify receipt

Whatever the result, record it so the deploy gate can read it:

```bash
[ -d .harness ] && printf 'result=%s\nsha=%s\ntree=%s\nts=%s\n' "<pass|partial|fail>" "$(git rev-parse HEAD 2>/dev/null || echo unknown)" "$( { git diff HEAD -- . ':(exclude).harness'; git ls-files --others --exclude-standard -- . ':(exclude).harness'; } 2>/dev/null | git hash-object --stdin 2>/dev/null)" "$(date -u +%FT%TZ)" > .harness/last-verify
```

This is not bookkeeping — on Claude Code `deploy-gate.sh` reads it and refuses the deploy command unless `result=pass`, `sha` matches the current HEAD, and `tree` (a fingerprint of uncommitted changes outside `.harness/`) still matches. Run this line exactly as written — the gate recomputes `tree` the same way. A `fail` receipt is as important as a `pass` one: writing nothing would leave the previous run's verdict standing while the code has moved on. Recommend adding `.harness/last-verify` to `.gitignore` alongside `.harness/state`.

## Step 7: Memory confirmation

Whether the result was PASS or FAIL, print one explicit memory line so the user knows what landed in `.harness/memory.md`:

```
📝 Memory: +1 verification line appended      (on full PASS)
```
or
```
📝 Memory: unchanged                          (on any FAIL)
```

## Step 8: Marker block (final output — for downstream tools)

Emit a fenced ```` ```json ```` block as the **very last** thing the command prints. Nothing after it — no closing banner, no extra prose, no trailing whitespace beyond the closing fence. This is how CI scripts, dashboards, and follow-up commands locate the result.

Schema:

```json
{
  "_marker": "bencium-verify-result",
  "version": 1,
  "ts": "<ISO8601 UTC>",
  "phase": "test",
  "mode": "serial" | "workflow",
  "agents": <int>,
  "result": "pass" | "fail" | "partial",
  "hard_checks": [
    { "name": "<verify.cmd entry>", "status": "pass" | "fail", "evidence": "<one-line>", "exit_code": <int> }
  ],
  "soft_checks_local": {
    "pass": <int>,
    "fail": <int>,
    "skip": <int>,
    "unverified": <int>,
    "items": [
      { "text": "<ACCEPTANCE row text>", "status": "pass" | "fail" | "skip", "evidence": "<one-line>" }
    ]
  },
  "deferred_to_smoke": [
    { "text": "<row text>", "tag": "deployed" }
  ]
}
```

Rules for populating:

- `result` is `pass` only if every hard check passes AND every local soft check is `pass`. Any `fail` → `fail`. All `pass` with any `skip` → `partial`. `deferred_to_smoke` entries do NOT count toward the result (they are evaluated by `/bencium-deploy` SMOKE).
- `unverified` is the subset of `fail` rows that failed because nothing could be evaluated (dead agent, unrun skeptic) rather than because the check genuinely did not hold. It is `0` on the serial path. `items` must contain one entry per row you set out to walk — a row you could not evaluate is `fail` with the reason as its evidence, never a missing entry.
- `evidence` strings come from the same prose report in Step 4 — one line each, no markdown.
- `hard_checks` is an empty array if `.harness/config.yaml` has no `verify.cmd` entries.
- `deferred_to_smoke` is an empty array if no `[deployed]`-tagged rows exist.
- `mode` / `agents` are **optional, additive** fields (schema stays `version: 1`). Set `mode: "workflow"` and `agents` to the count only when Step 3c ran; otherwise `mode: "serial"` and `agents: 0`. Consumers that predate these fields ignore them — the serial path is byte-for-byte the old behavior.

## Hard rules

- **Evidence before a tick, and an unevaluated check is a failed check** — see the `invariants` skill. Never invent a result; if a check genuinely does not apply yet, mark it SKIP with a reason.
- **A gamed pass is a FAIL.** If Step 3a finds a weakened/skipped/hardcoded test or a narrowed `verify.cmd`, the backed check is FAIL regardless of the green result. Green is necessary, not sufficient — the test must still assert the real behavior.
- **Prefer separation on self-authored work.** If you verified a feature you also built in this session, run Step 3b — a same-context self-grade skews positive. When the independent reviewer is stricter, take the stricter verdict unless you can refute it with concrete evidence. The 3-agent cap is hard; one verifier subagent is the norm.
- **The 3-agent cap governs `Task` subagents.** Workflow mode (Step 3c) is a separate escalation and is not bound by it — see the `accelerated-mode` skill.
- **Never evaluate `[deployed]`-tagged rows locally** — the DEPLOY → SMOKE invariant. They are SKIP with reason `awaiting post-deploy smoke` until `/bencium-deploy` walks them against `deploy.url`. On Claude Code `acceptance-gate.sh` blocks the edit if you try.
- Do not modify source code during verify. Only update ACCEPTANCE.md checkboxes and .harness/memory.md.
- Never skip the TEST banner or the memory confirmation line — they're how the user knows where they are in the loop.
- **The Step 8 marker block MUST be the last output** — see the `markers` skill.
