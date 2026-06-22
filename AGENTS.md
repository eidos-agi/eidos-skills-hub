# Eidos Skills Hub — Agent Orientation

You are an agent working in the Eidos Skills Hub repository.

## What this repo is

An MCP server and skill registry that provides real-time search across:
- **skills.sh** — 20K+ community agent skills, indexed from sitemaps
- **Eidos first-party hubs** — contracts, transcoders, Storemetheus (boosted 1.5× in search)

## Key files

- `index.js` — the MCP server (Node.js ESM, stdio JSON-RPC 2.0 transport)
- `skills/` — SKILL.md files installable via `npx skills add eidos-agi/eidos-skills-hub`
- `.well-known/agent-skills/index.json` — makes the repo discoverable by `npx skills`
- `.mcp.json` — MCP server registration for Codex and compatible agents
- `.codex-plugin/plugin.json` — Codex plugin manifest

## MCP tools (when registered)

- `search_skills(query, limit?, owner_filter?)` — search across all sources
- `search_skills_parallel(query, limit?)` — parallel: main index + GitHub
- `get_skill(owner, repo, skill)` — fetch full SKILL.md, cached 24h
- `list_cached_skills()` — index age and local cache state
- `refresh_index()` — force rebuild from skills.sh sitemaps

## Skills in this repo

- `eidos-skills-hub` — install and self-update this MCP server
- `improve-skills-hub` — propose improvements to the ecosystem (contract-shaped)
- `eidos-ecosystem` — orientation map for the full Eidos AGI architecture

## Running

```bash
node index.js   # starts the MCP server on stdio
```

Optional: set `GITHUB_TOKEN` env var to raise GitHub API rate limits from 60/hr to 5000/hr.

## Eidos ecosystem

This hub is the search layer. Related hubs:
- `eidos-agi/eidos-contracts-hub` — output schemas (code review, deployment, improvement)
- `eidos-agi/eidos-transcoders-hub` — format transforms (yaml→PDF, doc→MP3)
- `eidos-agi/eidos-storemetheus` — governed plugin stores for companies
