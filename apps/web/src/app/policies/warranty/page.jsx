import { POLICY_DOC_SLUGS, getPolicyDocument, listPolicySummaries } from '@dirtfit/knowledge';
import PolicyDocumentView from '@/components/policies/PolicyDocumentView';
import { getServerLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * Generate localized SEO metadata for the Warranty & Returns Policy page.
 * @returns {Promise<import('next').Metadata>}
 */
export async function generateMetadata() {
  const locale = await getServerLocale();
  const doc = getPolicyDocument(POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS, locale);
  return {
    title: `${doc.title} | DirtFit Commerce`,
    description: doc.summary,
  };
}

/**
 * Warranty, Handover PDI & Returns Policy SSR page.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function WarrantyPolicyPage() {
  const locale = await getServerLocale();
  const doc = getPolicyDocument(POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS, locale);
  const allPolicies = listPolicySummaries(locale);

  return <PolicyDocumentView doc={doc} allPolicies={allPolicies} locale={locale} />;
}
