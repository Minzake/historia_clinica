import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { assertLocalEnvironment } from './scripts/local-environment.mjs'

// https://vite.dev/config/
export default defineConfig(({mode}) => {
  const env={...loadEnv(mode,process.cwd(),''),...process.env,NODE_ENV:'development'}
  if(mode==='testing')assertLocalEnvironment(env)
  return ({
  plugins: [react(), {
    name: 'local-server-api',
    configureServer(server) {
      // Server-only: never inject this object with define/envPrefix into browser code.
      server.middlewares.use(async (req,res,next) => {
        const path=req.url?.split('?')[0]
        if(path!=='/api/team'&&path!=='/api/notifications')return next()
        try {
          if(path==='/api/team')await (await import('./api/team.mjs')).handleTeam(req,res,env)
          else await (await import('./api/notifications.mjs')).handleNotifications(req,res,env)
        }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'No se pudo iniciar la API local.'}))}
      })
    },
  }],
})})
