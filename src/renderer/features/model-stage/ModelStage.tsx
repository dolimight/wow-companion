import {Component,Suspense,useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber'
import {AnimationMixer,Box3,Vector3,Group} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {api} from '../../lib/client'
import {Button} from '../../components/ui/primitives'
import {AppSelect} from '../../components/AppSelect'
import {notify,errorMessage} from '../../lib/notify'
class Boundary extends Component<{children:ReactNode;onError:()=>void},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}}componentDidCatch(){this.props.onError()}render(){return this.state.failed?null:this.props.children}}
function Model({url,clip}:{url:string;clip:number}){
  const gltf=useLoader(GLTFLoader,url),{camera,gl}=useThree(),group=useRef<Group>(null),orbit=useRef<OrbitControls|null>(null)
  const mixer=useMemo(()=>new AnimationMixer(gltf.scene),[gltf.scene])
  useEffect(()=>{const box=new Box3().setFromObject(gltf.scene),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3()),scale=2.8/Math.max(size.x,size.y,size.z,0.01);if(group.current){group.current.scale.setScalar(scale);group.current.position.copy(center.multiplyScalar(-scale))}const controls=new OrbitControls(camera,gl.domElement);orbit.current=controls;controls.enableDamping=true;controls.target.set(0,0,0);camera.position.set(0,0.4,4.8);controls.update();const tick=()=>controls.update();gl.domElement.addEventListener('pointermove',tick);return()=>{gl.domElement.removeEventListener('pointermove',tick);controls.dispose();orbit.current=null}},[gltf,camera,gl])
  useEffect(()=>{mixer.stopAllAction();if(gltf.animations[clip])mixer.clipAction(gltf.animations[clip]!).play();return()=>{mixer.stopAllAction()}},[clip,gltf,mixer])
  useFrame((_,delta)=>{mixer.update(Math.min(delta,0.1));orbit.current?.update()})
  return <group ref={group}><primitive object={gltf.scene}/></group>
}
export function ModelStage({characterId}:{characterId:string}){
  const query=useQuery({queryKey:['model',characterId],queryFn:()=>api.getModel({characterId})}),cache=useQueryClient(),[revision,setRevision]=useState(0),[failed,setFailed]=useState(false),[clip,setClip]=useState(-1),[busy,setBusy]=useState(false)
  async function act(remove=false){setBusy(true);try{if(remove)await api.forgetModel({characterId});else await api.chooseModelFile(characterId);setFailed(false);setRevision(v=>v+1);await cache.invalidateQueries({queryKey:['model',characterId]})}catch(e){notify(errorMessage(e))}finally{setBusy(false)}}
  const model=query.data
  return <section className="surface" style={{padding:18,minWidth:0}} aria-label="Local 3D inspection"><h2 style={{fontSize:18}}>3D model inspection</h2><p className="secondary small">An exported snapshot · Outfit edits do not rebuild its armor</p><div style={{height:340,background:'var(--surface2)',borderRadius:12,overflow:'hidden'}}>{model?.available&&!failed?<Boundary key={revision} onError={()=>setFailed(true)}><Suspense fallback={null}><Canvas camera={{position:[0,0.4,4.8]}} gl={{alpha:true,antialias:true}} onCreated={({gl})=>gl.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();setFailed(true)},{once:true})}><ambientLight intensity={1.5}/><directionalLight position={[3,5,4]} intensity={3}/><Model url={model.url} clip={clip}/></Canvas></Suspense></Boundary>:<div style={{padding:28}}>{failed?'The 3D renderer stopped — retry or use the observed render below':model?'Model file unavailable — import the original GLB again':'Import a self-contained GLB to rotate, zoom and inspect its animations'}</div>}</div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><Button disabled={busy} onClick={()=>void act()}>Import GLB</Button>{model&&<Button disabled={busy} onClick={()=>void act(true)}>Detach model</Button>}<Button disabled={!model} onClick={()=>{setFailed(false);setRevision(v=>v+1)}}>Reset viewer</Button>{!!model?.clips.length&&<AppSelect label="Model animation" value={String(clip)} options={[{value:'-1',label:'Rest pose'},...model.clips.map((name,index)=>({value:String(index),label:name}))]} onValueChange={v=>setClip(Number(v))}/>}</div>{model&&<p className="secondary small">{model.name} · {(model.bytes/1048576).toFixed(1)} MiB · Source build {model.sourceGameBuild??'unknown'}<br/>Model files are stored locally and excluded from JSON backups</p>}{query.isError&&<p role="alert">{errorMessage(query.error)}</p>}</section>
}
