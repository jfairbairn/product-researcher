import type { NodeType } from './graph.ts'

export type ReviewerRole = 'assumption' | 'counterpoint' | 'logic' | 'failure_mode'

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
