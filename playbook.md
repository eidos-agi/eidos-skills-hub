# Eidos Skills Hub Playbook

Use Eidos Skills Hub when an agent needs the right skill or skill source before
acting: Codex skills, skills.sh entries, or first-party Eidos hubs.

## Use When

- The task asks which skill should handle a problem.
- The agent needs to search skills.sh or an Eidos skill hub.
- Eidos needs a routable owner for skill discovery instead of generic plugin
  catalog or forge routing.
- A missing skill, stale skill cache, or unclear skill source is blocking work.

## Contract

- Search before implementation when skill choice changes the approach.
- Prefer installed/local skills when they are present and relevant.
- Return the skill name, source, install/read command, and the exact usage rule
  the substrate should follow.
- Do not claim a skill is installed unless the local agent surface proves it.

## Reference Commands

```bash
eidos plugin show eidos-skills-hub
node index.js
```

When the MCP server is registered, use:

```text
search_skills(query, limit?, owner_filter?)
get_skill(owner, repo, skill)
list_cached_skills()
refresh_index()
```

## Closeout

Before claiming the hub is available through Eidos, prove:

```bash
eidos plugin show eidos-skills-hub
eidos doctor --json
eidos route "find and apply the right Codex skill for a task" --json
```
