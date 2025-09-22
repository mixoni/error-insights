import type { EventReader, SearchFilters } from '../domain/ports/EventReader';
import type { Cache } from '../domain/ports/Cache';
import { hashKey } from '../libs/hashing';
import { normalizeFiltersForCache, endMinuteBucketISO, computeLiveTtl } from '../libs/filters';
import { decodeCursor, encodeCursor } from '../libs/cursor';
import type { ElasticEventReader } from '../adapters/elastic-search/ElasticEventReader';



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

export function makeSearchEventsPIT(reader: ElasticEventReader) {
    return async (filters: SearchFilters) => {
      const size  = Math.min(500, Math.max(1, Number(filters.size ?? 50)));
      const order = filters.sort === 'asc' ? 'asc' : 'desc';
  
      if (!filters.cursor) {
        const pitId = await reader.openPit('2m');
        const { items, total, lastSort } = await reader.searchAfter({
          size, order, pitId, searchAfterSort: null, filters
        });
  
        const cursor = lastSort
          ? encodeCursor({ pitId, sort: lastSort, size, order })
          : encodeCursor({ pitId, sort: [0, ''], size, order });
  
        const done = items.length < size;
        return { items, total, cursor, done };
      }
  
      const c = decodeCursor(filters.cursor);
      const { items, total, lastSort } = await reader.searchAfter({
        size: c.size, order: c.order, pitId: c.pitId, searchAfterSort: c.sort, filters
      });
  
      const done = items.length < c.size;
      const cursor = lastSort ? encodeCursor({ ...c, sort: lastSort }) : encodeCursor(c);
      return { items, total, cursor, done };
    };
  }
