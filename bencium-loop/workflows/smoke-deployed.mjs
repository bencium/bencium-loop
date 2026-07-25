export const meta = {
  name: 'bencium-smoke-deployed',
  description: 'Evaluate every [deployed] ACCEPTANCE row against the live URL in parallel',
  phases: [{ title: 'Smoke', detail: 'one agent per [deployed] row — real HTTP call to the deployed env' }],
}

// Accelerated, opt-in replacement for /bencium-deploy Step 5.5 SMOKE. Read-only against
// the live URL. Runs ONLY on Claude Code (Workflow tool present) and ONLY on explicit
// opt-in; otherwise the command walks the rows serially. Each row is an independent
// network call, so a barrier (parallel) is the right shape — no cross-row dependency.
// args: { rows: [{ text }], deployUrl }
//
// Invoked only when [deployed] rows exist — the command handles the genuine no-rows case
// (Step 5.5 step 2) before it ever gets here. So an empty `rows` is a caller error, and it
// reports `fail` rather than a vacuous pass: nothing was proved against the live URL.

const rows = (args && args.rows) || []
const deployUrl = (args && args.deployUrl) || ''

const SMOKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'evidence'],
  properties: {
    status: { enum: ['pass', 'fail', 'skip'] },
    evidence: { type: 'string', description: 'one line: HTTP status, response fragment, or console error' },
  },
}

log(`smoke-deployed: ${rows.length} [deployed] rows against ${deployUrl || '(no deploy.url!)'}`)

const results = await parallel(
  rows.map((row) => () =>
    agent(
      `You are smoke-testing ONE deployed-env ACCEPTANCE check against the LIVE deployment. This is a ` +
        `real HTTP call to ${deployUrl} — never localhost, never a unit test.\n\nCHECK: ${row.text}\n` +
        `Deploy URL: ${deployUrl}\n\nSubstitute {{deploy_url}} in the check with the URL above. curl/fetch ` +
        `the deployed endpoint with a representative payload, parse the response, and assert. PASS only ` +
        `with live-URL evidence (HTTP status + response fragment). SKIP only if the row genuinely cannot ` +
        `be evaluated (missing fixture) — state why. Default to FAIL when evidence is thin.`,
      { label: `smoke:${row.text.slice(0, 40)}`, phase: 'Smoke', schema: SMOKE_SCHEMA, model: 'haiku' }
    ).then((v) =>
      // A dead or skipped agent returns null. Left unguarded it throws, the thunk resolves
      // to null, and the row disappears — which used to leave `every()` looking at an empty
      // array and reporting the deploy shipped. An unevaluated row is an unproved row: fail.
      v
        ? { text: row.text, status: v.status, evidence: v.evidence }
        : {
            text: row.text,
            status: 'fail',
            evidence: 'agent returned no result — row unverified against the live URL',
            unverified: true,
          }
    )
  )
)

// Belt and braces: a thunk can still resolve to null if the .then itself throws, so no row
// may be silently missing from the report either. Anything missing is re-added as unverified.
const evaluated = results.filter(Boolean)
const missing = rows
  .filter((row) => !evaluated.some((r) => r.text === row.text))
  .map((row) => ({
    text: row.text,
    status: 'fail',
    evidence: 'row lost during evaluation — unverified against the live URL',
    unverified: true,
  }))

const clean = [...evaluated, ...missing]
const unverified = clean.filter((r) => r.unverified).length
const failed = clean.filter((r) => r.status === 'fail').length
const skipped = clean.filter((r) => r.status === 'skip').length

let result = 'pass'
if (rows.length === 0 || failed > 0) result = 'fail'
else if (skipped > 0) result = 'partial'

log(
  `smoke-deployed: ${result} — ${clean.length - failed - skipped} pass, ${failed} fail ` +
    `(${unverified} unverified), ${skipped} skip`
)

return { rows: clean, result, unverified, agents: rows.length }
