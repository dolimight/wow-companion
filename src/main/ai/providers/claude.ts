import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { failureLine, findExecutable, launcherFor, runCli } from '../cli'
import type { AiProvider } from '../types'

/** Where Anthropic's native installer puts the CLI when it isn't on PATH */
const installDirs = () => [path.join(os.homedir(), '.local', 'bin')]

const statusSchema = z.object({ loggedIn: z.boolean(), authMethod: z.string().optional() }).loose()
const answerSchema = z.object({ is_error: z.boolean().optional(), result: z.unknown().optional(), structured_output: z.unknown().optional() }).loose()
const methods: Record<string, string> = { 'claude.ai': 'Claude.ai', console: 'Anthropic Console', apiKey: 'API key' }

/**
 * Anthropic's Claude Code CLI, signed in with a Claude plan or an API key. Each question runs `claude -p` with every
 * tool off, safe mode (no CLAUDE.md, plugins, hooks, or MCP servers), and no saved session
 */
export function claudeProvider(find = () => findExecutable('claude', installDirs())): AiProvider {
  return {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic\'s Claude Code CLI · uses the Claude plan or API key it is signed in with',
    async detect() {
      const file = await find()
      if (!file) return { installed: false, version: null, signedIn: null, detail: 'Not found · install Claude Code, then check again' }
      const launcher = await launcherFor(file)
      const version = await runCli(launcher, ['--version'], { timeoutMs: 15_000 }).then(result => result.stdout.trim().replace(/\s*\(Claude Code\)\s*$/i, '') || null, () => null)
      const auth = await runCli(launcher, ['auth', 'status'], { timeoutMs: 15_000 }).catch(() => null)
      let status: z.infer<typeof statusSchema> | null = null
      try { status = auth ? statusSchema.parse(JSON.parse(auth.stdout)) : null } catch { status = null }
      const signedIn = !!status?.loggedIn
      return { installed: true, version, signedIn, detail: signedIn ? `Signed in with ${methods[status?.authMethod ?? ''] ?? status?.authMethod ?? 'Claude'}` : 'Not signed in · run claude auth login in a terminal, then check again' }
    },
    async run({ instructions, prompt, schema, workDir, signal }) {
      const file = await find()
      if (!file) throw new Error('Claude Code isn\'t installed')
      const result = await runCli(await launcherFor(file), [
        '-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', instructions,
        '--tools', '', '--safe-mode', '--no-session-persistence', '--permission-mode', 'dontAsk',
      ], { input: prompt, cwd: workDir, signal, timeoutMs: 180_000 })
      let answer: z.infer<typeof answerSchema>
      try { answer = answerSchema.parse(JSON.parse(result.stdout)) } catch { throw new Error(`Claude failed: ${failureLine(result)}`) }
      if (answer.is_error || answer.structured_output == null) throw new Error(`Claude failed: ${typeof answer.result === 'string' ? answer.result.slice(0, 300) : failureLine(result)}`)
      return answer.structured_output
    },
  }
}
