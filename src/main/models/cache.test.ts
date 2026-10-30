import {describe,it,expect} from 'vite-plus/test'
import {inspectGlb} from './cache'
function glb(json:unknown){const s=Buffer.from(JSON.stringify(json)),n=Math.ceil(s.length/4)*4,b=Buffer.alloc(20+n,32);b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(n,12);b.writeUInt32LE(0x4e4f534a,16);s.copy(b,20);return b}
describe('local model validation',()=>{
  it('accepts self-contained geometry and animation names',()=>expect(inspectGlb(glb({asset:{version:'2.0'},meshes:[{}],animations:[{name:'Stand'}]})).clips).toEqual(['Stand']))
  it('rejects external textures and buffers and malformed lengths',()=>{for(const json of [{asset:{version:'2.0'},meshes:[{}],images:[{uri:'https://example.com/image.png'}]},{asset:{version:'2.0'},meshes:[{}],buffers:[{uri:'../private.bin'}]}])expect(()=>inspectGlb(glb(json))).toThrow('self-contained');const b=glb({asset:{version:'2.0'},meshes:[{}]});b.writeUInt32LE(0,8);expect(()=>inspectGlb(b)).toThrow()})
})
