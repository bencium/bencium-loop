export const meta = {
  name: 'bencium-batch-build',
  description: 'Build N pre-approved, independent, mechanical tasks in parallel worktrees, each TDD-verified',
  phases: [
    { title: 'Build', detail: 'one worktree-isolated agent per item — RED→GREEN' },
    { title: 'Verify', detail: 'independent check of each item against its acceptance' },
  ],
}

// The ONLY build-loop fan-out, and the only surface here that touches the gate's
// neighborhood — so it is fenced hard. Preconditions the /bencium-next command MUST
// have satisfied BEFORE invoking this (never invoked automatically):
//   1. The user approved the batch spec at the serial PLAN gate.
//   2. Every item is genuinely INDEPENDENT and MECHANICAL (e.g. a repetitive migration),
//      touching disjoint files — not architecture work, not shared-file edits.
//   3. Each item carries its own failing-test command (red→green is per-item, not skipped).
// Runs ONLY on Claude Code (Workflow tool present) and ONLY on explicit opt-in.
// isolation:'worktree' gives each builder its own checkout so parallel writes cannot clobber.
// args: { items: [{ title, spec, testCmd, acceptance }] }

const items = (args && args.items) || []

const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['result', 'redObserved', 'greenObserved', 'filesTouched'],
  properties: {
    result: { enum: ['complete', 'incomplete'] },
    redObserved: { type: 'boolean', description: 'the declared test was seen failing for the right reason first' },
    greenObserved: { type: 'boolean', description: 'the same test passed after implementation' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'evidence'],
  properties: {
    status: { enum: ['pass', 'fail'] },
    evidence: { type: 'string' },
  },
}

log(`batch-build: ${items.length} pre-approved independent items, each in its own worktree, TDD-gated`)

// pipeline: an item verifies as soon as it finishes building, while others still build.
const results = await pipeline(
  items,
  (item) =>
    agent(
      `Implement ONE pre-approved, independent, mechanical task. You are in an isolated worktree — only ` +
        `touch files for THIS item.\n\nTASK: ${item.title}\nSPEC: ${item.spec}\nFailing test command: ${item.testCmd}\n\n` +
        `Hard rules: (1) FIRST write/run the failing test and observe RED for the right reason. (2) Then ` +
        `implement the minimum to reach GREEN. (3) Re-run the test; it must pass. Do NOT redesign ` +
        `architecture, do NOT touch files outside this task, do NOT weaken the test to make it pass. If the ` +
        `task turns out to be non-mechanical or entangled with other items, STOP and return result=incomplete ` +
        `with a note.`,
      { label: `build:${item.title.slice(0, 40)}`, phase: 'Build', schema: BUILD_SCHEMA, isolation: 'worktree' }
    ).then((b) => ({ item, build: b })),
  ({ item, build }) => {
    if (build.result !== 'complete' || !build.redObserved || !build.greenObserved) {
      return { title: item.title, status: 'fail', evidence: build.note || 'build did not reach observed red→green', build }
    }
    // Independent reviewer that did NOT build the item — separation, same principle as verify.
    return agent(
      `You are an independent, skeptical reviewer. You did NOT build this. Check the item against its ` +
        `acceptance and confirm the test genuinely asserts the behavior (not a gamed pass).\n\n` +
        `TASK: ${item.title}\nAcceptance: ${item.acceptance || item.spec}\nFiles touched: ${build.filesTouched.join(', ')}\n` +
        `Default to FAIL when evidence is thin or the test looks weakened.`,
      { label: `verify:${item.title.slice(0, 40)}`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'sonnet' }
    ).then((v) => ({ title: item.title, status: v.status, evidence: v.evidence, build }))
  }
)

const clean = results.filter(Boolean)
return {
  items: clean,
  pass: clean.filter((r) => r.status === 'pass').length,
  fail: clean.filter((r) => r.status !== 'pass').length,
  agents: items.length * 2,
}
