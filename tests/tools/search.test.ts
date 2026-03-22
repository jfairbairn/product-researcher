import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock playwright so tests don't spin up a real browser
vi.mock('playwright', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
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
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
    _mockPage: mockPage,
    _mockBrowser: mockBrowser,
  }
})

describe('searchWeb', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns an array of results with title, url and snippet', async () => {
    const playwright = await import('playwright')
    const mockPage = (playwright as any)._mockPage

    mockPage.$$eval.mockResolvedValue([
      { title: 'Result One', url: 'https://example.com/1', snippet: 'First result snippet' },
      { title: 'Result Two', url: 'https://example.com/2', snippet: 'Second result snippet' },
    ])

    const { searchWeb } = await import('../../src/tools/search.ts')
    const results = await searchWeb('test query')

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Result One',
      url: 'https://example.com/1',
      snippet: 'First result snippet',
    })
  })

  it('launches a headless browser', async () => {
    const playwright = await import('playwright')
    const mockPage = (playwright as any)._mockPage
    mockPage.$$eval.mockResolvedValue([])

    const { searchWeb } = await import('../../src/tools/search.ts')
    await searchWeb('test query')

    expect(playwright.chromium.launch).toHaveBeenCalledWith({ headless: true })
  })

  it('searches DuckDuckGo with the given query', async () => {
    const playwright = await import('playwright')
    const mockPage = (playwright as any)._mockPage
    mockPage.$$eval.mockResolvedValue([])

    const { searchWeb } = await import('../../src/tools/search.ts')
    await searchWeb('my research query')

    expect(mockPage.goto).toHaveBeenCalledWith(
      expect.stringContaining('duckduckgo.com'),
      expect.anything(),
    )
  })

  it('closes the browser after searching', async () => {
    const playwright = await import('playwright')
    const mockPage = (playwright as any)._mockPage
    const mockBrowser = (playwright as any)._mockBrowser
    mockPage.$$eval.mockResolvedValue([])

    const { searchWeb } = await import('../../src/tools/search.ts')
    await searchWeb('test query')

    expect(mockBrowser.close).toHaveBeenCalled()
  })

  it('respects a maxResults option', async () => {
    const playwright = await import('playwright')
    const mockPage = (playwright as any)._mockPage
    mockPage.$$eval.mockResolvedValue([
      { title: 'A', url: 'https://a.com', snippet: 'a' },
      { title: 'B', url: 'https://b.com', snippet: 'b' },
      { title: 'C', url: 'https://c.com', snippet: 'c' },
    ])

    const { searchWeb } = await import('../../src/tools/search.ts')
    const results = await searchWeb('test query', { maxResults: 2 })

    expect(results).toHaveLength(2)
  })
})
