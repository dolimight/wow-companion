import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
const electron: unknown = createRequire(import.meta.url)('electron')
if (typeof electron !== 'string') throw new Error('Electron executable path is unavailable')
const dataDirectory=process.env.WOW_COMPANION_ACCEPTANCE_DATA_DIR?resolve(process.env.WOW_COMPANION_ACCEPTANCE_DATA_DIR):resolve(`.local/desktop-acceptance-${Date.now()}`)
const env: NodeJS.ProcessEnv = {...process.env,WOW_COMPANION_HEADLESS:'1',WOW_COMPANION_DATA_DIR:dataDirectory}
console.log(`Acceptance workspace: ${dataDirectory}`)
delete env.ELECTRON_RUN_AS_NODE
const child=spawn(electron,['.','--acceptance'],{env,stdio:'inherit',windowsHide:true})
child.on('exit',code=>process.exit(code??1))
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal))
