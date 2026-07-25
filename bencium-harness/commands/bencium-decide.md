---
description: Log an architectural decision to .harness/archive/ and surface it in memory
allowed-tools: Read, Write, Edit, Bash
argument-hint: "<short title of the decision>"
---

You are running `/bencium-decide` with argument: `$ARGUMENTS`

## Step 1: Validate

If `$ARGUMENTS` is empty, ask: "What decision are you logging? (one-line title)" and use the answer.

If `.harness/archive/` doesn't exist, tell the user to run `/bencium-init` first.

## Step 2: Determine the next sequence number

Run `ls .harness/archive/ 2>/dev/null | grep -E '^[0-9]{4}-' | sort | tail -1` to find the highest existing NNNN prefix. Increment by 1. If none exist, start at 0001.

## Step 3: Gather decision content

Ask the user (or infer from current conversation context if a decision was just discussed):

- **Context**: What prompted this decision?
- **Options considered**: What alternatives did you weigh?
- **Choice**: What did you pick?
- **Why**: Reason (constraint, tradeoff, gut call)
- **Consequences**: What does this lock in or rule out going forward?

If the conversation context already covers these, summarize from it and confirm with the user before writing.

## Step 4: Write the decision file

Path: `.harness/archive/NNNN-decision-<kebab-slug>.md`

Format:

```markdown
# NNNN — <Title>

**Date:** <YYYY-MM-DD>
**Status:** accepted

## Context
<2-4 sentences>

## Options considered
- Option A: <one-liner>
- Option B: <one-liner>
- (more if relevant)

## Choice
<the picked option, one line>

## Why
<2-3 sentences — the reason that justifies the tradeoff>

## Consequences
- <what this enables or forecloses>
- <what to watch for>
```

## Step 5: Update hot memory

Append one line to `.harness/memory.md` under a `## Decisions` heading (create the heading if missing):

```
- NNNN: <title> — <one-line why>
```

Keep memory.md under 100 lines. If it would exceed, suggest the user run `/bencium-promote` to demote older entries to archive.

## Step 6: Confirm

Print with the PLAN banner (this is a planning-class action — see `phase-banner` skill):

```
\033[36m┌── PLAN ── decision logged ──┐\033[0m
📋 Logged decision NNNN: <title>
📝 Memory: +1 decision line appended to .harness/memory.md under ## Decisions
\033[36m└──────────────────────────────┘\033[0m
```
