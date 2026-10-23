import { createContext,useContext } from 'react'
import { defaultBranding } from './lib/branding'
import type { Branding } from './lib/branding'

export const BrandingContext=createContext<{branding:Branding;activateClinic:(id:string|null)=>void;selectPublicSlug:(slug:string)=>void;refresh:()=>void}>({branding:defaultBranding,activateClinic:()=>{},selectPublicSlug:()=>{},refresh:()=>{}})
export const useBranding=()=>useContext(BrandingContext)
