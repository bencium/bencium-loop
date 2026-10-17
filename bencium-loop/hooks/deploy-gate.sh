#!/usr/bin/env bash
# bencium-loop deploy gate
#
# Wired as a PreToolUse hook on Bash (see hooks/hooks.json).
#
# Makes VERIFY → DEPLOY a mechanism instead of an instruction. /bencium-deploy has always been
# told to refuse when verify fails; nothing stopped a deploy command run any other way, which is
# exactly the path a long session takes. This blocks the configured deploy command unless a
# clean verify receipt exists for the exact commit and working tree that is about to ship.
#
# Silent everywhere else: no .harness/, no deploy.cmd configured, or any other command, exits 0.
#
# What it cannot see: a deploy run indirectly — a script, a Makefile target, an alias, or
# `sh -c "..."` that calls deploy.cmd from inside. It gates the configured command as typed.

set -u

input=$(cat 2>/dev/null || true)

# Crude JSON string extraction, no jq. Unlike a bare "[^"]*" match it steps over escaped
# quotes, so `git commit -m "x" && fly deploy` is read whole instead of stopping at the first \".
# Escaped newlines become `;` — for a shell command they separate statements either way.
json_field() {
  printf '%s' "$input" \
    | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"(\\\\.|[^\"\\\\])*\"" | head -1 \
    | sed -E 's/^"[^"]*"[[:space:]]*:[[:space:]]*"//; s/"$//' \
    | sed -e 's/\\"/"/g' -e 's/\\n/;/g' -e 's/\\t/ /g' -e 's/\\\\/\\/g'
}

cwd=$(json_field "cwd")
[ -z "$cwd" ] && cwd="$PWD"

[ -d "$cwd/.harness" ] || exit 0

config="$cwd/.harness/config.yaml"
[ -f "$config" ] || exit 0

# The `cmd:` line inside the `deploy:` block — not rollback's, not verify's. The rendered
# template carries an inline comment after the value (`cmd: "fly deploy"   # full command…`),
# so a quoted value is read up to its closing quote and an unquoted one up to ` #`.
deploy_cmd=$(awk '
  /^deploy:/            { in_deploy = 1; next }
  /^[^[:space:]#]/      { in_deploy = 0 }
  in_deploy && /^[[:space:]]+cmd:/ {
    sub(/^[[:space:]]+cmd:[[:space:]]*/, "")
    quote = substr($0, 1, 1)
    if (quote == "\"" || quote == "\047") {
      rest = substr($0, 2)
      end = index(rest, quote)
      print (end ? substr(rest, 1, end - 1) : rest)
    } else {
      sub(/[[:space:]]+#.*$/, "")
      sub(/[[:space:]]+$/, "")
      print
    }
    exit
  }
' "$config" 2>/dev/null)

[ -z "$deploy_cmd" ] && exit 0
case "$deploy_cmd" in *"{{"*) exit 0 ;; esac   # unrendered template placeholder

# Is the Bash command the deploy? Split it into statements at && || ; | and subshell
# brackets, drop leading `VAR=value` assignments and wrappers like `env` or `sudo`, collapse
# whitespace, then look for a statement that is deploy.cmd, optionally followed by more flags.
# Matching the whole configured command — not its first two words — is what keeps
# `deploy.cmd: npm run deploy` from also catching `npm run test`.
is_deploy=$(printf '%s' "$(json_field "command")" | DEPLOY_CMD="$deploy_cmd" awk '
  function squeeze(s) { gsub(/[[:space:]]+/, " ", s); sub(/^ /, "", s); sub(/ $/, "", s); return s }
  { buf = buf $0 "\n" }
  END {
    want = squeeze(ENVIRON["DEPLOY_CMD"])
    # A deploy.cmd that is itself a chain can only be recognised whole.
    if (want ~ /&&|\|\||;|\|/ && index(squeeze(buf), want)) { print "yes"; exit }
    gsub(/&&|\|\||;|\||\(|\)|\{|\}|`/, "\n", buf)
    n = split(buf, statements, "\n")
    for (i = 1; i <= n; i++) {
      s = squeeze(statements[i])
      while (s ~ /^[A-Za-z_][A-Za-z0-9_]*=[^ ]* / || s ~ /^(env|exec|time|command|sudo|nohup) /)
        sub(/^[^ ]+ /, "", s)
      if (s == want || index(s, want " ") == 1) { print "yes"; exit }
    }
  }
')

[ "$is_deploy" = "yes" ] || exit 0

refuse() {
  printf '\033[31m[bencium-loop] Deploy blocked — %s\033[0m\n' "$1" >&2
  printf 'Run /bencium-verify first. It writes .harness/last-verify, and a deploy needs a clean one for this exact commit and working tree.\n' >&2
  exit 2
}

receipt="$cwd/.harness/last-verify"
[ -f "$receipt" ] || refuse "no verify has been run (.harness/last-verify is missing)"

receipt_field() { grep -m1 "^$1=" "$receipt" 2>/dev/null | sed "s/^$1=//"; }
result=$(receipt_field result)
sha=$(receipt_field sha)
tree=$(receipt_field tree)

[ "$result" = "pass" ] || refuse "the last verify came back '${result:-unknown}', not pass"

head_sha=$(git -C "$cwd" rev-parse HEAD 2>/dev/null || echo "")
[ -z "$head_sha" ] && exit 0   # not a git repo — nothing to compare the receipt against

# A receipt from an earlier commit proves nothing about what is about to ship.
[ "$head_sha" = "$sha" ] || refuse "the last clean verify was for ${sha:-an unknown commit}, but HEAD is now ${head_sha}"

# Nor does one taken before uncommitted edits: most deploy tools ship the working tree, not
# HEAD. .harness/ is left out because the loop itself writes phase and memory there between
# verify and deploy. Must stay byte-identical to /bencium-verify Step 6.5.
current_tree=$( { git -C "$cwd" diff HEAD -- . ':(exclude).harness'; git -C "$cwd" ls-files --others --exclude-standard -- . ':(exclude).harness'; } 2>/dev/null | git hash-object --stdin 2>/dev/null)
[ "$current_tree" = "$tree" ] || refuse "files changed since the last clean verify (uncommitted edits, or a receipt older than this check)"

exit 0
