export interface ReviewerOutput {
  score: number
  feedback: string
}

export function parseReviewerOutput(raw: string): ReviewerOutput {
  // Try direct JSON parse first
  const json = extractJson(raw)
  if (!json) {
    return { score: 0.0, feedback: `Failed to parse reviewer output: ${raw.slice(0, 200)}` }
  }

  const score = typeof json.score === 'number'
    ? Math.max(0.0, Math.min(1.0, json.score))
    : 0.0
  const feedback = typeof json.feedback === 'string' ? json.feedback : String(json.feedback ?? '')

  return { score, feedback }
}

function extractJson(raw: string): Record<string, unknown> | null {
  // 1. Try parsing the whole string (trimmed)
  const trimmed = raw.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch { /* continue */ }

  // 2. Try extracting from markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* continue */ }
  }

  // 3. Try finding a JSON object in the text
  const braceMatch = raw.match(/\{[^{}]*"score"[^{}]*\}/)
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0])
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* continue */ }
  }

  return null
}

export function parseJsonEventStream(stream: string): string {
  if (!stream.trim()) return ''

  let lastAssistantText = ''

  for (const line of stream.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        for (const part of event.message.content ?? []) {
          if (part.type === 'text') {
            lastAssistantText = part.text
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  return lastAssistantText
}
