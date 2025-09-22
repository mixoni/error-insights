import { Client } from '@elastic/elasticsearch';
import type { EventReader, SearchFilters } from '../../domain/ports/EventReader';
import { ENV } from '../../config/env';

type ESBucket = { key: string; doc_count: number };

export class ElasticEventReader implements EventReader {
  constructor(private es: Client, private index = ENV.ES_INDEX) {}

  private buildQuery(filters: SearchFilters) {
    const must: any[] = [];
    const filter: any[] = [];

    // date range samo ako je prosleđen (nema podrazumevanog)
    if (filters.start || filters.end) {
      filter.push({
        range: {
          timestamp: {
            ...(filters.start ? { gte: filters.start } : {}),
            ...(filters.end   ? { lte: filters.end }   : {}),
          }
        }
      });
    }

    const wildCardWrapper = (field: string, value?: string) =>
      value
        ? { wildcard: { [field]: { value: `*${value}*`, case_insensitive: true } } }
        : null;

    if (filters.userId)  must.push(wildCardWrapper('userId',  filters.userId)!);
    if (filters.browser) must.push(wildCardWrapper('browser', filters.browser)!);
    if (filters.url)     must.push(wildCardWrapper('url',     filters.url)!);

    // full-text (errorMessage, stackTrace)
    if (filters.keyword) {
      must.push({
        multi_match: {
          query: filters.keyword,
          fields: ['errorMessage^2', 'stackTrace'],
          type: 'best_fields',
          operator: 'and',
          fuzziness: 'AUTO',
        },
      });
      must.push({
        query_string: {
          query: `${filters.keyword}*`,
          fields: ['errorMessage^2', 'stackTrace'],
          default_operator: 'AND',
        },
      });
    }

    return { bool: { must, filter } };
  }

  async search(filters: SearchFilters) {
    const page = Math.max(1, Number(filters.page ?? 1));
    const size = Math.min(500, Math.max(1, Number(filters.size ?? 50)));
    const from = (page - 1) * size;
    const sortOrder = filters.sort === 'asc' ? 'asc' : 'desc';

    const resp = await this.es.search({
      index: this.index,
      from,
      size,
      sort: [{ timestamp: { order: sortOrder } }],
      query: this.buildQuery(filters),
      _source: ['timestamp','userId','browser','url','errorMessage','stackTrace'],
    });

    const total =
      typeof (resp.hits.total as any) === 'number'
        ? (resp.hits.total as any)
        : ((resp.hits.total as any)?.value ?? 0);

    const items = (resp.hits.hits as any[]).map(h => ({ id: h._id, ...h._source }));
    return { items, total };
  }

  async stats(filters: Omit<SearchFilters, 'page'|'size'|'sort'>) {
    const resp = await this.es.search({
      index: this.index,
      size: 0,
      query: this.buildQuery(filters),
      aggs: {
        topBrowsers:      { terms: { field: 'browser', size: 5, missing: 'unknown' } },
        topErrorMessages: { terms: { field: 'errorMessage.keyword', size:    5, missing: 'unknown' } },
      },
    });

    const aggs: any = resp.aggregations || {};
    const topBrowsers: ESBucket[] =
      (aggs.topBrowsers?.buckets ?? []).map((b: any) => ({ key: b.key ?? 'unknown', doc_count: b.doc_count }));
    const topErrorMessages: ESBucket[] =
      (aggs.topErrorMessages?.buckets ?? []).map((b: any) => ({ key: b.key ?? 'unknown', doc_count: b.doc_count }));

    return { topBrowsers, topErrorMessages };
  }

  async bulkIndex(events: any[]) {
    console.log(`Bulk indexing ${events.length} events to ES...`);
    if (!events?.length) return;

    console.log(`INDEX ===>`, this.index);
    const operations: any[] = [];
    for (const e of events) {
        const { _id, __v, ...doc } = e ?? {};
      operations.push({ index: { _index: this.index } });
      if (doc.timestamp) doc.timestamp = new Date(doc.timestamp).toISOString();
      operations.push(doc);
    }
    const resp = await this.es.bulk({ refresh: true, operations });

    const items = (resp as any).items ?? [];
    if ((resp as any).errors) {
    const failures = items
        .map((it: any, i: number) => ({ i, status: it.index?.status, error: it.index?.error }))
        .filter((x: any) => !!x.error);
    console.error(`[ES bulk] ERRORS ${failures.length}/${items.length} ->`, failures.slice(0,3));
    } else {
    console.log(`[ES bulk] OK indexed=${items.length} index=${this.index}`);
    }
  }


  //#region Point-in-time (PIT) search after for dataset more than 10k items. Need to adjust different UI and UX for this. 
  async openPit(keepAlive: string = '2m') {
    const resp = await this.es.openPointInTime({
      index: this.index,
      keep_alive: keepAlive,
      // headers compat ako koristiš ES 8.x: accept v8
    });
    return resp.id as string;
  }

  async closePit(pitId: string) {
    try { await this.es.closePointInTime({ body: { id: pitId } }); } catch {}
  }

  async searchAfter(params: {
    size: number;
    order: 'asc' | 'desc';
    pitId: string;
    searchAfterSort?: [number | string, string] | null;
    filters: any;
  }) {
    const { size, order, pitId, searchAfterSort, filters } = params;

    const body: any = {
      size: Math.min(500, Math.max(1, size)),
      sort: [
        { timestamp: { order } },
        { _id: { order } }
      ],
      query: this.buildQuery(filters),
      _source: ['timestamp','userId','browser','url','errorMessage','stackTrace'],
      pit: { id: pitId, keep_alive: '2m' }
    };
    if (searchAfterSort) body.search_after = searchAfterSort;

    const resp = await this.es.search(body);
    const hits = (resp.hits?.hits ?? []) as any[];
    const items = hits.map(h => ({ id: h._id, ...(h._source || {}) }));
    const lastSort = hits.length ? (hits[hits.length - 1].sort as any) : null;

    const total = (resp.hits.total as any)?.value ?? 0;
    return { items, total, lastSort };
  }
  //#endregion
}
