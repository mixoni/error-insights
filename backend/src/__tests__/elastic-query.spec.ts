import { describe, it, expect } from 'vitest';
import type { Client } from '@elastic/elasticsearch';
import { ElasticEventReader } from '../adapters/elastic-search/ElasticEventReader';

class TestableReader extends ElasticEventReader {
  public testBuildQuery(filters: any) {
    return (this as any).buildQuery(filters);
  }
}

describe('ElasticEventReader.buildQuery', () => {
  const es = {} as unknown as Client;
  const reader = new TestableReader(es, 'error_events');

  it('adds range only when start/end are present', () => {
    const q1 = reader.testBuildQuery({});
    expect(q1).toEqual({ bool: { must: [], filter: [] } });

    const q2 = reader.testBuildQuery({ start: '2025-01-01T00:00:00Z' });
    expect(q2.bool.filter[0].range.timestamp.gte).toBe('2025-01-01T00:00:00Z');

    const q3 = reader.testBuildQuery({ end: '2025-02-01T00:00:00Z' });
    expect(q3.bool.filter[0].range.timestamp.lte).toBe('2025-02-01T00:00:00Z');

    const q4 = reader.testBuildQuery({ start: '2025-01-01', end: '2025-02-01' });
    expect(q4.bool.filter[0].range.timestamp).toMatchObject({
      gte: '2025-01-01',
      lte: '2025-02-01',
    });
  });

  it('wildcards for userId/browser/url', () => {
    const q = reader.testBuildQuery({ userId: 'abc', browser: 'Chr', url: '/dash' });
    const must = q.bool.must;
    expect(must).toEqual(
      expect.arrayContaining([
        { wildcard: { userId: { value: '*abc*', case_insensitive: true } } },
        { wildcard: { browser: { value: '*Chr*', case_insensitive: true } } },
        { wildcard: { url: { value: '*/dash*', case_insensitive: true } } },
      ])
    );
  });

  it('keyword search uses multi_match + query_string', () => {
    const q = reader.testBuildQuery({ keyword: 'TypeError' });
    const must = q.bool.must;
    expect(must.some((m: any) => m.multi_match?.query === 'TypeError')).toBe(true);
    expect(must.some((m: any) => m.query_string?.query === 'TypeError*')).toBe(true);
  });
});
