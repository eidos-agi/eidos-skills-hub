import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT_DIR = dirname(fileURLToPath(import.meta.url))
export const CACHE_DIR = resolve(process.env.EIDOS_SKILLS_HUB_CACHE ?? join(homedir(), ".cache", "eidos-skills-hub"))
const SEARCH_INDEX_FILE = join(CACHE_DIR, "search-index.json")
const CACHE_REPO = join(CACHE_DIR, "repository")
const CACHE_INDEX_FILE = join(CACHE_REPO, "index.json")
const DESIRED_FILE = join(CACHE_REPO, "codex-desired.json")
const INDEX_TTL_MS = 6 * 60 * 60 * 1000
const SKILL_TTL_MS = 24 * 60 * 60 * 1000
const MAX_FILES = 2_000
const MAX_BYTES = 50 * 1024 * 1024
const IDENTIFIER = /^[A-Za-z0-9_.-]+$/
const SKILL_IDENTIFIER = /^[A-Za-z0-9_.:@-]+$/
const STOPWORDS = new Set(["a", "an", "and", "for", "of", "skill", "skills", "the", "to", "with"])
const PROVIDERS = new Set(["skills_sh", "eidos", "local", "trusted_libraries", "github_global"])

const EIDOS_HUBS = [
  { owner: "eidos-agi", repo: "eidos-contracts-hub", branch: "main", tag: "contracts" },
  { owner: "eidos-agi", repo: "eidos-transcoders-hub", branch: "main", tag: "transcoders" },
  { owner: "eidos-agi", repo: "eidos-storemetheus", branch: "main", tag: "storemetheus" },
]
const TRUSTED_SOURCES = new Set([
  "eidos-agi", "openai", "anthropics", "vercel-labs", "microsoft",
  "cloudflare", "googleworkspace", "supabase", "dagster-io",
])
const DEFAULT_TRUSTED_LIBRARIES = [
  "openai/skills",
  "anthropics/skills",
  "vercel-labs/agent-skills",
  "microsoft/skills",
  "cloudflare/skills",
  "googleworkspace/cli",
  "supabase/agent-skills",
  "dagster-io/skills",
]
const DEFAULT_LOCAL_ROOTS = [
  join(homedir(), ".codex", "skills"),
  join(homedir(), ".agents", "skills"),
  join(homedir(), ".codex", "plugins", "cache"),
]

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "eidos-skills-hub/1.1.1",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function tokens(value) {
  return [...new Set((String(value).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 1 && !STOPWORDS.has(t)))]
}

function validateCoordinates(owner, repo, skill) {
  if (!IDENTIFIER.test(owner ?? "")) throw new Error("owner must contain only letters, digits, dot, underscore, or hyphen")
  if (!IDENTIFIER.test(repo ?? "")) throw new Error("repo must contain only letters, digits, dot, underscore, or hyphen")
  if (!SKILL_IDENTIFIER.test(skill ?? "")) throw new Error("skill contains unsupported characters")
}

function safeJoin(base, ...parts) {
  const target = resolve(base, ...parts)
  const normalizedBase = resolve(base)
  if (target !== normalizedBase && !target.startsWith(normalizedBase + sep)) throw new Error("unsafe cache path")
  return target
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...githubHeaders(), ...(options.headers ?? {}) } })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json()
}

