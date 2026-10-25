# Install bencium-loop

This plugin is published in the **bencium-marketplace** Claude Code marketplace. No unzip, no `settings.json` editing. One marketplace registration, one `/plugin install`.

## Install (public marketplace — recommended)

Inside Claude Code:

```
/plugin marketplace add bencium/bencium-marketplace
/plugin install bencium-loop@bencium-marketplace
```

Restart Claude Code, then verify:

```
/plugin list           # bencium-loop@bencium-marketplace should be enabled
/bencium-init          # triggers the 5-question interview
```

The marketplace pulls the plugin straight from the [`bencium/bencium-loop`](https://github.com/bencium/bencium-loop) repo (`git-subdir` source), so `/plugin marketplace update bencium-marketplace` always fetches the latest release.

## Local development install (for editing the plugin)

### 1. Register the local marketplace (one-time)

Inside Claude Code, run:

```
/plugin marketplace add /Users/bencium/benc-harness-source
```

This adds `bencium-loop-local` to your `~/.claude/plugins/known_marketplaces.json`.

### 2. Install the plugin

```
/plugin install bencium-loop@bencium-loop-local
```

That's the one-line install. The plugin is now cached under `~/.claude/plugins/cache/bencium-loop-local/bencium-loop/<VERSION>/` (check the version with `/plugin list`).

### 3. Restart Claude Code

Quit and relaunch. Verify with:

```
/plugin list
```

You should see `bencium-loop@bencium-loop-local` listed as enabled. Then:

```
/bencium-init
```

should trigger the 5-question interview.

## Updating after edits

Edit files directly in your local clone (the path you registered as the marketplace above), then in Claude Code:

```
/plugin update bencium-loop@bencium-loop-local
```

Restart and re-test.

## Uninstall

```
/plugin uninstall bencium-loop@bencium-marketplace
/plugin marketplace remove bencium-marketplace
```

Restart Claude Code. (Local-dev installs use `@bencium-loop-local` / `bencium-loop-local` instead.)

## Hooks (automatic)

The plugin registers four hooks in `hooks/hooks.json`. They activate when the plugin is enabled — nothing to paste, nothing to chmod. All four stay completely silent outside a project that has a `.harness/` folder.

Three of them are gates. They are the only places the loop enforces a rule rather than asking for it:

- **Plan gate** (`PreToolUse` on Edit/Write/NotebookEdit) — refuses file edits while `.harness/state` says `phase=plan`. The throwaway prototype paths (`_prototype/`, `.harness/prototype/`) are exempt, since the PROTOTYPE detour is allowed to write before approval.
- **Deploy gate** (`PreToolUse` on Bash) — refuses your configured `deploy.cmd` unless `.harness/last-verify` shows a clean verify for the commit *and* the uncommitted changes you are about to ship. Written by `/bencium-verify`; a stale, failing or partial receipt blocks the deploy. It recognises the command when chained (`cd app && fly deploy`) or prefixed (`TOKEN=… fly deploy`), but not when a script, Makefile target or alias runs it for you.
- **Acceptance gate** (`PreToolUse` on Edit/Write) — refuses to tick a `[deployed]` row in `ACCEPTANCE.md` unless the phase is `smoke`. Un-ticking is always allowed, so a rollback can revert those rows.

The fourth is advisory:

- **Commit nag** (`PostToolUse` on `git commit`) — one yellow line when a commit lands without touching `tasks.md` and `## Now` still has unchecked items. Never blocks.

If the plan gate fires when you are *not* mid-plan, the phase is stale: run any `/bencium-*` command, or edit `.harness/state`.

To disable any of them, use `permissions.deny` in your settings rather than editing the plugin.

## Measurement (optional, web UI projects)

`/bencium-init` offers it. To add it to an existing project, from the project root:

```bash
mkdir -p .harness/measure .harness/journeys
cp "<plugin root>/measure/"{measure.mjs,judge.mjs,package.json} .harness/measure/
cp "<plugin root>/templates/measure.json.tmpl" .harness/measure.json   # then edit url, serve, pages
npm install --prefix .harness/measure
npx --prefix .harness/measure playwright install chromium               # ~100MB, once per machine
echo ".harness/measure/node_modules/" >> .gitignore
```

Check it with `node .harness/measure/measure.mjs`. Commit `.harness/measure.json`, `.harness/journeys/`
and `.harness/metrics.jsonl`. The tools sit in their own folder, so this works whatever your stack is.

## Statusline (optional)

The plugin ships a statusline script at `statusline/loop-status.sh`. Claude Code plugins cannot register a statusline declaratively, so wire it into your own `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/plugins/cache/bencium-marketplace/bencium-loop/<VERSION>/statusline/loop-status.sh",
    "padding": 1
  }
}
```

Replace `<VERSION>` with the installed version (check with `/plugin list`). Then make the script executable:

```bash
chmod +x ~/.claude/plugins/cache/bencium-marketplace/bencium-loop/<VERSION>/statusline/loop-status.sh
```

Restart Claude Code. In any project with a `.harness/` folder you will see a two-row bar at the bottom:

```
🗺️ ▸ 📋 ▸ [🔨] ▸ ✓ ▸ 🚀 ▸ 🔥 ▸ 💭   todo-app
"Add CSV export"   5 now · 7/10 ✓ · 1/3 🔥   💫 haiku $0.04   ctx 38%
```

Row 1 is the phase-progress strip (current phase wrapped in `[ ]`) plus the project name from `.harness/memory.md`. Row 2 is the current task, `## Now` count, local ACCEPTANCE ratio (`✓`), deployed-row ratio (`🔥`), model, session cost, and context-window usage.

The two ratios are deliberately separate. `7/10 ✓` is what passes on your machine; `1/3 🔥` is what has been proved against the live URL. Rolling them into one number would let a project look finished while nothing is confirmed deployed. `— 🔥` means the project has no `[deployed]` rows at all — also worth seeing.

Projects without `.harness/` produce no output — your previous statusline, if any, takes over. The script is pure bash + awk + grep, no dependencies, <50ms per render.

The phase comes from `.harness/state`, which each `/bencium-*` command writes on entry. If you delete it, the strip renders without a highlight.

## Use with claude.ai or Claude for Work

Plugins do not run in claude.ai or Claude for Work (web). You can still use the template files manually — see the README for the graceful-degradation path.

Command prompts have a portability note where they call `AskUserQuestion` (a Claude Code-only tool). Outside Claude Code the agent will ask the same questions inline as a numbered list — no manual edits required.
