#!/usr/bin/env bash
# bencium-loop acceptance gate
#
# Wired as a PreToolUse hook on Edit/Write (see hooks/hooks.json).
#
# Guards the loop's most important invariant: a [deployed] row may only be ticked by SMOKE,
# against the live URL, after a deploy. Ticking one from local state is the false confirmation
# the whole TEST/SMOKE split exists to prevent, and it was previously prevented by asking nicely.
#
# Un-checking is always allowed, so /bencium-rollback can revert those rows when a deploy is
# rolled back. So is any edit that leaves the number of ticked [deployed] rows unchanged —
# a retro adding a row, or a whole-file rewrite that carries existing ticks over.

set -u

input=$(cat 2>/dev/null || true)

json_field() {
  printf '%s' "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/'
}

cwd=$(json_field "cwd")
[ -z "$cwd" ] && cwd="$PWD"

[ -d "$cwd/.harness" ] || exit 0

target=$(json_field "file_path")
case "$target" in
  *ACCEPTANCE.md) ;;
  *) exit 0 ;;
esac

phase=""
if [ -f "$cwd/.harness/state" ]; then
  phase=$(grep -m1 '^phase=' "$cwd/.harness/state" 2>/dev/null | sed 's/^phase=//')
fi

# SMOKE is the one phase permitted to flip these rows — that is the whole rule.
[ "$phase" = "smoke" ] && exit 0

# Telling a tick from an un-tick means comparing the text before and after the edit, and that
# needs the payload decoded properly. Node is already required for the workflows; without it
# the gate refuses rather than guessing, since guessing wrong in the open direction is the
# failure this hook exists to prevent.
if ! command -v node >/dev/null 2>&1; then
  printf '\033[31m[bencium-loop] Blocked — the acceptance gate needs node to read this edit, and node is not on PATH.\033[0m\n' >&2
  printf 'Install Node.js, or make this ACCEPTANCE.md change by hand outside the agent.\n' >&2
  exit 2
fi

# Exit 0 = no new tick, 2 = a [deployed] row was ticked, anything else = could not tell.
# Edit: compare old_string with new_string. Write: compare the file on disk with the new content.
# Only real rows count — the template's legend quotes the pattern inside backticks.
printf '%s' "$input" | node -e '
  const fs = require("fs");
  const path = require("path");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const edit = payload.tool_input || {};
  const ticked = (text) => (String(text || "").match(/^[ \t]*- \[x\] \[deployed\]/gim) || []).length;

  let before, after;
  if (typeof edit.content === "string") {
    const file = path.resolve(payload.cwd || process.cwd(), edit.file_path);
    let onDisk = "";
    try { onDisk = fs.readFileSync(file, "utf8"); } catch {}
    before = ticked(onDisk);
    after = ticked(edit.content);
  } else {
    before = ticked(edit.old_string);
    after = ticked(edit.new_string);
  }
  process.exit(after > before ? 2 : 0);
' 2>/dev/null
verdict=$?

[ "$verdict" -eq 0 ] && exit 0

if [ "$verdict" -eq 2 ]; then
  printf '\033[31m[bencium-loop] Blocked — a [deployed] row can only be ticked by SMOKE, against the live URL.\033[0m\n' >&2
  printf 'Current phase: %s. Run /bencium-deploy; its Step 5.5 SMOKE checks these rows against deploy.url and flips them there.\n' "${phase:-none}" >&2
  printf 'Local evidence never proves a deployed row — different env vars, different build, real network.\n' >&2
else
  printf '\033[31m[bencium-loop] Blocked — the acceptance gate could not read this ACCEPTANCE.md edit, so it cannot confirm no [deployed] row is being ticked.\033[0m\n' >&2
fi
exit 2
