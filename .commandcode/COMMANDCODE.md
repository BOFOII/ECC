# COMMANDCODE — ECC Rules

> Individual rule files are in the [rules/](rules/) directory below.
> Source: https://github.com/affaan-m/ECC

This file provides conventions and context for Command Code sessions using ECC
components. Skills and agents are installed globally via the installer script;
rules are deployed per-project or globally.

---

## Installed Components

- **Skills**: ~/.commandcode/skills/ — all ECC skills
- **Agents**: ~/.commandcode/agents/ecc-*.md — all ECC agents
- **Rules**: rules/ directory at this level

## Available Rules

- [agents](rules/agents.md) — Agent delegation patterns
- [code-review](rules/code-review.md) — Code review checklist
- [coding-style](rules/coding-style.md) — Coding conventions
- [development-workflow](rules/development-workflow.md) — Feature implementation workflow
- [git-workflow](rules/git-workflow.md) — Git conventions
- [hooks](rules/hooks.md) — Hook patterns
- [patterns](rules/patterns.md) — Design patterns
- [performance](rules/performance.md) — Performance guidelines
- [security](rules/security.md) — Security best practices
- [testing](rules/testing.md) — Testing conventions

---

## Key Differences from Claude Code

| Feature | Claude Code | Command Code |
|---------|------------|--------------|
| Commands | `/slash` commands | Not supported — use skills instead |
| Hooks | 8+ event types | Not supported |
| Agents | Subagent delegation | Agent definitions |
| MCP | Full support | Supported via `cmd mcp` |
| Skills | Plugin-loaded | `~/.commandcode/skills/` or `.commandcode/skills/` |

---

## Security

1. Always validate inputs at system boundaries
2. Never hardcode secrets — use environment variables
3. Run `npm audit` before committing
4. Review `git diff` before every push
