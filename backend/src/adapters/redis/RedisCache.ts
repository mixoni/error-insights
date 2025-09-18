import type { Cache } from '../../domain/ports/Cache';
import Redis from 'ioredis';

export class RedisCache implements Cache {
  constructor(private client: Redis) {}
  async get<T>(key: string): Promise<T | null> {
    const s = await this.client.get(key);
    return s ? JSON.parse(s) as T : null;
    }
  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
  }
}
