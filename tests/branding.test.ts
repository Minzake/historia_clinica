import { describe,expect,it } from 'vitest'
import { prepareBrandImage,validBrandImage } from '../src/lib/branding'
describe('brand image inputs',()=>{
 it('accepts only bounded PNG data and defaults, never remote images or SVG',()=>{
  expect(validBrandImage('','logo')).toBe(true)
  expect(validBrandImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5G8AAAAASUVORK5CYII=','logo')).toBe(true)
  expect(validBrandImage('data:image/png;base64,aGVsbG8=','logo')).toBe(false)
  for(const input of ['https://images.example/logo.png','data:image/svg+xml;base64,PHN2Zy8+','javascript:alert(1)',`data:image/png;base64,${'A'.repeat(250000)}`])expect(validBrandImage(input,'logo')).toBe(false)
 })
 it('rejects unsupported and oversized files before attempting to decode them',async()=>{
  await expect(prepareBrandImage({type:'image/svg+xml',size:10} as File,'logo')).rejects.toThrow('PNG, JPG o WebP')
  await expect(prepareBrandImage({type:'image/png',size:6*1024*1024} as File,'logo')).rejects.toThrow('5 MB')
 })
})
