import { watch, type FSWatcher } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { parseSnapshot } from './parse-snapshot'
export type SnapshotWatch = {close():void;check():Promise<void>}
/** Parent validates the selected path before constructing this watcher */
export function watchRoster(path: string, onSnapshot: (snapshot: unknown) => Promise<unknown>, onStatus: (status: {checkedAt:string;error:string|null}) => void): SnapshotWatch {
  let stopped=false;let busy=false;let timer:ReturnType<typeof setTimeout>|undefined;let watcher:FSWatcher|undefined
  async function check() {
    if(stopped||busy)return;busy=true
    try {const info=await stat(path);if(!info.isFile()||info.size>16*1024*1024)throw new Error('Select a SavedVariables file smaller than 16 MiB');const raw=await readFile(path,'utf8');const after=await stat(path);if(info.size!==after.size||info.mtimeMs!==after.mtimeMs)throw new Error('File changed during read; retrying on the next check');await onSnapshot(parseSnapshot(raw));onStatus({checkedAt:new Date().toISOString(),error:null})}catch(error){onStatus({checkedAt:new Date().toISOString(),error:error instanceof Error?error.message:'Snapshot check failed'})}finally{busy=false}
  }
  try {watcher=watch(path,()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>void check(),300)})}catch { /* Initial read and interval expose missing-file state */ }
  const interval=setInterval(()=>void check(),60_000);interval.unref();void check()
  return {check,close(){stopped=true;watcher?.close();clearInterval(interval);if(timer)clearTimeout(timer)}}
}
