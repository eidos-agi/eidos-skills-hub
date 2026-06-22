#!/usr/bin/env node
// skills-sh MCP server — search skills.sh in real-time, cache SKILL.md locally
// Protocol: MCP stdio (JSON-RPC 2.0)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { createInterface } from "readline"

const CACHE_DIR = join(homedir(), ".cache", "skills-sh")
const INDEX_FILE = join(CACHE_DIR, "index.json")
const SKILLS_DIR = join(CACHE_DIR, "skills")
const INDEX_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

mkdirSync(CACHE_DIR, { recursive: true })
mkdirSync(SKILLS_DIR, { recursive: true })

// ─── Index (parsed from skills.sh sitemaps) ──────────────────────────────────

async function fetchSitemapUrls(url) {
  const r = await fetch(url)
  const text = await r.text()
  const matches = [...text.matchAll(/<loc>(https:\/\/www\.skills\.sh\/([^<]+))<\/loc>/g)]
  return matches.map(m => {
    const parts = m[2].split("/")
    if (parts.length === 3) {
      return { owner: parts[0], repo: parts[1], skill: parts[2], url: m[1] }
    }
    return null
  }).filter(Boolean)
}

async function buildIndex() {
  const [s1, s2] = await Promise.all([
    fetchSitemapUrls("https://www.skills.sh/sitemap-skills-1.xml"),
    fetchSitemapUrls("https://www.skills.sh/sitemap-skills-2.xml").catch(() => []),
  ])
  const index = [...s1, ...s2]
  writeFileSync(INDEX_FILE, JSON.stringify({ built: Date.now(), skills: index }))
  return index
}

