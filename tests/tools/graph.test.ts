import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'graph-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('createNode', () => {
  it('creates a markdown file at seeds/{seed}/{type}/{id}.md', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      { seed: 'my-seed', type: 'observation', id: 'obs-001', content: 'People hate onboarding flows.' },
      tmpDir
    )

    const content = await readFile(join(tmpDir, 'my-seed', 'observation', 'obs-001.md'), 'utf-8')
    expect(content).toContain('People hate onboarding flows.')
  })

  it('writes YAML frontmatter with id, type, seed, and created date', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      { seed: 'my-seed', type: 'hypothesis', id: 'hyp-001', content: 'Users want faster setup.' },
      tmpDir
    )

    const content = await readFile(join(tmpDir, 'my-seed', 'hypothesis', 'hyp-001.md'), 'utf-8')
    expect(content).toMatch(/id:\s*hyp-001/)
    expect(content).toMatch(/type:\s*hypothesis/)
    expect(content).toMatch(/seed:\s*my-seed/)
    expect(content).toMatch(/created:\s*\d{4}-\d{2}-\d{2}/)
  })

  it('includes optional confidence and source_url when provided', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      {
        seed: 'my-seed',
        type: 'observation',
        id: 'obs-002',
        content: 'Observed pattern.',
        confidence: 0.8,
        sourceUrl: 'https://example.com/article',
      },
      tmpDir
    )

    const content = await readFile(join(tmpDir, 'my-seed', 'observation', 'obs-002.md'), 'utf-8')
    expect(content).toMatch(/confidence:\s*0\.8/)
    expect(content).toMatch(/source_url:\s*https:\/\/example\.com\/article/)
  })

  it('includes wikilink edges when links are provided', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      {
        seed: 'my-seed',
        type: 'hypothesis',
        id: 'hyp-002',
        content: 'Derived hypothesis.',
        links: [{ relation: 'supports', target: 'obs-001' }],
      },
      tmpDir
    )

    const content = await readFile(join(tmpDir, 'my-seed', 'hypothesis', 'hyp-002.md'), 'utf-8')
    expect(content).toContain('supports: "[[obs-001]]"')
  })

  it('throws if a node with that id already exists', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      { seed: 'my-seed', type: 'observation', id: 'obs-001', content: 'First.' },
      tmpDir
    )
    await expect(
      createNode({ seed: 'my-seed', type: 'observation', id: 'obs-001', content: 'Dupe.' }, tmpDir)
    ).rejects.toThrow(/already exists/)
  })
})

describe('createNode — additional node types', () => {
  it('creates an assumption node', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      { seed: 'my-seed', type: 'assumption', id: 'asm-001', content: 'Sony take rate is non-negotiable.' },
      tmpDir
    )
    const content = await readFile(join(tmpDir, 'my-seed', 'assumption', 'asm-001.md'), 'utf-8')
    expect(content).toMatch(/type:\s*assumption/)
    expect(content).toContain('Sony take rate is non-negotiable.')
  })

  it('creates a persona node', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      { seed: 'my-seed', type: 'persona', id: 'persona-001', content: 'Power AI subscriber.' },
      tmpDir
    )
    const content = await readFile(join(tmpDir, 'my-seed', 'persona', 'persona-001.md'), 'utf-8')
    expect(content).toMatch(/type:\s*persona/)
    expect(content).toContain('Power AI subscriber.')
  })

  it('creates a risk node with probability, severity, and status in frontmatter', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      {
        seed: 'my-seed',
        type: 'risk',
        id: 'risk-001',
        content: 'USB latency exceeds target.',
        probability: 0.4,
        severity: 'high',
        status: 'open',
      },
      tmpDir
    )
    const content = await readFile(join(tmpDir, 'my-seed', 'risk', 'risk-001.md'), 'utf-8')
    expect(content).toMatch(/type:\s*risk/)
    expect(content).toMatch(/probability:\s*0\.4/)
    expect(content).toMatch(/severity:\s*high/)
    expect(content).toMatch(/status:\s*open/)
    expect(content).toContain('USB latency exceeds target.')
  })

  it('creates a market_signal node with signal_type in frontmatter', async () => {
    const { createNode } = await import('../../src/tools/graph.ts')
    await createNode(
      {
        seed: 'my-seed',
        type: 'market_signal',
        id: 'sig-001',
        content: 'r/LocalLLaMA grew 100% in a year.',
        signalType: 'community_growth',
      },
      tmpDir
    )
    const content = await readFile(join(tmpDir, 'my-seed', 'market_signal', 'sig-001.md'), 'utf-8')
    expect(content).toMatch(/type:\s*market_signal/)
    expect(content).toMatch(/signal_type:\s*community_growth/)
    expect(content).toContain('r/LocalLLaMA grew 100% in a year.')
  })
})

describe('queryGraph', () => {
  it('returns an empty array when no nodes exist', async () => {
    const { queryGraph } = await import('../../src/tools/graph.ts')
    const nodes = await queryGraph({ seed: 'my-seed' }, tmpDir)
    expect(nodes).toEqual([])
  })

  it('returns all nodes for a seed', async () => {
    const { createNode, queryGraph } = await import('../../src/tools/graph.ts')
    await createNode({ seed: 'my-seed', type: 'observation', id: 'obs-001', content: 'A' }, tmpDir)
    await createNode({ seed: 'my-seed', type: 'hypothesis', id: 'hyp-001', content: 'B' }, tmpDir)

    const nodes = await queryGraph({ seed: 'my-seed' }, tmpDir)
    expect(nodes).toHaveLength(2)
  })

  it('filters nodes by type when type is provided', async () => {
    const { createNode, queryGraph } = await import('../../src/tools/graph.ts')
    await createNode({ seed: 'my-seed', type: 'observation', id: 'obs-001', content: 'A' }, tmpDir)
    await createNode({ seed: 'my-seed', type: 'hypothesis', id: 'hyp-001', content: 'B' }, tmpDir)

    const nodes = await queryGraph({ seed: 'my-seed', type: 'observation' }, tmpDir)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('obs-001')
  })

  it('returns nodes with id, type, and content fields', async () => {
    const { createNode, queryGraph } = await import('../../src/tools/graph.ts')
    await createNode({ seed: 'my-seed', type: 'observation', id: 'obs-001', content: 'Test content.' }, tmpDir)

    const nodes = await queryGraph({ seed: 'my-seed' }, tmpDir)
    expect(nodes[0]).toMatchObject({ id: 'obs-001', type: 'observation', content: 'Test content.' })
  })
})
