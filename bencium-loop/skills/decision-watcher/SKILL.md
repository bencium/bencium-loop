---
name: decision-watcher
description: Watches for architectural decisions during a bencium-loop session and nudges the user to log them via /bencium-decide. Triggers when the conversation involves picking between technical alternatives, choosing a library/framework, defining a data model, setting a policy, or making any choice that future-you would want to know the reason for.
---

# decision-watcher

## When to invoke

Only when the project has a `.harness/` folder (otherwise stay silent — this is not a bencium-loop project).

Trigger when the current conversation involves any of:

- **Library/framework choice**: "should we use X or Y?", "let's go with Z"
- **Data model decisions**: schema design, field naming conventions, normalization choices
- **Architecture splits**: monolith vs services, sync vs async, client vs server rendering
- **Policy choices**: auth model, caching strategy, error handling approach, naming conventions
- **Tradeoffs**: explicit "X over Y because Z" statements from the user or you

Do NOT trigger on:

- Implementation details that are obvious from the code (variable names, file layout)
- Choices already documented in `.harness/archive/` (check first via context-loader)
- Trivial decisions that have no downstream consequences (e.g., "let's use 2-space indent")

## What to do

When you detect a decision moment:

1. Let the conversation reach a conclusion first — don't interrupt mid-discussion.
2. Once the choice is made, say (briefly):

   > "Worth logging? Run `/bencium-decide \"<short title>\"` and I'll capture the why + alternatives + consequences."

3. If the user agrees or asks you to run it, invoke `/bencium-decide` with a suggested title.

4. If the user says no or ignores the nudge, drop it. Don't re-prompt for the same decision.

## Frequency cap

Nudge at most once per 10 conversation turns. If you've nudged recently and the user didn't act, wait. Better to miss a decision than to nag.

## What NOT to do

- Do not auto-run `/bencium-decide` without the user's go-ahead.
- Do not nudge for non-decisions (status updates, questions, debugging).
- Do not nudge if `.harness/archive/` already has a recent decision on the same topic — instead say "Already covered in archive/NNNN — want to update it?"
