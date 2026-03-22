import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function setup(pi: ExtensionAPI): void {
  pi.on('session_start', async () => {
    // researcher extension loaded
  })

  pi.registerCommand('research', 'Run a research session against a seed', async () => {
    // TODO: implement research command
  })
}
