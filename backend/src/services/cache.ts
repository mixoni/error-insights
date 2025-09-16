import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis(process.env.REDIS_URL!);
const ttl = Number(process.env.CACHE_TTL_SECONDS || 90);


export function cacheKey(prefix: string, obj: unknown) {
    const s = JSON.stringify(obj, Object.keys(obj as any).sort());
    const h = crypto.createHash('sha1').update(s).digest('hex');
    return `${prefix}:${h}`;
}


export async function cacheGet<T>(key: string): Promise<T | null> {
    const s = await redis.get(key);
    return s ? (JSON.parse(s) as T) : null;
}


export async function cacheSet(key: string, val: unknown) {
    await redis.set(key, JSON.stringify(val), 'EX', ttl);
}