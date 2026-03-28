import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from './../src/app.module'

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api')
    await app.init();
  });

  afterAll(async () => {
    await app.close()
  })

  it('/api/songs/search without q returns 400', () => {
    return request(app.getHttpServer())
      .get('/api/songs/search')
      .expect(400)
      .expect((res) => {
        expect(res.body?.message).toBe('Search query cannot be empty')
      })
  })

  it('/api/songs/:videoId/stream with invalid type returns 400', () => {
    return request(app.getHttpServer())
      .get('/api/songs/dQw4w9WgXcQ/stream?type=nope')
      .expect(400)
      .expect((res) => {
        expect(res.body?.message).toBe('type must be "audio" or "av"')
      })
  })
});
