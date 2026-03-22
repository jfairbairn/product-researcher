import { chromium } from 'playwright'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchOptions {
  maxResults?: number
}

export async function searchWeb(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const { maxResults = 10 } = options

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kp=-1`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="result"]', { timeout: 10000 })

    const results = await page.$$eval('[data-testid="result"]', (nodes) =>
      nodes.map((node) => {
        const titleEl = node.querySelector('[data-testid="result-title-a"]')
        const snippetEl = node.querySelector('[data-result="snippet"]')
        return {
          title: titleEl?.textContent?.trim() ?? '',
          url: titleEl?.getAttribute('href') ?? '',
          snippet: snippetEl?.textContent?.trim() ?? '',
        }
      })
    )

    return results.slice(0, maxResults)
  } finally {
    await browser.close()
  }
}
