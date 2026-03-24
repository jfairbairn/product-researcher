import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('searchWeb', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an array of results with title, url and snippet', async () => {
    const { searchWeb } = await import('../../src/tools/search.ts')
    // Mock fetch to return a SearXNG-style JSON response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Result One', url: 'https://example.com/1', content: 'First result snippet' },
          { title: 'Result Two', url: 'https://example.com/2', content: 'Second result snippet' },
        ],
      }),
    }))

    const results = await searchWeb('test query')

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Result One',
      url: 'https://example.com/1',
      snippet: 'First result snippet',
    })
  })

  it('calls SearXNG with the query and json format', async () => {
    const { searchWeb } = await import('../../src/tools/search.ts')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await searchWeb('my research query')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('format=json')
    expect(url).toContain('my+research+query')
  })

  it('respects a maxResults option', async () => {
    const { searchWeb } = await import('../../src/tools/search.ts')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'A', url: 'https://a.com', content: 'a' },
          { title: 'B', url: 'https://b.com', content: 'b' },
          { title: 'C', url: 'https://c.com', content: 'c' },
        ],
      }),
    }))

    const results = await searchWeb('test query', { maxResults: 2 })
    expect(results).toHaveLength(2)
  })

  it('returns empty array on fetch failure', async () => {
    const { searchWeb } = await import('../../src/tools/search.ts')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }))

    const results = await searchWeb('test query')
    expect(results).toEqual([])
  })

  it('returns empty array on network error', async () => {
    const { searchWeb } = await import('../../src/tools/search.ts')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const results = await searchWeb('test query')
    expect(results).toEqual([])
  })

  it('filters out results without title or url', async () => {
    const { searchWeb } = await import('../../src/tools/search.ts')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Good', url: 'https://good.com', content: 'good' },
          { title: '', url: 'https://empty-title.com', content: 'bad' },
          { title: 'No URL', url: '', content: 'bad' },
        ],
      }),
    }))

    const results = await searchWeb('test query')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Good')
  })
})
