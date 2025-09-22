import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { ENV } from './config/env';
import { logger } from './libs/logger';

import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { Client as EsClient } from '@elastic/elasticsearch';

import { MongoEventWriter } from './adapters/mongo/MongoEventWriter';
import { RedisCache } from './adapters/redis/RedisCache';
import { ElasticEventReader } from './adapters/elastic-search/ElasticEventReader';

import { makeSearchEvents, makeSearchEventsPIT } from './usecases/search-events';
import { makeGetStats } from './usecases/get-stats';
import { makeIngestEvents } from './usecases/ingest-events';

import { eventsController } from './controllers/events.controller';
import { eventsRoutes } from './routes/events.routes';
import { ensureIndex } from './services/elastic-search.service';
import { healthCheck } from './services/healt.service';
import { widgetsRoutes } from './routes/widget.routes';


async function main() {
  const mongo = new MongoClient(ENV.MONGO_URI);
  await mongo.connect();

  const redis = new Redis(ENV.REDIS_URL);
  const esClient = new EsClient({ node: ENV.ES_NODE });

  await ensureIndex(esClient);

  const writer = new MongoEventWriter(mongo, ENV.MONGO_DB);
  const cache = new RedisCache(redis);
  const reader = new ElasticEventReader(esClient, ENV.ES_INDEX);

  const esIO = new ElasticEventReader(esClient, ENV.ES_INDEX);

  const search = makeSearchEvents(reader, cache, ENV.CACHE_TTL_SEC);
  const stats  = makeGetStats(reader, cache, ENV.CACHE_TTL_SEC);
  const ingest = makeIngestEvents(writer, reader, redis);
  const searchPIT = makeSearchEventsPIT(esIO);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(pinoHttp({ logger }));

  app.use('/', eventsRoutes(eventsController({ search, stats, ingest, searchPIT })));
  app.use('/', widgetsRoutes(redis));

  // healthcheck
  app.get('/health', async (_req, res) => {
    const data = await healthCheck(mongo, redis, esClient);
    const allOK = Object.values(data).every(v => (typeof v === 'string' ? v === 'ok' : v.status === 'ok'));
    res.status(allOK ? 200 : 500).json(data);
  });
  // error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    logger.error(err);
    res.status(err?.status || 500).json({ error: err?.message || 'Internal error' });
  });

  app.listen(ENV.PORT, () => logger.info(`API on :${ENV.PORT}`));
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
