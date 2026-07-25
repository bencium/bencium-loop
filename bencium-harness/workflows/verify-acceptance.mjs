export const meta = {
  name: 'bencium-verify-acceptance',
  description: 'Shard the ACCEPTANCE.md local walk across agents, then adversarially re-check each PASS',
  phases: [
    { title: 'Evaluate', detail: 'one agent per unchecked local row — gather evidence, classify' },
    { title: 'Refute', detail: 'one skeptic per PASS — try to prove the pass is gamed/wrong' },
  ],
}

// Accelerated, opt-in replacement for /bencium-verify Step 3 + Step 3b. Read-only.
// The serial command path is the portable default; this runs ONLY on Claude Code
// (where the Workflow tool exists) and ONLY when the user explicitly asked for it.
// args, passed by the command:
//   { rows: [{ text }], diff, verifyOutput }
// rows = unchecked LOCAL ACCEPTANCE rows only ([deployed] rows are never passed here —
// they are deferred to /bencium-deploy SMOKE, same invariant as the serial path).

const rows = (args && args.rows) || []
const diff = (args && args.diff) || '(no diff provided)'
const verifyOutput = (args && args.verifyOutput) || '(no verify.cmd output provided)'

const EVAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'evidence'],
  properties: {
    status: { enum: ['pass', 'fail', 'skip'] },
    evidence: { type: 'string', description: 'one line: file:line, grep result, or command output' },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean', description: 'true if the PASS does not hold up under scrutiny' },
    reason: { type: 'string', description: 'one line: the gaming pattern or missing evidence found' },
  },
}

log(`verify-acceptance: ${rows.length} local rows → evaluate (haiku), then refute each PASS (sonnet)`)

// Counted rather than reconstructed from the results: a row whose evaluator died never
// reaches the refute stage, so the surviving rows cannot tell you how many agents ran.
let agentsSpawned = 0

// A row that could not be evaluated is a row with no evidence behind it. The harness's own
// rule — "when evidence is thin, prefer FAIL over a hopeful PASS" — applies hardest here.
const unverifiedRow = (text, reason) => ({ text, status: 'fail', evidence: reason, unverified: true })

// pipeline, not a barrier: a row that passes evaluation gets refuted the moment its
// evaluation lands, while other rows are still being evaluated.
const results = await pipeline(
  rows,
  async (row) => {
    agentsSpawned++
    const v = await agent(
      `You are verifying one ACCEPTANCE check against the real repo (read-only). Gather the minimum ` +
        `evidence and classify.\n\nCHECK: ${row.text}\n\nRelevant diff:\n${diff}\n\nverify.cmd output:\n${verifyOutput}\n\n` +
        `Rules: PASS only with concrete evidence (file:line, grep hit, command output). SKIP only if it ` +
        `genuinely does not apply yet. When evidence is thin, prefer FAIL over a hopeful PASS.`,
      { label: `eval:${row.text.slice(0, 40)}`, phase: 'Evaluate', schema: EVAL_SCHEMA, model: 'haiku', effort: 'low' }
    )
    if (!v) return unverifiedRow(row.text, 'evaluator returned no result — row unverified')
    return { text: row.text, status: v.status, evidence: v.evidence }
  },
  async (evaluated) => {
    if (evaluated.status !== 'pass') return evaluated
    // Separation beats self-grading: a fresh skeptic tries to refute the PASS,
    // hunting the v0.6.0 gamed-test / reward-hacking patterns (Step 3a) at scale.
    agentsSpawned++
    const v = await agent(
      `You are an independent, skeptical QA reviewer. You did NOT produce this result. Try to REFUTE ` +
        `this claimed PASS.\n\nCLAIMED PASS: ${evaluated.text}\nStated evidence: ${evaluated.evidence}\n\n` +
        `Look for: weakened/deleted assertions, hardcoded expected values echoing current output, ` +
        `skipped/silenced tests, a test edited to fit the code, blind snapshot updates, a narrowed ` +
        `verify.cmd. A gamed pass is a FAIL. Default to refuted=true when the evidence is thin.`,
      { label: `refute:${evaluated.text.slice(0, 40)}`, phase: 'Refute', schema: REFUTE_SCHEMA, model: 'sonnet' }
    )
    // No skeptic ran, so nothing confirmed this PASS. An unchecked pass is exactly what
    // Step 3b's separation exists to prevent — it does not get to stay green by default.
    if (!v) return unverifiedRow(evaluated.text, `skeptic returned no result — PASS unconfirmed (was: ${evaluated.evidence})`)
    return {
      ...evaluated,
      status: v.refuted ? 'fail' : 'pass',
      evidence: v.refuted ? `refuted: ${v.reason} (was: ${evaluated.evidence})` : evaluated.evidence,
    }
  }
)

// Belt and braces: a stage can still drop an item to null if it throws for a reason the
// guards above did not anticipate. Anything missing comes back as unverified, never absent.
const evaluated = results.filter(Boolean)
const missing = rows
  .filter((row) => !evaluated.some((r) => r.text === row.text))
  .map((row) => unverifiedRow(row.text, 'row lost during evaluation — unverified'))

const clean = [...evaluated, ...missing]
return {
  items: clean,
  pass: clean.filter((r) => r.status === 'pass').length,
  fail: clean.filter((r) => r.status === 'fail').length,
  skip: clean.filter((r) => r.status === 'skip').length,
  unverified: clean.filter((r) => r.unverified).length,
  agents: agentsSpawned,
}
