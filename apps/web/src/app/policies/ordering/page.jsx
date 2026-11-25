import { POLICY_DOC_SLUGS, getPolicyDocument, listPolicySummaries } from '@dirtfit/knowledge';
import PolicyDocumentView from '@/components/policies/PolicyDocumentView';
import { getServerLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * Generate localized SEO metadata for the Ordering & Deposit Guide page.
 * @returns {Promise<import('next').Metadata>}
 */
export async function generateMetadata() {
  const locale = await getServerLocale();
  const doc = getPolicyDocument(POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT, locale);
  return {
    title: `${doc.title} | DirtFit Commerce`,
    description: doc.summary,
  };
}

/**
 * Ordering, Deposit & Test Ride Guide SSR page.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function OrderingPolicyPage() {
  const locale = await getServerLocale();
  const doc = getPolicyDocument(POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT, locale);
  const allPolicies = listPolicySummaries(locale);

  return <PolicyDocumentView doc={doc} allPolicies={allPolicies} locale={locale} />;
}
