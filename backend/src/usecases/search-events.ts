import type { EventReader, SearchFilters } from '../domain/ports/EventReader';
import type { Cache } from '../domain/ports/Cache';
import { hashKey } from '../libs/hashing';

export function makeSearchEvents(reader: EventReader, cache: Cache, ttlSec: number) {
  return async (filters: SearchFilters) => {
    const key = hashKey('search', filters);
    const cached = await cache.get<{ items:any[]; total:number }>(key);
    if (cached) return { ...cached, cache: 'hit' as const };

    const data = await reader.search(filters);
    await cache.set(key, data, ttlSec);
    return { ...data, cache: 'miss' as const };
  };
}
