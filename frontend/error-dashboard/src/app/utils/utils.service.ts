import { HttpParams } from '@angular/common/http';

export function toHttpParams(obj: Record<string, any>) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null) {
        p = p.set(k, String(v));
      }
    }
    return p;
  }