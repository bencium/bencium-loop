---
description: Postmortem on a failure. Writes archive entry, proposes memory.md and ACCEPTANCE.md updates.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<short failure description, optional>"
---

You are running `/bencium-retro` with argument: `$ARGUMENTS`

This runs after `/bencium-verify` fails, after a deploy fails, or any time the user wants to learn from an incident.

## Step 0: Record phase (statusline)

```bash
[ -d .harness ] && printf 'phase=reflect\ntask=retro\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

## Step 1: Gather the failure context

Sources to read (whichever apply):

- The current conversation — what was being attempted, what broke, what evidence
- `.harness/memory.md` — recent activity that may have led to the failure
- The most recent `/bencium-verify` report (you may need to re-run it if not in context)
- `git log --oneline -10` and `git diff HEAD~1` if a recent commit is suspected
- Any error output from the failed deploy or check

Summarize what happened in 3-5 bullets. Confirm with the user before proceeding.

## Step 2: Five whys (briefly)

Walk the cause chain. Don't stop at the symptom. Write 3-5 levels:

1. What broke?
2. Why did it break?
3. Why did that condition exist?
4. ...

If the user disagrees with a step, revise.

## Step 3: Write the retro

Determine next NNNN: `ls .harness/archive/ | grep -E '^[0-9]{4}-' | sort | tail -1` → increment.

Path: `.harness/archive/NNNN-retro-<kebab-slug>.md`

Format:

```markdown
# NNNN — Retro: <short title>

**Date:** <YYYY-MM-DD>
**Trigger:** <verify-fail | deploy-fail | incident | other>

## What happened
<3-5 bullets>

## Cause chain
1. <symptom>
2. <one level down>
3. ...

## Root cause
<one sentence>

## Fix applied (or planned)
<what was done or what needs doing>

## What we learned
<one or two sentences, durable insight>

## Prevention
<concrete check, rule, or test that would catch this next time>
```

## Step 4: Propose updates

Based on "What we learned" and "Prevention", propose:

- **A new line for `.harness/memory.md`** under a `## Learnings` heading (create if missing). Format: `- <durable insight from this retro> [retro-NNNN]`
- **A new check for `ACCEPTANCE.md`** if the prevention is testable. Format: `- [ ] <verifiable check>`

Show both proposals to the user and ask for approval before writing. Edit the files only after approval.

## Step 4b: Propose a hook (only when the cause class warrants it)

**Decision rule — propose a hook IF AND ONLY IF the root cause is one of:**

a. A repeated agent mistake that a deterministic script could detect (e.g., committed `console.log`, ran `SELECT *`, used a banned import path).
b. A destructive operation (`rm -rf`, force-push, `git reset --hard`, schema drop, unsafe migration).
c. An env-dependent quirk that costs more to verify than to block at execution time (e.g., wrong Node version, missing env var, prod-only side effect).
d. An explicit user request during this retro ("I want a hook for this").

Otherwise, the ACCEPTANCE row + memory line from Step 4 are sufficient. **Do not propose a hook for every retro** — ACCEPTANCE catches at verify time (cheaper, more flexible); hooks catch at execution time (deterministic, costlier to maintain). Pick the right tool.

If the rule fires:

