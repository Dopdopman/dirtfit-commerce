import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'coverage',
  'out',
  'playwright-report',
  'test-results',
]);

const FORBIDDEN_FILE_PATTERNS = [/\.(ts|tsx|mts|cts)$/i, /^tsconfig(\..+)?\.json$/i];

/**
 * Recursively collect forbidden TypeScript files in the repository.
 * @param {string} dirPath
 * @param {string[]} violations
 */
async function scanDirectory(dirPath, violations) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(fullPath, violations);
      continue;
    }

    if (FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) {
      violations.push(`Forbidden TypeScript file detected: ${path.relative(ROOT_DIR, fullPath)}`);
    }
  }
}

/**
 * Validate package.json enforces ESM and contains no typescript dependency.
 * @param {string} pkgPath
 * @param {string[]} violations
 */
async function checkPackageJson(pkgPath, violations) {
  const raw = await fs.readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const relPath = path.relative(ROOT_DIR, pkgPath);

  if (pkg.type !== 'module') {
    violations.push(`${relPath} must declare "type": "module"`);
  }

  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    if (pkg[field] && Object.prototype.hasOwnProperty.call(pkg[field], 'typescript')) {
      violations.push(`${relPath} contains forbidden "typescript" in ${field}`);
    }
  }
}

/**
 * Discover and validate root + workspace package.json files.
 * @param {string[]} violations
 */
async function checkAllPackages(violations) {
  await checkPackageJson(path.join(ROOT_DIR, 'package.json'), violations);

  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(ROOT_DIR, group);
    try {
      const entries = await fs.readdir(groupDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const pkgPath = path.join(groupDir, entry.name, 'package.json');
        try {
          await fs.access(pkgPath);
          await checkPackageJson(pkgPath, violations);
        } catch {
          violations.push(`Missing package.json in ${group}/${entry.name}`);
        }
      }
    } catch {
      // Directory not created yet
    }
  }
}

async function main() {
  const violations = [];
  await scanDirectory(ROOT_DIR, violations);
  await checkAllPackages(violations);

  if (violations.length > 0) {
    console.error('[check:pure-js] FAILED with violations:');
    for (const item of violations) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }

  console.log('[check:pure-js] PASSED: 100% Pure JavaScript ESM verified across workspace.');
}

await main();
