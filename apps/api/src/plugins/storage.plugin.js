import fp from 'fastify-plugin';
import { createLocalMockStorageAdapter } from '../common/storage/local-mock.adapter.js';
import { createR2StorageAdapter } from '../common/storage/r2.adapter.js';

export default fp(
  async function storagePlugin(app, opts = {}) {
    const env = opts.env ?? app.env;
    const owned = !opts.storageAdapter;
    const adapter =
      opts.storageAdapter ??
      (env.STORAGE_DRIVER === 'r2'
        ? createR2StorageAdapter(env)
        : createLocalMockStorageAdapter(env));

    app.decorate('storage', adapter);

    if (owned && typeof adapter.close === 'function') {
      app.addHook('onClose', async () => {
        await adapter.close();
      });
    }
  },
  { name: 'storage-plugin' }
);
