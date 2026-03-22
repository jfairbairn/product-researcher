import { chromium } from 'playwright'

const JINA_BASE = 'https://r.jina.ai'

export async function readPage(url: string): Promise<string> {
  const response = await fetch(`${JINA_BASE}/${url}`, {
    headers: { Accept: 'text/markdown' },
  })

  if (response.ok) {
    return response.text()
  }

  // Fall back to Playwright for 4xx/5xx
  return readPageWithPlaywright(url)
}

async function readPageWithPlaywright(url: string): Promise<string> {
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const html = await page.content()
    return htmlToText(html)
  } finally {
    await browser.close()
  }
}

function htmlToText(html: string): string {
  // Strip tags, decode common entities, collapse whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
