'use client';

import { usePathname } from 'next/navigation';
import ColdStartNotice from '@/components/layout/ColdStartNotice';
import SiteFooter from '@/components/layout/SiteFooter';
import SiteHeader from '@/components/layout/SiteHeader';
import SupportChatWidget from '@/components/chat/SupportChatWidget';

/**
 * Conditionally wraps public storefront routes with Header/Footer/ColdStartNotice,
 * keeping `/admin/*` isolated in its own Industrial Technical Dashboard chrome.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @returns {import('react').JSX.Element}
 */
export default function StorefrontShell({ children }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <ColdStartNotice />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <SupportChatWidget />
    </>
  );
}
