import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { searchWeb } from './tools/search.ts'
import { readPage } from './tools/read-page.ts'
import { createSeed, listSeeds } from './tools/seeds.ts'
import { createNode, queryGraph, createReview, queryReviews } from './tools/graph.ts'
import { reviewAndCreateNode } from './tools/review-panel.ts'

const NODE_TYPES = [
  'observation',
  'hypothesis',
  'conjecture',
  'pain_point',
  'existing_solution',
  'validation_strategy',
  'product_plan',
  'assumption',
  'persona',
  'risk',
  'market_signal',
] as const

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
    description: `Write a typed knowledge graph node for a seed. Types:
- observation — a concrete fact found during research
- pain_point — a problem users face
- existing_solution — a competitor or workaround
- hypothesis — a testable belief about the opportunity
- conjecture — a speculative idea worth exploring
- validation_strategy — a way to test a hypothesis
- product_plan — a product or business direction
- assumption — an unvalidated premise a node depends on being true
- persona — a defined buyer or user segment with characteristics and WTP
- risk — a specific thing that could go wrong, with probability and severity
- market_signal — a leading indicator (community size, growth rate, competitor move)`,
    parameters: Type.Object({
      seed: Type.String({ description: 'Seed slug' }),
      type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t)), { description: 'Node type' }),
      id: Type.String({ description: 'Unique node id, e.g. obs-001' }),
      title: Type.Optional(Type.String({ description: 'Pithy one-line title for the node (max ~12 words)' })),
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
      probability: Type.Optional(Type.Number({ description: '(risk) Probability 0–1 that this risk materialises' })),
      severity: Type.Optional(Type.Union(
        ['critical', 'high', 'medium', 'low'].map((s) => Type.Literal(s)),
        { description: '(risk) Impact severity if the risk materialises' }
      )),
      status: Type.Optional(Type.Union(
        ['open', 'mitigated', 'accepted', 'closed'].map((s) => Type.Literal(s)),
        { description: '(risk) Current status' }
      )),
      signalType: Type.Optional(Type.Union(
        ['community_growth', 'pricing_change', 'competitor_move', 'adoption_data'].map((s) => Type.Literal(s)),
        { description: '(market_signal) Category of signal' }
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

  // ── review_and_create_node ──────────────────────────────────────────────
  pi.registerTool({
    name: 'review_and_create_node',
    label: 'Review and Create Node',
    description: `Submit a draft node for parallel review by specialist subagents. Each reviewer has its own context and evaluates the node independently. Returns reviewer feedback and scores.

If the RMS score across all reviewers is ≥ 0.8, the node is saved automatically. If not, rewrite the node addressing the feedback and call this tool again with the revised content.

Reviewers dispatched per type:
- observation, pain_point, persona, market_signal → assumption checker
- hypothesis, conjecture → assumption + counterpoint + logic
- product_plan → assumption + counterpoint + logic + failure mode
- validation_strategy, risk → logic
- existing_solution → no review (saved directly)
- assumption → counterpoint`,
    parameters: Type.Object({
      seed: Type.String({ description: 'Seed slug' }),
      type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t)), { description: 'Node type' }),
      id: Type.String({ description: 'Unique node id, e.g. obs-001' }),
      title: Type.Optional(Type.String({ description: 'Pithy one-line title for the node (max ~12 words)' })),
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
      probability: Type.Optional(Type.Number({ description: '(risk) Probability 0–1 that this risk materialises' })),
      severity: Type.Optional(Type.Union(
        ['critical', 'high', 'medium', 'low'].map((s) => Type.Literal(s)),
        { description: '(risk) Impact severity if the risk materialises' }
      )),
      status: Type.Optional(Type.Union(
        ['open', 'mitigated', 'accepted', 'closed'].map((s) => Type.Literal(s)),
        { description: '(risk) Current status' }
      )),
      signalType: Type.Optional(Type.Union(
        ['community_growth', 'pricing_change', 'competitor_move', 'adoption_data'].map((s) => Type.Literal(s)),
        { description: '(market_signal) Category of signal' }
      )),
    }),
    async execute(_id, params, signal) {
      const result = await reviewAndCreateNode(
        params as Parameters<typeof reviewAndCreateNode>[0],
        seedsDir,
        { signal, cwd: process.cwd() }
      )

      if (result.passed && result.feedback.length === 0) {
        return {
          content: [{ type: 'text', text: `Node '${params.id}' saved (no review needed for ${params.type}).` }],
          details: {},
        }
      }

      const feedbackText = result.feedback.map(f =>
        `### ${f.role} (score: ${f.score.toFixed(2)})\n${f.feedback}`
      ).join('\n\n')

      if (result.passed) {
        return {
          content: [{
            type: 'text',
            text: `Node '${params.id}' PASSED review (RMS: ${result.rmsScore.toFixed(2)}) and saved.\n\n${feedbackText}`
          }],
          details: {},
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Node '${params.id}' DID NOT PASS review (RMS: ${result.rmsScore.toFixed(2)}). Rewrite the node addressing the feedback below, then call review_and_create_node again with the revised content.\n\n${feedbackText}`
        }],
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

  // ── create_review ─────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'create_review',
    label: 'Create Review',
    description: 'Write a review of an existing node — assumption check, counterpoint, logic check, or failure mode analysis.',
    parameters: Type.Object({
      seed: Type.String({ description: 'Seed slug' }),
      target: Type.String({ description: 'Node id being reviewed, e.g. hyp-005' }),
      reviewType: Type.Union(
        ['assumption', 'counterpoint', 'logic', 'failure_mode'].map((t) => Type.Literal(t)),
        { description: 'Kind of review: assumption | counterpoint | logic | failure_mode' }
      ),
      verdict: Type.Union(
        ['approved', 'challenged', 'blocked'].map((v) => Type.Literal(v)),
        { description: 'Outcome: approved | challenged | blocked' }
      ),
      content: Type.String({ description: 'Review body text' }),
      confidenceAdjustment: Type.Optional(Type.Number({ description: 'Suggested delta to target confidence, e.g. -0.15' })),
    }),
    async execute(_id, params) {
      await createReview(params as Parameters<typeof createReview>[0], seedsDir)
      return {
        content: [{ type: 'text', text: `Review of '${params.target}' created.` }],
        details: {},
      }
    },
  })

  // ── query_reviews ─────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'query_reviews',
    label: 'Query Reviews',
    description: 'Read reviews for a seed. Optionally filter by target node id or verdict.',
    parameters: Type.Object({
      seed: Type.String({ description: 'Seed slug' }),
      target: Type.Optional(Type.String({ description: 'Filter to reviews of a specific node, e.g. hyp-005' })),
      verdict: Type.Optional(Type.String({ description: 'Filter by verdict: approved | challenged | blocked' })),
    }),
    async execute(_id, params) {
      const reviews = await queryReviews(params, seedsDir)
      return {
        content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }],
        details: {},
      }
    },
  })

  // ── /seed command ─────────────────────────────────────────────────────────
  pi.registerCommand('seed', {
    description: 'Create a new research seed with a guided interview: /seed [slug]',
    handler: async (args, ctx) => {
      const askSlug = !(args ?? '').trim()
      let slug = (args ?? '').trim()

      if (askSlug) {
        const input = await ctx.ui.input('Seed slug (url-safe, e.g. ai-coding-tools):', '')
        if (!input?.trim()) {
          ctx.ui.notify('Cancelled.', 'info')
          return
        }
        slug = input.trim()
      }

      const titleInput = await ctx.ui.input('Title (human-readable):', '')
      if (!titleInput?.trim()) {
        ctx.ui.notify('Cancelled.', 'info')
        return
      }
      const title = titleInput.trim()

      ctx.ui.notify('A few quick questions to capture what you already know. Leave any blank to skip.', 'info')

      const hypothesis = await ctx.ui.input('Core hypothesis or opportunity (1–2 sentences):', '')
      const priorKnowledge = await ctx.ui.input('What do you already know? (context, constraints, prior research):', '')
      const buyer = await ctx.ui.input('Target buyer or user:', '')
      const competitors = await ctx.ui.input('Known competitors or existing solutions:', '')
      const openQuestions = await ctx.ui.input('Most important questions you want answered:', '')

      // Build _index.md from interview answers
      const sections: string[] = [`# ${title}`, '']

      if (hypothesis?.trim()) {
        sections.push('## Core Hypothesis', '', hypothesis.trim(), '')
      }

      if (priorKnowledge?.trim()) {
        sections.push('## Prior Knowledge', '', priorKnowledge.trim(), '')
      }

      if (buyer?.trim()) {
        sections.push('## Target Buyer', '', buyer.trim(), '')
      }

      if (competitors?.trim()) {
        sections.push('## Known Landscape', '', competitors.trim(), '')
      }

      sections.push('## Open Questions', '')
      if (openQuestions?.trim()) {
        sections.push(openQuestions.trim(), '')
      } else {
        sections.push('_Nothing yet._', '')
      }

      sections.push('## Key Findings', '', '_Nothing yet — run `/research ' + slug + '` to begin._', '')
      sections.push('## Promising Directions', '', '_Nothing yet._', '')

      const initialIndex = sections.join('\n')

      try {
        await createSeed({ slug, title, initialIndex }, seedsDir)
        ctx.ui.notify(`Seed '${slug}' created. Run /research ${slug} to begin.`, 'info')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.ui.notify(msg, 'error')
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
4. Use \`review_and_create_node\` for nodes that involve interpretation or judgment. This submits the node for parallel review by specialist subagents (assumption checker, devil's advocate, logic checker, failure mode analyst). Each reviewer independently evaluates the node with its own context. If the review panel returns a score below 0.8, **rewrite the node addressing the specific feedback**, then call \`review_and_create_node\` again. Use this for:
   - \`hypothesis\` — a testable belief
   - \`conjecture\` — a speculative idea
   - \`product_plan\` — a product or business direction
   - \`assumption\` — an unvalidated premise a node *depends on* being true (make these explicit!)
   - \`persona\` — a defined buyer/user segment with job, pain, WTP, and where they are
   - \`observation\` — a concrete fact you found (gets light assumption-checking)
   - \`pain_point\` — a problem users face
   - \`risk\` — a specific thing that could go wrong; use \`probability\`, \`severity\`, \`status\` fields
   - \`market_signal\` — a leading indicator such as community growth, pricing change, or competitor move; use \`signalType\` field
   - \`validation_strategy\` — how to test a hypothesis
5. Use \`create_node\` (bypassing review) only for purely factual recordings where no interpretation is involved:
   - \`existing_solution\` — a competitor or workaround (factual, no review needed)
6. Always include a \`title\` — a pithy one-line summary of the node's single most important claim (max 12 words, active voice, specific not generic).
7. Link nodes to each other using the \`links\` field (e.g. \`supports\`, \`informs\`, \`contradicts\`, \`underlies\`, \`threatens\`).
8. When you are satisfied with the depth of research, update \`_index.md\` with a summary of key findings, open questions, and promising directions.

Stay focused. Prefer depth over breadth. When a reviewer challenges your node, take the feedback seriously — don't just add a disclaimer, genuinely reconsider the claim.`

      pi.sendUserMessage(prompt)
    },
  })

  // ── /review command ───────────────────────────────────────────────────────
  pi.registerCommand('review', {
    description: 'Run a review pass on unreviewed nodes in a seed: /review <slug> [node-id] [--role assumption|counterpoint|logic|failure_mode]',
    handler: async (args, ctx) => {
      const parts = (args ?? '').trim().split(/\s+/)
      const slug = parts[0]

      if (!slug) {
        ctx.ui.notify('Usage: /review <slug> [node-id] [--role assumption|counterpoint|logic|failure_mode]', 'error')
        return
      }

      // Parse optional node-id and --role flag
      let nodeId: string | undefined
      let role: string | undefined
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === '--role' && parts[i + 1]) {
          role = parts[++i]
        } else if (!parts[i].startsWith('--')) {
          nodeId = parts[i]
        }
      }

      let seedMd: string
      let indexMd: string
      try {
        seedMd = await readFile(join(seedsDir, slug, 'seed.md'), 'utf-8')
        indexMd = await readFile(join(seedsDir, slug, '_index.md'), 'utf-8')
      } catch {
        ctx.ui.notify(`Seed '${slug}' not found.`, 'error')
        return
      }

      const targetClause = nodeId
        ? `Focus your review on node \`${nodeId}\` only.`
        : `Review all unreviewed hypothesis, conjecture, and product_plan nodes.`

      const roleInstructions: Record<string, string> = {
        assumption: `You are a rigorous assumption checker. Identify every assumption embedded in the claim and ask: what would have to be true for this assumption to be wrong? For each assumption, determine whether it has been validated by the research or is simply asserted. Flag unvalidated assumptions as challenged. Use reviewType: "assumption".`,
        counterpoint: `You are a devil's advocate. Produce the strongest possible case against the hypothesis — not a weak objection, but the most uncomfortable version of the counter-argument. If the counterpoint is strong enough to materially reduce confidence, set verdict: "challenged". If you cannot construct a compelling counterpoint, set verdict: "approved". Use reviewType: "counterpoint".`,
        logic: `You are a logic checker. Identify the explicit inference chain: what premises lead to the conclusion? Is the conclusion deductively valid from the premises, or is there a gap? Are there confounds — alternative explanations for the same evidence? Use reviewType: "logic".`,
        failure_mode: `You are a product plan adversary. Find the fastest path to failure: (1) What does the customer say no to, and why? (2) What assumption, if wrong, kills the business? (3) What does the competitive response look like in 12 months? (4) What does this look like at 10x scale? Use reviewType: "failure_mode".`,
      }

      const rolePrompt = role && roleInstructions[role]
        ? roleInstructions[role]
        : `Select the most appropriate review role for each node:
- hypothesis or conjecture with confidence > 0.65: use "assumption" and "counterpoint" reviews
- hypothesis or conjecture with confidence ≤ 0.65: use "assumption" review
- product_plan: use "failure_mode" review
- conjecture with explicit inference chain: use "logic" review`

      const prompt = `You are a research reviewer. Your job is to challenge the research findings for the seed below, not rubber-stamp them.

## Seed

${seedMd}

## Prior Findings (from _index.md)

${indexMd}

## Your Role

${rolePrompt}

## Instructions

1. Use \`query_graph\` to read the nodes you need to review.
2. Use \`query_reviews\` to check which nodes already have reviews — do not duplicate.
3. ${targetClause}
4. For each node you review, call \`create_review\` with:
   - \`target\`: the node id being reviewed
   - \`reviewType\`: assumption | counterpoint | logic | failure_mode
   - \`verdict\`: approved | challenged | blocked
   - \`confidenceAdjustment\`: suggested delta if verdict is challenged or blocked (e.g. -0.15)
   - \`content\`: your detailed review explaining the challenge or approval
5. Be rigorous. A review that approves everything is useless. A review that blocks everything is also useless.
6. After all reviews are written, summarise what you challenged and why.`

      pi.sendUserMessage(prompt)
    },
  })

  pi.on('session_start', async () => {
    // researcher extension loaded
  })
}
