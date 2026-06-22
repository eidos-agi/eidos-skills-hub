---
name: eidos-skills-hub
description: Install and self-update the Eidos Skills Hub MCP server, which gives agents real-time search across 20K+ skills.sh skills. Use when the user wants to find, install, or update agent skills, or when mcp__eidos-skills-hub__* tools are missing.
---

# Eidos Skills Hub

Real-time skills.sh search for Claude Code and other agents. 20K+ skills indexed from skills.sh sitemaps. Fetches SKILL.md content from GitHub, cached locally.

## Install

```bash
git clone https://github.com/eidos-agi/eidos-skills-hub.git ~/repos-eidos-agi/eidos-skills-hub
```

Then add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eidos-skills-hub": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH>/repos-eidos-agi/eidos-skills-hub/index.js"]
    }
  }
}
```

Restart Claude Code. Tools appear as `mcp__eidos-skills-hub__*`.

## Self-Update

```bash
cd ~/repos-eidos-agi/eidos-skills-hub && git pull
```

No build step — plain Node.js ESM, no dependencies. Changes take effect on next Claude Code restart.

## Tools

| Tool | When to use |
|------|-------------|
| `search_skills(query, limit?, owner_filter?)` | Find skills by keyword — supabase, react, nextjs, etc. |
| `search_skills_parallel(query, limit?)` | Broader search: skills.sh index + GitHub simultaneously |
| `get_skill(owner, repo, skill)` | Read a skill's full SKILL.md — cached after first fetch |
| `list_cached_skills()` | Check index age and what's been downloaded locally |
| `refresh_index()` | Force rebuild from skills.sh sitemaps (auto-refreshes every 6h) |

## Preference Rules

When recommending skills from search results:

1. **Official first** — prefer `anthropics/skills`, `vercel-labs/agent-skills`, `supabase/agent-skills`, `microsoft/azure-skills`
2. **Install count signal** — higher installs = more battle-tested; visible at `skills.sh/{owner}/{repo}/{skill}`
3. **Read before installing** — call `get_skill` to verify the skill is relevant before running `npx skills add`
4. **One repo, many skills** — `npx skills add supabase/agent-skills` installs all skills in that repo; confirm which ones are wanted

## Index Details

- Built from `skills.sh/sitemap-skills-1.xml` + `sitemap-skills-2.xml`
- Cached at `~/.cache/skills-sh/index.json`, TTL 6 hours
- SKILL.md files cached at `~/.cache/skills-sh/skills/`
- No public JSON API on skills.sh — sitemap is the index
