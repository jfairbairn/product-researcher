export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchOptions {
  maxResults?: number
}

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://127.0.0.1:8888'

export async function searchWeb(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const { maxResults = 10 } = options

  try {
    const params = new URLSearchParams({ q: query, format: 'json' })
    const response = await fetch(`${SEARXNG_URL}/search?${params}`)

    if (!response.ok) return []

    const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> }
    const results = (data.results ?? [])
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        snippet: r.content ?? '',
      }))

    return results.slice(0, maxResults)
  } catch {
    return []
  }
}
