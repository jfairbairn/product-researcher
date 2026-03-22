import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { searchWeb } from './tools/search.ts'
import { readPage } from './tools/read-page.ts'
import { createSeed, listSeeds } from './tools/seeds.ts'
import { createNode, queryGraph } from './tools/graph.ts'

const NODE_TYPES = ['observation', 'hypothesis', 'conjecture', 'pain_point', 'existing_solution', 'validation_strategy', 'product_plan'] as const

export default function setup(pi: ExtensionAPI): void {
  const seedsDir = join(process.cwd(), 'seeds')

  // ── search_web ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'search_web',
    label: 'Search Web',
    description: 'Search the web via DuckDuckGo and return a list of results with title, URL, and snippet.',
    parameters: Type.Object({
      query: Type.String({ description: 'The search query' }),
      maxResults: Type.Optional(Type.Number({ description: 'Max results to return (default 10)' })),
    }),
    async execute(_id, params) {
      const results = await searchWeb(params.query, { maxResults: params.maxResults })
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        details: {},
      }
    },
  })

  // ── read_page ─────────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'read_page',
    label: 'Read Page',
    description: 'Fetch a URL and return its content as clean markdown via Jina Reader.',
    parameters: Type.Object({
      url: Type.String({ description: 'The URL to read' }),
    }),
    async execute(_id, params) {
      const content = await readPage(params.url)
      return {
        content: [{ type: 'text', text: content }],
        details: {},
      }
    },
  })

  // ── create_seed ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'create_seed',
    label: 'Create Seed',
    description: 'Create a new research seed with a slug and title.',
    parameters: Type.Object({
      slug: Type.String({ description: 'URL-safe identifier, e.g. ai-coding-tools' }),
      title: Type.String({ description: 'Human-readable title' }),
    }),
    async execute(_id, params) {
      await createSeed(params, seedsDir)
      return {
        content: [{ type: 'text', text: `Seed '${params.slug}' created.` }],
        details: {},
      }
    },
  })

  // ── list_seeds ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'list_seeds',
    label: 'List Seeds',
    description: 'List all research seeds with their status.',
    parameters: Type.Object({}),
    async execute() {
      const seeds = await listSeeds(seedsDir)
      return {
        content: [{ type: 'text', text: JSON.stringify(seeds, null, 2) }],
        details: {},
      }
    },
  })

  // ── create_node ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'create_node',
    label: 'Create Node',
    description: 'Write a typed knowledge graph node (observation, hypothesis, etc.) for a seed.',
    parameters: Type.Object({
      seed: Type.String({ description: 'Seed slug' }),
      type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t)), { description: 'Node type' }),
      id: Type.String({ description: 'Unique node id, e.g. obs-001' }),
      content: Type.String({ description: 'Body text of the node' }),
      confidence: Type.Optional(Type.Number({ description: 'Confidence 0–1' })),
      sourceUrl: Type.Optional(Type.String({ description: 'Source URL' })),
      links: Type.Optional(Type.Array(
        Type.Object({
          relation: Type.String(),
          target: Type.String({ description: 'Target node id' }),
        }),
        { description: 'Wikilink edges to other nodes' }
      )),
    }),
    async execute(_id, params) {
      await createNode(params as Parameters<typeof createNode>[0], seedsDir)
      return {
        content: [{ type: 'text', text: `Node '${params.id}' created.` }],
        details: {},
      }
    },
  })

  // ── query_graph ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'query_graph',
    label: 'Query Graph',
    description: 'Read existing knowledge graph nodes for a seed, optionally filtered by type.',
    parameters: Type.Object({
      seed: Type.String({ description: 'Seed slug' }),
      type: Type.Optional(Type.String({ description: 'Filter by node type' })),
    }),
    async execute(_id, params) {
      const nodes = await queryGraph(params, seedsDir)
      return {
        content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }],
        details: {},
      }
    },
  })

  // ── /research command ─────────────────────────────────────────────────────
  pi.registerCommand('research', {
    description: 'Start a research session against a seed: /research <slug>',
    handler: async (args, ctx) => {
      const slug = (args ?? '').trim()

      if (!slug) {
        ctx.ui.notify('Usage: /research <slug>', 'error')
        return
      }

      let seedMd: string
      let indexMd: string
      try {
        seedMd = await readFile(join(seedsDir, slug, 'seed.md'), 'utf-8')
        indexMd = await readFile(join(seedsDir, slug, '_index.md'), 'utf-8')
      } catch {
        ctx.ui.notify(`Seed '${slug}' not found. Create it first with the create_seed tool.`, 'error')
        return
      }

      const prompt = `You are a product researcher. Your job is to research the seed idea below and build a knowledge graph of findings.

## Seed

${seedMd}

## Prior Findings (from _index.md)

${indexMd}

## Instructions

1. Use \`search_web\` to find relevant pages. Use targeted queries.
2. Use \`read_page\` to read promising pages in full.
3. Use \`query_graph\` to check what nodes already exist before creating duplicates.
4. Use \`create_node\` to record findings as typed nodes:
   - \`observation\` — a concrete fact you found
   - \`pain_point\` — a problem users face
   - \`existing_solution\` — a competitor or workaround
   - \`hypothesis\` — a testable belief
   - \`conjecture\` — a speculative idea
5. Link nodes to each other using the \`links\` field (e.g. \`supports\`, \`informs\`, \`contradicts\`).
6. When you are satisfied with the depth of research, update \`_index.md\` with a summary of key findings, open questions, and promising directions.

Stay focused. Prefer depth over breadth.`

      pi.sendUserMessage(prompt)
    },
  })

  pi.on('session_start', async () => {
    // researcher extension loaded
  })
}
