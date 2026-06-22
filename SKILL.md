---
name: eidos-skills-hub
description: Search skills.sh in real-time. Use when you need to find, discover, or install agent skills from the skills.sh directory. Searches 20K+ skills by keyword, fetches SKILL.md content from GitHub, and caches locally.
---

# skills-sh

Real-time search and cache for the [skills.sh](https://skills.sh) agent skills directory.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_skills` | Search 20K+ skills by keyword — returns ranked results with install commands |
| `search_skills_parallel` | Parallel search: skills.sh index + GitHub, deduplicated, curated preferred |
| `get_skill` | Fetch a skill's full SKILL.md from GitHub (cached locally after first fetch) |
| `list_cached_skills` | Show index age, size, and locally cached SKILL.md files |
| `refresh_index` | Force-refresh the index from skills.sh sitemaps |

## Install (Claude Code)

The MCP server is registered automatically. If not, add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "skills-sh": {
      "command": "node",
      "args": ["~/repos-eidos-agi/skills-sh/index.js"]
    }
  }
}
```

## How It Works

- **Index source:** skills.sh publishes sitemaps with all skill URLs. We parse both sitemaps into a local index at `~/.cache/skills-sh/index.json`, refreshed every 6 hours.
- **Skill content:** Fetched on demand from GitHub (`skills/{name}/SKILL.md`), cached at `~/.cache/skills-sh/skills/`.
- **Parallel search:** Hits skills.sh index + GitHub Search API simultaneously. Deduplicates. Prefers skills.sh-listed (curated) results.
- **No public API:** skills.sh is server-side rendered with no JSON endpoint — the sitemap is the index.
