import { database } from './supabase'

export type Branding={clinicId:string;name:string;logo:string;favicon:string}
export const defaultBranding:Branding={clinicId:'',name:'',logo:'',favicon:''}
export const imageLimits={logo:180000,favicon:30000} as const
export function validBrandImage(value:string,kind:'logo'|'favicon') {
  if(value==='')return true
  if(value.length>22+4*Math.ceil(imageLimits[kind]/3)||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false
  try{
    const bytes=Uint8Array.from(atob(value.slice(22)),char=>char.charCodeAt(0))
    const signature=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82],trailer=[0,0,0,0,73,69,78,68,174,66,96,130]
    if(bytes.length<45||bytes.length>imageLimits[kind]||!signature.every((byte,i)=>bytes[i]===byte)||!trailer.every((byte,i)=>bytes[bytes.length-12+i]===byte))return false
    const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20),max=kind==='logo'?512:64
    return width>0&&height>0&&width<=max&&height<=max
  }catch{return false}
}
export async function getBranding(clinicId:string|null=null,slug:string|null=null):Promise<Branding|null> {
  const {data,error}=await database().rpc('get_clinic_branding',{p_clinic_id:clinicId,p_slug:slug||null})
  if(error)throw error
  if(!data)return null
  return {...data,logo:typeof data.logo==='string'&&validBrandImage(data.logo,'logo')?data.logo:'',favicon:typeof data.favicon==='string'&&validBrandImage(data.favicon,'favicon')?data.favicon:''}
}

export async function prepareBrandImage(file:File,kind:'logo'|'favicon') {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Elegí una imagen PNG, JPG o WebP.')
  if(!file.size||file.size>5*1024*1024)throw new Error('La imagen debe pesar hasta 5 MB.')
  let bitmap:ImageBitmap
  try{bitmap=await createImageBitmap(file)}catch{throw new Error('No pudimos abrir esa imagen. Probá con otro archivo.')}
  try{
    if(bitmap.width>4096||bitmap.height>4096)throw new Error('La imagen puede tener hasta 4096 × 4096 píxeles.')
    let size=kind==='favicon'?64:512
    while(size>=32){
      const scale=Math.min(size/bitmap.width,size/bitmap.height,kind==='favicon'?Infinity:1)
      const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale))
      const canvas=document.createElement('canvas')
      canvas.width=kind==='favicon'?64:w;canvas.height=kind==='favicon'?64:h
      const context=canvas.getContext('2d')
      if(!context)throw new Error('El navegador no pudo preparar la imagen.')
      context.drawImage(bitmap,(canvas.width-w)/2,(canvas.height-h)/2,w,h)
      const png=canvas.toDataURL('image/png')
      if(validBrandImage(png,kind))return png
      size=Math.floor(size*.75)
    }
    throw new Error('No pudimos reducir la imagen. Probá con una más simple.')
  }finally{bitmap.close()}
}
