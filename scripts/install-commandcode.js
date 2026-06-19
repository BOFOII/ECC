#!/usr/bin/env node
// Windows: run with `node scripts\install-commandcode.js`
/**
 * install-commandcode.js
 * Installs ECC components into Command Code format.
 *
 * Usage:
 *   node scripts/install-commandcode.js                # skip existing
 *   node scripts/install-commandcode.js --force        # overwrite existing
 *   node scripts/install-commandcode.js --dry-run      # preview only
 *   node scripts/install-commandcode.js --global       # install to ~/.commandcode/ (global)
 *   node scripts/install-commandcode.js --global --force
 *   node scripts/install-commandcode.js --help
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ──────────────────────────────────────────────────────────────────
const ECC_ROOT = path.resolve(__dirname, '..');
const ECC_CC_DIR = path.join(ECC_ROOT, '.commandcode');   // source template
const CC_HOME = os.homedir();
const CC_PROJECT = process.cwd();

const CC_GLOBAL = {
  skills: path.join(CC_HOME, '.commandcode', 'skills'),
  agents: path.join(CC_HOME, '.commandcode', 'agents'),
  ccDir:  path.join(CC_HOME, '.commandcode'),
};

const CC_PROJECT_DIR = {
  ccDir: path.join(CC_PROJECT, '.commandcode'),
};

const SKILLS_SRC = path.join(ECC_ROOT, 'skills');
const AGENTS_SRC = path.join(ECC_ROOT, 'agents');
const DEDUP_SRC  = path.join(ECC_ROOT, '.agents', 'skills');
const RULES_SRC  = path.join(ECC_ROOT, 'rules', 'common');
const CMDS_SRC   = path.join(ECC_ROOT, 'commands');

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FLAGS = { force: false, dryRun: false, global: false };

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    console.log(`
ECC → Command Code Installer
─────────────────────────────
Installs ECC components into Command Code format.

Usage:
  node scripts/install-commandcode.js                # project scope
  node scripts/install-commandcode.js --global       # ~/.commandcode/ (once for all projects)
  node scripts/install-commandcode.js --force        # overwrite existing
  node scripts/install-commandcode.js --dry-run      # preview only
  node scripts/install-commandcode.js --help

What it does:
  • Converts 67 ECC agents → agents/ecc-*.md
  • Copies 271 ECC skills → skills/<name>/
  • Copies 10 rules + COMMANDCODE.md → .commandcode/rules/
  • Skips 92 ECC commands (not supported by Command Code)

Install scope:
  ─ default:   .commandcode/  in current directory (per project)
  ─ --global:  ~/.commandcode/  in home directory (all projects)
`);
    process.exit(0);
  }
  if (arg === '--force') FLAGS.force = true;
  if (arg === '--dry-run') FLAGS.dryRun = true;
  if (arg === '--global') FLAGS.global = true;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(...args) {
  if (FLAGS.dryRun) process.stdout.write('[DRY-RUN] ');
  console.log(...args);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (!FLAGS.dryRun) fs.mkdirSync(dir, { recursive: true });
    log(`  Created: ${dir}`);
  }
}

function copyFile(src, dest) {
  if (FLAGS.dryRun) {
    log(`  Would copy: ${path.basename(src)} → ${dest.replace(process.cwd(), '.')}`);
    return true;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function transformAgent(srcPath, destPath) {
  if (FLAGS.dryRun) {
    log(`  Would convert: ${path.basename(srcPath)} → ${destPath.replace(CC_HOME, '~')}`);
    return true;
  }

  const content = fs.readFileSync(srcPath, 'utf-8');
  const match = content.match(/^---\s*\n([\s\S]*?)\n?---\s*\n/);
  if (!match) return false;

  const raw = match[1];
  const fm = {};
  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      let val = kv[2].trim();
      const arr = val.match(/^\[([\s\S]*)\]$/);
      if (arr) fm[kv[1]] = arr[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else fm[kv[1]] = val.replace(/^["']|["']$/g, '') || true;
    }
  }

  const body = content.slice(match[0].length);
  const name = fm.name || path.basename(srcPath, '.md');
  const newName = name.startsWith('ecc-') ? name : `ecc-${name}`;

  const newFm = [
    '---',
    `name: ${newName}`,
    `description: "${(fm.description || `ECC agent: ${name}`).replace(/"/g, '\\"')}"`,
    'tools: "*"',
    '---',
  ].join('\n');

  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, newFm + '\n' + body.trimStart(), 'utf-8');
  return true;
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).length;
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log('┌─────────────────────────────────────┐');
console.log('│  ECC → Command Code Installer        │');
console.log('└─────────────────────────────────────┘\n');

const scope = FLAGS.global ? 'GLOBAL (~/.commandcode/)' : 'PROJECT (.commandcode/)';
console.log(`  Scope: ${scope}\n`);

if (FLAGS.dryRun) console.log('  [DRY-RUN MODE] — no files written\n');

const stats = { skills: 0, dedup: 0, agents: 0, rules: 0, commands: 0 };

// ── Phase 1: Skills ─────────────────────────────────────────────────────────
console.log('── Skills ──────────────────────────────');

if (fs.existsSync(DEDUP_SRC)) {
  for (const dir of fs.readdirSync(DEDUP_SRC)) {
    const src = path.join(DEDUP_SRC, dir);
    if (!fs.statSync(src).isDirectory()) continue;
    const sk = path.join(src, 'SKILL.md');
    if (!fs.existsSync(sk)) continue;
    const dest = path.join(CC_GLOBAL.skills, dir, 'SKILL.md');

    if (fs.existsSync(dest) && !FLAGS.force) { log(`  ∼ ${dir} (exists, --force to overwrite)`); continue; }
    copyFile(sk, dest);
    copyDir(src, path.join(CC_GLOBAL.skills, dir));
    stats.skills++;
  }
}

if (fs.existsSync(SKILLS_SRC)) {
  for (const dir of fs.readdirSync(SKILLS_SRC)) {
    const src = path.join(SKILLS_SRC, dir);
    if (!fs.statSync(src).isDirectory()) continue;
    const sk = path.join(src, 'SKILL.md');
    if (!fs.existsSync(sk)) continue;
    const dest = path.join(CC_GLOBAL.skills, dir, 'SKILL.md');

    if (!fs.existsSync(dest)) {
      copyFile(sk, dest);
      copyDir(src, path.join(CC_GLOBAL.skills, dir));
      stats.skills++;
    } else {
      stats.dedup++;
    }
  }
}

log(`  Skills: ${stats.skills} installed (${stats.dedup} dedup skipped)\n`);

// ── Phase 2: Agents ─────────────────────────────────────────────────────────
console.log('── Agents ──────────────────────────────');

if (fs.existsSync(AGENTS_SRC)) {
  for (const f of fs.readdirSync(AGENTS_SRC).filter(f => f.endsWith('.md'))) {
    const src = path.join(AGENTS_SRC, f);
    const dest = path.join(CC_GLOBAL.agents, f.replace(/^/, 'ecc-'));
    if (fs.existsSync(dest) && !FLAGS.force) { continue; }
    if (transformAgent(src, dest)) stats.agents++;
  }
}

log(`  Agents: ${stats.agents} converted\n`);

// ── Phase 3: Commands ───────────────────────────────────────────────────────
console.log('── Commands ────────────────────────────');
stats.commands = countFiles(CMDS_SRC);
log(`  Commands: ${stats.commands} skipped (not supported)\n`);

// ── Phase 4: Rules + COMMANDCODE.md ─────────────────────────────────────────
console.log('── Rules ───────────────────────────────');

const targetCCDir = FLAGS.global ? CC_GLOBAL.ccDir : CC_PROJECT_DIR.ccDir;
const targetRulesDir = path.join(targetCCDir, 'rules');

// Copy individual rule files from ECC rules/common/
let rulesCopied = 0;
if (fs.existsSync(RULES_SRC)) {
  for (const f of fs.readdirSync(RULES_SRC).filter(f => f.endsWith('.md'))) {
    const src = path.join(RULES_SRC, f);
    const dest = path.join(targetRulesDir, f);
    if (fs.existsSync(dest) && !FLAGS.force) { continue; }
    copyFile(src, dest);
    rulesCopied++;
  }
}
stats.rules = rulesCopied;

// Generate COMMANDCODE.md that references the rules
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const actualRules = fs.existsSync(targetRulesDir)
  ? fs.readdirSync(targetRulesDir).filter(f => f.endsWith('.md')).sort()
  : [];
const ruleFmt = (actualRules.length > 0)
  ? actualRules.map(f => `  • [${f.replace('.md', '')}](rules/${f})`).join('\n')
  : '  *(rules will be listed after installation)*';

const cmdCodeMd = [
  '# ECC for Command Code',
  '',
  `> Generated from ECC on ${now}`,
  '> Source: https://github.com/affaan-m/ECC',
  '',
  'This file provides conventions and context for Command Code sessions.',
  '',
  '---',
  '',
  '## Installed Components',
  '',
  `**Skills:** ${stats.skills} installed at \`skills/\``,
  `**Agents:** ${stats.agents} installed at \`agents/ecc-*.md\``,
  '',
  '---',
  '',
  '## Rules',
  '',
  `Individual rule files are in the [rules/](rules/) directory:`,
  '',
  ruleFmt,
  '',
  '---',
  '',
  '## Key Differences from Claude Code',
  '',
  '| Feature | Claude Code | Command Code |',
  '|---------|------------|--------------|',
  '| Commands | `/slash` commands | Not supported — use skills instead |',
  '| Hooks | 8+ event types | Not supported |',
  '| Agents | Subagent delegation | Agent definitions |',
  '| MCP | Full support | Supported via \`cmd mcp\` |',
  '| Skills | Plugin-loaded | \`~/.commandcode/skills/\` or \`.commandcode/skills/\` |',
  '',
  '---',
  '',
  '## Security',
  '',
  '1. Always validate inputs at system boundaries',
  '2. Never hardcode secrets — use environment variables',
  '3. Run \`npm audit\` before committing',
  '4. Review \`git diff\` before every push',
  '',
].join('\n');

const ccFile = path.join(targetCCDir, 'COMMANDCODE.md');
if (!fs.existsSync(ccFile) || FLAGS.force) {
  writeFile(ccFile, cmdCodeMd);
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('── Summary ─────────────────────────────');
console.log(`Skills:              ${stats.skills} (${stats.dedup} dedup skipped)`);
console.log(`Agents:              ${stats.agents}`);
console.log(`Commands skipped:    ${stats.commands}`);
console.log(`Rules:               ${stats.rules} files`);
console.log(`Scope:               ${scope}`);
console.log(`Mode:                ${FLAGS.dryRun ? 'DRY-RUN' : FLAGS.force ? 'FORCE' : 'SAFE'}`);
console.log('');
const p = FLAGS.global ? CC_GLOBAL.ccDir : CC_PROJECT_DIR.ccDir;
console.log(`Installed to: ${p}`);
console.log('');
if (!FLAGS.dryRun) {
  console.log('Done!');
} else {
  console.log('Run without --dry-run to install.');
}

// ── Helpers (writeFile needs EOL) ──────────────────────────────────────────

function writeFile(filePath, content) {
  if (FLAGS.dryRun) {
    log(`  Would write: ${filePath}`);
    return;
  }
  ensureDir(path.dirname(filePath));
  const normalized = String(content).replace(/\r?\n/g, os.EOL);
  fs.writeFileSync(filePath, normalized, 'utf-8');
}
