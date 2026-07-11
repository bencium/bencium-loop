---
description: Verify → deploy → health check → log. Refuses deploy if /bencium-verify fails.
allowed-tools: Read, Bash, Edit, Workflow
---

You are running `/bencium-deploy` — the gated deploy command.

## Step 1: Load config

Read `.harness/config.yaml`. Expect:

```yaml
deploy:
  target: <fly.io | vercel | netlify | other>
  cmd: <full deploy command>
  health: <curl command or URL returning 200 on success>
  url: <canonical base URL of the deployed app>   # used by Step 5.5 SMOKE
rollback:
  cmd: <full rollback command>
```

If `deploy.cmd` is missing, tell the user to add it to config and stop.

If `deploy.url` is missing AND `ACCEPTANCE.md` contains any `[deployed]`-tagged rows, tell the user: `Cannot run post-deploy SMOKE without deploy.url. Add it to .harness/config.yaml or remove [deployed] rows from ACCEPTANCE.md.` STOP. (Rationale: silently skipping SMOKE when deployed rows exist is the false-confirmation failure mode this command was hardened against.)

## Step 2: Pre-deploy verify

Record TEST phase for the statusline (pre-deploy verify is the local TEST step):

```bash
[ -d .harness ] && printf 'phase=test\ntask=pre-deploy verify\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

Run `/bencium-verify` (call its logic — load ACCEPTANCE.md and walk it).

If ANY check FAILs:

- Print the failure summary
- Print: `Deploy refused. Fix failures or run /bencium-retro.`
- STOP. Do not run the deploy command.

If verify passes, continue.

## Step 3: Pre-deploy snapshot

Capture the current git SHA: `git rev-parse HEAD`. You'll need this for the deploy log.

Check git status. If there are uncommitted changes:

- Print: `Uncommitted changes detected. Deploy from a clean tree (commit or stash first).`
- STOP unless the user explicitly overrides with "deploy anyway".

## Step 4: Deploy

Record DEPLOY phase for the statusline:

```bash
[ -d .harness ] && printf 'phase=deploy\ntask=running deploy.cmd\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

Run `deploy.cmd` via Bash. Stream output to the user. Capture exit code.

If non-zero:

- Print failure output
- Append to `.harness/memory.md` under `## Deploys`: `- YYYY-MM-DD HH:MM — DEPLOY FAILED <sha> exit=<N>`
- Auto-invoke `/bencium-retro` with trigger="deploy-fail"
- STOP.

## Step 5: Health check

Run `deploy.health` (Bash). Allow up to 60 seconds for the deploy to propagate — retry every 10s up to 6 times.

If still failing after retries:

- Print: `Deploy ran but health check failed.`
- Append to memory.md: `- YYYY-MM-DD HH:MM — DEPLOYED BUT UNHEALTHY <sha>`
- Auto-invoke `/bencium-retro` with trigger="deploy-fail"
- Offer `/bencium-rollback`.
- STOP.

A passing health check proves the server boots. It does **not** prove any feature works on the deployed env. Continue to Step 5.5.

## Step 5.5: SMOKE — verify acceptance on the deployed env

Record SMOKE phase for the statusline:

