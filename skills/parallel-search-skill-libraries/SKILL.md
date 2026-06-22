---
name: parallel-search-skill-libraries
description: Search multiple agent-skill libraries concurrently across Skills.sh, Eidos first-party hubs, installed and personal Codex skills, trusted GitHub libraries, and GitHub-wide SKILL.md files. Use when the user wants broad discovery, alternatives beyond Skills.sh, parallelized search, explicit provider selection, or confirmation that a suitable skill is already installed locally.
---

# Parallel Search Skill Libraries

Call `search_skills_parallel` with the desired capability as `query`.

1. Search all providers unless the user narrows the scope: `skills_sh`, `eidos`, `local`, `trusted_libraries`, and `github_global`.
2. Pass `preferred_sources`, `trusted_sources`, or `blocked_sources` when the user or organization has stated a policy.
3. Treat provider errors as partial failures. Report them without discarding successful results.
4. Preserve the deterministic ranking and score breakdown; do not silently reorder candidates.
5. Prefer installed or cached equivalents when task fit is otherwise close.
6. Cache finalists before detailed inspection. Caching does not authorize installation or execution.

GitHub-backed providers may require `GITHUB_TOKEN` or `GH_TOKEN`. Local, Eidos, and Skills.sh providers remain independently useful when GitHub search is unavailable.
