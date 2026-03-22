import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

// Minimal mock of the parts of ExtensionAPI the extension uses at init time
function makeMockPi() {
  return {
    on: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
  } as unknown as ExtensionAPI
}

describe('researcher extension', () => {
  let pi: ExtensionAPI
  let setup: (pi: ExtensionAPI) => void

  beforeEach(async () => {
    // Re-import to reset module state between tests
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
    const mock = pi.on as ReturnType<typeof vi.fn>
    const events = mock.mock.calls.map((c: unknown[]) => c[0])
    expect(events).toContain('session_start')
  })

  it('registers a /research command', () => {
    setup(pi)
    const mock = pi.registerCommand as ReturnType<typeof vi.fn>
    const names = mock.mock.calls.map((c: unknown[]) => c[0])
    expect(names).toContain('research')
  })
})
