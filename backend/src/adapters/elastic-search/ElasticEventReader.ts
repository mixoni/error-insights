import { Client } from '@elastic/elasticsearch';
import type { EventReader, SearchFilters } from '../../domain/ports/EventReader';
import { ENV } from '../../config/env';

type ESBucket = { key: string; doc_count: number };

export class ElasticEventReader implements EventReader {
  constructor(private es: Client, private index = ENV.ES_INDEX) {}

  /**
   * Ako korisnik ne pošalje start/end → podrazumevani rang je poslednjih 24h.
   * Tako izbegavamo "full index scan" i dobijamo očekivano ponašanje za logove.
   */
  private withDefaultRange(filters: SearchFilters): Required<Pick<SearchFilters, 'start' | 'end'>> & SearchFilters {
    if (filters.start || filters.end) return filters as any;
    const end = new Date();
    const start = new Date(end.getTime() - 100 * 24 * 60 * 60 * 1000);
    return { ...filters, start: start.toISOString(), end: end.toISOString() } as any;
  }

  /**
   * Gradimo “mekšu” upit-ku:
   * - Date range (ako postoji, inače default 24h).
   * - keyword polja (userId/browser/url) pretražujemo wildcard-om (case-insensitive, contains).
   * - q ide na text polja (errorMessage^2, stackTrace) sa fuzziness + prefix boost.
   */
  private buildQuery(filters: SearchFilters) {
    const filtersWithDefaultPeriod = {...filters}; // this.withDefaultRange(filters);
    console.log('ES query filters:', filtersWithDefaultPeriod);
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

    // helper za wildcard (case-insensitive "contains")
    const wc = (field: string, value?: string) =>
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

    if (filtersWithDefaultPeriod.userId) must.push(wc('userId', filtersWithDefaultPeriod.userId)!);
    if (filtersWithDefaultPeriod.browser) must.push(wc('browser', filtersWithDefaultPeriod.browser)!);
    if (filtersWithDefaultPeriod.url) must.push(wc('url', filtersWithDefaultPeriod.url)!);

    // full-text upit
    if (filtersWithDefaultPeriod.q) {
      must.push({
        multi_match: {
          query: filtersWithDefaultPeriod.q,
          fields: ['errorMessage^2', 'stackTrace'],
          type: 'best_fields',
          operator: 'and',
          fuzziness: 'AUTO',
        },
      });
      // dodatni prefix boost (npr. "undef" pogodi "undefined")
      must.push({
        query_string: {
          query: `${filtersWithDefaultPeriod.q}*`,
          fields: ['errorMessage^2', 'stackTrace'],
          default_operator: 'AND',
        },
      });
    }

    return { bool: { must, filter } };
  }

  async search(filters: SearchFilters) {
    const f = this.withDefaultRange(filters);

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

    // total može biti number ili { value }
    const total =
      typeof (resp.hits.total as any) === 'number'
        ? (resp.hits.total as any)
        : ((resp.hits.total as any)?.value ?? 0);

    const items = (resp.hits.hits as any[]).map((h) => ({ id: h._id, ...h._source }));

    return { items, total };
  }

  async stats(filters: Omit<SearchFilters, 'page' | 'size' | 'sort'>) {
    const f = this.withDefaultRange(filters);

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

  // Bulk index helper (za ingest use-case)
  async bulkIndex(events: any[]) {
    if (!events?.length) return;
    const operations: any[] = [];
    for (const e of events) {
      operations.push({ index: { _index: this.index } });
      operations.push(e);
    }
    await this.es.bulk({ refresh: true, operations });
  }
}
