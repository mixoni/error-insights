export function normalizeFiltersForCache(f: any) {
    const lc = (s?: string) => (s ?? '').trim().toLowerCase();
    const roundIsoToMin = (iso?: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      d.setSeconds(0, 0); // round to minute
      return d.toISOString();
    };
    return {
      ...f,
      start: roundIsoToMin(f.start),
      end:   roundIsoToMin(f.end),
      userId:  lc(f.userId),
      browser: lc(f.browser),
      url:     lc(f.url),
      q:       lc(f.q),
      page: Number(f.page ?? 1),
      size: Number(f.size ?? 50),
      sort: f.sort === 'asc' ? 'asc' : 'desc',
    };
  }
  
  // minute bucket that "pushes" live windows to automatically get a new key when a minute passes
  export function endMinuteBucketISO(endIso?: string) {
    const end = endIso ? new Date(endIso) : new Date();
    end.setSeconds(0, 0);
    return end.toISOString();
  }
  
  // shorter TTL for live windows (end close to now) – e.g. 5s
  export function computeLiveTtl(baseTtlSec: number, endIso?: string, liveWindowMs = 60_000) {
    const now = Date.now();
    const endMs = endIso ? Date.parse(endIso) : now;
    const isLive = (now - endMs) <= liveWindowMs;
    return isLive ? 5 : baseTtlSec; 
  }
  