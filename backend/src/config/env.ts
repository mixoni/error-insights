import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const Env = z.object({
  PORT: z.string().default('3000'),
  MONGO_URI: z.string().min(1),
  MONGO_DB: z.string().default('error_insights'),
  ES_NODE: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CACHE_TTL_SEC: z.string().default('60'),
  ES_INDEX: z.string().default('error_events'),
});
const parsed = Env.parse(process.env);

export const ENV = {
  ...parsed,
  PORT: Number(parsed.PORT),
  CACHE_TTL_SEC: Number(parsed.CACHE_TTL_SEC),
};
