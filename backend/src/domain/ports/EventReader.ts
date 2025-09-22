export type SearchFilters = {
    start?: string; end?: string;
    userId?: string; 
    browser?: string; 
    url?: string; keyword?: string;
    page?: number; size?: number; 
    sort?: 'asc'|'desc';
    cursor?: string;
};

  
export interface EventReader {
    search(filters: SearchFilters): Promise<{ items: any[]; total: number }>;
    stats(filters: Omit<SearchFilters, 'page'|'size'|'sort'>): Promise<{
        topBrowsers: { key: string; doc_count: number }[];
        topErrorMessages: { key: string; doc_count: number }[];
    }>;
}
