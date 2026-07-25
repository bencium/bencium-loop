#!/usr/bin/env bash
# bencium-loop post-commit nag hook
#
# Wired as a PostToolUse hook on Bash tool invocations matching `git commit`.
# Checks whether tasks.md was updated in the latest commit. If not, prints
# a one-line reminder. Never blocks. Exits 0 always.

set -u

# Only run inside a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# Only run when this is a bencium-loop project
if [ ! -d ".harness" ]; then
  exit 0
fi

# Skip if there's no tasks.md yet (project pre-init)
if [ ! -f "tasks.md" ]; then
  exit 0
fi

# Find the most recent commit SHA
LAST_SHA=$(git rev-parse HEAD 2>/dev/null || true)
if [ -z "${LAST_SHA}" ]; then
  exit 0
fi

# Check if tasks.md was touched in that commit
if git show --name-only --pretty=format: "${LAST_SHA}" 2>/dev/null | grep -qx "tasks.md"; then
  # tasks.md was updated — all good
  exit 0
fi

# Check if any task in ## Now is unchecked — if all are checked, nag is irrelevant
NOW_UNCHECKED=$(awk '
  /^## Now/ { in_now = 1; next }
  /^## / && in_now { exit }
  in_now && /^- \[ \]/ { count++ }
  END { print count + 0 }
' tasks.md)

if [ "${NOW_UNCHECKED}" -eq 0 ]; then
  # Nothing left in Now — user is between sprints, no nag
  exit 0
fi

# Print the nag (one line, to stderr so it shows in Claude Code output)
printf '\033[33m[bencium-loop] commit landed but tasks.md unchanged — did you check off the task you just finished?\033[0m\n' >&2

exit 0
