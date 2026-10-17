// The three gates are the only places bencium-loop enforces a rule instead of asking for it,
// so each one is exercised here the way Claude Code runs it: a JSON payload on stdin, and an
// exit code back — 0 lets the tool call through, 2 blocks it.
//
// Every case runs against a throwaway project in the OS temp dir, never this repo.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hookDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bencium-loop", "hooks");

const ALLOW = 0;
const BLOCK = 2;

/** A temp git repo with a .harness/ folder, one commit, and whatever files are given. */
function makeProject(files = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "bencium-hook-"));
  mkdirSync(path.join(root, ".harness"));
  writeFileSync(path.join(root, ".gitignore"), ".harness/state\n.harness/last-verify\n");
  writeFileSync(path.join(root, "app.js"), "console.log('hi')\n");
  git(root, "init", "-q");
  git(root, "add", ".");
  git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  for (const [rel, body] of Object.entries(files)) writeFileSync(path.join(root, rel), body);
  return root;
}

function git(cwd, ...args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();
}

function runHook(hook, cwd, toolInput) {
  const payload = JSON.stringify({ cwd, tool_input: toolInput });
  return spawnSync("bash", [path.join(hookDir, hook)], { cwd, input: payload, encoding: "utf8" });
}

// The receipt line is lifted from /bencium-verify Step 6.5 itself rather than copied here, so
// if the command and the gate ever disagree on how `tree` is computed, these tests go red.
const verifyCommand = readFileSync(path.join(hookDir, "..", "commands", "bencium-verify.md"), "utf8");
const RECEIPT_LINE = verifyCommand.split("\n").find((line) => line.includes("> .harness/last-verify"));

function writeReceipt(cwd, result) {
  spawnSync("bash", ["-c", RECEIPT_LINE.replace('"<pass|partial|fail>"', `"${result}"`)], { cwd });
}

const config = (cmdLine) =>
  `deploy:\n  target: fly.io      # fly.io | vercel\n  ${cmdLine}\n  health: "curl -f https://x"\n\nrollback:\n  cmd: "fly releases rollback"\n`;

const withProject = (files, fn) => () => {
  const root = makeProject(files);
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

// ----- deploy gate -----

const RENDERED_TEMPLATE = config(`cmd: "fly deploy"          # full command run by /bencium-deploy`);

test(
  "deploy gate: a two-word deploy.cmd with the template's inline comment is still gated",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, BLOCK);
  }),
);

test(
  "deploy gate: a clean receipt for this exact commit and tree lets the deploy through",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    writeReceipt(root, "pass");
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, ALLOW);
  }),
);

test(
  "deploy gate: a partial receipt blocks the deploy",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    writeReceipt(root, "partial");
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, BLOCK);
  }),
);

test(
  "deploy gate: a receipt from an earlier commit blocks the deploy",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    writeReceipt(root, "pass");
    writeFileSync(path.join(root, "app.js"), "console.log('changed')\n");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qam", "change");
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, BLOCK);
  }),
);

test(
  "deploy gate: uncommitted edits made after verify block the deploy",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    writeReceipt(root, "pass");
    writeFileSync(path.join(root, "app.js"), "console.log('edited after verify')\n");
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, BLOCK);
  }),
);

test(
  "deploy gate: the loop's own phase bookkeeping does not invalidate the receipt",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    writeReceipt(root, "pass");
    writeFileSync(path.join(root, ".harness", "state"), "phase=deploy\n");
    writeFileSync(path.join(root, ".harness", "memory.md"), "- deployed\n");
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, ALLOW);
  }),
);

test(
  "deploy gate: with deploy.cmd = npm run deploy, other npm scripts are not blocked",
  withProject({ ".harness/config.yaml": config(`cmd: "npm run deploy"`) }, (root) => {
    for (const command of ["npm run test", "npm run build", "npm run deploy:preview"]) {
      assert.equal(runHook("deploy-gate.sh", root, { command }).status, ALLOW, command);
    }
    assert.equal(runHook("deploy-gate.sh", root, { command: "npm run deploy" }).status, BLOCK);
  }),
);

test(
  "deploy gate: chained, prefixed and re-spaced forms of the deploy are still gated",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    const disguised = [
      "cd app && fly deploy",
      "FLY_API_TOKEN=abc fly deploy",
      "  fly   deploy --remote-only",
      'git commit -m "ship it" && fly deploy',
      "npm test; fly deploy",
      "env FOO=1 fly deploy",
    ];
    for (const command of disguised) {
      assert.equal(runHook("deploy-gate.sh", root, { command }).status, BLOCK, command);
    }
  }),
);

