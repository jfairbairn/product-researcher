import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('readPage', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches via Jina Reader and returns markdown content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Example Page\n\nSome content here.',
    }))

    const { readPage } = await import('../../src/tools/read-page.ts')
    const result = await readPage('https://example.com')

    expect(result).toContain('Example Page')
    expect(result).toContain('Some content here.')
  })

  it('calls the Jina Reader URL with the target URL appended', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Content',
    })
    vi.stubGlobal('fetch', mockFetch)

    const { readPage } = await import('../../src/tools/read-page.ts')
    await readPage('https://example.com/some/page')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/some/page',
      expect.anything(),
    )
  })

  it('throws if the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    }))

    const { readPage } = await import('../../src/tools/read-page.ts')
    await expect(readPage('https://example.com')).rejects.toThrow('429')
  })
})
