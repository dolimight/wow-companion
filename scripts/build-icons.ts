import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.env.WOW_COMPANION_ICON_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function visibleBounds(bitmap: Uint8Array, width: number, height: number) {
  if (bitmap.length !== width * height * 4) throw new Error('Unexpected icon bitmap size')
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (bitmap[(y * width + x) * 4 + 3] < 128) continue
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  if (right < left) throw new Error('Logo has no visible pixels')
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export function encodeIco(frames: Array<{ size: number; png: Buffer }>) {
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header[entry] = header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...frames.map(frame => frame.png)])
}

export function encodeIcns(frames: Array<{ type: string; png: Buffer }>) {
  const chunks = frames.map(({ type, png }) => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii'); header.writeUInt32BE(8 + png.length, 4)
    return Buffer.concat([header, png])
  })
  const header = Buffer.alloc(8)
  header.write('icns'); header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

async function main(args: string[]) {
  if (!process.versions.electron) {
    const electron: unknown = createRequire(import.meta.url)('electron')
    if (typeof electron !== 'string') throw new Error('Electron executable path is unavailable')
    // Electron's application loader does not execute TS source directly
    const ts = await import('typescript')
    const directory = resolve(root, '.local/build-icons')
    const entry = resolve(directory, 'build-icons.mjs')
    const source = await readFile(fileURLToPath(import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { fileName: 'build-icons.ts', compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } })
    await mkdir(directory, { recursive: true })
    await writeFile(entry, compiled.outputText)
    const env: NodeJS.ProcessEnv = { ...process.env, WOW_COMPANION_ICON_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electron, [entry, ...args], { env, stdio: 'inherit', windowsHide: true })
    child.on('error', error => { console.error(error.message); process.exitCode = 1 })
    child.on('exit', code => { process.exitCode = code ?? 1 })
    return
  }
  const { app, nativeImage } = await import('electron')
  try {
    if (args.length && (args.length !== 2 || args[0] !== '--out-dir')) throw new Error('Usage: node --import tsx scripts/build-icons.ts [--out-dir directory]')
    await app.whenReady(); app.dock?.hide()
    const output = args.length ? resolve(args[1]) : resolve(root, 'public/assets')
    const source = nativeImage.createFromPath(resolve(root, 'public/assets/wow-companion-logo.png'))
    if (source.isEmpty()) throw new Error('Logo could not be read')
    const { width, height } = source.getSize()
    const cropped = source.crop(visibleBounds(source.toBitmap(), width, height))
    const png = (size: number) => cropped.resize({ width: size, height: size, quality: 'best' }).toPNG()
    await mkdir(output, { recursive: true })
    await writeFile(resolve(output, 'wow-companion-icon.png'), png(1024))
    await writeFile(resolve(output, 'wow-companion.ico'), encodeIco([16, 24, 32, 48, 64, 128, 256].map(size => ({ size, png: png(size) }))))
    const sizes = [16, 32, 64, 128, 256, 512, 1024], types = ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10']
    await writeFile(resolve(output, 'wow-companion.icns'), encodeIcns(sizes.map((size, index) => ({ type: types[index], png: png(size) }))))
    console.log(`Generated edge-filled PNG, ICO, and ICNS icons in ${output}`)
    app.exit(0)
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); app.exit(1) }
}

if (process.versions.electron || (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)) {
  const entry = process.argv.findIndex(argument => resolve(argument) === fileURLToPath(import.meta.url))
  const args = process.argv.slice(entry >= 0 ? entry + 1 : 1)
  // Electron emits ready after its ESM entry finishes evaluating
  if (process.versions.electron) void main(args)
  else await main(args)
}
