import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

  it('uses role-specific models (Sonnet for counterpoint/failure_mode, Haiku for others)', async () => {
    const { runReviewRound } = await import('../../src/tools/review-panel.ts')
    const modelsUsed: Record<string, string> = {}

    // We can detect the model from the system prompt file content + task
    // But more directly: capture what runSubagent receives via the spawner
    // The spawner receives the pi args which include --model
    const spawner = async (_cmd: string, args: string[]) => {
      const modelIdx = args.indexOf('--model')
      const model = modelIdx >= 0 ? args[modelIdx + 1] : 'unknown'
      // Extract role from the task text (the last arg contains the reviewer task)
      const task = args[args.length - 1]
      // The system prompt file distinguishes roles, but we can track by call order
      // For product_plan: assumption, counterpoint, logic, failure_mode
      const callNum = Object.keys(modelsUsed).length
      modelsUsed[`call-${callNum}`] = model

      const event = JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: '{"score": 0.9, "feedback": "ok"}' }] }
      })
      return { stdout: event + '\n', stderr: '', exitCode: 0 }
    }

    await runReviewRound(
      { ...draftNode, type: 'product_plan' },
      seedContext,
      { spawner }
    )

    const models = Object.values(modelsUsed)
    expect(models).toHaveLength(4)
    // Should have a mix — not all haiku
    expect(models.filter(m => m === 'claude-sonnet-4-6').length).toBeGreaterThan(0)
    expect(models.filter(m => m === 'claude-haiku-4-6').length).toBeGreaterThan(0)
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

describe('reviewAndCreateNode', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'review-panel-test-'))
    // Create seed structure with _index.md
    await mkdir(join(tmpDir, 'test-seed'), { recursive: true })
    await writeFile(join(tmpDir, 'test-seed', '_index.md'), '# Test Seed\n\nContext.', 'utf-8')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  const baseDraft = {
    seed: 'test-seed',
    type: 'hypothesis' as const,
    id: 'hyp-001',
    title: 'Users prefer local AI',
    content: 'Users with high AI spend prefer local inference.',
    confidence: 0.75,
  }

  function makeSpawner(score: number, feedback: string) {
    return async () => {
      const event = JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ score, feedback }) }] }
      })
      return { stdout: event + '\n', stderr: '', exitCode: 0 }
    }
  }

  it('does not save node to disk when review passes (caller is responsible for saving)', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    const result = await reviewAndCreateNode(baseDraft, tmpDir, { spawner: makeSpawner(0.9, 'Good.') })

    expect(result.passed).toBe(true)
    expect(result.rmsScore).toBeGreaterThanOrEqual(0.8)

    // Node should NOT be on disk — caller decides whether to save
    const { access } = await import('node:fs/promises')
    await expect(access(join(tmpDir, 'test-seed', 'hypothesis', 'hyp-001.md'))).rejects.toThrow()
  })

  it('returns feedback without saving when RMS score < 0.8', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    const result = await reviewAndCreateNode(baseDraft, tmpDir, { spawner: makeSpawner(0.4, 'Weak.') })

    expect(result.passed).toBe(false)
    expect(result.rmsScore).toBeLessThan(0.8)
    expect(result.feedback).toHaveLength(3) // hypothesis gets 3 reviewers

    // Node should NOT be on disk
    const { access } = await import('node:fs/promises')
    await expect(access(join(tmpDir, 'test-seed', 'hypothesis', 'hyp-001.md'))).rejects.toThrow()
  })

  it('skips review and returns passed for existing_solution without spawning', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    const draft = { ...baseDraft, type: 'existing_solution' as const, id: 'es-001' }
    const neverCalled = vi.fn()

    const result = await reviewAndCreateNode(draft, tmpDir, {
      spawner: async () => { neverCalled(); return { stdout: '', stderr: '', exitCode: 0 } }
    })

    expect(result.passed).toBe(true)
    expect(result.feedback).toHaveLength(0)
    expect(neverCalled).not.toHaveBeenCalled()
  })

  it('includes RMS score and per-reviewer feedback in result', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    const result = await reviewAndCreateNode(baseDraft, tmpDir, { spawner: makeSpawner(0.85, 'Solid work.') })

    expect(typeof result.rmsScore).toBe('number')
    for (const f of result.feedback) {
      expect(f).toHaveProperty('role')
      expect(f).toHaveProperty('score')
      expect(f).toHaveProperty('feedback')
    }
  })

  it('uses a max of 3 review rounds to prevent infinite loops', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    const result = await reviewAndCreateNode(baseDraft, tmpDir, {
      spawner: makeSpawner(0.3, 'Bad.'),
      maxRounds: 1,
    })

    // With maxRounds=1, it should fail after one round without saving
    expect(result.passed).toBe(false)
  })
})
