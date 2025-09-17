import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SearchResponse, StatsResponse } from '../models/event';


@Injectable({ providedIn: 'root' })
export class ApiService {
constructor(private http: HttpClient) {}


getSearch(params: any): Observable<SearchResponse> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { 
        if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v)); 
    });
    return this.http.get<SearchResponse>('/api/events/search', { params: p });
}

getStats(params: any): Observable<StatsResponse> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { 
        if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v)); 
    });
    return this.http.get<StatsResponse>('/api/events/stats', { params: p });
}
}