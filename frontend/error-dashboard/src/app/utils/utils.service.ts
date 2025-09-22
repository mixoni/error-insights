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