async function fetchGitHubJson(path) {
  const apiPath = path.startsWith("/") ? path : `/${path}`
  try {
    return await fetchJson(`https://api.github.com${apiPath}`)
  } catch (httpError) {
    const completed = spawnSync("gh", ["api", apiPath], { encoding: "utf8", timeout: 30_000 })
    if (completed.status !== 0) throw new Error(`${httpError.message}; gh fallback failed: ${(completed.stderr || completed.stdout || "unknown error").trim()}`)
    try { return JSON.parse(completed.stdout) } catch { throw new Error("gh returned invalid JSON") }
  }
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")) } catch { return fallback }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

function ownCatalog() {
  const index = readJson(join(ROOT_DIR, ".well-known", "agent-skills", "index.json"), { skills: [] })
  return (index.skills ?? []).map(entry => ({
    owner: "eidos-agi",
    repo: "eidos-skills-hub",
    skill: entry.name,
    description: entry.description,
    tag: "skills-hub",
    source: "eidos",
    sourceId: "eidos-agi/eidos-skills-hub",
    provider: "eidos",
    trusted: true,
    url: `https://github.com/eidos-agi/eidos-skills-hub/tree/main/skills/${entry.name}`,
    install: `npx skills add eidos-agi/eidos-skills-hub --skill ${entry.name}`,
  }))
}

async function remoteHubCatalog(hub) {
  const url = `https://raw.githubusercontent.com/${hub.owner}/${hub.repo}/${hub.branch}/.well-known/agent-skills/index.json`
  try {
    const index = await fetchJson(url)
    return (index.skills ?? []).map(entry => ({
      owner: hub.owner,
      repo: hub.repo,
      skill: entry.name,
      description: entry.description,
      tag: hub.tag,
      source: "eidos",
      sourceId: `${hub.owner}/${hub.repo}`,
      provider: "eidos",
      trusted: true,
      url: `https://github.com/${hub.owner}/${hub.repo}`,
      install: `npx skills add ${hub.owner}/${hub.repo} --skill ${entry.name}`,
    }))
  } catch {
    return []
  }
}

async function eidosCatalogs() {
  const remote = await Promise.all(EIDOS_HUBS.map(remoteHubCatalog))
  return [...ownCatalog(), ...remote.flat()]
}

async function searchSkillsSh(query, limit) {
  const url = `https://www.skills.sh/api/search?q=${encodeURIComponent(query)}&limit=${Math.max(limit, 25)}`
  const payload = await fetchJson(url, { headers: { Accept: "application/json" } })
  return (payload.skills ?? []).map(item => ({
    owner: String(item.source ?? "").split("/")[0],
    repo: String(item.source ?? "").split("/")[1],
    skill: item.skillId ?? item.name,
    description: item.description ?? "",
    installs: Number(item.installs ?? 0),
    official: Boolean(item.isOfficial),
    tag: "skills.sh",
    source: "skills.sh",
    sourceId: String(item.source),
    provider: "skills_sh",
    url: `https://www.skills.sh/${item.source}/${item.skillId ?? item.name}`,
    install: `npx skills add ${item.source} --skill ${item.skillId ?? item.name}`,
  })).filter(item => item.owner && item.repo && item.skill)
}

function sourceMatches(candidate, sources) {
  if (!sources?.size) return false
  const identities = [candidate.sourceId, candidate.owner && candidate.repo ? `${candidate.owner}/${candidate.repo}` : null, candidate.owner, candidate.source, candidate.provider]
    .filter(Boolean)
    .map(value => String(value).toLowerCase())
  return identities.some(identity => sources.has(identity))
}

function scoreCandidate(candidate, query, policy = {}) {
  const queryTokens = tokens(query)
  const primary = queryTokens[0]
  const name = String(candidate.skill ?? "").toLowerCase()
  const description = String(candidate.description ?? "").toLowerCase()
  const repo = String(candidate.repo ?? "").toLowerCase()
  const owner = String(candidate.owner ?? "").toLowerCase()
  let relevance = 0
  let matched = 0
  for (const term of queryTokens) {
    if (name.includes(term)) { relevance += 30; matched += 1 }
    else if (description.includes(term)) { relevance += 15; matched += 1 }
    else if (repo.includes(term)) { relevance += 8; matched += 1 }
    else if (owner.includes(term)) { relevance += 2; matched += 1 }
  }
  const coverage = matched / Math.max(1, queryTokens.length)
  const primaryMatched = !primary || name.includes(primary) || description.includes(primary) || repo.includes(primary) || owner.includes(primary)
  const preferred = sourceMatches(candidate, policy.preferred)
  const explicitlyTrusted = sourceMatches(candidate, policy.trusted)
  const provenance = candidate.source === "eidos" ? 35
    : preferred ? 30
      : candidate.official || candidate.trusted || explicitlyTrusted || TRUSTED_SOURCES.has(candidate.owner) ? 22
        : candidate.provider === "github_global" ? -5 : 0
  const availability = candidate.installed ? 10 : candidate.cached ? 7 : 0
  const evidence = (candidate.description ? 3 : 0) + (candidate.url ? 2 : 0)
  const adoption = Math.min(15, Math.log10(Math.max(0, candidate.installs ?? 0) + 1) * 3)
  const specificity = name === queryTokens.join("-") ? 15 : queryTokens.some(term => name.includes(term)) ? 5 : 0
  const penalty = primaryMatched ? 0 : -35
  const score = Number((relevance + coverage * 20 + provenance + availability + evidence + adoption + specificity + penalty).toFixed(2))
  const reasons = []
  if (coverage === 1) reasons.push("covers every query term")
  if (preferred) reasons.push("user-preferred source")
  else if (candidate.source === "eidos") reasons.push("Eidos first-party")
  else if (candidate.official || candidate.trusted || explicitlyTrusted || TRUSTED_SOURCES.has(candidate.owner)) reasons.push("trusted publisher")
  if (candidate.installed) reasons.push("already installed")
  else if (candidate.cached) reasons.push("already cached for inspection")
  if (candidate.installs) reasons.push(`${candidate.installs.toLocaleString()} Skills.sh installs`)
  const cautions = []
  if (!candidate.description) cautions.push("description unavailable")
  if (!preferred && candidate.source !== "eidos" && !candidate.official && !candidate.trusted && !explicitlyTrusted && !TRUSTED_SOURCES.has(candidate.owner)) cautions.push("untrusted source; inspect before installation")
  return {
    score,
    scoreBreakdown: { relevance, coverage, provenance, availability, evidence, adoption: Number(adoption.toFixed(2)), specificity, penalty },
    reasons,
    cautions,
  }
}

export function rankCandidates(candidates, query, limit = 10, options = {}) {
  if (!Array.isArray(candidates)) throw new Error("candidates must be an array")
  if (!String(query ?? "").trim()) throw new Error("query is required")
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 to 100")
  const preferred = new Set((options.preferred_sources ?? []).map(value => String(value).toLowerCase()))
  const trusted = new Set((options.trusted_sources ?? []).map(value => String(value).toLowerCase()))
  const blocked = new Set((options.blocked_sources ?? []).map(value => String(value).toLowerCase()))
  const deduped = new Map()
  for (const rawCandidate of candidates) {
    const candidate = {
      ...rawCandidate,
      owner: rawCandidate.owner ?? String(rawCandidate.sourceId ?? rawCandidate.source ?? "unknown/unknown").split("/")[0],
      repo: rawCandidate.repo ?? String(rawCandidate.sourceId ?? rawCandidate.source ?? "unknown/unknown").split("/")[1] ?? "unknown",
      skill: rawCandidate.skill ?? rawCandidate.name ?? rawCandidate.skillId,
    }
    if (!candidate.skill || candidate.compatible === false || sourceMatches(candidate, blocked)) continue
    const key = `${candidate.owner}/${candidate.repo}/${candidate.skill}`.toLowerCase()
    const previous = deduped.get(key)
    const quality = Number(Boolean(candidate.installed)) * 4 + Number(Boolean(candidate.cached)) * 2 + Number(candidate.source === "eidos")
    const previousQuality = previous ? Number(Boolean(previous.installed)) * 4 + Number(Boolean(previous.cached)) * 2 + Number(previous.source === "eidos") : -1
    if (!previous || quality > previousQuality) deduped.set(key, candidate)
  }
  const policy = { preferred, trusted }
  return [...deduped.values()]
    .map(candidate => ({ ...candidate, ...scoreCandidate(candidate, query, policy) }))
    .sort((a, b) => b.score - a.score || (b.installs ?? 0) - (a.installs ?? 0) || a.skill.localeCompare(b.skill))
    .slice(0, limit)
    .map((candidate, index) => ({ rank: index + 1, ...candidate }))
}

export function rankSkillCandidates({ candidates, query, limit = 10, preferred_sources = [], trusted_sources = [], blocked_sources = [] } = {}) {
  const ranked = rankCandidates(candidates, query, limit, { preferred_sources, trusted_sources, blocked_sources })
  return { query, candidateCount: ranked.length, candidates: ranked }
}

export async function searchSkills({ query, limit = 10, owner_filter } = {}) {
  if (!String(query ?? "").trim()) throw new Error("query is required")
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 to 100")
  const [eidosResult, skillsResult] = await Promise.allSettled([eidosCatalogs(), searchSkillsSh(query, limit)])
  let candidates = [
    ...(eidosResult.status === "fulfilled" ? eidosResult.value : []),
    ...(skillsResult.status === "fulfilled" ? skillsResult.value : []),
  ]
  if (owner_filter) candidates = candidates.filter(item => item.owner === owner_filter)
  return rankCandidates(candidates, query, limit)
}

function parseSkillFrontmatter(path) {
  const text = readFileSync(path, "utf8")
  const block = text.startsWith("---") ? text.split("---", 3)[1] ?? "" : ""
  const value = key => {
    const match = block.match(new RegExp(`^${key}:\\s*["']?([^\\n"']+)["']?\\s*$`, "m"))
    return match?.[1]?.trim()
  }
  return { name: value("name") ?? basename(dirname(path)), description: value("description") ?? "" }
}

function localSource(path) {
  const normalized = path.split(sep).join("/")
  const pluginMatch = normalized.match(/\/\.codex\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+\/skills\//)
  if (pluginMatch) return { owner: pluginMatch[1], repo: pluginMatch[2], sourceId: `${pluginMatch[1]}/${pluginMatch[2]}`, trusted: true }
  const cacheMatch = normalized.match(/\/repository\/skills\/([^/]+)\/([^/]+)\//)
  if (cacheMatch) return { owner: cacheMatch[1], repo: cacheMatch[2], sourceId: `${cacheMatch[1]}/${cacheMatch[2]}`, cached: true }
  if (normalized.includes("/.codex/skills/")) return { owner: "local", repo: "codex", sourceId: "local/codex", trusted: true }
  return { owner: "local", repo: "personal", sourceId: "local/personal", trusted: true }
}

function findSkillFiles(root, maximum = 10_000) {
  if (!existsSync(root)) return []
  const found = []
  const pending = [resolve(root)]
  while (pending.length && found.length < maximum) {
    const current = pending.pop()
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.isSymbolicLink()) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") found.push(path)
      if (found.length >= maximum) break
    }
  }
  return found
}

export function searchLocalSkills(query, limit = 100, roots = [...DEFAULT_LOCAL_ROOTS, join(CACHE_REPO, "skills")]) {
  const queryTokens = tokens(query)
  const seen = new Set()
  const results = []
  for (const root of roots) {
    for (const path of findSkillFiles(root)) {
      let metadata
      try { metadata = parseSkillFrontmatter(path) } catch { continue }
      const searchable = `${metadata.name} ${metadata.description}`.toLowerCase()
      if (queryTokens.length && !queryTokens.some(term => searchable.includes(term))) continue
      const source = localSource(path)
      const key = `${source.sourceId}/${metadata.name}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        ...source,
        skill: metadata.name,
        description: metadata.description,
        provider: "local",
        source: "local",
        installed: !source.cached,
        cached: Boolean(source.cached),
        path,
        url: path,
        install: null,
      })
      if (results.length >= limit) return results
    }
  }
  return results
}

async function searchGitHubSkills(query, limit, repo = null) {
  const qualifier = repo ? ` repo:${repo}` : ""
  const payload = await fetchGitHubJson(`/search/code?q=${encodeURIComponent(`${query} filename:SKILL.md${qualifier}`)}&per_page=${Math.min(limit, 50)}`)
  return (payload.items ?? []).map(item => ({
      owner: item.repository?.owner?.login,
      repo: item.repository?.name,
      skill: basename(dirname(item.path ?? "")),
      description: `Canonical SKILL.md at ${item.path}`,
      installs: 0,
      official: false,
      tag: repo ? "trusted-library" : "github",
      source: "github",
      sourceId: item.repository?.full_name,
      provider: repo ? "trusted_libraries" : "github_global",
      trusted: Boolean(repo),
      url: item.html_url,
      install: `npx skills add ${item.repository?.full_name} --skill ${basename(dirname(item.path ?? ""))}`,
    })).filter(item => item.owner && item.repo && item.skill)
}

async function searchTrustedLibraries(query, limit, libraries) {
  if (libraries.length > 12) throw new Error("at most 12 trusted libraries may be searched at once")
  const settled = await Promise.allSettled(libraries.map(repo => searchGitHubSkills(query, limit, repo)))
  const results = settled.flatMap(result => result.status === "fulfilled" ? result.value : [])
  if (!results.length && settled.some(result => result.status === "rejected")) {
    throw new Error(settled.find(result => result.status === "rejected").reason?.message ?? "trusted library search failed")
  }
  return results
}

async function runProviders(implementations) {
  const names = Object.keys(implementations)
  const settled = await Promise.allSettled(names.map(name => implementations[name]()))
  const candidates = []
  const providers = {}
  settled.forEach((result, index) => {
    const name = names[index]
    if (result.status === "fulfilled") {
      candidates.push(...result.value)
      providers[name] = { status: "ok", resultCount: result.value.length }
    } else {
      providers[name] = { status: "error", error: result.reason?.message ?? String(result.reason) }
    }
  })
  return { candidates, providers }
}

export async function searchParallel({
  query,
  limit = 10,
  providers = ["skills_sh", "eidos", "local", "trusted_libraries", "github_global"],
  trusted_libraries = DEFAULT_TRUSTED_LIBRARIES,
  preferred_sources = [],
  trusted_sources = [],
  blocked_sources = [],
} = {}) {
  if (!String(query ?? "").trim()) throw new Error("query is required")
  if (!Array.isArray(providers) || !providers.length) throw new Error("providers must contain at least one provider")
  const unknown = providers.filter(provider => !PROVIDERS.has(provider))
  if (unknown.length) throw new Error(`unknown providers: ${unknown.join(", ")}`)
  const width = Math.max(limit, 25)
  const available = {
    skills_sh: () => searchSkillsSh(query, width),
    eidos: () => eidosCatalogs(),
    local: async () => searchLocalSkills(query, Math.max(width, 100)),
    trusted_libraries: () => searchTrustedLibraries(query, width, trusted_libraries),
    github_global: () => searchGitHubSkills(query, width),
  }
  const selected = Object.fromEntries(providers.map(provider => [provider, available[provider]]))
  const searched = await runProviders(selected)
  const ranked = rankCandidates(searched.candidates, query, limit, { preferred_sources, trusted_sources, blocked_sources })
  return { query, candidateCount: ranked.length, candidates: ranked, providers: searched.providers }
}

async function fetchSitemapUrls(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  const text = await response.text()
  return [...text.matchAll(/<loc>(https:\/\/www\.skills\.sh\/([^<]+))<\/loc>/g)]
    .map(match => {
      const parts = match[2].split("/")
      return parts.length === 3 ? { owner: parts[0], repo: parts[1], skill: parts[2], url: match[1] } : null
    })
    .filter(Boolean)
}

export async function refreshIndex() {
  const [first, second] = await Promise.all([
    fetchSitemapUrls("https://www.skills.sh/sitemap-skills-1.xml"),
    fetchSitemapUrls("https://www.skills.sh/sitemap-skills-2.xml").catch(() => []),
  ])
  const index = { built: Date.now(), skills: [...first, ...second] }
  writeJson(SEARCH_INDEX_FILE, index)
  return { refreshed: true, count: index.skills.length, path: SEARCH_INDEX_FILE }
}

function ensureCacheRepo() {
  mkdirSync(CACHE_REPO, { recursive: true })
  if (!existsSync(join(CACHE_REPO, ".git"))) {
    try {
      execFileSync("git", ["init", CACHE_REPO], { stdio: "ignore" })
      execFileSync("git", ["-C", CACHE_REPO, "config", "user.name", "Eidos Skills Hub Cache"], { stdio: "ignore" })
      execFileSync("git", ["-C", CACHE_REPO, "config", "user.email", "skills-hub-cache@local"], { stdio: "ignore" })
    } catch { /* git provenance is best-effort */ }
  }
  if (!existsSync(CACHE_INDEX_FILE)) writeJson(CACHE_INDEX_FILE, { schemaVersion: 1, skills: {} })
  if (!existsSync(DESIRED_FILE)) writeJson(DESIRED_FILE, { schemaVersion: 1, skills: {} })
}

function cacheCommit(message) {
  try {
    execFileSync("git", ["-C", CACHE_REPO, "add", "--all"], { stdio: "ignore" })
    const status = execFileSync("git", ["-C", CACHE_REPO, "status", "--porcelain"], { encoding: "utf8" })
    if (status.trim()) execFileSync("git", ["-C", CACHE_REPO, "commit", "-m", message], { stdio: "ignore" })
    return execFileSync("git", ["-C", CACHE_REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  } catch { return null }
}

function cacheHead() {
  try { return execFileSync("git", ["-C", CACHE_REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() } catch { return null }
}

function validateSnapshotFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("snapshot contains no files")
  if (files.length > MAX_FILES) throw new Error(`snapshot exceeds ${MAX_FILES} files`)
  const seen = new Set()
  let bytes = 0
  const validated = files.map(file => {
    if (typeof file.path !== "string" || typeof file.contents !== "string") throw new Error("snapshot file entries must contain string path and contents")
    if (file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").includes("..")) throw new Error(`unsafe snapshot path: ${file.path}`)
    if (seen.has(file.path)) throw new Error(`duplicate snapshot path: ${file.path}`)
    seen.add(file.path)
    bytes += Buffer.byteLength(file.contents)
    if (bytes > MAX_BYTES) throw new Error("snapshot exceeds 50 MiB")
    return { path: file.path, contents: file.contents }
  })
  const skillMdPath = validated.find(file => basename(file.path).toLowerCase() === "skill.md")?.path
  if (!skillMdPath) throw new Error("snapshot has no SKILL.md")
  return { files: validated, bytes, skillMdPath }
}

function hashFiles(files) {
  const digest = createHash("sha256")
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    digest.update(file.path)
    digest.update(file.contents)
  }
  return digest.digest("hex")
}

async function skillsShSnapshot(owner, repo, skill) {
  const url = `https://www.skills.sh/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(skill)}`
  const payload = await fetchJson(url, { headers: { Accept: "application/json" } })
  return { ...validateSnapshotFiles(payload.files), upstreamHash: payload.hash ?? null, fetchedFrom: url }
}

async function githubSnapshot(owner, repo, skill) {
  const metadata = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`)
  const branch = metadata.default_branch
  const tree = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  const skillMds = (tree.tree ?? []).filter(item => item.type === "blob" && basename(item.path).toLowerCase() === "skill.md")
  const target = skillMds
    .filter(item => basename(dirname(item.path)).toLowerCase() === skill.toLowerCase())
    .sort((a, b) => a.path.length - b.path.length)[0]
  if (!target) throw new Error(`SKILL.md not found for ${owner}/${repo}/${skill}`)
  const prefix = dirname(target.path)
  const blobs = (tree.tree ?? []).filter(item => item.type === "blob" && (item.path === target.path || item.path.startsWith(prefix + "/")))
  if (blobs.length > MAX_FILES) throw new Error(`snapshot exceeds ${MAX_FILES} files`)
  const size = blobs.reduce((sum, item) => sum + Number(item.size ?? 0), 0)
  if (size > MAX_BYTES) throw new Error("snapshot exceeds 50 MiB")
  const files = await Promise.all(blobs.map(async item => {
    const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`, { headers: githubHeaders() })
    if (!response.ok) throw new Error(`failed to fetch ${item.path}`)
    return { path: relative(prefix, item.path).split(sep).join("/"), contents: await response.text() }
  }))
  return { ...validateSnapshotFiles(files), upstreamHash: target.sha ?? null, fetchedFrom: `https://github.com/${owner}/${repo}/tree/${branch}/${prefix}` }
}

