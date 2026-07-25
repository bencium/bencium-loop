#!/usr/bin/env bash
# bencium-loop deploy gate
#
# Wired as a PreToolUse hook on Bash (see hooks/hooks.json).
#
# Makes VERIFY → DEPLOY a mechanism instead of an instruction. /bencium-deploy has always been
# told to refuse when verify fails; nothing stopped a deploy command run any other way, which is
# exactly the path a long session takes. This blocks the configured deploy command unless a
# clean verify receipt exists for the commit that is about to ship.
#
# Silent everywhere else: no .harness/, no deploy.cmd configured, or any other command, exits 0.

set -u

input=$(cat 2>/dev/null || true)

json_field() {
  printf '%s' "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/'
}

cwd=$(json_field "cwd")
[ -z "$cwd" ] && cwd="$PWD"

[ -d "$cwd/.harness" ] || exit 0

config="$cwd/.harness/config.yaml"
[ -f "$config" ] || exit 0

# The `cmd:` line inside the `deploy:` block — not rollback's, not verify's.
deploy_cmd=$(awk '
  /^deploy:/            { in_deploy = 1; next }
  /^[^[:space:]#]/      { in_deploy = 0 }
  in_deploy && /^[[:space:]]+cmd:/ {
    sub(/^[[:space:]]+cmd:[[:space:]]*/, "")
    gsub(/^["'"'"']|["'"'"']$/, "")
    print
    exit
  }
' "$config" 2>/dev/null)

[ -z "$deploy_cmd" ] && exit 0
case "$deploy_cmd" in *"{{"*) exit 0 ;; esac   # unrendered template placeholder

# Match on the first two tokens so `npm publish` does not catch `npm test`.
signature=$(printf '%s' "$deploy_cmd" | awk '{ print ($2 == "") ? $1 : $1 " " $2 }')

command=$(json_field "command")
case "$command" in
  "$signature"*) ;;                             # this is the deploy
  *) exit 0 ;;
esac

receipt="$cwd/.harness/last-verify"
head_sha=$(git -C "$cwd" rev-parse HEAD 2>/dev/null || echo "")

refuse() {
  printf '\033[31m[bencium-loop] Deploy blocked — %s\033[0m\n' "$1" >&2
  printf 'Run /bencium-verify first. It writes .harness/last-verify, and a deploy needs a clean one for this exact commit.\n' >&2
  exit 2
}

[ -f "$receipt" ] || refuse "no verify has been run (.harness/last-verify is missing)"

result=$(grep -m1 '^result=' "$receipt" 2>/dev/null | sed 's/^result=//')
sha=$(grep -m1 '^sha=' "$receipt" 2>/dev/null | sed 's/^sha=//')

[ "$result" = "pass" ] || refuse "the last verify came back '${result:-unknown}', not pass"

# A receipt from an earlier commit proves nothing about what is about to ship.
if [ -n "$head_sha" ] && [ -n "$sha" ] && [ "$head_sha" != "$sha" ]; then
  refuse "the last clean verify was for ${sha}, but HEAD is now ${head_sha}"
fi

exit 0
