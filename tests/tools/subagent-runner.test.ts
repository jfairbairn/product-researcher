import { describe, it, expect, vi } from 'vitest'

describe('parseReviewerOutput', () => {
  it('extracts score and feedback from valid JSON', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const result = parseReviewerOutput('{"score": 0.85, "feedback": "Looks solid."}')
    expect(result).toEqual({ score: 0.85, feedback: 'Looks solid.' })
  })

  it('extracts JSON from markdown-fenced output', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const input = 'Here is my review:\n```json\n{"score": 0.6, "feedback": "Missing evidence."}\n```\nDone.'
    const result = parseReviewerOutput(input)
    expect(result).toEqual({ score: 0.6, feedback: 'Missing evidence.' })
  })

  it('returns score 0.0 and error message for unparseable output', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const result = parseReviewerOutput('This is not JSON at all')
    expect(result.score).toBe(0.0)
    expect(result.feedback).toContain('Failed to parse')
  })

  it('clamps score above 1.0 to 1.0', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const result = parseReviewerOutput('{"score": 1.5, "feedback": "Over-enthusiastic."}')
    expect(result.score).toBe(1.0)
  })

  it('clamps score below 0.0 to 0.0', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const result = parseReviewerOutput('{"score": -0.3, "feedback": "Negative."}')
    expect(result.score).toBe(0.0)
  })

  it('handles JSON with extra whitespace and newlines in feedback', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const input = '  { "score" : 0.7 , "feedback" : "Line one.\\nLine two." }  '
    const result = parseReviewerOutput(input)
    expect(result.score).toBe(0.7)
    expect(result.feedback).toContain('Line one.')
  })

  it('handles JSON embedded in surrounding prose without fences', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const input = 'After careful review:\n{"score": 0.55, "feedback": "Weak evidence."}\nThat is all.'
    const result = parseReviewerOutput(input)
    expect(result.score).toBe(0.55)
    expect(result.feedback).toBe('Weak evidence.')
  })

  it('returns score 0.0 when JSON is valid but missing score field', async () => {
    const { parseReviewerOutput } = await import('../../src/tools/subagent-runner.ts')
    const result = parseReviewerOutput('{"feedback": "No score given."}')
    expect(result.score).toBe(0.0)
    expect(result.feedback).toContain('No score given.')
  })
})

describe('parseJsonEventStream', () => {
  it('extracts final assistant text from NDJSON events', async () => {
    const { parseJsonEventStream } = await import('../../src/tools/subagent-runner.ts')
    const lines = [
      JSON.stringify({ type: 'message_end', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'world' }] } }),
    ].join('\n')
    expect(parseJsonEventStream(lines)).toBe('world')
  })

  it('returns empty string for empty stream', async () => {
    const { parseJsonEventStream } = await import('../../src/tools/subagent-runner.ts')
    expect(parseJsonEventStream('')).toBe('')
  })

  it('returns empty string when stream has no assistant text', async () => {
    const { parseJsonEventStream } = await import('../../src/tools/subagent-runner.ts')
    const lines = [
      JSON.stringify({ type: 'tool_result_end', message: { role: 'toolResult', content: [{ type: 'text', text: 'tool output' }] } }),
    ].join('\n')
    expect(parseJsonEventStream(lines)).toBe('')
  })

  it('returns the last assistant message when multiple exist', async () => {
    const { parseJsonEventStream } = await import('../../src/tools/subagent-runner.ts')
    const lines = [
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'first' }] } }),
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] } }),
    ].join('\n')
    expect(parseJsonEventStream(lines)).toBe('second')
  })

  it('skips malformed JSON lines gracefully', async () => {
    const { parseJsonEventStream } = await import('../../src/tools/subagent-runner.ts')
    const lines = [
      'not json',
      JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }),
      '}{bad',
    ].join('\n')
    expect(parseJsonEventStream(lines)).toBe('ok')
  })
})

describe('runSubagent', () => {
  it('builds correct pi args from options', async () => {
    const { buildPiArgs } = await import('../../src/tools/subagent-runner.ts')
    const args = buildPiArgs({
      systemPromptFile: '/tmp/prompt.md',
      task: 'Review this node',
      tools: ['read', 'grep', 'find', 'ls'],
      model: 'claude-sonnet-4-6',
    })
    expect(args).toContain('--mode')
    expect(args).toContain('json')
    expect(args).toContain('-p')
    expect(args).toContain('--no-session')
    expect(args).toContain('--model')
    expect(args).toContain('claude-sonnet-4-6')
    expect(args).toContain('--tools')
    expect(args).toContain('read,grep,find,ls')
    expect(args).toContain('--append-system-prompt')
    expect(args).toContain('/tmp/prompt.md')
    // Task should be the last argument
    expect(args[args.length - 1]).toBe('Task: Review this node')
  })

  it('omits --model when not specified', async () => {
    const { buildPiArgs } = await import('../../src/tools/subagent-runner.ts')
    const args = buildPiArgs({
      systemPromptFile: '/tmp/prompt.md',
      task: 'Do something',
    })
    expect(args).not.toContain('--model')
  })

  it('omits --tools when not specified', async () => {
    const { buildPiArgs } = await import('../../src/tools/subagent-runner.ts')
    const args = buildPiArgs({
      systemPromptFile: '/tmp/prompt.md',
      task: 'Do something',
    })
    expect(args).not.toContain('--tools')
  })
})

describe('runSubagent', () => {
  it('returns parsed output from a successful subprocess', async () => {
    const { runSubagent } = await import('../../src/tools/subagent-runner.ts')

    const assistantEvent = JSON.stringify({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: '{"score": 0.85, "feedback": "Good."}' }] }
    })

    const result = await runSubagent({
      systemPrompt: 'You are a reviewer.',
      task: 'Review this.',
      cwd: '/tmp',
      spawner: async () => ({ stdout: assistantEvent + '\n', stderr: '', exitCode: 0 }),
    })

    expect(result.output).toBe('{"score": 0.85, "feedback": "Good."}')
    expect(result.exitCode).toBe(0)
  })

  it('returns stderr and exit code on failure', async () => {
    const { runSubagent } = await import('../../src/tools/subagent-runner.ts')

    const result = await runSubagent({
      systemPrompt: 'You are a reviewer.',
      task: 'Review this.',
      cwd: '/tmp',
      spawner: async () => ({ stdout: '', stderr: 'pi: command not found', exitCode: 127 }),
    })

    expect(result.exitCode).toBe(127)
    expect(result.output).toBe('')
  })
})
