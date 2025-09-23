import { z } from 'zod';

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

export const filtersSchema = z.object({
  start: z.preprocess(emptyToUndef, z.string().datetime().optional()),
  end:   z.preprocess(emptyToUndef, z.string().datetime().optional()),
  userId:  z.preprocess(emptyToUndef, z.string().optional()),
  browser: z.preprocess(emptyToUndef, z.string().optional()),
  url:     z.preprocess(emptyToUndef, z.string().optional()),
  q:       z.preprocess(emptyToUndef, z.string().optional()),
  page: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).default(1)).optional(),
  size: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(500).default(50)).optional(),
  sort: z.preprocess(emptyToUndef, z.enum(['asc','desc']).default('desc')).optional(),
});

export const validateFilters = (q: any) => filtersSchema.parse(q);
