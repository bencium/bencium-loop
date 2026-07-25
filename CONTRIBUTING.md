# Contributing

## Run the tests

```bash
node --test "tests/*.test.mjs"
```

No dependencies, no install step. Two suites:

- **Workflow behaviour** — drives each script in `bencium-loop/workflows/` with fake agents that
  reproduce the runtime's real failure mode (an agent that dies returns `null`). The cases exist
  because each one was once a bug that reported green.
- **Rule budget** — line and hard-rule counts per command file, locked at current values.

## Adding a hard rule costs something

Instruction-following degrades as rule count climbs. Past some point a new rule silently displaces
compliance with an older one, and nothing announces when that line was crossed. Between v0.5.0 and
v0.8.0 no command file ever shrank: `bencium-next.md` went from 196 lines to 300, and the fleet
reached 53 hard rules.

So:

1. **A release that adds a hard rule should remove or subsume one.** Look first for a rule that the
   new one makes redundant.
2. **If a count goes up anyway, say why in the CHANGELOG.** Raising a budget in
   `tests/rule-budget.test.mjs` is a deliberate act and shows up in review as its own diff. That is
   the point — drift should require a decision, not just an edit.
3. **Prefer a skill over a restatement.** A rule that belongs to more than one command goes in
   `bencium-loop/skills/` and gets referenced. `invariants`, `markers`, `phase-banner`, and
   `accelerated-mode` all exist for this reason.

The budget test measures volume, not compliance. It tells you the surface is growing; it cannot
tell you the rules are still being followed. Treat a passing budget as the absence of a warning,
not as evidence.

## Changing a command

- Keep the marker block as the last output of its step — downstream tools locate it as the trailing
  fenced JSON.
- If a change touches an ordering or evidence invariant, update the `invariants` skill rather than
  the individual commands.
- Phase strips must match the canonical seven in the `phase-banner` skill. Four had drifted before
  anyone noticed.

## Changing a hook

The three gates in `bencium-loop/hooks/` are the only places the loop enforces rather than
asks. They are also the only places a bug can block legitimate work, so:

- Exit 0 early and often. No `.harness/` directory, wrong phase, wrong file, wrong command — get
  out before doing anything else.
- Exit 2 only for the case the hook exists to catch, and make the message say what to do next.
- Pure bash plus `grep`/`sed`/`awk`. No `jq` — a hook that depends on a tool the user may not have
  installed is a hook that fails open.
- Test every branch by piping JSON into the script directly. Both the block and the allow paths.

## Releases

Codenames are `<Month> <Theme>`; the theme vocabulary is at the top of `CHANGELOG.md`. Bump the
version in both `bencium-loop/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
— they have drifted apart before.
