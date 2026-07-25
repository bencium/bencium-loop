---
name: invariants
description: The ordering and evidence rules the whole bencium-loop loop rests on, stated once with their reasons and their real enforcement status. Referenced by every /bencium-* command instead of being restated in each one. Read this before deciding whether a step may proceed.
---

# invariants

Some pairs of actions have a required order, and some claims require evidence before they may be made. Getting either wrong rarely produces a loud error — the second step just quietly means less than it appears to.

These are stated here once. Commands reference this skill and carry only the rule specific to them.

## What is actually enforced

Be precise about this, because the difference matters most in exactly the conditions where it is easiest to forget: a long session, a tired user, a model under context pressure.

| invariant | how it holds |
|---|---|
| PLAN → BUILD | **hook** — the edit is blocked (`plan-gate.sh`) |
| VERIFY → DEPLOY | **hook** — the deploy command is blocked (`deploy-gate.sh`) |
| `[deployed]` rows only flipped by SMOKE | **hook** — the edit is blocked (`acceptance-gate.sh`) |
| RED → GREEN | asked |
| evidence before a check is ticked | asked |
| no row vanishes from a workflow result | **code**, in the workflow scripts |

The three hooks exist only on Claude Code. On Codex, opencode, and pasted chats every line above is a convention the model follows because the prompt says so. That works most of the time. It is not the same thing, and the loop should never claim otherwise.

## The ordering invariants

**PLAN → BUILD.** No implementation file is edited before the user approves the plan. The plan is the spec; approving it is the only place the user gets to disagree cheaply. The one exception is the PROTOTYPE detour, which writes throwaway files to a disposable location and nothing else.

**RED → GREEN.** The declared failing test is observed failing, for the expected reason, before any implementation file is edited. A test written after the code tends to assert what the code does rather than what was wanted. Exceptions are declared in the plan (`none — trivial (declared)`) or logged as a bypass.

**VERIFY (local) → DEPLOY.** Deploy does not run while any check fails. The gate is the point of having a checklist at all.

**DEPLOY → SMOKE.** `[deployed]`-tagged rows are never evaluated against the working tree — only against the live URL, and only after deploying. Local pass is not shipped: environment variables, build mode, and the network are all different in the place users actually are. Only SMOKE may flip those rows, and it keeps the tag when it does (`- [x] [deployed] X`) so the row can never later be mistaken for a local check.

## The evidence invariants

**Evidence before a tick.** A check is marked passed only with something you can point at — a file path, a grep hit, command output, an HTTP status. Never a recollection, never an inference from "the code looks right".

**An unevaluated check is a failed check.** If a check could not be run at all — a dead agent, no response, a missing fixture with no stated reason — it is FAIL. Not absent, not skipped, not passed. Zero evaluated checks is a FAIL, never a vacuous pass. A missing row reads as a row that was never on the list, which is how a silent drop turns into a false green.

**A gamed pass is a FAIL.** Green is necessary, not sufficient: the test must still assert the real behaviour. A weakened assertion, a skipped test, a hardcoded echo of current output, or a narrowed verify command all fail the check they appear to support.

## Declaring your own

If a project step must run before another — database provisioned before secret request, auth before any user-route, migration before seed — declare it in `.harness/rules.md` under an "Ordering invariants" heading. The agent reads `rules.md` every session and will refuse step Y without step X.

Document the **why** on each one, not just the order. "Migration before seed (seed scripts assume the schema exists)" is enforceable. "Migration before seed" alone forces the agent to guess the reason, and a guessed reason permits a clever-but-wrong shortcut.

## Adding a rule costs something

Instruction-following degrades as rule count climbs: past some point a new rule silently displaces compliance with an older one, and nothing announces when that line was crossed.

So a release that adds a hard rule should remove or subsume one. If the count goes up anyway, the CHANGELOG says why. `tests/rule-budget.test.mjs` holds the per-command line and rule budgets and fails when one is exceeded — which makes raising a budget a visible diff rather than a drift.

That test measures volume, not compliance. It tells you the surface is growing; it cannot tell you the rules are still being followed.
