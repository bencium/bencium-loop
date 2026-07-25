import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const sourceRoot = path.resolve(scriptDir, "..");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const marketplaceId = "bencium-loop-local";
const pluginName = "bencium-loop";
const marketplaceRoot = path.join(codexHome, "local-marketplaces", "bencium-loop-codex");
const marketplacePluginRoot = path.join(marketplaceRoot, "plugins", pluginName);
const configPath = path.join(codexHome, "config.toml");

const commandDescriptions = {
  "bencium-decide": "Log an architectural decision to .harness/archive/ and surface it in memory.",
  "bencium-deploy": "Verify, deploy, health check, and log. Refuses deploy if /bencium-verify fails.",
  "bencium-feature": "Append a new feature to tasks.md Roadmap and optionally promote it to Now.",
  "bencium-init": "Initialize the Bencium build loop in this repo.",
  "bencium-next": "Pick the next task from tasks.md, write a plan/spec, gate on approval, then build.",
  "bencium-promote": "Move items between Roadmap and Now, or demote stale lines from memory.md to archive.",
  "bencium-retro": "Run a postmortem on a failure, then propose memory and acceptance updates.",
  "bencium-rollback": "Run the configured rollback command and log the reason.",
  "bencium-verify": "Walk ACCEPTANCE.md against actual repo state and report PASS/FAIL/SKIP with evidence.",
};

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s+/, "");
}

