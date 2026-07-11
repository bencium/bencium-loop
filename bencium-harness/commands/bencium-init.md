---
description: Initialize the build harness in this repo (greenfield or brownfield, auto-detected). 5-question interview, single LLM pass, ~60s.
allowed-tools: Bash, Read, Write, Glob, Task, Workflow
---

You are running `/bencium-init` — the kickoff command for the **bencium-harness**.

## Step 1: Detect repo state

Run these checks against the current working directory:

1. `ls -A` — is the directory empty (or only `.git`)?
2. If a `.harness/` folder already exists: STOP. Tell the user the harness is already initialized and suggest `/bencium-feature` to add work, or manual deletion of `.harness/` to reset.
3. Look for: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `README.md`, `src/`, `app/`. If ANY exist, treat as **brownfield**. Otherwise **greenfield**.

## Step 2: Brownfield discovery (skip if greenfield)

If brownfield, decide the discovery path based on repo size:

- **Small / focused repo** — fewer than ~500 tracked files AND no `src/` + `app/` + `packages/` combination (rough proxy: `git ls-files | wc -l` < 500). Do sequential reads in the main context — subagents would add latency for no signal.
- **Large / unfamiliar repo** — everything else. Spawn parallel Explore subagents (see below).

### Small-repo path (sequential)

- Read `README.md` (if present, first 100 lines)
- Read `package.json` / `pyproject.toml` / equivalent (dependencies + scripts only)
- Run `git log --oneline -20` to see recent history
- List top-level directories with `ls -la`

### Large-repo path (parallel Explore subagents — 3-agent cap)

In a **single message** with three parallel `Task` tool calls, spawn three Explore subagents. Each gets a focused, narrow brief and returns a 5-10 bullet report:

- **Agent 1 — structure**: entry points, main modules, build config, top-level architecture (framework, monorepo layout, package boundaries).
- **Agent 2 — data layer**: DB schemas, API surface, external integrations, env-var inventory (what config the app depends on at runtime).
- **Agent 3 — tests + CI**: test framework in use, coverage approach, CI config, existing acceptance/quality checks (so the generated `ACCEPTANCE.md` doesn't duplicate what's already enforced).

Synthesize the three reports into one summary (3-5 bullets total) before continuing.

If a fourth area genuinely matters for this repo (e.g., infrastructure-as-code, mobile platform code), **trim one of the three rather than spawn a fourth** — the 3-agent cap is hard. Print the trim decision inline: `[bencium-init] folding <X> scope into <Y> agent to honor 3-agent cap`.

### Accelerated wider sweep (opt-in, Claude Code only)

For a genuinely large repo the 3-agent sweep can leave blind spots. Purely additive — the 3-agent path above stays the default. Use this only when **both** gates hold, else run the 3-agent path: (a) a `Workflow` tool is available (Claude Code only — absent on Codex/opencode/paste; do not emulate with `Task`), and (b) the user opted in. When both hold, invoke the `Workflow` tool with `.claude/workflows/brownfield-scan.mjs` (fall back to `${CLAUDE_PLUGIN_ROOT}/workflows/brownfield-scan.mjs`); it sweeps more lenses in parallel and synthesizes one brief. Use its `summary` in place of the 3-agent synthesis. This is read-only discovery — it changes nothing about the interview or generation that follows.

### Confirm

After either path, summarize what you found in 3 bullets and confirm with the user before continuing.

## Step 3: The 5-question interview

