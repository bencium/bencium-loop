---
name: accelerated-mode
description: Single source of truth for the bencium-harness opt-in workflow fan-out — the two gates that must both hold, the fallback rule, the guardrails, and how a run is recorded in the marker. Referenced by every /bencium-* command that offers an accelerated path. Read this skill before invoking any Workflow.
---

# accelerated-mode

The harness runs one step at a time, each gated. On Claude Code there is an optional faster gear for the slow, repetitive parts: a *dynamic workflow* — a small program that fans work out across many short-lived agents at once instead of walking a list one item at a time.

This skill holds the rules that are identical across every surface that offers one. The commands hold only what differs: which script, what arguments, and how to fold the results back in.

## The two gates — both must hold, every time

1. **Runtime gate.** A `Workflow` tool must be available. It exists **only** in Claude Code. On Codex, opencode, or any copy-paste chat surface there is no `Workflow` tool. Do not emulate one with extra `Task` subagents — that would break the 3-agent cap and produce an unbounded fan-out on a surface that was never designed for it.
2. **Opt-in gate.** The user asked for it *this run* — "verify with a workflow", a `workflow` argument, or an `ultracode` request. Never automatic. A single run can spawn many agents (up to 16 concurrent, 1000 over a run) at real token cost, so it is always a deliberate escalation the user chose.

If either gate is false, run the serial path. Not a degraded version of it — the same path that has always been the default.

## Fallback is the design, not a safety net

The serial path is the portable one: it works on every surface the harness runs on. The accelerated path can only ever be a speed-up on one of them. So every accelerated step is written to fall through cleanly, and nothing in the harness may *depend* on a workflow having run.

Detection is automatic: no `Workflow` tool means not Claude Code, which means serial.

## Guardrails

- **Never fan out a gate, and never fan out a build.** The PLAN→BUILD approval, the verify verdict, and the deploy decision stay serial and human-facing. A workflow may *read and evaluate* inside an approved step; it never replaces the step's gate, and it never writes code.
- **A workflow is advisory to the gate.** Its output flows into the command's own report and marker. It does not deploy, does not check off `[deployed]` rows, and does not decide anything the serial path wouldn't.
- **Every row comes back.** The scripts return one result per item they were given — an item that could not be evaluated returns `fail` with `unverified: true`, never a missing entry. Report those as failures and say how many. A missing row reads as a row that was never on the list, which is how a silent drop becomes a false pass.
- **Take the stricter verdict.** Where a workflow result and your own differ, take the stricter one unless you can refute it with concrete evidence. Same reconciliation rule as the independent-evaluator step.
- **The 3-agent cap is untouched.** The cap governs `Task` subagents. Workflow mode is a separate, named escalation — not a loosening of the cap, and not a licence to spawn subagents outside one.

## Recording the run

Every marker that can be produced by an accelerated step carries two optional, additive fields at `version: 1`:

```json
"mode": "serial" | "workflow",
"agents": <int>
```

Set `mode: "workflow"` and the agent count only when a workflow actually ran; otherwise `mode: "serial"` and `agents: 0`. Consumers that predate these fields ignore them — the serial path is byte-for-byte the old behavior.

## Where the scripts live

Prefer the project copy at `.claude/workflows/<name>.mjs`; fall back to `${CLAUDE_PLUGIN_ROOT}/workflows/<name>.mjs`. `/bencium-init` copies them into a project on Claude Code as a convenience — a project without them still gets workflow mode through the plugin-root fallback.

| Surface | Script | Shape |
|---|---|---|
| `/bencium-verify` Step 3c | `verify-acceptance.mjs` | evaluate each local row, then a fresh skeptic tries to refute each PASS |
| `/bencium-deploy` Step 5.5 | `smoke-deployed.mjs` | one agent per `[deployed]` row, real HTTP against the live URL |
| `/bencium-init` Step 2 | `brownfield-scan.mjs` | multi-lens read-only sweep, then one synthesis |

Mechanical stages default to Haiku; adversarial verification and synthesis to Sonnet.

## Every accelerated path is read-only

All three read, evaluate, and report. None of them writes code, and none of them is on the build
path. That is the boundary, and it is deliberate.

A parallel *build* fan-out existed briefly and has since been removed. It bought throughput on the
one part of the loop that was never the bottleneck — the bottleneck is the human reading the plan —
and being the only fan-out that wrote code, it was where most of the bugs lived. If a task is really
N independent mechanical edits, split it at the PLAN gate and build the parts one at a time. Slower
in wall-clock, and the wall-clock was never the constraint.
