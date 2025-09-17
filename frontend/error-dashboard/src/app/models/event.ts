export interface EventItem {
    id: string;
    timestamp: string;
    userId?: string;
    browser?: string;
    url?: string;
    errorMessage: string;
    stackTrace?: string;
}


export interface SearchResponse {
    cache: 'hit' | 'miss';
    total: number;
    items: EventItem[];
}


export interface StatsResponse {
    cache: 'hit' | 'miss';
    topBrowsers: { key: string; doc_count: number }[];
    topErrorMessages: { key: string; doc_count: number }[];
}