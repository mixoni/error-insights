import { Collection, MongoClient } from 'mongodb';
import type { ErrorEvent } from '../../domain/ErrorEvent';
import type { EventWriter } from '../../domain/ports/EventWriter';

export class MongoEventWriter implements EventWriter {
  private collection: Collection<ErrorEvent>;
  constructor(client: MongoClient, dbName: string) {
    const db = client.db(dbName);
    this.collection = db.collection<ErrorEvent>('raw_events');
  }
  async saveRaw(events: ErrorEvent[]): Promise<void> {
    if (!events?.length) return;
    await this.collection.insertMany(events);
  }
  async indexStructured(): Promise<void> {
  }
}
