import type { EventReader, SearchFilters } from '../domain/ports/EventReader';
import type { Cache } from '../domain/ports/Cache';
import { hashKey } from '../libs/hashing';
import { normalizeFiltersForCache, endMinuteBucketISO, computeLiveTtl } from '../libs/filters';

export function makeGetStats(reader: EventReader, cache: Cache, ttlSec: number) {
    return async (filters: Omit<SearchFilters,'page'|'size'|'sort'>) => {
      const norm = normalizeFiltersForCache(filters);
      const { page, size, sort, ...forKey } = norm as any;
      const endBucket = endMinuteBucketISO(filters.end);
      const cacheKey = hashKey('stats', { ...forKey, endBucket });
  
      const cached = await cache.get<any>(cacheKey);
      if (cached) return { ...cached, cache: 'hit' as const };
  
      const data = await reader.stats(filters);
      const ttl = computeLiveTtl(ttlSec, filters.end);
      await cache.set(cacheKey, data, ttl);
      return { ...data, cache: 'miss' as const };
    };
  }
