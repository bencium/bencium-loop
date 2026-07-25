#!/usr/bin/env bash
# bencium-loop statusline
# Two-row dense renderer for Claude Code's statusLine.
# Reads JSON from stdin (cwd, model.display_name, cost.total_cost_usd, context_window.used_percentage).
# Prints two rows: phase strip + project / task + counts + model + cost + ctx %.
# Silent (exit 0, no output) if cwd has no .harness/ folder.
# ANSI palette and phase order MUST stay in sync with skills/phase-banner/SKILL.md.

set -u

# ----- read stdin JSON (best-effort parse, no jq dependency) -----
input=$(cat 2>/dev/null || true)

json_get() {
  # crude grep for top-level or one-nested string/number field. Good enough for the fixed
  # Claude Code schema; failure returns empty string. No jq, no python.
  local key="$1"
  printf '%s' "$input" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/'
}
json_get_num() {
  local key="$1"
  printf '%s' "$input" | grep -oE "\"$key\"[[:space:]]*:[[:space:]]*-?[0-9.]+" | head -1 | sed -E 's/.*:[[:space:]]*//'
}

cwd=$(json_get "cwd")
[ -z "$cwd" ] && cwd="$PWD"
model=$(json_get "display_name")
[ -z "$model" ] && model=$(json_get "id")
cost=$(json_get_num "total_cost_usd")
ctx=$(json_get_num "used_percentage")

# ----- bail silently if not a loop project -----
if [ ! -d "$cwd/.harness" ]; then
  exit 0
fi

# ----- ANSI palette (verbatim from skills/phase-banner/SKILL.md) -----
RESET=$'\033[0m'; BOLD=$'\033[1m'; DIM=$'\033[2m'
DIM_C=$'\033[2m'; CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
BRBLUE=$'\033[94m'; BRMAG=$'\033[95m'; MAG=$'\033[35m'

# ----- read .harness/state for current phase -----
phase=""; task=""
if [ -f "$cwd/.harness/state" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      phase) phase="$v" ;;
      task)  task="$v"  ;;
    esac
  done < "$cwd/.harness/state"
fi

# ----- project name from .harness/memory.md (** Name:** line); fallback to cwd basename -----
project=""
if [ -f "$cwd/.harness/memory.md" ]; then
  project=$(grep -m1 -E '^(- +)?\*\*Name:\*\*' "$cwd/.harness/memory.md" | sed -E 's/^(- +)?\*\*Name:\*\*[[:space:]]*//')
fi
[ -z "$project" ] && project=$(basename "$cwd")

# ----- counts from tasks.md (## Now section only) and ACCEPTANCE.md (all) -----
now_count="—"
if [ -f "$cwd/tasks.md" ]; then
  now_count=$(awk '
    /^##[[:space:]]+Now/      { in_now=1; next }
    /^##[[:space:]]/          { in_now=0 }
    in_now && /^- \[ \]/      { n++ }
    END                       { print n+0 }
  ' "$cwd/tasks.md")
fi
# Local and deployed rows are counted separately and shown separately. A single ratio would
# hide the deployed gap: 7 local + 3 deployed rows rendered as "7/7 ✓" reads fully green while
# nothing has been proved against the live URL — the exact false confirmation the TEST/SMOKE
# split exists to prevent. A row counts as deployed if it carries a [deployed] tag anywhere.
acc_done=0; acc_total=0; dep_done=0; dep_total=0
if [ -f "$cwd/ACCEPTANCE.md" ]; then
  read -r acc_done acc_total dep_done dep_total <<EOF
$(awk '
  /^- \[/ {
    is_done    = /^- \[x\]/
    is_open    = /^- \[ \]/ || /^- \[deployed\]/
    if (!is_done && !is_open) next
    if ($0 ~ /\[deployed\]/) { dep_total++; if (is_done) dep_done++ }
    else                     { acc_total++; if (is_done) acc_done++ }
  }
  END { print acc_done+0, acc_total+0, dep_done+0, dep_total+0 }
' "$cwd/ACCEPTANCE.md" 2>/dev/null)
EOF
  [ -z "${acc_done:-}" ] && { acc_done=0; acc_total=0; dep_done=0; dep_total=0; }
fi

# No deployed rows at all is itself worth seeing — it means nothing in this project is
# checked against the live URL — so render "— 🔥" rather than dropping the segment.
if [ "$dep_total" -gt 0 ]; then
  smoke_fmt="${dep_done}/${dep_total} 🔥"
else
  smoke_fmt="— 🔥"
fi

# ----- build phase strip with [current] wrapped -----
strip_phase() {
  # $1 = phase key, $2 = emoji. If matches current $phase, wrap [..].
  local key="$1"; local emoji="$2"
  if [ "$phase" = "$key" ]; then printf '[%s]' "$emoji"; else printf '%s' "$emoji"; fi
}
sep=" ▸ "
strip="$(strip_phase roadmap 🗺️)${sep}$(strip_phase plan 📋)${sep}$(strip_phase build 🔨)${sep}$(strip_phase test ✓)${sep}$(strip_phase deploy 🚀)${sep}$(strip_phase smoke 🔥)${sep}$(strip_phase reflect 💭)"
# PROTOTYPE is an optional pre-PLAN detour, not a canonical phase: prepend a transient
# [🎨] marker rather than polluting the seven-phase strip. (Stays in sync with phase-banner.)
if [ "$phase" = "prototype" ]; then
  strip="[🎨]${sep}${strip}"
fi

# ----- format cost (2dp) and ctx (int %) -----
cost_fmt="—"
if [ -n "${cost:-}" ]; then
  cost_fmt=$(printf '$%.2f' "$cost" 2>/dev/null || echo "—")
fi
ctx_fmt="—"
if [ -n "${ctx:-}" ]; then
  ctx_fmt=$(printf '%d%%' "$(printf '%.0f' "$ctx" 2>/dev/null)" 2>/dev/null || echo "—")
fi
task_fmt="${task:-—}"
model_fmt="${model:-—}"

# ----- two-row output (always exit 0; render best-effort) -----
{
  printf '%s   %s%s%s\n' "$strip" "$BOLD" "$project" "$RESET"
  printf '%s"%s"   %s now · %s/%s ✓ · %s   💫 %s %s   ctx %s%s\n' "$DIM" "$task_fmt" "$now_count" "$acc_done" "$acc_total" "$smoke_fmt" "$model_fmt" "$cost_fmt" "$ctx_fmt" "$RESET"
} 2>/dev/null
exit 0
