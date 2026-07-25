// The feedback loop bencium-loop never had for its own instructions.
//
// Across v0.5.0 → v0.8.0 no command file ever shrank: bencium-next.md went 196 → 300 lines,
// and the fleet reached 53 hard rules. Instruction-following degrades as rule count climbs,
// so past some point a new rule silently displaces compliance with an older one — and nothing
// announced when that line was crossed.
//
// This test is the announcement. Budgets are locked at today's counts with no headroom, so
// the only ways past them are to remove something or to edit a number here, which shows up in
// review as its own diff.
//
// WHAT IT DOES NOT MEASURE: compliance. A file under budget is not evidence the model still
// follows every rule in it — only that the surface stopped growing while nobody was looking.
// A real compliance loop would mean running each command against fixtures and grading whether
// it obeyed its own rules. That does not exist yet, and pretending this substitutes for it
// would be the same overclaim bencium-loop gets criticised for elsewhere.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const commandDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bencium-loop", "commands");

// { lines, rules } — locked 2026-07-25, post-consolidation. Lower is always fine.
const BUDGET = {
  "bencium-decide.md": { lines: 81, rules: 0 },
  "bencium-deploy.md": { lines: 219, rules: 8 },
  "bencium-feature.md": { lines: 54, rules: 2 },
  "bencium-init.md": { lines: 130, rules: 6 },
  "bencium-next.md": { lines: 274, rules: 9 },
  "bencium-promote.md": { lines: 62, rules: 3 },
  "bencium-retro.md": { lines: 197, rules: 6 },
  "bencium-rollback.md": { lines: 127, rules: 5 },
  "bencium-verify.md": { lines: 233, rules: 8 },  // +10: Step 6.5 writes the verify receipt the deploy gate reads
};

const FLEET_BUDGET = { lines: 1377, rules: 47 };

const countLines = (src) => src.split("\n").length - 1;

/** Bullets under the `## Hard rules` heading, up to the next heading. */
function countHardRules(src) {
  let inSection = false;
  let rules = 0;
  for (const line of src.split("\n")) {
    if (/^## Hard rules/.test(line)) { inSection = true; continue; }
    if (inSection && /^## /.test(line)) break;
    if (inSection && /^- /.test(line)) rules++;
  }
  return rules;
}

const read = (file) => readFileSync(path.join(commandDir, file), "utf8");

test("every command file is covered by a budget", () => {
  const onDisk = readdirSync(commandDir).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(onDisk, Object.keys(BUDGET).sort(), "a new command needs a budget entry before it can grow");
});

for (const [file, budget] of Object.entries(BUDGET)) {
  test(`${file} stays within budget`, () => {
    const src = read(file);
    const lines = countLines(src);
    const rules = countHardRules(src);

    assert.ok(
      lines <= budget.lines,
      `${file} is ${lines} lines, budget ${budget.lines}. Remove something, or raise the budget deliberately and say why in the CHANGELOG.`,
    );
    assert.ok(
      rules <= budget.rules,
      `${file} has ${rules} hard rules, budget ${budget.rules}. Adding a rule should remove or subsume one — see the invariants skill.`,
    );
  });
}

test("the fleet as a whole stays within budget", () => {
  let lines = 0;
  let rules = 0;
  for (const file of Object.keys(BUDGET)) {
    const src = read(file);
    lines += countLines(src);
    rules += countHardRules(src);
  }

  assert.ok(lines <= FLEET_BUDGET.lines, `${lines} command lines across the fleet, budget ${FLEET_BUDGET.lines}`);
  assert.ok(rules <= FLEET_BUDGET.rules, `${rules} hard rules across the fleet, budget ${FLEET_BUDGET.rules}`);
});
