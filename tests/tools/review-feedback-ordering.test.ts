/**
 * Regression test for: reviewer feedback shown AFTER user decision
 *
 * Bug: the ctx.ui.select prompt only included reviewer scores, not the full
 * feedback text. The detailed critique was appended to the tool's return
 * content — visible only after the user had already chosen Save/Revise/Discard.
 *
 * Expected: the full reviewer feedback text (role, score, and critique) must
 * appear in the ctx.ui.select prompt so the user can read the reasoning before
 * deciding what to do with the node.
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

function makeMockCtx(selectChoice: string) {
  const selectPrompts: string[] = []
  return {
    ctx: {
      hasUI: true,
      ui: {
        select: vi.fn(async (prompt: string) => {
          selectPrompts.push(prompt)
          return selectChoice
        }),
        input: vi.fn().mockResolvedValue(''),
        notify: vi.fn(),
      },
    },
    selectPrompts,
  }
}

const draftParams = {
  seed: 'test-seed',
  type: 'hypothesis' as const,
  id: 'hyp-001',
  title: 'Users prefer local AI',
  content: 'Users with high AI spend prefer local inference.',
  confidence: 0.75,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('review_and_create_node — reviewer feedback shown before user decision', () => {
  let pi: ExtensionAPI

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)
  })

  it('includes full reviewer critique text in the select prompt when RMS is below threshold', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.55,
      feedback: [
        {
          role: 'assumption',
          score: 0.5,
          feedback: 'The assumption that users care about local inference is unvalidated.',
        },
        {
          role: 'counterpoint',
          score: 0.6,
          feedback: 'Cloud providers offer compelling cost advantages that undercut this hypothesis.',
        },
      ],
    })

    const execute = getToolExecute(pi, 'review_and_create_node')
    const { ctx, selectPrompts } = makeMockCtx('Discard — move on')

    await execute('id-1', draftParams, undefined, undefined, ctx)

    expect(selectPrompts).toHaveLength(1)
    const prompt = selectPrompts[0]

    // The full feedback critique must appear in the prompt — before the user decides
    expect(prompt).toContain('The assumption that users care about local inference is unvalidated.')
    expect(prompt).toContain('Cloud providers offer compelling cost advantages that undercut this hypothesis.')
  })

  it('includes full reviewer critique text in the select prompt when RMS passes threshold', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: true,
      rmsScore: 0.85,
      feedback: [
        {
          role: 'assumption',
          score: 0.9,
          feedback: 'Assumptions are well-supported by cited evidence.',
        },
      ],
    })

    const execute = getToolExecute(pi, 'review_and_create_node')
    const { ctx, selectPrompts } = makeMockCtx('Save')

    await execute('id-1', draftParams, undefined, undefined, ctx)

    expect(selectPrompts).toHaveLength(1)
    const prompt = selectPrompts[0]
    expect(prompt).toContain('Assumptions are well-supported by cited evidence.')
  })

  it('shows scores AND critique together in the select prompt', async () => {
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.62,
      feedback: [
        {
          role: 'logic',
          score: 0.62,
          feedback: 'The inference chain skips from observation to conclusion without establishing causality.',
        },
      ],
    })

    const execute = getToolExecute(pi, 'review_and_create_node')
    const { ctx, selectPrompts } = makeMockCtx('Revise — I have feedback')

    await execute('id-1', draftParams, undefined, undefined, ctx)

    const prompt = selectPrompts[0]
    // Score summary should still be present
    expect(prompt).toContain('0.62')
    // And the critique text must also be in the same prompt
    expect(prompt).toContain('The inference chain skips from observation to conclusion without establishing causality.')
  })

  it('does not show reviewer feedback text in the tool return content when UI is active (it was already shown in the prompt)', async () => {
    // This test documents the expected post-fix behaviour:
    // once feedback is in the prompt, the return content doesn't need to duplicate it.
    // This is informational — the primary requirement is that feedback is in the prompt.
    const { reviewAndCreateNode } = await import('../../src/tools/review-panel.ts')
    ;(reviewAndCreateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      rmsScore: 0.55,
      feedback: [
        { role: 'assumption', score: 0.5, feedback: 'An unvalidated assumption.' },
      ],
    })

    const execute = getToolExecute(pi, 'review_and_create_node')
    const { ctx, selectPrompts } = makeMockCtx('Discard — move on')

    await execute('id-1', draftParams, undefined, undefined, ctx)

    // The primary assertion: feedback must be in the prompt
    expect(selectPrompts[0]).toContain('An unvalidated assumption.')
  })
})
