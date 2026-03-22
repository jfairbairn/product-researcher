import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'budget-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('startRun', () => {
  it('creates a run file under seeds/{seed}/runs/', async () => {
    const { startRun } = await import('../../src/tools/budget.ts')
    const { runId } = await startRun({ seed: 'my-seed', budgetUsd: 1.0 }, tmpDir)

    const content = await readFile(join(tmpDir, 'my-seed', 'runs', `${runId}.md`), 'utf-8')
    expect(content).toBeTruthy()
  })

  it('returns a run id in the format run-{date}-{n}', async () => {
    const { startRun } = await import('../../src/tools/budget.ts')
    const { runId } = await startRun({ seed: 'my-seed', budgetUsd: 1.0 }, tmpDir)

    expect(runId).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d+$/)
  })

  it('writes budget, status and seed to frontmatter', async () => {
    const { startRun } = await import('../../src/tools/budget.ts')
    const { runId } = await startRun({ seed: 'my-seed', budgetUsd: 2.5 }, tmpDir)

    const content = await readFile(join(tmpDir, 'my-seed', 'runs', `${runId}.md`), 'utf-8')
    expect(content).toMatch(/budget_usd:\s*2\.5/)
    expect(content).toMatch(/status:\s*running/)
    expect(content).toMatch(/seed:\s*my-seed/)
  })

  it('increments the run counter for the same date', async () => {
    const { startRun } = await import('../../src/tools/budget.ts')
    const { runId: first } = await startRun({ seed: 'my-seed', budgetUsd: 1.0 }, tmpDir)
    const { runId: second } = await startRun({ seed: 'my-seed', budgetUsd: 1.0 }, tmpDir)

    expect(first).not.toBe(second)
    expect(second).toMatch(/-2$/)
  })
})

describe('completeRun', () => {
  it('updates the run file status to completed', async () => {
    const { startRun, completeRun } = await import('../../src/tools/budget.ts')
    const { runId } = await startRun({ seed: 'my-seed', budgetUsd: 1.0 }, tmpDir)
    await completeRun({ seed: 'my-seed', runId, summary: 'Found 3 pain points.' }, tmpDir)

    const content = await readFile(join(tmpDir, 'my-seed', 'runs', `${runId}.md`), 'utf-8')
    expect(content).toMatch(/status:\s*completed/)
  })

  it('appends the summary to the run file body', async () => {
    const { startRun, completeRun } = await import('../../src/tools/budget.ts')
    const { runId } = await startRun({ seed: 'my-seed', budgetUsd: 1.0 }, tmpDir)
    await completeRun({ seed: 'my-seed', runId, summary: 'Found 3 pain points.' }, tmpDir)

    const content = await readFile(join(tmpDir, 'my-seed', 'runs', `${runId}.md`), 'utf-8')
    expect(content).toContain('Found 3 pain points.')
  })
})
