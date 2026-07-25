---
description: Move items between Roadmap→Now in tasks.md, or demote stale lines from memory.md to archive
allowed-tools: Read, Edit, Write, Bash
---

You are running `/bencium-promote`.

## Step 0: Record phase (statusline)

```bash
[ -d .harness ] && printf 'phase=roadmap\ntask=promote\nupdated=%s\n' "$(date -u +%FT%TZ)" > .harness/state
```

This command does two things depending on what's needed. Ask the user which:

1. **Tasks promotion** — move items from `tasks.md ## Roadmap` into `## Now`.
2. **Memory demotion** — move stale lines from `.harness/memory.md` into a dated archive file to keep hot memory lean.

## Mode 1: Tasks promotion

1. Read `tasks.md`. Show the user the `## Roadmap` list, numbered.
2. Ask which items to promote (comma-separated indices, or "all" / "none").
3. For each selected item: remove from `## Roadmap`, add to `## Now` as `- [ ] <text>`.
4. If `## Now` would exceed 15 items after promotion, warn the user and ask whether to proceed anyway or trim Now first.
5. Append a one-liner to `.harness/memory.md` under `## Sprint`:
   ```
   - YYYY-MM-DD — promoted: <item1>, <item2>
   ```
6. Print:
   ```
   🗺️ Promoted N item(s) to ## Now (now has M items)
   📝 Memory: +1 sprint line appended to .harness/memory.md under ## Sprint
   Next: /bencium-next to plan and build the first promoted item.
   ```
7. Then render `${CLAUDE_PLUGIN_ROOT}/templates/next-moves.md.tmpl`, filling:
   - `{{phase_progress_strip}}` → `🗺️ ▸ [📋] ▸ 🔨 ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ 💭` (planning the new slice)
   - `{{verify_reason}}` → `new slice — verify after the first build`
   - `{{top_roadmap_items}}` → remaining `## Roadmap` items (post-promotion), first 3
   - `{{tail_status}}` → `📝 Memory: +1 sprint line appended (already logged above)`

   The template's trailing 💡 Token checkpoint block is intentional — a new slice is the right moment to suggest /clear.

## Mode 2: Memory demotion

1. Read `.harness/memory.md` and `wc -l` it.
2. If under 80 lines, tell the user "memory is lean, no demotion needed" and stop.
3. Otherwise show the user the oldest 1/3 of lines and ask which to demote.
4. Create `.harness/archive/NNNN-memory-demote-YYYY-MM-DD.md` containing the demoted lines plus a header `# Demoted from memory.md on YYYY-MM-DD`.
5. Remove those lines from `memory.md`.
6. Print:
   ```
   🗺️ Demoted N lines to .harness/archive/NNNN-memory-demote-...md
   📝 Memory: -N lines (memory.md now M lines)
   ```

   Do NOT render `next-moves.md.tmpl` here — memory demotion is in-session housekeeping, not a slice boundary, so the /clear advisory would be noise.

## Hard rules

- Never delete content. Demotion = move to archive, not erase.
- Never reorder unrelated lines in tasks.md or memory.md — only touch what's being moved.
- If both modes seem relevant (e.g., big roadmap AND big memory), do tasks first, then offer memory as a follow-up.
