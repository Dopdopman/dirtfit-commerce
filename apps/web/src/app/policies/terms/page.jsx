import { POLICY_DOC_SLUGS, getPolicyDocument, listPolicySummaries } from '@dirtfit/knowledge';
import PolicyDocumentView from '@/components/policies/PolicyDocumentView';
import { getServerLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * Generate localized SEO metadata for the Terms & Conditions page.
 * @returns {Promise<import('next').Metadata>}
 */
export async function generateMetadata() {
  const locale = await getServerLocale();
  const doc = getPolicyDocument(POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS, locale);
  return {
    title: `${doc.title} | DirtFit Commerce`,
    description: doc.summary,
  };
}

/**
 * Terms & Conditions SSR page.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function TermsPolicyPage() {
  const locale = await getServerLocale();
  const doc = getPolicyDocument(POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS, locale);
  const allPolicies = listPolicySummaries(locale);

  return <PolicyDocumentView doc={doc} allPolicies={allPolicies} locale={locale} />;
}
