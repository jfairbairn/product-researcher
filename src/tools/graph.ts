import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'

export type NodeType =
  | 'observation'
  | 'hypothesis'
  | 'conjecture'
  | 'pain_point'
  | 'existing_solution'
  | 'validation_strategy'
  | 'product_plan'
  | 'assumption'
  | 'persona'
  | 'risk'
  | 'market_signal'

export interface NodeLink {
  relation: string
  target: string
}

export interface CreateNodeOptions {
  seed: string
  type: NodeType
  id: string
  content: string
  confidence?: number
  sourceUrl?: string
  links?: NodeLink[]
  // risk-specific
  probability?: number
  severity?: 'critical' | 'high' | 'medium' | 'low'
  status?: 'open' | 'mitigated' | 'accepted' | 'closed'
  // market_signal-specific
  signalType?: string
}

export interface GraphNode {
  id: string
  type: string
  seed: string
  content: string
  confidence?: number
  sourceUrl?: string
}

export interface QueryGraphOptions {
  seed: string
  type?: string
}

export async function createNode(options: CreateNodeOptions, seedsDir: string): Promise<void> {
  const { seed, type, id, content, confidence, sourceUrl, links, probability, severity, status, signalType } = options
  const nodeDir = join(seedsDir, seed, type)
  const nodeFile = join(nodeDir, `${id}.md`)

  try {
    await access(nodeFile)
    throw new Error(`Node '${id}' already exists`)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('already exists')) throw err
  }

  await mkdir(nodeDir, { recursive: true })

  const linkLines =
    links && links.length > 0
      ? `links:\n${links.map((l) => `  - ${l.relation}: "[[${l.target}]]"`).join('\n')}\n`
      : ''

  const frontmatter = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `seed: ${seed}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    confidence !== undefined ? `confidence: ${confidence}` : null,
    probability !== undefined ? `probability: ${probability}` : null,
    severity ? `severity: ${severity}` : null,
    status ? `status: ${status}` : null,
    signalType ? `signal_type: ${signalType}` : null,
    sourceUrl ? `source_url: ${sourceUrl}` : null,
    linkLines ? linkLines.trimEnd() : null,
    '---',
  ]
    .filter((l) => l !== null)
    .join('\n')

  await writeFile(nodeFile, `${frontmatter}\n\n${content}\n`, 'utf-8')
}

export type ReviewType = 'assumption' | 'counterpoint' | 'logic' | 'failure_mode'
export type ReviewVerdict = 'approved' | 'challenged' | 'blocked'

export interface CreateReviewOptions {
  seed: string
  target: string
  reviewType: ReviewType
  verdict: ReviewVerdict
  content: string
  confidenceAdjustment?: number
}

export interface ReviewNode {
  id: string
  seed: string
  target: string
  reviewType: ReviewType
  verdict: ReviewVerdict
  content: string
  confidenceAdjustment?: number
}

export interface QueryReviewsOptions {
  seed: string
  target?: string
  verdict?: string
}

export async function createReview(options: CreateReviewOptions, seedsDir: string): Promise<void> {
  const { seed, target, reviewType, verdict, content, confidenceAdjustment } = options
  const reviewDir = join(seedsDir, seed, 'reviews')
  await mkdir(reviewDir, { recursive: true })

  // Find the next available sequence number for this target+type combination
  let existing: string[] = []
  try {
    existing = await readdir(reviewDir)
  } catch {
    // directory just created, no files yet
  }
  const prefix = `${target}-${reviewType}-`
  const n = existing.filter((f) => f.startsWith(prefix)).length + 1
  const id = `rev-${target}-${reviewType}-${n}`
  const fileName = `${target}-${reviewType}-${n}.md`
  const nodeFile = join(reviewDir, fileName)

  const frontmatter = [
    '---',
    `id: ${id}`,
    `type: review`,
    `seed: ${seed}`,
    `target: ${target}`,
    `review_type: ${reviewType}`,
    `verdict: ${verdict}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    confidenceAdjustment !== undefined ? `confidence_adjustment: ${confidenceAdjustment}` : null,
    '---',
  ]
    .filter((l) => l !== null)
    .join('\n')

  await writeFile(nodeFile, `${frontmatter}\n\n${content}\n`, 'utf-8')
}

export async function queryReviews(options: QueryReviewsOptions, seedsDir: string): Promise<ReviewNode[]> {
  const { seed, target, verdict } = options
  const reviewDir = join(seedsDir, seed, 'reviews')

  let files: string[]
  try {
    files = await readdir(reviewDir)
  } catch {
    return []
  }

  const reviews: ReviewNode[] = []

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    try {
      const raw = await readFile(join(reviewDir, file), 'utf-8')
      const node = parseReview(raw)
      if (!node) continue
      if (target && node.target !== target) continue
      if (verdict && node.verdict !== verdict) continue
      reviews.push(node)
    } catch {
      // skip unreadable files
    }
  }

  return reviews
}

function parseReview(raw: string): ReviewNode | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) return null

  const fm = match[1]
  const content = match[2].trim()

  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()

  const id = get('id')
  const seed = get('seed')
  const target = get('target')
  const reviewType = get('review_type') as ReviewType | undefined
  const verdict = get('verdict') as ReviewVerdict | undefined
  if (!id || !seed || !target || !reviewType || !verdict) return null

  const adj = get('confidence_adjustment')
  const confidenceAdjustment = adj ? parseFloat(adj) : undefined

  return { id, seed, target, reviewType, verdict, content, ...(confidenceAdjustment !== undefined && { confidenceAdjustment }) }
}

export async function queryGraph(options: QueryGraphOptions, seedsDir: string): Promise<GraphNode[]> {
  const { seed, type } = options
  const seedDir = join(seedsDir, seed)

  let typeDirs: string[]
  try {
    const entries = await readdir(seedDir)
    typeDirs = type ? entries.filter((e) => e === type) : entries.filter((e) => e !== 'runs' && !e.endsWith('.md'))
  } catch {
    return []
  }

  const nodes: GraphNode[] = []

  for (const typeDir of typeDirs) {
    const dirPath = join(seedDir, typeDir)
    let files: string[]
    try {
      files = await readdir(dirPath)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue
      try {
        const raw = await readFile(join(dirPath, file), 'utf-8')
        const node = parseNode(raw)
        if (node) nodes.push(node)
      } catch {
        // skip unreadable files
      }
    }
  }

  return nodes
}

function parseNode(raw: string): GraphNode | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) return null

  const fm = match[1]
  const content = match[2].trim()

  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()

  const id = get('id')
  const type = get('type')
  const seed = get('seed')
  if (!id || !type || !seed) return null

  const confidence = get('confidence') ? parseFloat(get('confidence')!) : undefined
  const sourceUrl = get('source_url')

  return { id, type, seed, content, ...(confidence !== undefined && { confidence }), ...(sourceUrl && { sourceUrl }) }
}
