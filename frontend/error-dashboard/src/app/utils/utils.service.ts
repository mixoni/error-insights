import { HttpParams } from '@angular/common/http';

export const AUTO_REFRESH_MS = 10000;

export function toHttpParams(obj: Record<string, any>) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null) {
        p = p.set(k, String(v));
      }
    }
    return p;
  }

 export function isPresent(v: unknown): boolean {
    if (v == null) return false;                      
    if (typeof v === 'string') return v.trim() !== ''; 
    if (Array.isArray(v)) return v.length > 0;        
    return true;
  }
  
 export function prune<T extends Record<string, any>>(o: T): Partial<T> {
    return Object.fromEntries(Object.entries(o).filter(([_, v]) => isPresent(v))) as Partial<T>;
  }

  export function adaptStats(raw: any) {
    if (!raw) return { topBrowsers: [], topErrorMessages: [] };
  
    // Neke varijante: raw.topBrowsers | raw.top_browser | raw.browsers
    const bsrc = raw.topBrowsers ?? raw.browsers ?? [];
    const msrc = raw.topErrorMessages ?? raw.topMessages ?? raw.messages ?? [];
  
    const norm = (arr: any[]) =>
      (arr ?? []).map((x: any) => ({
        key: String(x.key ?? x.member ?? x.name ?? 'unknown'),
        doc_count: Number(
          x.doc_count ?? x.count ?? x.score ?? x.value ?? 0
        ),
      }));
  
    return {
      topBrowsers: norm(bsrc),
      topErrorMessages: norm(msrc),
    };
  }
  