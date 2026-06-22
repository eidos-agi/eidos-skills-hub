---
name: eidos-ecosystem
description: Orientation map for the Eidos AGI ecosystem. Use when an agent needs to know where docs, skills, or code live for any Eidos pillar — Core brain, Storemetheus (plugin stores), Helios (browser), Omni (memory), Hancock (auth), Canon (standards), or the skills/contracts/transcoders hubs. The entry point before building anything inside Eidos.
---

# Eidos Ecosystem Map

The Eidos architecture is **Four Pillars + a standards layer + a skills layer**. Find the pillar first, then find the skill.

## Four Pillars

| Pillar | Role | Repo | Docs |
|--------|------|------|------|
| **Eidos Core** | Brain — multi-model deliberation (Dreamer / Doubter / Decider), orchestrator | `eidos-agi/eidos-v5` | `README.md` in repo |
| **Helios** | Body — browser automation, identity-aware web control | `eidos-agi/helios` | `README.md` in repo |
| **Omni** | Memory — universal search, recall, 47K+ indexed resources | `eidos-agi/eidosomni` | `omni-docs/` repo + `eidosomni/.ike/documents/DOC-0001` |
| **Hancock** | Auth — delegation certificates, approval dashboard, 2FA relay | `eidos-agi/hancock` | `README.md` in repo |

Architecture decision: `cockpit-eidos/decisions/2026-03-23-four-pillars.md`

## Plugin Store Layer — Storemetheus

Storemetheus is the governed distribution system for AI operating capability. It is not a folder of prompts — it is a trust surface.

- **Repo**: `eidos-agi/eidos-storemetheus`
- **What it builds**: marketplace repo with `.agents/plugins/marketplace.json`, scoped plugin bundles, governance model (owner, review cadence, private/public boundary, install proof)
- **Skill**: `build-plugin-stores` in `eidos-storemetheus/skills/build-plugin-stores/SKILL.md`
- **Install**: `npx skills add eidos-agi/eidos-storemetheus` *(once `.well-known/agent-skills/index.json` is added)*

Use Storemetheus when: a company/team/client wants a private plugin store, a plugin needs review gates, or you need to separate plugin source / store / cache / runtime visibility.

## Standards Layer — Canon

Canon owns agent operating rules, repo contracts, and verification gates. It answers: "what does done actually mean?"

- **Repo**: `eidos-agi/canon` (local: `~/repos-eidos-agi/canon`)
- **CLI**: `canon doctor`, `canon check`, `canon verify`, `canon agent "<task>"`
- **Rule**: Canon owns standards. It does not create agents or route personal work — that's Felix/Reeves/Eidos/Converge.
- **Definition of done**: Relevant repo instructions read, dirty worktree respected, changed behavior has deterministic verification, skipped checks named with reason, final claims cite actual evidence.

## Skills Layer

| Hub | What | Search |
|-----|------|--------|
| **eidos-skills-hub** | Search surface — 20K+ skills.sh + all eidos hubs | `mcp__eidos-skills-hub__search_skills` |
| **eidos-contracts-hub** | Skills as contracts (output schemas) | `npx skills add eidos-agi/eidos-contracts-hub` |
| **eidos-transcoders-hub** | Format transforms (yaml→PDF, doc→MP3) | `npx skills add eidos-agi/eidos-transcoders-hub` |

## Architecture Decisions (cockpit-eidos)

Key decisions that shape how everything fits together:

- `decisions/2026-03-23-four-pillars.md` — why four pillars, not three; why Omni is the real memory layer
- `decisions/2026-02-26-north-star-universal-computer-control.md` — the north star
- `decisions/2026-04-03-memory-first-thesis.md` — why memory is the moat
- `briefs/2026-04-04-company-design-spec-index.md` — full index of what exists vs. what's needed

Local path: `~/repos-eidos-agi/cockpit-eidos/`

## Navigation rule

> **Start with this skill. Pick a pillar. Find the repo. Read its README. Then search skills.**

If you're building something that touches multiple pillars, read the four-pillars ADR first — it defines the boundaries and prevents stepping on another pillar's domain.
