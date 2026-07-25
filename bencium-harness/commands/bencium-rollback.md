---
description: Run the configured rollback command and log the reason
allowed-tools: Read, Bash, Edit, AskUserQuestion
argument-hint: "<reason for rollback, optional>"
---

You are running `/bencium-rollback` with argument: `$ARGUMENTS`

## Step 0: Record phase (statusline)

```bash
[ -d .harness ] && printf 'phase=deploy\ntask=rollback\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

## Step 1: Load config and capture the current SHA

Read `.harness/config.yaml`. If `rollback.cmd` is missing, tell the user to add it and stop.

Capture the SHA you are rolling back **from**, before anything changes:

```bash
git rev-parse --short HEAD
```

Hold it as `<prev-sha>` for Steps 6 and 7. Every later mention of `<prev-sha>` is this value — never a guess, never reconstructed from memory. If the command fails (not a git repo), use `unknown` and say so in the log line rather than inventing one.

## Step 2: Capture the reason

If `$ARGUMENTS` is empty, ask: "Why are you rolling back? (one line — required)".

The reason must be specific enough to act on later (e.g., "auth flow broken on prod, users can't sign in" — not just "broken").

## Step 3: Confirm

Show:

```
Rollback target: <rollback.cmd>
Reason:          <reason>
```

**Portability note.** If you are running inside Claude Code, use the `AskUserQuestion` tool for the confirmation prompt below. If `AskUserQuestion` is unavailable (claude.ai, Cursor, Codex, or any non-Claude-Code host), ask inline (`Proceed with rollback? (yes/no)`) and wait for the reply. Either way, do not run the rollback command without explicit confirmation.

Ask: "Proceed?" (yes/no). On no, STOP.

## Step 4: Execute

Run `rollback.cmd` via Bash. Stream output. Capture exit code.

If non-zero:

- Print failure output
- Tell the user the rollback itself failed — manual intervention needed
- Do NOT log a "successful rollback" to memory
- STOP

## Step 5: Health check (if configured)

If `deploy.health` exists, run it (with retries as in `/bencium-deploy`). The rolled-back version should pass the same health check.

If health still fails post-rollback, escalate: tell the user the rolled-back version is also unhealthy — this is a deeper issue.

## Step 5.5: Un-check the deployed rows

The rolled-back version is what is live now, so every `[deployed]` ACCEPTANCE row that the previous deploy's SMOKE flipped is no longer true. Leaving them green is the same false confirmation the `[deployed]` split exists to prevent — just arrived at from the other direction.

1. Read `ACCEPTANCE.md` and find every checked row carrying a `[deployed]` tag (`- [x] [deployed] X`).
2. Un-check each one, keeping the tag: `- [ ] [deployed] X`.
3. Print what was reverted:

```
↩ Un-checked N deployed row(s) — they were proved against the rolled-back version, not what is live now.
   Re-run /bencium-deploy SMOKE after the next deploy to re-confirm them.
```

If there are none, print `No checked [deployed] rows to revert.` and continue.

Do **not** touch local (`- [x]`) rows — those were proved against the working tree, which a deploy rollback does not change.

## Step 6: Log

Append to `.harness/memory.md` under `## Deploys`:

```
- YYYY-MM-DD HH:MM — ROLLED BACK from <prev-sha> — <reason>
```

## Step 7: Suggest retro

Print with the DEPLOY banner (bright blue) — see `phase-banner` skill:

```
\033[94m┌── DEPLOY ── rollback complete ──┐\033[0m
🚀 Rolled back from <prev-sha>. Health: ✓
📝 Memory: +1 rollback line appended to .harness/memory.md under ## Deploys
\033[94m└───────────────────────────────────┘\033[0m

Next: /bencium-retro — capture the root cause and propose an ACCEPTANCE.md check so this doesn't recur.
```

### Step 7 marker (final output)

Emit the rollback marker as the **very last** output. Nothing after the closing fence.

```json
{
  "_marker": "bencium-rollback-result",
  "version": 1,
  "ts": "<ISO8601 UTC>",
  "phase": "deploy",
  "from_sha": "<prev-sha captured in Step 1>",
  "reason": "<the captured reason>",
  "rollback_exit_code": <int>,
  "health_check": "pass" | "fail" | "n/a",
  "deployed_rows_unchecked": <int>
}
```

`health_check` is `n/a` when no `deploy.health` is configured. `deployed_rows_unchecked` is the count from Step 5.5 — `0` is a legitimate value, and worth seeing, because it means nothing had been confirmed against the live URL in the first place.

## Hard rules

- Never roll back without a captured reason.
- Never claim success if the rollback command exit code was non-zero.
- **Never report a SHA you did not capture.** `<prev-sha>` comes from Step 1's `git rev-parse`, or it is `unknown` — reconstructing it from context is inventing evidence.
- **A rollback un-checks the deployed rows.** What was proved against the previous deployment is not proved against what is live now. Leaving them green is a false confirmation.
- The retro suggestion at the end is not optional — every rollback is a learning opportunity.
