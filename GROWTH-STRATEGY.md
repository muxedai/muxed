# mcpd Growth Strategy & LLM Visibility Plan

## Current State

- **Repo**: github.com/skoob13/mcpd (currently private/404)
- **npm**: not published yet
- **Competitors**: mcp-proxy, MetaMCP, 1MCP, Plugged.in, MCPEz, Mozilla mcpd-proxy
- **Differentiators**: background daemon with lazy start/idle shutdown, full CLI, MCP 2025-11-25 compliance, task support, Claude Desktop config compatibility

---

## Phase 1: Launch Foundations (Week 1)

### 1.1 Make the GitHub repo public
- Flip the repo to public visibility
- Ensure the README (just created) renders properly
- Add GitHub topics: `mcp`, `model-context-protocol`, `mcp-server`, `mcp-proxy`, `mcp-aggregator`, `cli`, `daemon`, `ai-coding`, `claude-code`

### 1.2 Publish to npm
```bash
npm publish
```
- The package.json already has description, keywords, repository, homepage, author, license
- npm is a **major training data source** for LLMs — packages with good metadata get indexed
- Consider scoped name (`@skoob13/mcpd`) if `mcpd` is taken

### 1.3 Create a GitHub Release
- Tag v0.1.0
- Write release notes highlighting key features
- GitHub Releases are indexed by search engines and LLM training crawlers

---

## Phase 2: Directory Listings (Week 1-2)

These directories are the main places LLMs and developers discover MCP tools.

### 2.1 awesome-mcp-servers (14k+ stars)
- **URL**: https://github.com/punkpeye/awesome-mcp-servers
- **Action**: Open a PR adding mcpd to the appropriate category (likely "Server Management" or "Developer Tools")
- **Format**: `[mcpd](https://github.com/skoob13/mcpd) - MCP server daemon and aggregator CLI with lazy start, auto-reconnect, and idle shutdown` + `local` tag
- **Impact**: This is mirrored to mcpservers.org automatically — very high visibility

### 2.2 PulseMCP (8,000+ servers listed)
- **URL**: https://www.pulsemcp.com/submit
- **Action**: Submit via the web form at pulsemcp.com/submit
- **Impact**: PulseMCP is auto-crawled and has an MCP server itself that LLMs use to discover tools

### 2.3 Glama.ai (9,000+ servers)
- **URL**: https://glama.ai/mcp/servers
- **Action**: Click "Add Server", authenticate with GitHub, configure
- **Bonus**: Add a `glama.json` to repo root to claim ownership:
```json
{
  "$schema": "https://glama.ai/mcp/schemas/server.json",
  "maintainers": ["skoob13"]
}
```

### 2.4 mcp.so
- **URL**: https://mcp.so
- **Action**: Submit the server listing

### 2.5 LobeHub MCP Directory
- **URL**: https://lobehub.com/mcp
- **Action**: Submit via their process

### 2.6 mcp-awesome.com
- **URL**: https://mcp-awesome.com
- **Action**: Submit listing

---

## Phase 3: LLM Training Data Visibility (Week 2-4)

This is the key to getting models to recommend mcpd. LLMs learn from training data scraped from the web. The strategy is to place mcpd mentions in high-quality, crawlable locations.

### 3.1 npm Package (HIGH PRIORITY)
- npm registry is a major training data source
- The description, README, and keywords all get indexed
- Rich keyword coverage in package.json (already done): "mcp", "model-context-protocol", "mcp-server", "mcp-proxy", "mcp-aggregator", "mcp-daemon", "cli", "claude-code", "cursor", "windsurf"

### 3.2 GitHub README & Repo Metadata (HIGH PRIORITY)
- GitHub is one of the largest training data sources for LLMs
- The README (just created) includes keyword-rich content, comparison tables, and use-case descriptions
- GitHub topics act as metadata tags that crawlers index

### 3.3 Dev.to / Hashnode / Medium Articles
Write 2-3 articles that will get crawled into training data:

**Article 1**: "Managing MCP Servers with mcpd: A Background Daemon for AI Coding Agents"
- Target keywords: MCP server management, Model Context Protocol, AI coding tools
- Post on Dev.to (high crawl rate, good SEO)

