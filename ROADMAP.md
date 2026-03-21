# Roadmap

## Deployed

## Implemented

## Implementing

## Specified
- [ ] File-based knowledge graph — Markdown files with YAML frontmatter in seeds/{seed-slug}/. Each node type has its own subdirectory. Wikilinks between nodes for edges. Per-seed _index.md as living summary. Obsidian-compatible out of the box. Git-native versioning.
- [ ] Pi extension infrastructure — Project-local pi extension at .pi/extensions/researcher/ that registers all research tools. TypeScript loaded by jiti (no build step). Deps declared in root package.json.
- [ ] Structured output for pi-bdd — product_plan and validation_strategy nodes shaped for pi-bdd consumption: hypothesis, measurable success conditions (PRODUCT.md format), proposed features (ROADMAP.md format), and smallest validation build. Closes the loop from researcher to coding agent.
- [ ] Run management — Trigger a research run against a seed, queue and execute asynchronously via BullMQ, monitor status and progress, stop or pause a run.
- [ ] Token budget tracking and communication — Each research run has an explicit token + $ budget set at run level (overrides seed default). Budget is communicated to the LLM via system prompt. Spend tracked per run. Agent stops at next natural break when budget exhausted.
- [ ] Research agent core loop — LLM-powered agent loop: search → read → produce typed knowledge graph nodes (observation, hypothesis, pain_point, existing_solution, conjecture) + edges. Runs until budget exhausted or research complete.
- [ ] Page reader tool — Jina Reader integration (r.jina.ai). Fetches any URL and returns clean markdown. Free, no API key required.
- [ ] Web search tool — Tavily API integration. Gives the research agent the ability to search the web and get clean structured results. Free tier: 1,000 searches/month.
- [ ] Seeds management — Create, list, pause, archive seed ideas. Each seed has a default token + $ budget for research runs.

## Considering

## Deprecated
- [x] Knowledge graph storage and query — Store and query research nodes and edges in PostgreSQL. Queryable by seed, by node type, and by relationship. Accumulates across multiple runs against the same seed.
- [x] Knowledge graph visualisation — Interactive graph view of research nodes and edges in the frontend. Post-MVP love-to-have.
- [x] Frontend — SvelteKit UI: seed list + create form, run status and progress, node list per seed. No graph visualisation at MVP.
- [x] REST API — Fastify API covering seeds CRUD, run trigger/status/stop, and knowledge graph queries.
