import { describe, it, expect } from 'vitest'

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
