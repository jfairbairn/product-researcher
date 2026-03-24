import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn().mockResolvedValue({ newContext: vi.fn(), close: vi.fn() }) },
}))

function makeMockPi() {
  return {
    on: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI
}

describe('researcher extension', () => {
  let pi: ExtensionAPI
  let setup: (pi: ExtensionAPI) => void

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../src/extension.ts')
    setup = mod.default
    pi = makeMockPi()
  })

  it('exports a default function', () => {
    expect(typeof setup).toBe('function')
  })

  it('subscribes to session_start', () => {
    setup(pi)
    const events = (pi.on as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(events).toContain('session_start')
  })

  it('registers a /research command', () => {
    setup(pi)
    const names = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(names).toContain('research')
  })

  const expectedTools = [
    'search_web',
    'read_page',
    'create_seed',
    'list_seeds',
    'create_node',
    'query_graph',
    'create_review',
    'query_reviews',
    'review_and_create_node',
  ]

  for (const tool of expectedTools) {
    it(`registers the ${tool} tool`, () => {
      setup(pi)
      const names = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].name)
      expect(names).toContain(tool)
    })
  }

  it('registers a /review command', () => {
    setup(pi)
    const names = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(names).toContain('review')
  })

  it('registers a /seed command', () => {
    setup(pi)
    const names = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(names).toContain('seed')
  })

  it('/research command has getArgumentCompletions', () => {
    setup(pi)
    const calls = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls
    const researchCmd = calls.find((c) => c[0] === 'research')
    expect(researchCmd).toBeDefined()
    expect(typeof researchCmd![1].getArgumentCompletions).toBe('function')
  })

  it('/review command has getArgumentCompletions', () => {
    setup(pi)
    const calls = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls
    const reviewCmd = calls.find((c) => c[0] === 'review')
    expect(reviewCmd).toBeDefined()
    expect(typeof reviewCmd![1].getArgumentCompletions).toBe('function')
  })
})
