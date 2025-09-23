import { describe, it, expect, vi } from 'vitest';
import { ElasticEventReader } from '../adapters/elastic-search/ElasticEventReader';

describe('ElasticEventReader.bulkIndex', () => {
  it('builds proper bulk payload (no _id, ISO timestamp) and calls es.bulk', async () => {
    const es = {
      bulk: vi.fn().mockResolvedValue({ errors: false, items: [{ index: { status: 201 } }] }),
    } as any;

    const reader = new ElasticEventReader(es, 'error_events');

    const events = [
      { _id: 'mongoId', __v: 0, timestamp: '2025-07-15T10:10:00Z', userId: 'u1', browser: 'Chrome', url: '/x', errorMessage: 'oops' }
    ];

    await reader.bulkIndex(events);

    expect(es.bulk).toHaveBeenCalledTimes(1);
    const arg = es.bulk.mock.calls[0][0];
    expect(arg.operations[0]).toEqual({ index: { _index: 'error_events' } });
    expect(arg.operations[1]).toMatchObject({
      timestamp: '2025-07-15T10:10:00.000Z',
      userId: 'u1',
      browser: 'Chrome',
    });
  });
});
