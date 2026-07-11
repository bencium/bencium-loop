export const meta = {
  name: 'bencium-brownfield-scan',
  description: 'Multi-lens read-only sweep of a large existing repo, synthesized into one brief',
  phases: [
    { title: 'Sweep', detail: 'parallel readers, each blind to the others, one lens each' },
    { title: 'Synthesize', detail: 'one agent folds the lens reports into a 3-5 bullet summary' },
  ],
}

// Accelerated, opt-in widening of /bencium-init brownfield discovery (the serial path
// fans out 3 Explore agents under the 3-agent cap). Read-only. Runs ONLY on Claude Code
// and ONLY when the user opted in on a genuinely large repo — small/medium repos keep
// the serial reads ("subagents add latency for no signal"). args: { lenses?: [string] }

const DEFAULT_LENSES = [
  'Structure & entry points: top-level layout, how the app boots, routing, module boundaries.',
  'Data layer: database/ORM, schema, migrations, how persistence and blobs are handled.',
  'Tests & CI: test framework, how tests run, CI config, coverage gaps.',
  'External surface: HTTP/API routes, third-party integrations, env vars, secrets handling.',
  'Conventions & risks: code style, file-size hotspots, obvious tech debt, anything that would trip an agent.',
]

const lenses = (args && Array.isArray(args.lenses) && args.lenses.length ? args.lenses : DEFAULT_LENSES)

log(`brownfield-scan: ${lenses.length} lenses sweeping in parallel, then synthesize`)

// Barrier is correct here: synthesis genuinely needs ALL lens reports at once to
// dedup and produce one coherent brief.
const reports = await parallel(
  lenses.map((lens, i) => () =>
    agent(
      `You are exploring one facet of an existing repository (read-only). Report ONLY 5-10 tight ` +
        `bullets for your lens — file paths, not prose.\n\nLENS: ${lens}`,
      { label: `sweep:${i + 1}`, phase: 'Sweep', model: 'haiku' }
    )
  )
)

const clean = reports.filter(Boolean)
const synthesis = await agent(
  `Fold these ${clean.length} lens reports from a repo sweep into a single brief for a build harness: ` +
    `3-5 bullets on what this project is, plus a short list of conventions and risks a coding agent must ` +
    `respect. Cite file paths. Do not restate every bullet — synthesize.\n\n` +
    clean.map((r, i) => `--- LENS ${i + 1} ---\n${r}`).join('\n\n'),
  { label: 'synthesize', phase: 'Synthesize', model: 'sonnet' }
)

return { summary: synthesis, lensCount: clean.length, agents: clean.length + 1 }
