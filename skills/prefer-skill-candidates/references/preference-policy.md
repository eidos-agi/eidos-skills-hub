# Skill Preference Policy

## Priority order

1. Compatibility and safety: require a canonical skill shape, reject blocked sources, and inspect before installation.
2. Task relevance: specific coverage of the requested outcome outranks generic breadth.
3. Provenance: honor explicit user preferences first, then local organizational, official, and configured trusted sources.
4. Evidence quality: prefer clear descriptions, companion references, cached snapshots, and verifiable source links.
5. Availability: prefer an installed or cached equivalent when quality is otherwise close.
6. Adoption: use install counts as corroboration and a tie-breaker, never as a substitute for relevance or trust.

## Default trusted libraries

- `openai/skills`
- `anthropics/skills`
- `vercel-labs/agent-skills`
- `microsoft/skills`
- `cloudflare/skills`
- `googleworkspace/cli`
- `supabase/agent-skills`
- `dagster-io/skills`
- local OpenAI, Greenmark, Eidos AGI, and personal skill sources

Trusted means preferred for provenance, not automatically safe or correct. Cached third-party content remains untrusted until inspected.

## Tie handling

When scores are close, show two or three finalists and explain the tradeoff. Prefer a source-specific expert skill over a generic omnibus skill for domain work. Prefer a generic skill only when the request genuinely spans several domains.
