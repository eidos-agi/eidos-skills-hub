---
name: maintain-codex-skills
description: Audit, update, and reconcile skills installed for Codex against provenance-tracked cached snapshots. Use when the user asks whether Codex has a skill, whether installed skills are current, to check drift, to review available updates, or to apply approved skill updates safely.
---

# Maintain Codex Skills

Use this sequence:

1. Call `check_skill_updates` to compare cached or desired skills with upstream hashes. This is read-only.
2. Call `audit_codex_skills` to report missing, current, or drifted Codex installations. This is read-only.
3. Explain changed hashes and inspect updated snapshots before applying them.
4. Call `sync_codex_skills` only when the user explicitly approves the named skills. Pass `confirm: true`.
5. Verify the returned audit. Tell the user to start a new thread so Codex loads changed skill instructions.

Default to notification and review, not unattended updates. A skill update changes Codex's operating instructions and may include executable resources.
