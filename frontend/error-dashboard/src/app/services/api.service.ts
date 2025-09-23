import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SearchResponse, StatsResponse } from '../models/event';
import { toHttpParams } from '../utils/utils.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
    constructor(private http: HttpClient) {}

    private buildParams(obj: Record<string, any>) {
        const params: any = {};
        Object.entries(obj).forEach(([k, v]) => {
          if (v === null || v === undefined) return;
          if (typeof v === 'string' && v.trim() === '') return;
          params[k] = v;
        });
        return params;
      }

    getSearch(params: any): Observable<SearchResponse> {
        const p = this.buildParams(params);
        return this.http.get<SearchResponse>('/api/events/search', { params: p });
    }

    getStats(params: any): Observable<StatsResponse> {
        const p = this.buildParams(params);
        return this.http.get<StatsResponse>('/api/events/stats', { params: p });
    }
    getWidgetsTop(scope: 'global' | '1h' = '1h', size = 5) {
        const params = new HttpParams().set('scope', scope).set('size', String(size));
        return this.http.get<{ 
            scope: string;
            topErrorMessages: { key: string; count: number }[];
            topBrowsers: { key: string; count: number }[];
            cache?: 'hit'|'miss';
        }>('/api/widgets/top', { params });
    }

    getSearchPt(params: any) {
        const p = this.buildParams(params);
        return this.http.get<any>('/api/events/search-pt', { params:p });
      }
}