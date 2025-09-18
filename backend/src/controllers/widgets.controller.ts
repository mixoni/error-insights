import type { Request, Response } from 'express';
import Redis from 'ioredis';

export function widgetsController(redis: Redis) {
  return {
    top: async (req: Request, res: Response) => {
      const scope = (req.query.scope as string) || 'global';
      const size  = Math.min(20, Math.max(1, Number(req.query.size ?? 5)));

      const pickKey = (base: string) => {
        if (scope === '1h') {
          const b = new Date(); b.setMinutes(0,0,0);
          return `${base}:1h:${b.toISOString()}`;
        }
        return base; 
      };

      const [msg, brw] = await Promise.all([
        redis.zrevrange(pickKey('errors:top:messages'), 0, size - 1, 'WITHSCORES'),
        redis.zrevrange(pickKey('errors:top:browsers'), 0, size - 1, 'WITHSCORES'),
      ]);

      const toPairs = (arr: string[]) => {
        const out: { key: string; count: number }[] = [];
        for (let i = 0; i < arr.length; i += 2) out.push({ key: arr[i] || '', count: Number(arr[i+1]) });
        return out;
      };

      res.json({
        scope,
        topErrorMessages: toPairs(msg),
        topBrowsers: toPairs(brw),
        cache: 'hit'
      });
    }
  };
}
