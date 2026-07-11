# bencium-harness

> A plugin for agentic coding tools like codex and opencode. It gives AI agents steady context, an acceptance checklist that must pass before anything ships, and a memory that survives a context reset (when the chat history is wiped between sessions).

## The problem

AI agents drift. They forget decisions when the chat is reset. They write code that nobody checks against the original requirements. They ship without verifying, then can't explain why. A blank repo and a clever prompt aren't enough — what's missing is a feedback loop and a memory the agent works *inside*.

## What this is

One command — `/bencium-init` — runs a 5-question interview and produces a complete planning kit in about 60 seconds: product requirements, architecture, a task list, an acceptance checklist, and a `.harness/` folder with config, memory, rules, and an archive for decisions.

## Nothing vanishes

A workflow without checkpoints forgets itself — and invisible work becomes invisible failure. So every boundary in the loop leaves a written trace: each real decision is recorded. Together they're one advantage: you can see exactly what happened, and you can always pick up where you left off.

## How it compares

| | bencium-harness | BMAD-method | Just a context file |
|---|---|---|---|
| Setup time | ~60 sec | Multi-phase interview | Instant |
| Memory model | Tiered markdown (`memory.md` + archive) | Heavy generated docs | Static file |
| Verification gate | `/bencium-verify` against `ACCEPTANCE.md` | — | — |
| Deploy/rollback | Built-in, refuses on verify fail | — | — |
| Infrastructure needed | None | None | None |
| Survives a context reset | Auto-injected | Re-read manually | Yes |

## Who it's for

Solo builders and small teams using agentic coding tools like codex or opencode on real projects — not throwaway demos. Especially valuable for **regulated or healthcare work** where unverified deploys are not OK, and for any project where you want a paper trail of decisions and a refusal to deploy when acceptance criteria slip.

## The 60-second demo

```
$ cd ~/new-project
$ git init
$ # open your agentic coding tool
/bencium-init
```

You get 5 questions (product name, problem, primary user, success metric, stack). One model call later you have:

```
new-project/
├── README.md
├── CLAUDE.md              # project-root agent context, auto-loaded
├── PRD.md                 # 1-page product requirements
├── ARCHITECTURE.md        # 1-page system architecture
├── tasks.md               # Now (≤15) / Roadmap split
├── ACCEPTANCE.md          # 10 testable acceptance checks
└── .harness/
    ├── config.yaml        # deploy + rollback + verify commands
    ├── memory.md          # hot context, auto-loaded each session
    ├── rules.md           # project non-negotiables
    ├── glossary.md
    ├── constraints.md
    └── archive/           # NNNN-decision-*.md, NNNN-retro-*.md
```

Existing projects (ones that already have code) are auto-detected — `/bencium-init` scans the code and produces a retrospective product spec and architecture without overwriting anything.

## How to start a new project with bencium-harness from a vague idea

Short answer: describe your idea in the chat, then run `/bencium-init` in the empty project folder. That one command runs a 5-question interview and generates the entire scaffold in a single ~60s pass.

> **Secret tip:** One faster option if you don't want to wait for the full cycle: ask for a throwaway design prototype (a quick one-route scaffold) to eyeball the look-and-feel, then fold the chosen direction back into the proper creative phase. That trades process rigor for seeing pixels sooner.

## Commands

| Command | What it does |
|---|---|
| `/bencium-init` | Scaffold the harness in the current repo (new or existing project, auto-detected). Also writes `.harness/conventions.md`. |
| `/bencium-next` | **Two-phase:** plan/spec (read-only, waits for your approval) → build (executes). The plan IS the spec. For UI tasks it first offers an optional **prototype detour** — a throwaway one-route preview to eyeball look-and-feel before the spec is written. |
| `/bencium-feature "desc"` | Append a feature to `tasks.md ## Roadmap`. |
| `/bencium-promote` | Move Roadmap items into Now, or demote stale memory entries to archive. |
| `/bencium-decide "title"` | Log a technical decision (and why) to `.harness/archive/`. |
| `/bencium-verify` | Walk `ACCEPTANCE.md` against the actual code. Report pass/fail with evidence. Inspects for gamed tests (weakened or skipped checks) and can delegate a skeptical second opinion to an independent reviewer. |
| `/bencium-deploy` | Verify → deploy → health check → log. Refuses on verify fail. |
| `/bencium-rollback "reason"` | Run the configured rollback command and log the reason. |
| `/bencium-retro` | Postmortem after a failure. Proposes memory and acceptance updates. |

## Accelerated mode (Claude Code only, opt-in)

The harness runs the same way everywhere: one step at a time, each gated. On **Claude Code**
there is now an optional faster gear for the slow, repetitive parts. It uses *dynamic workflows* —
a small program that fans work out across many short-lived helper agents at once instead of walking a
list one item at a time. Four places can use it, all opt-in:

- **Verify** — check every acceptance item in parallel, then have a *second, skeptical* agent try to
  knock down each pass (catching tests that were quietly weakened to go green).