1. Reuse the NNNN from Step 3 (the retro's own number) for the hook path: `.harness/hooks/NNNN-<kebab-slug>.sh`. Slug should describe what the hook blocks/warns.
2. Draft the script body. Mirror the conventions of `${CLAUDE_PLUGIN_ROOT}/hooks/post-commit-nag.sh`:
   - `#!/usr/bin/env bash` + `set -u`
   - Exit 0 immediately if not a bencium-loop project (`[ ! -d .harness ] && exit 0`)
   - Project-detect via `.harness/` presence, never run outside loop projects
   - For **warn** behavior: print ANSI yellow `\033[33m` to stderr, exit 0
   - For **block** behavior: print ANSI red `\033[31m` to stderr, exit **2**. Exit 2 is what blocks a tool call — stderr becomes the reason shown to the agent. Exit 0 allows; any other exit code is a non-blocking error and execution continues. There is no "blocking" setting; the exit code *is* the decision.
   - Read the tool input from stdin as JSON when the hook needs the command or file path (`.tool_input.command`, `.tool_input.file_path`). Pure bash + grep/awk — no `jq`, matching the statusline's no-dependency rule.
3. Show the user the full script body AND the wiring snippet for `<project>/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             {
               "type": "command",
               "if": "Bash(<permission-rule pattern, e.g. rm -rf *>)",
               "command": "${CLAUDE_PROJECT_DIR}/.harness/hooks/NNNN-<slug>.sh",
               "timeout": 30
             }
           ]
         }
       ]
     }
   }
   ```
   Three things this schema gets wrong easily: `matcher` filters on the **tool name** only (`"Bash"`, `"Edit|Write"`, or a regex) — it cannot see the command text; narrowing to a particular command is the `if` field, using permission-rule syntax; and the handlers live in a nested `hooks` array where each entry needs `"type": "command"`. Omit `if` to fire on every call to that tool.

   For PostToolUse (e.g., post-commit checks), keep the same shape and change the event name — a warn-only hook simply exits 0. The user pastes this into their project's `.claude/settings.json` themselves — the loop never mutates settings.json directly.
4. **Ask explicit approval before writing the script file.** Never write it silently.
5. On approval: write the script to `.harness/hooks/NNNN-<slug>.sh`, run `chmod +x` on it, and append to `.harness/memory.md` under a new `## Hooks added` heading (create if missing):
   ```
   - NNNN — <one-line description> [retro-NNNN] (<PreToolUse|PostToolUse>, <blocking|warn-only>)
   ```
6. Remind the user that the hook is **inert until they paste the settings.json snippet**. The script file alone does nothing.

## Step 5: Confirm

Print the REFLECT banner (magenta) — see `phase-banner` skill:

```
\033[35m┌── REFLECT ── learn from this cycle ──┐\033[0m
🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ [💭]
```

Then:

```
/bencium-retro complete

Wrote:        .harness/archive/NNNN-retro-<slug>.md
📝 Memory:    +1 learning appended  (or "unchanged — no learning proposal accepted")
✅ Acceptance: +1 check added       (or "unchanged — no testable prevention")
✚ Hook:       +1 script written to .harness/hooks/NNNN-<slug>.sh — paste settings.json snippet above to activate
              (or "unchanged — no hook proposed (cause class did not warrant one)")
```

Close: `\033[35m└──────────────────────────────────┘\033[0m`

Then render `${CLAUDE_PLUGIN_ROOT}/templates/next-moves.md.tmpl`, filling:
- `{{phase_progress_strip}}` → `🗺️ ▸ [📋] ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ 💭` (back to planning the fix)
- `{{verify_reason}}` → `re-run after applying the fix to confirm the failure is gone`
- `{{top_roadmap_items}}` → first 3 items from `tasks.md ## Roadmap`
- `{{tail_status}}` → empty

Put `/bencium-next` at the top of the suggestions (next slice — apply the fix the retro identified).

### Step 5 marker (final output)

Emit the retro marker as the **very last** output, after the next-moves template render. Nothing after the closing fence.

```json
{
  "_marker": "bencium-retro-result",
  "version": 1,
  "ts": "<ISO8601 UTC>",
  "phase": "reflect",
  "retro_id": "<NNNN from Step 3>",
  "archive_path": ".harness/archive/NNNN-retro-<slug>.md",
  "trigger": "verify-fail" | "deploy-fail" | "smoke-fail" | "incident" | "other",
  "root_cause": "<one sentence from Step 3 'Root cause'>",
  "proposals": {
    "memory_line": "<text appended to memory.md ## Learnings>" | null,
    "acceptance_row": "<text appended to ACCEPTANCE.md>" | null,
    "hook_path": ".harness/hooks/NNNN-<slug>.sh" | null
  }
}
```

Rules: each `proposals.*` field is `null` if that vehicle was not used (e.g., no testable prevention → `acceptance_row: null`; cause class did not warrant a hook → `hook_path: null`). All three null is valid (the retro produced an archive entry but no permanent upgrade — the archive itself is the record).

## Hard rules

- Be honest. If the root cause was an agent mistake, name it. The loop only learns if retros are accurate.
- Do not propose vague learnings ("be more careful"). Every learning must be specific enough to act on.
- Keep retros to 30-50 lines. Longer means you're writing a report, not a learning.
- **Never propose a hook for every retro.** The Step 4b decision rule is load-bearing — ACCEPTANCE rows remain the default permanent upgrade vehicle; hooks are reserved for the four classes named (repeated detectable mistakes, destructive ops, env-dependent quirks, explicit user request). If you can't name which of the four applies, the answer is "no hook."
- **Never mutate the user's `<project>/.claude/settings.json`.** Always show the snippet and let the user paste it. The hook script alone is inert without the wiring.
- **The Step 5 marker block MUST be the last output** — see the `markers` skill.