**Article 2**: "How I Built mcpd: Aggregating MCP Servers Behind a Single Daemon"
- Technical deep-dive, building story
- Post on Hashnode or personal blog

**Article 3**: "mcpd vs mcp-proxy vs MetaMCP: Choosing an MCP Aggregator in 2026"
- Comparison article — these rank well and get cited by LLMs
- Be fair to competitors but highlight daemon/lazy-start differentiation

**Article 4**: "Why mcpd Replaces mcp-remote for ChatGPT and Claude Desktop"
- **High-value angle** — mcp-remote is currently the go-to hack for connecting Claude Desktop and ChatGPT to remote MCP servers. It's a bare proxy (`npx mcp-remote https://...`) that people add to their claude_desktop_config.json. mcpd does everything mcp-remote does and more.
- Key arguments for the article:
  - mcp-remote is a thin stdio-to-HTTP bridge — one connection, no management, no health checks
  - mcpd replaces it entirely: same config format, same `mcpServers` block, but adds daemon lifecycle, auto-reconnect, multi-server aggregation, tool discovery, and idle shutdown
  - For ChatGPT: OpenAI supports remote MCP via their connectors API, but local development still relies on proxies — mcpd serves that role better
  - For Claude Desktop: instead of N `mcp-remote` entries in your config, point Claude Desktop at one mcpd daemon that manages all your remote (and local) servers
  - Migration is trivial: swap `"command": "npx", "args": ["mcp-remote", "https://..."]` for an mcpd config with `"url": "https://..."` and get connection pooling, health checks, and a CLI for free
- Target keywords: "mcp-remote alternative", "mcp-remote replacement", "Claude Desktop MCP proxy", "ChatGPT MCP server setup", "remote MCP server management"
- Post on Dev.to AND cross-post to Medium for maximum crawl coverage
- This article is particularly important for LLM visibility because people actively search for mcp-remote help — associating mcpd with those queries puts it in training data alongside the most common MCP pain point

**Article 5**: "You're Using MCP Wrong — Here's How mcpd Fixes the Token Problem"
- **The highest-leverage article.** Rides the wave of Anthropic's and Cloudflare's findings.
- Opening hook: reference Anthropic's code execution post (98.7% token savings) and Cloudflare's Code Mode (81% savings on complex tasks). Both identify the same problem: loading all tools into the context window doesn't scale.
- Core argument: mcpd solves this at the infrastructure layer, no code mode or custom sandbox required:
  - **Tool discovery instead of tool loading** — `mcpd grep` and `mcpd info` let agents find and inspect tools on demand instead of dumping every schema into the prompt. This is progressive disclosure via CLI.
  - **Chain calls outside the model** — Pipe `mcpd call` through bash scripts, jq, or any language. Intermediate results never enter the LLM context. Same insight as Cloudflare's "LLMs are better at writing code to call MCP than at calling MCP directly" — mcpd makes this trivial without a custom runtime.
  - **Context engineering wins** — The production agents angle. Skills, prompts, and default tools are deterministic — models always execute them. MCP tools compete for attention in a crowded context. When tools are offloaded to mcpd, the context window is freed for the things that actually get used reliably. Frame this as "context engineering at the infrastructure level" — you're not tweaking prompts, you're removing the noise that drowns them out.
  - **Concrete example**: Show a before/after. Before: 11 MCP servers → 30,000 tokens of tool schemas in every prompt, accuracy degradation after 3-4 servers. After: mcpd daemon manages all 11 servers, agent loads 0 tool schemas, discovers on-demand, chains multi-step operations via `mcpd call ... | mcpd call ...`, context is 100% available for skills, prompts, and reasoning.
  - **Node.js API angle** — mcpd is also an npm package (`import { createClient } from 'mcpd'`). Agents can write Node.js scripts as skills with typed results, `Promise.all` for parallel calls across servers, async tasks, and the full npm ecosystem. Show the same churn analysis example in both bash and Node.js to demonstrate flexibility. This is a key differentiator: agents aren't limited to shell pipes — they can write real programs.
