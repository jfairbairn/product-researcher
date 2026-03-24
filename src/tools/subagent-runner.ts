export interface SubagentOptions {
  systemPromptFile: string
  task: string
  tools?: string[]
  model?: string
}

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

export type Spawner = (command: string, args: string[], options: { cwd: string; signal?: AbortSignal }) => Promise<SpawnResult>

export interface RunSubagentOptions {
  systemPrompt: string
  task: string
  tools?: string[]
  model?: string
  cwd?: string
  signal?: AbortSignal
  spawner?: Spawner
}

export interface SubagentResult {
  output: string
  exitCode: number
  stderr: string
}

export async function runSubagent(options: RunSubagentOptions): Promise<SubagentResult> {
  const { systemPrompt, task, tools, model, cwd = process.cwd(), signal, spawner } = options

  // Write system prompt to a temp file
  const { mkdtemp, writeFile, unlink, rmdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')

  const tmpDir = await mkdtemp(join(tmpdir(), 'pi-reviewer-'))
  const promptFile = join(tmpDir, 'prompt.md')
  await writeFile(promptFile, systemPrompt, 'utf-8')

  try {
    const piArgs = buildPiArgs({ systemPromptFile: promptFile, task, tools, model })

    const spawnFn = spawner ?? defaultSpawner
    const result = await spawnFn('pi', piArgs, { cwd, signal })

    const output = parseJsonEventStream(result.stdout)

    return {
      output,
      exitCode: result.exitCode,
      stderr: result.stderr,
    }
  } finally {
    try { await unlink(promptFile) } catch { /* ignore */ }
    try { await rmdir(tmpDir) } catch { /* ignore */ }
  }
}

async function defaultSpawner(command: string, args: string[], options: { cwd: string; signal?: AbortSignal }): Promise<SpawnResult> {
  const { spawn: nodeSpawn } = await import('node:child_process')

  return new Promise((resolve) => {
    const proc = nodeSpawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    proc.on('error', () => {
      resolve({ stdout, stderr, exitCode: 1 })
    })

    if (options.signal) {
      const kill = () => {
        proc.kill('SIGTERM')
        setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 5000)
      }
      if (options.signal.aborted) kill()
      else options.signal.addEventListener('abort', kill, { once: true })
    }
  })
}

export function buildPiArgs(options: SubagentOptions): string[] {
  const args: string[] = ['--mode', 'json', '-p', '--no-session']
  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.tools && options.tools.length > 0) {
    args.push('--tools', options.tools.join(','))
  }
  args.push('--append-system-prompt', options.systemPromptFile)
  args.push(`Task: ${options.task}`)
  return args
}

export interface ReviewerOutput {
  score: number
  feedback: string
}

export function parseReviewerOutput(raw: string): ReviewerOutput {
  // Try direct JSON parse first
  const json = extractJson(raw)
  if (!json) {
    return { score: 0.0, feedback: `Failed to parse reviewer output: ${raw.slice(0, 200)}` }
  }

  const score = typeof json.score === 'number'
    ? Math.max(0.0, Math.min(1.0, json.score))
    : 0.0
  const feedback = typeof json.feedback === 'string' ? json.feedback : String(json.feedback ?? '')

  return { score, feedback }
}

function extractJson(raw: string): Record<string, unknown> | null {
  // 1. Try parsing the whole string (trimmed)
  const trimmed = raw.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch { /* continue */ }

  // 2. Try extracting from markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* continue */ }
  }

  // 3. Try finding a JSON object in the text
  const braceMatch = raw.match(/\{[^{}]*"score"[^{}]*\}/)
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0])
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* continue */ }
  }

  return null
}

export function parseJsonEventStream(stream: string): string {
  if (!stream.trim()) return ''

  let lastAssistantText = ''

  for (const line of stream.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        for (const part of event.message.content ?? []) {
          if (part.type === 'text') {
            lastAssistantText = part.text
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  return lastAssistantText
}
