import {
  ALL_POLICY_DOC_SLUGS,
  DEFAULT_KNOWLEDGE_LOCALE,
  FOOTER_POLICY_LINKS,
  KNOWLEDGE_LOCALES,
  KNOWLEDGE_VERSION,
  POLICY_DOC_SLUGS,
  PUBLIC_POLICY_ROUTES,
  ROUTE_TO_POLICY_SLUG,
  normalizeKnowledgeLocale,
} from './constants.js';
import { readRawKnowledgeFile } from './manifest.js';
import { parseKnowledgeDocument } from './parser.js';
import {
  createKnowledgeRetriever,
  foldVietnameseText,
  tokenizeBilingualText,
} from './retriever.js';

const documentCache = new Map();
let cachedRetriever = null;

/**
 * Load and parse a single knowledge policy document (cached in RAM per locale+slug).
 * Server-only (reads Markdown via `node:fs`).
 * @param {string} slug
 * @param {string} [locale]
 * @returns {object}
 */
export function getPolicyDocument(slug, locale = DEFAULT_KNOWLEDGE_LOCALE) {
  const safeLocale = normalizeKnowledgeLocale(locale);
  const cacheKey = `${safeLocale}:${slug}`;
  if (documentCache.has(cacheKey)) {
    return documentCache.get(cacheKey);
  }

  const raw = readRawKnowledgeFile(slug, safeLocale);
  const parsed = parseKnowledgeDocument(raw, slug, safeLocale);
  documentCache.set(cacheKey, parsed);
  return parsed;
}

/**
 * Load a policy document using its URL route segment ('ordering' | 'terms' | 'warranty' | 'rider-fit').
 * @param {string} routeSegment
 * @param {string} [locale]
 * @returns {object|null}
 */
export function getPolicyDocumentByRoute(routeSegment, locale = DEFAULT_KNOWLEDGE_LOCALE) {
  const slug = ROUTE_TO_POLICY_SLUG[routeSegment];
  if (!slug) {
    return null;
  }
  return getPolicyDocument(slug, locale);
}

/**
 * List metadata summaries of all knowledge documents for a given locale.
 * @param {string} [locale]
 * @returns {Array<object>}
 */
export function listPolicySummaries(locale = DEFAULT_KNOWLEDGE_LOCALE) {
  const safeLocale = normalizeKnowledgeLocale(locale);
  return ALL_POLICY_DOC_SLUGS.map((slug) => {
    const doc = getPolicyDocument(slug, safeLocale);
    return {
      id: doc.id,
      slug: doc.slug,
      locale: doc.locale,
      title: doc.title,
      kicker: doc.kicker,
      summary: doc.summary,
      publicPath: doc.publicPath,
      version: doc.version,
      lastUpdated: doc.lastUpdated,
      sectionCount: doc.sections.length,
    };
  });
}

/**
 * Return all flattened knowledge sections (chunks) for a single locale or all locales.
 * @param {string} [locale]
 * @returns {Array<object>}
 */
export function getAllKnowledgeChunks(locale) {
  const localesToLoad = locale ? [normalizeKnowledgeLocale(locale)] : KNOWLEDGE_LOCALES;
  const chunks = [];

  for (const loc of localesToLoad) {
    for (const slug of ALL_POLICY_DOC_SLUGS) {
      const doc = getPolicyDocument(slug, loc);
      for (const section of doc.sections) {
        chunks.push(section);
      }
    }
  }

  return chunks;
}

/**
 * Retrieve the shared singleton BM25 retriever pre-indexed over all EN/VI knowledge chunks.
 * @returns {{ search: (query: string, opts?: { locale?: 'en'|'vi', topK?: number, minScore?: number, preferredDocSlug?: string }) => Array<object>, size: number }}
 */
export function getKnowledgeRetriever() {
  if (!cachedRetriever) {
    cachedRetriever = createKnowledgeRetriever(getAllKnowledgeChunks());
  }
  return cachedRetriever;
}

/**
 * Convenience helper to query DirtFit's local BM25 knowledge base directly.
 * @param {string} query
 * @param {object} [options]
 * @param {'en'|'vi'} [options.locale]
 * @param {number} [options.topK]
 * @param {number} [options.minScore]
 * @param {string} [options.preferredDocSlug]
 * @returns {Array<object>}
 */
export function searchKnowledge(query, options = {}) {
  const retriever = getKnowledgeRetriever();
  const safeLocale = options.locale ? normalizeKnowledgeLocale(options.locale) : undefined;
  return retriever.search(query, {
    ...options,
    locale: safeLocale,
  });
}

export {
  ALL_POLICY_DOC_SLUGS,
  DEFAULT_KNOWLEDGE_LOCALE,
  FOOTER_POLICY_LINKS,
  KNOWLEDGE_LOCALES,
  KNOWLEDGE_VERSION,
  POLICY_DOC_SLUGS,
  PUBLIC_POLICY_ROUTES,
  ROUTE_TO_POLICY_SLUG,
  createKnowledgeRetriever,
  foldVietnameseText,
  normalizeKnowledgeLocale,
  parseKnowledgeDocument,
  tokenizeBilingualText,
};
