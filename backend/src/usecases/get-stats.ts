import type { EventReader, SearchFilters } from '../domain/ports/EventReader';
import type { Cache } from '../domain/ports/Cache';
import { hashKey } from '../libs/hashing';

export function makeGetStats(reader: EventReader, cache: Cache, ttlSec: number) {
  return async (filters: Omit<SearchFilters,'page'|'size'|'sort'>) => {
    const key = hashKey('stats', filters);
    const cached = await cache.get<any>(key);
    if (cached) return { ...cached, cache: 'hit' as const };

    const data = await reader.stats(filters);
    await cache.set(key, data, ttlSec);
    return { ...data, cache: 'miss' as const };
  };
}
