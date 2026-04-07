/**
 * Tests for autoMode in review_and_create_node.
 *
 * When autoMode is true, the tool skips all UI interaction and:
 * - Auto-saves when RMS ≥ 0.8 (reviewers pass)
 * - Returns rewrite instructions when RMS < 0.8 but scores not declining
 * - Auto-discards when scores are declining across 3+ rounds
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../src/tools/review-panel.ts', () => ({
  reviewAndCreateNode: vi.fn(),
}))

vi.mock('../../src/tools/graph.ts', () => ({
  createNode: vi.fn().mockResolvedValue(undefined),
  queryGraph: vi.fn().mockResolvedValue([]),
  createReview: vi.fn().mockResolvedValue(undefined),
  queryReviews: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/tools/seeds.ts', () => ({
  createSeed: vi.fn().mockResolvedValue(undefined),
  listSeeds: vi.fn().mockResolvedValue([]),
  listSeedSlugsSync: vi.fn().mockReturnValue([]),
}))

vi.mock('../../src/tools/search.ts', () => ({
  searchWeb: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/tools/read-page.ts', () => ({
  readPage: vi.fn().mockResolvedValue(''),
}))

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn().mockResolvedValue({ newContext: vi.fn(), close: vi.fn() }) },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockPi() {
  return {
    on: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI
}

function getToolExecute(pi: ExtensionAPI, toolName: string) {
  const calls = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls
  const toolCall = calls.find((c: unknown[]) => (c[0] as { name: string }).name === toolName)
  if (!toolCall) throw new Error(`Tool '${toolName}' not registered`)
  return (toolCall[0] as { execute: Function }).execute
}

const draftParams = {
  seed: 'test-seed',
  type: 'hypothesis' as const,
  id: 'hyp-001',
  title: 'Users prefer local AI',
  content: 'Users with high AI spend prefer local inference.',
  confidence: 0.75,
  autoMode: true,
}

const passingFeedback = [
  { role: 'assumption', score: 0.9, feedback: 'Assumptions well-supported.' },
  { role: 'counterpoint', score: 0.85, feedback: 'No strong counterpoint found.' },
  { role: 'logic', score: 0.9, feedback: 'Logic is sound.' },
]

const failingFeedback = [
  { role: 'assumption', score: 0.5, feedback: 'The assumption that users care about local inference is unvalidated.' },
  { role: 'counterpoint', score: 0.6, feedback: 'Cloud providers offer compelling cost advantages.' },
  { role: 'logic', score: 0.7, feedback: 'The inference chain is reasonable but missing causality.' },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('review_and_create_node — autoMode', () => {
  let pi: ExtensionAPI

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)
  })

  it('auto-saves the node when reviewers pass (RMS ≥ 0.8)', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: true,
      rmsScore: 0.88,
      feedback: passingFeedback,
    })

    const { createNode } = await import('../../src/tools/graph.ts')

    const execute = getToolExecute(pi, 'review_and_create_node')
    const result = await execute('id-1', draftParams, undefined, undefined, undefined)

    const text = result.content[0].text
    expect(text).toContain('saved')
    expect(text).toContain('hyp-001')
    expect(createNode).toHaveBeenCalled()
  })

  it('does not show any UI prompts in autoMode', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: true,
      rmsScore: 0.88,
      feedback: passingFeedback,
    })

    const selectFn = vi.fn()
    const ctx = {
      hasUI: true,
      ui: { select: selectFn, input: vi.fn(), notify: vi.fn() },
    }

    const execute = getToolExecute(pi, 'review_and_create_node')
    await execute('id-1', draftParams, undefined, undefined, ctx)

    expect(selectFn).not.toHaveBeenCalled()
  })

  it('returns rewrite instructions when RMS < 0.8 and scores not declining', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.55,
      feedback: failingFeedback,
    })

    const { createNode } = await import('../../src/tools/graph.ts')

    const execute = getToolExecute(pi, 'review_and_create_node')
    const result = await execute('id-1', draftParams, undefined, undefined, undefined)

    const text = result.content[0].text
    expect(text).toContain('Rewrite')
    expect(text).toContain('review_and_create_node')
    expect(text).toContain('The assumption that users care about local inference is unvalidated.')
    expect(text).toContain('Cloud providers offer compelling cost advantages.')
    expect(createNode).not.toHaveBeenCalled()
  })

  it('auto-discards when scores decline across 3+ rounds', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.40,
      feedback: failingFeedback,
    })

    const { createNode } = await import('../../src/tools/graph.ts')

    const execute = getToolExecute(pi, 'review_and_create_node')
    // Round 3 with declining scores: 0.6 → 0.5 → 0.4
    const params = { ...draftParams, round: 3, previousRmsScores: [0.6, 0.5] }
    const result = await execute('id-1', params, undefined, undefined, undefined)

    const text = result.content[0].text
    expect(text).toMatch(/discard|abandon|giving up/i)
    expect(text).toContain('hyp-001')
    expect(createNode).not.toHaveBeenCalled()
  })

  it('continues rewriting when scores decline but fewer than 3 rounds', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.50,
      feedback: failingFeedback,
    })

    const execute = getToolExecute(pi, 'review_and_create_node')
    // Only round 2, one previous score
    const params = { ...draftParams, round: 2, previousRmsScores: [0.6] }
    const result = await execute('id-1', params, undefined, undefined, undefined)

    const text = result.content[0].text
    expect(text).toContain('Rewrite')
    expect(text).not.toMatch(/discard|abandon|giving up/i)
  })

  it('auto-saves existing_solution without review (no reviewers dispatched)', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: true,
      rmsScore: 1.0,
      feedback: [],
    })

    const { createNode } = await import('../../src/tools/graph.ts')

    const execute = getToolExecute(pi, 'review_and_create_node')
    const params = { ...draftParams, type: 'existing_solution' as const, id: 'es-001', autoMode: true }
    const result = await execute('id-1', params, undefined, undefined, undefined)

    const text = result.content[0].text
    expect(text).toContain('saved')
    expect(createNode).toHaveBeenCalled()
  })

  it('includes round info in rewrite instructions', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.55,
      feedback: failingFeedback,
    })

    const execute = getToolExecute(pi, 'review_and_create_node')
    const params = { ...draftParams, round: 2, previousRmsScores: [0.6] }
    const result = await execute('id-1', params, undefined, undefined, undefined)

    const text = result.content[0].text
    expect(text).toContain('round: 3')
    expect(text).toContain('0.55')
  })
})
