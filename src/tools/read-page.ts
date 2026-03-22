const JINA_BASE = 'https://r.jina.ai'

export async function readPage(url: string): Promise<string> {
  const response = await fetch(`${JINA_BASE}/${url}`, {
    headers: { Accept: 'text/markdown' },
  })

  if (!response.ok) {
    throw new Error(`Failed to read page: ${response.status} ${response.statusText}`)
  }

  return response.text()
}
