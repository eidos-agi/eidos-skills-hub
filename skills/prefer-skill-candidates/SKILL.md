---
name: prefer-skill-candidates
description: Rank and compare agent-skill candidates with an explicit evidence-backed preference policy. Use when choosing between overlapping skills, explaining why one deserves preference, applying trusted, preferred, or blocked sources, favoring an installed equivalent, or preventing popularity from overriding task fit and provenance.
---

# Prefer Skill Candidates

Call `rank_skill_candidates` when candidates already exist, or consume the ranking returned by `search_skills_parallel`.

Apply [preference-policy.md](references/preference-policy.md):

1. Exclude blocked or incompatible candidates.
2. Prefer the strongest task match.
3. For close matches, prefer user-designated, local organizational, official, or trusted sources.
4. Prefer an already installed or cached equivalent when quality is otherwise close.
5. Use adoption only as corroboration and a tie-breaker.
6. Inspect cached files before installation or execution.

Preserve score breakdowns, reasons, cautions, and close tradeoffs. State when evidence is insufficient.
