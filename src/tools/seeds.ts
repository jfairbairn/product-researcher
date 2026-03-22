import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'

export interface SeedOptions {
  slug: string
  title: string
}

export interface SeedSummary {
  slug: string
  title: string
  status: string
}

export async function createSeed(options: SeedOptions, seedsDir: string): Promise<void> {
  const { slug, title } = options
  const seedDir = join(seedsDir, slug)

  try {
    await access(seedDir)
    throw new Error(`Seed '${slug}' already exists`)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('already exists')) throw err
  }

  await mkdir(seedDir, { recursive: true })

  const seedMd = `---
slug: ${slug}
title: ${title}
status: active
created: ${new Date().toISOString().slice(0, 10)}
---

# ${title}
`

  const indexMd = `# ${title}

## Key Findings

_Nothing yet._

## Open Questions

_Nothing yet._

## Promising Directions

_Nothing yet._
`

  await writeFile(join(seedDir, 'seed.md'), seedMd, 'utf-8')
  await writeFile(join(seedDir, '_index.md'), indexMd, 'utf-8')
}

export async function listSeeds(seedsDir: string): Promise<SeedSummary[]> {
  let entries: string[]
  try {
    entries = await readdir(seedsDir)
  } catch {
    return []
  }

  const seeds: SeedSummary[] = []

  for (const entry of entries) {
    const seedFile = join(seedsDir, entry, 'seed.md')
    try {
      const content = await readFile(seedFile, 'utf-8')
      const slug = extract(content, 'slug') ?? entry
      const title = extract(content, 'title') ?? entry
      const status = extract(content, 'status') ?? 'active'
      seeds.push({ slug, title, status })
    } catch {
      // Not a seed directory, skip
    }
  }

  return seeds
}

function extract(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return match?.[1]?.trim()
}
