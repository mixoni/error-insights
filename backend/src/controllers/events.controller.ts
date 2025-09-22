import type { Request, Response } from 'express';
import { validateFilters } from '../libs/validation';

export function eventsController(deps: {
  search: (f: any) => Promise<any>;
  stats: (f: any) => Promise<any>;
  ingest: (events: any[]) => Promise<void>;
  searchPIT: (f: any) => Promise<any>;
}) {
  return {
    search: async (req: Request, res: Response) => {
      const filters = validateFilters(req.query);
      const data = await deps.search(filters);
      res.json(data);
    },
    stats: async (req: Request, res: Response) => {
      const filters = validateFilters(req.query);
      const { page, size, sort, ...rest } = filters as any;
      const data = await deps.stats(rest);
      res.json(data);
    },
    ingest: async (req: Request, res: Response) => {
      await deps.ingest(req.body);
      res.status(202).json({ ok: true });
    },
    searchPIT: async (req: Request, res: Response) => {
        try {
          const data = await deps.searchPIT(req.query as any);
          res.json(data);
        } catch (e: any) {
          res.status(500).json({ error: e?.message || 'search-pt failed' });
        }
      },
  };
}
