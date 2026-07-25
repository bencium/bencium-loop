#!/usr/bin/env bash
# bencium-loop PLAN gate
#
# Wired as a PreToolUse hook on Edit/Write/NotebookEdit (see hooks/hooks.json).
#
# PLAN→BUILD is the loop's headline invariant, and until now it was a sentence in a
# prompt: the agent was asked not to write code before approval, and usually didn't. This
# makes it a mechanism. While .harness/state says phase=plan, an edit is refused — exit 2,
# which is how a PreToolUse hook blocks a tool call, with stderr as the reason.
#
# Silent everywhere else: no .harness/, or any phase other than plan, exits 0 immediately.

set -u

input=$(cat 2>/dev/null || true)

# Crude field extraction, no jq — same constraint as the statusline, for the same reason:
# a hook that depends on a tool the user may not have installed is a hook that fails open.
json_field() {
  printf '%s' "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/'
}

cwd=$(json_field "cwd")
[ -z "$cwd" ] && cwd="$PWD"

# Not a bencium-loop project — stay invisible.
[ -d "$cwd/.harness" ] || exit 0

phase=""
if [ -f "$cwd/.harness/state" ]; then
  phase=$(grep -m1 '^phase=' "$cwd/.harness/state" 2>/dev/null | sed 's/^phase=//')
fi

# Only PLAN is read-only. Every other phase — including no state file at all — is allowed.
[ "$phase" = "plan" ] || exit 0

target=$(json_field "file_path")
[ -z "$target" ] && target=$(json_field "notebook_path")

# The PROTOTYPE detour is the one sanctioned pre-approval write, and only to a disposable
# location. /bencium-next also writes .harness/state itself to record the phase transition.
case "$target" in
  */_prototype/*|_prototype/*|*/.harness/prototype/*|.harness/prototype/*|*/.harness/state|.harness/state)
    exit 0
    ;;
esac

printf '\033[31m[bencium-loop] PLAN phase is read-only — approve the plan before editing %s\033[0m\n' "${target:-this file}" >&2
printf 'Reply "approve" to enter BUILD, or "skip plan" to fast-track. If you are not mid-plan, the phase is stale: run any /bencium-* command, or edit .harness/state.\n' >&2
exit 2
