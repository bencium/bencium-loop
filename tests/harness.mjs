// Test harness for the workflow scripts in bencium-harness/workflows/.
//
// Those scripts are not importable modules: the Claude Code workflow runtime evaluates
// each one in a function scope where `args`, `agent`, `parallel`, `pipeline` and `log`
// are injected, and where a top-level `return` is legal. So a test cannot `import` them
// — it reads the source, strips the single `export` keyword, and wraps the body the same
// way the runtime does, injecting fake agents in place of real ones.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workflowDir = path.join(testDir, "..", "bencium-harness", "workflows");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** Run a workflow script with fake agents. `agent` is (prompt, opts) => value | null. */
export async function runWorkflow(scriptName, { args = {}, agent, onLog = () => {} } = {}) {
  const source = await readFile(path.join(workflowDir, scriptName), "utf8");
  const body = source.replace(/^export const meta/m, "const meta");
  const script = new AsyncFunction("args", "agent", "parallel", "pipeline", "log", body);
  return script(args, agent, parallel, pipeline, onLog);
}

// The two fan-out primitives, matching the documented runtime semantics: a thunk or
// stage that throws resolves to null rather than rejecting the whole call. Reproducing
// that faithfully is the point — it is how a dead agent turns into a dropped row.

async function parallel(thunks) {
  return Promise.all(
    thunks.map(async (thunk) => {
      try {
        return await thunk();
      } catch {
        return null;
      }
    }),
  );
}

async function pipeline(items, ...stages) {
  return Promise.all(
    items.map(async (item, index) => {
      let value = item;
      for (const stage of stages) {
        try {
          value = await stage(value, item, index);
        } catch {
          return null;
        }
      }
      return value;
    }),
  );
}

// Both fakes are async because the real `agent()` returns a promise and every script
// chains `.then()` onto it — a synchronous fake would throw for the wrong reason.

/** An agent that returns whatever `replies` maps its label to, or null if unmapped. */
export function scriptedAgent(replies) {
  return async (_prompt, opts) => {
    const key = Object.keys(replies).find((prefix) => opts.label.startsWith(prefix));
    return key === undefined ? null : replies[key];
  };
}

/** An agent that always dies — the terminal-error case the runtime reports as null. */
export const deadAgent = async () => null;
