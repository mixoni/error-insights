import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { Client as EsClient } from '@elastic/elasticsearch';
import { ENV } from '../config/env';

export async function healthCheck(mongo: MongoClient, redis: Redis, es: EsClient) {
  const checks: Record<string, any> = {};

  // Mongo
  try {
    await mongo.db(ENV.MONGO_DB).command({ ping: 1 });
    checks.mongo = 'ok';
  } catch (err) {
    checks.mongo = 'fail';
  }

  // Redis
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (err) {
    checks.redis = 'fail';
  }

  // ES
  try {
    const info = await es.info();
    checks.elasticsearch = {
      status: 'ok',
      version: info.version?.number,
      cluster: info.cluster_name
    };
  } catch (err) {
    checks.elasticsearch = 'fail';
  }

  return checks;
}