**Portability note.** If you are running inside Claude Code, use the `AskUserQuestion` tool to present these as multi-choice (it's the native UI and gives the best experience). If `AskUserQuestion` is unavailable (claude.ai, Cursor, Codex, or any non-Claude-Code host), ask the questions inline as a numbered list and wait for the user's reply before continuing. Do not skip the questions either way.

Ask these 5 questions (one at a time, with sensible recommended options based on what you detected in brownfield mode):

1. **Product**: What is this project? (one sentence)
2. **User**: Who is it for? (target user or audience)
3. **Killer feature**: What's the single most important thing it must do well?
4. **Stack**: Primary stack (e.g., Next.js + Supabase + Fly.io, Astro + Netlify, Python + FastAPI). For brownfield, recommend the detected stack as the first option.
5. **Deployment target**: Where does this deploy? (e.g., `fly deploy --remote-only`, `vercel --prod`, `npm publish`, `none yet`). Also ask for a health-check URL or command if applicable.

## Step 4: Generate artifacts (single LLM pass — that's THIS response)

Using the 5 answers, generate ALL of these files in one pass. Use the templates in `${CLAUDE_PLUGIN_ROOT}/templates/` as the structure but fill them with project-specific content. Be concrete, opinionated, and brief. No filler.

**Files to create in the project root:**

- `README.md` — Project name, one-line description, stack, run command, deploy command, license placeholder. ~30 lines.
- `PRD.md` — One-page product requirements: problem, user, killer feature, success criteria, non-goals, open questions. Max 60 lines.
- `ARCHITECTURE.md` — One-page architecture: stack components, data flow (text or mermaid), key decisions, external dependencies, risks. Max 60 lines.
- `tasks.md` — Two sections: `## Now` (10-15 concrete first-sprint tasks derived from the architecture, with `- [ ]` checkboxes) and `## Roadmap` (5-10 later items, dashes only). Each task should be small enough to finish in one session.
- `ACCEPTANCE.md` — 10 concrete, testable acceptance checks tied to PRD's success criteria and to general quality (e.g., "All list endpoints paginated", "Health check returns 200", "No secrets in repo"). Use `- [ ]` checkboxes.
- `CLAUDE.md` — project-root auto-loaded agent context, pointer to `.harness/` and quality gates. ~40 lines. Use `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.tmpl` and substitute `{{product_name}}`, `{{killer_feature_one_liner}}` (a one-sentence form of question 3), `{{stack}}`, `{{deploy_cmd}}`, `{{deploy_health}}` from the 5 answers. This file lets the agent pick up project context even when the bencium-harness plugin is not installed (claude.ai, Cursor, Codex, teammates without the plugin).

**Files to create in `.harness/`:**

- `.harness/config.yaml` — deploy.cmd, deploy.health, rollback.cmd (from question 5). Use YAML.
- `.harness/memory.md` — Hot context. Pre-seed with: project name, killer feature, stack, deploy target, and a line "Initialized $(date -u +%Y-%m-%dT%H:%MZ)". Keep under 50 lines.
- `.harness/conventions.md` — Code-quality rules. Copy from `${CLAUDE_PLUGIN_ROOT}/templates/conventions.md.tmpl`. Tell the user this file is auto-loaded each session and is where they edit project-specific quality rules (file size cap, shadcn/Tailwind preferences, etc.).
- `.harness/rules.md` — Empty with a comment: `# Rules — fill in non-negotiables, or run /bencium-import-rules to pull a starter pack.`
- `.harness/glossary.md` — Empty with a comment: `# Glossary — domain terms used in this project.`
- `.harness/constraints.md` — Empty with a comment: `# Constraints — hard limits (compliance, performance, budget, etc.).`
- `.harness/archive/` — Create as empty directory: `mkdir -p .harness/archive`
- `.harness/state` — Single-line phase state for the optional statusline. Write:
  ```bash
  printf 'phase=roadmap\ntask=harness initialized\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
  ```
  This file is ephemeral session state — recommend adding `.harness/state` to `.gitignore`.

**Optional: scaffold the accelerated workflow scripts (Claude Code only).** These power the opt-in workflow paths in `/bencium-verify`, `/bencium-deploy`, and this command's wider sweep. Copy them into the project only when a `Workflow` tool is available (i.e. you are in Claude Code) — on any other runtime skip this, the scripts are inert there and the commands fall back to the plugin copy or the serial path:

```bash
mkdir -p .claude/workflows && cp "${CLAUDE_PLUGIN_ROOT}/workflows/"*.mjs .claude/workflows/ 2>/dev/null || true
```

This is a convenience, not a requirement — a project with no `.claude/workflows/` still gets workflow mode on Claude Code because the commands fall back to `${CLAUDE_PLUGIN_ROOT}/workflows/`. Recommend committing these so teammates on Claude Code share them.

## Step 5: Summary

Print:

```
bencium-harness initialized ✓
  README.md         ($(wc -l < README.md) lines)
  PRD.md            ($(wc -l < PRD.md) lines)
  ARCHITECTURE.md   ($(wc -l < ARCHITECTURE.md) lines)
  tasks.md          (N tasks, M roadmap)
  ACCEPTANCE.md     (10 checks)
  CLAUDE.md         ($(wc -l < CLAUDE.md) lines)
  .harness/         (config, memory, conventions, rules, glossary, constraints, archive)

Build loop:
  🗺️  roadmap   →  📋 plan/spec   →  🔨 build   →  ✓ test   →  💭 reflect   →  🚀 deploy
  tasks.md      /bencium-next A    /bencium-next B   /bencium-verify   /bencium-retro   /bencium-deploy

  📋 = mandatory review gate before any code is written. The plan IS the spec.

Next: /bencium-next to pick the first task. It will plan first and wait for your approval before coding.
```

## Hard rules

- Never overwrite existing files without explicit confirmation. If a file exists, show diff and ask.
- Keep generated content concrete. No placeholder text like "TODO: describe X" — write actual content from the answers.
- Do not invent features the user didn't mention.
- Do not add dependencies, run installs, or modify any source code.
- **Brownfield discovery uses Explore subagents only on the large-repo path.** Never spawn subagents for greenfield init or a small brownfield repo — they add latency for no signal. The 3-agent cap is hard; trim scope rather than exceed it.
- **The 3-agent cap governs `Task` subagents.** The accelerated wider sweep and the scaffolded workflow scripts are Claude-Code-only, opt-in escalations — separate from the cap and never automatic. Everything the harness generates works identically without them; they only ever speed the read-only discovery and verification surfaces.
