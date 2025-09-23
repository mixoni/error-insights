export type NormalizedFilters = {
    start?: string; end?: string;
    userId?: string; browser?: string; url?: string; keyword?: string;
    page?: number; size?: number; sort?: 'asc'|'desc';
    cursor?: string;
  };
  
  export function toISOOrUndef(s?: string) {
    if (!s) return undefined;
    const d = new Date(s);
    return isNaN(+d) ? undefined : d.toISOString();
  }
  
  export function normalizeFilters(f: any, extra?: Partial<NormalizedFilters>): NormalizedFilters {
    const out: Record<string, any> = {};
    const set = (k: string, v: any) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return;
        out[k] = t;
      } else out[k] = v;
    };
  
    set('start',   toISOOrUndef(f.start));
    set('end',     toISOOrUndef(f.end));
    set('userId',  f.userId);
    set('browser', f.browser);
    set('url',     f.url);
    set('keyword', f.q);
    set('page',    Number(f.page ?? 1));
    set('size',    Number(f.size ?? 50));
    set('sort',    f.sort === 'asc' ? 'asc' : 'desc');
  
    if (extra) Object.entries(extra).forEach(([k, v]) => {
      if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) out[k] = v;
    });
  
    return out as NormalizedFilters;
  }
  
  export function dateRangeValidatorFn(maxNowISO: string) {
    return (group: any) => {
      const start = group.get('start')?.value;
      const end   = group.get('end')?.value;
      const errors: any = {};
      if (start && start > maxNowISO) errors['startInFuture'] = true;
      if (end && end > maxNowISO)     errors['endInFuture']   = true;
      if (start && end && start > end) errors['startAfterEnd'] = true;
      return Object.keys(errors).length ? errors : null;
    };
  }
  