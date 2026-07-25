---
description: Append a new feature to tasks.md ## Roadmap and optionally promote to Now
allowed-tools: Read, Edit, AskUserQuestion, Bash
argument-hint: "<short feature description>"
---

You are running `/bencium-feature` with argument: `$ARGUMENTS`

## Step 0: Record phase (statusline)

```bash
[ -d .harness ] && printf 'phase=roadmap\ntask=add feature\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

## Step 1: Capture the feature

If `$ARGUMENTS` is empty, ask: "What feature? (one line)" and use the answer.

## Step 2: Read tasks.md

If missing, tell the user to run `/bencium-init` first.

## Step 3: Append to Roadmap

Add the new line as `- <feature>` under the `## Roadmap` heading (no checkbox — checkboxes only appear once promoted to Now). If `## Roadmap` doesn't exist, create it at the end of the file.

## Step 4: Promote prompt

**Portability note.** If you are running inside Claude Code, use the `AskUserQuestion` tool for the prompt below. If `AskUserQuestion` is unavailable (claude.ai, Cursor, Codex, or any non-Claude-Code host), ask inline (`Promote to Now? (yes/no)`) and wait for the reply.

Ask the user: "Promote to Now now?"

- Yes → move the new line up to `## Now` as `- [ ] <feature>`. Warn if Now would exceed 15.
- No → leave in Roadmap.

## Step 5: Log

Append to `.harness/memory.md` under `## Roadmap changes`:

```
- YYYY-MM-DD — added: <feature> (roadmap | now)
```

Print with the dim ROADMAP marker (see `phase-banner` skill):

```
🗺️ Added "<feature>" to <Roadmap|Now>.
📝 Memory: +1 roadmap-change line appended to .harness/memory.md under ## Roadmap changes
```

## Hard rules

- One feature per invocation. If the user describes multiple, ask them to split.
- Don't expand on the feature description. Write what the user said verbatim.
