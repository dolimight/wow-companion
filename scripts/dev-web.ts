import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { DatabaseClient } from '../src/main/database'
import { startLocalService } from '../src/main/local-service'
import { refreshPublicCharacter } from '../src/main/provider-refresh'
import { MemorySecretStore } from '../src/main/secrets'

const dataDir=resolve('.local/browser')
await mkdir(dataDir,{recursive:true})
const db=new DatabaseClient(resolve(dataDir,'companion.sqlite'),pathToFileURL(resolve('out/main/database-worker.js')))
const origin='http://127.0.0.1:5173'
const service=await startLocalService({db,origins:[origin,'http://localhost:5173'],refreshCharacter:id=>refreshPublicCharacter(db,id),gameDataDir:resolve(dataDir,'gamedata'),gameDataWorker:pathToFileURL(resolve('out/main/gamedata-worker.js')),secrets:new MemorySecretStore(),addonDir:resolve('addon'),assetsDir:dataDir})
const server=await createServer({
  configFile:false,root:resolve('src/renderer'),publicDir:resolve('public'),
  plugins:[react(),tailwindcss(),{name:'local-companion-development',configureServer(vite){
    vite.middlewares.use(async(req,res,next)=>{
      const path=new URL(req.url??'/',origin).pathname
      if(path==='/__companion_runtime'){
        if(req.headers.origin&&![origin,'http://localhost:5173'].includes(req.headers.origin)){res.writeHead(403);res.end();return}
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(service.connection));return
      }
      if(path.startsWith('/__icons/')){const id=Number(path.match(/^\/__icons\/(\d+)\.png$/)?.[1]);if(!id){res.writeHead(404);res.end();return}try{const data=await readFile(await service.gameData.call('icon',id));res.writeHead(200,{'Content-Type':'image/png','X-Content-Type-Options':'nosniff'});res.end(data)}catch{res.writeHead(404);res.end()}return}
      if(path.startsWith('/__renders/')){const name=path.slice('/__renders/'.length);if(!/^[\w-]+\.(png|jpg|webp)$/.test(name)){res.writeHead(404);res.end();return}try{const data=await readFile(resolve(service.connections.rendersDir(),name));res.writeHead(200,{'Content-Type':name.endsWith('png')?'image/png':name.endsWith('webp')?'image/webp':'image/jpeg','X-Content-Type-Options':'nosniff'});res.end(data)}catch{res.writeHead(404);res.end()}return}
      next()
    })
  }}],
  server:{host:'127.0.0.1',port:5173,strictPort:true},
})
await server.listen();console.log('WOW Companion development: '+origin)
let stopped=false
async function close(){if(stopped)return;stopped=true;await server.close();await service.close();await db.close();process.exit(0)}
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close())
