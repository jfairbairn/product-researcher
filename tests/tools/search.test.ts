import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('playwright', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({}),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    $$eval: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return {
    chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
    _mockPage: mockPage,
    _mockBrowser: mockBrowser,
  }
})

const { searchWeb } = await import('../../src/tools/search.ts')
const playwright = await import('playwright')

describe('searchWeb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset waitForSelector to resolve by default
    ;(playwright as any)._mockPage.waitForSelector.mockResolvedValue({})
  })

  it('returns an array of results with title, url and snippet', async () => {
    const mockPage = (playwright as any)._mockPage
    mockPage.$$eval.mockResolvedValue([
      { title: 'Result One', url: 'https://example.com/1', snippet: 'First result snippet' },
      { title: 'Result Two', url: 'https://example.com/2', snippet: 'Second result snippet' },
    ])

    const results = await searchWeb('test query')

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Result One',
      url: 'https://example.com/1',
      snippet: 'First result snippet',
    })
  })

  it('launches a headless browser with anti-detection', async () => {
    ;(playwright as any)._mockPage.$$eval.mockResolvedValue([])
    await searchWeb('test query')
    expect(playwright.chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true })
    )
  })

  it('searches DuckDuckGo with the given query', async () => {
    ;(playwright as any)._mockPage.$$eval.mockResolvedValue([])
    await searchWeb('my research query')
    expect((playwright as any)._mockPage.goto).toHaveBeenCalledWith(
      expect.stringContaining('brave.com'),
      expect.anything(),
    )
  })

  it('closes the browser after searching', async () => {
    ;(playwright as any)._mockPage.$$eval.mockResolvedValue([])
    await searchWeb('test query')
    expect((playwright as any)._mockBrowser.close).toHaveBeenCalled()
  })

  it('respects a maxResults option', async () => {
    ;(playwright as any)._mockPage.$$eval.mockResolvedValue([
      { title: 'A', url: 'https://a.com', snippet: 'a' },
      { title: 'B', url: 'https://b.com', snippet: 'b' },
      { title: 'C', url: 'https://c.com', snippet: 'c' },
    ])
    const results = await searchWeb('test query', { maxResults: 2 })
    expect(results).toHaveLength(2)
  })

  it('returns empty array if no results selector found', async () => {
    ;(playwright as any)._mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'))
    const results = await searchWeb('test query')
    expect(results).toEqual([])
  })
})
