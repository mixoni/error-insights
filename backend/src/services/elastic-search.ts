import { Client } from '@elastic/elasticsearch';


export const esClient = new Client({ node: process.env.ES_NODE! });


export async function ensureIndex(index: string) {
    try {
            await esClient.indices.create({
            index,
            settings: { number_of_shards: 1 },
            mappings: {
                properties: {
                    timestamp: { type: 'date' },
                    userId: { type: 'keyword' },
                    browser: { type: 'keyword' },
                    url: { type: 'keyword' },
                    errorMessage: { type: 'text', fields: { raw: { type: 'keyword' } } },
                    stackTrace: { type: 'text' }
                }
            }
            });
    } catch (e: any) {
        const t = e?.meta?.body?.error?.type;
        if (t !== 'resource_already_exists_exception') throw e;
    }
}