async function fetchSnapshot(owner, repo, skill) {
  try { return await skillsShSnapshot(owner, repo, skill) } catch { return githubSnapshot(owner, repo, skill) }
}

function snapshotDestination(owner, repo, skill) {
  return safeJoin(CACHE_REPO, "skills", owner, repo, skill)
}

function cacheIndex() {
  ensureCacheRepo()
  return readJson(CACHE_INDEX_FILE, { schemaVersion: 1, skills: {} })
}

async function refreshCachedSkill(owner, repo, skill) {
  const snapshot = await fetchSnapshot(owner, repo, skill)
  const contentHash = hashFiles(snapshot.files)
  const key = `${owner}/${repo}@${skill}`
  const index = cacheIndex()
  const previous = index.skills[key]
  const destination = snapshotDestination(owner, repo, skill)
  if (previous?.contentHash === contentHash && existsSync(destination)) {
    return { ...previous, cacheRoot: CACHE_REPO, changed: false, cacheCommit: cacheCommit("Refresh cache metadata") }
  }
  const stagingRoot = join(CACHE_REPO, ".staging")
  mkdirSync(stagingRoot, { recursive: true })
  const staging = join(stagingRoot, `${owner}-${repo}-${skill}-${process.pid}-${Date.now()}`)
  mkdirSync(staging, { recursive: true })
  for (const file of snapshot.files) {
    const target = safeJoin(staging, ...file.path.split("/"))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.contents)
  }
  const metadata = {
    owner,
    repo,
    skill,
    source: `${owner}/${repo}`,
    contentHash,
    upstreamHash: snapshot.upstreamHash,
    cachedAt: new Date().toISOString(),
    fetchedFrom: snapshot.fetchedFrom,
    relativePath: relative(CACHE_REPO, destination),
    skillMdPath: snapshot.skillMdPath,
    fileCount: snapshot.files.length,
    byteCount: snapshot.bytes,
  }
  writeJson(join(staging, ".skills-hub.json"), metadata)
  mkdirSync(dirname(destination), { recursive: true })
  rmSync(destination, { recursive: true, force: true })
  renameSync(staging, destination)
  index.skills[key] = metadata
  writeJson(CACHE_INDEX_FILE, index)
  const commit = cacheCommit(`Cache ${key} (${contentHash.slice(0, 12)})`)
  return { ...metadata, cacheRoot: CACHE_REPO, cacheCommit: commit, changed: true }
}