```bash
[ -d .harness ] && printf 'phase=smoke\ntask=deployed-env smoke\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

Print the SMOKE banner (bright magenta) — see `phase-banner` skill:

```
\033[95m┌── SMOKE ── verify on deployed env ──┐\033[0m
🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ [🔥] ▸ 💭
```

1. Re-load `ACCEPTANCE.md`.
2. Collect every unchecked row tagged `[deployed]` (either as the checkbox marker `- [deployed]` or as a trailing `[deployed]` tag). If there are none, print `No [deployed] rows in ACCEPTANCE.md — skipping smoke. Consider adding deployed-env checks (especially for any feature where local pass != deployed pass).` and continue to Step 6.

**Accelerated path (opt-in, Claude Code only).** For a long `[deployed]` list you may fan the walk out — purely additive, the serial walk in step 3 stays the default and the portable path. Use it only when **both** gates hold, else run step 3 serially: (a) a `Workflow` tool is available (Claude Code only — absent on Codex/opencode/paste surfaces; do not emulate with `Task`), and (b) the user opted in this run. When both hold, invoke the `Workflow` tool with `.claude/workflows/smoke-deployed.mjs` (fall back to `${CLAUDE_PLUGIN_ROOT}/workflows/smoke-deployed.mjs`), passing `args: { rows: [{ text }], deployUrl: <deploy.url> }`. Fold the returned `rows` into the step-4 report exactly as if walked serially, and set `mode: "workflow"` + `agents: <count>` in the Step 5.5 marker. Otherwise `mode: "serial"`, `agents: 0`.

3. For each `[deployed]` row (serial path), evaluate against the live URL (`deploy.url`):
   - Substitute `{{deploy_url}}` in the row text with the configured value.
   - Use the same evidence rules as `/bencium-verify` Step 3: curl/fetch against the deployed URL, parse response, assert. For UI behavior (e.g. "upload works"), this is a real HTTP call to the deployed endpoint with a representative payload — not a localhost call, not a unit test.
   - Classify PASS / FAIL with evidence. SKIP is only acceptable if the row genuinely cannot be evaluated (missing fixture, etc.); record the reason explicitly.
4. Print a structured smoke report:

```
/bencium-deploy SMOKE report (against {{deploy.url}})

  ✓ [deployed] Upload works at https://app.example.com
    └─ POST /api/upload (200, file id returned, file fetchable at /files/<id>)
  ✗ [deployed] No console errors on deployed page load
    └─ GET / → HTML contains "Uncaught TypeError: x is undefined" inline error marker
  ✓ [deployed] UI loading/error states visible
    └─ /upload page shows <Spinner/> on submit; error toast on forced 500

Result: 2 PASS, 1 FAIL
```

5. **On any FAIL**:
   - Print: `Deploy succeeded but the deployed env failed acceptance. The feature is NOT shipped.`
   - Append to memory.md under `## Deploys`: `- YYYY-MM-DD HH:MM — DEPLOYED BUT SMOKE FAILED <sha> (N failures)`
   - Auto-invoke `/bencium-retro` with `trigger="smoke-fail"` (retro will propose new `[deployed]` rows + a memory.md learning so the same gap can't slip past next time).
   - Offer `/bencium-rollback`.
   - Close the SMOKE banner: `\033[95m└─────────────────────────────────────┘\033[0m`
   - STOP. Do **not** mark the deploy successful, do **not** check off the rows.

6. **On full PASS**: mark each evaluated `[deployed]` row `[x]` in `ACCEPTANCE.md`. Close the SMOKE banner: `\033[95m└─────────────────────────────────────┘\033[0m`. Continue to Step 6.

7. **Emit the smoke marker** as the last output of Step 5.5 (after the banner close, before Step 6 begins on either branch — PASS or FAIL):

```json
{
  "_marker": "bencium-smoke-result",
  "version": 1,
  "ts": "<ISO8601 UTC>",
  "phase": "smoke",
  "mode": "serial" | "workflow",
  "agents": <int>,
  "deploy_url": "<from .harness/config.yaml deploy.url>",
  "deployed_sha": "<git rev-parse HEAD>",
  "result": "pass" | "fail",
  "rows": [
    { "text": "<row text>", "status": "pass" | "fail", "evidence": "<one-line>" }
  ]
}
```

Rules: `result` is `pass` only if every row in `rows` is `pass`. Empty `rows` array if no `[deployed]` tags exist (then `result` is `pass` by definition — there was nothing to fail). On the FAIL branch (Step 5.5 step 5), emit the marker after the prose failure summary and before stopping — the marker is the structured record consumers parse. `mode` / `agents` are **optional, additive** fields (schema stays `version: 1`): `mode: "workflow"` + the agent count only when the accelerated path ran, else `mode: "serial"` + `agents: 0`. Consumers that predate them ignore them.

## Step 6: Success

Append to `.harness/memory.md` under `## Deploys`:

```
- YYYY-MM-DD HH:MM — deployed <sha> (<target>) ✓
```

Print with the DEPLOY banner (bright blue) — see `phase-banner` skill:

```
\033[94m┌── DEPLOY ── ship to target ──┐\033[0m
🚀 Deploy complete
   SHA:     <short-sha>
   Target:  <target>
   Health:  ✓
   Smoke:   ✓ (N deployed checks against <deploy.url>)
📝 Memory: +1 deploy line appended to .harness/memory.md under ## Deploys
\033[94m└───────────────────────────────┘\033[0m
```

If there were no `[deployed]` rows to walk, replace the `Smoke:` line with `Smoke:   — (no [deployed] rows in ACCEPTANCE.md)` so the user sees the gap explicitly rather than a phantom ✓.

Then render `${CLAUDE_PLUGIN_ROOT}/templates/next-moves.md.tmpl`, filling:
- `{{phase_progress_strip}}` → `🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ [💭]` (smoke done — reflect next, loop complete)
- `{{verify_reason}}` → `loop complete (local + deployed both green) — next slice when ready`
- `{{top_roadmap_items}}` → first 3 items from `tasks.md ## Roadmap`
- `{{tail_status}}` → `📝 Memory: +1 deploy line appended (already logged above)`

The template's trailing 💡 Token checkpoint block is the whole point at this boundary — do not strip it.

### Step 6 marker (final output)

Emit the deploy marker as the **very last** output, after the next-moves template render. Nothing after the closing fence.

```json
{
  "_marker": "bencium-deploy-result",
  "version": 1,
  "ts": "<ISO8601 UTC>",
  "phase": "deploy",
  "sha": "<short git sha>",
  "target": "<deploy.target from config>",
  "deploy_exit_code": 0,
  "health_check": "pass" | "fail",
  "smoke_result": "pass" | "fail" | "n/a"
}
```

`smoke_result` is `n/a` when no `[deployed]` rows existed; otherwise it mirrors the Step 5.5 marker's `result`. On the FAIL branches of Steps 4/5/5.5, this Step 6 deploy marker is NOT emitted (the smoke marker / failure prose already captured the result and the command stopped before Step 6).

## Hard rules

- Never skip the verify step. The whole point is the gate.
- Never skip the health check.
- **Never skip Step 5.5 SMOKE when `[deployed]` rows exist.** A passing health check + skipped smoke is the exact false-confirmation that this command was rewritten to prevent. If `deploy.url` is missing, refuse to deploy (Step 1) rather than deploy without a deployed-env check.
- **Never mark a `[deployed]` ACCEPTANCE row `[x]` from local state.** Only SMOKE may flip them, and only with live-URL evidence.
- Never auto-rollback without asking. The user decides whether to roll back or fix forward.
- **The accelerated SMOKE path is Claude-Code-only and opt-in.** It requires a `Workflow` tool (absent everywhere except Claude Code) and an explicit request; otherwise the serial walk runs unchanged. It is a separate escalation, not bound by the 3-agent cap, and never bypasses a gate — it still evaluates every `[deployed]` row against the live URL and only SMOKE flips those rows.
- **The smoke and deploy marker blocks MUST be the last output of their respective steps.** Nothing after the closing fence. Downstream consumers locate them as trailing fenced JSON.
- **Markers report state, not opinion.** Schema version is `1`; future changes bump the integer.
