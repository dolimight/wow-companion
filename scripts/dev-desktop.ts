import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const env: NodeJS.ProcessEnv = {...process.env}
delete env.ELECTRON_RUN_AS_NODE
const child=spawn(process.execPath,[resolve('node_modules/electron-vite/bin/electron-vite.js'),'dev'],{env,stdio:'inherit',windowsHide:true})
child.on('exit',code=>process.exit(code??1))
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal))
