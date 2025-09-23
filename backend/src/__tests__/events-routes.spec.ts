import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { eventsController } from '../controllers/events.controller';
import { eventsRoutes } from '../routes/events.routes';


function makeApp() {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json({ limit: '2mb' }));
  
    const reader = {
      search: async (_filters: any) => ({
        items: [
          {
            id: 'es-1',
            timestamp: new Date().toISOString(),
            userId: 'user-1',
            browser: 'Chrome',
            url: '/dashboard',
            errorMessage: 'TypeError: x is not a function',
            stackTrace: 'at main.ts:10',
          },
        ],
        total: 1,
        windowCapped: false,
      }),
      stats: async (_filters: any) => ({
        topBrowsers: [{ key: 'Chrome', doc_count: 10 }],
        topErrorMessages: [{ key: 'TypeError', doc_count: 7 }],
      }),
      ingest: async (_events: any[]) => {},
      searchPIT: async (_f: any) => ({ items: [], total: 0, cursor: null, done: true }),
    };
  
    // Simple in-memory cache mock
    const store = new Map<string, any>();
    const cache = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: any, _ttl?: number) => { store.set(k, v); },
    };
  
    const ttlSec = 60;
  
    const ctrl = eventsController({
      search: reader.search.bind(reader),
      stats: reader.stats.bind(reader),
      ingest: reader.ingest.bind(reader),
      searchPIT: reader.searchPIT.bind(reader),
    });
  
    app.use('/', eventsRoutes(ctrl));
    return app;
  }
  
  

describe('Events API (mocked controller deps)', () => {
  it('GET /events/search -> 200 and items[]', async () => {
    const app = makeApp();
    const res = await request(app).get('/events/search?page=1&size=1&sort=desc');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.items[0]).toMatchObject({
      userId: 'user-1',
      browser: 'Chrome',
    });
  });

  it('GET /events/stats -> 200 and proper aggregations', async () => {
    const app = makeApp();
    const res = await request(app).get('/events/stats');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.topBrowsers)).toBe(true);
    expect(res.body.topBrowsers[0]).toMatchObject({ key: 'Chrome', doc_count: 10 });
    expect(res.body.topErrorMessages[0]).toMatchObject({ key: 'TypeError', doc_count: 7 });
  });
});
