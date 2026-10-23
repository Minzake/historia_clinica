import { useEffect,useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { defaultBranding,getBranding } from '../lib/branding'
import { useRemote } from '../hooks/useRemote'
import { bookingReturn } from '../lib/booking-navigation'
import { BrandingContext,useBranding } from '../branding-context'

export function BrandingProvider({children}:{children:ReactNode}) {
  const {pathname,search}=useLocation()
  const [clinicId,activateClinic]=useState<string|null>(null),[publicSlug,selectPublicSlug]=useState('')
  const publicPage=pathname.startsWith('/reservar')||pathname==='/registro'
  const returnSlug=bookingReturn(search).split('?')[0].split('/')[2]||''
  const slug=pathname.startsWith('/reservar')?publicSlug||pathname.split('/')[2]||'':returnSlug
  const active=publicPage||returnSlug?null:clinicId
  const remote=useRemote(`brand:${active||''}:${slug}`,()=>getBranding(active,slug))
  const branding=remote.data||defaultBranding
  useEffect(()=>{
    const favicon=document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if(favicon){favicon.href=branding.favicon||'/favicon.svg';favicon.type=branding.favicon?'image/png':'image/svg+xml'}
    document.title=branding.name||'Consultorio · Podología'
  },[branding.favicon,branding.name])
  return <BrandingContext.Provider value={{branding,activateClinic,selectPublicSlug,refresh:remote.reload}}>{children}</BrandingContext.Provider>
}

export function BrandLogo(){const {branding}=useBranding();return <span className="brand-mark"><img src={branding.logo||'/logo.svg'} alt=""/></span>}
export function BrandName({fallback}:{fallback:string}){const {branding}=useBranding();return <>{branding.name||fallback}</>}
