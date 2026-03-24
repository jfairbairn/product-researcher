export function calculateRmsScore(scores: number[]): number {
  if (scores.length === 0) return 0
  const sumSquares = scores.reduce((sum, s) => sum + s * s, 0)
  return Math.sqrt(sumSquares / scores.length)
}