test(
  "deploy gate: an unquoted deploy.cmd with a trailing comment is parsed",
  withProject({ ".harness/config.yaml": config(`cmd: ./scripts/deploy.sh   # ships prod`) }, (root) => {
    assert.equal(runHook("deploy-gate.sh", root, { command: "./scripts/deploy.sh" }).status, BLOCK);
    assert.equal(runHook("deploy-gate.sh", root, { command: "./scripts/test.sh" }).status, ALLOW);
  }),
);

test(
  "deploy gate: rollback's cmd is not mistaken for the deploy",
  withProject({ ".harness/config.yaml": RENDERED_TEMPLATE }, (root) => {
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly releases rollback" }).status, ALLOW);
  }),
);

test(
  "deploy gate: an unrendered template placeholder disables the gate",
  withProject({ ".harness/config.yaml": config(`cmd: "{{deploy_cmd}}"`) }, (root) => {
    assert.equal(runHook("deploy-gate.sh", root, { command: "fly deploy" }).status, ALLOW);
  }),
);

// ----- acceptance gate -----

const ACCEPTANCE = [
  "# Acceptance",
  "",
  "- `- [x] [deployed] <check>` — legend line, as in the template",
  "",
  "- [x] local check",
  "- [ ] [deployed] signup works on prod",
  "- [x] [deployed] login works on prod",
  "",
].join("\n");

const acceptancePath = (root) => path.join(root, "ACCEPTANCE.md");

test(
  "acceptance gate: ticking a [deployed] row outside SMOKE is blocked",
  withProject({ "ACCEPTANCE.md": ACCEPTANCE, ".harness/state": "phase=build\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, {
      file_path: acceptancePath(root),
      old_string: "- [ ] [deployed] signup works on prod",
      new_string: "- [x] [deployed] signup works on prod",
    });
    assert.equal(result.status, BLOCK);
  }),
);

test(
  "acceptance gate: ticking a [deployed] row during SMOKE is allowed",
  withProject({ "ACCEPTANCE.md": ACCEPTANCE, ".harness/state": "phase=smoke\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, {
      file_path: acceptancePath(root),
      old_string: "- [ ] [deployed] signup works on prod",
      new_string: "- [x] [deployed] signup works on prod",
    });
    assert.equal(result.status, ALLOW);
  }),
);

test(
  "acceptance gate: rollback un-checking a [deployed] row is allowed",
  withProject({ "ACCEPTANCE.md": ACCEPTANCE, ".harness/state": "phase=deploy\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, {
      file_path: acceptancePath(root),
      old_string: "- [x] [deployed] login works on prod",
      new_string: "- [ ] [deployed] login works on prod",
    });
    assert.equal(result.status, ALLOW);
  }),
);

test(
  "acceptance gate: rewriting the whole file without ticking anything new is allowed",
  withProject({ "ACCEPTANCE.md": ACCEPTANCE, ".harness/state": "phase=reflect\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, {
      file_path: acceptancePath(root),
      content: `${ACCEPTANCE}- [ ] new check from a retro\n`,
    });
    assert.equal(result.status, ALLOW);
  }),
);

test(
  "acceptance gate: a whole-file rewrite that ticks a [deployed] row is blocked",
  withProject({ "ACCEPTANCE.md": ACCEPTANCE, ".harness/state": "phase=build\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, {
      file_path: acceptancePath(root),
      content: ACCEPTANCE.replace("- [ ] [deployed] signup", "- [x] [deployed] signup"),
    });
    assert.equal(result.status, BLOCK);
  }),
);

test(
  "acceptance gate: /bencium-init writing a fresh ACCEPTANCE.md with the template legend is allowed",
  withProject({ ".harness/state": "phase=roadmap\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, { file_path: acceptancePath(root), content: ACCEPTANCE.split("- [x] local")[0] });
    assert.equal(result.status, ALLOW);
  }),
);

test(
  "acceptance gate: other files are never inspected",
  withProject({ ".harness/state": "phase=build\n" }, (root) => {
    const result = runHook("acceptance-gate.sh", root, {
      file_path: path.join(root, "notes.md"),
      content: "- [x] [deployed] anything",
    });
    assert.equal(result.status, ALLOW);
  }),
);

// ----- plan gate -----

test(
  "plan gate: edits are blocked during PLAN, prototype paths excepted",
  withProject({ ".harness/state": "phase=plan\n" }, (root) => {
    assert.equal(runHook("plan-gate.sh", root, { file_path: path.join(root, "app.js") }).status, BLOCK);
    assert.equal(runHook("plan-gate.sh", root, { file_path: path.join(root, "_prototype", "a.html") }).status, ALLOW);
  }),
);

test(
  "plan gate: edits are allowed in BUILD",
  withProject({ ".harness/state": "phase=build\n" }, (root) => {
    assert.equal(runHook("plan-gate.sh", root, { file_path: path.join(root, "app.js") }).status, ALLOW);
  }),
);
