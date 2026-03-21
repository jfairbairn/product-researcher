# Product Researcher — Agent Configuration

## What This Is

A suite of pi extension tools that power an autonomous product research agent. The agent runs inside pi, supervised by a human (and eventually Clawdbot), continuously researching product opportunities from seed ideas.

There is no web server, no database, no job queue. The knowledge graph lives as markdown files in `seeds/`. The tools are a pi extension at `.pi/extensions/researcher/`.

## BDD Method

Outside-in BDD with strict red-green-refactor enforcement.

Rules:
1. Never write to production paths before a failing test is confirmed
2. Never write production code before running tests and seeing them fail
3. Write the minimum code to make the test pass — no speculative implementation
4. Refactor only when tests are green
5. Every phase boundary is a git commit

## Stack

Language: TypeScript (ESM, NodeNext module resolution)
Runtime: Node.js 22 via jiti (no compilation step for the extension)
Test framework: Vitest
Test command: npm test
Extension loading: jiti (pi loads `.pi/extensions/researcher/index.ts` automatically)

External services:
  Tavily API     — web search (free tier: 1,000 searches/month)
  Jina Reader    — page reading (r.jina.ai/{url}, completely free, no key)
  Anthropic API  — LLM (pay-per-token, separate from Claude Max)
  OpenAI API     — optional alternative LLM provider

## Architecture

```
pi (TUI)
  └── researcher extension (.pi/extensions/researcher/index.ts)
        ├── search_web        → Tavily API
        ├── read_page         → Jina Reader (r.jina.ai)
        ├── create_seed       → seeds/{slug}/seed.md
        ├── create_node       → seeds/{slug}/{type}/{id}.md
        ├── update_index      → seeds/{slug}/_index.md
        ├── query_graph       → reads seeds/{slug}/**/*.md
        └── track_budget      → seeds/{slug}/runs/{run-id}.md
```

The agent loop is driven by pi + Claude. Tools read and write markdown files directly
using Node.js fs. No server process, no network layer, no database connection.

## File Layout

```
product-researcher/
├── .pi/
│   ├── extensions/
│   │   └── researcher/
│   │       └── index.ts        ← extension entry point (imports from src/)
│   ├── bdd.config.json
│   └── release.config.json
├── src/                        ← tool implementations (BDD production path)
│   ├── tools/
│   │   ├── search.ts           ← search_web tool
│   │   ├── read-page.ts        ← read_page tool
│   │   ├── seeds.ts            ← create_seed, list_seeds tools
│   │   ├── graph.ts            ← create_node, query_graph tools
│   │   └── budget.ts           ← track_budget tool
│   └── extension.ts            ← registers all tools with pi
├── tests/                      ← Vitest tests
│   └── tools/
├── seeds/                      ← the knowledge graph (markdown files, git-tracked)
│   └── {seed-slug}/
│       ├── seed.md             ← seed metadata + default budget
│       ├── _index.md           ← living summary (agent reads this first)
│       ├── observations/
│       ├── hypotheses/
│       ├── pain_points/
│       ├── existing_solutions/
│       ├── conjectures/
│       ├── validation_strategies/
│       ├── product_plans/
│       └── runs/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── AGENTS.md
├── PRODUCT.md
└── ROADMAP.md
```

## BDD Config (.pi/bdd.config.json)

```json
{
  "productionPaths": ["src/", ".pi/extensions/"],
  "testPaths": ["tests/"],
  "testFilePatterns": ["\\.test\\.", "\\.spec\\."],
  "testCommand": "npm test"
}
```

## Knowledge Graph Schema

Each node is a markdown file with YAML frontmatter:

```yaml
---
id: obs-001
type: observation          # observation | hypothesis | conjecture | pain_point |
                           # existing_solution | validation_strategy | product_plan
seed: ai-coding-tools
confidence: 0.9            # 0–1, set by agent
source_url: https://...    # optional
created: 2026-03-21
run: run-2026-03-21-001
links:
  - supports: "[[hyp-001-junior-devs-need-guardrails]]"
  - informs: "[[pp-001-context-window-management]]"
---

Body text...
```

Wikilinks (`[[node-id]]`) work as edges and render natively in Obsidian.

The `_index.md` per seed is a living document the agent maintains and reads
first each run to orient itself — key findings, open questions, promising directions.

Run files (`runs/run-{date}-{n}.md`) track model, budget, tokens used, status.

## Naming Conventions

Spec files mirror source files:
  src/tools/search.ts       → tests/tools/search.test.ts
  src/tools/graph.ts        → tests/tools/graph.test.ts
  src/extension.ts          → tests/extension.test.ts

## Test Data

Use builder functions for test data. Seed fixtures in `tests/fixtures/`.
Tests that write files use a temp directory (via `os.tmpdir()`) and clean up in `afterEach`.

## Security

Tools required: gitleaks ✅  semgrep ✅
Pre-commit hook: installed ✅
API keys in .env (gitignored) — never hardcoded.

## Release Gate

Release config: .pi/release.config.json
Deployment: Hetzner + Coolify (not yet provisioned)
The extension itself deploys as part of the repo — no separate build or service.

## Common Commands

Run all tests:    npm test
Watch mode:       npm run test:watch
Typecheck:        npm run typecheck
Install deps:     npm install
Load extension:   pi (auto-discovers .pi/extensions/researcher/)
