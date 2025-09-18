import { z } from 'zod';

export const filtersSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  userId: z.string().optional(),
  browser: z.string().optional(),
  url: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  size: z.coerce.number().int().min(1).max(500).default(50).optional(),
  sort: z.enum(['asc','desc']).default('desc').optional()
});

export const validateFilters = (q: any) => filtersSchema.parse(q);
