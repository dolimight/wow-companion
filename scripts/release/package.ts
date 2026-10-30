import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { releaseChannel } from './metadata.ts'
const [requestedVersion, architecture] = process.argv.slice(2)
const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version: string }
const version = requestedVersion === 'current' ? packageJson.version : requestedVersion
const channel = releaseChannel(`v${version}`)
if (!version || !channel || !architecture || !['x64', 'arm64'].includes(architecture)) throw new Error('Invalid package version or architecture')
if (packageJson.version !== version) throw new Error('Stamp the package with the release version before packaging')
if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Release packaging requires Windows or macOS')
const args = [resolve('node_modules/electron-builder/out/cli/cli.js'), process.platform === 'win32' ? '--win' : '--mac', `--${architecture}`, '--publish', 'never', `--config.publish.channel=${channel === 'stable' ? 'latest' : 'nightly'}`, `--config.publish.releaseType=${channel === 'stable' ? 'release' : 'prerelease'}`]
const signed = !!process.env.CSC_LINK && !!process.env.CSC_KEY_PASSWORD
if (process.platform === 'win32') args.push(`--config.win.signExecutable=${signed}`, `--config.forceCodeSigning=${signed}`)
else {
  const notarize = signed && !!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD && !!process.env.APPLE_TEAM_ID
  args.push(`--config.mac.notarize=${notarize}`, `--config.forceCodeSigning=${signed}`)
  if (!signed) console.warn('macOS artifacts are unsigned; production in-app macOS updates require a Developer ID certificate')
}
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env, windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
