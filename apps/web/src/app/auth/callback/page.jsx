'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BrandLogo from '@/components/ui/BrandLogo';
import { localizeApiError } from '@/lib/i18n/translate';
import { useAuth } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Exchange One-Time OAuth ticket cleanly without React 19 StrictMode double execution.
 * @returns {import('react').JSX.Element}
 */
function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeOAuthLogin } = useAuth();
  const { locale, t } = useI18n();
  const exchangedRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (exchangedRef.current) {
      return;
    }
    exchangedRef.current = true;

    const ticket = searchParams.get('ticket');
    const nextParam = searchParams.get('next');
    const safeFallbackNext =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : '/account';

    if (!ticket) {
      router.replace('/login?oauthError=OAUTH_TICKET_INVALID');
      return;
    }

    (async () => {
      try {
        const result = await completeOAuthLogin(ticket);
        const dest = result?.returnTo || safeFallbackNext;
        router.replace(dest);
      } catch (err) {
        setErrorMsg(localizeApiError(err, locale));
        const code = err?.code || 'OAUTH_TICKET_INVALID';
        setTimeout(() => {
          router.replace(`/login?oauthError=${encodeURIComponent(code)}`);
        }, 900);
      }
    })();
  }, [completeOAuthLogin, locale, router, searchParams]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="border border-line-strong bg-surface p-8">
        <div className="mb-4">
          <BrandLogo variant="full" size="sm" />
        </div>
        <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink-muted">
          GOOGLE OAUTH 2.0
        </div>
        <h1 className="mt-1 font-display text-xl font-bold text-ink">
          {errorMsg ? t('auth.oauthFailedTitle') : t('auth.completingOAuth')}
        </h1>
        <p className="mt-2 text-xs text-ink-secondary">
          {errorMsg || t('auth.completingOAuthHint')}
        </p>
      </div>
    </div>
  );
}

/**
 * Handoff page exchanging One-Time OAuth Ticket for authenticated session cookies & JWT.
 * @returns {import('react').JSX.Element}
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-sm text-ink-secondary sm:px-6">
          Completing sign-in...
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  );
}
