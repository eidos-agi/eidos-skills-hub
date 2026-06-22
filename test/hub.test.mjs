import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { internals, rankCandidates, rankSkillCandidates, searchLocalSkills } from "../lib.mjs"

test("Codex MCP launcher uses the installed plugin root", () => {
  const config = JSON.parse(readFileSync(new URL("../.mcp.json", import.meta.url), "utf8"))
  const server = config.mcpServers["eidos-skills-hub"]
  assert.equal(server.transport, "stdio")
  assert.deepEqual(server.args, ["${PLUGIN_ROOT}/index.js"])
  assert.ok(!JSON.stringify(config).includes("CLAUDE_PLUGIN_ROOT"))
})

test("Eidos exact match outranks popular community noise", () => {
  const results = rankCandidates([
    { owner: "community", repo: "popular", skill: "ecosystem", description: "ecosystem", installs: 500000, source: "skills.sh" },
    { owner: "eidos-agi", repo: "eidos-skills-hub", skill: "eidos-ecosystem", description: "Orientation map for the Eidos ecosystem", installs: 0, source: "eidos" },
  ], "eidos ecosystem", 2)
  assert.equal(results[0].skill, "eidos-ecosystem")
  assert.equal(results[0].owner, "eidos-agi")
})

test("own catalog is searchable without a network self-fetch", () => {
  const skills = internals.ownCatalog().map(item => item.skill)
  assert.ok(skills.includes("eidos-skills-hub"))
  assert.ok(skills.includes("eidos-ecosystem"))
  assert.ok(skills.includes("improve-skills-hub"))
  assert.ok(skills.includes("maintain-codex-skills"))
  assert.ok(skills.includes("parallel-search-skill-libraries"))
  assert.ok(skills.includes("prefer-skill-candidates"))
})

test("coordinates reject path traversal", () => {
  assert.throws(() => internals.validateCoordinates("../escape", "repo", "skill"), /owner/)
  assert.throws(() => internals.validateCoordinates("owner", "repo", "../../escape"), /skill/)
})

test("snapshot validation rejects unsafe paths", () => {
  assert.throws(() => internals.validateSnapshotFiles([{ path: "../SKILL.md", contents: "bad" }]), /unsafe/)
})

test("snapshot hashes include paths and content deterministically", () => {
  const first = internals.hashFiles([{ path: "SKILL.md", contents: "a" }, { path: "refs/x.md", contents: "b" }])
  const second = internals.hashFiles([{ path: "refs/x.md", contents: "b" }, { path: "SKILL.md", contents: "a" }])
  assert.equal(first, second)
})

test("preferred sources beat popularity when task fit is equal", () => {
  const result = rankSkillCandidates({
    query: "dagster",
    preferred_sources: ["team/dagster-skills"],
    candidates: [
      { owner: "community", repo: "popular", skill: "dagster", description: "Dagster", installs: 500000, sourceId: "community/popular" },
      { owner: "team", repo: "dagster-skills", skill: "dagster", description: "Dagster", installs: 0, sourceId: "team/dagster-skills" },
    ],
  })
  assert.equal(result.candidates[0].owner, "team")
  assert.ok(result.candidates[0].reasons.includes("user-preferred source"))
})

test("blocked and incompatible candidates are excluded", () => {
  const results = rankCandidates([
    { owner: "blocked", repo: "skills", skill: "deploy", description: "Deploy safely" },
    { owner: "safe", repo: "skills", skill: "deploy", description: "Deploy safely", compatible: false },
    { owner: "eidos-agi", repo: "skills", skill: "deploy", description: "Deploy safely", source: "eidos" },
  ], "deploy", 10, { blocked_sources: ["blocked/skills"] })
  assert.deepEqual(results.map(item => item.owner), ["eidos-agi"])
})

test("local discovery finds canonical installed skills", () => {
  const root = mkdtempSync(join(tmpdir(), "eidos-local-skills-"))
  try {
    const skillDir = join(root, "dagster-helper")
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: dagster-helper\ndescription: Maintain Dagster pipelines\n---\n")
    const results = searchLocalSkills("dagster", 10, [root])
    assert.equal(results.length, 1)
    assert.equal(results[0].skill, "dagster-helper")
    assert.equal(results[0].installed, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("provider failures remain visible without discarding successes", async () => {
  const result = await internals.runProviders({
    healthy: async () => [{ owner: "eidos-agi", repo: "skills", skill: "healthy" }],
    broken: async () => { throw new Error("provider unavailable") },
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.providers.healthy.status, "ok")
  assert.equal(result.providers.broken.status, "error")
})
