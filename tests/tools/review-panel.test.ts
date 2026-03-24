import { describe, it, expect, vi } from 'vitest'

describe('calculateRmsScore', () => {
  it('returns 1.0 for all-1.0 scores', async () => {
    const { calculateRmsScore } = await import('../../src/tools/review-panel.ts')
    expect(calculateRmsScore([1.0, 1.0, 1.0])).toBe(1.0)
  })

  it('returns 0.0 for all-0.0 scores', async () => {
    const { calculateRmsScore } = await import('../../src/tools/review-panel.ts')
    expect(calculateRmsScore([0.0, 0.0, 0.0])).toBe(0.0)
  })

  it('returns ~0.707 for [1.0, 0.0]', async () => {
    const { calculateRmsScore } = await import('../../src/tools/review-panel.ts')
    const result = calculateRmsScore([1.0, 0.0])
    expect(result).toBeCloseTo(0.7071, 3)
  })

  it('returns correct value for [0.9, 0.7, 0.8]', async () => {
    const { calculateRmsScore } = await import('../../src/tools/review-panel.ts')
    // RMS = sqrt((0.81 + 0.49 + 0.64) / 3) = sqrt(1.94 / 3) = sqrt(0.6467) ≈ 0.8042
    const result = calculateRmsScore([0.9, 0.7, 0.8])
    expect(result).toBeCloseTo(0.8042, 3)
  })

  it('returns 0 for empty array', async () => {
    const { calculateRmsScore } = await import('../../src/tools/review-panel.ts')
    expect(calculateRmsScore([])).toBe(0)
  })

  it('returns the single score for a single-element array', async () => {
    const { calculateRmsScore } = await import('../../src/tools/review-panel.ts')
    expect(calculateRmsScore([0.6])).toBeCloseTo(0.6, 5)
  })
})

describe('runReviewRound', () => {
  const draftNode = {
    seed: 'test-seed',
    type: 'hypothesis' as const,
    id: 'hyp-001',
    title: 'Users prefer local AI',
    content: 'Users with high AI spend prefer local inference.',
    confidence: 0.75,
  }
  const seedContext = '# Test Seed\n\nSome context.'

  it('returns empty feedback array for existing_solution (no reviewers)', async () => {
    const { runReviewRound } = await import('../../src/tools/review-panel.ts')
    const feedback = await runReviewRound(
      { ...draftNode, type: 'existing_solution' },
      seedContext,
      { spawner: async () => ({ stdout: '', stderr: '', exitCode: 0 }) }
    )
    expect(feedback).toEqual([])
  })

  it('runs one subagent per reviewer role for hypothesis', async () => {
    const { runReviewRound } = await import('../../src/tools/review-panel.ts')
    const calls: string[] = []

    const makeResponse = (role: string) => JSON.stringify({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: `{"score": 0.8, "feedback": "${role} review"}` }] }
    }) + '\n'

    const spawner = async (_cmd: string, args: string[]) => {
      // The task text is the last arg
      const task = args[args.length - 1]
      calls.push(task)
      return { stdout: makeResponse('test'), stderr: '', exitCode: 0 }
    }

    const feedback = await runReviewRound(draftNode, seedContext, { spawner })
    // hypothesis gets assumption, counterpoint, logic
    expect(feedback).toHaveLength(3)
    expect(feedback.map(f => f.role).sort()).toEqual(['assumption', 'counterpoint', 'logic'])
  })

  it('returns ReviewFeedback with role, score, and feedback for each reviewer', async () => {
    const { runReviewRound } = await import('../../src/tools/review-panel.ts')

    const spawner = async () => {
      const event = JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: '{"score": 0.7, "feedback": "Needs work."}' }] }
      })
      return { stdout: event + '\n', stderr: '', exitCode: 0 }
    }

    const feedback = await runReviewRound(draftNode, seedContext, { spawner })
    for (const f of feedback) {
      expect(f).toHaveProperty('role')
      expect(f).toHaveProperty('score')
      expect(f).toHaveProperty('feedback')
      expect(f.score).toBe(0.7)
      expect(f.feedback).toBe('Needs work.')
    }
  })

  it('handles subagent failure gracefully with score 0 and error in feedback', async () => {
    const { runReviewRound } = await import('../../src/tools/review-panel.ts')

    const spawner = async () => {
      return { stdout: '', stderr: 'pi crashed', exitCode: 1 }
    }

    const feedback = await runReviewRound(draftNode, seedContext, { spawner })
    expect(feedback).toHaveLength(3) // hypothesis still dispatches 3 reviewers
    for (const f of feedback) {
      expect(f.score).toBe(0.0)
      expect(f.feedback).toContain('Subagent failed')
    }
  })

  it('runs all four reviewers for product_plan', async () => {
    const { runReviewRound } = await import('../../src/tools/review-panel.ts')

    const spawner = async () => {
      const event = JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: '{"score": 0.9, "feedback": "OK"}' }] }
      })
      return { stdout: event + '\n', stderr: '', exitCode: 0 }
    }

    const feedback = await runReviewRound(
      { ...draftNode, type: 'product_plan' },
      seedContext,
      { spawner }
    )
    expect(feedback).toHaveLength(4)
    expect(feedback.map(f => f.role).sort()).toEqual(['assumption', 'counterpoint', 'failure_mode', 'logic'])
  })
})
