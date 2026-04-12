import { NestFactory } from '@nestjs/core'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
 
async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length', 'Content-Type', 'X-Video-Id', 'X-Stream-Type'],
  })
 
  app.setGlobalPrefix('api')
 
  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Music App API')
    .setDescription('Búsqueda y streaming de música via YouTube Music')
    .setVersion('1.0')
    .build()
 
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)
 
  const port = process.env.PORT ?? 3000
  await app.listen(port)
 
  console.log(`\nNubster en http://localhost:${port}`)
  console.log(`Swagger UI en      http://localhost:${port}/docs`)
  console.log(`Swagger JSON en    http://localhost:${port}/docs-json\n`)
}
 
bootstrap()