import { buildAggs } from '../services/aggregate-builder.service';


test('buildAggs returns expected keys', () => {
    const a = buildAggs();
    expect(a.top_browsers).toBeDefined();
    expect(a.top_error_messages).toBeDefined();
});