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
    ).then((v) => ({ text: row.text, status: v.status, evidence: v.evidence }))
  )
)

const clean = results.filter(Boolean)
return {
  rows: clean,
  result: clean.every((r) => r.status === 'pass') ? 'pass' : 'fail',
  agents: rows.length,
}
