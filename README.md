# skills-sh

MCP server for searching the [skills.sh](https://skills.sh) agent skills directory in real-time.

20,000+ skills indexed from skills.sh sitemaps. Skill content fetched from GitHub and cached locally.

## Install

```bash
npx skills add eidos-agi/skills-sh
```

Or add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "skills-sh": {
      "command": "node",
      "args": ["/path/to/repos-eidos-agi/skills-sh/index.js"]
    }
  }
}
```

## Tools

- `search_skills(query, limit?, owner_filter?)` — keyword search across 20K+ skills
- `search_skills_parallel(query, limit?)` — parallel: skills.sh + GitHub, deduplicated
- `get_skill(owner, repo, skill)` — fetch full SKILL.md, cached locally
- `list_cached_skills()` — show index state and cached files
- `refresh_index()` — force refresh from sitemaps
