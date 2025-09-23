import { describe, it, expect, vi } from 'vitest';
import { makeSearchEvents } from '../usecases/search-events';

describe('search use case with Redis-like cache', () => {
  it('returns miss on first call, hit on second (same filters)', async () => {
    const reader = {
      search: vi.fn().mockResolvedValue({ items: [{ id: 1 }], total: 1 }),
    };

    // very small in-memory cache mock
    const store = new Map<string, any>();
    const cache = {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: any) => store.set(k, v)),
    };

    const search = makeSearchEvents(reader as any, cache as any, 60);

    const filters: { page: number; size: number; sort: 'desc' | 'asc' } = { page: 1, size: 50, sort: 'desc' };

    const first = await search(filters);
    expect(first.cache).toBe('miss');
    expect(first.items.length).toBe(1);
    expect(reader.search).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);

    const second = await search(filters);
    expect(second.cache).toBe('hit');
    expect(second.items.length).toBe(1);
    expect(reader.search).toHaveBeenCalledTimes(1); 
  });

  it('different filters produce a cache miss', async () => {
    const reader = {
      search: vi.fn()
        .mockResolvedValueOnce({ items: [{ id: 'A' }], total: 1 })
        .mockResolvedValueOnce({ items: [{ id: 'B' }], total: 1 }),
    };
    const store = new Map<string, any>();
    const cache = {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: any) => store.set(k, v)),
    };
    const search = makeSearchEvents(reader as any, cache as any, 60);

    const f1: { page: number; size: number; sort: 'desc' | 'asc'; userId: string } = { page: 1, size: 50, sort: 'desc', userId: 'u1' };
    const f2: { page: number; size: number; sort: 'desc' | 'asc'; userId: string } = { page: 1, size: 50, sort: 'desc', userId: 'u2' };

    const r1 = await search(f1);
    expect(r1.cache).toBe('miss');

    const r2 = await search(f2);
    expect(r2.cache).toBe('miss'); 
    expect(reader.search).toHaveBeenCalledTimes(2);
  });
});
