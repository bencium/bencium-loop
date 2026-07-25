#!/usr/bin/env bash
# bencium-harness acceptance gate
#
# Wired as a PreToolUse hook on Edit/Write (see hooks/hooks.json).
#
# Guards the harness's most important invariant: a [deployed] row may only be ticked by SMOKE,
# against the live URL, after a deploy. Ticking one from local state is the false confirmation
# the whole TEST/SMOKE split exists to prevent, and it was previously prevented by asking nicely.
#
# Un-checking is always allowed, so /bencium-rollback can revert those rows when a deploy is
# rolled back.

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

# Matching the raw payload sidesteps parsing an escaped multi-line JSON string: brackets and
# spaces are not JSON-escaped, so `[x] [deployed]` survives intact in the wire format. This is
# why SMOKE keeps the tag when it ticks a row — it leaves the gate something exact to match.
case "$input" in
  *'[x] [deployed]'*) ;;
  *) exit 0 ;;
esac

printf '\033[31m[bencium-harness] Blocked — a [deployed] row can only be ticked by SMOKE, against the live URL.\033[0m\n' >&2
printf 'Current phase: %s. Run /bencium-deploy; its Step 5.5 SMOKE checks these rows against deploy.url and flips them there.\n' "${phase:-none}" >&2
printf 'Local evidence never proves a deployed row — different env vars, different build, real network.\n' >&2
exit 2
