import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'seeds-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('createSeed', () => {
  it('creates a seed.md file under seeds/{slug}/', async () => {
    const { createSeed } = await import('../../src/tools/seeds.ts')
    await createSeed({ slug: 'ai-coding-tools', title: 'AI Coding Tools', budgetUsd: 1.0 }, tmpDir)

    const content = await readFile(join(tmpDir, 'ai-coding-tools', 'seed.md'), 'utf-8')
    expect(content).toContain('ai-coding-tools')
    expect(content).toContain('AI Coding Tools')
  })

  it('writes YAML frontmatter with slug, title, status and budget', async () => {
    const { createSeed } = await import('../../src/tools/seeds.ts')
    await createSeed({ slug: 'my-seed', title: 'My Seed', budgetUsd: 2.5 }, tmpDir)

    const content = await readFile(join(tmpDir, 'my-seed', 'seed.md'), 'utf-8')
    expect(content).toMatch(/slug:\s*my-seed/)
    expect(content).toMatch(/title:\s*My Seed/)
    expect(content).toMatch(/status:\s*active/)
    expect(content).toMatch(/budget_usd:\s*2\.5/)
  })

  it('creates an empty _index.md alongside seed.md', async () => {
    const { createSeed } = await import('../../src/tools/seeds.ts')
    await createSeed({ slug: 'my-seed', title: 'My Seed', budgetUsd: 1.0 }, tmpDir)

    const content = await readFile(join(tmpDir, 'my-seed', '_index.md'), 'utf-8')
    expect(content).toContain('My Seed')
  })

  it('throws if a seed with that slug already exists', async () => {
    const { createSeed } = await import('../../src/tools/seeds.ts')
    await createSeed({ slug: 'dupe', title: 'Dupe', budgetUsd: 1.0 }, tmpDir)

    await expect(
      createSeed({ slug: 'dupe', title: 'Dupe Again', budgetUsd: 1.0 }, tmpDir)
    ).rejects.toThrow(/already exists/)
  })
})

describe('listSeeds', () => {
  it('returns an empty array when no seeds exist', async () => {
    const { listSeeds } = await import('../../src/tools/seeds.ts')
    const seeds = await listSeeds(tmpDir)
    expect(seeds).toEqual([])
  })

  it('returns one entry per seed with slug, title and status', async () => {
    const { createSeed, listSeeds } = await import('../../src/tools/seeds.ts')
    await createSeed({ slug: 'seed-a', title: 'Seed A', budgetUsd: 1.0 }, tmpDir)
    await createSeed({ slug: 'seed-b', title: 'Seed B', budgetUsd: 2.0 }, tmpDir)

    const seeds = await listSeeds(tmpDir)
    expect(seeds).toHaveLength(2)
    expect(seeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'seed-a', title: 'Seed A', status: 'active' }),
        expect.objectContaining({ slug: 'seed-b', title: 'Seed B', status: 'active' }),
      ])
    )
  })
})
