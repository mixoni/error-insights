import { Router } from 'express';
import { widgetsController } from '../controllers/widgets.controller';
import Redis from 'ioredis';

export function widgetsRoutes(redis: Redis) {
  const ctrl = widgetsController(redis);
  const r = Router();
  
  r.get('/widgets/top', ctrl.top);
  
  return r;
}
