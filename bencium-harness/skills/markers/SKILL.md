---
name: markers
description: The shared contract for the machine-readable JSON marker blocks that bencium-harness commands emit at the end of a loop step — placement, content rules, and versioning. Referenced by every /bencium-* command that emits one; the per-command schemas stay in their commands.
---

# markers

Every loop boundary that produces a result ends with a fenced ```` ```json ```` block. CI scripts, dashboards, and follow-up commands locate that block and read it instead of scraping prose.

The rules below are identical for every marker. Each command defines only its own schema and how to populate it.

## Placement

The marker is the **last thing the step prints**. Nothing after the closing fence — no prose, no banner close, no trailing whitespace. Downstream tools find it as the trailing fenced JSON, so anything after it breaks the parse.

Where a command emits more than one marker (`/bencium-deploy` emits one for SMOKE and one for the deploy), each is the last output *of its own step*.

## Content

**Markers report state, not opinion.** No recommendations, no next steps, no commentary inside the JSON — those belong in the prose above it. A consumer reads a marker to learn what happened, not what someone thought about it.

**Every marker carries the same four fields**, then its own:

```json
"_marker": "<name>",
"version": 1,
"ts": "<ISO8601 UTC>",
"phase": "<the loop phase that produced it>"
```

**Report incomplete state rather than none.** If a step stopped halfway, emit the marker with whatever is known and a result that says so. An incomplete record still beats no record when someone is trying to work out where things stopped.

## Versioning

The schema is versioned with an integer (`version: 1`). Additive fields — new optional keys a consumer can ignore — do not bump it. A change that removes a field, renames one, or alters the meaning of an existing one does.

## The markers in the loop

| marker | emitted by |
|---|---|
| `bencium-build-result` | `/bencium-next` Phase B |
| `bencium-verify-result` | `/bencium-verify` |
| `bencium-smoke-result` | `/bencium-deploy` Step 5.5 |
| `bencium-deploy-result` | `/bencium-deploy` Step 6 |
| `bencium-rollback-result` | `/bencium-rollback` |
| `bencium-retro-result` | `/bencium-retro` |

Phase A (PLAN) emits no marker — it is the read-only gate, and the build marker already records the plan that was executed.
