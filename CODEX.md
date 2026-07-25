# Using bencium-harness with Codex

The harness is a Claude Code plugin, but the commands are plain prompt files, so they work in Codex as skills. A sync script generates the Codex adapter from this source tree — the source stays authoritative, Codex gets a clean generated copy.

## Install or update

```bash
node bencium-harness/scripts/sync-codex-adapter.mjs
```

Then restart Codex so it reloads the plugin index.

Run it again after any edit to this repo. It reads the version from `bencium-harness/.claude-plugin/plugin.json`, discovers every file in `commands/` and `skills/` automatically, and writes both the local marketplace copy and the plugin cache copy under `$CODEX_HOME` (`~/.codex` unless you set it). It backs up `config.toml` before touching it and prints the backup path.

## What the adapter changes

Each `commands/*.md` becomes a Codex skill of the same name, with the original command body intact and a short preamble covering the differences:

- `${CLAUDE_PLUGIN_ROOT}` resolves to this source tree.
- `AskUserQuestion` (Claude Code only) becomes an inline question.
- Claude's subagents are used only where Codex has an equivalent; otherwise the work happens in the main context.
- **Accelerated / workflow paths are ignored entirely.** The `Workflow` runtime is Claude Code only. Every accelerated step in the harness has a serial fallback, and on Codex that fallback is the only path — never emulate a workflow with extra subagents.

The helper skills (`context-loader`, `decision-watcher`, `phase-banner`, `invariants`, `markers`, `accelerated-mode`) are copied with a `bencium-` prefix so they don't collide with anything else installed.

## What you don't get

Hooks and the statusline are Claude Code mechanisms and are not wired up on Codex. Three invariants are therefore advisory here that are enforced there:

- **PLAN → BUILD** — the command still tells the agent to wait for your approval; nothing blocks the edit.
- **VERIFY → DEPLOY** — nothing blocks the deploy command if verify has not passed.
- **`[deployed]` rows only ticked by SMOKE** — nothing blocks a row being ticked from local state.

That is the real cost of the Codex adapter, and it is worth knowing before you rely on it for anything regulated. Everything else works the same, because it all lives in files in your project: the acceptance checklist, the decision log, memory, and the local-vs-deployed split.
