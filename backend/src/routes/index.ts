import type { FastifyInstance } from 'fastify';
import { RawEvent } from '../models/event-model';
import { esClient } from '../services/elastic-search';
import { buildESQuery } from '../services/query-builder';
import { buildAggs } from '../services/aggregate-builder';
import { cacheGet, cacheKey, cacheSet } from '../services/cache';


export function registerRoutes(app: FastifyInstance) {
app.post('/ingest', async (req, rep) => {
const body = req.body as any[];

if (!Array.isArray(body)) return rep.code(400).send({ error: 'Array required' });


const docs = body.map(e => ({
    timestamp: new Date(e.timestamp),
    userId: e.userId,
    browser: e.browser,
    url: e.url,
    errorMessage: e.errorMessage,
    stackTrace: e.stackTrace,
    raw: e
}));


await RawEvent.insertMany(docs);


const ops = body.flatMap(e => [{ index: { _index: process.env.ES_INDEX! } }, e]);
const resp = await esClient.bulk({ refresh: true, operations: ops });
return { ingested: body.length, esErrors: resp.errors };
});


app.get('/events/search', async (req, rep) => {
const { start, end, userId, browser, url, q, page = '1', size = '50', sort = 'desc' } = req.query as any;
const filters = { start, end, userId, browser, url, q, page, size, sort };


const key = cacheKey('search', filters);
const hit = await cacheGet<any>(key);
if (hit) return { cache: 'hit', ...hit };


const from = (Number(page) - 1) * Number(size);
const query = buildESQuery(filters);


const res = await esClient.search({
index: process.env.ES_INDEX!,
from,
size: Number(size),
sort: [{ timestamp: { order: sort === 'asc' ? 'asc' : 'desc' } }],
query
});


const out = {
cache: 'miss',
total: (res.hits.total as any)?.value ?? (res.hits.total as any) ?? 0,
items: res.hits.hits.map(h => ({ id: h._id, ...(h._source as object) }))
};


await cacheSet(key, out);
return out;
});


app.get('/events/stats', async (req, rep) => {
const { start, end, userId, browser, url, q } = req.query as any;
const filters = { start, end, userId, browser, url, q };


const key = cacheKey('stats', filters);
const hit = await cacheGet<any>(key);
if (hit) return { cache: 'hit', ...hit };


const res = await esClient.search({
index: process.env.ES_INDEX!,
size: 0,
query: buildESQuery(filters),
aggs: buildAggs()
});


const aggs = res.aggregations as any;
const out = {
cache: 'miss',
topBrowsers: aggs.top_browsers.buckets,
topErrorMessages: aggs.top_error_messages.buckets
};


await cacheSet(key, out);
return out;
});
}