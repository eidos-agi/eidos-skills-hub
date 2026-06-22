# Eidos Skills Hub

The governed search and maintenance layer for agent skills across the live [Skills.sh](https://skills.sh) catalog and Eidos first-party hubs.

## What it does

- Searches Skills.sh, Eidos hubs, installed/local Codex skills, trusted libraries, and GitHub-wide `SKILL.md` files concurrently.
- Ranks by task relevance first, with explicit preferred, trusted, and blocked source policies; adoption remains a tie-breaker.
- Reports provider failures independently instead of losing successful search results.
- Caches complete skill snapshots with hashes and provenance in a local git repository.
- Audits installed Codex skills for drift and applies explicitly approved updates through `npx skills`.

## Install for Codex

Install the Eidos marketplace, then the plugin:

```bash
codex plugin marketplace add ~/repos-eidos-agi/eidos-marketplace
codex plugin add eidos-skills-hub@eidos-agi
```

The plugin activates all bundled skills and the MCP server. Start a new Codex thread after installation or update.

To install only the standalone skills:

```bash
npx skills add eidos-agi/eidos-skills-hub --skill '*' --agent codex --global --yes
```

## MCP tools

- `search_skills` — live Skills.sh and Eidos catalog search
- `search_skills_parallel` — parallel multi-library and installed/local search with provider status
- `rank_skill_candidates` — rank arbitrary candidates with explicit preference policy
- `get_skill` — cache a complete snapshot and return `SKILL.md`
- `cache_skill` — cache without installing
- `list_cached_skills` — snapshot, desired-state, and git provenance
- `refresh_index` — refresh the sitemap fallback index
- `check_skill_updates` — compare cached/desired hashes with upstream
- `audit_codex_skills` — report missing, current, or drifted installations
- `sync_codex_skills` — install explicitly approved snapshots through `npx skills`

## Cache and updates

The cache lives at `~/.cache/eidos-skills-hub/repository` and is initialized as a git repository. Each changed snapshot records source, retrieval URL, upstream hash, deterministic content hash, file count, and byte count.

Updates default to read-only checks. `sync_codex_skills` requires `confirm: true` because changed skills alter Codex's operating instructions.

## Development

```bash
npm test
npm run check
```

No runtime dependencies are required; the server uses Node.js built-ins and stdio JSON-RPC. GitHub-backed search is best with `GITHUB_TOKEN` or `GH_TOKEN`; other providers continue working without it.
