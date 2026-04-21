<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Docker and Railway Deployment

### Local container stack

```bash
# Build image only
npm run docker:build

# Start API + Redis
npm run docker:up

# Follow logs
npm run docker:logs

# Stop stack
npm run docker:down
```

Health endpoint for platform checks:

- `GET /api/songs/metrics`

### Railway deployment (recommended)

This repository includes a production-ready `Dockerfile` for Railway.

Required Railway variables:

- `PORT` -> provided by Railway (keep as platform default)
- `REDIS_URL` -> connect from Railway Redis plugin
- `CORS_ORIGINS` -> your frontend domain (comma separated for multiple domains)
- `ENABLE_SWAGGER` -> `false` in production
- `NODE_ENV` -> `production`

Example values:

```bash
NODE_ENV=production
PORT=3000
REDIS_URL=redis://default:password@host:port
CORS_ORIGINS=https://your-frontend-domain.com
ENABLE_SWAGGER=false
```

Railway notes:

- Add a Redis plugin and use its connection URL as `REDIS_URL`.
- If you need multiple frontend domains, set `CORS_ORIGINS` as `https://a.com,https://b.com`.
- Use `*` in `CORS_ORIGINS` only for temporary testing environments.

## Audio Delivery: Fase 2 + descarga optimizada

Esta version incluye un pipeline de precarga compartido entre streaming y descarga.

### Flujo de optimizacion

- Busqueda: precarga de stream Top 5 en background.
- Busqueda: precarga selectiva de descarga MP3 para Top 3 en background.
- Streaming: reutiliza cache local + cache compartida en Redis para evitar resolver yt-dlp en caliente.
- Descarga: intenta servir un MP3 ya preparado desde cache de archivos local; si no existe, hace fallback a conversion en vivo.

### Redis y BullMQ

- Con REDIS_URL: activa cola distribuida y estado compartido de precarga.
- Sin REDIS_URL: fallback automatico al modo local en memoria.

Variables de entorno (ver .env.example):

```bash
PORT=3000
REDIS_URL=redis://localhost:6379
```

### Redis local con Docker

```bash
# Levantar Redis local
npm run redis:up

# Ver logs
npm run redis:logs

# Detener servicios
npm run redis:down
```

Tambien puedes ejecutar directamente:

```bash
docker compose up -d redis
```

### Endpoint de metricas

`GET /api/songs/metrics`

Incluye:

- Estado de stream/preload (queue enabled, pending, errores, latencia promedio).
- Metricas de cache de metadata de stream.
- Metricas de cache de archivos de descarga (hits, misses, in-flight builds, tamano aproximado).
- Metricas de peticiones por ruta (requests, aborts, avgDurationMs, avgTtfbMs).

### Endpoint de precarga explicita (cola de reproduccion)

`POST /api/songs/preload`

Body de ejemplo:

```json
{
  "videoIds": ["idActual", "idSiguiente", "idSiguiente2"],
  "mode": "both",
  "concurrency": 2,
  "timeoutMs": 8000,
  "downloadTop": 2
}
```

Uso recomendado para boton siguiente/anterior en frontend:

- Cuando inicia una cancion, enviar preload de los proximos 2-3 videoIds con `mode=both`.
- Al presionar siguiente/anterior, reproducir el nuevo `videoId` y volver a disparar preload para la nueva ventana.
- Mantener una ventana movil: `[actual, +1, +2, -1 opcional]`.

### Dependencias agregadas

- bullmq
- ioredis

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
