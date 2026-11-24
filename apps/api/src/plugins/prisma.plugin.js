import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export default fp(
  async function prismaPlugin(app, opts = {}) {
    const owned = !opts.prismaClient;
    const prisma = opts.prismaClient ?? new PrismaClient();

    app.decorate('prisma', prisma);

    if (owned) {
      app.addHook('onClose', async () => {
        await prisma.$disconnect();
      });
    }
  },
  { name: 'prisma-plugin' }
);
