import { getReviewersForNodeType, buildReviewerTask, getReviewerSystemPrompt } from './reviewers.ts'
import { runSubagent, parseReviewerOutput } from './subagent-runner.ts'
import type { DraftNode, ReviewerRole } from './reviewers.ts'
import type { Spawner } from './subagent-runner.ts'

export type { DraftNode } from './reviewers.ts'

export interface ReviewFeedback {
  role: ReviewerRole
  score: number
  feedback: string
}

export function calculateRmsScore(scores: number[]): number {
  if (scores.length === 0) return 0
  const sumSquares = scores.reduce((sum, s) => sum + s * s, 0)
  return Math.sqrt(sumSquares / scores.length)
}

export interface ReviewRoundOptions {
  signal?: AbortSignal
  cwd?: string
  spawner?: Spawner
}

export async function runReviewRound(
  draft: DraftNode,
  seedContext: string,
  options: ReviewRoundOptions = {}
): Promise<ReviewFeedback[]> {
  const roles = getReviewersForNodeType(draft.type)
  if (roles.length === 0) return []

  const results = await Promise.all(
    roles.map(async (role): Promise<ReviewFeedback> => {
      const task = buildReviewerTask(role, draft, seedContext)
      const systemPrompt = getReviewerSystemPrompt(role)

      try {
        const result = await runSubagent({
          systemPrompt,
          task,
          tools: ['read', 'grep', 'find', 'ls'],
          model: 'claude-haiku-4-5',
          cwd: options.cwd,
          signal: options.signal,
          spawner: options.spawner,
        })

        if (result.exitCode !== 0 || !result.output) {
          return {
            role,
            score: 0.0,
            feedback: `Subagent failed (exit ${result.exitCode}): ${result.stderr || 'no output'}`,
          }
        }

        const parsed = parseReviewerOutput(result.output)
        return { role, ...parsed }
      } catch (err) {
        return {
          role,
          score: 0.0,
          feedback: `Subagent failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    })
  )

  return results
}