export async function cacheSkill({ owner, repo, skill, refresh = false } = {}) {
  validateCoordinates(owner, repo, skill)
  const key = `${owner}/${repo}@${skill}`
  const index = cacheIndex()
  const existing = index.skills[key]
  if (!refresh && existing && existsSync(snapshotDestination(owner, repo, skill)) && Date.now() - Date.parse(existing.cachedAt) < SKILL_TTL_MS) {
    return { ...existing, cacheRoot: CACHE_REPO, cacheCommit: cacheHead(), changed: false }
  }
  return refreshCachedSkill(owner, repo, skill)
}

export async function getSkill({ owner, repo, skill, refresh = false } = {}) {
  const metadata = await cacheSkill({ owner, repo, skill, refresh })
  const skillPath = safeJoin(CACHE_REPO, metadata.relativePath, ...metadata.skillMdPath.split("/"))
  return readFileSync(skillPath, "utf8")
}

function desiredState() {
  ensureCacheRepo()
  return readJson(DESIRED_FILE, { schemaVersion: 1, skills: {} })
}

export function listCachedSkills() {
  const index = cacheIndex()
  const desired = desiredState()
  return {
    cacheRoot: CACHE_REPO,
    cacheCommit: cacheHead(),
    skillCount: Object.keys(index.skills).length,
    skills: index.skills,
    desiredCodexSkills: desired.skills,
  }
}

