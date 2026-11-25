import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_DOC_SLUGS, normalizeKnowledgeLocale } from './constants.js';

/**
 * Static relative path registry for all bilingual knowledge Markdown files.
 * Kept as plain relative string literals (not `new URL(..., import.meta.url)`)
 * so Next.js/Webpack never rewrites them into browser `/_next/static/media` assets.
 */
export const KNOWLEDGE_FILE_PATHS = Object.freeze({
  en: Object.freeze({
    [POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT]: 'en/ordering-and-deposit-guide.md',
    [POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS]: 'en/terms-and-conditions.md',
    [POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS]: 'en/warranty-and-returns.md',
    [POLICY_DOC_SLUGS.RIDER_FIT_FAQ]: 'en/rider-fit-faq.md',
  }),
  vi: Object.freeze({
    [POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT]: 'vi/ordering-and-deposit-guide.md',
    [POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS]: 'vi/terms-and-conditions.md',
    [POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS]: 'vi/warranty-and-returns.md',
    [POLICY_DOC_SLUGS.RIDER_FIT_FAQ]: 'vi/rider-fit-faq.md',
  }),
});

let cachedContentRoot = null;

/**
 * Resolve the physical `packages/knowledge/content` directory across Node ESM,
 * Vitest, Next.js dev/start, Next.js standalone (`turbo prune`), and Vercel NFT.
 * @returns {string}
 */
export function resolveKnowledgeContentRoot() {
  if (cachedContentRoot && fs.existsSync(cachedContentRoot)) {
    return cachedContentRoot;
  }

  const candidates = [];

  try {
    if (typeof import.meta?.url === 'string' && import.meta.url.startsWith('file:')) {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      candidates.push(path.resolve(currentDir, '../content'));
    }
  } catch {
    // Bundled environments may transform import.meta.url; fall through to cwd roots
  }

  const cwd = process.cwd();
  candidates.push(
    path.resolve(cwd, 'packages/knowledge/content'),
    path.resolve(cwd, '../../packages/knowledge/content'),
    path.resolve(cwd, '../packages/knowledge/content'),
    path.resolve(cwd, 'content')
  );

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'en/ordering-and-deposit-guide.md'))) {
      cachedContentRoot = dir;
      return dir;
    }
  }

  throw new Error(
    `[knowledge] Unable to locate knowledge content directory. Checked: ${candidates.join(', ')}`
  );
}

/**
 * Read raw UTF-8 Markdown content for a specific knowledge document and locale.
 * Server-only (uses `node:fs`); never import this module into browser Client Components.
 * @param {string} slug
 * @param {string} [locale]
 * @returns {string}
 */
export function readRawKnowledgeFile(slug, locale = 'en') {
  const safeLocale = normalizeKnowledgeLocale(locale);
  const relFile = KNOWLEDGE_FILE_PATHS[safeLocale]?.[slug];

  if (!relFile) {
    throw new Error(
      `[knowledge] Unknown knowledge document slug "${slug}" for locale "${safeLocale}"`
    );
  }

  const fullPath = path.join(resolveKnowledgeContentRoot(), relFile);
  return fs.readFileSync(fullPath, 'utf8');
}
