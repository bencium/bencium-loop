# bencium-loop

> A plugin for agentic coding tools like codex and opencode. It gives AI agents steady context, an acceptance checklist that must pass before anything ships, and a memory that survives a context reset (when the chat history is wiped between sessions).

## The problem

AI agents drift. They forget decisions when the chat is reset. They write code that nobody checks against the original requirements. They ship without verifying, then can't explain why. A blank repo and a clever prompt aren't enough — what's missing is a feedback loop and a memory the agent works *inside*. The names will change, as they always do — the framework, the model, the vendor of the week. The underlying architecture won't.

## What this is

One command — `/bencium-init` — runs a 5-question interview and produces a complete planning kit in about 60 seconds: product requirements, architecture, a task list, an acceptance checklist, and a `.harness/` folder with config, memory, rules, and an archive for decisions.

## Nothing vanishes

A workflow without checkpoints forgets itself — and invisible work becomes invisible failure. So every boundary in the loop leaves a written trace: each real decision is recorded. Together they're one advantage: you can see exactly what happened, and you can always pick up where you left off. The future of AI isn't bigger models — it's persistent, graph-based systems that turn isolated intelligence into something that keeps running. This loop is that idea, scaled down to one repo.

## How it compares

| | bencium-loop | BMAD-method | Just a context file |
|---|---|---|---|
| Setup time | ~60 sec | Multi-phase interview | Instant |
| Memory model | Tiered markdown (`memory.md` + archive) | Heavy generated docs | Static file |
| Verification gate | Walks `ACCEPTANCE.md`, evidence required per item | — | — |
| Deploy/rollback | Deploy blocked by a hook until verify passes | — | — |
| Enforced by tooling | 3 gates (plan, deploy, deployed rows) | — | — |
| Infrastructure needed | None | None | None |
| Survives a context reset | Auto-injected | Re-read manually | Yes |

## What's enforced, and what's asked for

Worth being exact about, because this is where tools like this usually overclaim.

| invariant | how it holds |
|---|---|
| Plan approved before any code | **hook** — the edit is blocked |
| Verify passes before deploy | **hook** — the deploy command is blocked |
| Deployed rows only ticked after a live check | **hook** — the edit is blocked |
| Failing test written before the code | asked |
| Evidence before a check is ticked | asked |
| No item vanishes from a parallel check | **code**, in the workflow scripts |

The three hooks are Claude Code only. Everywhere else — Codex, opencode, a pasted chat — every
line in that table is a convention the model follows because the prompt tells it to. That works
most of the time, and it is not the same thing as being stopped. The distinction matters least on
a short focused session and most on a long one, which is exactly when you would want the gate.

## Who it's for

Solo builders and small teams using agentic coding tools like codex or opencode on real projects — not throwaway demos. Especially valuable for **regulated or healthcare work** where unverified deploys are not OK, and for any project where you want a paper trail of decisions and a refusal to deploy when acceptance criteria slip.

Gartner still expects 40% of agentic AI projects to be cancelled by 2027 — on security, cost, and evaluation, not model quality. In a regulated industry, a human approval gate isn't a tax on speed; it's the requirement.

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

## How to start a new project with bencium-loop from a vague idea

Short answer: describe your idea in the chat, then run `/bencium-init` in the empty project folder. That one command runs a 5-question interview and generates the entire scaffold in a single ~60s pass.

> **Secret tip:** One faster option if you don't want to wait for the full cycle: ask for a throwaway design prototype (a quick one-route scaffold) to eyeball the look-and-feel, then fold the chosen direction back into the proper creative phase. That trades process rigor for seeing pixels sooner.

## Commands

| Command | What it does |
|---|---|
| `/bencium-init` | Scaffold the loop in the current repo (new or existing project, auto-detected). Also writes `.harness/conventions.md`. |
| `/bencium-next` | **Two-phase:** plan/spec (read-only, waits for your approval) → build (executes). The plan IS the spec. For UI tasks it first offers an optional **prototype detour** — a throwaway one-route preview to eyeball look-and-feel before the spec is written. |
| `/bencium-feature "desc"` | Append a feature to `tasks.md ## Roadmap`. |
| `/bencium-promote` | Move Roadmap items into Now, or demote stale memory entries to archive. |
| `/bencium-decide "title"` | Log a technical decision (and why) to `.harness/archive/`. |
| `/bencium-verify` | Walk `ACCEPTANCE.md` against the actual code. Report pass/fail with evidence. Inspects for gamed tests (weakened or skipped checks) and can delegate a skeptical second opinion to an independent reviewer. |
| `/bencium-deploy` | Verify → deploy → health check → smoke against the live URL → log. A hook blocks the deploy command if verify has not passed. |
| `/bencium-rollback "reason"` | Run the configured rollback command and log the reason. |
| `/bencium-retro` | Postmortem after a failure. Proposes memory and acceptance updates. |

## The three gates are enforced, not just asked for

The loop's three loudest promises used to be sentences in a prompt — the agent was asked to
respect them, and usually did. On Claude Code they are hooks:

- **Plan before code.** While the loop is in the PLAN phase, an attempt to edit a file is
  refused. The throwaway prototype detour is the one exception, because seeing pixels before
  committing to a spec is the point of it.
- **Verify before deploy.** Your configured deploy command is refused unless the last verify
  came back clean *for the exact code you are about to ship*: same commit, no edits since. A stale
  receipt does not count.