export async function checkSkillUpdates() {
  const index = cacheIndex()
  const desired = desiredState()
  const keys = Object.keys(desired.skills).length ? Object.keys(desired.skills) : Object.keys(index.skills)
  const results = []
  for (const key of keys) {
    const current = index.skills[key] ?? desired.skills[key]
    try {
      const snapshot = await fetchSnapshot(current.owner, current.repo, current.skill)
      const upstreamContentHash = hashFiles(snapshot.files)
      results.push({ key, status: upstreamContentHash === current.contentHash ? "current" : "update_available", cachedHash: current.contentHash, upstreamContentHash })
    } catch (error) {
      results.push({ key, status: "error", error: error.message })
    }
  }
  return { checkedAt: new Date().toISOString(), updatesAvailable: results.filter(item => item.status === "update_available").length, skills: results }
}

function collectDirectoryFiles(base, current = base, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".skills-hub.json") continue
    const path = join(current, entry.name)
    if (entry.isDirectory()) collectDirectoryFiles(base, path, files)
    else if (entry.isFile()) files.push({ path: relative(base, path).split(sep).join("/"), contents: readFileSync(path, "utf8") })
  }
  return files
}

export function auditCodexSkills() {
  const desired = desiredState()
  const results = []
  for (const [key, entry] of Object.entries(desired.skills)) {
    const candidates = [join(homedir(), ".codex", "skills", entry.skill), join(homedir(), ".agents", "skills", entry.skill)]
    const installedPath = candidates.find(path => existsSync(join(path, "SKILL.md")))
    if (!installedPath) {
      results.push({ key, status: "missing", expectedHash: entry.contentHash })
      continue
    }
    const installedHash = hashFiles(collectDirectoryFiles(installedPath))
    results.push({ key, status: installedHash === entry.contentHash ? "current" : "drifted", expectedHash: entry.contentHash, installedHash, installedPath })
  }
  return { auditedAt: new Date().toISOString(), desiredCount: Object.keys(desired.skills).length, skills: results }
}

