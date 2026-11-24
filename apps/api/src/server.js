import { buildApp } from './app.js';

const app = await buildApp();

let isShuttingDown = false;

/**
 * Gracefully close Fastify server (including Prisma & Redis via onClose hooks).
 * @param {string} signal
 */
async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  app.log.info({ signal }, 'Received shutdown signal, closing HTTP server and connections');
  try {
    await app.close();
    app.log.info('Server closed cleanly');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await app.listen({ port: app.env.PORT, host: app.env.HOST });
  app.log.info(
    { port: app.env.PORT, host: app.env.HOST, swagger: app.env.SWAGGER_ENABLED },
    'DirtFit API server started'
  );
} catch (err) {
  app.log.error({ err }, 'Failed to start DirtFit API server');
  await app.close().catch(() => {});
  process.exit(1);
}