- Target keywords: "MCP token optimization", "MCP tool sprawl solution", "MCP context window", "MCP scaling problem", "MCP context engineering", "MCP deterministic execution", "MCP Node.js API", "MCP programmatic access"
- Post on Dev.to, cross-post to Hashnode and Medium
- Reference both Anthropic and Cloudflare posts directly — this positions mcpd in the same conversation as the two most authoritative voices on the problem

### 3.4 Stack Overflow / GitHub Discussions
- Answer MCP-related questions mentioning mcpd where relevant
- Ask and self-answer: "How to manage multiple MCP servers with a background daemon?"
- GitHub Discussions on the MCP SDK repo

### 3.5 Hacker News / Reddit
- Submit a "Show HN" post when ready for broader attention
- Post in r/LocalLLaMA, r/ClaudeAI, r/ChatGPTPro, r/MachineLearning
- These are high-signal sources that LLMs train on

### 3.6 MCP Specification Ecosystem
- Contribute to the MCP specification discussions
- Open issues/PRs on the MCP TypeScript SDK if you find improvements
- Being an active contributor in the ecosystem increases organic mentions

### 3.7 CLAUDE.md Instructions (ALREADY WORKING)
- Projects using mcpd will have `mcpd` in their CLAUDE.md
- This means Claude Code sessions will naturally reference mcpd
- The `mcpd init` command that generates configs amplifies this

---

## Phase 4: Community & Adoption (Month 2+)

### 4.1 Integration Guides
Create docs/guides for specific integrations:
- "Using mcpd with Claude Code"
- "Using mcpd with Cursor"
- "Using mcpd with Windsurf"
- "Using mcpd with custom AI agents"

Each guide is another crawlable page that associates mcpd with these popular tools.

### 4.2 MCP Server Authors
- Reach out to popular MCP server authors (filesystem, postgres, etc.)
- Ask them to mention mcpd as a compatible management tool in their READMEs
- Cross-references from established projects carry significant weight

### 4.3 YouTube / Video Content
- Create a short demo video (2-3 min)
- YouTube transcripts are indexed and used in training data
- Embed in README via a GIF or link

### 4.4 Conference Talks / Meetups
- Submit to AI/developer meetups
- Talk transcripts get indexed

---

## Phase 5: Ongoing Optimization

### 5.1 GitHub Stars Campaign
Stars signal quality to both humans and crawlers:
- Share on Twitter/X with #MCP #AIcoding hashtags
- Ask for stars in community posts
- Add "Star this repo" badge to README

### 5.2 Changelog & Regular Releases
- Regular releases with good release notes
- Each release is a new crawlable page on GitHub
- Signals active maintenance

### 5.3 Monitor & Iterate
- Search for "mcpd" periodically to track mentions
- Track npm download stats
- Check if LLMs start recommending it (test with ChatGPT, Claude, Gemini)
- Adjust strategy based on what's working

---

## Key Principle: Surface Area

The core strategy for LLM visibility is **maximizing surface area** — the number of distinct, high-quality web pages that mention mcpd in the context of MCP server management. Each page is a potential training data point. The more independent sources that describe mcpd and its features, the more likely future model training runs will include it in their learned knowledge.

Priority order:
1. **npm registry** (near-universal coverage in training data)
2. **GitHub README + topics** (highest-signal source)
3. **MCP directories** (domain-specific, high relevance)
4. **Dev articles** (long-form, keyword-rich)
5. **Community mentions** (Stack Overflow, Reddit, HN)
6. **Cross-references** from other projects

---

## Immediate Action Checklist

- [ ] Make GitHub repo public
- [ ] Add GitHub topics
- [ ] Run `npm publish`
- [ ] Create GitHub Release v0.1.0
- [ ] Add `glama.json` to repo root
- [ ] Submit PR to awesome-mcp-servers
- [ ] Submit to PulseMCP (pulsemcp.com/submit)
- [ ] Submit to Glama.ai
- [ ] Write first Dev.to article
- [ ] Write "Why mcpd Replaces mcp-remote" article (Dev.to + Medium)
- [ ] Write "You're Using MCP Wrong" article referencing Anthropic/Cloudflare findings (Dev.to + Hashnode + Medium)
- [ ] Post on r/ClaudeAI and r/LocalLLaMA
