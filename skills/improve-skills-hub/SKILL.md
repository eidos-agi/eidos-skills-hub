---
name: improve-skills-hub
description: Contract for proposing improvements to the Eidos Skills Hub ecosystem. Use when a search returns poor results, a hub is missing, a skill is stale, or the ranking policy should change. Produces a structured proposal that can be reviewed and applied.
---

# Improve Skills Hub Contract

## Contract

```json
{
  "$schema": "https://json-schema.org/draft/2020-12",
  "title": "Skills Hub Improvement Proposal",
  "purpose": "Propose a specific, actionable change to the eidos-skills-hub ecosystem — a new hub, a new skill, a ranking adjustment, or a search fix. Every proposal must be motivated by an observed failure, not a hypothetical.",
  "context": "Read the current state: eidos-skills-hub/index.js for search logic and hub wiring, .well-known/agent-skills/index.json in each hub for skill inventory, and the SKILL.md files for content quality. Base the proposal on what's actually there.",
  "constraints": [
    "One proposal per output — don't bundle unrelated changes",
    "observed_failure must describe a real search or use case that didn't work",
    "New hubs require at least 2 concrete skills ready to populate them",
    "Ranking changes must include a before/after example showing improvement",
    "Runtime changes must add or update deterministic tests",
    "Changes affecting installation or updates must include rollback steps",
    "self_update steps must be copy-pasteable — no placeholders"
  ],
  "required": ["observed_failure", "proposal_type", "proposal", "self_update"],
  "properties": {
    "observed_failure": {
      "type": "string",
      "description": "What search query, use case, or result revealed the gap"
    },
    "proposal_type": {
      "enum": ["new_hub", "new_skill", "ranking_change", "search_fix", "skill_update"]
    },
    "proposal": {
      "type": "object",
      "required": ["title", "description", "rationale"],
      "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "rationale": { "type": "string" },
        "affected_files": {
          "type": "array",
          "items": { "type": "string" }
        },
        "example_before": { "type": "string" },
        "example_after": { "type": "string" }
      }
    },
    "self_update": {
      "type": "object",
      "required": ["steps"],
      "properties": {
        "steps": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Exact shell commands or file edits to apply the proposal"
        },
        "verify": {
          "type": "string",
          "description": "How to confirm the change worked"
        }
      }
    }
  }
}
```

## How to apply an approved proposal

```bash
cd ~/repos-eidos-agi/eidos-skills-hub
# apply the self_update.steps from the proposal output
git add -A && git commit -m "improve: <proposal title>"
git push
```

## What makes a good proposal

- Motivated by a real gap: a search that returned nothing, a hub that's missing, a skill description that's wrong
- Scoped to one change — ranking fix, new hub wiring, or a skill update, not all three
- `self_update.steps` are literal commands, not descriptions of commands
