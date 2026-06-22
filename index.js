#!/usr/bin/env node
// Eidos Skills Hub MCP server — stdio JSON-RPC 2.0 transport.

import { createInterface } from "node:readline"
import {
  auditCodexSkills,
  cacheSkill,
  checkSkillUpdates,
  getSkill,
  listCachedSkills,
  rankSkillCandidates,
  refreshIndex,
  searchParallel,
  searchSkills,
  syncCodexSkills,
} from "./lib.mjs"

const TOOLS = [
  {
    name: "search_skills",
    description: "Search the live Skills.sh API and Eidos first-party catalogs, then return evidence-ranked skills.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Capability or outcome to find" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        owner_filter: { type: "string", description: "Optional exact GitHub owner filter" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_skills_parallel",
    description: "Search Skills.sh, Eidos catalogs, installed/local Codex skills, trusted libraries, and GitHub concurrently with partial-failure reporting.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        providers: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", enum: ["skills_sh", "eidos", "local", "trusted_libraries", "github_global"] },
        },
        trusted_libraries: { type: "array", maxItems: 12, items: { type: "string" } },
        preferred_sources: { type: "array", items: { type: "string" } },
        trusted_sources: { type: "array", items: { type: "string" } },
        blocked_sources: { type: "array", items: { type: "string" } },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "rank_skill_candidates",
    description: "Rank existing skill candidates by task fit, source preference, trust, evidence, local availability, and adoption.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        candidates: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              skill: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              sourceId: { type: "string" },
              source: { type: "string" },
              provider: { type: "string" },
              installs: { type: "number", minimum: 0 },
              official: { type: "boolean" },
              trusted: { type: "boolean" },
              installed: { type: "boolean" },
              cached: { type: "boolean" },
              compatible: { type: "boolean" },
              url: { type: "string" }
            },
            additionalProperties: true
          }
        },
        preferred_sources: { type: "array", items: { type: "string" } },
        trusted_sources: { type: "array", items: { type: "string" } },
        blocked_sources: { type: "array", items: { type: "string" } }
      },
      required: ["query", "candidates"],
      additionalProperties: false
    }
  },
  {
    name: "get_skill",
    description: "Fetch a full skill snapshot safely, cache every companion file, and return its SKILL.md.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        skill: { type: "string" },
        refresh: { type: "boolean", default: false },
      },
      required: ["owner", "repo", "skill"],
      additionalProperties: false,
    },
  },
  {
    name: "cache_skill",
    description: "Cache a skill's complete Skills.sh or GitHub snapshot in the git-backed provenance repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        skill: { type: "string" },
        refresh: { type: "boolean", default: false },
      },
      required: ["owner", "repo", "skill"],
      additionalProperties: false,
    },
  },
  {
    name: "list_cached_skills",
    description: "List cached snapshots, hashes, provenance, desired Codex state, and cache git commit.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "refresh_index",
    description: "Refresh the sitemap fallback index. Live searches use the Skills.sh JSON API first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_skill_updates",
    description: "Compare desired or cached skill snapshots with current upstream content hashes without installing changes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "audit_codex_skills",
    description: "Compare desired cached hashes with skills installed for Codex and report missing or drifted skills.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "sync_codex_skills",
    description: "After explicit confirmation, refresh selected snapshots and install them for Codex through the official npx skills CLI.",
    inputSchema: {
      type: "object",
      properties: {
        skills: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              skill: { type: "string" },
            },
            required: ["owner", "repo", "skill"],
            additionalProperties: false,
          },
        },
        global: { type: "boolean", default: true },
        confirm: { type: "boolean", description: "Must be true because this changes installed Codex skills" },
      },
      required: ["skills", "confirm"],
      additionalProperties: false,
    },
  },
]

export async function callTool(name, args = {}) {
  switch (name) {
    case "search_skills": return searchSkills(args)
    case "search_skills_parallel": return searchParallel(args)
    case "rank_skill_candidates": return rankSkillCandidates(args)
    case "get_skill": return getSkill(args)
    case "cache_skill": return cacheSkill(args)
    case "list_cached_skills": return listCachedSkills()
    case "refresh_index": return refreshIndex()
    case "check_skill_updates": return checkSkillUpdates()
    case "audit_codex_skills": return auditCodexSkills()
    case "sync_codex_skills": return syncCodexSkills(args)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n")
}

export function startServer() {
  const rl = createInterface({ input: process.stdin, terminal: false })
  rl.on("line", async line => {
    let msg
    try { msg = JSON.parse(line) } catch { return }
    const { id, method, params } = msg
    try {
      if (method === "initialize") {
        respond(id, {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "eidos-skills-hub", version: "1.1.1" },
        })
      } else if (method === "tools/list") {
        respond(id, { tools: TOOLS })
      } else if (method === "tools/call") {
        try {
          const result = await callTool(params?.name, params?.arguments ?? {})
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 2)
          respond(id, {
            content: [{ type: "text", text }],
            ...(typeof result === "object" && result !== null ? { structuredContent: result } : {}),
          })
        } catch (error) {
          respond(id, { content: [{ type: "text", text: error.message }], isError: true })
        }
      } else if (method === "ping") {
        respond(id, {})
      } else if (method === "notifications/initialized" || method === "notifications/cancelled") {
        // Notifications do not receive a response.
      } else if (id !== undefined) {
        respondError(id, -32601, `Method not found: ${method}`)
      }
    } catch (error) {
      respondError(id ?? null, -32603, error.message)
    }
  })
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  startServer()
}
