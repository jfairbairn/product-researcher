import { describe, it, expect } from 'vitest'

describe('getReviewersForNodeType', () => {
  // (existing tests below)
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

describe('buildReviewerTask', () => {
  const draftNode = {
    seed: 'test-seed',
    type: 'hypothesis' as const,
    id: 'hyp-001',
    title: 'Users prefer local AI',
    content: 'Users with high AI spend prefer local inference to reduce monthly costs.',
    confidence: 0.75,
    links: [{ relation: 'supports', target: 'obs-001' }],
  }
  const seedContext = '# Test Seed\n\n## Key Findings\n\nSome prior research here.'

  it('includes the draft node content in the task', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('Users with high AI spend prefer local inference')
  })

  it('includes the draft node title in the task', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('Users prefer local AI')
  })

  it('includes seed context', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('Some prior research here.')
  })

  it('asks for JSON output with score and feedback fields', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('"score"')
    expect(task).toContain('"feedback"')
  })

  it('includes node type and id metadata', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('hyp-001')
    expect(task).toContain('hypothesis')
  })

  it('includes linked node references', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('obs-001')
  })

  it('includes confidence when present', async () => {
    const { buildReviewerTask } = await import('../../src/tools/reviewers.ts')
    const task = buildReviewerTask('assumption', draftNode, seedContext)
    expect(task).toContain('0.75')
  })
})
