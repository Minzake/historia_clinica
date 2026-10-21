import { useCallback, useEffect, useEffectEvent, useState } from 'react'

export function useRemote<T>(key:string,loader:()=>Promise<T>) {
  const [attempt,setAttempt]=useState(0)
  const requestKey=`${key}|${attempt}`
  const [result,setResult]=useState<{key:string;data:T|null;error:unknown}>({key:'',data:null,error:null})
  const load=useEffectEvent(loader)
  useEffect(()=>{
    let active=true
    void (async()=>{
      try {const data=await load();if(active)setResult({key:requestKey,data,error:null})}
      catch(error){if(active)setResult({key:requestKey,data:null,error})}
    })()
    return ()=>{active=false}
  },[requestKey])
  const reload=useCallback(()=>setAttempt((value)=>value+1),[])
  return {data:result.key===requestKey?result.data:null,error:result.key===requestKey?result.error:null,loading:result.key!==requestKey,reload}
}
