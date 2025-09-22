import { Router } from 'express';
import { eventsController } from '../controllers/events.controller';

export function eventsRoutes(ctrl: ReturnType<typeof eventsController>) {
  const r = Router();
  r.get('/events/search', ctrl.search);
  r.get('/events/stats', ctrl.stats);
  r.post('/ingest', ctrl.ingest);
  r.get('/events/search-pt', ctrl.searchPIT);
  
  return r;
}
