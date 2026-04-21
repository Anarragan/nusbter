import { NestFactory } from '@nestjs/core'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
 
async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const corsOriginConfig = corsOrigins.includes('*') ? true : corsOrigins

  app.enableCors({
    origin: corsOriginConfig,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length', 'Content-Type', 'X-Video-Id', 'X-Stream-Type', 'X-Download-Source'],
  })
 
  app.setGlobalPrefix('api')

  const swaggerEnabled = (process.env.ENABLE_SWAGGER ?? 'false').toLowerCase() !== 'false'
 
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Music App API')
      .setDescription('Busqueda y streaming de musica via YouTube Music')
      .setVersion('1.0')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('docs', app, document)
  }
 
  const port = process.env.PORT ?? 3000
  await app.listen(port)
 
  console.log(`\nNubster en http://localhost:${port}`)
  if (swaggerEnabled) {
    console.log(`Swagger UI en      http://localhost:${port}/docs`)
    console.log(`Swagger JSON en    http://localhost:${port}/docs-json`)
  }
  console.log('')
}
 
bootstrap()