import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('playwright', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html><body><h1>Fallback Page</h1><p>Playwright content.</p></body></html>'),
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

// Import once — no resetModules needed since playwright mock is module-level
const { readPage } = await import('../../src/tools/read-page.ts')
const playwright = await import('playwright')

describe('readPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('fetches via Jina Reader and returns markdown content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Example Page\n\nSome content here.',
    }))

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

    await readPage('https://example.com/some/page')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/some/page',
      expect.anything(),
    )
  })

  it('falls back to Playwright when Jina returns 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }))

    const result = await readPage('https://example.com')

    expect(playwright.chromium.launch).toHaveBeenCalled()
    expect((playwright as any)._mockPage.goto).toHaveBeenCalledWith(
      'https://example.com',
      expect.anything(),
    )
    expect(result).toContain('Fallback Page')
  })

  it('falls back to Playwright when Jina returns 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }))

    await readPage('https://example.com')

    expect(playwright.chromium.launch).toHaveBeenCalled()
  })

  it('closes the Playwright browser after fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 451,
      statusText: 'Unavailable For Legal Reasons',
    }))

    await readPage('https://example.com')

    expect((playwright as any)._mockBrowser.close).toHaveBeenCalled()
  })
})
