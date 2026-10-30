import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import electron from 'electron'
const dataDirectory=process.env.WOW_COMPANION_ACCEPTANCE_DATA_DIR?resolve(process.env.WOW_COMPANION_ACCEPTANCE_DATA_DIR):resolve(`.local/desktop-acceptance-${Date.now()}`)
const env={...process.env,WOW_COMPANION_HEADLESS:'1',WOW_COMPANION_DATA_DIR:dataDirectory}
console.log(`Acceptance workspace: ${dataDirectory}`)
delete env.ELECTRON_RUN_AS_NODE
const child=spawn(electron,['.','--acceptance'],{env,stdio:'inherit',windowsHide:true})
child.on('exit',code=>process.exit(code??1))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
