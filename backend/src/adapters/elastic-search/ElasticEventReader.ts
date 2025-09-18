import { Client } from '@elastic/elasticsearch';
import type { EventReader, SearchFilters } from '../../domain/ports/EventReader';
import { ENV } from '../../config/env';

type ESBucket = { key: string; doc_count: number };

export class ElasticEventReader implements EventReader {
  constructor(private es: Client, private index = ENV.ES_INDEX) {}

  private withDefaultRange(filters: SearchFilters): Required<Pick<SearchFilters, 'start' | 'end'>> & SearchFilters {
    if (filters.start || filters.end) return filters as any;
    const end = new Date();
    const start = new Date(end.getTime() - 100 * 24 * 60 * 60 * 1000);
    return { ...filters, start: start.toISOString(), end: end.toISOString() } as any;
  }


  private buildQuery(filters: SearchFilters) {
    const filtersWithDefaultPeriod = {...filters}; // this.withDefaultRange(filters);

    const must: any[] = [];
    const filter: any[] = [];

    // date range
    filter.push({
      range: {
        timestamp: {
          ...(filtersWithDefaultPeriod.start ? { gte: filtersWithDefaultPeriod.start } : {}),
          ...(filtersWithDefaultPeriod.end ? { lte: filtersWithDefaultPeriod.end } : {}),
        },
      },
    });


    if (filtersWithDefaultPeriod.userId) must.push(this.wildCard('userId', filtersWithDefaultPeriod.userId)!);
    if (filtersWithDefaultPeriod.browser) must.push(this.wildCard('browser', filtersWithDefaultPeriod.browser)!);
    if (filtersWithDefaultPeriod.url) must.push(this.wildCard('url', filtersWithDefaultPeriod.url)!);


    if (filtersWithDefaultPeriod.keyword) {
      must.push({
        multi_match: {
          query: filtersWithDefaultPeriod.keyword,
          fields: ['errorMessage^2', 'stackTrace'],
          type: 'best_fields',
          operator: 'and',
          fuzziness: 'AUTO',
        },
      });

      must.push({
        query_string: {
          query: `${filtersWithDefaultPeriod.keyword}*`,
          fields: ['errorMessage^2', 'stackTrace'],
          default_operator: 'AND',
        },
      });
    }

    return { bool: { must, filter } };
  }

  async search(filters: SearchFilters) {
    const f = {...filters}; //this.withDefaultRange(filters);

    const page = Math.max(1, Number(f.page ?? 1));
    const size = Math.min(500, Math.max(1, Number(f.size ?? 50)));
    const from = (page - 1) * size;
    const sortOrder = f.sort === 'asc' ? 'asc' : 'desc';

    const resp = await this.es.search({
      index: this.index,
      from,
      size,
      sort: [{ timestamp: { order: sortOrder } }],
      query: this.buildQuery(f),
      _source: ['timestamp', 'userId', 'browser', 'url', 'errorMessage', 'stackTrace'],
    });

    // 
    const total =
      typeof (resp.hits.total as any) === 'number'
        ? (resp.hits.total as any)
        : ((resp.hits.total as any)?.value ?? 0);

    const items = (resp.hits.hits as any[]).map((h) => ({ id: h._id, ...h._source }));

    return { items, total };
  }

  async stats(filters: Omit<SearchFilters, 'page' | 'size' | 'sort'>) {
    const f = {...filters}; //this.withDefaultRange(filters);

    const resp = await this.es.search({
      index: this.index,
      size: 0,
      query: this.buildQuery(f),
      aggs: {
        topBrowsers: { terms: { field: 'browser', size: 5, missing: 'unknown' } },
        topErrorMessages: {
          terms: { field: 'errorMessage.keyword', size: 5, missing: 'unknown' },
        },
      },
    });

    const aggs: any = resp.aggregations || {};
    const topBrowsers: ESBucket[] = (aggs.topBrowsers?.buckets ?? []).map((b: any) => ({
      key: b.key ?? 'unknown',
      doc_count: b.doc_count,
    }));
    const topErrorMessages: ESBucket[] = (aggs.topErrorMessages?.buckets ?? []).map((b: any) => ({
      key: b.key ?? 'unknown',
      doc_count: b.doc_count,
    }));

    return { topBrowsers, topErrorMessages };
  }

  async bulkIndex(events: any[]) {
    if (!events?.length) return;
    const operations: any[] = [];
    for (const e of events) {
      operations.push({ index: { _index: this.index } });
      operations.push(e);
    }
    await this.es.bulk({ refresh: true, operations });
  }

  wildCard = (field: string, value?: string) =>
    value
      ? {
          wildcard: {
            [field]: {
              value: `*${value}*`,
              case_insensitive: true,
            },
          },
        }
      : null;
}
