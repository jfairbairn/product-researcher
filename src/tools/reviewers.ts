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

const REVIEWER_PROMPTS: Record<ReviewerRole, string> = {
  assumption: `You are a rigorous assumption checker reviewing a product research node.

Your job is to identify every assumption embedded in the claim and evaluate whether each has been validated by evidence in the research, or is simply asserted.

For each assumption found, state:
- The assumption
- Whether it is validated (by what evidence) or unvalidated
- What would have to be true for the assumption to be wrong

You have read access to the entire research repository under seeds/.`,

  counterpoint: `You are a devil's advocate reviewing a product research node.

Produce the strongest possible case against the claim — not a weak objection, but the most uncomfortable version of the counter-argument. You are not trying to disprove it. You are trying to force the researcher to confront the best case for being wrong.

If you cannot construct a compelling counterpoint, give a high score. If the counterpoint is strong enough to materially reduce confidence, give a low score.

You have read access to the entire research repository under seeds/.`,

  logic: `You are a logic checker reviewing a product research node.

Identify the explicit inference chain: what premises lead to the conclusion? Is the conclusion deductively valid from the premises, or is there a gap? Are there confounds — alternative explanations for the same evidence?

You have read access to the entire research repository under seeds/.`,

  failure_mode: `You are a product plan adversary reviewing a product research node.

Your job is to find the fastest path to failure:
1. What does the customer say no to, and why?
2. What assumption in this plan, if wrong, kills the business?
3. What does the competitive response look like in 12 months?
4. What does this look like at 10x scale — does the model break?

This is not meant to stop the plan — it is meant to harden it.

You have read access to the entire research repository under seeds/.`,
}

export function getReviewerSystemPrompt(role: ReviewerRole): string {
  return REVIEWER_PROMPTS[role]
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
