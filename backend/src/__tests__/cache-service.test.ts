
const mockGet = jest.fn<Promise<string | null>, [string]>();
const mockSet = jest.fn<Promise<unknown>, [string, string, string, number]>();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
  }));
});

import { cacheKey, cacheGet, cacheSet } from '../services/cache';


beforeEach(() => {
    jest.clearAllMocks();
  });

describe('cacheKey', () => {
    it('generates a consistent key for the same input', () => {
        const key1 = cacheKey('prefix', { a: 1, b: 2 });
        const key2 = cacheKey('prefix', { b: 2, a: 1 });
        expect(key1).toBe(key2);
    });

    it('generates different keys for different inputs', () => {
        const key1 = cacheKey('prefix', { a: 1, b: 2 });
        const key2 = cacheKey('prefix', { a: 1, b: 3 });
        expect(key1).not.toBe(key2);
    });

    it('includes the prefix in the key', () => {
        const key = cacheKey('myprefix', { a: 1 });
        expect(key.startsWith('myprefix:')).toBe(true);
    });
});

describe('cacheGet', () => {
    it('returns parsed value if key exists in cache', async () => {
        const key = 'test-key';
        const value = { a: 1, b: 2 };
        mockGet.mockResolvedValueOnce(JSON.stringify(value));

        const result = await cacheGet<typeof value>(key);
        expect(result).toEqual(value);
        expect(mockGet).toHaveBeenCalledWith(key);
    });

    it('returns null if key does not exist in cache', async () => {
        const key = 'non-existent-key';
        mockGet.mockResolvedValueOnce(null);

        const result = await cacheGet(key);
        expect(result).toBeNull();
        expect(mockGet).toHaveBeenCalledWith(key);
    });
});

describe('cacheSet', () => {
    it('sets the value in cache with the correct TTL', async () => {
        const key = 'test-key';
        const value = { a: 1, b: 2 };
        const ttl = Number(process.env.CACHE_TTL_SECONDS || 90);

        await cacheSet(key, value);
        expect(mockSet).toHaveBeenCalledWith(key, JSON.stringify(value), 'EX', ttl);
    });
});