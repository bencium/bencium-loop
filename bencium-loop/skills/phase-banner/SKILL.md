---
name: phase-banner
description: Single source of truth for the bencium-loop phase color scheme, banners, emoji, and progress strip. Referenced by every /bencium-* command so visual styling stays consistent across the loop. Read this skill before printing any phase header.
---

# phase-banner

Centralized phase styling for the bencium-loop loop:
**roadmap → _(optional prototype detour)_ → plan → spec review → build → test (local verify) → deploy → smoke (deployed verify) → reflect**.

Every `/bencium-*` command that prints a phase header MUST use these exact codes so the terminal output is unmistakably distinct between thinking phases (PLAN/SPEC), local execution (BUILD/TEST), and deployed-state checks (DEPLOY/SMOKE). The split between TEST (local) and SMOKE (deployed) is deliberate: passing locally is not the same as passing on the live URL, and the colors make that gap visible.

## Color scheme (ANSI + emoji + banner)

| Phase     | ANSI                  | Emoji | Banner text                                      |
|-----------|-----------------------|-------|--------------------------------------------------|
| ROADMAP   | `\033[2m` (dim)       | 🗺️    | (no banner — status only)                        |
| PROTOTYPE | `\033[38;5;208m` (orange) | 🎨 | `┌── PROTOTYPE ── throwaway pixels, no commitment ──┐` |
| PLAN/SPEC | `\033[36m` (cyan)     | 📋    | `┌── PLAN ── review before coding ──┐`           |
| BUILD     | `\033[32m` (green)    | 🔨    | `┌── BUILD ── coding in progress ──┐`            |
| TEST      | `\033[33m` (yellow)   | ✓     | `┌── TEST ── verify acceptance (local) ──┐`      |
| DEPLOY    | `\033[94m` (br. blue) | 🚀    | `┌── DEPLOY ── ship to target ──┐`               |
| SMOKE     | `\033[95m` (br. mag.) | 🔥    | `┌── SMOKE ── verify on deployed env ──┐`        |
| REFLECT   | `\033[35m` (magenta)  | 💭    | `┌── REFLECT ── learn from this cycle ──┐`       |
| RESET     | `\033[0m`             | —     | (always close colored output with reset)         |

## Banner format (copy-paste exact)

Print the banner on its own line with the ANSI color wrapping the whole line including the closing `┐`. Example for PLAN:

```
\033[36m┌── PLAN ── review before coding ──┐\033[0m
```

Then the phase emoji as the prefix on the next prose line:

```
📋 Picked task: <task title>
📋 Files I expect to touch: ...
```

Close every phase block with the matching reset and a colored closing rule:

```
\033[36m└──────────────────────────────────┘\033[0m
```

## Phase-progress strip

Printed at the top of `/bencium-verify` reports, `/bencium-retro` output, and the next-moves template. Shows where in the loop the user currently is.

Format: emoji separated by `▸`, with the current phase wrapped in `[ ]` and brightened. Completed phases stay solid; upcoming phases are dimmed.

**PROTOTYPE is an optional detour, not a core phase.** It runs before PLAN only when the picked task touches UI and the user opts in (see `/bencium-next` Step 2.5). It does **not** belong in the canonical 7-phase progress strip below — keep that strip stable across every project. While the detour is active, signal it with a transient bracketed prefix only: `[🎨] ▸ 🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ 💭`. Once a direction is picked and PLAN begins, the prefix drops and the strip returns to its canonical seven.

Canonical order: `🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ 💭`

```
🗺️ ▸ 📋 ▸ 🔨 ▸ [✓] ▸ 🚀 ▸ 🔥 ▸ 💭
```

The above means: roadmap done, planned done, built done, currently in TEST (local verify), DEPLOY / SMOKE / REFLECT pending.

After deploy succeeds, before smoke:

```
🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ [🚀] ▸ 🔥 ▸ 💭
```

During post-deploy smoke (deployed-env verification):

```
🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ [🔥] ▸ 💭
```

Loop complete (smoke green, reflect optional):

```
🗺️ ▸ 📋 ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ [💭]
```

## Hard rules

- Never invent new colors. Use only the eight above (seven core phases plus the optional PROTOTYPE detour).
- Never skip the reset `\033[0m` — unclosed ANSI leaks into the next chunk of output.
- Never use a phase banner outside its phase. PROTOTYPE banner only in `/bencium-next` Step 2.5 (the pre-PLAN detour, UI tasks only). PLAN banner only in `/bencium-next` Phase A (and inside `/bencium-spec` if it ever exists). BUILD banner only in `/bencium-next` Phase B. TEST only in `/bencium-verify`. DEPLOY only in `/bencium-deploy` and `/bencium-rollback`. SMOKE only in `/bencium-deploy` Step 5.5 (post-deploy verify against the live URL). REFLECT only in `/bencium-retro`.
- PROTOTYPE never enters the canonical 7-phase progress strip. It is a detour shown only as a transient `[🎨]` prefix while active.
- Never collapse TEST and SMOKE into one phase. TEST is local; SMOKE is the deployed URL. They report independently so a local-only pass can never masquerade as a shipped feature.
- Emoji prefix only on phase-significant lines. Do not put 📋 on every line; that defeats the signal.
