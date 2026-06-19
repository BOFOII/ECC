#!/usr/bin/env node
// Windows: run with `node scripts\install-commandcode.js`
/**
 * install-commandcode.js
 * Installs ECC components into Command Code format.
 *
 * Usage:
 *   node scripts/install-commandcode.js            # normal (skip existing)
 *   node scripts/install-commandcode.js --force    # overwrite existing
 *   node scripts/install-commandcode.js --dry-run  # preview only
 *   node scripts/install-commandcode.js --help
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ──────────────────────────────────────────────────────────────────
const ECC_ROOT = path.resolve(__dirname, '..');
const CC_SKILLS_DIR = path.join(os.homedir(), '.commandcode', 'skills');
const CC_AGENTS_DIR = path.join(os.homedir(), '.commandcode', 'agents');

// Rules output: write to .commandcode/COMMANDCODE.md relative to CWD
// So it works wherever the user runs the script (macOS, Windows, Linux)
const CC_RULES_DIR = path.join(process.cwd(), '.commandcode');
const CC_RULES_FILE = path.join(process.cwd(), '.commandcode', 'COMMANDCODE.md');

const DEDUP_SOURCE = path.join(ECC_ROOT, '.agents', 'skills');
const SKILLS_SOURCE = path.join(ECC_ROOT, 'skills');
const AGENTS_SOURCE = path.join(ECC_ROOT, 'agents');
const RULES_SOURCE = path.join(ECC_ROOT, 'rules', 'common');
const COMMANDS_SOURCE = path.join(ECC_ROOT, 'commands');

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FLAGS = { force: false, dryRun: false };

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    console.log(`
ECC → Command Code Installer
─────────────────────────────
Installs ECC components into Command Code format.

Usage:
  node scripts/install-commandcode.js            # skip existing
  node scripts/install-commandcode.js --force    # overwrite existing
  node scripts/install-commandcode.js --dry-run  # preview only
  node scripts/install-commandcode.js --help

What it does:
  • Converts 67 ECC agents → ~/.commandcode/agents/ecc-*.md
  • Copies 271 ECC skills → ~/.commandcode/skills/<name>/
  • Skips 92 ECC commands (not supported by Command Code)
  • Merges 10 rules into .commandcode/COMMANDCODE.md (in current dir)

Works on macOS, Windows, and Linux.
`);
    process.exit(0);
  }
  if (arg === '--force') FLAGS.force = true;
  if (arg === '--dry-run') FLAGS.dryRun = true;
}

// ── Utilities ───────────────────────────────────────────────────────────────

function log(...args) {
  if (FLAGS.dryRun) process.stdout.write('[DRY-RUN] ');
  console.log(...args);
}

function parseFrontmatter(content) {
  // Expects content between --- delimiters
  const match = content.match(/^---\s*\n([\s\S]*?)\n?---\s*\n/);
  if (!match) return { frontmatter: {}, body: content };

  const raw = match[1];
  const frontmatter = {};
  let currentKey = null;
  let currentArray = null;

  for (const line of raw.split('\n')) {
    // Array continuation (indented line starting with - or within quotes)
    const arrayItem = line.match(/^\s+-\s*"([^"]*)"\s*$/);
    if (arrayItem && currentKey && Array.isArray(frontmatter[currentKey])) {
      frontmatter[currentKey].push(arrayItem[1]);
      continue;
    }

    const arrayItem2 = line.match(/^\s+-\s*'([^']*)'\s*$/);
    if (arrayItem2 && currentKey && Array.isArray(frontmatter[currentKey])) {
      frontmatter[currentKey].push(arrayItem2[1]);
      continue;
    }

    const arrayItem3 = line.match(/^\s+-\s*(\S+)\s*$/);
    if (arrayItem3 && currentKey && Array.isArray(frontmatter[currentKey])) {
      frontmatter[currentKey].push(arrayItem3[1]);
      continue;
    }

    // Metadata object: {key: value}
    const metadataMatch = line.match(/^(\w+):\s*\{(\w+):\s*(\S+)\}\s*$/);
    if (metadataMatch) {
      const obj = {};
      obj[metadataMatch[2]] = metadataMatch[3].replace(/["']/g, '');
      frontmatter[metadataMatch[1]] = obj;
      continue;
    }

    // Indented key under object:  key: value
    const indentedKey = line.match(/^\s+(\w+):\s*(.+)$/);
    if (indentedKey && currentKey && typeof frontmatter[currentKey] === 'object' && !Array.isArray(frontmatter[currentKey])) {
      frontmatter[currentKey][indentedKey[1]] = indentedKey[2].trim().replace(/["']/g, '');
      continue;
    }

    // Top-level key: value or key: [...]
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      let val = kv[2].trim();

      // Array like ["Read", "Grep"]
      const arrMatch = val.match(/^\[([\s\S]*)\]$/);
      if (arrMatch) {
        const items = arrMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        frontmatter[currentKey] = items;
      } else {
        val = val.replace(/^["']|["']$/g, '');
        frontmatter[currentKey] = val || true;
      }
      continue;
    }
  }

  const bodyStart = match[0].length;
  const body = content.slice(bodyStart);

  return { frontmatter, body };
}

const EOL = os.EOL;

function dumpFrontmatter(obj) {
  const lines = ['---'];
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) {
        lines.push(`  - "${item}"`);
      }
    } else if (typeof val === 'object' && val !== null) {
      lines.push(`${key}:`);
      for (const [sk, sv] of Object.entries(val)) {
        lines.push(`  ${sk}: ${sv}`);
      }
    } else if (typeof val === 'string') {
      // Quote if contains special chars or YAML-special chars
      const yamlSpecial = /[*&!|>%@`]/;
      if (val === '' || val.includes(':') || val.includes('#') || val.includes('[') || val.includes('"') || val.includes("'") || yamlSpecial.test(val)) {
        lines.push(`${key}: "${val}"`);
      } else {
        lines.push(`${key}: ${val}`);
      }
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return lines.join(EOL);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (!FLAGS.dryRun) fs.mkdirSync(dir, { recursive: true });
    log(`Created directory: ${dir}`);
  }
}

function copyFile(src, dest) {
  if (FLAGS.dryRun) {
    log(`Would copy: ${src} → ${dest}`);
    return true;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function writeFile(filePath, content) {
  if (FLAGS.dryRun) {
    log(`Would write: ${filePath}`);
    return;
  }
  ensureDir(path.dirname(filePath));
  // Use platform-native line endings for generated files (Windows compat)
  const normalized = String(content).replace(/\r?\n/g, EOL);
  fs.writeFileSync(filePath, normalized, 'utf-8');
}



function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).length;
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log('┌─────────────────────────────────────┐');
console.log('│  ECC → Command Code Installer        │');
console.log('└─────────────────────────────────────┘\n');

if (FLAGS.dryRun) console.log('  [DRY-RUN MODE] No files will be written.\n');

let stats = { skills: 0, skillsDedup: 0, agents: 0, commands: 0, rules: 0 };

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: Skills (271)
// ═══════════════════════════════════════════════════════════════════════════
console.log('── Skills ──────────────────────────────');

// Collect dedup set from .agents/skills/
const dedupNames = new Set();
if (fs.existsSync(DEDUP_SOURCE)) {
  for (const entry of fs.readdirSync(DEDUP_SOURCE)) {
    const statPath = path.join(DEDUP_SOURCE, entry);
    if (fs.statSync(statPath).isDirectory()) {
      dedupNames.add(entry);
    }
  }
}
log(`Found ${dedupNames.size} skills in .agents/skills/ (dedup source)`);

// First, copy from .agents/skills/ (preferred for dedup)
if (fs.existsSync(DEDUP_SOURCE)) {
  for (const skillDir of fs.readdirSync(DEDUP_SOURCE)) {
    const srcDir = path.join(DEDUP_SOURCE, skillDir);
    if (!fs.statSync(srcDir).isDirectory()) continue;

    const srcFile = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(srcFile)) {
      log(`  ⚠ No SKILL.md in .agents/skills/${skillDir}, skipping`);
      continue;
    }

    const destDir = path.join(CC_SKILLS_DIR, skillDir);
    const destFile = path.join(destDir, 'SKILL.md');

    if (fs.existsSync(destFile) && !FLAGS.force) {
      log(`  ∼ Skipped ${skillDir} (already exists, use --force to overwrite)`);
      continue;
    }

    copyFile(srcFile, destFile);
    stats.skills++;

    // Copy any extra files (references/, scripts/, assets/)
    for (const item of fs.readdirSync(srcDir)) {
      if (item === 'SKILL.md') continue;
      const itemPath = path.join(srcDir, item);
      const destItemPath = path.join(destDir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        copyDir(itemPath, destItemPath);
      } else {
        copyFile(itemPath, destItemPath);
      }
    }

    log(`  ✓ ${skillDir} (from .agents/skills/)`);
  }
}

// Then copy from skills/, skipping dedup
if (fs.existsSync(SKILLS_SOURCE)) {
  for (const skillDir of fs.readdirSync(SKILLS_SOURCE)) {
    const srcDir = path.join(SKILLS_SOURCE, skillDir);
    if (!fs.statSync(srcDir).isDirectory()) continue;

    const srcFile = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(srcFile)) {
      log(`  ⚠ No SKILL.md in skills/${skillDir}, skipping`);
      continue;
    }

    const destDir = path.join(CC_SKILLS_DIR, skillDir);
    const destFile = path.join(destDir, 'SKILL.md');

    // Skip if already installed from .agents/skills/ (preferred dedup source)
    if (dedupNames.has(skillDir) && (fs.existsSync(destFile) || FLAGS.dryRun)) {
      stats.skillsDedup++;
      continue;
    }

    if (fs.existsSync(destFile) && !FLAGS.force) {
      log(`  ∼ Skipped ${skillDir} (already exists, use --force to overwrite)`);
      stats.skillsDedup++;
      continue;
    }

    copyFile(srcFile, destFile);

    // Copy any extra files (references/, scripts/, assets/)
    for (const item of fs.readdirSync(srcDir)) {
      if (item === 'SKILL.md') continue;
      const itemPath = path.join(srcDir, item);
      const destItemPath = path.join(destDir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        copyDir(itemPath, destItemPath);
      } else {
        copyFile(itemPath, destItemPath);
      }
    }

    stats.skills++;
    log(`  ✓ ${skillDir}`);
  }
}

log(`Skills: ${stats.skills} copied (${stats.skillsDedup} dedup skipped)\n`);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: Agents (67)
// ═══════════════════════════════════════════════════════════════════════════
console.log('── Agents ──────────────────────────────');

if (fs.existsSync(AGENTS_SOURCE)) {
  const agentFiles = fs.readdirSync(AGENTS_SOURCE).filter(f => f.endsWith('.md'));
  log(`Found ${agentFiles.length} agent files`);

  for (const agentFile of agentFiles) {
    const srcPath = path.join(AGENTS_SOURCE, agentFile);
    const content = fs.readFileSync(srcPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter.name) {
      log(`  ⚠ Skipped ${agentFile} (no name in frontmatter)`);
      continue;
    }

    const originalName = frontmatter.name;
    const newName = originalName.startsWith('ecc-') ? originalName : `ecc-${originalName}`;

    const destFile = path.join(CC_AGENTS_DIR, `${newName}.md`);

    if (fs.existsSync(destFile) && !FLAGS.force) {
      log(`  ∼ Skipped ${newName} (already exists, use --force to overwrite)`);
      continue;
    }

    // Build new frontmatter for Command Code
    const newFm = {
      name: newName,
      description: frontmatter.description || `ECC agent: ${originalName}`,
      tools: '*',
    };

    const output = dumpFrontmatter(newFm) + '\n' + body.trimStart();
    writeFile(destFile, output);
    stats.agents++;
    log(`  ✓ ${newName}`);
  }
} else {
  log(`  ⚠ Agents source not found: ${AGENTS_SOURCE}`);
}

log(`Agents: ${stats.agents} converted\n`);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: Commands (92) — skip
// ═══════════════════════════════════════════════════════════════════════════
console.log('── Commands ────────────────────────────');

if (fs.existsSync(COMMANDS_SOURCE)) {
  stats.commands = countFiles(COMMANDS_SOURCE);
  log(`Commands: ${stats.commands} skipped (not supported by Command Code)\n`);
} else {
  log('Commands: 0 (source not found)\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Rules → COMMANDCODE.md
// ═══════════════════════════════════════════════════════════════════════════
console.log('── Rules ───────────────────────────────');

const ruleFiles = [
  'agents.md',
  'code-review.md',
  'coding-style.md',
  'development-workflow.md',
  'git-workflow.md',
  'hooks.md',
  'patterns.md',
  'performance.md',
  'security.md',
  'testing.md',
];

if (fs.existsSync(RULES_SOURCE)) {
  const sections = [];
  let loadedCount = 0;

  for (const ruleFile of ruleFiles) {
    const rulePath = path.join(RULES_SOURCE, ruleFile);
    if (!fs.existsSync(rulePath)) {
      sections.push(`## ${ruleFile.replace('.md', '')}\n\n*(File not found)*\n`);
      continue;
    }

    const ruleContent = fs.readFileSync(rulePath, 'utf-8').trim();
    // Strip frontmatter if present (rules/common/ files shouldn't have it, but be safe)
    const cleanContent = ruleContent.replace(/^---[\s\S]*?---\s*\n?/, '');
    const sectionName = ruleFile.replace('.md', '');
    // Normalize line endings to platform-native
    const normalizedContent = cleanContent.replace(/\r?\n/g, EOL);
    sections.push(`## ${sectionName}${EOL}${EOL}${normalizedContent}`);
    loadedCount++;
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const fullContent = [
    '# COMMANDCODE — ECC Rules',
    '',
    `> Generated from ECC rules/common/ on ${now}`,
    '> Source: https://github.com/affaan-m/ECC',
    '',
    'These rules provide baseline conventions and best practices for AI-assisted development.',
    'They apply across all projects by default.',
    '',
    '---',
    '',
    sections.join(EOL + '---' + EOL),
    '',
  ].join(EOL);

  writeFile(CC_RULES_FILE, fullContent);
  stats.rules = loadedCount;
  log(`Rules: ${loadedCount} files merged → COMMANDCODE.md`);
} else {
  log(`  ⚠ Rules source not found: ${RULES_SOURCE}`);
}

// ── Helper: recursive copy directory ────────────────────────────────────────
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════
console.log('── Summary ─────────────────────────────');
console.log(`Skills copied:      ${stats.skills}${stats.skillsDedup > 0 ? ` (${stats.skillsDedup} dedup skipped)` : ''}`);
console.log(`Agents converted:   ${stats.agents}`);
console.log(`Commands skipped:   ${stats.commands}`);
console.log(`Rules merged:       ${stats.rules} → COMMANDCODE.md`);
console.log(`Mode:               ${FLAGS.dryRun ? 'DRY-RUN (no files written)' : FLAGS.force ? 'FORCE (overwritten)' : 'SAFE (skip existing)'}`);
console.log('');
console.log(`Skills:   ${CC_SKILLS_DIR}`);
console.log(`Agents:   ${CC_AGENTS_DIR}/ecc-*.md`);
console.log(`Rules:    ${CC_RULES_FILE}`);
console.log('');
if (!FLAGS.dryRun) {
  console.log('Done! Start a Command Code session to see the installed components.');
} else {
  console.log('Run without --dry-run to actually install.');
}
