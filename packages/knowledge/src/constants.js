export const KNOWLEDGE_VERSION = '2.0.0';

export const KNOWLEDGE_LOCALES = Object.freeze(['en', 'vi']);

export const DEFAULT_KNOWLEDGE_LOCALE = 'en';

export const POLICY_DOC_SLUGS = Object.freeze({
  ORDERING_AND_DEPOSIT: 'ordering-and-deposit-guide',
  TERMS_AND_CONDITIONS: 'terms-and-conditions',
  WARRANTY_AND_RETURNS: 'warranty-and-returns',
  RIDER_FIT_FAQ: 'rider-fit-faq',
});

export const ALL_POLICY_DOC_SLUGS = Object.freeze([
  POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT,
  POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS,
  POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS,
  POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
]);

export const PUBLIC_POLICY_ROUTES = Object.freeze({
  [POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT]: '/policies/ordering',
  [POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS]: '/policies/terms',
  [POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS]: '/policies/warranty',
  [POLICY_DOC_SLUGS.RIDER_FIT_FAQ]: '/policies/rider-fit',
});

export const ROUTE_TO_POLICY_SLUG = Object.freeze({
  ordering: POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT,
  terms: POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS,
  warranty: POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS,
  'rider-fit': POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
});

export const FOOTER_POLICY_LINKS = Object.freeze([
  Object.freeze({
    slug: POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT,
    href: '/policies/ordering',
    i18nKey: 'footer.policies.ordering',
  }),
  Object.freeze({
    slug: POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS,
    href: '/policies/terms',
    i18nKey: 'footer.policies.terms',
  }),
  Object.freeze({
    slug: POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS,
    href: '/policies/warranty',
    i18nKey: 'footer.policies.warranty',
  }),
  Object.freeze({
    slug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
    href: '/policies/rider-fit',
    i18nKey: 'footer.policies.riderFit',
  }),
]);

/**
 * Normalize an incoming locale value into a supported knowledge locale ('en' | 'vi').
 * @param {string|null|undefined} rawLocale
 * @returns {'en'|'vi'}
 */
export function normalizeKnowledgeLocale(rawLocale) {
  if (typeof rawLocale === 'string' && rawLocale.toLowerCase().startsWith('vi')) {
    return 'vi';
  }
  return DEFAULT_KNOWLEDGE_LOCALE;
}
