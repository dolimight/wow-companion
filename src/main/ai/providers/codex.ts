import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { failureLine, findExecutable, launcherFor, runCli } from '../cli'
import type { AiProvider } from '../types'

/** Where OpenAI's Windows installer puts the CLI when it isn't on PATH */
const installDirs = () => process.platform === 'win32' && process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin')] : []

/**
 * OpenAI's Codex CLI, signed in with ChatGPT or an API key. Each question runs `codex exec` in a read-only sandbox in an
 * empty folder, with the player's config and rules ignored so their MCP servers and project rules stay out of it
 */
export function codexProvider(find = () => findExecutable('codex', installDirs())): AiProvider {
  return {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI\'s Codex CLI · uses the ChatGPT plan or API key it is signed in with',
    async detect() {
      const file = await find()
      if (!file) return { installed: false, version: null, signedIn: null, detail: 'Not found · install the Codex CLI, then check again' }
      const launcher = await launcherFor(file)
      const version = await runCli(launcher, ['--version'], { timeoutMs: 15_000 }).then(result => result.stdout.trim().replace(/^codex-cli\s*/i, '') || null, () => null)
      const login = await runCli(launcher, ['login', 'status'], { timeoutMs: 15_000 }).catch(() => null)
      const text = login ? `${login.stdout}\n${login.stderr}`.trim() : ''
      const signedIn = !!login && login.code === 0 && /logged in/i.test(text) && !/not logged in/i.test(text)
      return { installed: true, version, signedIn, detail: signedIn ? text.split(/\r?\n/)[0]!.trim() : 'Not signed in · run codex login in a terminal, then check again' }
    },
    async run({ instructions, prompt, schema, workDir, signal }) {
      const file = await find()
      if (!file) throw new Error('Codex isn\'t installed')
      const schemaFile = path.join(workDir, 'answer.schema.json'), answerFile = path.join(workDir, 'answer.json')
      await writeFile(schemaFile, JSON.stringify(schema))
      const result = await runCli(await launcherFor(file), [
        'exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--ignore-rules', '--ignore-user-config',
        '-C', workDir, '--output-schema', schemaFile, '-o', answerFile, '-',
      ], { input: `${instructions}\n\n${prompt}`, cwd: workDir, signal, timeoutMs: 180_000 })
      if (result.code !== 0) throw new Error(`Codex failed: ${failureLine(result)}`)
      const text = await readFile(answerFile, 'utf8').catch(() => '')
      try { return JSON.parse(text) } catch { throw new Error('Codex answered with something other than the JSON asked for') }
    },
  }
}
