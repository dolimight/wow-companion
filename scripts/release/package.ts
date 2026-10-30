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
if (process.platform !== 'win32') throw new Error('Release packaging requires Windows')
const args = [resolve('node_modules/electron-builder/out/cli/cli.js'), '--win', `--${architecture}`, '--publish', 'never', `--config.publish.channel=${channel === 'stable' ? 'latest' : 'nightly'}`, `--config.publish.releaseType=${channel === 'stable' ? 'release' : 'prerelease'}`]
// Unset repository secrets arrive as empty strings, which the builder would read as a certificate path
const env: NodeJS.ProcessEnv = { ...process.env }
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD']) if (!env[name]) delete env[name]
const signed = !!env.CSC_LINK && !!env.CSC_KEY_PASSWORD
args.push(`--config.win.signExecutable=${signed}`, `--config.forceCodeSigning=${signed}`)
const child = spawn(process.execPath, args, { stdio: 'inherit', env, windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
