import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface StartRunOptions {
  seed: string
  budgetUsd: number
}

export interface StartRunResult {
  runId: string
}

export interface CompleteRunOptions {
  seed: string
  runId: string
  summary: string
}

export async function startRun(options: StartRunOptions, seedsDir: string): Promise<StartRunResult> {
  const { seed, budgetUsd } = options
  const runsDir = join(seedsDir, seed, 'runs')
  await mkdir(runsDir, { recursive: true })

  const date = new Date().toISOString().slice(0, 10)
  const runId = await nextRunId(runsDir, date)

  const content = `---
id: ${runId}
seed: ${seed}
budget_usd: ${budgetUsd}
status: running
started: ${new Date().toISOString()}
---

`
  await writeFile(join(runsDir, `${runId}.md`), content, 'utf-8')

  return { runId }
}

export async function completeRun(options: CompleteRunOptions, seedsDir: string): Promise<void> {
  const { seed, runId, summary } = options
  const runFile = join(seedsDir, seed, 'runs', `${runId}.md`)

  const raw = await readFile(runFile, 'utf-8')
  const updated = raw
    .replace(/^status:\s*running$/m, 'status: completed')
    .replace(/\n$/, `\n## Summary\n\n${summary}\n`)

  await writeFile(runFile, updated, 'utf-8')
}

async function nextRunId(runsDir: string, date: string): Promise<string> {
  let existing: string[]
  try {
    existing = await readdir(runsDir)
  } catch {
    existing = []
  }

  const prefix = `run-${date}-`
  const counts = existing
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .map((f) => parseInt(f.slice(prefix.length, -3), 10))
    .filter((n) => !isNaN(n))

  const next = counts.length > 0 ? Math.max(...counts) + 1 : 1
  return `${prefix}${next}`
}
