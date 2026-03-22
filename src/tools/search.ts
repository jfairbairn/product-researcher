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

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    })

    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const results = await page.$$eval('#b_results li.b_algo', (nodes) =>
      nodes.map((node) => {
        const anchor = node.querySelector('h2 a')
        const title = anchor?.textContent?.trim() ?? ''
        // Extract real URL from Bing's redirect URL via the cite element
        const cite = node.querySelector('cite')?.textContent?.trim() ?? ''
        const href = anchor?.getAttribute('href') ?? ''
        return { title, url: href, snippet: node.querySelector('.b_caption p')?.textContent?.trim() ?? '', cite }
      })
    )

    // Resolve real URLs from Bing redirect links
    const resolved: SearchResult[] = []
    for (const r of results.slice(0, maxResults)) {
      if (!r.title) continue
      let url = r.url
      // Try to extract real URL from Bing's encoded redirect
      try {
        const match = r.url.match(/[?&]u=a1([A-Za-z0-9+/=]+)/)
        if (match) {
          url = Buffer.from(match[1], 'base64').toString('utf-8')
        }
      } catch { /* keep original */ }
      resolved.push({ title: r.title, url, snippet: r.snippet })
    }

    return resolved
  } finally {
    await browser.close()
  }
}
