import { describe,expect,it,vi } from 'vitest'
import { checkDeployment } from '../scripts/check-deployment.mjs'

describe('anonymous deployment checks',()=>{
  it('checks public pages and denied APIs without creating users or booking appointments',async()=>{
    const fetcher=vi.fn(async(url:string)=>url.includes('/api/')?new Response('{}',{status:401,headers:{'Content-Type':'application/json'}}):new Response('<html></html>',{status:200}))
    const results=await checkDeployment('https://example.com',fetcher)
    expect(results).toHaveLength(4)
    expect(fetcher.mock.calls.every(([url])=>!url.includes('signup')&&!url.includes('book_appointment'))).toBe(true)
  })
  it('does not mistake an SPA rewrite for a protected API',async()=>{
    const fetcher=vi.fn(async()=>new Response('<html></html>',{status:200}))
    await expect(checkDeployment('https://example.com',fetcher)).rejects.toThrow('CHECK_FAILED:/api/team')
  })
})