- **Deploy smoke test** — hit each deployed check against the live URL at the same time.
- **Set-up scan** — on a big existing codebase, survey it from several angles at once.
- **Batch build** — when one task is really N independent, mechanical edits (say a rename across many
  files), build them side by side, each in its own isolated copy of the repo, each still test-first.

**Two things to understand about it — this is why it stays optional, never the default:**

1. **Workflows are a Claude Code feature only.** The harness is plain prompt files that also run on
   Codex, opencode, and copy-paste into claude.ai / ChatGPT / Gemini. A workflow program runs on
   *none* of those. So every accelerated step is built to quietly fall back to the normal
   one-at-a-time path when the workflow runtime isn't there — it can only ever be a speed-up, never
   the thing the harness depends on. Detection is automatic: if there's no workflow tool, it's not
   Claude Code, and the serial path runs.
2. **Workflows fan out to dozens of agents and are opt-in by design.** A single run can spin up many
   helper agents (up to 16 working at once, 1000 over a whole run) — that is real token cost. So the
   harness never starts one on its own. You ask for it per run ("verify with a workflow", or an
   `ultracode` request); otherwise you get the normal capped path. This also keeps the harness's hard
   *3-agent limit* intact for everyday work — the workflow is a separate, deliberate escalation, not a
   loosening of that rule.

Nothing about your project changes if you never use it. The audit trail is identical (the result
records just note whether a step ran `serial` or `workflow`, and how many agents it used), and a repo
set up by an older version keeps working.

## Use it in browser and desktop AI tools (not just the terminal)

The harness is not only for terminal coding tools. It is plain prompt files and
templates in a public repo, so any AI that can read a web link can set it up for
you — claude.ai, the Codex app, ChatGPT, Gemini, and similar tools.

**What the tool needs to be able to do:** read a public GitHub link, and either
write files into your project (tools with a connected repo or project folder) or
hand you the files to paste in (everything else). No install, no plugin.

Copy a prompt below into your AI tool and send it.

### 1. Install — point the tool at the repo and let it set up the harness

```text
Read the bencium-harness repository at https://github.com/bencium/bencium-harness

It is a build-loop "harness": command prompts live in bencium-harness/commands/
and file templates live in bencium-harness/templates/. I want to use it on MY
project.

Do this in order:
1. Fetch and read every file in bencium-harness/templates/ and
   bencium-harness/commands/ so you understand the loop.
2. Interview me with the 5 setup questions from the bencium-init command:
   product (one sentence), who it's for, the one killer feature, the stack, and
   the deploy target (plus a health-check URL or command). Ask them, then wait.
3. From my answers, create the harness in my project: tasks.md, ACCEPTANCE.md,
   PRD.md, ARCHITECTURE.md, CLAUDE.md, and a .harness/ folder containing
   config.yaml, memory.md, conventions.md, rules.md, glossary.md, constraints.md,
   and an empty archive/ folder — each filled in from the matching template.
4. From now on, when I type a command name like "bencium-next" or
   "bencium-verify", behave exactly as that command's file in
   bencium-harness/commands/ tells you to — including the two hard rules:
   never write code before I approve the plan, and never call something done
   without showing evidence.

If you cannot write files into my project, output each file's full contents in a
code block so I can save them myself. Confirm you have read the repo, then start
the interview.
```

### 2. Resume — paste this at the start of every new chat

Browser tools have no memory between chats, so this prompt does by hand what the
terminal version does automatically (loads your project context back in).

```text
Before we continue, load my bencium-harness context from this project:
- .harness/memory.md — read the "## Session handoff" block first, then the rest
- .harness/rules.md and .harness/conventions.md
- the 3 newest files in .harness/archive/
- the "## Now" section of tasks.md
- the unchecked items in ACCEPTANCE.md

Summarize where we left off in 3 lines (current task, what's next, any blockers),
then wait for my next command.
```

### 3. Run a step — drive the loop by naming a command

```text
Run bencium-next. Pick the top unchecked task in tasks.md "## Now", read
.harness/conventions.md and the relevant ACCEPTANCE.md rows, then write a short
plan (files to touch, approach, what "done" means) and STOP. Do not write any
code until I reply "approve".
```

Swap `bencium-next` for any command — `bencium-verify`, `bencium-decide "title"`,
`bencium-feature "idea"`, `bencium-deploy`, `bencium-retro` — and the tool follows
that command's file from the repo.

**What you keep vs. the terminal version.** You keep the whole method: the
plan-before-code gate, the acceptance checklist, the decision log, and a memory
that lives in your repo. You lose the *automatic* parts — context no longer loads
itself (use the resume prompt), there are no colored phase banners or status bar,
and nothing physically blocks an out-of-order step; the tool follows the rules
because the prompt tells it to, not because a plugin enforces it. A first-class
version for these tools is on the roadmap — see the MCP companion idea.
