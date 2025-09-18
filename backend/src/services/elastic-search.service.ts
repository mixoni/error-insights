import { Client } from '@elastic/elasticsearch';
import { ENV } from '../config/env';
import { logger } from '../libs/logger';

export async function ensureIndex(es: Client) {
  const index = ENV.ES_INDEX;

  try {
    const exists = await es.indices.exists({ index });
    if (exists) {
      logger.info(`Elasticsearch index "${index}" already exirt!`);
      return;
    }

    await es.indices.create({
      index,
      settings: { number_of_shards: 1 },
      mappings: {
        properties: {
          timestamp:   { type: 'date' },
          userId:      { type: 'keyword' },
          browser:     { type: 'keyword' },
          url:         { type: 'keyword' },
          errorMessage:{ type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
          stackTrace:  { type: 'text' }
        }
      }
    });

    logger.info(`Elasticsearch index "${index}" has been created!`);
  } catch (err) {
    logger.error({ err }, 'Error during ensureIndex');
    throw err;
  }
}
