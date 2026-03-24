import { describe, it, expect } from 'vitest'

describe('getReviewersForNodeType', () => {
  it('returns ["assumption"] for observation', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('observation')).toEqual(['assumption'])
  })

  it('returns ["assumption", "counterpoint", "logic"] for hypothesis', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('hypothesis')).toEqual(['assumption', 'counterpoint', 'logic'])
  })

  it('returns ["assumption", "counterpoint", "logic"] for conjecture', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('conjecture')).toEqual(['assumption', 'counterpoint', 'logic'])
  })

  it('returns all four reviewers for product_plan', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('product_plan')).toEqual(['assumption', 'counterpoint', 'logic', 'failure_mode'])
  })

  it('returns [] for existing_solution', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('existing_solution')).toEqual([])
  })

  it('returns ["assumption"] for pain_point', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('pain_point')).toEqual(['assumption'])
  })

  it('returns ["logic"] for validation_strategy', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('validation_strategy')).toEqual(['logic'])
  })

  it('returns ["counterpoint"] for assumption', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('assumption')).toEqual(['counterpoint'])
  })

  it('returns ["assumption"] for persona', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('persona')).toEqual(['assumption'])
  })

  it('returns ["logic"] for risk', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('risk')).toEqual(['logic'])
  })

  it('returns ["assumption"] for market_signal', async () => {
    const { getReviewersForNodeType } = await import('../../src/tools/reviewers.ts')
    expect(getReviewersForNodeType('market_signal')).toEqual(['assumption'])
  })
})
