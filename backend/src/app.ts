import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { connectMongo } from './services/mongo';
import { ensureIndex } from './services/elastic-search';
import { registerRoutes } from './routes';


export async function buildApp() {
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });


await connectMongo(process.env.MONGO_URI!);
await ensureIndex(process.env.ES_INDEX!);


app.get('/health', async () => ({ ok: true }));
    registerRoutes(app);
    return app;
}


if (require.main === module) {
    buildApp().then(app => app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' }));
}