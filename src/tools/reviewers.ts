import type { NodeType, NodeLink } from './graph.ts'

export type ReviewerRole = 'assumption' | 'counterpoint' | 'logic' | 'failure_mode'

export interface DraftNode {
  seed: string
  type: NodeType
  id: string
  title?: string
  content: string
  confidence?: number
  sourceUrl?: string
  links?: NodeLink[]
}

const DISPATCH_MAP: Record<NodeType, ReviewerRole[]> = {
  observation: ['assumption'],
  hypothesis: ['assumption', 'counterpoint', 'logic'],
  conjecture: ['assumption', 'counterpoint', 'logic'],
  product_plan: ['assumption', 'counterpoint', 'logic', 'failure_mode'],
  pain_point: ['assumption'],
  existing_solution: [],
  validation_strategy: ['logic'],
  assumption: ['counterpoint'],
  persona: ['assumption'],
  risk: ['logic'],
  market_signal: ['assumption'],
}

export function getReviewersForNodeType(nodeType: NodeType): ReviewerRole[] {
  return DISPATCH_MAP[nodeType] ?? []
}

export function buildReviewerTask(role: ReviewerRole, draft: DraftNode, seedContext: string): string {
  const linksSection = draft.links && draft.links.length > 0
    ? `\nLinked nodes:\n${draft.links.map(l => `  - ${l.relation}: ${l.target}`).join('\n')}`
    : ''

  const confidenceSection = draft.confidence !== undefined
    ? `\nConfidence: ${draft.confidence}`
    : ''

  const nodeBlock = `## Draft Node

ID: ${draft.id}
Type: ${draft.type}${draft.title ? `\nTitle: ${draft.title}` : ''}${confidenceSection}${linksSection}

${draft.content}`

  const outputFormat = `## Required Output Format

Respond with EXACTLY this JSON structure (no markdown fencing, no extra text):
{"score": 0.0, "feedback": "Your detailed analysis..."}

Score guide:
- 1.0: No issues found
- 0.8: Minor issues that don't threaten the core claim
- 0.6: Material issues that should be addressed
- 0.4: Serious problems with the core claim
- 0.2: Fundamental flaws`

  return `## Seed Context

${seedContext}

${nodeBlock}

${outputFormat}`
}