- **Live check before a deployed row is ticked.** A `[deployed]` row in `ACCEPTANCE.md` can only
  be ticked while the phase is `smoke`. Un-ticking is always allowed, so a rollback can revert
  them.

**Tip after installing or updating.** The hook only registers when the plugin loads, so run
`/plugin update bencium-loop@bencium-loop-local` (or your marketplace name) and restart
Claude Code. Then prove it actually works, in about a minute.

Make a throwaway repo — nothing here touches any real project:

```bash
mkdir -p /tmp/gate-check/.harness && cd /tmp/gate-check
git init -q
printf 'phase=plan\ntask=gate check\n' > .harness/state
echo 'x' > hello.txt
```

Open Claude Code in `/tmp/gate-check` and ask it to edit `hello.txt`. You should get a red
refusal instead of an edit. Then flip the phase and ask again — this time it goes through:

```bash
printf 'phase=build\ntask=gate check\n' > .harness/state
```

Delete it when you're done: `rm -rf /tmp/gate-check`. That refusal is the difference between a
rule and a request.

If it ever fires when you are *not* mid-plan, the phase is stale — run any `/bencium-*` command,
or edit `.harness/state`. The message tells you so.

On Codex, opencode, and browser tools there are no hooks, so all three stay advisory: the
commands still tell the agent to stop, and nothing physically blocks it.

## Accelerated mode (Claude Code only, opt-in)

The loop runs the same way everywhere: one step at a time, each gated. On **Claude Code**
there is now an optional faster gear for the slow, repetitive parts. It uses *dynamic workflows* —
a small program that fans work out across many short-lived helper agents at once instead of walking a
list one item at a time. Three places can use it, all opt-in, and **all three only read** — none of
them writes code:

- **Verify** — check every acceptance item in parallel, then have a *second, skeptical* agent try to
  knock down each pass (catching tests that were quietly weakened to go green).
- **Deploy smoke test** — hit each deployed check against the live URL at the same time.
- **Set-up scan** — on a big existing codebase, survey it from several angles at once.

There used to be a fourth — a parallel *build* that split one task across several agents. It has
since been removed. It made the fast part faster: the slow part of this loop is you reading the
plan, not the typing. And being the only fan-out that wrote code, it was where most of the bugs lived.
If a task is really N mechanical edits, split it at the plan gate and do them one at a time.

**Two things to understand about it — this is why it stays optional, never the default:**

1. **Workflows are a Claude Code feature only.** The loop is plain prompt files that also run on
   Codex, opencode, and copy-paste into claude.ai / ChatGPT / Gemini. A workflow program runs on
   *none* of those. So every accelerated step is built to quietly fall back to the normal
   one-at-a-time path when the workflow runtime isn't there — it can only ever be a speed-up, never
   the thing the loop depends on. Detection is automatic: if there's no workflow tool, it's not
   Claude Code, and the serial path runs.
2. **Workflows fan out to dozens of agents and are opt-in by design.** A single run can spin up many
   helper agents (up to 16 working at once, 1000 over a whole run) — that is real token cost. So the
   loop never starts one on its own. You ask for it per run ("verify with a workflow", or an
   `ultracode` request); otherwise you get the normal capped path. This also keeps the loop's hard
   *3-agent limit* intact for everyday work — the workflow is a separate, deliberate escalation, not a
   loosening of that rule.

Nothing about your project changes if you never use it. The audit trail is identical (the result
records just note whether a step ran `serial` or `workflow`, and how many agents it used), and a repo
set up by an older version keeps working.

## Use it in browser and desktop AI tools (not just the terminal)

The loop is not only for terminal coding tools. It is plain prompt files and
templates in a public repo, so any AI that can read a web link can set it up for
you — claude.ai, the Codex app, ChatGPT, Gemini, and similar tools.

**What the tool needs to be able to do:** read a public GitHub link, and either
write files into your project (tools with a connected repo or project folder) or
hand you the files to paste in (everything else). No install, no plugin.

Copy a prompt below into your AI tool and send it.

### 1. Install — point the tool at the repo and let it set up the loop

```text
Read the bencium-loop repository at https://github.com/bencium/bencium-loop

It is a build loop: command prompts live in bencium-loop/commands/
and file templates live in bencium-loop/templates/. I want to use it on MY
project.

Do this in order:
1. Fetch and read every file in bencium-loop/templates/ and
   bencium-loop/commands/ so you understand the loop.
2. Interview me with the 5 setup questions from the bencium-init command:
   product (one sentence), who it's for, the one killer feature, the stack, and
   the deploy target (plus a health-check URL or command). Ask them, then wait.
3. From my answers, create the loop in my project: tasks.md, ACCEPTANCE.md,
   PRD.md, ARCHITECTURE.md, CLAUDE.md, and a .harness/ folder containing
   config.yaml, memory.md, conventions.md, rules.md, glossary.md, constraints.md,
   and an empty archive/ folder — each filled in from the matching template.
4. From now on, when I type a command name like "bencium-next" or
   "bencium-verify", behave exactly as that command's file in
   bencium-loop/commands/ tells you to — including the two hard rules:
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
Before we continue, load my bencium-loop context from this project:
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
and the three hooks are gone, so nothing physically blocks an out-of-order
step — the tool follows the rules because the prompt tells it to. A first-class
version for these tools is on the roadmap — see the MCP companion idea.
