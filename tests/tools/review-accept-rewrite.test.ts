/**
 * Tests for the "accept reviews" rewrite loop in review_and_create_node.
 *
 * The user can choose to have the agent incorporate all or selected reviewer
 * feedback and rewrite the node, looping until reviewers pass or the agent
 * decides to give up due to quality decline.
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
}

const challengedFeedback = [
  {
    role: 'assumption',
    score: 0.5,
    feedback: 'The assumption that users care about local inference is unvalidated.',
  },
  {
    role: 'counterpoint',
    score: 0.6,
    feedback: 'Cloud providers offer compelling cost advantages.',
  },
  {
    role: 'logic',
    score: 0.7,
    feedback: 'The inference chain is reasonable but missing causality.',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('review_and_create_node — accept reviews rewrite loop', () => {
  let pi: ExtensionAPI

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)
  })

  describe('UI mode — new choice options', () => {
    it('shows "Accept all reviews" option in the select prompt', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      const selectOptions: string[][] = []
      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn(async (_prompt: string, options: string[]) => {
            selectOptions.push(options)
            return 'Discard — move on'
          }),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      await execute('id-1', draftParams, undefined, undefined, ctx)

      expect(selectOptions[0]).toContain('Accept all reviews — agent rewrites')
    })

    it('shows "Accept selected reviews" option in the select prompt', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      const selectOptions: string[][] = []
      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn(async (_prompt: string, options: string[]) => {
            selectOptions.push(options)
            return 'Discard — move on'
          }),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      await execute('id-1', draftParams, undefined, undefined, ctx)

      expect(selectOptions[0]).toContain('Accept selected reviews — choose which')
    })

    it('returns all reviewer feedback with rewrite instruction when user picks "Accept all reviews"', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn().mockResolvedValue('Accept all reviews — agent rewrites'),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      const result = await execute('id-1', draftParams, undefined, undefined, ctx)

      const text = result.content[0].text
      expect(text).toContain('assumption')
      expect(text).toContain('counterpoint')
      expect(text).toContain('logic')
      expect(text).toContain('The assumption that users care about local inference is unvalidated.')
      expect(text).toContain('Cloud providers offer compelling cost advantages.')
      expect(text).toContain('rewrite')
      expect(text).toContain('review_and_create_node')
    })

    it('lets user pick individual reviews when "Accept selected reviews" is chosen', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      // First select: pick "Accept selected reviews"
      // Then for each reviewer: yes/no via select
      const selectCalls: { prompt: string; options: string[] }[] = []
      let selectCallCount = 0
      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn(async (prompt: string, options: string[]) => {
            selectCalls.push({ prompt, options })
            selectCallCount++
            if (selectCallCount === 1) return 'Accept selected reviews — choose which'
            // Accept assumption, skip counterpoint, accept logic
            if (prompt.includes('assumption')) return 'Yes'
            if (prompt.includes('counterpoint')) return 'No'
            if (prompt.includes('logic')) return 'Yes'
            return 'No'
          }),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      const result = await execute('id-1', draftParams, undefined, undefined, ctx)

      const text = result.content[0].text
      // Should include the accepted reviews
      expect(text).toContain('The assumption that users care about local inference is unvalidated.')
      expect(text).toContain('The inference chain is reasonable but missing causality.')
      // Should NOT include the rejected review's feedback
      expect(text).not.toContain('Cloud providers offer compelling cost advantages.')
      expect(text).toContain('rewrite')
    })

    it('includes round number in return for agent to track quality trajectory', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn().mockResolvedValue('Accept all reviews — agent rewrites'),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      // Pass round number as parameter
      const paramsWithRound = { ...draftParams, round: 2, previousRmsScores: [0.6] }
      const result = await execute('id-1', paramsWithRound, undefined, undefined, ctx)

      const text = result.content[0].text
      expect(text).toContain('Round 2')
      expect(text).toMatch(/previous.*scores.*0\.6/i)
    })

    it('advises agent to consider giving up when scores are declining', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.40,
        feedback: challengedFeedback,
      })

      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn().mockResolvedValue('Accept all reviews — agent rewrites'),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      // Round 3, scores declining: 0.6 → 0.5 → 0.4
      const paramsWithRound = { ...draftParams, round: 3, previousRmsScores: [0.6, 0.5] }
      const result = await execute('id-1', paramsWithRound, undefined, undefined, ctx)

      const text = result.content[0].text
      expect(text).toMatch(/declining|deteriorat/i)
      expect(text).toMatch(/consider.*discard|give up|abandon/i)
    })
  })

  describe('headless mode — no UI', () => {
    it('includes accept-reviews option in text instructions for headless mode', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      const execute = getToolExecute(pi, 'review_and_create_node')
      // No ctx = headless
      const result = await execute('id-1', draftParams, undefined, undefined, undefined)

      const text = result.content[0].text
      expect(text).toMatch(/accept.*review/i)
      expect(text).toMatch(/rewrite.*addressing/i)
    })

    it('includes round tracking info in headless mode when round > 1', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: false,
        rmsScore: 0.55,
        feedback: challengedFeedback,
      })

      const execute = getToolExecute(pi, 'review_and_create_node')
      const paramsWithRound = { ...draftParams, round: 2, previousRmsScores: [0.6] }
      const result = await execute('id-1', paramsWithRound, undefined, undefined, undefined)

      const text = result.content[0].text
      expect(text).toContain('Round 2')
    })
  })

  describe('no new options shown when no reviewers needed', () => {
    it('does not show accept options for existing_solution (no reviewers)', async () => {
      const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
      ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        passed: true,
        rmsScore: 1.0,
        feedback: [],
      })

      const selectOptions: string[][] = []
      const ctx = {
        hasUI: true,
        ui: {
          select: vi.fn(async (_prompt: string, options: string[]) => {
            selectOptions.push(options)
            return 'Save'
          }),
          input: vi.fn().mockResolvedValue(''),
          notify: vi.fn(),
        },
      }

      const execute = getToolExecute(pi, 'review_and_create_node')
      await execute('id-1', { ...draftParams, type: 'existing_solution' }, undefined, undefined, ctx)

      // For existing_solution with no feedback, accept-review options shouldn't appear
      // (Save prompt may still appear, or it may auto-save — either way, no review options)
      if (selectOptions.length > 0) {
        expect(selectOptions[0]).not.toContain('Accept all reviews — agent rewrites')
        expect(selectOptions[0]).not.toContain('Accept selected reviews — choose which')
      }
    })
  })
})