function listFiles(dir, predicate = () => true) {
  const files = [];

  function walk(current) {
    for (const entry of readdirSorted(current)) {
      if (entry.name === ".DS_Store") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  if (existsSync(dir)) walk(dir);
  return files;
}

function readdirSorted(dir) {
  return existsSync(dir)
    ? Array.from(readdirSync(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    : [];
}

function commandSkill(commandName, markdown) {
  const description = commandDescriptions[commandName] || `Run the ${commandName} Bencium Harness workflow.`;
  const body = stripFrontmatter(markdown);
  return `---\nname: ${commandName}\ndescription: Use when the user asks for \`/${commandName}\`, \`${commandName}\`, or the corresponding Bencium Harness workflow. ${description}\n---\n\n# ${commandName} Codex Adapter\n\nThis skill adapts the local Bencium Harness Claude command for Codex.\n\nOriginal Bencium Harness plugin root:\n\n\`\`\`text\n${sourceRoot}\n\`\`\`\n\nWhen the original command says \`${"${CLAUDE_PLUGIN_ROOT}"}\`, treat it as the path above.\n\nCodex safety translation:\n\n- Follow the active Codex system/developer instructions first.\n- Do not enable or run Claude hooks automatically.\n- If the original command asks for Claude-only tools such as AskUserQuestion, ask inline in Codex unless an equivalent Codex tool is available.\n- If the original command asks for Claude's Task tool or sub-agents, use Codex sub-agents only when explicitly available and appropriate; otherwise do the work locally or ask before delegating.
- If the original command offers a Claude Code Workflow path (any step labelled "accelerated", "workflow fan-out", or invoking a \`Workflow\` tool / \`.claude/workflows/*.mjs\` script), ignore it entirely and run the serial path. The Workflow runtime is Claude-Code-only and does not exist in Codex; never emulate it with extra sub-agents.\n- Keep generated loop files in the current project unless the user names another project.\n- Never overwrite existing files without explicit user confirmation.\n- Preserve user/customer data; do not use local-only storage as the durable source of truth for user data.\n- For shell-command workflows, name the trust boundary first when user input, external APIs, uploaded files, webhooks, secrets, or code execution are involved.\n\n## Original Command\n\n${body}\n`;
}

function helperSkill(sourceSkillName, markdown) {
  const codexName = `bencium-${sourceSkillName}`;
  return markdown
    .replace(/^---\nname:\s*([^\n]+)\n/m, `---\nname: ${codexName}\n`)
    .replace(/^description:\s*(.+)$/m, (_match, desc) => `description: Bencium Harness helper skill. ${desc}`);
}

function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  cpSync(from, to, {
    recursive: true,
    filter: (source) => path.basename(source) !== ".DS_Store",
  });
}

function writePluginFiles(pluginRoot, manifest, version) {
  rmSync(pluginRoot, { recursive: true, force: true });
  ensureDir(path.join(pluginRoot, ".codex-plugin"));
  ensureDir(path.join(pluginRoot, "skills"));
  copyIfExists(path.join(sourceRoot, "templates"), path.join(pluginRoot, "templates"));
  copyIfExists(path.join(sourceRoot, "hooks"), path.join(pluginRoot, "hooks"));
  copyIfExists(path.join(sourceRoot, "statusline"), path.join(pluginRoot, "statusline"));

  const codexManifest = {
    ...manifest,
    version,
    skills: "./skills/",
    interface: {
      displayName: "Bencium Harness",
      shortDescription: "Lightweight AI-assisted build loop with roadmap, plan, build, verify, reflect, deploy, and rollback workflows.",
      longDescription:
        "Codex adapter for the local Bencium Harness Claude plugin. It exposes the /bencium-* workflow commands as Codex skills while leaving the original plugin source untouched.",
      developerName: "Bencium",
      category: "Coding",
      capabilities: ["Interactive", "Read", "Write"],
      websiteURL: "https://bencium.io",
      privacyPolicyURL: "https://openai.com/policies/privacy-policy/",
      termsOfServiceURL: "https://openai.com/policies/terms-of-use/",
      defaultPrompt: ["/bencium-init", "/bencium-feature Add onboarding", "/bencium-next", "/bencium-verify"],
      brandColor: "#0F766E",
      screenshots: [],
    },
  };
  writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), `${JSON.stringify(codexManifest, null, 2)}\n`);

  for (const commandPath of listFiles(path.join(sourceRoot, "commands"), (file) => file.endsWith(".md"))) {
    const commandName = path.basename(commandPath, ".md");
    const skillDir = path.join(pluginRoot, "skills", commandName);
    ensureDir(skillDir);
    writeFileSync(path.join(skillDir, "SKILL.md"), commandSkill(commandName, readFileSync(commandPath, "utf8")));
  }

  for (const skillPath of listFiles(path.join(sourceRoot, "skills"), (file) => path.basename(file) === "SKILL.md")) {
    const sourceSkillName = path.basename(path.dirname(skillPath));
    const skillDir = path.join(pluginRoot, "skills", `bencium-${sourceSkillName}`);
    ensureDir(skillDir);
    writeFileSync(path.join(skillDir, "SKILL.md"), helperSkill(sourceSkillName, readFileSync(skillPath, "utf8")));
  }
}

function writeMarketplace() {
  ensureDir(path.join(marketplaceRoot, ".agents", "plugins"));
  const marketplace = {
    name: marketplaceId,
    interface: {
      displayName: "Bencium Harness Local",
    },
    plugins: [
      {
        name: pluginName,
        source: {
          source: "local",
          path: `./plugins/${pluginName}`,
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Coding",
      },
    ],
  };
  writeFileSync(path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);
}

function updateConfig() {
  if (!existsSync(configPath)) {
    throw new Error(`Codex config not found: ${configPath}`);
  }

  const config = readFileSync(configPath, "utf8");
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const backupPath = `${configPath}.bak-before-bencium-loop-sync-${timestamp.replace(/[:.]/g, "-")}`;
  writeFileSync(backupPath, config);

  let next = config;
  const pluginBlock = `[plugins."${pluginName}@${marketplaceId}"]\nenabled = true\n`;
  if (!next.includes(`[plugins."${pluginName}@${marketplaceId}"]`)) {
    next = `${next.trimEnd()}\n\n${pluginBlock}`;
  }

  const marketplaceBlock = `[marketplaces.${marketplaceId}]\nlast_updated = "${timestamp}"\nsource_type = "local"\nsource = "${marketplaceRoot}"\n`;
  const marketplacePattern = new RegExp(`\\n?\\[marketplaces\\.${marketplaceId}\\]\\n(?:(?!\\n\\[).)*\\n?`, "s");
  if (next.includes(`[marketplaces.${marketplaceId}]`)) {
    next = next.replace(marketplacePattern, `\n${marketplaceBlock}\n`);
  } else {
    const desktopMarker = "\n[desktop]\n";
    next = next.includes(desktopMarker)
      ? next.replace(desktopMarker, `\n${marketplaceBlock}${desktopMarker}`)
      : `${next.trimEnd()}\n\n${marketplaceBlock}`;
  }

  writeFileSync(configPath, next);
  return { backupPath, timestamp };
}

function main() {
  const manifestPath = path.join(sourceRoot, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Run this script from the Bencium Harness source tree. Missing ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const version = manifest.version;
  if (!version) {
    throw new Error("Missing version in .claude-plugin/plugin.json");
  }

  const cachePluginRoot = path.join(codexHome, "plugins", "cache", marketplaceId, pluginName, version);
  writeMarketplace();
  writePluginFiles(marketplacePluginRoot, manifest, version);
  writePluginFiles(cachePluginRoot, manifest, version);
  const { backupPath, timestamp } = updateConfig();

  console.log(`Synced ${pluginName}@${marketplaceId} ${version}`);
  console.log(`Source: ${sourceRoot}`);
  console.log(`Marketplace: ${marketplacePluginRoot}`);
  console.log(`Cache: ${cachePluginRoot}`);
  console.log(`Config backup: ${backupPath}`);
  console.log(`Updated: ${timestamp}`);
}

main();
