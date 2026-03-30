import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

describe('review_and_create_node execute behaviour', () => {
  let tmpDir: string
  let setup: (pi: ExtensionAPI) => void
  let pi: ExtensionAPI

  beforeEach(async () => {
    vi.resetModules()

    tmpDir = await mkdtemp(join(tmpdir(), 'ext-review-test-'))
    await mkdir(join(tmpDir, 'test-seed'), { recursive: true })
    await writeFile(join(tmpDir, 'test-seed', '_index.md'), '# Test Seed', 'utf-8')

    // Mock reviewAndCreateNode so the test doesn't spin up subagents
    vi.doMock('../src/tools/review-panel.ts', () => ({
      reviewAndCreateNode: vi.fn().mockResolvedValue({
        passed: true,
        rmsScore: 0.85,
        feedback: [{ role: 'assumption', score: 0.85, feedback: 'Looks solid.' }],
      }),
    }))

    // Mock graph so createNode is trackable
    vi.doMock('../src/tools/graph.ts', () => ({
      createNode: vi.fn().mockResolvedValue(undefined),
      queryGraph: vi.fn().mockResolvedValue([]),
      createReview: vi.fn().mockResolvedValue(undefined),
      queryReviews: vi.fn().mockResolvedValue([]),
    }))

    const mod = await import('../src/extension.ts')
    setup = mod.default

    pi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmpDir, { recursive: true, force: true })
  })

  function getExecute(toolName: string) {
    setup(pi)
    const calls = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls
    const toolCall = calls.find((c) => c[0].name === toolName)
    if (!toolCall) throw new Error(`Tool '${toolName}' not registered`)
    return toolCall[0].execute as (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>
  }

  const draftParams = {
    seed: 'test-seed',
    type: 'hypothesis' as const,
    id: 'hyp-001',
    title: 'Test hypothesis',
    content: 'This is the hypothesis body.',
    confidence: 0.7,
  }

  it('returns reviewer feedback in the response text', async () => {
    const execute = getExecute('review_and_create_node')
    // Pass a fake cwd pointing at tmpDir so the tool finds the seed
    const result = await execute('call-1', { ...draftParams }, undefined, undefined, {
      hasUI: false,
      cwd: tmpDir,
    })
    const text = result.content[0].text
    expect(text).toContain('assumption')
    expect(text).toContain('Looks solid.')
  })

  it('instructs the AI to present feedback to the user and wait before saving', async () => {
    const execute = getExecute('review_and_create_node')
    const result = await execute('call-1', { ...draftParams }, undefined, undefined, {
      hasUI: false,
      cwd: tmpDir,
    })
    const text = result.content[0].text
    // Should tell the AI to stop and check with the user
    expect(text.toLowerCase()).toMatch(/present|show|ask the user|check with/)
    expect(text.toLowerCase()).toMatch(/save|revise|discard/)
    expect(text.toLowerCase()).toMatch(/wait|before/)
  })

  it('does NOT save the node to disk in the headless (no UI) path', async () => {
    const { createNode } = await import('../src/tools/graph.ts')
    const execute = getExecute('review_and_create_node')

    await execute('call-1', { ...draftParams }, undefined, undefined, {
      hasUI: false,
      cwd: tmpDir,
    })
    expect(createNode).not.toHaveBeenCalled()
  })

  it('calls ui.select with plain strings, not objects', async () => {
    const execute = getExecute('review_and_create_node')
    const selectMock = vi.fn().mockResolvedValue('Discard — move on')

    await execute('call-2', { ...draftParams }, undefined, undefined, {
      hasUI: true,
      ui: { select: selectMock, input: vi.fn().mockResolvedValue('') },
      cwd: tmpDir,
    })

    expect(selectMock).toHaveBeenCalledOnce()
    const options = selectMock.mock.calls[0][1] as unknown[]
    // Every option must be a plain string — NOT an object like { label, value }
    expect(options.every((o) => typeof o === 'string')).toBe(true)
  })

  it('DOES save the node when the user picks Save via the UI select prompt', async () => {
    const { createNode } = await import('../src/tools/graph.ts')
    const execute = getExecute('review_and_create_node')

    await execute('call-3', { ...draftParams }, undefined, undefined, {
      hasUI: true,
      ui: { select: vi.fn().mockResolvedValue('Save'), input: vi.fn().mockResolvedValue('') },
      cwd: tmpDir,
    })
    expect(createNode).toHaveBeenCalledOnce()
  })

  it('does NOT save when the user picks Discard via the UI select prompt', async () => {
    const { createNode } = await import('../src/tools/graph.ts')
    const execute = getExecute('review_and_create_node')

    await execute('call-4', { ...draftParams }, undefined, undefined, {
      hasUI: true,
      ui: { select: vi.fn().mockResolvedValue('Discard — move on'), input: vi.fn().mockResolvedValue('') },
      cwd: tmpDir,
    })
    expect(createNode).not.toHaveBeenCalled()
  })
})
