import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_DIR = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(API_DIR, 'prisma', 'schema.prisma');
const SEED_PATH = path.join(API_DIR, 'prisma', 'seed.js');

/**
 * Resolve installed Prisma CLI binary without requiring full devDependencies in production.
 * @returns {string}
 */
function resolvePrismaBin() {
  const candidates = [
    '/opt/prisma-cli/node_modules/.bin/prisma',
    path.join(API_DIR, 'node_modules/.bin/prisma'),
    'prisma',
  ];
  for (const candidate of candidates) {
    if (candidate === 'prisma' || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'prisma';
}

if (process.env.RUN_MIGRATIONS === 'true') {
  const prismaBin = resolvePrismaBin();
  console.log('[entrypoint] RUN_MIGRATIONS=true -> applying prisma migrate deploy...');
  execFileSync(prismaBin, ['migrate', 'deploy', `--schema=${SCHEMA_PATH}`], {
    stdio: 'inherit',
  });
}

if (process.env.RUN_SEED === 'true') {
  console.log('[entrypoint] RUN_SEED=true -> running idempotent database seed...');
  execFileSync(process.execPath, [SEED_PATH], {
    stdio: 'inherit',
  });
}

await import('../src/server.js');
