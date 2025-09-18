import type { ErrorEvent } from '../domain/ErrorEvent';
import type { EventWriter } from '../domain/ports/EventWriter';
import { ElasticEventReader } from '../adapters/elastic-search/ElasticEventReader';
import type Redis from 'ioredis';

export function makeIngestEvents(writer: EventWriter, esIndexer: ElasticEventReader, redis?: Redis) {
    return async (events: ErrorEvent[]) => {
      if (!Array.isArray(events) || !events.length) return;
  
      await writer.saveRaw(events);       // Mongo
      await esIndexer.bulkIndex(events);  // ES 
  
      if (redis) {
        const pipe = redis.pipeline();
        for (const e of events) {
          const browser = (e.browser || 'unknown').toLowerCase();
          const msgKey  = (e.errorMessage || 'unknown').toLowerCase();
  
          // global top
          pipe.zincrby('errors:top:browsers', 1, browser);
          pipe.zincrby('errors:top:messages', 1, msgKey);
  
          // rolling 1h bucket (pocev od pune ure), TTL 2h
          const bucket = new Date();
          bucket.setMinutes(0, 0, 0); // 1h buckets
          const bISO = bucket.toISOString();
          const keyBrowsers1h = `errors:top:browsers:1h:${bISO}`;
          const keyMessages1h = `errors:top:messages:1h:${bISO}`;
          pipe.zincrby(keyBrowsers1h, 1, browser).expire(keyBrowsers1h, 60*60*2);
          pipe.zincrby(keyMessages1h, 1, msgKey).expire(keyMessages1h, 60*60*2);
        }
        await pipe.exec();
      }
    };
  }
