type Filters = { start?: string; end?: string; userId?: string; browser?: string; url?: string; q?: string };

export function buildESQuery(f: Filters) {
    const must: any[] = [];
    const filter: any[] = [];
    
    if (f.start || f.end) filter.push({ range: { timestamp: { gte: f.start, lte: f.end } } });
    if (f.userId) filter.push({ term: { userId: f.userId } });
    if (f.browser) filter.push({ term: { browser: f.browser } });
    if (f.url) filter.push({ term: { url: f.url } });
    if (f.q) must.push({ simple_query_string: { query: f.q, fields: ['errorMessage', 'stackTrace'] } });
    
    return { bool: { must, filter } };
}