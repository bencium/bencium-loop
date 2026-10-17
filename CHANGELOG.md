# Changelog

Release codenames follow the format `<Month> <Theme>` (e.g. "May Gate"). They're the human-friendly identifier — refer to releases by codename in conversation. SemVer numbers stay in `plugin.json` / `marketplace.json` for Claude Code's plugin manager only.

Theme vocabulary (pick one when cutting a release):
**Foundations** (scaffold/restructure), **Gate** (approval/quality gate), **Polish** (UX/cosmetic), **Hardening** (security/validation), **Loop** (build-loop flow changes), **Memory** (memory.md changes), **Compass** (clarity/observability), **Bridge** (integration), **Lantern** (debugging/transparency), **Anchor** (backwards-compat/stability).

---

## Unreleased

Answers three structural criticisms that survived the v0.8.0 bug fix — they were about what the loop *is*, not about defects. Theme when cut: **Anchor**.

### Fixed — the gates themselves

A review of the three gates found that two of them blocked legitimate work, and one did nothing at all for the most common deploy commands. None of this had tests; now all three do (`tests/hooks.test.mjs`, 20 cases, run against a throwaway repo).

- **Deploy gate never fired for short deploy commands.** The rendered template puts a comment after the value (`cmd: "fly deploy"   # full command…`), and the parser kept a stray closing quote, so it waited for `fly deploy"` and let `fly deploy` straight through. Any 1–2 word command (`fly deploy`, `npm publish`, `vercel --prod`) was ungated.
- **Deploy gate blocked unrelated commands.** It matched on the first two words, so `deploy.cmd: npm run deploy` also refused `npm run test` — which could stop `/bencium-verify` from ever passing, and so block the deploy for good. It now matches the whole configured command, and still recognises it when chained (`cd app && fly deploy`), prefixed (`TOKEN=… fly deploy`) or re-spaced.
- **Deploy gate ignored edits made after verify.** The receipt now carries `tree=`, a fingerprint of uncommitted changes outside `.harness/`, and the gate refuses if it no longer matches. Receipts written before this change have no `tree=`, so run `/bencium-verify` once more before the next deploy.
- **`/bencium-deploy` carried on after a partial verify, straight into the gate's refusal.** Step 2 now stops on `partial` as well as `fail`: a skipped check is an unproved check.
- **Acceptance gate blocked un-ticking.** It searched the whole edit, including the text being replaced, so `/bencium-rollback` un-checking a `[deployed]` row was refused — as was `/bencium-init` writing a fresh `ACCEPTANCE.md` (the template's legend quotes the pattern), and any rewrite of a file that already had a ticked row. It now compares ticked `[deployed]` rows before and after, and blocks only when the count goes up. This needs `node` on PATH (already required for the workflows); without it the gate refuses edits to `ACCEPTANCE.md` rather than guessing.
- **Codex sync** still said "Bencium Harness" after the rename, pointed its privacy/terms links at openai.com, and left the old `bencium-harness` plugin registered, so Codex would load every skill twice. Sync now removes the old entries from `config.toml` (after the existing backup) and no longer adds a blank line on every run.

### Changed — renamed from `bencium-harness` to `bencium-loop` (v0.9.0)

The project always described itself as a loop — "six-phase loop", "a build loop that no vendor can switch off" — while calling itself a harness. "Harness" is a term of art that only parses for people already deep in agent tooling; "loop" explains itself and is the word the docs were already using to do the actual work.

**Nothing in an existing project changes.** The `.harness/` folder keeps its name and its contents. No migration, no renamed files, no edits to anything already scaffolded.

**Commands are unchanged.** `/bencium-init`, `/bencium-next`, `/bencium-verify` and the rest never contained "harness" — only the plugin namespace did.

What did change: the plugin and marketplace names, the source directory (`bencium-harness/` → `bencium-loop/`), the statusline script (`harness-status.sh` → `loop-status.sh`), the `[bencium-harness]` prefix on blocked-gate messages, and the repo URL. GitHub redirects the old URL, but the plugin name is an install key and does not redirect — reinstall once:

```
/plugin uninstall bencium-harness@bencium-marketplace
/plugin install bencium-loop@bencium-marketplace
```

If you wired the statusline into `~/.claude/settings.json`, update the path to `statusline/loop-status.sh`. Entries below v0.9.0 keep the old name — they describe what actually shipped.

### Added — two more gates, so the loudest claims are mechanism

The README said "refuses on verify fail". What existed was a command *instructed* to refuse. Persuasion works most of the time, and the gap opens exactly where you would want the gate: a long session, a tired user, a model under context pressure.

- **Deploy gate** (`hooks/deploy-gate.sh`, `PreToolUse` on Bash). Reads `deploy.cmd` from `.harness/config.yaml`, matches on its first two tokens so `npm publish` cannot catch `npm test`, and refuses the deploy unless `.harness/last-verify` shows `result=pass` for the **current HEAD**. A receipt from an earlier commit proves nothing about what is about to ship.
- **Acceptance gate** (`hooks/acceptance-gate.sh`, `PreToolUse` on Edit/Write). Refuses to tick a `[deployed]` row in `ACCEPTANCE.md` unless the phase is `smoke`. It matches the literal `[x] [deployed]` in the raw tool payload — brackets and spaces are not JSON-escaped, so no parsing is needed. This is what v0.8.0's tag-preservation fix bought: something exact to match on. Un-ticking never matches, so `/bencium-rollback` still reverts those rows.
- **The verify receipt** — `/bencium-verify` Step 6.5 writes `.harness/last-verify` with result, sha, and timestamp on every run. A `fail` receipt matters as much as a `pass` one: writing nothing would leave the previous verdict standing while the code moved on.

Three gates now exist on Claude Code and nowhere else. `INSTALL.md`, `CODEX.md` and the README say so plainly rather than implying parity.

### Removed — the parallel batch build

`workflows/batch-build.mjs`, `/bencium-next` Steps 4.1b and 4.1c, and their tests are gone.

It bought throughput on the one part of the loop that was never the bottleneck — the bottleneck is the human reading the plan — and it was the only fan-out that wrote code, which is where three of v0.8.0's four bugs came from, including tasks being ticked while the code sat in unmerged worktrees. That is the signature of a feature added because it was possible rather than because it was needed, so this is the loop's own "strip pieces no longer load-bearing" principle turned on itself.

Every remaining accelerated path (`verify-acceptance`, `smoke-deployed`, `brownfield-scan`) is read-only, which is a cleaner boundary than the one it replaces. Splitting an oversized task into sub-tasks at the PLAN gate stays — that was always the useful half. `/bencium-next` no longer needs the `Workflow` tool, and its build marker no longer carries `mode` / `agents`.

### Added — a feedback loop for bencium-loop's own instructions

Across v0.5.0 → v0.8.0 no command file ever shrank, and nothing would have said when rule count started costing compliance.

- **`tests/rule-budget.test.mjs`** — per-command line and hard-rule budgets plus fleet totals, locked at current counts with no headroom. Verified to fail on a single added line. Raising a budget is a visible diff, not a drift.
- **`CONTRIBUTING.md`** — a release that adds a hard rule should remove or subsume one; if a count goes up, the CHANGELOG says why. Also documents the hook conventions and the no-`jq` rule.
- Stated plainly in the test and the docs: **it measures volume, not compliance.** A file under budget is not evidence the rules are still followed. Claiming otherwise would be the same overclaim being fixed elsewhere in this release.

### Changed — consolidation and honest copy

- **New `invariants` skill** — the four ordering invariants and the three evidence rules, each with its reason and its real enforcement status, stated once. They had been restated across `bencium-verify.md`, `bencium-deploy.md`, `bencium-next.md` and `conventions.md.tmpl`.
- **New `markers` skill** — the shared marker contract (placement, state-not-opinion, versioning), which had been repeated six times across four commands.
- Hard rules across the fleet: **53 → 47**. Lines: 1397 → 1377. The line count barely moved because a reference costs nearly what a restatement costs; the rule count is the number that bears on instruction-following.
- **README**: the comparison table no longer reads like mechanism, and a new "What's enforced, and what's asked for" section maps every invariant to hook, code, or asked. The browser-tools section no longer implies the terminal enforces everything.
- **Landing page**: "It will not call something done until it is" became "without proof"; the deployed-row claim now says the tool blocks it; a new row states which three rules are enforced and that the rest are conventions.
- `bencium-verify.md`'s line budget was raised 223 → 233 for the receipt step — recorded here because that is the rule.

### Deliberately not fixed

- **RED → GREEN stays advisory.** Enforcing it would need a hook that knows which file is the test and whether it was seen failing for the right reason. That is not reliably decidable from a tool call, and a gate that misfires on legitimate work is worse than no gate. It is listed as `asked` rather than papered over.
- **The phase-state write snippet stays inline** in all 12 places rather than being folded into a skill. It would have saved ~24 lines, but `.harness/state` is now the input to two hooks, and replacing an exact copy-pasteable command with a reference is the wrong trade when the mechanism depends on it.

---

## Jul Hardening — v0.8.0 (2026-07-25)

Correctness pass over the v0.7.0 accelerated mode, plus the first two things in the harness that *enforce* rather than *ask*: a PLAN gate wired as a real hook, and a test suite the harness runs against itself.

The release exists because a review found that the accelerated SMOKE path reported **pass** when every one of its agents died — `[].every()` is `true` — so `/bencium-deploy` would tick the `[deployed]` rows and call a feature shipped with nothing proved against the live URL. That is the exact false confirmation the TEST/SMOKE split was built to prevent, reached from inside the harness's own code. Three related silent-drop bugs shared the cause, and the parallel batch build turned out to strand its output in worktrees nobody merged while still marking tasks done.

Nothing here changes the serial path's behavior. The accelerated paths stay opt-in and Claude-Code-only; the marker schemas gain only additive fields at `version: 1`; a repo set up by an older version keeps working. The one genuinely new behavior is the PLAN gate hook, which is inert outside a `.harness/` project and in every phase but `plan`.

### Fixed — false greens

- **A smoke run whose agents all died reported PASS.** `smoke-deployed.mjs` classified the result with `clean.every(r => r.status === 'pass')`, and `[].every()` is `true`. Rows dropped out of `clean` whenever an agent returned `null` (the documented behavior when a subagent dies or is skipped), because the `.then()` threw and `parallel()` converts a throwing thunk to `null`. With every row dropped, `/bencium-deploy` checked off the `[deployed]` rows and declared the feature shipped — precisely the false confirmation the SMOKE phase exists to prevent. Zero evaluated rows is now a FAIL, and no row can leave any workflow without a verdict.
- **Rows vanished silently from the accelerated verify and batch build** for the same reason. All three fan-out scripts now return one result per item they were given; an item that could not be evaluated comes back `fail` with `unverified: true` and a reason. The commands report the count (`N row(s) could not be evaluated`) rather than folding it into the failure total.
- **A PASS whose skeptic never ran no longer stays green.** An unrun refutation means nothing confirmed the pass — it fails as unverified.
- **`agents` counts in the markers were wrong.** `batch-build` reported `items.length * 2` even though items failing the build gate never spawn a reviewer; `verify-acceptance` reconstructed the count from surviving rows. Both now count the agents actually spawned.

### Fixed — the batch build stranded its own output

- **Worktree code never came back.** Builders run in isolated worktrees, nothing merged them, and `/bencium-next` still marked tasks `- [x]`. Each builder now commits on a `batch/<slug>` branch and returns it; a build that reports complete without a branch cannot pass. New **Step 4.1c (merge back)** merges those branches into the main worktree, re-runs the full test command *there*, and only then may a task be checked off. New hard rule: a worktree green is not a green.

### Fixed — invariants the harness stated but broke

- **A rollback left `[deployed]` rows checked.** New Step 5.5 un-checks every deployed row the rolled-back deploy had flipped. What was proved against the previous deployment is not proved against what is live now.
- **Checking off a `[deployed]` row destroyed its tag.** SMOKE now writes `- [x] [deployed] X`, and `/bencium-verify` treats a `[deployed]` tag anywhere on the line as deferred. Previously an unchecked row came back as a plain local row and would be evaluated against the working tree.
- **`/bencium-rollback` printed a SHA it never captured.** It now runs `git rev-parse` in Step 1, or reports `unknown` — reconstructing it from context is inventing evidence. Rollback also gained a `bencium-rollback-result` marker; it was the only state-changing step without one.
- **The statusline hid the deployed gap.** It counted only `- [x]` and `- [ ]`, so `[deployed]` rows were invisible: 7 local + 3 deployed rendered as a fully green `7/7 ✓`. Local and deployed ratios are now separate — `7/10 ✓ · 1/3 🔥` — and a project with no deployed rows shows `— 🔥` rather than nothing.

### Fixed — hooks that could never fire

- **Every hook `/bencium-retro` proposed was inert.** The settings.json snippet used `matcher: {tool, pattern}`, a top-level `command`, and a `blocking` field. The real schema takes a string `matcher` (tool name only), a nested `hooks` array of `{type: "command", ...}`, and `if` for command-level filtering — and there is no `blocking` field, because exit 2 is what blocks. Corrected, with the three easy-to-get-wrong parts named.
- **The shipped `post-commit-nag.sh` had never run.** A plugin registers hooks through `hooks/hooks.json`, which did not exist. It does now, with the nag scoped by `"if": "Bash(git commit*)"` — the command-text filtering its own header comment always claimed.

### Added

- **An enforced PLAN gate** (`hooks/plan-gate.sh`, `PreToolUse` on Edit/Write/NotebookEdit). While `.harness/state` says `phase=plan`, an edit is refused with exit 2. PLAN→BUILD was the harness's headline invariant and, until now, a sentence in a prompt. The PROTOTYPE detour's disposable paths stay exempt. Silent outside a `.harness/` project and in every other phase. Claude Code only — on Codex the gate remains advisory, and `CODEX.md` now says so.
- **A test suite for the harness itself** (`tests/`, `node --test`, no dependencies). The workflow scripts are not importable modules — the runtime evaluates them with injected globals and a legal top-level `return` — so `tests/harness.mjs` loads each one the same way and drives it with fake agents that reproduce the runtime's null-on-death semantics. 17 cases; the first is the empty-array false PASS, and it was confirmed red against the old code before the fix.
- **`accelerated-mode` skill** — single source of truth for the workflow fan-out: the two gates, the fallback rule, the guardrails, and the marker fields. The same contract had been copied into four command files.

### Changed

- **`conventions.md.tmpl` is now stack-neutral.** It previously baked one person's stack into every generated project — component library, styling, localization, and skill names that only resolve on one machine. The generic rules (file size, LSP-before-edit, ordering invariants, cost, UI disclosure, TDD, the TEST/SMOKE split) stay; stack specifics became a "fill these in" block, and per-project rules live where they belong, in `.harness/rules.md`. `/bencium-next`'s plan block no longer names design skills that may not exist.
- **Marker schemas gained states they were already producing.** The smoke marker takes `partial` and a row status of `skip` (the prose allowed SKIP; the schema had nowhere to put it), plus an `unverified` count. The verify marker gained `unverified`. Still `version: 1` — additive only.
- **Four stale phase-progress strips** in `/bencium-retro`, `/bencium-promote` and `/bencium-next` were missing 🚀 and 🔥, and `/bencium-init` printed the loop in the wrong order with SMOKE absent — all contradicting the `phase-banner` skill they were supposed to follow.
- **`/bencium-init` no longer points at `/bencium-import-rules`**, a command that has never existed; it renders `rules.md.tmpl` instead.
- `allowed-tools` corrected: `/bencium-decide` can `Edit` (it appends to memory.md), `/bencium-next` can `Glob`/`Grep` (its own hard rule promised them).
- `CODEX.md` was a raw chat transcript pointing at a `/private/tmp` installer hardcoded to 0.4.0, while `scripts/sync-codex-adapter.mjs` already solved the problem properly. Rewritten as documentation.
- `INSTALL.md`: hardcoded `0.1.0` cache paths, a chmod step the hook registration makes unnecessary, and a personal absolute path — all removed. New section documenting the two automatic hooks.
- `.agent-logs/` is gitignored. Session transcripts were one `git add -A` from being published.

---

## Jul Bridge — v0.7.0 (2026-07-11)

Bridges the harness to Claude Code's **dynamic-workflow runtime** — an optional faster gear for the slow, repetitive parts of the loop — without touching what makes the harness portable or disciplined. The headline is an opt-in **accelerated mode** that fans read-only and pre-approved work out across many short-lived agents; the release also cuts the previously-unreleased 🎨 PROTOTYPE detour and the plain-English README repositioning. Everything is **purely additive and backward compatible**: the serial, one-step-at-a-time path stays the default on every surface, the hard 3-agent cap on `Task` subagents is unchanged (workflow mode is a *separate* escalation, not a loosening), marker JSON gains only optional fields at `version: 1`, and a repo set up by an older version keeps working. Two gates keep the accelerator honest — it runs only when a `Workflow` tool is present (Claude Code only; Codex/opencode/paste fall through to serial) **and** the user opts in per run, because a workflow spawns many agents (up to 16 concurrent, 1000 lifetime) at real token cost.

### Added
- **⚡ Accelerated mode — opt-in Claude Code workflow fan-out.** A new, purely additive capability layer over four surfaces: `/bencium-verify` (Step 3c — shard the ACCEPTANCE walk, adversarially re-check each PASS), `/bencium-deploy` SMOKE (parallel `[deployed]`-row checks against the live URL), `/bencium-init` brownfield discovery (wider multi-lens sweep), and `/bencium-next` (Step 4.1b — worktree-isolated batch build of pre-approved, independent, mechanical sub-items). Backed by four scaffolded scripts in `bencium-harness/workflows/` (`verify-acceptance`, `smoke-deployed`, `brownfield-scan`, `batch-build`), copied into a project's `.claude/workflows/` by `/bencium-init` on Claude Code. **Two hard gates, both required, or the serial path runs unchanged:** (1) a `Workflow` tool is available — it exists *only* in Claude Code, so Codex/opencode/paste surfaces fall through to the serial/3-agent path (the Codex adapter now says so explicitly); (2) explicit user opt-in per run — never automatic, because a workflow spawns many agents (up to 16 concurrent, 1000 lifetime) and costs tokens. Mechanical stages default to Haiku, adversarial-verify/synthesis to Sonnet. **Reconciled with the 3-agent cap without weakening it:** the cap still governs `Task` subagents; workflow mode is a separate, named escalation not bound by it. Fully backward compatible — marker JSON gains optional additive `mode`/`agents` fields at `version: 1` (absent = old serial behavior); projects with no scaffolded `.claude/workflows/` still work via the plugin-root fallback. The build fan-out (Step 4.1b) is the only gate-adjacent surface and is fenced hard: the PLAN→BUILD gate stays serial and human-approved, per-item RED→GREEN is never skipped, and only independent worktree-isolated work fans out.
- **🎨 PROTOTYPE detour in `/bencium-next` (Step 2.5).** Optional pre-PLAN step, UI tasks only: scaffolds a *throwaway* one-route preview (via the `prototype` skill) to a disposable location (`_prototype/` or `.harness/prototype/`) so you can eyeball look-and-feel before committing to a spec, then folds the chosen direction into the plan. Writes only throwaway code — never real source, no tests, not counted toward `ACCEPTANCE.md`. Opt-in (`prototype` vs `plan`); pure backend/data/infra tasks skip it silently. It is the *one* place `/bencium-next` writes before the PLAN gate; PLAN itself stays 100% read-only.
- **PROTOTYPE phase in `phase-banner`** (orange / 🎨). A transient detour prefix `[🎨]` only — it deliberately never enters the canonical 7-phase progress strip, which stays stable across projects.
- **"Explain the loop step" convention** (`conventions.md.tmpl`). At each loop step the agent briefly explains what it's doing and *why* (motivation first, then mechanics; cite real `file:line`) — no quizzes, checklists, or persona.
- **"Browser & UAT testing" stack preset** (`conventions.md.tmpl`). Tool-agnostic guidance enforcing the local **TEST** (`✓`) vs deployed **SMOKE** (`🔥`) split: Claude-in-Chrome (Anthropic-maintained) for interactive deployed UAT; pick-your-own E2E runner (Playwright / Cypress / WebdriverIO / Selenium — none imposed) wired into `verify.cmd` for the local gate; Vibium flagged *watch-tier* (pre-functional, single-maintainer — fails the adoption bar) until packages ship.

### Changed
- **README rewritten in plain English and repositioned beyond the terminal.** Drops Claude-Code-specific framing in favor of "agentic coding tools like codex, opencode," and adds a **"Use it in browser and desktop AI tools"** section with copy-paste **Install / Resume / Run** prompts that point any URL-reading AI (claude.ai, the Codex app, ChatGPT, Gemini) at the repo to set up and drive the harness without a plugin. Jargon glossed throughout; install/uninstall/recommended-MCP/marker/walkthrough sections trimmed for scannability.
- **`bencium-marketplace` is now the primary install path** (`/plugin marketplace add bencium/bencium-marketplace`).

---

## Jun Hardening — v0.6.0 (2026-06-03)

Adopts the highest-value lessons from Anthropic's *Harness design for long-running application development* (Mar 2026) that the harness wasn't yet using. The article's central finding — an agent grading its own work skews positive, and *separation* is the strongest fix — exposed that `/bencium-verify` ran in the builder's own context. This release closes the self-evaluation gap and hardens green-means-shipped. **No new commands** (count stays 9): the verification changes are internal steps, and the context-handoff lesson is carried by the existing nudge points rather than a new command — keeping with the article's own "strip pieces no longer load-bearing" principle.

### Added
- **Independent evaluator in `/bencium-verify` (Step 3b).** When verify runs in the same session that built the feature — or for subjective rows easy to rationalize — it now delegates a skeptical second opinion to a `Task` subagent that did NOT write the code ("default to FAIL when evidence is thin"), reconciling to the stricter verdict. Bounded by the hard 3-agent cap (one verifier is the norm). Directly adopts the article's single biggest lever: *separating the agent doing the work from the agent judging it.* `Task` added to `/bencium-verify` `allowed-tools`.
- **Gamed-test / reward-hacking inspection in `/bencium-verify` (Step 3a).** Before trusting any green check, verify inspects the test/config diff for weakened or skipped assertions, hardcoded echo values, tests edited to fit the code, blind snapshot updates, and scope-narrowed `verify.cmd`. A gamed pass is recorded as FAIL with file:line evidence regardless of the green result. Addresses the article's warning that agents optimize for the metric they're graded on.
- **`## Session handoff` block in `memory.md.tmpl`.** A volatile, overwrite-in-place slot for "where we are right now" (active task · up next · blockers · uncommitted files). The existing `next-moves.md.tmpl` "Token checkpoint" nudge now tells the agent to refresh it before `/clear`/compaction when stopping mid-task, and `context-loader` treats it as the most recent state on SessionStart. This is the article's "context resets need a handoff artifact with enough state to pick up cleanly" — carried by existing systems, not a new command. (Considered a dedicated `/bencium-checkpoint` command and rejected it as surface-area bloat: native compaction + `context-loader` already cover most of it.)

### Hard rules added
- `/bencium-verify`: a gamed pass is a FAIL (green is necessary, not sufficient — the test must still assert the real behavior); prefer Step 3b separation on self-authored work and take the stricter verdict unless it can be refuted with concrete evidence.

### Fixed
- `marketplace.json` plugin `version` was stale at `0.2.0`; bumped to `0.6.0` to match `plugin.json`.

### Considered, not included
- A dedicated `/bencium-checkpoint` command (folded into the handoff nudge above instead).
- A standalone `/bencium-review` fresh-context code reviewer (sibling of the Step 3b evaluator) — available on request.

---

## Jun Lantern — v0.5.0 (2026-05-29)

Makes harness reports legible to downstream automation, sharpens the project-rules scaffold, and surfaces the "ordering invariant" pattern as a first-class concept. The harness now signals state in machine-readable form at every loop boundary so CI scripts, dashboards, and follow-up commands can consume it directly without scraping prose.

### Added
- **Machine-readable marker JSON blocks** at the end of `/bencium-verify` (Step 8), `/bencium-deploy` Step 5.5 SMOKE, `/bencium-deploy` Step 6 full success, and `/bencium-retro` Step 5. Each marker is a fenced ```` ```json ```` block emitted as the **last** output of its step (nothing after the closing fence). Schema version `1`, all share `_marker` / `version` / `ts` / `phase` fields. The four marker names: `bencium-verify-result` (hard checks + local soft checks + deferred-to-smoke), `bencium-smoke-result` (deploy URL + sha + per-row result against the live URL), `bencium-deploy-result` (sha + target + health + smoke summary), `bencium-retro-result` (retro id + archive path + trigger + root cause + the three permanent-upgrade proposals). Unlocks CI integration, deploy gates, "fix the findings" follow-up patterns, and status badges — without any tool shipping. Document the marker contract in README "Machine-readable markers" section.
- **"Ordering invariants" section in `conventions.md.tmpl`.** Names the harness's four encoded invariants (PLAN→BUILD, RED→GREEN, VERIFY→DEPLOY, DEPLOY→SMOKE) and explains the pattern so users can declare their own project-specific invariants in `.harness/rules.md` (migration before seed, auth before routes, etc.). Document the *why* on each invariant — without rationale, the agent guesses and may permit clever-but-wrong shortcuts.

### Changed
- **`rules.md.tmpl` re-scaffolded** with DO / DO NOT / Ordering-invariants three-section structure. Replaces the prior flowing-bullet examples. `(example)` prefix on every seed bullet lets the user grep-delete the scaffolding without rereading the file. Sharper format, easier to enforce per turn.

### Hard rules added
- `/bencium-verify`, `/bencium-deploy`, `/bencium-retro`: the marker block MUST be the last output of its step (nothing after the closing fence). Markers report state, not opinion — no recommendations inside the JSON. Schema is versioned (`version: 1`); future changes bump the integer.

---

## Jun Compass — v0.4.0 (2026-05-28)

Closes the three Level-1 harness gaps named by the "model + harness" worldview: retro can now propose **hooks**, not just docs; the conventions template treats **LSP diagnostics** as a pre-edit check; and brownfield `/bencium-init` uses **parallel Explore subagents** (3-agent cap) to map large unfamiliar repos without bloating the main context. Every mistake becomes a permanent upgrade — now at the hook layer, not only the doc layer.

### Added
- **Retro proposes a hook (Step 4b in `/bencium-retro`).** When the root cause is a destructive op (`rm -rf`, force-push, schema drop), a repeated detectable mistake (`SELECT *`, banned import path), an env-dependent quirk that costs more to verify than to block, or an explicit user request, the retro drafts a `.harness/hooks/NNNN-<slug>.sh` script + a `<project>/.claude/settings.json` wiring snippet, asks approval, then writes the script and logs the new `## Hooks added` line to `memory.md`. Hooks live in `.harness/hooks/` and ARE committed (project policy, like `ACCEPTANCE.md`). The harness never mutates `settings.json` directly — user pastes the snippet. Decision rule is load-bearing: hooks are reserved for the four classes above; ACCEPTANCE rows remain the default permanent-upgrade vehicle.
- **LSP pre-edit check in `conventions.md.tmpl`.** New section between "Stack defaults" and "Token-cost discipline" instructs the agent to read language-server diagnostics for the file before editing it (tsserver/ts for TS/JS, pyright + ruff for Python, gopls for Go, rust-analyzer for Rust). Auto-loaded by `context-loader` each session, so the rule reaches every `/bencium-next` plan without new plumbing. Prevents the "agent wrote code that doesn't compile" failure class up front rather than at verify time.
- **Parallel Explore subagents in `/bencium-init` brownfield discovery.** Step 2 now tiers: small/focused repos (<500 tracked files, no `src/`+`app/`+`packages/` combo) keep the sequential reads; large/unfamiliar repos spawn three Explore subagents in parallel — structure (entry points, build config, layout), data layer (DB schemas, API surface, env-var inventory), tests + CI (framework, coverage, existing quality gates). Each returns a 5-10 bullet report; main context synthesizes. `Task` added to `/bencium-init` `allowed-tools`. The 3-agent cap is hard — a fourth area gets folded into one of the three, never spawned.

### Changed
- `/bencium-retro` Step 5 confirmation now includes a `✚ Hook:` line alongside the existing `📝 Memory:` and `✅ Acceptance:` lines, so the user sees all three permanent-upgrade vehicles in one print block.
- `/bencium-retro` hard rules now name the four hook-warranting cause classes explicitly and forbid `settings.json` mutation by the plugin.
- `/bencium-init` hard rules now forbid spawning Explore subagents for greenfield init or small brownfield repos (latency for no signal) and reiterate the 3-agent cap.

---

## Jun Gate — v0.3.0 (2026-05-27)

Closed the false-confirmation gap that let local-pass features get marked shipped without ever being verified on the deployed env, added the token-checkpoint and close-the-loop advisories, and added a persistent Claude Code statusline plus AskUserQuestion portability so the same command prompts work outside Claude Code. The harness now refuses to confuse "passes on my machine" with "deployed and working" — and the loop's current phase is visible at all times.

### Added
- **Token checkpoint advisory** — `next-moves.md.tmpl` now ends with a 💡 block nudging `/clear` and naming exactly what `context-loader` restores on SessionStart (`.harness/memory.md`, `rules.md`, `conventions.md`, last 3 archive entries, `## Now`, unchecked `ACCEPTANCE.md`). Rendered at every natural loop boundary: `/bencium-verify` (PASS or FAIL), `/bencium-retro`, `/bencium-deploy` success (Step 6 now renders the template), and `/bencium-promote` after Mode 1 task promotion (Mode 2 memory demotion is intentionally exempt — it's housekeeping, not a slice boundary).
- **Close-the-loop guidance after BUILD** — `/bencium-next` Step 4 (BUILD success) now renders `next-moves.md.tmpl` instead of printing a one-line `Next:` hint. The `{{tail_status}}` slot carries an explicit 🔁 line walking the user through `/bencium-verify → /bencium-retro → memory.md → /clear`, so the loop-closing sequence (and where learnings get banked) is visible at every BUILD-end rather than implied.
- **Statusline script** at `bencium-harness/statusline/harness-status.sh` — two-row Claude Code status bar showing the phase-progress strip (current phase wrapped in `[ ]`), project name from `.harness/memory.md`, current task, `## Now` count, ACCEPTANCE ratio, model display name, session cost, and context-window %. Pure bash + awk + grep, <50ms per render, silent outside harness projects. Plugins cannot register statuslines declaratively, so the install snippet for `~/.claude/settings.json` is in `INSTALL.md` under "Statusline (optional)".
- **`.harness/state` phase file** written by every `/bencium-*` command on entry (except `/bencium-decide`, which is meta and leaves prior phase intact). Format: `phase=<roadmap|plan|build|test|deploy|smoke|reflect>\ntask=<title>\nupdated=<iso8601>`. Used by the statusline; ignored by `context-loader` (agent already knows its phase from the running command). Templated `README.md.tmpl` now recommends adding `.harness/state` to `.gitignore`.
- **`Bash` added to `/bencium-feature` allowed-tools** so it can write `.harness/state` alongside its existing Read/Edit/AskUserQuestion permissions.
- **`AskUserQuestion` portability note** in `/bencium-init` Step 3, `/bencium-feature` Step 4, and `/bencium-rollback` Step 3 — the three commands that use the Claude Code-only `AskUserQuestion` tool. Each prompt now instructs the agent to use `AskUserQuestion` if available (Claude Code) and otherwise ask inline as a numbered list (claude.ai, Cursor, Codex). Same prompt works in any host without manual edits.
- **TDD red→green hard gate in `/bencium-next` BUILD phase.** Phase A plan template now REQUIRES `Failing test (red):` and `Deployed-env check (smoke):` fields. Phase B Step 4.0 RED writes the declared test, runs it, observes failure for the expected reason — implementation editing is blocked until red is seen. Step 4.2 confirms green after implementation. Bypass requires `none — trivial (declared)` or explicit `skip tdd` + justification logged to `.harness/memory.md ## TDD bypasses`.
- **`🔥 SMOKE` phase** in `phase-banner` skill (bright magenta `\033[95m`), wired into the loop strip as `🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ 💭`.
- **Step 5.5 SMOKE in `/bencium-deploy`** — after health check, re-walks every `[deployed]`-tagged ACCEPTANCE row against `deploy.url` with real HTTP. Any FAIL → memory line `DEPLOYED BUT SMOKE FAILED <sha>`, auto-invoke `/bencium-retro` with `trigger=smoke-fail`, offer rollback. Only SMOKE may mark `[deployed]` rows `[x]`.
- **`deploy.url` config key** in `.harness/config.yaml`. `/bencium-deploy` refuses to run if `deploy.url` is missing while `[deployed]` rows exist — silent-skip is the failure mode this release was built to prevent.
- **`[deployed]` tag convention** in `ACCEPTANCE.md` — items tagged this way are skipped by `/bencium-verify` (reported as DEFERRED-TO-SMOKE) and re-walked by SMOKE.
- **UI-disclosure convention** in `.harness/conventions.md` and a matching ACCEPTANCE row — every async action must surface loading / progress / error in the UI. Silent fetches, console-only errors, and unannotated long-running work are now first-class quality bugs.
- **Landing page (`site/index.html`)** refreshed: new hero copy, 7-phase loop strip including SMOKE card, decisions terminal rows for TDD gate and deployed verify, stats now show `7 loop phases / 2 verify gates`.

### Changed
- `/bencium-verify` report now splits soft checks into "local" and "deployed-env (deferred)" blocks. Result line: `N PASS, N FAIL, N SKIP, N DEFERRED-TO-SMOKE`. Marking `[deployed]` rows `[x]` from local state is now a hard rule violation.
- `bencium-next.md` hard rules: BUILD will not edit implementation files without red observed; task is not done until local test passes AND any related `[deployed]` row passes against the live URL.
- Phase-banner skill: removed the "six-phase loop" framing — TEST (local) and SMOKE (deployed) are deliberately separate phases with distinct colors so the gap is visible.

### Fixed
- The Netlify-class false confirmation where a feature passed local verify, passed health check, and got logged as shipped without ever being exercised on the deployed env. Now structurally impossible: `[deployed]` rows cannot be checked off without live-URL evidence, and deploy refuses to run without `deploy.url` when those rows exist.

---

## May Gate — v0.2.0 (2026-05-23)

Added the mandatory plan/spec gate so the agent cannot jump into coding without showing you a reviewable plan first.

### Added
- **Two-phase `/bencium-next`** — Phase A (📋 PLAN, cyan, read-only) writes a 10–25 line plan/spec and waits for explicit user approval before Phase B (🔨 BUILD, green) executes.
- **`.harness/conventions.md`** — code-quality rules (file <800 LOC, shadcn/Tailwind preferences, token discipline, design-skill hints). Auto-loaded each session by `context-loader`.
- **`skills/phase-banner/SKILL.md`** — single source of truth for ANSI colors + Unicode banners + emoji per phase (PLAN cyan/📋, BUILD green/🔨, TEST yellow/✓, REFLECT magenta/💭, DEPLOY bright-blue/🚀).
- **`templates/next-moves.md.tmpl`** — structured end-of-loop suggestions with phase-progress strip and per-command "when / does / output" explanations.
- **Explicit `📝 Memory:` confirmation** after every action so you know exactly what landed in `.harness/memory.md`.
- Six-phase loop diagram printed by `/bencium-init`: `🗺️ roadmap → 📋 plan/spec → 🔨 build → ✓ test → 💭 reflect → 🚀 deploy`.

### Changed
- `/bencium-verify` and `/bencium-retro` now render `next-moves.md.tmpl` instead of improvising suggestions inline.
- `context-loader` skill now reads `.harness/conventions.md` on session start.

### Fixed
- `marketplace.json` version field was stuck at 0.1.0 after the 0.2.0 bump (this release also corrects that drift and refreshes the description).

---

## May Foundations — v0.1.0 (initial release)

First public cut. Lightweight AI-assisted build harness with scaffold, tasks, acceptance gate, living roadmap, decision log, verify gate, and deploy/rollback. 9 slash commands, 2 auto-skills, 1 hook.
