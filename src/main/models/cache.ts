import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseClient} from '../database'
export type ModelDescriptor={assetId:string;url:string;name:string;bytes:number;sha256:string;clips:string[];sourceGameBuild:string|null;available:boolean}
export function inspectGlb(bytes:Buffer){
  if(bytes.length<20||bytes.length>100*1024*1024||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Choose a valid GLB 2 file smaller than 100 MiB')
  const length=bytes.readUInt32LE(12);if(length>8*1024*1024||20+length>bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Invalid GLB JSON chunk')
  const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8').trim())
  if(json.asset?.version!=='2.0'||!Array.isArray(json.meshes)||!json.meshes.length)throw Error('The model has no supported mesh')
  for(const entry of [...json.buffers??[],...json.images??[]])if(entry.uri)throw Error('Use a self-contained GLB with embedded textures and buffers')
  if(json.extensionsRequired?.some((id:string)=>!['KHR_materials_unlit','KHR_texture_transform','KHR_materials_emissive_strength'].includes(id)))throw Error('The model requires an unsupported extension')
  return {clips:(json.animations??[]).map((a:{name?:string},i:number)=>a.name??`Animation ${i+1}`) as string[]}
}
export function createModelCache(options:{db:Pick<DatabaseClient,'call'>;rootDir:string}){
  const assetPath=(id:string)=>{if(!/^[a-f0-9-]{36}\.glb$/.test(id))throw Error('Invalid model asset');return path.join(options.rootDir,id)}
  return {assetPath,
    async get(characterId:string):Promise<ModelDescriptor|null>{const value=await options.db.call('getFeatureState',characterId,'model') as ModelDescriptor|null;if(!value)return null;if(!/^[a-f0-9-]{36}$/.test(value.assetId))return null;const present=await stat(assetPath(value.assetId+'.glb')).then(s=>s.isFile()&&s.size===value.bytes,()=>false);return {...value,url:`wow-asset://models/${value.assetId}.glb`,available:present}},
    async importFile(characterId:string,approvedPath:string){if(!await options.db.call('getCharacter',characterId))throw Error('Character was removed');const file=await realpath(approvedPath),info=await stat(file);if(!info.isFile()||info.size>100*1024*1024)throw Error('Choose a GLB smaller than 100 MiB');const bytes=await readFile(file),meta=inspectGlb(bytes),assetId=randomUUID();await mkdir(options.rootDir,{recursive:true});await writeFile(assetPath(assetId+'.glb'),bytes,{flag:'wx'});const value:ModelDescriptor={assetId,url:`wow-asset://models/${assetId}.glb`,name:path.basename(file),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),clips:meta.clips,sourceGameBuild:null,available:true};await options.db.call('saveFeatureState',characterId,'model',value);return value},
    async forget(characterId:string){await options.db.call('saveFeatureState',characterId,'model',null)},
  }
}