async function getIndex() {
  if (existsSync(INDEX_FILE)) {
    const { built, skills } = JSON.parse(readFileSync(INDEX_FILE, "utf8"))
    if (Date.now() - built < INDEX_TTL_MS) return skills
  }
  return buildIndex()
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function searchSkills({ query, limit = 10, owner_filter }) {
  const index = await getIndex()
  const q = query.toLowerCase()
  const terms = q.split(/\s+/)

  function score(s) {
    const haystack = `${s.skill} ${s.owner} ${s.repo}`.toLowerCase()
    let sc = 0
    for (const t of terms) {
      if (s.skill.toLowerCase().includes(t)) sc += 3
      else if (s.owner.toLowerCase().includes(t)) sc += 2
      else if (s.repo.toLowerCase().includes(t)) sc += 1
    }
    return sc
  }

  let results = index
    .filter(s => !owner_filter || s.owner === owner_filter)
    .map(s => ({ ...s, _score: score(s) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)

  return results.map(s => ({
    skill: s.skill,
    owner: s.owner,
    repo: s.repo,
    install: `npx skills add ${s.owner}/${s.repo}`,
    url: s.url,
  }))
}

async function getSkill({ owner, repo, skill }) {
  const cacheKey = `${owner}__${repo}__${skill}.md`
  const cachePath = join(SKILLS_DIR, cacheKey)

  if (existsSync(cachePath)) {
    return readFileSync(cachePath, "utf8")
  }

  // Try both path patterns used by skill repos
  const candidates = [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skill}/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/.well-known/agent-skills/${skill}/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/${skill}/SKILL.md`,
  ]

  for (const url of candidates) {
    const r = await fetch(url)
    if (r.ok) {
      const text = await r.text()
      writeFileSync(cachePath, text)
      return text
    }
  }

  throw new Error(`SKILL.md not found for ${owner}/${repo}/${skill}`)
}

async function listCachedSkills() {
  if (!existsSync(INDEX_FILE)) return { count: 0, index_built: null, cached_skill_mds: [] }
  const { built, skills } = JSON.parse(readFileSync(INDEX_FILE, "utf8"))
  const cachedFiles = existsSync(SKILLS_DIR)
    ? readdirSync(SKILLS_DIR).map(f => f.replace(".md", "").replace(/__/g, " / "))
    : []
  return {
    count: skills.length,
    index_built: new Date(built).toISOString(),
    cached_skill_mds: cachedFiles,
  }
}

async function refreshIndex() {
  const skills = await buildIndex()
  return { refreshed: true, count: skills.length }
}

// Parallel search across multiple sources
async function searchParallel({ query, limit = 5 }) {
  const [skillsShResults, githubResults] = await Promise.allSettled([
    searchSkills({ query, limit }),
    searchGitHub(query, limit),
  ])

  const combined = []
  const seen = new Set()

  for (const r of skillsShResults.status === "fulfilled" ? skillsShResults.value : []) {
    const key = `${r.owner}/${r.repo}/${r.skill}`
    if (!seen.has(key)) { seen.add(key); combined.push({ ...r, source: "skills.sh" }) }
  }
  for (const r of githubResults.status === "fulfilled" ? githubResults.value : []) {
    const key = `${r.owner}/${r.repo}/${r.skill}`
    if (!seen.has(key)) { seen.add(key); combined.push({ ...r, source: "github" }) }
  }

  // Prefer skills.sh listed (curated/vetted), then sort by source
  return combined
    .sort((a, b) => (a.source === "skills.sh" ? -1 : 1))
    .slice(0, limit * 2)
}

async function searchGitHub(query, limit) {
  const r = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query + " agent-skills skill in:name,description")}&sort=stars&per_page=${limit}`,
    { headers: { "User-Agent": "skills-sh-mcp" } }
  )
  if (!r.ok) return []
  const { items = [] } = await r.json()
  return items.map(repo => ({
    skill: query,
    owner: repo.owner.login,
    repo: repo.name,
    install: `npx skills add ${repo.owner.login}/${repo.name}`,
    url: `https://www.skills.sh/${repo.owner.login}/${repo.name}`,
    stars: repo.stargazers_count,
    description: repo.description,
  }))
}

// ─── MCP protocol ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_skills",
    description: "Search skills.sh for agent skills by keyword. Returns ranked results with install commands.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms (e.g. 'supabase postgres', 'react nextjs', 'typescript')" },
        limit: { type: "number", description: "Max results (default 10)", default: 10 },
        owner_filter: { type: "string", description: "Filter by GitHub org/owner (e.g. 'vercel-labs', 'anthropics')" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_skills_parallel",
    description: "Parallel search across skills.sh index AND GitHub — finds skills not yet listed on skills.sh. Deduplicates and prefers curated skills.sh results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" },
        limit: { type: "number", description: "Max results per source (default 5)", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_skill",
    description: "Fetch a specific skill's SKILL.md content from GitHub. Cached locally after first fetch.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner (e.g. 'supabase')" },
        repo: { type: "string", description: "GitHub repo (e.g. 'agent-skills')" },
        skill: { type: "string", description: "Skill name (e.g. 'supabase-postgres-best-practices')" },
      },
      required: ["owner", "repo", "skill"],
    },
  },
  {
    name: "list_cached_skills",
    description: "List the current state of the local skills cache — index size, age, and downloaded SKILL.md files.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "refresh_index",
    description: "Force refresh the skills.sh index from sitemaps (normally auto-refreshes every 6 hours).",
    inputSchema: { type: "object", properties: {} },
  },
]

async function callTool(name, args) {
  switch (name) {
    case "search_skills": return searchSkills(args)
    case "search_skills_parallel": return searchParallel(args)
    case "get_skill": return getSkill(args)
    case "list_cached_skills": return listCachedSkills()
    case "refresh_index": return refreshIndex()
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

// ─── stdio MCP transport ──────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false })

async function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
}

async function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n")
}

rl.on("line", async (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }

  const { id, method, params } = msg

  try {
    if (method === "initialize") {
      await respond(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "skills-sh", version: "1.0.0" },
      })
    } else if (method === "tools/list") {
      await respond(id, { tools: TOOLS })
    } else if (method === "tools/call") {
      const result = await callTool(params.name, params.arguments ?? {})
      await respond(id, {
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
      })
    } else if (method === "notifications/initialized") {
      // no-op
    } else {
      await respondError(id, -32601, `Method not found: ${method}`)
    }
  } catch (err) {
    await respondError(id, -32000, err.message)
  }
})
