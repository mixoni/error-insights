import type { ErrorEvent } from '../ErrorEvent';

export interface EventWriter {
  saveRaw(events: ErrorEvent[]): Promise<void>;          // Mongo
  indexStructured(events: ErrorEvent[]): Promise<void>;  // ES
}
