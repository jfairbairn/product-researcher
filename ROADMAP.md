# Roadmap

## Deployed

## Implemented

## Implementing

## Specified
- [ ] Structured output for pi-bdd — product_plan and validation_strategy nodes shaped for pi-bdd consumption: hypothesis, measurable success conditions (PRODUCT.md format), proposed features (ROADMAP.md format), and smallest validation build. Closes the loop from researcher to coding agent.

## Implemented
- [x] File-based knowledge graph — Markdown files with YAML frontmatter in seeds/{seed-slug}/. Each node type has its own subdirectory. Wikilinks between nodes for edges. Per-seed _index.md as living summary. Obsidian-compatible out of the box. Git-native versioning.
- [x] Pi extension infrastructure — Project-local pi extension at .pi/extensions/researcher/ that registers all research tools. TypeScript loaded by jiti (no build step). Deps declared in root package.json.
- [x] Research agent core loop — /research <slug> command injects seed context + prior findings, registers all tools, and hands off to the model to research autonomously.
- [x] Page reader tool — Jina Reader integration (r.jina.ai). Fetches any URL and returns clean markdown. Free, no API key required.
- [x] Web search tool — Playwright/DuckDuckGo. Headless browser search, no API key or rate limits.
- [x] Seeds management — create_seed, list_seeds tools. seed.md + _index.md per seed.

## Considering

## Deprecated
- [x] Knowledge graph storage and query — Store and query research nodes and edges in PostgreSQL. Queryable by seed, by node type, and by relationship. Accumulates across multiple runs against the same seed.
- [x] Knowledge graph visualisation — Interactive graph view of research nodes and edges in the frontend. Post-MVP love-to-have.
- [x] Frontend — SvelteKit UI: seed list + create form, run status and progress, node list per seed. No graph visualisation at MVP.
- [x] REST API — Fastify API covering seeds CRUD, run trigger/status/stop, and knowledge graph queries.
