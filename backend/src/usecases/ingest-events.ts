import type { ErrorEvent } from '../domain/ErrorEvent';
import type { EventWriter } from '../domain/ports/EventWriter';
import { ElasticEventReader } from '../adapters/elastic-search/ElasticEventReader';

export function makeIngestEvents(writer: EventWriter, esIndexer: ElasticEventReader) {
  return async (events: ErrorEvent[]) => {
    if (!Array.isArray(events) || !events.length) return;

    await writer.saveRaw(events);

    await esIndexer.bulkIndex(events);
  };
}