export async function syncCodexSkills({ skills, global = true, confirm = false } = {}) {
  if (confirm !== true) throw new Error("confirm must be true before changing installed Codex skills")
  if (!Array.isArray(skills) || skills.length === 0) throw new Error("skills must contain at least one requested skill")
  const desired = desiredState()
  const results = []
  for (const coordinates of skills) {
    validateCoordinates(coordinates.owner, coordinates.repo, coordinates.skill)
    const metadata = await refreshCachedSkill(coordinates.owner, coordinates.repo, coordinates.skill)
    const sourcePath = safeJoin(CACHE_REPO, metadata.relativePath)
    const args = ["--yes", "skills", "add", sourcePath, "--skill", coordinates.skill, "--agent", "codex", "--yes", "--copy"]
    if (global) args.push("--global")
    const completed = spawnSync("npx", args, { encoding: "utf8", timeout: 120_000 })
    if (completed.status !== 0) {
      results.push({ ...coordinates, status: "error", error: completed.stderr || completed.stdout })
      continue
    }
    const key = `${coordinates.owner}/${coordinates.repo}@${coordinates.skill}`
    desired.skills[key] = { ...metadata, scope: global ? "global" : "project", agent: "codex", syncedAt: new Date().toISOString() }
    results.push({ ...coordinates, status: "installed", contentHash: metadata.contentHash, scope: global ? "global" : "project" })
  }
  writeJson(DESIRED_FILE, desired)
  const commit = cacheCommit("Update desired Codex skills")
  return { changed: true, cacheCommit: commit, results, audit: auditCodexSkills() }
}

export const internals = {
  safeJoin,
  validateCoordinates,
  validateSnapshotFiles,
  hashFiles,
  scoreCandidate,
  ownCatalog,
  runProviders,
}
