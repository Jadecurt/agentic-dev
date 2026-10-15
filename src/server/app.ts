import fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerRoutes } from './routes.js';
import { config } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createServer(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
  });

  await app.register(fastifyCors, {
    origin: true,
  });

  await app.register(fastifyWebsocket);

  await registerRoutes(app);

  // Serve compiled web dashboard if exists
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && !req.raw.url.startsWith('/api') && !req.raw.url.startsWith('/ws')) {
        reply.sendFile('index.html');
      } else {
        reply.status(404).send({ error: 'Not Found' });
      }
    });
  }

  return app;
}

export async function startServer(port = config.port, host = config.host): Promise<FastifyInstance> {
  const app = await createServer();
  await app.listen({ port, host });
  console.log(`🚀 Agentic Dev Server running at http://${host}:${port}`);
  return app;
}
