import type { EventReader, SearchFilters } from '../domain/ports/EventReader';
import type { Cache } from '../domain/ports/Cache';
import { hashKey } from '../libs/hashing';
import { normalizeFiltersForCache, endMinuteBucketISO, computeLiveTtl } from '../libs/filters';

export function makeSearchEvents(reader: EventReader, cache: Cache, ttlSec: number) {
    return async (filters: SearchFilters) => {

      const norm = normalizeFiltersForCache(filters);
      const endBucket = endMinuteBucketISO(filters.end);
      const cacheKey = hashKey('search', { ...norm, endBucket });
  
      const cached = await cache.get<{ items:any[]; total:number }>(cacheKey);
      if (cached) return { ...cached, cache: 'hit' as const };
  
      const data = await reader.search(filters); 
      const ttl = computeLiveTtl(ttlSec, filters.end); 
      await cache.set(cacheKey, data, ttl);
      return { ...data, cache: 'miss' as const };
    };
  }
