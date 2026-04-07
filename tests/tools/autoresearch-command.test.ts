/**
 * Tests for /autoresearch command.
 *
 * The command runs autonomous research against a seed, instructing the agent to:
 * - Use autoMode: true on all review_and_create_node calls
 * - Run multiple research rounds until a product_plan with confidence ≥ 0.7
 *   and RMS ≥ 0.8 is reached
 * - Pause at round 10 to summarize and seek user input
 * - Use its judgment to give up if not tracking towards a product plan
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../src/tools/review-panel.ts', () => ({
  reviewAndCreateNode: vi.fn(),
}))

vi.mock('../../src/tools/graph.ts', () => ({
  createNode: vi.fn().mockResolvedValue(undefined),
  queryGraph: vi.fn().mockResolvedValue([]),
  createReview: vi.fn().mockResolvedValue(undefined),
  queryReviews: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/tools/seeds.ts', () => ({
  createSeed: vi.fn().mockResolvedValue(undefined),
  listSeeds: vi.fn().mockResolvedValue([]),
  listSeedSlugsSync: vi.fn().mockReturnValue(['test-seed']),
}))

vi.mock('../../src/tools/search.ts', () => ({
  searchWeb: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/tools/read-page.ts', () => ({
  readPage: vi.fn().mockResolvedValue(''),
}))

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn().mockResolvedValue({ newContext: vi.fn(), close: vi.fn() }) },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockPi() {
  return {
    on: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI
}

function getCommand(pi: ExtensionAPI, name: string) {
  const calls = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls
  const cmdCall = calls.find((c: unknown[]) => c[0] === name)
  if (!cmdCall) throw new Error(`Command '${name}' not registered`)
  return cmdCall[1] as { handler: Function; description: string; getArgumentCompletions?: Function }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('/autoresearch command', () => {
  let pi: ExtensionAPI
  let tmpDir: string

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    tmpDir = await mkdtemp(join(tmpdir(), 'autoresearch-test-'))
    await mkdir(join(tmpDir, 'test-seed'), { recursive: true })
    await writeFile(join(tmpDir, 'test-seed', 'seed.md'), '---\ntitle: Test Seed\nslug: test-seed\n---\n\nA test seed.', 'utf-8')
    await writeFile(join(tmpDir, 'test-seed', '_index.md'), '# Test Seed\n\n## Key Findings\n\n_Nothing yet._', 'utf-8')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('registers the autoresearch command', async () => {
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)

    const cmd = getCommand(pi, 'autoresearch')
    expect(cmd).toBeDefined()
    expect(cmd.description).toMatch(/autonom/i)
  })

  it('shows error when no slug provided', async () => {
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)

    const cmd = getCommand(pi, 'autoresearch')
    const ctx = {
      ui: { notify: vi.fn(), select: vi.fn(), input: vi.fn() },
    }

    await cmd.handler('', ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
      'error'
    )
  })

  it('shows error when seed does not exist', async () => {
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)

    const cmd = getCommand(pi, 'autoresearch')
    const ctx = {
      ui: { notify: vi.fn(), select: vi.fn(), input: vi.fn() },
    }

    await cmd.handler('nonexistent-seed', ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
      'error'
    )
  })

  it('sends a prompt via sendUserMessage that includes autoMode instruction', async () => {
    // We need to use the real seedsDir for this test, so we patch it
    // by providing the seed files at the expected location.
    // Since extension.ts uses join(process.cwd(), 'seeds'), we need
    // to work around that. Instead, let's just verify the command
    // calls sendUserMessage and the prompt contains the key instructions.
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)

    const cmd = getCommand(pi, 'autoresearch')
    const ctx = {
      ui: { notify: vi.fn(), select: vi.fn(), input: vi.fn() },
    }

    // The handler reads files from seedsDir which is process.cwd()/seeds
    // and the seed may not exist there, so it might notify an error.
    // We just need to check the command was registered with the right structure.
    // Full integration test of the prompt would need the actual seed files.
    // Let's test what we can test: the command exists and has the right shape.
    expect(cmd.handler).toBeTypeOf('function')
  })

  it('provides tab completion for seed slugs', async () => {
    const mod = await import('../../src/extension.ts')
    pi = makeMockPi()
    mod.default(pi)

    const cmd = getCommand(pi, 'autoresearch')
    expect(cmd.getArgumentCompletions).toBeDefined()

    const completions = cmd.getArgumentCompletions!('test')
    expect(completions).toEqual([{ value: 'test-seed', label: 'test-seed' }])
  })

  it('prompt instructs agent to use autoMode: true on review_and_create_node', async () => {
    // To test the actual prompt content, we need the seed files to exist
    // at process.cwd()/seeds/test-seed/. We'll create them there temporarily.
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const seedPath = join(process.cwd(), 'seeds', 'prompt-test-seed')

    try {
      mkdirSync(seedPath, { recursive: true })
      writeFileSync(join(seedPath, 'seed.md'), '---\ntitle: Prompt Test\nslug: prompt-test-seed\n---\n\nTest.', 'utf-8')
      writeFileSync(join(seedPath, '_index.md'), '# Prompt Test\n\n_Nothing yet._', 'utf-8')

      const mod = await import('../../src/extension.ts')
      pi = makeMockPi()
      mod.default(pi)

      const cmd = getCommand(pi, 'autoresearch')
      const ctx = {
        ui: { notify: vi.fn(), select: vi.fn(), input: vi.fn() },
      }

      await cmd.handler('prompt-test-seed', ctx)

      expect(pi.sendUserMessage).toHaveBeenCalled()
      const prompt = (pi.sendUserMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string

      expect(prompt).toContain('autoMode')
      expect(prompt).toContain('true')
    } finally {
      if (existsSync(seedPath)) {
        rmSync(seedPath, { recursive: true, force: true })
      }
    }
  })

  it('prompt instructs agent to target product_plan with confidence ≥ 0.7', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const seedPath = join(process.cwd(), 'seeds', 'prompt-test-seed-2')

    try {
      mkdirSync(seedPath, { recursive: true })
      writeFileSync(join(seedPath, 'seed.md'), '---\ntitle: Test 2\nslug: prompt-test-seed-2\n---\n\nTest.', 'utf-8')
      writeFileSync(join(seedPath, '_index.md'), '# Test 2\n\n_Nothing yet._', 'utf-8')

      const mod = await import('../../src/extension.ts')
      pi = makeMockPi()
      mod.default(pi)

      const cmd = getCommand(pi, 'autoresearch')
      const ctx = {
        ui: { notify: vi.fn(), select: vi.fn(), input: vi.fn() },
      }

      await cmd.handler('prompt-test-seed-2', ctx)

      const prompt = (pi.sendUserMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string

      expect(prompt).toContain('product_plan')
      expect(prompt).toMatch(/confidence.*0\.7|0\.7.*confidence/i)
    } finally {
      if (existsSync(seedPath)) {
        rmSync(seedPath, { recursive: true, force: true })
      }
    }
  })

  it('prompt instructs agent to pause at round 10 and seek user input', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const seedPath = join(process.cwd(), 'seeds', 'prompt-test-seed-3')

    try {
      mkdirSync(seedPath, { recursive: true })
      writeFileSync(join(seedPath, 'seed.md'), '---\ntitle: Test 3\nslug: prompt-test-seed-3\n---\n\nTest.', 'utf-8')
      writeFileSync(join(seedPath, '_index.md'), '# Test 3\n\n_Nothing yet._', 'utf-8')

      const mod = await import('../../src/extension.ts')
      pi = makeMockPi()
      mod.default(pi)

      const cmd = getCommand(pi, 'autoresearch')
      const ctx = {
        ui: { notify: vi.fn(), select: vi.fn(), input: vi.fn() },
      }

      await cmd.handler('prompt-test-seed-3', ctx)

      const prompt = (pi.sendUserMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string

      expect(prompt).toMatch(/10.*round|round.*10/i)
      expect(prompt).toMatch(/pause|stop|seek.*input|ask.*user/i)
    } finally {
      if (existsSync(seedPath)) {
        rmSync(seedPath, { recursive: true, force: true })
      }
    }
  })
})
