---
name: context-loader
description: Auto-loads the bencium-loop project memory at the start of every session. Triggers when the cwd contains a .harness/ folder. Reads .harness/memory.md, .harness/rules.md, and the last 3 entries in .harness/archive/ to restore project context across /clear and session boundaries.
---

# context-loader

## When to invoke

At the start of any session (or when explicitly asked to refresh context) IF the current working directory contains a `.harness/` folder.

You should also invoke this skill whenever:

- The user runs `/clear` and you need to re-establish project context.
- The user asks "what was the context?" or "where were we?" and a `.harness/` exists.
- You're about to make an architectural recommendation and want to check existing decisions first.

## What to do

1. Verify `.harness/` exists in the project root. If not, do nothing — this is not a bencium-loop project.

2. Read these files (in this order):
   - `CLAUDE.md` (project root) — pointer file. Skim only; the detailed files it points to are the authoritative source. Skip if absent.
   - `.harness/memory.md` — hot context. Read in full.
   - `.harness/conventions.md` — code-quality rules the agent must follow on every task. Read in full. If missing, note "no conventions.md — running without quality guardrails" internally.
   - `.harness/rules.md` — non-negotiables. Read in full.
   - `.harness/constraints.md` — hard limits. Read if non-empty.
   - The most recent 3 entries in `.harness/archive/` — find by `ls .harness/archive/ | sort -r | head -3`. Read each in full.
   - `tasks.md` (project root) — read the `## Now` section only.
   - `ACCEPTANCE.md` (project root) — read all unchecked items.

3. Internally summarize what you learned. Do NOT print the summary to the user unless they ask — this is context for YOU. If `.harness/memory.md` contains a `## Session handoff` block, treat it as the **most recent state** — that's where the last session said it left off (active task, phase, up next, blockers, uncommitted files). Start there.

4. If you find anything in memory or recent archive that directly contradicts what the user just asked, surface it: "Heads up: a decision in archive/NNNN says X — does this still apply, or has it changed?"

## What NOT to do

- Do not load this if `.harness/` doesn't exist. Stay silent.
- Do not load this on every prompt. Once per session is enough unless the user explicitly asks to refresh.
- Do not dump the memory file contents into the chat. Use it as context.
- Do not modify any files when loading context. This is read-only.
