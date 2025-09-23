import { describe, it, expect } from 'vitest';
import Redis from 'ioredis-mock';

describe('Redis widgets (top browsers/messages)', () => {
  it('increments and returns top-N', async () => {
    const redis = new Redis();

    await redis.zincrby('errors:top:browsers', 1, 'chrome');
    await redis.zincrby('errors:top:browsers', 5, 'firefox');
    await redis.zincrby('errors:top:browsers', 3, 'safari');

    const raw = await redis.zrevrange('errors:top:browsers', 0, 2, 'WITHSCORES');
    const pairs = [];
    for (let i=0;i<raw.length;i+=2) {
      pairs.push({ key: raw[i], doc_count: Number(raw[i+1]) });
    }

    expect(pairs[0]).toEqual({ key: 'firefox', doc_count: 5 });
    expect(pairs.length).toBe(3);
  });
});
