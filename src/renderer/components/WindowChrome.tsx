import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { WindowState } from '../../shared/bridge'
import { api } from '../lib/client'

/** Syncs native window state onto the document so the workspace toolbar can act as the integrated title bar */
export function WindowChrome() {
  const [state,setState]=useState<WindowState|null>(null)
  const settings=useQuery({queryKey:['settings'],queryFn:()=>api.getSettings()})
  useEffect(()=>{
    if(settings.data?.theme)void window.companion?.setWindowTheme(settings.data.theme).catch(()=>{})
  },[settings.data?.theme])
  useEffect(()=>{
    const bridge=window.companion
    let active=true
    if(!bridge)return
    const unsubscribe=bridge.onWindowState(next=>{if(active)setState(next)})
    void bridge.windowState().then(next=>{if(active)setState(next)}).catch(()=>{})
    return ()=>{active=false;unsubscribe()}
  },[])
  const integrated=state?.frame==='custom'&&!state.fullScreen
  useEffect(()=>{
    const element=document.documentElement
    element.dataset.windowFrame=state?.frame??'native'
    element.dataset.platform=state?.platform??'browser'
    element.dataset.titleBar=integrated?'integrated':'none'
  },[state?.frame,state?.platform,integrated])
  return null
}
