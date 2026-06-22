# eidos-skills-hub

MCP server that searches the [skills.sh](https://skills.sh) agent skills directory plus Eidos first-party hubs in real-time.

One search surface. Three sources.

## Sources

| Hub | What | Install |
|-----|------|---------|
| [skills.sh](https://skills.sh) | 20K+ community skills | `npx skills add <owner/repo>` |
| [eidos-contracts-hub](https://github.com/eidos-agi/eidos-contracts-hub) | Skills as contracts — output schemas, not how-to | `npx skills add eidos-agi/eidos-contracts-hub` |
| [eidos-transcoders-hub](https://github.com/eidos-agi/eidos-transcoders-hub) | Format transforms — yaml→PDF, doc→MP3 | `npx skills add eidos-agi/eidos-transcoders-hub` |

Eidos first-party results are boosted above skills.sh results at equal relevance.

## Install

```bash
git clone https://github.com/eidos-agi/eidos-skills-hub.git ~/repos-eidos-agi/eidos-skills-hub
```

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eidos-skills-hub": {
      "command": "node",
      "args": ["/Users/<you>/repos-eidos-agi/eidos-skills-hub/index.js"]
    }
  }
}
```

Restart Claude Code. Or install the skill to let any agent find and set it up:

```bash
npx skills add eidos-agi/eidos-skills-hub
```

## Self-update

```bash
cd ~/repos-eidos-agi/eidos-skills-hub && git pull
```

No build step. No dependencies. Plain Node.js ESM.

## Tools

- `search_skills(query, limit?, owner_filter?)` — keyword search across all sources
- `search_skills_parallel(query, limit?)` — parallel: all sources + GitHub
- `get_skill(owner, repo, skill)` — fetch SKILL.md, cached locally
- `list_cached_skills()` — index age and cached files
- `refresh_index()` — force rebuild from sitemaps

## How it works

skills.sh has no public JSON API — it's server-side rendered. But it publishes sitemaps listing all skills. We parse those into a local index (`~/.cache/skills-sh/index.json`, refreshed every 6h). Eidos hubs are fetched live from GitHub on each search. SKILL.md content is cached on first fetch.

## Contributing / proposing changes

Use the `improve-skills-hub` skill to propose changes to any hub in this ecosystem — new hubs, new skills, ranking adjustments, or search fixes.

```bash
npx skills add eidos-agi/eidos-skills-hub
# then ask your agent to use the improve-skills-hub skill
```

The skill produces a structured proposal with:
- The observed failure that motivated it
- What to change and why
- Exact shell commands to apply it

Proposals are reviewed and merged via the normal GitHub PR flow.
