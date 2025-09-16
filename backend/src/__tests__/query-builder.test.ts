import { buildESQuery } from '../services/query-builder';


test('buildESQuery adds range and terms', () => {
    const q = buildESQuery({ start: '2025-01-01', end: '2025-12-31', userId: 'u1', browser: 'Chrome', url: '/x', q: 'TypeError' });
    expect(q.bool.filter.length).toBeGreaterThanOrEqual(3);
    expect(q.bool.must.length).toBe(1);
});