export function rendererOrigin(value:string):string|null {
  try{const url=new URL(value);if(url.username||url.password)return null;if(url.protocol==='app:'&&url.hostname==='companion'&&!url.port)return 'app://companion';if(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))return url.origin;return null}catch{return null}
}
