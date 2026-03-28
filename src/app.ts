import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './swagger/swagger.config'
import { errorHandler } from './middlewares/errorHandler'
import songRoutes from './routes/song.routes'
import streamRoutes from './routes/stream.routes'
 
export function createApp() {
  const app = express()
 
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
 
  // Swagger UI
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Music App API',
  }))
 
  // Endpoint para obtener el JSON de la spec (útil para Postman)
  app.get('/docs-json', (_req, res) => {
    res.json(swaggerSpec)
  })
 
  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })
 
  // Rutas de la API
  app.use('/api/songs', songRoutes)
  app.use('/api/songs', streamRoutes)
 
  // Error handler (siempre al final)
  app.use(errorHandler)
 
  return app
}