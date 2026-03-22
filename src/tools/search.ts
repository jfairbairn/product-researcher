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

    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // Brave Search result selectors
    const resultSelector = await Promise.race([
      page.waitForSelector('[data-type="web"] .snippet', { timeout: 6000 }).then(() => '[data-type="web"] .snippet'),
      page.waitForSelector('.snippet', { timeout: 6000 }).then(() => '.snippet'),
      page.waitForSelector('article', { timeout: 6000 }).then(() => 'article'),
    ]).catch(() => null)

    if (!resultSelector) {
      return []
    }

    const results = await page.$$eval(resultSelector, (nodes) =>
      nodes.map((node) => {
        const titleEl = node.querySelector('a .title, .title a, h2 a, a[href]')
        const snippetEl = node.querySelector('.snippet-description, p, .description')
        const url = titleEl
          ? (titleEl.closest('a') as HTMLAnchorElement)?.href ?? (titleEl as HTMLAnchorElement)?.href ?? ''
          : ''
        return {
          title: titleEl?.textContent?.trim() ?? '',
          url,
          snippet: snippetEl?.textContent?.trim() ?? '',
        }
      }).filter(r => r.title && r.url && !r.url.includes('brave.com'))
    )

    return results.slice(0, maxResults)
  } finally {
    await browser.close()
  }
}
